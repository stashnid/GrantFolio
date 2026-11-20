import test from "node:test";
import assert from "node:assert/strict";
import { runAgentOrchestrator } from "../src/ai/agentOrchestrator.js";
import { hybridSearchGrants } from "../src/matching/hybridSearch.js";
import { GRANT_CATALOG } from "../src/grant-catalog-data.js";

test("hybridSearch matches slang and specialized queries to correct flagship programs", async () => {
  // Test case 1: 'приватне ППО' / 'антидрон' -> ua-brave1-core
  const ppoResults = await hybridSearchGrants({
    semanticQuery: "Хочу зробити приватне ППО та антидрон систему для захисту підприємства",
    keywords: ["defense tech", "РЕБ", "ППО", "антидрон"],
  });
  assert.ok(ppoResults.length > 0);
  assert.equal(ppoResults[0].program_id, "ua-brave1-core");
  assert.equal(ppoResults[0].support_tier, "deep");

  // Test case 2: 'цех заморозки' -> processing-business
  const processingResults = await hybridSearchGrants({
    semanticQuery: "цех заморозки ягід та овочів",
    keywords: ["переробка", "виробництво", "заморозка"],
  });
  assert.ok(processingResults.some((r) => r.program_id === "processing-business"));

  // Test case 3: 'кав'ярня на районі' -> vlasna-sprava
  const coffeeResults = await hybridSearchGrants({
    semanticQuery: "кав'ярня на районі та пекарня",
    keywords: ["кафе", "пекарня", "старт бізнесу"],
  });
  assert.ok(coffeeResults.some((r) => r.program_id === "vlasna-sprava"));
});

test("Assistant agent responds to 'приватне ППО' with Brave1, regulatory guidance and clarifying question", async () => {
  const result = await runAgentOrchestrator({
    userMessage: "Хочу зробити приватне ППО для захисту свого підприємства від дронів",
  });

  // Must find and attach Brave1
  assert.ok(result.attached_grants.some((g) => g.program_id === "ua-brave1-core"));

  // Must not have cliché greeting
  assert.ok(!result.reply_text.startsWith("Вітаю!"));
  assert.ok(!result.reply_text.startsWith("Доброго дня!"));

  // Must mention Brave1 and regulatory constraints
  assert.match(result.reply_text, /Brave1|ua-brave1-core/i);
  assert.match(result.reply_text, /регуляторн|збро|законодавств|оборонн|dual-use|експертиз/i);

  // Must contain tool trace for search_grants
  assert.ok(result.tool_trace.some((t) => t.tool === "search_grants"));
});

test("Multi-turn conversation does not repeat greeting in follow-up turns", async () => {
  const history: { role: "user" | "model"; text: string }[] = [
    { role: "user", text: "Планую відкрити крафтову пекарню у Львові" },
    { role: "model", text: "Для крафтової пекарні найкраще підійде «Власна справа». Яке обладнання плануєте закупити?" },
  ];

  const turn2 = await runAgentOrchestrator({
    userMessage: "Потрібна подове піч та тістоміс, орієнтовно на 250 тис грн",
    history,
  });

  assert.ok(!turn2.reply_text.startsWith("Вітаю"));
  assert.ok(!turn2.reply_text.startsWith("Доброго"));
  assert.ok(!turn2.reply_text.includes("Вітаю! Я знайшов"));

  const turn3 = await runAgentOrchestrator({
    userMessage: "Чи можу я взяти в штат помічника пекаря?",
    history: [
      ...history,
      { role: "user", text: "Потрібна подове піч та тістоміс, орієнтовно на 250 тис грн" },
      { role: "model", text: turn2.reply_text },
    ],
  });

  assert.ok(!turn3.reply_text.startsWith("Вітаю"));
  assert.ok(!turn3.reply_text.startsWith("Доброго"));
});

test("Security: agent filters out non-existent program IDs and stages proposals without direct DB write", async () => {
  // Mock Gemini responding with a fake program ID and propose_structured_update
  let callCount = 0;
  const mockFetch: typeof fetch = async () => {
    callCount++;
    if (callCount === 1) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "search_grants",
                      args: { semanticQuery: "сонячні панелі" },
                    },
                  },
                  {
                    functionCall: {
                      name: "propose_structured_update",
                      args: {
                        target: "budget_item",
                        summary: "Додати сонячний інвертор",
                        patch: { name: "Інвертор 10 кВт", amountKopecks: 12000000 },
                      },
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: "Ось аналіз вашого проєкту. Рекомендую програму fake-solar-nonexistent-grant-99.",
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const result = await runAgentOrchestrator({
    userMessage: "Хочу встановити сонячні панелі",
    fetchImpl: mockFetch,
  });

  // Attached grants must strictly belong to real catalog, fake program must be excluded
  for (const grant of result.attached_grants) {
    assert.ok(GRANT_CATALOG.some((p) => p.id === grant.program_id));
  }
  assert.ok(!result.attached_grants.some((g) => g.program_id === "fake-solar-nonexistent-grant-99"));

  // Proposal must be staged in pending_proposals, not silently executed
  assert.equal(result.pending_proposals.length, 1);
  assert.equal(result.pending_proposals[0].target, "budget_item");
  assert.equal(result.pending_proposals[0].summary, "Додати сонячний інвертор");
});

test("Cargo transportation query does not substitute processing business and provides grounded alternative financing paths", async () => {
  const query = "я займаюсь перевезенням сипучих товарів грузовики машинами, які є гранти?";

  // 1. hybridSearchGrants check: processing-business must not match cargo transportation
  const searchResults = await hybridSearchGrants({
    semanticQuery: query,
    keywords: ["перевезення", "вантажні", "машини", "транспорт"],
  });
  assert.ok(
    !searchResults.some((r) => r.program_id === "processing-business"),
    "processing-business must not be returned for cargo logistics query"
  );

  // 2. Orchestrator response check
  const result = await runAgentOrchestrator({
    userMessage: query,
  });

  // Must never attach processing-business card
  assert.ok(
    !result.attached_grants.some((g) => g.program_id === "processing-business"),
    "Orchestrator must not attach processing-business card for cargo transport"
  );

  const reply = result.reply_text.toLowerCase();

  // Must mention reality of vehicle grants (no direct grant for buying regular trucks)
  assert.match(
    reply,
    /немає|не покрив|не фінанс|обмежен|не входять|не підход/i,
    "Should explain that direct grants for general road cargo vehicles do not exist"
  );

  // Must propose real financing alternatives (5-7-9, leasing, equipment for service base)
  assert.match(
    reply,
    /5-7-9|лізинг|кредит|баз|обладнан|обслуговуван/i,
    "Should propose realistic alternatives like 5-7-9%, leasing or maintenance base equipment"
  );

  // Must avoid authoritarian legal verdicts and fake donor waves
  assert.ok(!reply.includes("закон прямо забороняє"), "Must not use authoritarian phrase 'закон прямо забороняє'");
  assert.ok(!reply.includes("хвиля донорів") && !reply.includes("донорські хвилі"), "Must not invent fake donor waves");
  assert.ok(!reply.includes("переробне підприємство"), "Must not impose processing business on a trucking company");
});
