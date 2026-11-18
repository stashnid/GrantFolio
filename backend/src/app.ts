import {GRANT_CATALOG} from "./grant-catalog-data.js";
import express, { type ErrorRequestHandler } from "express";
import { getAuth } from "firebase-admin/auth";
import type { Pool } from "pg";
import { z } from "zod";
import { advisorRouter } from "./advisor.js";
import { casesRouter } from "./cases.js";
import { feedbackRouter } from "./feedback.js";
import { donationsRouter } from "./donations.js";
import { monitorAdminRouter } from "./monitor-admin.js";
import { configuredEmailLoginCode, sendGmailMessage } from "./email-login-code.js";
import { renderGrantDigestEmail, selectDigestPrograms } from "./email-templates.js";
import {
  buildUnsubscribeUrl,
  getUnsubscribeSecret,
  renderUnsubscribeConfirmationHtml,
  verifyUnsubscribeToken,
} from "./newsletter-unsubscribe.js";
import { profileDetails } from "./profile-details.js";
import { extractProfileFromHistory } from "./profile-extractor.js";

const newsletterPreviewBody = z
  .object({
    email: z.email().max(254).optional(),
    recipientName: z.string().trim().max(160).optional(),
    businessName: z.string().trim().max(160).optional(),
    industry: z.string().trim().max(160).optional(),
    region: z.string().trim().max(120).optional(),
    city: z.string().trim().max(120).optional(),
    legalForm: z.enum(["", "idea", "fop", "company", "ngo"]).optional(),
    requestedAmount: z.string().trim().max(30).optional(),
    fundingPurpose: z.string().trim().max(500).optional(),
  })
  .strict();

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
  onCatalogMutated?: () => Promise<void>,
) {
  const app = express();
  const privateRoutes = ["/api/advisor", "/api/me", "/api/cases", "/api/feedback", "/api/donations", "/api/admin/monitor"];
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
  const handleUnsubscribe = async (tokenParam: unknown): Promise<boolean> => {
    const secret = getUnsubscribeSecret();
    if (!secret || typeof tokenParam !== "string" || !tokenParam) return false;
    const uid = verifyUnsubscribeToken(tokenParam, secret);
    if (!uid) return false;
    await db.query(
      `UPDATE profiles
       SET details = jsonb_set(COALESCE(details, '{}'::jsonb), '{grantNewsletter}', '""'::jsonb, true),
           updated_at = now(),
           revision = revision + 1
       WHERE owner_id = $1`,
      [uid],
    );
    return true;
  };
  app.post("/api/newsletter/unsubscribe", async (req, res, next) => {
    try {
      const ok = await handleUnsubscribe(req.query.token);
      res.set("Cache-Control", "no-store").status(ok ? 200 : 400).json({ ok });
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/newsletter/unsubscribe", async (req, res, next) => {
    try {
      const ok = await handleUnsubscribe(req.query.token);
      res
        .set("Cache-Control", "no-store")
        .set("Referrer-Policy", "no-referrer")
        .status(ok ? 200 : 400)
        .type("text/html; charset=utf-8")
        .send(renderUnsubscribeConfirmationHtml(ok));
    } catch (error) {
      next(error);
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
      if (res.locals.firebaseToken?.firebase?.sign_in_provider === "password") {
        res.locals.emailVerifiedByOtp = true;
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
  app.post("/api/me/newsletter/preview", async (req, res, next) => {
    try {
      const parsed = newsletterPreviewBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_newsletter_preview" });
        return;
      }
      const token = res.locals.firebaseToken;
      const recipient = z.email().max(254).safeParse(token?.email);
      if (!recipient.success || !(token?.email_verified === true || res.locals.emailVerifiedByOtp === true)) {
        res.status(403).json({ error: "verified_email_required" });
        return;
      }
      if (parsed.data.email && parsed.data.email.toLowerCase() !== recipient.data.toLowerCase()) {
        res.status(400).json({ error: "invalid_preview_recipient" });
        return;
      }
      const permit = await db.query(`INSERT INTO newsletter_preview_cooldowns (owner_id, last_requested_at)
        VALUES ($1, now())
        ON CONFLICT (owner_id) DO UPDATE SET last_requested_at = excluded.last_requested_at
        WHERE newsletter_preview_cooldowns.last_requested_at <= excluded.last_requested_at - interval '5 minutes'
        RETURNING owner_id`, [res.locals.uid]);
      if (!permit.rowCount) {
        res.status(429).json({ error: "preview_cooldown" });
        return;
      }
      const saved = await db.query(
        'SELECT business_name AS "businessName", region, details FROM profiles WHERE owner_id = $1',
        [res.locals.uid],
      );
      const savedRow = saved.rows[0];
      const savedDetails = (savedRow?.details && typeof savedRow.details === "object"
        ? savedRow.details
        : {}) as Record<string, string>;

      const digestInput = {
        recipientName: parsed.data.recipientName || savedDetails.contactName || (typeof token?.name === "string" ? token.name : ""),
        businessName: parsed.data.businessName || savedRow?.businessName || "",
        industry: parsed.data.industry || savedDetails.industry || "",
        region: parsed.data.region || savedRow?.region || "",
        city: parsed.data.city || savedDetails.city || "",
        legalForm: parsed.data.legalForm || savedDetails.legalForm || "",
        requestedAmount: parsed.data.requestedAmount || savedDetails.requestedAmount || "",
        fundingPurpose: parsed.data.fundingPurpose || savedDetails.fundingPurpose || "",
        unsubscribeUrl: buildUnsubscribeUrl(res.locals.uid),
        replyToEmail: process.env.MAIL_REPLY_TO?.trim() || undefined,
      };
      const programs = selectDigestPrograms(digestInput);
      const digest = renderGrantDigestEmail(digestInput, programs);

      let delivered = false;
      try {
        delivered = await sendGmailMessage(
          recipient.data,
          digest.subject,
          digest.text,
          digest.html,
          digest.headers,
        );
      } catch {
        delivered = false;
      }
      if (!delivered) {
        res.status(503).json({ error: "email_delivery_unavailable" });
        return;
      }
      res.json({ ok: true, delivered: true, recipient: recipient.data });
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/me/profile-suggestions", async (_req, res, next) => {
    try {
      const uid = res.locals.uid;
      const history = await db.query(
        "SELECT question, reply FROM advisor_messages WHERE owner_id=$1 ORDER BY created_at ASC LIMIT 100",
        [uid]
      );
      if (!history.rowCount) {
        res.json({ facts: [], suggestions: {} });
        return;
      }
      const current = await db.query(
        'SELECT business_name AS "businessName", description, region, details FROM profiles WHERE owner_id=$1',
        [uid]
      );
      const row = current.rows[0];
      const existing = row ? {
        businessName: row.businessName || "",
        description: row.description || "",
        region: row.region || "",
        details: (row.details && typeof row.details === "object" ? { ...row.details } : {}) as Record<string, string>,
      } : undefined;
      const { data, facts } = extractProfileFromHistory(history.rows, existing);
      const unappliedCount = Object.keys(data).length;
      res.json({ facts, suggestions: data, unappliedCount });
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/me/sync-from-conversations", async (_req, res, next) => {
    try {
      const uid = res.locals.uid;
      const history = await db.query(
        "SELECT question, reply FROM advisor_messages WHERE owner_id=$1 ORDER BY created_at ASC LIMIT 100",
        [uid]
      );
      if (!history.rowCount) {
        res.json({ ok: true, synced: false, facts: [], message: "Немає повідомлень для аналізу" });
        return;
      }
      const current = await db.query(
        'SELECT business_name AS "businessName", description, region, details, revision FROM profiles WHERE owner_id=$1',
        [uid]
      );
      const currentRow = current.rows[0];
      const existing = {
        businessName: currentRow?.businessName || "",
        description: currentRow?.description || "",
        region: currentRow?.region || "",
        details: (currentRow?.details && typeof currentRow.details === "object" ? { ...currentRow.details } : {}) as Record<string, string>,
      };
      const currentRevision = currentRow?.revision ?? 0;
      const { data: extracted, facts } = extractProfileFromHistory(history.rows, existing);
      if (!facts.length || !Object.keys(extracted).length) {
        res.json({ ok: true, synced: false, facts: [], profile: existing, revision: currentRevision });
        return;
      }

      let mergedCount = 0;
      let newBusinessName = existing.businessName;
      if (!newBusinessName && extracted.businessName) {
        newBusinessName = extracted.businessName;
        mergedCount++;
      }
      let newRegion = existing.region;
      if (!newRegion && extracted.region) {
        newRegion = extracted.region;
        mergedCount++;
      }
      let newDescription = existing.description;
      if (!newDescription && extracted.description) {
        newDescription = extracted.description;
        mergedCount++;
      }
      const details = { ...existing.details };

      for (const key of ["city", "legalForm", "industry", "requestedAmount", "fundingPurpose", "teamSize", "grantExperience"] as const) {
        if (!details[key] && extracted[key]) {
          details[key] = extracted[key]!;
          mergedCount++;
        }
      }

      let saved;
      if (current.rowCount) {
        saved = await db.query(
          `UPDATE profiles SET business_name=$2, description=$3, region=$4,
            details=$5::jsonb, updated_at=now(), revision=revision+1
           WHERE owner_id=$1 AND revision=$6
           RETURNING business_name AS "businessName", description, region, details, revision`,
          [uid, newBusinessName, newDescription, newRegion, JSON.stringify(details), currentRevision]
        );
      } else {
        saved = await db.query(
          `INSERT INTO profiles(owner_id, business_name, description, region, details, revision)
           VALUES ($1,$2,$3,$4,$5::jsonb,1)
           ON CONFLICT (owner_id) DO NOTHING
           RETURNING business_name AS "businessName", description, region, details, revision`,
          [uid, newBusinessName, newDescription, newRegion, JSON.stringify(details)]
        );
      }
      if (!saved.rowCount) { res.status(409).json({ error: "profile_conflict" }); return; }
      const row = saved.rows[0];
      res.json({
        ok: true,
        synced: true,
        mergedCount,
        facts,
        profile: presentProfile(row),
        revision: row.revision,
      });
    } catch (error) {
      next(error);
    }
  });
  app.use("/api/advisor", advisorRouter(db));
  app.use("/api/cases", casesRouter(db));
  app.use("/api/feedback", feedbackRouter(db));
  app.use("/api/donations", donationsRouter(db));
  app.use("/api/admin/monitor", monitorAdminRouter(db, { onAvailabilityApproved: onCatalogMutated }));
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
