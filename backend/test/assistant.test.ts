import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Pool } from "pg";
import { assistantRouter, configuredResponder, type AssistantResponder } from "../src/assistant.js";

const id = "7e4b2e29-5b26-42dd-b21d-9ec2be62b4f2";
async function setup(responder?: AssistantResponder, timeout = 100) {
  let revision = 1;
  const db = { query: async (sql: string, values: string[]) => {
    if (values[0] !== id || values[1] !== "owner") return { rowCount: 0, rows: [] };
    return { rowCount: 1, rows: [sql.startsWith("SELECT revision") ? { revision } : { title: "Проєкт", revision, details: {}, items: [], total_kopecks: "0" }] };
  } } as unknown as Pool;
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { const uid = req.header("x-test-user"); if (!uid) { res.sendStatus(401); return; } res.locals.uid = uid; next(); });
  app.use(assistantRouter(db, responder ?? null, timeout));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const call = (user: string | undefined, path = id, body: unknown = { expectedRevision: 1, message: "Порада" }) => fetch(`http://127.0.0.1:${port}/${path}/assistant`, { method: "POST", headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}) }, body: JSON.stringify(body) });
  return { call, close: () => new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve())), update: () => { revision++; } };
}

test("configuration accepts only the explicitly configured local free route", () => {
  assert.equal(configuredResponder({}), undefined);
  assert.equal(configuredResponder({ OPENAI_COMPATIBLE_BASE_URL: "http://example.com:20128/v1", ASSISTANT_API_KEY: "x", ASSISTANT_MODEL: "grantfolio-free" }), undefined);
  assert.equal(configuredResponder({ OPENAI_COMPATIBLE_BASE_URL: "http://localhost:20128/v1", ASSISTANT_API_KEY: "x", ASSISTANT_MODEL: "paid" }), undefined);
  assert.equal(typeof configuredResponder({ OPENAI_COMPATIBLE_BASE_URL: "http://localhost:20128/v1", ASSISTANT_API_KEY: "x", ASSISTANT_MODEL: "grantfolio-free" }), "function");
});

test("owner, revision, validation and unavailable boundaries precede generation", async () => {
  const s = await setup();
  try {
    assert.equal((await s.call(undefined)).status, 401);
    assert.equal((await s.call("other")).status, 404);
    assert.equal((await s.call("owner", crypto.randomUUID())).status, 404);
    assert.equal((await s.call("owner", id, { expectedRevision: 0, message: "x" })).status, 409);
    assert.equal((await s.call("owner", id, { expectedRevision: 1, message: " " })).status, 400);
    assert.equal((await s.call("owner")).status, 503);
  } finally { await s.close(); }
});

test("response records the snapshot revision and detects concurrent edits; cooldown applies", async () => {
  let change = () => {};
  const s = await setup(async () => { change(); return "Відповідь"; }); change = s.update;
  try {
    const response = await s.call("owner");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { reply: "Відповідь", revision: 1, stale: true });
    assert.equal((await s.call("owner", id, { expectedRevision: 2, message: "ще" })).status, 429);
  } finally { await s.close(); }
});

test("upstream failure and timeout return bounded errors", async () => {
  const failure = await setup(async () => { throw new Error("secret upstream details"); });
  try { const r = await failure.call("owner"); assert.equal(r.status, 502); assert.deepEqual(await r.json(), { error: "assistant_error" }); } finally { await failure.close(); }
  const timeout = await setup(async () => new Promise<string>(() => {}), 20);
  try { assert.equal((await timeout.call("owner")).status, 504); } finally { await timeout.close(); }
});
