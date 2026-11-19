import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { buildDialogueQuery, classifyDialogue } from "../src/advisor-dialogue.js";
import { advisorRouter, nextQuestion } from "../src/advisor.js";

test("turn classification preserves context without searching complaint or prior topic", () => {
  assert.equal(classifyDialogue("чому ти зразу не шукаєш?"), "complaint");
  assert.equal(buildDialogueQuery("чому ти зразу не шукаєш?", "хочу ППО brave1").query, "хочу ППО brave1");
  assert.equal(buildDialogueQuery("Львів", "кав'ярня").query, "кав'ярня Львів");
  assert.equal(buildDialogueQuery("а тепер сад", "кав'ярня").query, "а тепер сад");
  assert.equal(classifyDialogue("що таке Brave1?"), "information");
  assert.equal(classifyDialogue("насправді сума 50 тисяч"), "correction");
  assert.equal(nextQuestion("brave1", [], false), "Яка орієнтовна сума вам потрібна?");
});

test("provider failure is exposed and conversation never writes profile", async () => {
  const queries: string[] = [];
  const db = { query: async (sql: string, args: unknown[]) => {
    queries.push(sql);
    if (sql.startsWith("SELECT * FROM advisor_messages WHERE id")) return { rowCount: 0, rows: [] };
    if (sql.startsWith("SELECT question,reply,payload")) return { rowCount: 0, rows: [] };
    if (sql.startsWith("SELECT business_name")) return { rowCount: 1, rows: [{ businessName: "", description: "", region: "", details: { phone: "private", industry: "сфера" } }] };
    if (sql.startsWith("INSERT INTO advisor_messages")) return { rowCount: 1, rows: [{ id: args[0], conversation_id: args[1], owner_id: args[2], question: args[3], reply: args[4], payload: JSON.parse(args[5] as string) }] };
    throw Error(`unexpected query ${sql}`);
  }};
  const app = express(); app.use(express.json()); app.use((_req, res, next) => { res.locals.uid = "owner"; next(); });
  app.use(advisorRouter(db as never, async (snapshot) => {
    assert(!JSON.stringify(snapshot).includes("private"));
    throw Error("offline");
  }));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const address = server.address(); if (!address || typeof address === "string") throw Error();
    const response = await fetch(`http://127.0.0.1:${address.port}/`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: crypto.randomUUID(), conversationId: crypto.randomUUID(), message: "Хочу кав'ярню у Львові" }) });
    assert.equal(response.status, 200);
    const body = await response.json() as { message: { mode: string; fallbackReason: string; profileUpdated?: boolean } };
    assert.equal(body.message.mode, "guided"); assert.equal(body.message.fallbackReason, "provider_error");
    assert.notEqual(body.message.profileUpdated, true);
    assert(!queries.some((sql) => /^(?:UPDATE|INSERT INTO) profiles/.test(sql.trim())));
  } finally { server.close(); }
});
