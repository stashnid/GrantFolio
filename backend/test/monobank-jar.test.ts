import assert from "node:assert/strict";
import { test } from "node:test";
import { eligibleJarPayment, jarCodes } from "../src/monobank-jar.js";

test("extracts normalized unique codes and rejects ambiguous matches", () => {
  assert.deepEqual(jarCodes("gf-12аbсdef90 GF-12ABCDEF90"), ["GF-12ABCDEF90"]);
  assert.equal(jarCodes("GF-12ABCDEF90 GF-9876543210").length, 2);
  assert.deepEqual(jarCodes("GF-12ABCDEF901"), []);
});

test("only settled UAH transfers for the account after order creation qualify", () => {
  const item = { id: "id", time: 200, amount: 500, currencyCode: 980, hold: false, comment: "", description: "" };
  const created = new Date(100_000);
  assert(eligibleJarPayment(item, "account", "account", created));
  for (const change of [{ amount: 499 }, { currencyCode: 840 }, { hold: true }, { time: 99 }]) {
    assert(!eligibleJarPayment({ ...item, ...change }, "account", "account", created));
  }
  assert(!eligibleJarPayment(item, "other", "account", created));
  assert(eligibleJarPayment({ ...item, time: 100 }, "account", "account", new Date(100_999)));
});

test("PostgreSQL webhook transactions are idempotent and isolate owners", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const { default: pg } = await import("pg");
  const { default: express } = await import("express");
  const { once } = await import("node:events");
  const { readFile } = await import("node:fs/promises");
  const { monobankJarWebhookRouter, jarAccessRouter } = await import("../src/monobank-jar.js");
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const schema = `jar_test_${crypto.randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
  try {
    await db.query("CREATE TABLE cases (id UUID PRIMARY KEY, owner_id TEXT NOT NULL)");
    await db.query("CREATE TABLE grant_preparation_pilot (case_id UUID, confirmed_at TIMESTAMPTZ)");
    await db.query(await readFile(new URL("../migrations/025_monobank_jar.sql", import.meta.url), "utf8"));
    const caseId = crypto.randomUUID(), otherId = crypto.randomUUID();
    await db.query("INSERT INTO cases VALUES ($1, 'owner'), ($2, 'other')", [caseId, otherId]);
    const config = { secret: "s".repeat(32), accountId: "account", jarUrl: "https://send.monobank.ua/jar/example" };
    const app = express();
    app.use("/hook", monobankJarWebhookRouter(db, config));
    app.use("/cases", (_req, res, next) => { res.locals.uid = "owner"; next(); }, jarAccessRouter(db, config));
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test address");
    const base = `http://127.0.0.1:${address.port}`;
    const order = await (await fetch(`${base}/cases/${caseId}/payment`)).json() as { code: string; state: string };
    assert.equal(order.state, "pending");
    assert.equal((await fetch(`${base}/cases/${otherId}/payment`)).status, 404);
    const send = (id: string, amount: number, comment: string) => fetch(`${base}/hook/${config.secret}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "StatementItem", data: { account: "account", statementItem: { id, time: Math.floor(Date.now() / 1000), amount, currencyCode: 980, hold: false, comment } } }) });
    assert.equal((await send("under", 499, order.code)).status, 200);
    assert.equal((await send("unknown", 500, "GF-0000000000")).status, 200);
    assert.equal((await (await fetch(`${base}/cases/${caseId}/payment`)).json() as { state: string }).state, "pending");
    assert.equal((await send("paid", 500, order.code)).status, 200);
    assert.equal((await send("paid", 500, order.code)).status, 200);
    assert.equal((await (await fetch(`${base}/cases/${caseId}/payment`)).json() as { state: string }).state, "active");
    const payments = await db.query("SELECT id, status FROM jar_payments ORDER BY id");
    assert.deepEqual(payments.rows, [{ id: "paid", status: "confirmed" }, { id: "under", status: "ignored" }, { id: "unknown", status: "ignored" }]);
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await db.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});

test("webhook accepts duplicates and ignores underpayments and unknown codes", async t => {
  const { default: express } = await import("express");
  const { once } = await import("node:events");
  const { monobankJarWebhookRouter } = await import("../src/monobank-jar.js");
  const payments = new Map<string, string>();
  let confirmed = 0;
  const client = {
    async query(sql: string, args: unknown[] = []) {
      if (sql.includes("INSERT INTO jar_payments")) {
        const id = String(args[0]);
        if (payments.get(id) === "confirmed") return { rowCount: 0, rows: [] };
        payments.set(id, "ignored"); return { rowCount: 1, rows: [{ id }] };
      }
      if (sql.includes("SELECT created_at")) return args[0] === "GF-1234567890" ? { rowCount: 1, rows: [{ created_at: new Date(0), amount_kopecks: 500 }] } : { rowCount: 0, rows: [] };
      if (sql.includes("UPDATE jar_orders")) confirmed++;
      if (sql.includes("UPDATE jar_payments")) payments.set(String(args[0]), "confirmed");
      return { rowCount: 1, rows: [] };
    }, release() {},
  };
  const db = { connect: async () => client } as unknown as import("pg").Pool;
  const config = { secret: "s".repeat(32), accountId: "account" };
  const app = express(); app.use("/hook", monobankJarWebhookRouter(db, config));
  const server = app.listen(0, "127.0.0.1");
  try { await once(server, "listening"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "EPERM") { t.skip("Local socket binding is unavailable"); return; } throw error; }
  try {
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing address");
    const send = (id: string, amount: number, comment: string) => fetch(`http://127.0.0.1:${address.port}/hook/${config.secret}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "StatementItem", data: { account: "account", statementItem: { id, time: 100, amount, currencyCode: 980, hold: false, comment } } }) });
    for (const [id, amount, code] of [["under", 499, "GF-1234567890"], ["unknown", 500, "GF-0000000000"], ["paid", 500, "GF-1234567890"], ["paid", 500, "GF-1234567890"]] as const) assert.equal((await send(id, amount, code)).status, 200);
    assert.equal(confirmed, 1);
    assert.deepEqual([...payments.values()], ["ignored", "ignored", "confirmed"]);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
