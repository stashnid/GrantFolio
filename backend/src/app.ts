import express, { type ErrorRequestHandler } from "express";
import { getAuth } from "firebase-admin/auth";
import type { Pool } from "pg";
import { z } from "zod";
import { casesRouter } from "./cases.js";

const profile = z
  .object({
    businessName: z.string().trim().max(160),
    description: z.string().trim().max(2000),
    region: z.string().trim().max(120),
  })
  .strict();
export function createApp(db: Pool) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use(["/api/me", "/api/cases"], async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/.exec(req.header("authorization") ?? "");
    if (!match) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    try {
      res.locals.uid = (await getAuth().verifyIdToken(match[1])).uid;
      next();
    } catch {
      res.status(401).json({ error: "unauthorized" });
    }
  });
  app.get("/api/me", async (_req, res, next) => {
    try {
      const result = await db.query(
        'SELECT business_name AS "businessName", description, region FROM profiles WHERE owner_id = $1',
        [res.locals.uid],
      );
      res.set("Cache-Control", "no-store").json({
        profile: result.rows[0] ?? {
          businessName: "",
          description: "",
          region: "",
        },
      });
    } catch (error) {
      next(error);
    }
  });
  app.put("/api/me", async (req, res, next) => {
    const parsed = profile.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_profile" });
      return;
    }
    try {
      const p = parsed.data;
      await db.query(
        "INSERT INTO profiles(owner_id, business_name, description, region) VALUES ($1,$2,$3,$4) ON CONFLICT (owner_id) DO UPDATE SET business_name=EXCLUDED.business_name, description=EXCLUDED.description, region=EXCLUDED.region, updated_at=now()",
        [res.locals.uid, p.businessName, p.description, p.region],
      );
      res.set("Cache-Control", "no-store").json({ profile: p });
    } catch (error) {
      next(error);
    }
  });
  app.use("/api/cases", casesRouter(db));
  app.use("/api", (_req, res) => res.status(404).json({ error: "not_found" }));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    const status =
      error?.type === "entity.parse.failed"
        ? 400
        : error?.type === "entity.too.large"
          ? 413
          : 500;
    res
      .status(status)
      .json({ error: status === 500 ? "internal_error" : "invalid_request" });
  };
  app.use(errors);
  return app;
}
