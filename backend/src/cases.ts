import { grantPreparationPilotRouter, type PaymentConfig } from "./grant-preparation-pilot.js";
import {GRANT_CATALOG} from "./grant-catalog-data.js";
import { Router } from "express";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { commandSchema, totalKopecks } from "./budget.js";
import { detailsCommandSchema, readiness } from "./project-details.js";
import { grantApplicationVersions } from "./grant-application.js";
import { draftExport } from "./draft-export.js";
import { assistantRouter } from "./assistant.js";
import { configuredGeminiResponder } from "./gemini.js";
import { grantApplicationRouter } from "./grant-application-router.js";
import { grantFinancialPlanRouter } from "./grant-financial-plan-router.js";
const idSchema = z.string().uuid();
const ALLOWED_PROGRAMS = GRANT_CATALOG.map(p=>p.id) as [string,...string[]];

const createCaseSchema = z
  .object({
    id: idSchema.optional(),
    title: z.string().trim().min(1).max(160),
    initialDescription: z.string().trim().max(2000).optional(),
    programId: z.enum(ALLOWED_PROGRAMS).nullable().optional().default(null),
  })
  .strict();

const updateProgramSchema = z
  .object({
    programId: z.enum(ALLOWED_PROGRAMS).nullable(),
    expectedRevision: z.number().int().min(0).max(2147483646),
  })
  .strict();

type CaseRow = {
  id: string;
  title: string;
  program_id: string | null;
  revision: number;
  items: unknown;
  total_kopecks: string;
  details: unknown;
};
function view(row: CaseRow) {
  return {
    id: row.id,
    title: row.title,
    programId: row.program_id ?? null,
    revision: row.revision,
    items: row.items,
    details: row.details,
    totalKopecks: Number(row.total_kopecks),
  };
}
export function casesRouter(db: Pool, payment?: PaymentConfig) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use(grantPreparationPilotRouter(db, payment));
  router.use(assistantRouter(db, configuredGeminiResponder()));
  router.use(grantApplicationRouter(db));
  router.use(grantFinancialPlanRouter(db));
  router.get("/", async (_req, res, next) => {
    try {
      const result = await db.query(
        "SELECT * FROM cases WHERE owner_id=$1 ORDER BY created_at DESC, id",
        [res.locals.uid],
      );
      res.json({ cases: result.rows.map(view) });
    } catch (e) {
      next(e);
    }
  });
  router.post("/", async (req, res, next) => {
    const parsed = createCaseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_case" });
      return;
    }
    try {
      const id = parsed.data.id ?? randomUUID();
      const result = await db.query(
        "INSERT INTO cases(id,owner_id,title,program_id,details) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT (id) DO NOTHING RETURNING *",
        [id, res.locals.uid, parsed.data.title, parsed.data.programId, JSON.stringify({projectDescription:parsed.data.initialDescription ?? "",customers:"",salesChannels:"",implementationPlan:"",expectedResults:""})],
      );
      let row = result.rows[0];
      if (!row) {
        const previous = await db.query("SELECT * FROM cases WHERE id=$1 AND owner_id=$2", [id, res.locals.uid]);
        row = previous.rows[0];
        if (!row || row.title !== parsed.data.title || row.program_id !== parsed.data.programId) {
          res.status(409).json({ error: "creation_conflict" }); return;
        }
      }
      res.status(result.rowCount ? 201 : 200).json({ case: view(row) });
    } catch (e) {
      next(e);
    }
  });
  router.put("/:id/program", async (req, res, next) => {
    if (!idSchema.safeParse(req.params.id).success) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const parsed = updateProgramSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_program" });
      return;
    }
    const client = await db.connect().catch(next);
    if (!client) return;
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "SELECT * FROM cases WHERE id=$1 AND owner_id=$2 FOR UPDATE",
        [req.params.id, res.locals.uid],
      );
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "not_found" });
        return;
      }
      const current = result.rows[0];
      if (current.revision !== parsed.data.expectedRevision) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "revision_conflict" });
        return;
      }
      const updated = current.program_id === parsed.data.programId ? result : await client.query(
        "UPDATE cases SET program_id=$1, revision=revision+1 WHERE id=$2 AND owner_id=$3 RETURNING *",
        [parsed.data.programId, req.params.id, res.locals.uid],
      );
      await client.query("COMMIT");
      res.json({ case: view(updated.rows[0]) });
    } catch (e) {
      await client.query("ROLLBACK");
      next(e);
    } finally {
      client.release();
    }
  });
  router.get("/:id", async (req, res, next) => {
    if (!idSchema.safeParse(req.params.id).success) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    try {
      const result = await db.query(
        "SELECT * FROM cases WHERE id=$1 AND owner_id=$2",
        [req.params.id, res.locals.uid],
      );
      if (!result.rowCount) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ case: view(result.rows[0]) });
    } catch (e) {
      next(e);
    }
  });
  router.delete("/:id", async (req, res, next) => {
    if (!idSchema.safeParse(req.params.id).success) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    try {
      const result = await db.query(
        "DELETE FROM cases WHERE id=$1 AND owner_id=$2 RETURNING id",
        [req.params.id, res.locals.uid],
      );
      if (!result.rowCount) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json({ deleted: true });
    } catch (e) {
      if ((e as { code?: string }).code === "P0001") {
        res.status(409).json({ error: "payment_pending" });
        return;
      }
      next(e);
    }
  });
  router.get("/:id/draft-export", async (req, res, next) => {
    if (!idSchema.safeParse(req.params.id).success) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    try {
      const result = await db.query(
        `SELECT c.title, c.program_id, c.revision, c.details, c.items, c.total_kopecks,
           a.answers AS application_answers, a.revision AS application_revision
         FROM cases c LEFT JOIN grant_applications a ON a.case_id=c.id AND a.program_id=c.program_id
           AND a.rules_version=($3::jsonb->>c.program_id)
         WHERE c.id=$1 AND c.owner_id=$2`,
        [req.params.id, res.locals.uid, JSON.stringify(grantApplicationVersions)],
      );
      if (!result.rowCount) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.set("Content-Disposition", 'attachment; filename="grantfolio-project.txt"');
      res.type("text/plain; charset=utf-8").send(draftExport(result.rows[0]));
    } catch (e) {
      next(e);
    }
  });
  router.get("/:id/readiness", async (req, res, next) => {
    if (!idSchema.safeParse(req.params.id).success) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    try {
      const result = await db.query(
        "SELECT * FROM cases WHERE id=$1 AND owner_id=$2",
        [req.params.id, res.locals.uid],
      );
      if (!result.rowCount) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(readiness(result.rows[0]));
    } catch (e) {
      next(e);
    }
  });
  router.put("/:id/details", async (req, res, next) => {
    if (!idSchema.safeParse(req.params.id).success) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const parsed = detailsCommandSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_details" });
      return;
    }
    const command = parsed.data;
    const client = await db.connect().catch(next);
    if (!client) return;
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "SELECT * FROM cases WHERE id=$1 AND owner_id=$2 FOR UPDATE",
        [req.params.id, res.locals.uid],
      );
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "not_found" });
        return;
      }
      const request = {
        expectedRevision: command.expectedRevision,
        details: command.details,
      };
      const previous = await client.query(
        "SELECT request, response FROM details_commands WHERE case_id=$1 AND idempotency_key=$2",
        [req.params.id, command.idempotencyKey],
      );
      if (previous.rowCount) {
        const same = await client.query(
          "SELECT $1::jsonb = $2::jsonb AS same",
          [JSON.stringify(previous.rows[0].request), JSON.stringify(request)],
        );
        await client.query("COMMIT");
        if (!same.rows[0].same) {
          res.status(409).json({ error: "idempotency_conflict" });
          return;
        }
        res.json(previous.rows[0].response);
        return;
      }
      if (result.rows[0].revision !== command.expectedRevision) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "revision_conflict" });
        return;
      }
      const updated = await client.query(
        "UPDATE cases SET revision=revision+1, details=$1 WHERE id=$2 AND owner_id=$3 RETURNING *",
        [JSON.stringify(command.details), req.params.id, res.locals.uid],
      );
      const response = { case: view(updated.rows[0]) };
      await client.query(
        "INSERT INTO details_commands(case_id,idempotency_key,request,response) VALUES($1,$2,$3,$4)",
        [
          req.params.id,
          command.idempotencyKey,
          JSON.stringify(request),
          JSON.stringify(response),
        ],
      );
      await client.query("COMMIT");
      res.json(response);
    } catch (e) {
      await client.query("ROLLBACK");
      next(e);
    } finally {
      client.release();
    }
  });
  router.put("/:id/budget", async (req, res, next) => {
    if (!idSchema.safeParse(req.params.id).success) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const parsed = commandSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_budget" });
      return;
    }
    const command = parsed.data,
      total = totalKopecks(command.items);
    if (total === null) {
      res.status(400).json({ error: "invalid_budget" });
      return;
    }
    const client = await db.connect().catch(next);
    if (!client) return;
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "SELECT * FROM cases WHERE id=$1 AND owner_id=$2 FOR UPDATE",
        [req.params.id, res.locals.uid],
      );
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "not_found" });
        return;
      }
      const request = {
        expectedRevision: command.expectedRevision,
        items: command.items,
      };
      const previous = await client.query(
        "SELECT request, response FROM budget_commands WHERE case_id=$1 AND idempotency_key=$2",
        [req.params.id, command.idempotencyKey],
      );
      if (previous.rowCount) {
        const same = await client.query(
          "SELECT $1::jsonb = $2::jsonb AS same",
          [JSON.stringify(previous.rows[0].request), JSON.stringify(request)],
        );
        await client.query("COMMIT");
        if (!same.rows[0].same) {
          res.status(409).json({ error: "idempotency_conflict" });
          return;
        }
        res.json(previous.rows[0].response);
        return;
      }
      if (result.rows[0].revision !== command.expectedRevision) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "revision_conflict" });
        return;
      }
      const updated = await client.query(
        "UPDATE cases SET revision=revision+1,items=$1,total_kopecks=$2 WHERE id=$3 AND owner_id=$4 RETURNING *",
        [JSON.stringify(command.items), total, req.params.id, res.locals.uid],
      );
      const response = { case: view(updated.rows[0]) };
      await client.query(
        "INSERT INTO budget_history(case_id,revision,items,total_kopecks) VALUES($1,$2,$3,$4)",
        [
          req.params.id,
          response.case.revision,
          JSON.stringify(command.items),
          total,
        ],
      );
      await client.query(
        "INSERT INTO budget_commands(case_id,idempotency_key,request,response) VALUES($1,$2,$3,$4)",
        [
          req.params.id,
          command.idempotencyKey,
          JSON.stringify(request),
          JSON.stringify(response),
        ],
      );
      await client.query("COMMIT");
      res.json(response);
    } catch (e) {
      await client.query("ROLLBACK");
      next(e);
    } finally {
      client.release();
    }
  });
  return router;
}
