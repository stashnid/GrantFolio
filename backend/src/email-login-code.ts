import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { Router, type Request } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import type { Pool } from "pg";
import { z } from "zod";

const cookieName = "__Host-grantfolio-email";
const sessionSeconds = 12 * 60 * 60;
const sender = "grantfoliomanager@gmail.com";
const email = z.email().max(254);
const codeBody = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();

const mailSettings = z.object({
  signingKey: z.string().min(32),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  refreshToken: z.string().min(1),
});

export function configuredEmailLoginCode(db: Pool) {
  const value = process.env.EMAIL_LOGIN_CODE_CONFIG;
  if (!value) {
    if (process.env.EMAIL_LOGIN_CODE_REQUIRED === "true") throw new Error("Email login code configuration is required");
    return undefined;
  }
  // Keep parsing failures generic so malformed credentials never appear in logs.
  let settings: z.infer<typeof mailSettings>;
  try {
    settings = mailSettings.parse(JSON.parse(value));
  } catch {
    throw new Error("Invalid email login code configuration");
  }

  return createEmailLoginCode(db, settings.signingKey, async (recipient, code) => {
    const token = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        refresh_token: settings.refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!token.ok) throw new Error("Email authorization unavailable");
    const credentials = z.object({ access_token: z.string().min(1) }).parse(await token.json());
    const subject = Buffer.from("Код входу GrantFolio").toString("base64");
    const body = Buffer.from(`Ваш код підтвердження GrantFolio: ${code}\n\nКод дійсний 10 хвилин.`).toString("base64");
    const raw = Buffer.from([
      `From: GrantFolio <${sender}>`,
      `To: ${recipient}`,
      `Subject: =?UTF-8?B?${subject}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      ...(body.match(/.{1,76}/g) ?? []),
    ].join("\r\n")).toString("base64url");
    const delivery = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(8000),
    });
    if (!delivery.ok) throw new Error("Email delivery unavailable");
  });
}

export async function sendGmailMessage(
  recipient: string,
  subjectText: string,
  bodyText: string,
  htmlText?: string,
): Promise<boolean> {
  const value = process.env.EMAIL_LOGIN_CODE_CONFIG;
  if (!value) return false;
  let settings: z.infer<typeof mailSettings>;
  try {
    settings = mailSettings.parse(JSON.parse(value));
  } catch {
    return false;
  }
  try {
    const token = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        refresh_token: settings.refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!token.ok) return false;
    const credentials = z.object({ access_token: z.string().min(1) }).parse(await token.json());
    const subject = Buffer.from(subjectText).toString("base64");
    const body = Buffer.from(htmlText || bodyText).toString("base64");
    const raw = Buffer.from([
      `From: GrantFolio <${sender}>`,
      `To: ${recipient}`,
      `Subject: =?UTF-8?B?${subject}?=`,
      "MIME-Version: 1.0",
      htmlText ? "Content-Type: text/html; charset=UTF-8" : "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      ...(body.match(/.{1,76}/g) ?? []),
    ].join("\r\n")).toString("base64url");
    const delivery = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(8000),
    });
    return delivery.ok;
  } catch {
    return false;
  }
}

export function createEmailLoginCode(
  db: Pool,
  key: string,
  sendCode: (recipient: string, code: string) => Promise<void>,
) {
  const router = Router();
  const sign = (...fields: Array<string | number>) =>
    createHmac("sha256", key).update(JSON.stringify(fields)).digest("hex");

  function requiresCode(token: DecodedIdToken, request: Request) {
    if (token.firebase.sign_in_provider !== "password") return false;
    const cookie = request.header("Cookie")?.split(";").map(value => value.trim())
      .find(value => value.startsWith(`${cookieName}=`));
    const match = cookie?.match(/^__Host-grantfolio-email=(\d+)\.([a-f0-9]{64})$/);
    if (!match || Number(match[1]) <= Math.floor(Date.now() / 1000)) return true;
    const expected = sign("session", token.uid, token.auth_time, token.email ?? "", match[1]);
    return !timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(match[2], "hex"));
  }

  router.get("/status", (req, res) => {
    res.json({ required: requiresCode(res.locals.firebaseToken, req) });
  });

  router.post("/send", async (req, res) => {
    const token: DecodedIdToken = res.locals.firebaseToken;
    const recipient = email.safeParse(token.email);
    if (!recipient.success || !requiresCode(token, req)) {
      res.status(409).json({ error: "code_not_required" });
      return;
    }
    const code = String(randomInt(1_000_000)).padStart(6, "0");
    const digest = sign("code", token.uid, token.auth_time, recipient.data, code);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const challenge = await client.query(`
        INSERT INTO email_login_codes(uid, auth_time, email, digest) VALUES ($1, $2, $3, $4)
        ON CONFLICT (uid) DO UPDATE SET auth_time = $2, email = $3, digest = $4,
          issued_at = now(), attempts = 0, used_at = NULL
        WHERE email_login_codes.issued_at <= now() - interval '60 seconds'`,
      [token.uid, token.auth_time, recipient.data, digest]);
      const limit = challenge.rowCount && await client.query(`
        INSERT INTO email_login_delivery_limits(period, available_at, sent)
        VALUES ('daily', now() + interval '24 hours', 1)
        ON CONFLICT (period) DO UPDATE SET
          sent = CASE WHEN email_login_delivery_limits.available_at <= now() THEN 1 ELSE email_login_delivery_limits.sent + 1 END,
          available_at = CASE WHEN email_login_delivery_limits.available_at <= now() THEN now() + interval '24 hours' ELSE email_login_delivery_limits.available_at END
        WHERE email_login_delivery_limits.available_at <= now() OR email_login_delivery_limits.sent < 200`);
      if (!limit || !limit.rowCount) {
        await client.query("ROLLBACK");
        res.status(429).json({ error: "email_code_rate_limit" });
        return;
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    try {
      await sendCode(recipient.data, code);
      res.sendStatus(204);
    } catch {
      res.status(503).json({ error: "email_code_delivery_unavailable" });
    }
  });

  router.post("/verify", async (req, res) => {
    const token: DecodedIdToken = res.locals.firebaseToken;
    const parsed = codeBody.safeParse(req.body);
    if (!parsed.success || !token.email || !requiresCode(token, req)) {
      res.status(400).json({ error: "invalid_email_code" });
      return;
    }
    const digest = sign("code", token.uid, token.auth_time, token.email, parsed.data.code);
    const updated = await db.query<{ valid: boolean }>(`
      UPDATE email_login_codes
      SET attempts = attempts + 1, used_at = CASE WHEN digest = $4 THEN now() ELSE NULL END
      WHERE uid = $1 AND auth_time = $2 AND email = $3 AND used_at IS NULL
        AND attempts < 5 AND issued_at > now() - interval '10 minutes'
      RETURNING used_at IS NOT NULL AS valid`, [token.uid, token.auth_time, token.email, digest]);
    if (!updated.rows[0]?.valid) {
      res.status(400).json({ error: "invalid_email_code" });
      return;
    }
    const expires = String(Math.floor(Date.now() / 1000) + sessionSeconds);
    const value = `${expires}.${sign("session", token.uid, token.auth_time, token.email, expires)}`;
    res.cookie(cookieName, value, { secure: true, httpOnly: true, sameSite: "strict", path: "/", maxAge: sessionSeconds * 1000 });
    res.sendStatus(204);
  });

  router.post("/clear", (_req, res) => {
    res.clearCookie(cookieName, { secure: true, httpOnly: true, sameSite: "strict", path: "/" });
    res.sendStatus(204);
  });

  return { router, requiresCode };
}
