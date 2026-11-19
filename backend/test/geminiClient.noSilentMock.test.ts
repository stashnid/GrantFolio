import { test } from "node:test";
import assert from "node:assert/strict";
import { isMockAllowed, getAiConfig } from "../src/ai/aiConfig.js";
import { runAgentOrchestrator } from "../src/ai/agentOrchestrator.js";
import { callGeminiGenerate } from "../src/ai/geminiClient.js";

test("isMockAllowed returns false in development/production when ALLOW_AI_MOCK is not set", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalAllowMock = process.env.ALLOW_AI_MOCK;

  try {
    delete process.env.ALLOW_AI_MOCK;

    process.env.NODE_ENV = "development";
    assert.equal(isMockAllowed(), false, "Development must not allow silent mocks");

    process.env.NODE_ENV = "production";
    assert.equal(isMockAllowed(), false, "Production must not allow silent mocks");

    process.env.NODE_ENV = "test";
    assert.equal(isMockAllowed(), true, "Test mode allows deterministic offline mocks");

    process.env.NODE_ENV = "development";
    process.env.ALLOW_AI_MOCK = "true";
    assert.equal(isMockAllowed(), true, "Explicit ALLOW_AI_MOCK=true allows mocks in dev");
  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalAllowMock !== undefined) {
      process.env.ALLOW_AI_MOCK = originalAllowMock;
    } else {
      delete process.env.ALLOW_AI_MOCK;
    }
  }
});

test("callGeminiGenerate throws explicit error and does not return silent mock when unconfigured", async () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalVertex = process.env.GEMINI_VERTEX_PROJECT;
  const originalEnv = process.env.NODE_ENV;
  const originalAllowMock = process.env.ALLOW_AI_MOCK;

  try {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_VERTEX_PROJECT;
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_AI_MOCK;

    await assert.rejects(
      async () => {
        await callGeminiGenerate({
          contents: [{ role: "user", parts: [{ text: "Привіт" }] }],
        });
      },
      /No Gemini API key or Vertex AI project configured/i,
      "callGeminiGenerate must throw when unconfigured, never mock silently"
    );
  } finally {
    if (originalApiKey) process.env.GEMINI_API_KEY = originalApiKey;
    if (originalVertex) process.env.GEMINI_VERTEX_PROJECT = originalVertex;
    process.env.NODE_ENV = originalEnv;
    if (originalAllowMock) process.env.ALLOW_AI_MOCK = originalAllowMock;
  }
});

test("runAgentOrchestrator informs user of unconfigured AI in production instead of silent mock", async () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalVertex = process.env.GEMINI_VERTEX_PROJECT;
  const originalEnv = process.env.NODE_ENV;
  const originalAllowMock = process.env.ALLOW_AI_MOCK;

  try {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_VERTEX_PROJECT;
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_AI_MOCK;

    const result = await runAgentOrchestrator({
      userMessage: "хочу відкрити майстерню для дронів",
    });

    assert.match(
      result.reply_text,
      /AI-провайдер не налаштований|GEMINI_API_KEY/i,
      "Production must return explicit setup instructions instead of falling back to offline mock"
    );
    assert.equal(result.attached_grants.length, 0);
  } finally {
    if (originalApiKey) process.env.GEMINI_API_KEY = originalApiKey;
    if (originalVertex) process.env.GEMINI_VERTEX_PROJECT = originalVertex;
    process.env.NODE_ENV = originalEnv;
    if (originalAllowMock) process.env.ALLOW_AI_MOCK = originalAllowMock;
  }
});

test("runAgentOrchestrator in test mode distinguishes drone workshop from air defense without raw IDs", async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";

  try {
    const workshopResult = await runAgentOrchestrator({
      userMessage: "хочу відкрити майстерню для дронів",
      fetchImpl: fetch,
    });

    assert.match(workshopResult.reply_text, /Власна справа/i);
    assert.match(workshopResult.reply_text, /Brave1/i);
    assert.doesNotMatch(
      workshopResult.reply_text,
      /ua-brave1-core/,
      "Must not expose raw program id `ua-brave1-core` to user"
    );
    assert.doesNotMatch(
      workshopResult.reply_text,
      /приватне ппо/i,
      "Drone workshop must not trigger private air defense mock"
    );

    const greetingResult = await runAgentOrchestrator({
      userMessage: "Привіт!",
      fetchImpl: fetch,
    });
    assert.match(greetingResult.reply_text, /AI-консультант|привіт|грант|бізнес|розробк/i);
    assert.equal(
      greetingResult.attached_grants.length,
      0,
      "Greeting must not attach unasked grant cards"
    );
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});
