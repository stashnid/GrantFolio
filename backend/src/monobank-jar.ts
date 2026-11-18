import { randomBytes, timingSafeEqual } from "node:crypto";
import express from "express";
import type { Pool } from "pg";
import { z } from "zod";

const itemSchema = z.object({
  id: z.string().min(1).max(128), time: z.number().int().nonnegative(),
  amount: z.number().int().safe(), currencyCode: z.number().int(), hold: z.boolean(),
  comment: z.string().max(10000).optional().default(""),
  description: z.string().max(10000).optional().default(""),
});
type Item = z.infer<typeof itemSchema>;

/** Normalize visually confusable Cyrillic characters without changing other text. */
export function jarCodes(text: string): string[] {
  const normalized = text.toUpperCase().replace(/[АВЕСНКМОРТХІУ]/g, c => ({ А: "A", В: "B", Е: "E", С: "C", Н: "H", К: "K", М: "M", О: "O", Р: "P", Т: "T", Х: "X", І: "I", У: "Y" })[c]!);
  return [...new Set(normalized.match(/(?<![A-Z0-9])GF-[0-9A-F]{10}(?![A-Z0-9])/g) ?? [])];
}

export function eligibleJarPayment(item: Item, account: string, expectedAccount: string, createdAt: Date, amountKopecks = 500): boolean {
  return account === expectedAccount && item.amount >= amountKopecks && item.currencyCode === 980 && !item.hold && item.time >= Math.floor(createdAt.getTime() / 1000);
}

export type JarConfig = { secret: string; accountId: string; jarUrl?: string };
export function configuredJar(): JarConfig | undefined {
  const secret = process.env.MONOBANK_JAR_WEBHOOK_SECRET ?? "";
  const accountId = process.env.MONOBANK_JAR_ACCOUNT_ID ?? "";
  return secret.length >= 32 && accountId ? { secret, accountId, jarUrl: process.env.MONOBANK_JAR_URL } : undefined;
}
function validSecret(actual: string, expected: string): boolean {
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function monobankJarWebhookRouter(db: Pool, config: JarConfig | undefined = configuredJar()) {
  const router = express.Router();
  router.use("/:secret", (req, res, next) => {
    if (!config || config.secret.length < 32 || !config.accountId || !validSecret(String(req.params.secret), config.secret)) { res.sendStatus(404); return; }
    res.set("Cache-Control", "no-store").set("Referrer-Policy", "no-referrer");
    next();
  });
  router.get("/:secret", (_req, res) => { res.sendStatus(200); });
  router.get("/:secret/summary", async (_req, res) => {
    try {
      const result = await db.query("SELECT count(*)::int AS payments, COALESCE(sum(amount), 0)::text AS sum FROM jar_payments WHERE status = 'confirmed'");
      const before = typeof _req.query.before === "string" ? _req.query.before : undefined;
      if (before && !Number.isFinite(Date.parse(before))) { res.sendStatus(400); return; }
      const recent = await db.query(
        `SELECT transaction_time AS time, amount, currency, code, status FROM jar_payments
         WHERE ($1::timestamptz IS NULL OR transaction_time < $1::timestamptz)
         ORDER BY transaction_time DESC, id DESC LIMIT 100`, [before ?? null],
      );
      res.json({ ...result.rows[0], transactions: recent.rows });
    } catch { res.sendStatus(503); }
  });
  router.post("/:secret/unlock/:code", async (req, res) => {
    const code = String(req.params.code).toUpperCase();
    if (!/^GF-[0-9A-F]{10}$/.test(code)) { res.sendStatus(404); return; }
    try {
      const result = await db.query("UPDATE jar_orders SET manual_unlocked_at = COALESCE(manual_unlocked_at, now()) WHERE code = $1 RETURNING code", [code]);
      res.sendStatus(result.rowCount ? 200 : 404);
    } catch { res.sendStatus(503); }
  });
  router.post("/:secret", express.raw({ type: () => true, limit: "128kb" }), async (req, res) => {
    let parsed: unknown;
    const logIgnored = (result: string) => console.info(JSON.stringify({ event: "jar_payment", amount: null, comment: "", result }));
    try { parsed = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString("utf8") : ""); } catch { logIgnored("malformed"); res.sendStatus(200); return; }
    const payload = z.object({ type: z.literal("StatementItem"), data: z.object({ account: z.string().min(1).max(256), statementItem: itemSchema }) }).safeParse(parsed);
    if (!payload.success || !config || payload.data.data.account !== config.accountId) { logIgnored(payload.success ? "wrong_account" : "invalid"); res.sendStatus(200); return; }
    const { account, statementItem: item } = payload.data.data;
    const codes = jarCodes(`${item.comment} ${item.description}`);
    const code = codes.length === 1 ? codes[0] : null;
    try {
      const client = await db.connect();
      let status = "ignored";
      try {
        await client.query("BEGIN");
        const inserted = await client.query(
          `INSERT INTO jar_payments (id, account, transaction_time, amount, currency, comment, description, code, status)
           VALUES ($1, $2, to_timestamp($3), $4, $5, $6, $7, $8, 'ignored') ON CONFLICT (id) DO UPDATE SET account = EXCLUDED.account, transaction_time = EXCLUDED.transaction_time,
             amount = EXCLUDED.amount, currency = EXCLUDED.currency, comment = EXCLUDED.comment,
             description = EXCLUDED.description, code = EXCLUDED.code
           WHERE jar_payments.status = 'ignored' RETURNING id`,
          [item.id, account, item.time, item.amount, item.currencyCode, item.comment.slice(0, 1000), item.description.slice(0, 1000), code],
        );
        if (inserted.rowCount && code) {
          const order = await client.query("SELECT created_at, amount_kopecks FROM jar_orders WHERE code = $1 FOR UPDATE", [code]);
          if (order.rowCount && eligibleJarPayment(item, account, config.accountId, order.rows[0].created_at, order.rows[0].amount_kopecks)) {
            await client.query("UPDATE jar_orders SET confirmed_at = COALESCE(confirmed_at, now()) WHERE code = $1", [code]);
            await client.query("UPDATE jar_payments SET status = 'confirmed' WHERE id = $1", [item.id]);
            status = "confirmed";
          }
        } else if (!inserted.rowCount) status = "duplicate";
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
      console.info(JSON.stringify({ event: "jar_payment", amount: item.amount, comment: item.comment.slice(0, 120), result: status }));
      res.sendStatus(200);
    } catch { res.sendStatus(503); }
  });
  return router;
}

export function jarAccessRouter(db: Pool, config: JarConfig | undefined = configuredJar()) {
  const router = express.Router();
  const handler: express.RequestHandler = async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) { res.sendStatus(404); return; }
    try {
      const result = await db.query(
        `INSERT INTO jar_orders (case_id, code)
         SELECT id, $3 FROM cases WHERE id = $1 AND owner_id = $2
         ON CONFLICT (case_id) DO UPDATE SET case_id = EXCLUDED.case_id
         RETURNING code, amount_kopecks, confirmed_at, manual_unlocked_at`,
        [id.data, res.locals.uid, `GF-${randomBytes(5).toString("hex").toUpperCase()}`],
      );
      if (!result.rowCount) { res.sendStatus(404); return; }
      const row = result.rows[0];
      const legacy = await db.query("SELECT 1 FROM grant_preparation_pilot WHERE case_id = $1 AND confirmed_at IS NOT NULL LIMIT 1", [id.data]);
      let available = false;
      try { available = process.env.MONOBANK_JAR_ENABLED === "true" && Boolean(config && config.secret.length >= 32 && config.accountId && config.jarUrl && new URL(config.jarUrl).protocol === "https:"); } catch { /* invalid URL */ }
      res.json({ state: row.confirmed_at || row.manual_unlocked_at || legacy.rowCount ? "active" : "pending", code: row.code, jarUrl: available ? config?.jarUrl : "", available, amountKopecks: row.amount_kopecks, confirmedAt: row.confirmed_at, manuallyUnlockedAt: row.manual_unlocked_at });
    } catch { res.sendStatus(503); }
  };
  router.get("/:id/payment", handler);
  router.post("/:id/payment", handler);
  return router;
}
