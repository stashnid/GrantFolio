import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";

const feedbackSchema = z
  .object({
    id: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    task: z.enum(["profile", "project", "budget", "assistant", "catalog", "export"]),
    comment: z.string().trim().min(1).max(3000),
  })
  .strict();

function view(row: any) {
  return {
    id: row.id,
    rating: row.rating,
    task: row.task,
    comment: row.comment,
    createdAt: row.created_at,
  };
}

export function feedbackRouter(db: Pool) {
  const router = Router();

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.get("/", async (_req, res, next) => {
    try {
      const uid = res.locals.uid;
      const result = await db.query(
        "SELECT id, owner_id, rating, task, comment, created_at FROM user_feedback WHERE owner_id = $1 ORDER BY created_at DESC, id DESC LIMIT 20",
        [uid],
      );
      res.json({ feedback: result.rows.map(view) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    try {
      const uid = res.locals.uid;
      const f = parsed.data;

      const inserted = await db.query(
        "INSERT INTO user_feedback (id, owner_id, rating, task, comment) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING RETURNING id, owner_id, rating, task, comment, created_at",
        [f.id, uid, f.rating, f.task, f.comment],
      );

      if (inserted.rowCount) {
        res.status(200).json({ feedback: view(inserted.rows[0]) });
        return;
      }

      const existing = await db.query(
        "SELECT id, owner_id, rating, task, comment, created_at FROM user_feedback WHERE id = $1",
        [f.id],
      );

      if (!existing.rowCount) {
        res.status(409).json({ error: "conflict" });
        return;
      }

      const row = existing.rows[0];
      if (
        row.owner_id === uid &&
        row.rating === f.rating &&
        row.task === f.task &&
        row.comment === f.comment
      ) {
        res.status(200).json({ feedback: view(row) });
        return;
      }

      res.status(409).json({ error: "conflict" });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
