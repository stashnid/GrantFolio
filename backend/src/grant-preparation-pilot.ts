import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";

const statusQuery = `SELECT c.program_id, p.reference, p.confirmed_at FROM cases c
  LEFT JOIN grant_preparation_pilot p ON p.case_id=c.id AND p.program_id=c.program_id
  WHERE c.id=$1 AND c.owner_id=$2`;

export function grantPreparationPilotRouter(db: Pool) {
  const router = Router();

  router.get("/:id/preparation-access", async (req, res, next) => {
    if (!z.uuid().safeParse(req.params.id).success) { res.sendStatus(404); return; }
    try {
      const { rows: [row] } = await db.query(statusQuery, [req.params.id, res.locals.uid]);
      if (!row) { res.sendStatus(404); return; }
      res.json({ state: !row.reference ? "standard" : row.confirmed_at ? "active" : "pending", reference: row.reference });
    } catch (error) { next(error); }
  });

  router.post("/:id/preparation-access", async (req, res, next) => {
    if (!z.uuid().safeParse(req.params.id).success) { res.sendStatus(404); return; }
    try {
      const { rows: [row] } = await db.query(
        `INSERT INTO grant_preparation_pilot (case_id, program_id)
         SELECT id, program_id FROM cases WHERE id=$1 AND owner_id=$2 AND program_id='vlasna-sprava'
         ON CONFLICT (case_id, program_id) DO UPDATE SET case_id=EXCLUDED.case_id
         RETURNING reference, confirmed_at`, [req.params.id, res.locals.uid],
      );
      if (!row) { res.sendStatus(404); return; }
      res.json({ state: row.confirmed_at ? "active" : "pending", reference: row.reference });
    } catch (error) { next(error); }
  });

  router.post(["/:id/grant-application/diia-draft/export", "/:id/grant-financial-plan/export"], async (req, res, next) => {
    if (!z.uuid().safeParse(req.params.id).success) { next(); return; }
    try {
      const { rows: [row] } = await db.query(statusQuery, [req.params.id, res.locals.uid]);
      if (!row) { res.sendStatus(404); return; }
      if (row.program_id === "vlasna-sprava" && !row.confirmed_at) {
        res.status(402).json({ error: "preparation_payment_pending" });
        return;
      }
      next();
    } catch (error) { next(error); }
  });

  return router;
}
