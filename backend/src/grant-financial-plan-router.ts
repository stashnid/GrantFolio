import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { grantApplicationVersions } from "./grant-application.js";
import type { GrantApplicationAnswers } from "./grant-application.js";
import { financialPlanSchema, calculateFinancialPlan, financialBusinessPlanRowsMatch } from "./grant-financial-plan.js";
import type { FinancialPlan } from "./grant-financial-plan.js";
import { createFinancialExport } from "./grant-financial-export.js";

const revision = z.number().int().min(0).max(2147483646);
const revisions = z.object({
  expectedCaseRevision: revision,
  expectedApplicationRevision: revision,
  expectedPlanRevision: revision,
}).strict();
const saveCommand = revisions.extend({ plan: financialPlanSchema });

type Row = {
  title: string;
  program_id: string | null;
  case_revision: number;
  application_revision: number | null;
  answers: GrantApplicationAnswers | null;
  plan_revision: number | null;
  saved_case_revision: number | null;
  saved_application_revision: number | null;
  plan: FinancialPlan | null;
  payment_confirmed: boolean;
};

const queryProject = `SELECT c.title, c.program_id, c.revision AS case_revision,
    a.revision AS application_revision, a.answers, f.revision AS plan_revision,
    f.case_revision AS saved_case_revision, f.application_revision AS saved_application_revision, f.plan,
    EXISTS (SELECT 1 FROM grant_preparation_pilot gp WHERE gp.case_id=c.id
      AND gp.confirmed_at IS NOT NULL) OR EXISTS (SELECT 1 FROM jar_orders jo WHERE jo.case_id=c.id AND (jo.confirmed_at IS NOT NULL OR jo.manual_unlocked_at IS NOT NULL)) AS payment_confirmed
  FROM cases c
  LEFT JOIN grant_applications a ON a.case_id=c.id AND a.program_id=c.program_id AND a.rules_version=$3
  LEFT JOIN grant_financial_plans f ON f.case_id=a.case_id AND f.program_id=a.program_id AND f.rules_version=a.rules_version
  WHERE c.id=$1 AND c.owner_id=$2`;

function view(row: Row) {
  const forecast = row.plan ? calculateFinancialPlan(row.plan) : null;
  const grant = row.answers?.requestedGrantKopecks ?? null;
  const own = row.answers?.ownContributionKopecks ?? null;
  const reconciled = forecast !== null && grant !== null && own !== null &&
    forecast.totals.grantKopecks === grant && forecast.totals.ownKopecks === own;
  const officialRowsReady = row.plan !== null && financialBusinessPlanRowsMatch(row.plan, row.answers?.taxProfile);
  const stale = row.plan !== null && (row.saved_case_revision !== row.case_revision || row.saved_application_revision !== row.application_revision);
  return {
    plan: row.plan, forecast, grant, own, reconciled, officialRowsReady, stale,
    caseRevision: row.case_revision,
    applicationRevision: row.application_revision ?? 0,
    planRevision: row.plan_revision ?? 0,
  };
}

function matches(row: Row, expected: z.infer<typeof revisions>) {
  return row.case_revision === expected.expectedCaseRevision &&
    (row.application_revision ?? 0) === expected.expectedApplicationRevision &&
    (row.plan_revision ?? 0) === expected.expectedPlanRevision;
}

export function grantFinancialPlanRouter(db: Pool) {
  const router = Router();
  const path = "/:id/grant-financial-plan";
  const rulesVersion = grantApplicationVersions["vlasna-sprava"];
  let exporting = false;
  router.param("id", (_req, res, next, value) => {
    if (!z.string().uuid().safeParse(value).success) { res.status(404).json({ error: "not_found" }); return; }
    next();
  });

  router.get(path, async (req, res, next) => {
    try {
      const row = (await db.query<Row>(queryProject, [req.params.id, res.locals.uid, rulesVersion])).rows[0];
      if (!row) { res.status(404).json({ error: "not_found" }); return; }
      if (row.program_id !== "vlasna-sprava") { res.status(422).json({ error: "financial_plan_unavailable" }); return; }
      res.json(view(row));
    } catch (error) { next(error); }
  });

  router.put(path, async (req, res, next) => {
    const command = saveCommand.safeParse(req.body);
    if (!command.success) { res.status(400).json({ error: "invalid_financial_plan" }); return; }
    const client = await db.connect().catch(next);
    if (!client) return;
    try {
      await client.query("BEGIN");
      const key = [req.params.id, res.locals.uid, rulesVersion];
      // Read the plan after acquiring the same case lock used by case and application updates.
      await client.query("SELECT id FROM cases WHERE id=$1 AND owner_id=$2 FOR UPDATE", key.slice(0, 2));
      const row = (await client.query<Row>(queryProject, key)).rows[0];
      if (!row || row.program_id !== "vlasna-sprava" || !row.application_revision || !matches(row, command.data)) {
        await client.query("ROLLBACK");
        if (!row) { res.status(404).json({ error: "not_found" }); return; }
        if (row.program_id !== "vlasna-sprava" || !row.application_revision) {
          res.status(422).json({ error: "financial_plan_unavailable" }); return;
        }
        res.status(409).json({ error: "revision_conflict" }); return;
      }
      const nextRevision = command.data.expectedPlanRevision + 1;
      await client.query(`INSERT INTO grant_financial_plans
        (case_id, program_id, rules_version, case_revision, application_revision, revision, plan)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
        ON CONFLICT (case_id, program_id, rules_version) DO UPDATE SET
        case_revision=excluded.case_revision, application_revision=excluded.application_revision,
        revision=excluded.revision, plan=excluded.plan`,
      [req.params.id, row.program_id, rulesVersion, row.case_revision, row.application_revision, nextRevision, JSON.stringify(command.data.plan)]);
      await client.query("COMMIT");
      res.json(view({ ...row, plan: command.data.plan, plan_revision: nextRevision,
        saved_case_revision: row.case_revision, saved_application_revision: row.application_revision }));
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally { client.release(); }
  });

  router.post(`${path}/export`, async (req, res, next) => {
    const command = revisions.safeParse(req.body);
    if (!command.success) { res.status(400).json({ error: "invalid_financial_plan" }); return; }
    try {
      const row = (await db.query<Row>(queryProject, [req.params.id, res.locals.uid, rulesVersion])).rows[0];
      if (!row) { res.status(404).json({ error: "not_found" }); return; }
      if (row.program_id !== "vlasna-sprava") { res.status(422).json({ error: "financial_plan_unavailable" }); return; }
      if (!row.payment_confirmed) { res.status(402).json({ error: "preparation_payment_pending" }); return; }
      const state = view(row);
      if (!matches(row, command.data) || state.stale) { res.status(409).json({ error: "revision_conflict" }); return; }
      if (!state.forecast || !state.reconciled || !state.officialRowsReady) { res.status(422).json({ error: "financial_plan_not_reconciled" }); return; }
      if (exporting) { res.status(429).json({ error: "financial_export_busy" }); return; }
      exporting = true;
      const abort = new AbortController();
      const cancel = () => { if (!res.writableEnded) abort.abort(); };
      res.once("close", cancel);
      try {
        const bundle = await createFinancialExport({ title: row.title, caseRevision: state.caseRevision,
          applicationRevision: state.applicationRevision, planRevision: state.planRevision, forecast: state.forecast }, abort.signal);
        if (!abort.signal.aborted) res.attachment("grantfolio-financial-draft.zip").send(bundle);
      } catch (error) {
        if (!abort.signal.aborted) {
          console.warn("Financial export failed", error instanceof Error ? error.name : "UnknownError");
          res.status(503).json({ error: "financial_export_unavailable" });
        }
      } finally {
        res.off("close", cancel);
        exporting = false;
      }
    } catch (error) { next(error); }
  });
  return router;
}
