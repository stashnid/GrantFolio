import { Router } from "express";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { commandSchema, totalKopecks } from "./budget.js";
import { detailsCommandSchema, readiness } from "./project-details.js";
import { draftExport } from "./draft-export.js";
import { assistantRouter } from "./assistant.js";
import { configuredGeminiResponder } from "./gemini.js";
const idSchema = z.string().uuid();
const titleSchema = z
  .object({ title: z.string().trim().min(1).max(160) })
  .strict();
type CaseRow = {
  id: string;
  title: string;
  revision: number;
  items: unknown;
  total_kopecks: string;
  details: unknown;
};
function view(row: CaseRow) {
  return {
    id: row.id,
    title: row.title,
    revision: row.revision,
    items: row.items,
    details: row.details,
    totalKopecks: Number(row.total_kopecks),
  };
}
export function casesRouter(db: Pool) {
  const router = Router();
  router.use(assistantRouter(db, configuredGeminiResponder()));
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
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
    const parsed = titleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_case" });
      return;
    }
    try {
      const result = await db.query(
        "INSERT INTO cases(id,owner_id,title) VALUES($1,$2,$3) RETURNING *",
        [randomUUID(), res.locals.uid, parsed.data.title],
      );
      res.status(201).json({ case: view(result.rows[0]) });
    } catch (e) {
      next(e);
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
        "SELECT title, revision, details, items, total_kopecks FROM cases WHERE id=$1 AND owner_id=$2",
        [req.params.id, res.locals.uid],
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
