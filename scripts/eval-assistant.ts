import { runAgentOrchestrator } from "../backend/src/ai/agentOrchestrator.js";
import { getAiConfig, isAiConfigured } from "../backend/src/ai/aiConfig.js";

async function main() {
  console.log("=== GrantFolio Assistant Live Evaluation ===");
  const config = getAiConfig();
  console.log(`Live AI configured: ${isAiConfigured()}`);
  console.log(`Chat model: ${config.chatModel}`);
  console.log(`Pro model: ${config.proModel}`);
  console.log("----------------------------------------------\n");

  const testCases = [
    {
      title: "Кейс 1: Приватне ППО / Антидрон",
      query: "Хочу зробити приватне ППО та антидронову систему для захисту промислового підприємства",
      expectedProgram: "ua-brave1-core",
      mustInclude: ["Brave1", "регуляторн"],
    },
    {
      title: "Кейс 2: Цех заморозки ягід (Переробка)",
      query: "Плануємо відкрити цех шокової заморозки ягід на 25 працівників, потрібно обладнання",
      expectedProgram: "processing-business",
      mustInclude: ["перероб"],
    },
    {
      title: "Кейс 3: Ветеранський грант на СТО",
      query: "Я ветеран бойових дій (УБД), хочу відкрити СТО, є 30% співфінансування",
      expectedProgram: "veteran-grant",
      mustInclude: ["ветеран"],
    },
    {
      title: "Кейс 4: Пекарня через Дія.Бізнес 250 тис. без працівників",
      query: "Хочу через Дія.Бізнес 250 тис. на пекарню, працюватиму сам без найму людей",
      expectedProgram: "vlasna-sprava",
      mustInclude: ["робочих місць", "Дія.Бізнес"],
    },
    {
      title: "Кейс 5: Пояснення документів та OPSEC для Brave1",
      query: "Які документи та чекліст потрібні для подання проєкту в Brave1?",
      expectedProgram: "ua-brave1-core",
      mustInclude: ["Project Brief", "OPSEC", "TRL"],
    },
  ];

  let passed = 0;

  for (const tc of testCases) {
    console.log(`▶ [Тест] ${tc.title}`);
    console.log(`  Запит: "${tc.query}"`);

    const start = Date.now();
    const result = await runAgentOrchestrator({
      userMessage: tc.query,
      onProgress: (status) => console.log(`    ... ${status}`),
    });
    const duration = Date.now() - start;

    console.log(`  Тривалість: ${duration} мс`);
    console.log(`  Знайдено програм: ${result.attached_grants.length}`);
    if (result.attached_grants.length > 0) {
      console.log(`  Топ програма: ${result.attached_grants[0].title} (${result.attached_grants[0].program_id})`);
    }
    console.log(`  Інструменти (tool trace): ${result.tool_trace.map((t) => t.tool).join(" -> ")}`);
    console.log(`  Відповідь: "${result.reply_text.slice(0, 200)}..."\n`);

    const hasExpectedProgram = result.attached_grants.some((g) => g.program_id === tc.expectedProgram);
    const hasExpectedKeywords = tc.mustInclude.every((kw) =>
      result.reply_text.toLowerCase().includes(kw.toLowerCase())
    );

    if (hasExpectedProgram && hasExpectedKeywords) {
      console.log(`  ✅ УСПІХ: знайдено ${tc.expectedProgram} та дотримано експертної відповіді\n`);
      passed++;
    } else {
      console.log(`  ⚠️ УВАГА: очікувалася програма ${tc.expectedProgram} (знайдено: ${hasExpectedProgram}), ключові слова: ${hasExpectedKeywords}\n`);
    }
  }

  console.log(`\nПідсумок тестування: ${passed}/${testCases.length} пройдено.`);
  if (passed === testCases.length) {
    console.log("Всі сценарії оцінки AI-консультанта успішно підтверджено!");
  } else {
    throw new Error(`Evaluation failed: ${passed}/${testCases.length} passed`);
  }
}

main().catch((err) => {
  console.error("Evaluation failed:", err);
  process.exit(1);
});
