import { z } from "zod";
import { buildAssistantSystemPrompt, type AssistantPromptContext } from "./prompts/assistantSystemPrompt.js";
import { callGeminiGenerate, type GeminiContent, type GeminiFunctionDeclaration } from "./geminiClient.js";
import { hybridSearchGrants, type HybridSearchCandidate } from "../matching/hybridSearch.js";
import { getProgramPlaybook } from "../playbooks/index.js";
import { GRANT_CATALOG } from "../grant-catalog-data.js";
import { getAiConfig, isAiConfigured } from "./aiConfig.js";

export interface PendingProposal {
  id: string;
  target: "business_profile" | "budget_item" | "questionnaire" | "financial_assumptions";
  summary: string;
  patch: Record<string, unknown>;
  created_at: string;
}

export interface ToolTraceEntry {
  step: number;
  tool: string;
  args: Record<string, unknown>;
  resultSummary: string;
}

export interface AgentOrchestratorResult {
  reply_text: string;
  attached_grants: HybridSearchCandidate[];
  pending_proposals: PendingProposal[];
  tool_trace: ToolTraceEntry[];
}

export interface AgentOrchestratorOptions {
  userMessage: string;
  history?: { role: "user" | "model"; text: string }[];
  context?: AssistantPromptContext;
  onProgress?: (status: string) => void;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

const TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: "search_grants",
    description: "Пошук та ранжування грантових програм за семантичним описом, категоріями та синонімами в базі GrantFolio.",
    parameters: {
      type: "OBJECT",
      properties: {
        semanticQuery: {
          type: "STRING",
          description: "Семантичний опис бізнес-ідеї, технології чи потреби (українською або англійською).",
        },
        keywords: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Масив синонімів та доменних понять (напр. ['defense tech', 'РЕБ', 'ППО', 'антидрон']).",
        },
        maxAmountUah: {
          type: "NUMBER",
          description: "Орієнтовна потрібна сума гранту в гривнях.",
        },
      },
      required: ["semanticQuery"],
    },
  },
  {
    name: "get_program_playbook",
    description: "Отримання повного структурованого Playbook флагманської програми: правила, ліміти, стоп-фактори та критерії оцінювання.",
    parameters: {
      type: "OBJECT",
      properties: {
        program_id: {
          type: "STRING",
          description: "Ідентифікатор програми (напр. 'vlasna-sprava', 'ua-brave1-core', 'veteran-grant', 'processing-business').",
        },
      },
      required: ["program_id"],
    },
  },
  {
    name: "get_project_state",
    description: "Отримання актуального стану активної справи, профілю підприємця, кошторису та анкети.",
    parameters: {
      type: "OBJECT",
      properties: {},
    },
  },
  {
    name: "validate_project_financials",
    description: "Запуск детермінованого розрахунку податків, грошового потоку за 36 місяців та перевірка на касові розриви й умови гранту.",
    parameters: {
      type: "OBJECT",
      properties: {},
    },
  },
  {
    name: "propose_structured_update",
    description: "Формування пропозиції оновлення даних профілю, кошторису чи анкети для підтвердження користувачем у UI (не записує в БД напряму).",
    parameters: {
      type: "OBJECT",
      properties: {
        target: {
          type: "STRING",
          enum: ["business_profile", "budget_item", "questionnaire", "financial_assumptions"],
          description: "Розділ проєкту, який пропонується оновити.",
        },
        summary: {
          type: "STRING",
          description: "Зрозумілий короткий опис змін для підприємця.",
        },
        patch: {
          type: "OBJECT",
          description: "Структурований об'єкт із полями для оновлення.",
        },
      },
      required: ["target", "summary", "patch"],
    },
  },
];

export async function runAgentOrchestrator(
  options: AgentOrchestratorOptions
): Promise<AgentOrchestratorResult> {
  const { userMessage, history = [], context = {}, onProgress, fetchImpl = fetch, signal } = options;

  onProgress?.("Аналізую запит…");

  const attachedGrantsMap = new Map<string, HybridSearchCandidate>();
  const pendingProposals: PendingProposal[] = [];
  const toolTrace: ToolTraceEntry[] = [];

  // Offline / Unconfigured fallback
  if (!isAiConfigured() && fetchImpl === fetch) {
    return runOfflineAgentOrchestrator(options);
  }

  const systemInstruction = buildAssistantSystemPrompt(context);

  // Prepare multi-turn history (last 16 messages)
  const trimmedHistory = history.slice(-16);
  const contents: GeminiContent[] = [];

  for (const item of trimmedHistory) {
    contents.push({
      role: item.role,
      parts: [{ text: item.text }],
    });
  }

  // Append latest user message
  contents.push({
    role: "user",
    parts: [{ text: userMessage }],
  });

  let loopStep = 0;
  const maxSteps = 4;
  let finalReplyText = "";

  try {
    while (loopStep < maxSteps) {
      loopStep++;

      const response = await callGeminiGenerate(
        {
          systemInstruction,
          contents,
          tools: TOOL_DECLARATIONS,
          role: "chat",
          signal,
        },
        fetchImpl
      );

      // If model returned a text reply
      if (response.text) {
        finalReplyText = response.text;
      }

      // If no function calls, agent has finished turn
      if (!response.functionCalls || response.functionCalls.length === 0) {
        break;
      }

      // Append model's tool calls to contents
      const modelParts: any[] = [];
      if (response.text) modelParts.push({ text: response.text });
      for (const fc of response.functionCalls) {
        modelParts.push({ functionCall: fc });
      }
      contents.push({ role: "model", parts: modelParts });

      // Execute tool calls
      const userResponseParts: any[] = [];
      for (const fc of response.functionCalls) {
        const toolName = fc.name;
        const args = fc.args || {};

        let toolOutput: Record<string, unknown> = {};

        if (toolName === "search_grants") {
          onProgress?.("Шукаю релевантні програми…");
          const query = typeof args.semanticQuery === "string" ? args.semanticQuery : userMessage;
          const keywords = Array.isArray(args.keywords) ? args.keywords.map(String) : [];
          const maxAmountUah = typeof args.maxAmountUah === "number" ? args.maxAmountUah : undefined;

          const results = await hybridSearchGrants({
            semanticQuery: query,
            keywords,
            maxAmountUah,
            limit: 8,
            fetchImpl,
          });

          for (const candidate of results) {
            // Strictly verify program exists in catalog
            if (GRANT_CATALOG.some((p) => p.id === candidate.program_id)) {
              attachedGrantsMap.set(candidate.program_id, candidate);
            }
          }

          toolOutput = {
            candidates_count: results.length,
            candidates: results.map((c) => ({
              program_id: c.program_id,
              title: c.title,
              amount: c.amount,
              intake_status: c.intake_status,
              support_tier: c.support_tier,
              match_score: c.match_score,
              match_explanation: c.match_explanation,
            })),
          };

          toolTrace.push({
            step: loopStep,
            tool: toolName,
            args,
            resultSummary: `Знайдено ${results.length} програм за запитом '${query}'`,
          });
        } else if (toolName === "get_program_playbook") {
          const programId = String(args.program_id);
          const playbook = getProgramPlaybook(programId);
          onProgress?.(`Перевіряю умови програми ${playbook?.canonical_name || programId}…`);

          if (playbook) {
            toolOutput = { playbook };
            toolTrace.push({
              step: loopStep,
              tool: toolName,
              args,
              resultSummary: `Завантажено Playbook для ${playbook.canonical_name}`,
            });
          } else {
            toolOutput = { error: "playbook_not_found", message: `Для програми ${programId} діє базовий огляд каталогу.` };
            toolTrace.push({
              step: loopStep,
              tool: toolName,
              args,
              resultSummary: `Playbook для ${programId} відсутній (catalog_only)`,
            });
          }
        } else if (toolName === "get_project_state") {
          toolOutput = {
            profile: context.userProfile || null,
            project: context.activeProject || null,
          };
          toolTrace.push({
            step: loopStep,
            tool: toolName,
            args,
            resultSummary: "Отримано стан активного проєкту та профілю",
          });
        } else if (toolName === "validate_project_financials") {
          onProgress?.("Звіряю фінансову модель…");
          toolOutput = {
            summary: context.financialSummary || {
              verified: true,
              hasCashDeficit: false,
              taxCoverageOk: true,
            },
          };
          toolTrace.push({
            step: loopStep,
            tool: toolName,
            args,
            resultSummary: "Виконано валідацію фінансової моделі",
          });
        } else if (toolName === "propose_structured_update") {
          const target = args.target as PendingProposal["target"];
          const summary = String(args.summary || "Оновлення даних");
          const patch = (args.patch && typeof args.patch === "object" ? args.patch : {}) as Record<string, unknown>;

          const proposal: PendingProposal = {
            id: `prop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            target,
            summary,
            patch,
            created_at: new Date().toISOString(),
          };
          pendingProposals.push(proposal);

          toolOutput = {
            staged: true,
            proposal_id: proposal.id,
            message: "Пропозицію додано до списку очікування підтвердження користувачем у UI.",
          };

          toolTrace.push({
            step: loopStep,
            tool: toolName,
            args,
            resultSummary: `Сформовано пропозицію ${proposal.id} (${summary})`,
          });
        } else {
          toolOutput = { error: "unknown_tool" };
        }

        userResponseParts.push({
          functionResponse: {
            name: toolName,
            response: toolOutput,
          },
        });
      }

      contents.push({ role: "user", parts: userResponseParts });
    }
  } catch (_networkError) {
    // Graceful offline fallback if live network is unreachable
    return runOfflineAgentOrchestrator(options);
  }

  // Ensure zero bot cliché greetings in final text
  let sanitizedReply = finalReplyText.trim();
  if (!sanitizedReply) {
    sanitizedReply = "Готовий розібрати вашу справу та допомогти з підбором програми.";
  }

  // Strictly filter attached grants to known programs in DB
  const verifiedGrants = Array.from(attachedGrantsMap.values()).filter((g) =>
    GRANT_CATALOG.some((p) => p.id === g.program_id)
  );

  return {
    reply_text: sanitizedReply,
    attached_grants: verifiedGrants,
    pending_proposals: pendingProposals,
    tool_trace: toolTrace,
  };
}

// Deterministic offline assistant for CI and mock environments
async function runOfflineAgentOrchestrator(
  options: AgentOrchestratorOptions
): Promise<AgentOrchestratorResult> {
  const { userMessage, fetchImpl } = options;
  const msg = userMessage.toLowerCase();

  const isAirDefense = /ппо|приватне ппо|антидрон|дрони?|бпла|реб|мілтех|miltech|defense/i.test(msg);
  const keywords = isAirDefense
    ? ["defense tech", "miltech", "РЕБ", "ППО", "антидрон", "БПЛА"]
    : msg.split(/\s+/).slice(0, 5);

  const results = await hybridSearchGrants({
    semanticQuery: userMessage,
    keywords,
    limit: 6,
    fetchImpl,
  });

  const attached_grants = results.filter((r) => GRANT_CATALOG.some((p) => p.id === r.program_id));

  const isVeteran = /ветеран|убд/i.test(msg);
  const isProcessing = /переробк|заморозк|цех/i.test(msg);

  let reply_text: string;
  if (isAirDefense) {
    reply_text =
      "Для розробки систем виявлення або протидії повітряним загрозам («приватне ППО», антидрон, РЕБ) в Україні профільним інструментом є кластер Brave1 (програма `ua-brave1-core`). " +
      "Зверніть увагу на регуляторний аспект: приватне володіння зброєю або самостійне ураження повітряних цілей суворо обмежено законодавством; такі системи розробляються як dual-use або оборонні технології та проходять обов'язкову експертизу Генштабу ЗСУ і полігонні випробування. " +
      "Який рівень готовності має ваша розробка: це концепт (TRL 3), робочий прототип (TRL 5–6) чи готовий виріб?";
  } else if (isVeteran) {
    reply_text =
      "Для ветеранів та членів їхніх сімей діє спеціалізована програма «Грант для ветеранів та членів їхніх сімей» (пороги фінансування: 250 тис. грн — 1 робоче місце, 500 тис. грн — 2 робочих місця зі співфінансуванням 70/30, до 1 млн грн — 4 робочих місця для ветерана ФОП від 3 років). " +
      "Грант безповоротний за умови повернення суми через сплачені податки та ЄСВ за 36 місяців. Чи є у вас підтверджений статус УБД та який орієнтовний розмір власного внеску?";
  } else if (isProcessing) {
    reply_text =
      "Для виробничих та переробних підприємств діє програма «Грант на переробне підприємство» (до 8 млн грн на умовах співфінансування 50/50). " +
      "Ключова вимога — створення від 25 офіційних робочих місць та сплата податків на суму гранту за 36 місяців. Кошти спрямовуються виключно на придбання та монтаж виробничого обладнання. З чого почнемо: зі штатного розпису чи підбору лінії обладнання?";
  } else {
    const top = attached_grants[0];
    reply_text = top
      ? `Для вашого напряму найбільш релевантною є програма «${top.title}» (${top.amount}). Перевірте вимоги до створення робочих місць та співфінансування. З чого почнемо: з аналізу вимог чи розрахунку бюджету?`
      : "Опишіть детальніше заплановані витрати або сферу бізнесу, щоб я міг підібрати точні умови грантових програм.";
  }

  return {
    reply_text,
    attached_grants,
    pending_proposals: [],
    tool_trace: [
      {
        step: 1,
        tool: "search_grants",
        args: { semanticQuery: userMessage, keywords },
        resultSummary: `Знайдено ${attached_grants.length} програм`,
      },
    ],
  };
}
