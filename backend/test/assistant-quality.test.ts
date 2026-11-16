import test from "node:test";
import assert from "node:assert/strict";
import { configuredGeminiResponder } from "../src/gemini.js";

test("assistant guidance treats program conditions and old conversation as uncertain", async () => {
  const original = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.GEMINI_MODEL;
  let instruction = "";
  try {
    const responder = configuredGeminiResponder((async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      instruction = body.systemInstruction.parts[0].text;
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "OK" }] } }] });
    }) as typeof fetch)!;
    await responder({ title: "Case", revision: 2, profileRevision: 0, details: {}, items: [], total_kopecks: "0", conversation: [{ question: "Old", reply: "Old answer", revision: 1, stale: true, truncated: false }] }, "Question", new AbortController().signal);
    assert.doesNotMatch(instruction, /оренда до 25%|матеріали до 50%/i);
    assert.match(instruction, /застаріл/i);
    assert.match(instruction, /не вигадуй/i);
  } finally {
    if (original === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = original;
    if (originalModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = originalModel;
  }
});
