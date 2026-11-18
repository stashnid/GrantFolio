import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const APP_ORIGIN = "https://grantfolio.pp.ua";

function parseSigningKeyFromMailConfig(): string | undefined {
  const raw = process.env.EMAIL_LOGIN_CODE_CONFIG;
  if (!raw) return undefined;
  try {
    const parsed = z.object({ signingKey: z.string().min(32) }).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.signingKey : undefined;
  } catch {
    return undefined;
  }
}

export function getUnsubscribeSecret(): string | undefined {
  const explicit = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET?.trim();
  if (explicit && explicit.length >= 32) return explicit;
  return parseSigningKeyFromMailConfig();
}

function signUid(uid: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`grantfolio:newsletter-unsubscribe:${uid}`)
    .digest("hex");
}

export function createUnsubscribeToken(uid: string, secret: string): string {
  const encodedUid = Buffer.from(uid, "utf8").toString("base64url");
  const sig = signUid(uid, secret);
  return `${encodedUid}.${sig}`;
}

export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  const match = /^([A-Za-z0-9_-]{1,256})\.([a-f0-9]{64})$/.exec(token.trim());
  if (!match) return null;
  const uid = Buffer.from(match[1], "base64url").toString("utf8");
  if (!uid || uid.length > 128) return null;
  const expected = signUid(uid, secret);
  const actualBuf = Buffer.from(match[2], "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (actualBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(actualBuf, expectedBuf)) return null;
  return uid;
}

export function buildUnsubscribeUrl(uid: string, secret = getUnsubscribeSecret()): string | undefined {
  if (!secret || !uid) return undefined;
  const token = createUnsubscribeToken(uid, secret);
  return `${APP_ORIGIN}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function renderUnsubscribeConfirmationHtml(ok: boolean): string {
  const title = ok
    ? "Підписку на розсилку скасовано"
    : "Посилання для відписки недійсне";
  const body = ok
    ? "Ви більше не отримуватимете регулярні дайджести грантів від GrantFolio. За потреби ви завжди можете знову увімкнути розсилку у розділі «Профіль бізнесу»."
    : "Не вдалося підтвердити посилання. Ви можете змінити налаштування розсилки безпосередньо в кабінеті GrantFolio.";

  return `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — GrantFolio</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f1d32; }
    .card { max-width: 460px; width: 100%; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 28px rgba(15, 29, 50, 0.08); }
    .bar { height: 4px; background: linear-gradient(90deg, #1e3a8a 0%, #315fd7 55%, #4f46e5 100%); }
    .head { padding: 20px 28px; background: #0f1d32; color: #fff; font-size: 19px; font-weight: 800; letter-spacing: -0.03em; }
    .body { padding: 28px; }
    h1 { margin: 0 0 10px; font-size: 20px; line-height: 1.3; letter-spacing: -0.02em; }
    p { margin: 0 0 22px; font-size: 14.5px; line-height: 1.6; color: #475569; }
    a.btn { display: inline-block; padding: 11px 20px; border-radius: 9px; background: #0f1d32; color: #fff; font-size: 13.5px; font-weight: 700; text-decoration: none; }
    a.btn:hover { background: #1e3a8a; }
  </style>
</head>
<body>
  <main class="card">
    <div class="bar"></div>
    <div class="head">GrantFolio</div>
    <div class="body">
      <h1>${title}</h1>
      <p>${body}</p>
      <a class="btn" href="${APP_ORIGIN}/">Повернутися в GrantFolio</a>
    </div>
  </main>
</body>
</html>`;
}
