import test from "node:test";
import assert from "node:assert/strict";
import { getAiConfig, resolveModelForRole } from "../src/ai/aiConfig.js";
import { BASE_ASSISTANT_SYSTEM_PROMPT, buildAssistantSystemPrompt } from "../src/ai/prompts/assistantSystemPrompt.js";

test("aiConfig returns sensible defaults when env variables are unset", (t) => {
  const origChat = process.env.GEMINI_CHAT_MODEL;
  const origLegacy = process.env.GEMINI_MODEL;
  const origPro = process.env.GEMINI_PRO_MODEL;
  const origUtility = process.env.GEMINI_UTILITY_MODEL;
  const origEmbedding = process.env.GEMINI_EMBEDDING_MODEL;
  const origOverride = process.env.AI_ASSISTANT_SYSTEM_PROMPT_OVERRIDE;

  t.after(() => {
    if (origChat !== undefined) process.env.GEMINI_CHAT_MODEL = origChat; else delete process.env.GEMINI_CHAT_MODEL;
    if (origLegacy !== undefined) process.env.GEMINI_MODEL = origLegacy; else delete process.env.GEMINI_MODEL;
    if (origPro !== undefined) process.env.GEMINI_PRO_MODEL = origPro; else delete process.env.GEMINI_PRO_MODEL;
    if (origUtility !== undefined) process.env.GEMINI_UTILITY_MODEL = origUtility; else delete process.env.GEMINI_UTILITY_MODEL;
    if (origEmbedding !== undefined) process.env.GEMINI_EMBEDDING_MODEL = origEmbedding; else delete process.env.GEMINI_EMBEDDING_MODEL;
    if (origOverride !== undefined) process.env.AI_ASSISTANT_SYSTEM_PROMPT_OVERRIDE = origOverride; else delete process.env.AI_ASSISTANT_SYSTEM_PROMPT_OVERRIDE;
  });

  delete process.env.GEMINI_CHAT_MODEL;
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_PRO_MODEL;
  delete process.env.GEMINI_UTILITY_MODEL;
  delete process.env.GEMINI_EMBEDDING_MODEL;
  delete process.env.AI_ASSISTANT_SYSTEM_PROMPT_OVERRIDE;

  const config = getAiConfig();
  assert.equal(config.chatModel, "gemini-3.5-flash-lite");
  assert.equal(config.proModel, "gemini-3.5-flash-lite"); // falls back to chatModel
  assert.equal(config.utilityModel, "gemini-3.5-flash-lite");
  assert.equal(config.embeddingModel, "text-embedding-004");
  assert.equal(config.systemPromptOverride, undefined);

  assert.equal(resolveModelForRole("chat"), "gemini-3.5-flash-lite");
  assert.equal(resolveModelForRole("utility"), "gemini-3.5-flash-lite");
  assert.equal(resolveModelForRole("embedding"), "text-embedding-004");
});

test("aiConfig respects custom model overrides and systemPromptOverride", (t) => {
  const origChat = process.env.GEMINI_CHAT_MODEL;
  const origPro = process.env.GEMINI_PRO_MODEL;
  const origOverride = process.env.AI_ASSISTANT_SYSTEM_PROMPT_OVERRIDE;

  t.after(() => {
    if (origChat !== undefined) process.env.GEMINI_CHAT_MODEL = origChat; else delete process.env.GEMINI_CHAT_MODEL;
    if (origPro !== undefined) process.env.GEMINI_PRO_MODEL = origPro; else delete process.env.GEMINI_PRO_MODEL;
    if (origOverride !== undefined) process.env.AI_ASSISTANT_SYSTEM_PROMPT_OVERRIDE = origOverride; else delete process.env.AI_ASSISTANT_SYSTEM_PROMPT_OVERRIDE;
  });

  process.env.GEMINI_CHAT_MODEL = "gemini-2.0-flash";
  process.env.GEMINI_PRO_MODEL = "gemini-2.5-pro";
  process.env.AI_ASSISTANT_SYSTEM_PROMPT_OVERRIDE = "Custom behavior test directive";

  const config = getAiConfig();
  assert.equal(config.chatModel, "gemini-2.0-flash");
  assert.equal(config.proModel, "gemini-2.5-pro");
  assert.equal(config.systemPromptOverride, "Custom behavior test directive");

  const prompt = buildAssistantSystemPrompt({
    mode: "discovery",
    userProfile: { businessName: "АгроТех", region: "Полтавська область" },
    activeProject: { title: "Теплиця для полуниці", total_kopecks: "25000000" },
    financialSummary: { totalRevenueKopecks: 100000000, hasCashDeficit: false, breakevenMonth: 4 },
  });

  assert.ok(prompt.includes(BASE_ASSISTANT_SYSTEM_PROMPT));
  assert.ok(prompt.includes("Custom behavior test directive"));
  assert.ok(prompt.includes("АгроТех"));
  assert.ok(prompt.includes("Полтавська область"));
  assert.ok(prompt.includes("Теплиця для полуниці"));
  assert.ok(prompt.includes("250") && prompt.includes("грн"));
  assert.ok(prompt.includes("місяць 4"));
});
