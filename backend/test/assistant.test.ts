import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Pool } from "pg";
import { assistantRouter, type AssistantResponder } from "../src/assistant.js";

const id = "7e4b2e29-5b26-42dd-b21d-9ec2be62b4f2";
async function setup(responder?: AssistantResponder, timeout = 100, failSave = false, history: { question: string; reply: string; revision: number; profile_revision: number | null }[] = []) {
  let revision = 1;
  const db = { query: async (sql: string, values: string[]) => {
    if (sql.startsWith("SELECT business_name")) return { rowCount: 1, rows: [{ businessName: "Business", description: "Description", region: "Kyiv", revision: 1, details: { contactName: "Private", phone: "Private", website: "https://example.com", city: "Kyiv" } }] };
    if (sql.startsWith("SELECT question, reply, revision, profile_revision FROM assistant_exchanges")) return { rowCount: history.length, rows: [...history] };
    if (sql.startsWith("WITH inserted") && failSave) throw new Error("database details");
    if (sql.startsWith("WITH inserted")) return { rowCount: 1, rows: [{ id: values[0], question: values[3], reply: values[4], revision: values[5], profile_revision: values[6], current_profile_revision: 1, created_at: "2026-11-14T00:00:00.000Z", current_revision: revision }] };
    if (values[0] !== id || values[1] !== "owner") return { rowCount: 0, rows: [] };
    return { rowCount: 1, rows: [sql.startsWith("SELECT revision") ? { revision } : { title: "Проєкт", revision, details: {}, items: [], total_kopecks: "0" }] };
  } } as unknown as Pool;
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { const uid = req.header("x-test-user"); if (!uid) { res.sendStatus(401); return; } res.locals.uid = uid; next(); });
  app.use(responder ? assistantRouter(db, responder, timeout) : assistantRouter(db));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const call = (user: string | undefined, path = id, body: unknown = { expectedRevision: 1, message: "Порада" }) => fetch(`http://127.0.0.1:${port}/${path}/assistant`, { method: "POST", headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}) }, body: JSON.stringify(body) });
  return { call, close: () => new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve())), update: () => { revision++; } };
}

test("owner, revision, validation and unavailable boundaries precede generation", async () => {
  const s = await setup();
  try {
    assert.equal((await s.call(undefined)).status, 401);
    assert.equal((await s.call("other")).status, 404);
    assert.equal((await s.call("owner", crypto.randomUUID())).status, 404);
    assert.equal((await s.call("owner", id, { expectedRevision: 0, message: "x" })).status, 409);
    assert.equal((await s.call("owner", id, { expectedRevision: 1, message: " " })).status, 400);
    const unavailable = await s.call("owner");
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { error: "assistant_unavailable" });
  } finally { await s.close(); }
});

test("response records the snapshot revision and detects concurrent edits; cooldown applies", async () => {
  let change = () => {};
  const s = await setup(async () => { change(); return "Відповідь"; }); change = s.update;
  try {
    const response = await s.call("owner");
    assert.equal(response.status, 200);
    const data = await response.json() as { reply: string; revision: number; stale: boolean; exchange: { id: string; question: string; reply: string; revision: number; createdAt: string; stale: boolean } };
    assert.equal(data.reply, "Відповідь"); assert.equal(data.revision, 1); assert.equal(data.stale, true);
    assert.deepEqual(data.exchange, { id: data.exchange.id, question: "Порада", reply: "Відповідь", revision: 1, createdAt: "2026-11-14T00:00:00.000Z", stale: true });
    assert.equal((await s.call("owner", id, { expectedRevision: 2, message: "ще" })).status, 429);
  } finally { await s.close(); }
});

test("upstream failure and timeout return bounded errors", async () => {
  const failure = await setup(async () => { throw new Error("secret upstream details"); });
  try { const r = await failure.call("owner"); assert.equal(r.status, 502); assert.deepEqual(await r.json(), { error: "assistant_error" }); } finally { await failure.close(); }
  const timeout = await setup(async () => new Promise<string>(() => {}), 20);
  try { assert.equal((await timeout.call("owner")).status, 504); } finally { await timeout.close(); }
});


test("save failure reports an error without returning an unsaved answer", async () => {
  const s = await setup(async () => "Unsaved answer", 100, true);
  try { const response = await s.call("owner"); assert.equal(response.status, 500); assert.deepEqual(await response.json(), { error: "assistant_save_failed" }); }
  finally { await s.close(); }
});

test("assistant snapshot excludes contact fields", async () => {
  const s = await setup(async (snapshot) => {
    assert.deepEqual(snapshot.businessProfile, { businessName: "Business", description: "Description", region: "Kyiv", details: { city: "Kyiv" } });
    return "OK";
  });
  try { assert.equal((await s.call("owner")).status, 200); } finally { await s.close(); }
});


test("assistant receives bounded chronological history with stale and truncated markers", async () => {
  const history = [
    { question: "new", reply: "recent", revision: 1, profile_revision: 1 },
    { question: "old", reply: "x".repeat(3001), revision: 0, profile_revision: 1 },
  ];
  const s = await setup(async (snapshot) => {
    assert.deepEqual(snapshot.conversation, [
      { question: "old", reply: "x".repeat(3000), revision: 0, stale: true, truncated: true },
      { question: "new", reply: "recent", revision: 1, stale: false, truncated: false },
    ]);
    return "OK";
  }, 100, false, history);
  try { assert.equal((await s.call("owner")).status, 200); } finally { await s.close(); }
});
