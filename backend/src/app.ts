import {GRANT_CATALOG} from "./grant-catalog-data.js";
import express, { type ErrorRequestHandler } from "express";
import { getAuth } from "firebase-admin/auth";
import type { Pool } from "pg";
import { z } from "zod";
import { advisorRouter } from "./advisor.js";
import { casesRouter } from "./cases.js";
import { feedbackRouter } from "./feedback.js";
import { donationsRouter } from "./donations.js";
import { configuredEmailLoginCode, sendGmailMessage } from "./email-login-code.js";
import { profileDetails } from "./profile-details.js";

const profile = z
  .object({
    businessName: z.string().trim().max(160),
    description: z.string().trim().max(2000),
    region: z.string().trim().max(120),
    details: profileDetails.optional(),
  })
  .strict();
function presentProfile(row: { businessName: string; description: string; region: string; details: Record<string, unknown>; revision: number }) {
  const { details, revision: _revision, ...base } = row;
  return Object.keys(details).length ? { ...base, details } : base;
}
export function createApp(
  db: Pool,
  catalogStatus: () => unknown[] | Promise<unknown[]> = () => [],
  emailCode = configuredEmailLoginCode(db),
) {
  const app = express();
  const privateRoutes = ["/api/advisor", "/api/me", "/api/cases", "/api/feedback", "/api/donations"];
  app.disable("x-powered-by");
  app.use(express.json({ limit: "128kb" }));
  app.get("/api/grants", async (_req,res,next) => {try { const sources=await catalogStatus();res.set("Cache-Control","no-store").json({programs:GRANT_CATALOG,sources}); }catch(e){next(e);} });
  app.get("/api/health", async (_req, res) => {
    try {
      await db.query("SELECT 1");
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "db_unavailable" });
    }
  });
  app.use([...privateRoutes, "/api/auth/email-code"], async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const match = /^Bearer ([^\s]+)$/.exec(req.header("authorization") ?? "");
    if (!match) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    try {
      const token = await getAuth().verifyIdToken(match[1]);
      res.locals.uid = token.uid;
      res.locals.firebaseToken = token;
      next();
    } catch (error) {
      const code = (error as { code?: string }).code;
      const invalid = ["auth/id-token-expired", "auth/id-token-revoked", "auth/invalid-id-token", "auth/argument-error", "auth/invalid-argument", "auth/user-disabled", "auth/user-not-found"].includes(code ?? "");
      res.status(invalid ? 401 : 503).json({ error: invalid ? "unauthorized" : "auth_unavailable" });
    }
  });
  if (emailCode) {
    app.use("/api/auth/email-code", emailCode.router);
    app.use(privateRoutes, (req, res, next) => {
      if (emailCode.requiresCode(res.locals.firebaseToken, req)) {
        res.status(403).json({ error: "email_code_required" });
        return;
      }
      next();
    });
  } else {
    app.get("/api/auth/email-code/status", (_req, res) => res.json({ required: false }));
  }
  app.get("/api/me", async (_req, res, next) => {
    try {
      const result = await db.query(
        'SELECT business_name AS "businessName", description, region, details, revision FROM profiles WHERE owner_id = $1',
        [res.locals.uid],
      );
      const revision = result.rows[0]?.revision ?? 0;
      res.set("ETag", `"${revision}"`).set("Cache-Control", "no-store").json({
        revision,
        profile: result.rows[0] ? presentProfile(result.rows[0]) : {
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
    const match = /^"(\d+)"$/.exec(req.header("If-Match") ?? "");
    if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) > 2147483646) {
      res.status(req.header("If-Match") === undefined ? 428 : 400).json({ error: "profile_version_required" });
      return;
    }
    try {
      const p = parsed.data;
      const revision = Number(match[1]);
      const values = [res.locals.uid, p.businessName, p.description, p.region, p.details === undefined ? null : JSON.stringify(p.details), revision];
      let saved = await db.query(
        `UPDATE profiles SET business_name=$2, description=$3, region=$4,
          details=COALESCE($5::jsonb, details), updated_at=now(), revision=revision+1
         WHERE owner_id=$1 AND revision=$6
         RETURNING business_name AS "businessName", description, region, details, revision`, values);
      if (!saved.rowCount && revision === 0) {
        saved = await db.query(
          `INSERT INTO profiles(owner_id, business_name, description, region, details, revision)
           VALUES ($1,$2,$3,$4,COALESCE($5::jsonb, '{}'::jsonb),1)
           ON CONFLICT (owner_id) DO NOTHING
           RETURNING business_name AS "businessName", description, region, details, revision`, values.slice(0,5));
      }
      if (!saved.rowCount) { res.status(409).json({ error: "profile_conflict" }); return; }
      const row = saved.rows[0];
      res.set("ETag", `"${row.revision}"`).set("Cache-Control", "no-store").json({ profile: presentProfile(row), revision: row.revision });
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/me/newsletter/preview", async (req, res) => {
    const token = res.locals.firebaseToken;
    const targetEmail = (typeof req.body?.email === "string" && req.body.email.trim()) || token?.email;
    if (!targetEmail || typeof targetEmail !== "string") {
      res.status(400).json({ error: "missing_recipient" });
      return;
    }
    const businessName = typeof req.body?.businessName === "string" ? req.body.businessName.trim() : "";
    const industry = typeof req.body?.industry === "string" ? req.body.industry.trim() : "";
    const subject = `[GrantFolio] Персональний дайджест грантів для «${businessName || "Вашого бізнесу"}»`;
    const textContent = `Вітаємо!\n\nПідібрано актуальні грантові програми для вашого бізнесу (${industry || "загальний профіль"}):\n1. Власна справа (єРобота) — до 500 000 грн (дедлайн 27 листопада)\n2. BLOOM: Підтримка малого бізнесу — до 40 000 EUR\n\nДеталі та підготовка заявки: https://grantfolio.pp.ua/\n\nВи отримали це повідомлення згідно з вашою згодою у профілі бізнесу GrantFolio.`;
    let delivered = false;
    try {
      delivered = await sendGmailMessage(targetEmail, subject, textContent);
    } catch {
      delivered = false;
    }
    res.json({ ok: true, delivered, recipient: targetEmail });
  });
  app.use("/api/advisor", advisorRouter(db));
  app.use("/api/cases", casesRouter(db));
  app.use("/api/feedback", feedbackRouter(db));
  app.use("/api/donations", donationsRouter(db));
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
