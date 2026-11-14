import test from "node:test";
import assert from "node:assert/strict";
import { configuredGeminiResponder } from "../src/gemini.js";
import { grantSourceContext } from "../src/grant-sources.js";

test("configuredGeminiResponder returns undefined when API key is missing or model is invalid", () => {
  const origKey = process.env.GEMINI_API_KEY;
  const origModel = process.env.GEMINI_MODEL;
  try {
    delete process.env.GEMINI_API_KEY;
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    assert.equal(configuredGeminiResponder(), undefined);

    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "gemini-1.5-pro";
    assert.equal(configuredGeminiResponder(), undefined);
  } finally {
    if (origKey !== undefined) process.env.GEMINI_API_KEY = origKey;
    else delete process.env.GEMINI_API_KEY;
    if (origModel !== undefined) process.env.GEMINI_MODEL = origModel;
    else delete process.env.GEMINI_MODEL;
  }
});

test("configuredGeminiResponder sends exact POST header/body and includes budget/history/source", async () => {
  const origKey = process.env.GEMINI_API_KEY;
  const origModel = process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY = "secret-gemini-key";
  delete process.env.GEMINI_MODEL;

  let requestedUrl = "";
  let requestOptions: any = {};

  const stubFetch = async (url: string | URL, options?: any) => {
    requestedUrl = String(url);
    requestOptions = options;
    return new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [{ text: "Це відповідь асистента" }],
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  try {
    const responder = configuredGeminiResponder(stubFetch as any);
    assert.ok(responder);

    const snapshot = {
      title: "Мій бізнес",
      revision: 2,
      details: { sector: "IT" },
      items: [{ name: "Ноутбук", amount: 30000 }],
      total_kopecks: "3000000",
      conversation: [{ question: "Попереднє", reply: "Попередня відповідь", revision: 2, stale: false, truncated: false }],
    };

    const controller = new AbortController();
    const reply = await responder(snapshot, "Як покращити заявку?", controller.signal);

    assert.equal(reply, "Це відповідь асистента");
    assert.equal(requestedUrl, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    assert.equal(requestOptions.method, "POST");
    assert.equal(requestOptions.headers["content-type"], "application/json");
    assert.equal(requestOptions.headers["x-goog-api-key"], "secret-gemini-key");
    assert.equal(requestOptions.redirect, "error");
    assert.equal(requestOptions.signal, controller.signal);

    const parsedBody = JSON.parse(requestOptions.body);
    assert.ok(parsedBody.systemInstruction);
    assert.ok(parsedBody.contents);
    assert.equal(parsedBody.generationConfig.maxOutputTokens, 1200);

    const userText = parsedBody.contents[0].parts[0].text;
    const parsedUserJson = JSON.parse(userText);
    assert.deepEqual(parsedUserJson.savedCase, snapshot);
    assert.equal(parsedUserJson.question, "Як покращити заявку?");
    assert.deepEqual(parsedUserJson.grantSourceContext, grantSourceContext);
  } finally {
    if (origKey !== undefined) process.env.GEMINI_API_KEY = origKey;
    else delete process.env.GEMINI_API_KEY;
    if (origModel !== undefined) process.env.GEMINI_MODEL = origModel;
    else delete process.env.GEMINI_MODEL;
  }
});

test("refusal, truncated, empty or non200 responses throw upstream error", async () => {
  const origKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";

  const makeStub = (status: number, body: unknown) =>
    async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

  try {
    let resp = configuredGeminiResponder(makeStub(500, { error: "internal" }) as any);
    await assert.rejects(() => resp!({} as any, "q", new AbortController().signal), /upstream/);

    resp = configuredGeminiResponder(
      makeStub(200, {
        candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "part" }] } }],
      }) as any
    );
    await assert.rejects(() => resp!({} as any, "q", new AbortController().signal), /upstream/);

    resp = configuredGeminiResponder(
      makeStub(200, {
        candidates: [{ finishReason: "STOP", content: { parts: [] } }],
      }) as any
    );
    await assert.rejects(() => resp!({} as any, "q", new AbortController().signal), /upstream/);
  } finally {
    if (origKey !== undefined) process.env.GEMINI_API_KEY = origKey;
    else delete process.env.GEMINI_API_KEY;
  }
});

test("excessive response body throws upstream error", async () => {
  const origKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";

  const hugeText = "a".repeat(70000);
  const stubFetch = async () =>
    new Response(
      JSON.stringify({
        candidates: [{ finishReason: "STOP", content: { parts: [{ text: hugeText }] } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  try {
    const resp = configuredGeminiResponder(stubFetch as any);
    await assert.rejects(() => resp!({} as any, "q", new AbortController().signal), /upstream/);
  } finally {
    if (origKey !== undefined) process.env.GEMINI_API_KEY = origKey;
    else delete process.env.GEMINI_API_KEY;
  }
});


test("response stream is cancelled at the byte limit before reading the full body", async () => {
  const original = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  let cancelled = false;
  let reads = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { reads++; controller.enqueue(new Uint8Array(40000)); },
    cancel() { cancelled = true; },
  });
  try {
    const responder = configuredGeminiResponder((async () => new Response(stream)) as typeof fetch)!;
    await assert.rejects(() => responder({} as never, "q", new AbortController().signal), /upstream/);
    assert.equal(cancelled, true);
    assert.ok(reads <= 3);
  } finally {
    if (original === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = original;
  }
});

test("only complete visible text parts are returned; blocked or incomplete replies are rejected", async () => {
  const original = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  const invoke = (body: unknown) => configuredGeminiResponder((async () => Response.json(body)) as typeof fetch)!({} as never, "q", new AbortController().signal);
  try {
    assert.equal(await invoke({ candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "private reasoning" }, { text: "Перша " }, { text: "друга." }] } }] }), "Перша друга.");
    await assert.rejects(() => invoke({ candidates: [{ content: { parts: [{ text: "incomplete" }] } }] }), /upstream/);
    await assert.rejects(() => invoke({ promptFeedback: { blockReason: "SAFETY" }, candidates: [{ finishReason: "STOP", content: { parts: [{ text: "blocked" }] } }] }), /upstream/);
  } finally {
    if (original === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = original;
  }
});
