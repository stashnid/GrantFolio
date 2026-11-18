import { Router } from "express";
import type { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { getGrantApplication, grantApplicationAnswersSchema, grantApplicationVersions } from "./grant-application.js";
import type { GrantApplicationAnswers, GrantApplicationContext } from "./grant-application.js";
import { createDiiaBusinessPlanExport, mapGrantApplicationAnswersToDiiaCells } from "./diia-business-plan-export.js";
import { financialBusinessPlanRowsMatch, financialPlanSchema } from "./grant-financial-plan.js";
import { itemSchema } from "./budget.js";

const revision = z.number().int().min(0).max(2147483646);
const command = z.object({
  expectedRevision: revision,
  expectedCaseRevision: revision,
  answers: grantApplicationAnswersSchema,
}).strict();

type Project = {
  program_id: string | null;
  revision: number;
  details: GrantApplicationContext["details"];
  total_kopecks: string;
  items?: unknown;
  region?: string;
  city?: string;
  legal_form?: string;
  kved?: string;
};
type Entry = { answers: GrantApplicationAnswers; revision: number; case_revision: number };

function currentAnswers(project: Project, entry?: Entry): GrantApplicationAnswers {
  const answers = grantApplicationAnswersSchema.parse(entry?.answers ?? {});
  if (entry?.case_revision !== project.revision) delete answers.confirmAccuracy;
  return answers;
}

function response(project: Project, answers: GrantApplicationAnswers, applicationRevision: number) {
  const application = getGrantApplication(project.program_id, answers, {
    details: project.details,
    budgetTotalKopecks: project.total_kopecks,
    region: project.region,
    city: project.city,
    legalForm: project.legal_form,
    kved: project.kved,
  });
  return {
    application,
    documentCoverage: application?.programId === "vlasna-sprava"
      ? mapGrantApplicationAnswersToDiiaCells(answers)
      : null,
    answers,
    revision: applicationRevision,
    caseRevision: project.revision,
  };
}

const selectedProject = `SELECT c.program_id, c.revision, c.details, c.total_kopecks, c.items, p.region,
    p.details->>'city' AS city, p.details->>'legalForm' AS legal_form, p.details->>'kved' AS kved
  FROM cases c LEFT JOIN profiles p ON p.owner_id=c.owner_id WHERE c.id=$1 AND c.owner_id=$2`;
const vlasnaSpravaWorkingWorkbook = readFile(fileURLToPath(new URL("../assets/vlasna-sprava-2026-diia-example-sanitized.xlsx", import.meta.url)));

export function grantApplicationRouter(db: Pool) {
  const router = Router();
  let exportingDiiaDraft = false;
  router.param("id", (_req, res, next, value) => {
    if (!z.string().uuid().safeParse(value).success) { res.status(404).json({ error: "not_found" }); return; }
    next();
  });
  router.get("/:id/grant-application/working-example", async (req, res, next) => {
    try {
      const result = await db.query(
        "SELECT 1 FROM cases WHERE id=$1 AND owner_id=$2 AND program_id='vlasna-sprava'",
        [req.params.id, res.locals.uid],
      );
      if (!result.rowCount) { res.status(404).json({ error: "not_found" }); return; }
      res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .attachment("biznes-plan-vlasna-sprava-2026-ochyshchenyi-zrazok.xlsx")
        .send(await vlasnaSpravaWorkingWorkbook);
    } catch (error) { next(error); }
  });
  router.post("/:id/grant-application/diia-draft/export", async (req, res, next) => {
    const parsed = z.object({ expectedRevision: revision, expectedCaseRevision: revision }).strict().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "invalid_application_export" }); return; }
    try {
      const result = await db.query<Project & { answers: GrantApplicationAnswers | null; application_revision: number | null; case_revision: number | null; financial_plan: unknown }>(
        `SELECT c.program_id, c.revision, c.details, c.total_kopecks, c.items, p.region,
           p.details->>'city' AS city, p.details->>'legalForm' AS legal_form, p.details->>'kved' AS kved,
           a.answers, a.revision AS application_revision, a.case_revision, f.plan AS financial_plan
         FROM cases c LEFT JOIN profiles p ON p.owner_id=c.owner_id
         LEFT JOIN grant_applications a ON a.case_id=c.id AND a.program_id=c.program_id
           AND a.rules_version=($3::jsonb->>c.program_id)
         LEFT JOIN grant_financial_plans f ON f.case_id=c.id AND f.program_id=c.program_id AND f.rules_version=a.rules_version
         WHERE c.id=$1 AND c.owner_id=$2`,
        [req.params.id, res.locals.uid, JSON.stringify(grantApplicationVersions)],
      );
      const project = result.rows[0];
      if (!project || project.program_id !== "vlasna-sprava") { res.status(404).json({ error: "not_found" }); return; }
      if (project.revision !== parsed.data.expectedCaseRevision || project.application_revision !== parsed.data.expectedRevision || project.case_revision !== project.revision) {
        res.status(409).json({ error: "revision_conflict" }); return;
      }
      const answers = grantApplicationAnswersSchema.parse(project.answers ?? {});
      const application = getGrantApplication(project.program_id, answers, {
        details: project.details, budgetTotalKopecks: project.total_kopecks, region: project.region,
        city: project.city, legalForm: project.legal_form, kved: project.kved,
      });
      if (!answers.confirmAccuracy || !application?.readyForReview) {
        res.status(422).json({ error: "application_not_ready_for_draft" }); return;
      }
      const financialPlan = financialPlanSchema.safeParse(project.financial_plan);
      if (!financialPlan.success || !financialBusinessPlanRowsMatch(financialPlan.data, answers.taxProfile) ||
          financialPlan.data.months[0].grantKopecks !== answers.requestedGrantKopecks ||
          financialPlan.data.months.slice(1).some(month => month.grantKopecks !== 0) ||
          financialPlan.data.months.reduce((total, month) => total + month.ownKopecks, 0) !== answers.ownContributionKopecks) {
        res.status(422).json({ error: "business_plan_financial_rows_incomplete" }); return;
      }
      const budgetItems = z.array(itemSchema).max(100).safeParse(project.items);
      if (!budgetItems.success) { res.status(422).json({ error: "business_plan_budget_invalid" }); return; }
      if (exportingDiiaDraft) { res.status(429).json({ error: "business_plan_export_busy" }); return; }
      const mapping = mapGrantApplicationAnswersToDiiaCells(answers, {
        budgetTotalKopecks: Number(project.total_kopecks), items: budgetItems.data, financialPlan: financialPlan.data,
      });
      exportingDiiaDraft = true;
      try {
        const archive = await createDiiaBusinessPlanExport(await vlasnaSpravaWorkingWorkbook, mapping.cells, []);
        res.attachment("grantfolio-vlasna-sprava-draft.zip").send(archive);
      } catch (error) {
        console.warn("Diia business plan export failed", error instanceof Error ? error.name : "UnknownError");
        if (!res.headersSent) res.status(503).json({ error: "business_plan_export_unavailable" });
      } finally {
        exportingDiiaDraft = false;
      }
    } catch (error) { next(error); }
  });
  router.get("/:id/grant-application", async (req, res, next) => {
    try {
      const result = await db.query<Project & { answers: GrantApplicationAnswers | null; application_revision: number | null; case_revision: number | null }>(
        `SELECT c.program_id, c.revision, c.details, c.total_kopecks, p.region,
           p.details->>'city' AS city, p.details->>'legalForm' AS legal_form, p.details->>'kved' AS kved,
           a.answers, a.revision AS application_revision, a.case_revision
         FROM cases c LEFT JOIN profiles p ON p.owner_id=c.owner_id
         LEFT JOIN grant_applications a ON a.case_id=c.id AND a.program_id=c.program_id
           AND a.rules_version=($3::jsonb->>c.program_id)
         WHERE c.id=$1 AND c.owner_id=$2`,
        [req.params.id, res.locals.uid, JSON.stringify(grantApplicationVersions)],
      );
      const project = result.rows[0];
      if (!project) { res.status(404).json({ error: "not_found" }); return; }
      const entry = project.answers && project.application_revision !== null && project.case_revision !== null
        ? { answers: project.answers, revision: project.application_revision, case_revision: project.case_revision }
        : undefined;
      res.json(response(project, currentAnswers(project, entry), entry?.revision ?? 0));
    } catch (error) { next(error); }
  });
  router.put("/:id/grant-application", async (req, res, next) => {
    const parsed = command.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "invalid_application_answers" }); return; }
    const client = await db.connect().catch(next);
    if (!client) return;
    try {
      await client.query("BEGIN");
      const project = (await client.query<Project>(`${selectedProject} FOR UPDATE OF c`, [req.params.id, res.locals.uid])).rows[0];
      if (!project) { await client.query("ROLLBACK"); res.status(404).json({ error: "not_found" }); return; }
      const rules = getGrantApplication(project.program_id, {});
      if (project.revision !== parsed.data.expectedCaseRevision) {
        await client.query("ROLLBACK"); res.status(409).json({ error: "revision_conflict" }); return;
      }
      if (!rules) { await client.query("ROLLBACK"); res.status(422).json({ error: "application_unavailable" }); return; }
      const key = [req.params.id, rules.programId, rules.version];
      const entry = (await client.query<Entry>(
        "SELECT answers, revision, case_revision FROM grant_applications WHERE case_id=$1 AND program_id=$2 AND rules_version=$3", key,
      )).rows[0];
      if ((entry?.revision ?? 0) !== parsed.data.expectedRevision) {
        await client.query("ROLLBACK"); res.status(409).json({ error: "revision_conflict" }); return;
      }
      const answers = parsed.data.answers;
      const applicable = new Set(getGrantApplication(project.program_id, answers)?.questions.map(question => question.id));
      for (const field of Object.keys(answers) as (keyof GrantApplicationAnswers)[]) {
        if (!applicable.has(field)) delete answers[field];
      }
      if (answers.confirmAccuracy) {
        const before = currentAnswers(project, entry);
        const changed = Object.keys({ ...before, ...answers }).some(key => {
          const field = key as keyof GrantApplicationAnswers;
          return field !== "confirmAccuracy" && before[field] !== answers[field];
        });
        if (changed) delete answers.confirmAccuracy;
      }
      const nextRevision = parsed.data.expectedRevision + 1;
      await client.query(`INSERT INTO grant_applications (case_id, program_id, rules_version, case_revision, revision, answers)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)
         ON CONFLICT (case_id, program_id, rules_version) DO UPDATE
         SET case_revision=excluded.case_revision, revision=excluded.revision, answers=excluded.answers`,
        [...key, project.revision, nextRevision, JSON.stringify(answers)]);
      await client.query("COMMIT");
      res.json(response(project, answers, nextRevision));
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally { client.release(); }
  });
  return router;
}
