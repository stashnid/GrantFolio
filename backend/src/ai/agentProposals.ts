import { Router } from "express";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { FinancialAssumptionsSchema } from "../finance/assumptions.js";
import { profileDetails } from "../profile-details.js";
import type { AgentScope } from "./agentOrchestrator.js";

const text = z.string().trim().min(1).max(3000);
const textFields = z.object({projectDescription:text.optional(),customers:text.optional(),salesChannels:text.optional(),implementationPlan:text.optional(),expectedResults:text.optional()}).strict().refine(v=>Object.keys(v).length>0);
const profileFields = profileDetails.pick({legalForm:true,industry:true,kved:true,city:true,teamSize:true,teamExperience:true,grantExperience:true,fundingPurpose:true,requestedAmount:true,ownContribution:true}).refine(v=>Object.keys(v).length>0);
export const AgentProposalSchema = z.discriminatedUnion("kind", [
  z.object({kind:z.literal("text_application_fields"),changes:textFields}).strict(),
  z.object({kind:z.literal("profile_fields"),changes:profileFields}).strict(),
  z.object({kind:z.literal("financial_assumptions"),changes:FinancialAssumptionsSchema}).strict(),
]);
export async function createAgentProposal(db: Pool, raw: unknown, scope: AgentScope) {
  const proposal = AgentProposalSchema.parse(raw);
  if (!scope.caseId || scope.expectedRevision === undefined || scope.expectedProfileRevision === undefined) throw Error("project_required");
  const id = randomUUID();
  const r = await db.query(`INSERT INTO agent_proposals(id,owner_id,case_id,kind,changes,case_revision,profile_revision)
    SELECT $1,c.owner_id,c.id,$4,$5::jsonb,c.revision,COALESCE(p.revision,0) FROM cases c LEFT JOIN profiles p ON p.owner_id=c.owner_id
    WHERE c.id=$2 AND c.owner_id=$3 AND c.revision=$6 AND COALESCE(p.revision,0)=$7 AND (EXISTS (SELECT 1 FROM jar_orders j WHERE j.case_id=c.id AND (j.confirmed_at IS NOT NULL OR j.manual_unlocked_at IS NOT NULL)) OR EXISTS (SELECT 1 FROM grant_preparation_pilot g WHERE g.case_id=c.id AND g.confirmed_at IS NOT NULL)) RETURNING id`, [id,scope.caseId,scope.ownerId,proposal.kind,JSON.stringify(proposal.changes),scope.expectedRevision,scope.expectedProfileRevision]);
  if (!r.rowCount) throw Error("proposal_stale_or_unavailable");
  return {id,caseId:scope.caseId,...proposal,status:"pending",caseRevision:scope.expectedRevision,profileRevision:scope.expectedProfileRevision,unverified:true};
}
const applyInput = z.object({expectedRevision:z.number().int().nonnegative(),expectedProfileRevision:z.number().int().nonnegative().optional(),idempotencyKey:z.string().uuid()}).strict();
export function agentProposalsRouter(db: Pool) {
  const router = Router();
  router.post("/:id/apply", async (req,res,next) => {
    const id=z.string().uuid().safeParse(req.params.id), body=applyInput.safeParse(req.body);
    if (!id.success || !body.success) { res.status(400).json({error:"invalid_proposal_request"}); return; }
    const uid:string=res.locals.uid; const client=await db.connect().catch(next); if (!client) return;
    try {
      await client.query("BEGIN");
      const r=await client.query(`SELECT * FROM agent_proposals WHERE id=$1 AND owner_id=$2 FOR UPDATE`,[id.data,uid]);
      if (!r.rowCount) { await client.query("ROLLBACK"); res.sendStatus(404); return; }
      const p=r.rows[0];
      if (p.status === "applied") { await client.query("ROLLBACK"); if (p.applied_key===body.data.idempotencyKey && p.applied_request?.expectedRevision===body.data.expectedRevision && p.applied_request?.expectedProfileRevision===body.data.expectedProfileRevision && p.applied_request?.idempotencyKey===body.data.idempotencyKey) res.json(p.applied_result); else res.status(409).json({error:"proposal_conflict"}); return; }
      const project=await client.query(`SELECT c.*, (EXISTS(SELECT 1 FROM jar_orders j WHERE j.case_id=c.id AND (j.confirmed_at IS NOT NULL OR j.manual_unlocked_at IS NOT NULL)) OR EXISTS(SELECT 1 FROM grant_preparation_pilot g WHERE g.case_id=c.id AND g.confirmed_at IS NOT NULL)) AS paid FROM cases c WHERE c.id=$1 AND c.owner_id=$2 FOR UPDATE`,[p.case_id,uid]);
      if (!project.rowCount) { await client.query("ROLLBACK"); res.sendStatus(404); return; }
      const c=project.rows[0];
      if (!c.paid) { await client.query("ROLLBACK"); res.status(402).json({error:"project_payment_required"}); return; }
      if (c.revision!==body.data.expectedRevision || c.revision!==p.case_revision) { await client.query("ROLLBACK"); res.status(409).json({error:"revision_conflict"}); return; }
      const existingProfile=await client.query("SELECT details,revision FROM profiles WHERE owner_id=$1 FOR UPDATE",[uid]);
      if ((existingProfile.rows[0]?.revision ?? 0)!==p.profile_revision) { await client.query("ROLLBACK"); res.status(409).json({error:"profile_revision_conflict"}); return; }
      const parsed=AgentProposalSchema.safeParse({kind:p.kind,changes:p.changes}); if (!parsed.success) throw Error("invalid_saved_proposal");
      let revision=c.revision, profileRevision:number|undefined;
      if (parsed.data.kind === "profile_fields") {
        const pr=existingProfile;
        if (!pr.rowCount || body.data.expectedProfileRevision===undefined || pr.rows[0].revision!==body.data.expectedProfileRevision || pr.rows[0].revision!==p.profile_revision) { await client.query("ROLLBACK"); res.status(409).json({error:"profile_revision_conflict"}); return; }
        const details=profileDetails.parse({...pr.rows[0].details,...parsed.data.changes});
        const updated=await client.query("UPDATE profiles SET details=$2::jsonb,revision=revision+1,updated_at=now() WHERE owner_id=$1 RETURNING revision",[uid,JSON.stringify(details)]); profileRevision=updated.rows[0].revision;
      } else {
        const details={...c.details,...(parsed.data.kind==="financial_assumptions" ? {financialAssumptions:parsed.data.changes} : parsed.data.changes)};
        const updated=await client.query("UPDATE cases SET details=$3::jsonb,revision=revision+1 WHERE id=$1 AND owner_id=$2 RETURNING revision",[p.case_id,uid,JSON.stringify(details)]); revision=updated.rows[0].revision;
      }
      const result={proposal:{id:id.data,status:"applied",kind:p.kind,unverified:p.kind==="financial_assumptions"},caseRevision:revision,...(profileRevision===undefined?{}:{profileRevision})};
      await client.query("UPDATE agent_proposals SET status='applied',applied_key=$2,applied_request=$3::jsonb,applied_result=$4::jsonb,applied_at=now() WHERE id=$1",[id.data,body.data.idempotencyKey,JSON.stringify(body.data),JSON.stringify(result)]);
      await client.query("COMMIT"); res.json(result);
    } catch(e) { await client.query("ROLLBACK").catch(()=>{}); if ((e as {code?:string}).code==="23505") res.status(409).json({error:"idempotency_conflict"}); else next(e); } finally {client.release();}
  }); return router;
}
