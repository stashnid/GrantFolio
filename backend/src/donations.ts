import { Router } from "express";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const donationInput = z
  .object({
    id: z.string().uuid().optional(),
    amountKopecks: z.number().int().min(100).max(10000000000), // від 1 грн до 100 млн грн
    target: z.string().trim().min(1).max(200),
    note: z.string().trim().max(500).optional().default(""),
    status: z.enum(["completed", "pledged"]).optional().default("completed"),
  })
  .strict();

export function donationsRouter(db: Pool) {
  const router = Router();

  // Public stats (no private info leaked)
  router.get("/stats", async (_req, res, next) => {
    try {
      const result = await db.query(
        "SELECT COUNT(*)::int AS count, COALESCE(SUM(amount_kopecks), 0)::text AS total_kopecks FROM donations"
      );
      const row = result.rows[0];
      res.set("Cache-Control", "no-store").json({
        totalKopecks: Number(row.total_kopecks),
        count: row.count,
      });
    } catch (e) {
      next(e);
    }
  });

  // User's own donations
  router.get("/", async (_req, res, next) => {
    try {
      const result = await db.query(
        `SELECT id, amount_kopecks, target, note, status, created_at
         FROM donations WHERE owner_id=$1 ORDER BY created_at DESC, id DESC LIMIT 50`,
        [res.locals.uid]
      );
      res.set("Cache-Control", "no-store").json({
        donations: result.rows.map((r) => ({
          id: r.id,
          amountKopecks: Number(r.amount_kopecks),
          target: r.target,
          note: r.note,
          status: r.status,
          createdAt: r.created_at,
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  // Record a new donation / support
  router.post("/", async (req, res, next) => {
    const parsed = donationInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_donation" });
      return;
    }

    try {
      const id = parsed.data.id ?? randomUUID();
      const result = await db.query(
        `INSERT INTO donations (id, owner_id, amount_kopecks, target, note, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING
         RETURNING id, amount_kopecks, target, note, status, created_at`,
        [
          id,
          res.locals.uid,
          parsed.data.amountKopecks,
          parsed.data.target,
          parsed.data.note,
          parsed.data.status,
        ]
      );
      let r = result.rows[0];
      if (!r) {
        const existing = await db.query("SELECT id, amount_kopecks, target, note, status, created_at FROM donations WHERE id=$1 AND owner_id=$2", [id, res.locals.uid]);
        r = existing.rows[0];
        if (!r || Number(r.amount_kopecks) !== parsed.data.amountKopecks || r.target !== parsed.data.target || r.note !== parsed.data.note || r.status !== parsed.data.status) {
          res.status(409).json({ error: "donation_conflict" }); return;
        }
      }
      res.status(result.rowCount ? 201 : 200).json({
        donation: {
          id: r.id,
          amountKopecks: Number(r.amount_kopecks),
          target: r.target,
          note: r.note,
          status: r.status,
          createdAt: r.created_at,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
