import test from "node:test";
import assert from "node:assert/strict";
import { applicationDefault } from "firebase-admin/app";
import { configuredGeminiResponder } from "../src/gemini.js";
import { grantSourceContext } from "../src/grant-sources.js";

test("Vertex configuration uses the EU endpoint and only the runtime bearer token", async (t) => {
  const previousProject = process.env.GEMINI_VERTEX_PROJECT;
  const previousKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_MODEL;
  t.after(() => {
    for (const [name, value] of [
      ["GEMINI_VERTEX_PROJECT", previousProject],
      ["GEMINI_API_KEY", previousKey],
      ["GEMINI_MODEL", previousModel],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  process.env.GEMINI_VERTEX_PROJECT = "test-grantfolio";
  process.env.GEMINI_API_KEY = "unused-key";
  process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
  t.mock.method(applicationDefault(), "getAccessToken", async () => ({
    access_token: "test-token",
    expires_in: 3600,
  }));
  const respond = configuredGeminiResponder(async (url, options) => {
    assert.equal(url, "https://aiplatform.eu.rep.googleapis.com/v1/projects/test-grantfolio/locations/eu/publishers/google/models/gemini-3.5-flash-lite:generateContent");
    const headers = new Headers(options?.headers);
    assert.equal(headers.get("authorization"), "Bearer test-token");
    assert.equal(headers.has("x-goog-api-key"), false);
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Готово" }] } }] });
  });
  assert.equal(await respond!({ mode: "discovery" } as never, "Тест", new AbortController().signal), "Готово");
});

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
      program_id: "vlasna-sprava",
      revision: 2,
      profileRevision: 0,
      details: { sector: "IT" },
      items: [{ name: "Ноутбук", amount: 30000 }],
      total_kopecks: "3000037",
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
    assert.equal(parsedUserJson.savedBudgetTotalUah, "30000,37 грн");
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

test("discovery model receives business-only scope and no assumed student age", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "mock-only-key";
  try {
    let prompt = "";
    const respond = configuredGeminiResponder(async (_url, options) => {
      prompt = JSON.parse(String(options?.body)).systemInstruction.parts[0].text;
      return new Response(JSON.stringify({candidates:[{finishReason:"STOP",content:{parts:[{text:"Яку справу хочете розпочати?"}]}}]}), {status:200});
    });
    assert(respond);
    await respond({mode:"discovery",title:"Підбір",revision:0,profileRevision:0,details:{},items:[],total_kopecks:"0"}, "Гранти для студентів", new AbortController().signal);
    assert.match(prompt, /фінансування бізнесу/);
    assert.match(prompt, /Не визначай вік за статусом студента/);
    assert.match(prompt, /особисте навчання поза сферою/);
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});


test("unbound project sends no assumed program or source context", async () => {
  const old = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  let payload: any;
  const stub = async (_url: unknown, options: any) => {
    payload = JSON.parse(options.body);
    return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Добре" }] } }] }));
  };
  try {
    await configuredGeminiResponder(stub as any)!({ title: "Проєкт", program_id: null, revision: 0, profileRevision: 0, details: {}, items: [], total_kopecks: "0" }, "Порадь", new AbortController().signal);
    const context = JSON.parse(payload.contents[0].parts[0].text);
    assert.equal(context.targetProgram, null);
    assert.equal(context.grantSourceContext, null);
    assert.match(payload.systemInstruction.parts[0].text, /програму не обрано/);
  } finally { if (old === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old; }
});
