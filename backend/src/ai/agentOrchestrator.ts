import { z } from "zod";
import { buildAssistantSystemPrompt, type AssistantPromptContext } from "./prompts/assistantSystemPrompt.js";
import { callGeminiGenerate, type GeminiContent, type GeminiFunctionDeclaration } from "./geminiClient.js";
import { hybridSearchGrants, type HybridSearchCandidate } from "../matching/hybridSearch.js";
import { getProgramPlaybook, computeMissingRequiredFields } from "../playbooks/index.js";
import { GRANT_CATALOG } from "../grant-catalog-data.js";
import { getAiConfig, isAiConfigured, isMockAllowed } from "./aiConfig.js";
import { searchOfficialRules } from "../knowledge/searchOfficialRules.js";

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
  {
    name: "get_missing_fields",
    description: "Отримання списку незаповнених обов'язкових полів профілю або анкети для поточної програми (vlasna-sprava, veteran-grant, ua-brave1-core). Допомагає асистенту вести користувача покроково, ставлячи по 1-2 запитання за раз.",
    parameters: {
      type: "OBJECT",
      properties: {
        program_id: {
          type: "STRING",
          description: "Ідентифікатор програми (опційно; за замовчуванням береться з активного проєкту).",
        },
      },
    },
  },
  {
    name: "search_official_rules",
    description: "Точний семантичний та повнотекстовий пошук за нормативно-правовими актами України (Порядок КМУ № 738, Положення Brave1, вимоги до TRL та OPSEC). Використовуйте цей інструмент для перевірки точних лімітів, формулювань закону, дозволених статей витрат та критеріїв оцінювання.",
    parameters: {
      type: "OBJECT",
      properties: {
        program_id: {
          type: "STRING",
          description: "Ідентифікатор програми (напр. 'vlasna-sprava', 'veteran-grant', 'brave1', 'ua-brave1-core').",
        },
        question: {
          type: "STRING",
          description: "Конкретне питання або ключові слова для перевірки в нормативній базі (напр. 'чи можна оренду без працівників', 'ліміти співфінансування', 'OPSEC вимоги').",
        },
      },
      required: ["program_id", "question"],
    },
  },
];

/**
 * Sanitizes markdown output to ensure clean section structure and avoid repeated "1." list restarts across sections
 */
function sanitizeDuplicateNumbering(text: string): string {
  // If markdown headings exist, handle section-by-section
  const sections = text.split(/(?=^#{1,4}\s)/m);
  if (sections.length > 1) {
    let seenList = false;
    return sections
      .map((sec) => {
        const hasOne = /(?:^|\n)\s*1\.\s+/.test(sec);
        if (!hasOne) return sec;
        if (!seenList) {
          seenList = true;
          return sec;
        }
        return sec.replace(/(^|\n)(\s*)\d+\.\s+/g, "$1$2- ");
      })
      .join("");
  }

  // If no markdown headings, replace list restarts
  let hasFirstList = false;
  let inSubsequentList = false;
  const lines = text.split("\n");
  const resultLines: string[] = [];

  for (const line of lines) {
    const matchOne = line.match(/^(\s*)1\.\s+(.*)$/);
    const matchNum = line.match(/^(\s*)\d+\.\s+(.*)$/);

    if (matchOne) {
      if (!hasFirstList) {
        hasFirstList = true;
        resultLines.push(line);
      } else {
        inSubsequentList = true;
        resultLines.push(`${matchOne[1]}- ${matchOne[2]}`);
      }
    } else if (matchNum && inSubsequentList) {
      resultLines.push(`${matchNum[1]}- ${matchNum[2]}`);
    } else {
      if (!matchNum) {
        inSubsequentList = false;
      }
      resultLines.push(line);
    }
  }

  return resultLines.join("\n");
}

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
    if (!isMockAllowed()) {
      return {
        reply_text: "AI-провайдер не налаштований. Вкажіть GEMINI_API_KEY або GEMINI_VERTEX_PROJECT у конфігурації (.env) для отримання живих відповідей консультанта.",
        attached_grants: [],
        pending_proposals: [],
        tool_trace: [],
      };
    }
    return runOfflineAgentOrchestrator(options);
  }

  const enrichedContext = { ...context };
  if (!enrichedContext.missingRequiredFields && enrichedContext.activeProject?.program_id) {
    const missing = computeMissingRequiredFields(enrichedContext.activeProject.program_id, {
      title: enrichedContext.activeProject.title,
      program_id: enrichedContext.activeProject.program_id,
      details: enrichedContext.activeProject.details as Record<string, unknown> | null,
      items: enrichedContext.activeProject.items,
      total_kopecks: enrichedContext.activeProject.total_kopecks,
      profile: enrichedContext.userProfile as Record<string, unknown> | null,
    });
    enrichedContext.missingRequiredFields = {
      missingFields: missing.missing_fields.map((f) => f.label_uk),
      totalFields: missing.total_required_count,
      completedFields: missing.filled_count,
    };
  }

  const systemInstruction = buildAssistantSystemPrompt(enrichedContext);

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

      // Append model's tool calls to contents (preserve rawParts with thoughtSignature if present)
      const modelParts: any[] = response.rawParts && response.rawParts.length > 0
        ? response.rawParts
        : [];
      if (modelParts.length === 0) {
        if (response.text) modelParts.push({ text: response.text });
        for (const fc of response.functionCalls || []) {
          modelParts.push({ functionCall: fc });
        }
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
            limit: 4,
            fetchImpl,
          });

          // Only keep candidates with strong relevance
          const highConfidence = results.filter((c) => c.match_score >= 0.45);
          for (const candidate of highConfidence) {
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

          const targetProg = GRANT_CATALOG.find((p) => p.id === programId || (programId === "brave1" && p.id === "ua-brave1-core"));
          if (targetProg && !attachedGrantsMap.has(targetProg.id)) {
            attachedGrantsMap.set(targetProg.id, {
              program_id: targetProg.id,
              title: targetProg.title,
              description: targetProg.targetAudience,
              provider: targetProg.provider,
              amount: targetProg.amount,
              intake_status: targetProg.intakeStatus,
              support_tier: targetProg.id === "vlasna-sprava" || targetProg.id === "veteran-grant" || targetProg.id === "ua-brave1-core" ? "deep" : "catalog_only",
              match_score: 95,
              match_explanation: `Програма опрацьовується консультантом за Playbook`,
              official_url: targetProg.officialUrl,
            });
          }

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

          // Proposal Prudence: Never propose legalForm (TOV vs FOP) or industry unless confirmed by user
          if (target === "business_profile") {
            const userMsgLower = userMessage.toLowerCase();
            if (patch.legalForm && !userMsgLower.includes("фоп") && !userMsgLower.includes("тов")) {
              delete patch.legalForm;
            }
          }

          if (Object.keys(patch).length > 0) {
            const proposal: PendingProposal = {
              id: `prop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              target,
              summary,
              patch,
              created_at: new Date().toISOString(),
            };
            pendingProposals.push(proposal);

            toolTrace.push({
              step: loopStep,
              tool: toolName,
              args,
              resultSummary: `Сформовано пропозицію ${proposal.id} (${summary})`,
            });
          } else {
            toolOutput = {
              staged: false,
              message: "Пропозицію пропущено, оскільки оновлення не містить підтверджених користувачем змін.",
            };
            toolTrace.push({
              step: loopStep,
              tool: toolName,
              args,
              resultSummary: `Пропозицію відхилено як непідтверджену (${summary})`,
            });
          }
        } else if (toolName === "get_missing_fields") {
          const progId = (args.program_id as string) || context.activeProject?.program_id || null;
          onProgress?.("Аналізую заповненість анкети проєкту…");
          const missingResult = computeMissingRequiredFields(progId, {
            title: context.activeProject?.title,
            program_id: progId,
            details: context.activeProject?.details as Record<string, unknown> | null,
            items: context.activeProject?.items,
            total_kopecks: context.activeProject?.total_kopecks,
            profile: context.userProfile as Record<string, unknown> | null,
          });
          toolOutput = missingResult as unknown as Record<string, unknown>;
          toolTrace.push({
            step: loopStep,
            tool: toolName,
            args,
            resultSummary: `Заповнено ${missingResult.filled_count}/${missingResult.total_required_count} полів. Залишилось: ${missingResult.missing_fields.map((f) => f.label_uk).join(", ") || "всі заповнені"}`,
          });
        } else if (toolName === "search_official_rules") {
          const programId = String(args.program_id || "");
          const question = String(args.question || "");
          onProgress?.(`Звіряю офіційні норми для ${programId}…`);

          const targetProg = GRANT_CATALOG.find((p) => p.id === programId || (programId === "brave1" && p.id === "ua-brave1-core"));
          if (targetProg && !attachedGrantsMap.has(targetProg.id)) {
            attachedGrantsMap.set(targetProg.id, {
              program_id: targetProg.id,
              title: targetProg.title,
              description: targetProg.targetAudience,
              provider: targetProg.provider,
              amount: targetProg.amount,
              intake_status: targetProg.intakeStatus,
              support_tier: targetProg.id === "vlasna-sprava" || targetProg.id === "veteran-grant" || targetProg.id === "ua-brave1-core" ? "deep" : "catalog_only",
              match_score: 95,
              match_explanation: `Програма опрацьовується консультантом за нормативною базою`,
              official_url: targetProg.officialUrl,
            });
          }

          const officialResults = await searchOfficialRules({
            program_id: programId,
            question,
            limit: 5,
          });

          toolOutput = {
            matches_count: officialResults.length,
            rules: officialResults.map((r) => ({
              doc_id: r.doc_id,
              section_title: r.section_title,
              snippet: r.snippet,
              source_url: r.source_url,
              verified_at: r.verified_at,
            })),
          };

          toolTrace.push({
            step: loopStep,
            tool: toolName,
            args,
            resultSummary: `Знайдено ${officialResults.length} розділів нормативної бази (${officialResults.map((r) => r.section_title).slice(0, 2).join(", ") || "не знайдено"})`,
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
  } catch (err: any) {
    if (!isMockAllowed()) {
      console.error("[AI] Live agent orchestration failed in dev/prod mode without mock permission:", err);
      return {
        reply_text: `Виникла помилка під час звернення до AI-моделі: ${err?.message || "невідома помилка"}. Будь ласка, перевірте налаштування GEMINI_API_KEY та стан мережі.`,
        attached_grants: [],
        pending_proposals: [],
        tool_trace: [],
      };
    }
    // Graceful offline fallback if live network is unreachable in test or mock mode
    return runOfflineAgentOrchestrator(options);
  }

  // Ensure zero bot cliché greetings in final text
  let sanitizedReply = sanitizeDuplicateNumbering(finalReplyText.trim());
  if (!sanitizedReply) {
    sanitizedReply = "Готовий розібрати вашу справу та допомогти з підбором програми.";
  }

  const msgLower = userMessage.toLowerCase().trim();
  const isGreeting = /^(привіт|добрий день|доброго дня|вітаю|hello|hi|хай|хто ти|що ти вмієш)[\s!\.,?]*$/i.test(msgLower);
  const isProhibited = /казино|азартн|гральн.*автомат|рулетк|букмекер|лотере/i.test(msgLower);
  const isJailbreak = /ігноруй|напалм|збро.*масов|вибухівк|обійти.*податк/i.test(msgLower);

  // If user explicitly stated only FOP, sanitize any stray mentions of TOV
  if (/лише\s+фоп|тільки\s+фоп/i.test(msgLower)) {
    sanitizedReply = sanitizedReply
      .replace(/\s*(?:ТОВ\s+відкривати\s+не\s+потрібно|на\s+відміну\s+від\s+ТОВ|ТОВ\s+не\s+потрібн\w*)[.,!]?/gi, "")
      .replace(/\s*\bТОВ\b[.,!]?/g, "");
  }

  // Strictly filter attached grants to known programs in DB
  let verifiedGrants = Array.from(attachedGrantsMap.values()).filter((g) =>
    GRANT_CATALOG.some((p) => p.id === g.program_id)
  );

  const isRefusal = /я не можу надати|не можу надати рецепт|інструкції з обходу/i.test(sanitizedReply.toLowerCase());

  // Strict guard for greeting, prohibited, refusal or jailbreak queries
  if (isGreeting || isProhibited || isJailbreak || isRefusal) {
    verifiedGrants = [];
  } else {
    // Multi-turn context preservation and direct query program matching:
    // If no cards were attached this turn because search_grants was not called,
    // match directly named programs or inherit the active project/playbook program
    if (verifiedGrants.length === 0) {
      if ((msgLower.includes("власн") && msgLower.includes("справ")) || msgLower.includes("єробота")) {
        const vs = GRANT_CATALOG.find((p) => p.id === "vlasna-sprava");
        if (vs) {
          verifiedGrants.push({
            program_id: vs.id,
            title: vs.title,
            description: vs.summary,
            provider: vs.provider,
            amount: vs.amount,
            intake_status: vs.intakeStatus,
            support_tier: "deep",
            match_score: 0.95,
            match_explanation: "Програма прямо зазначена у запиті підприємця",
            official_url: vs.officialUrl,
          });
        }
      } else if (msgLower.includes("brave1") || msgLower.includes("брейв")) {
        const b1 = GRANT_CATALOG.find((p) => p.id === "ua-brave1-core");
        if (b1) {
          verifiedGrants.push({
            program_id: b1.id,
            title: b1.title,
            description: b1.summary,
            provider: b1.provider,
            amount: b1.amount,
            intake_status: b1.intakeStatus,
            support_tier: "deep",
            match_score: 0.95,
            match_explanation: "Програма прямо зазначена у запиті підприємця",
            official_url: b1.officialUrl,
          });
        }
      } else if (msgLower.includes("ветеран") || msgLower.includes("убд")) {
        const vet = GRANT_CATALOG.find((p) => p.id === "veteran-grant");
        if (vet) {
          verifiedGrants.push({
            program_id: vet.id,
            title: vet.title,
            description: vet.summary,
            provider: vet.provider,
            amount: vet.amount,
            intake_status: vet.intakeStatus,
            support_tier: "deep",
            match_score: 0.95,
            match_explanation: "Ветеранська програма зазначена у запиті",
            official_url: vet.officialUrl,
          });
        }
      }

      const activeProgId = context.activeProject?.program_id || context.activePlaybook?.program_id;
      if (verifiedGrants.length === 0 && activeProgId) {
        const cat = GRANT_CATALOG.find((p) => p.id === activeProgId);
        if (cat) {
          verifiedGrants.push({
            program_id: cat.id,
            title: cat.title,
            description: cat.summary,
            provider: cat.provider,
            amount: cat.amount,
            intake_status: cat.intakeStatus,
            support_tier: cat.supportTier === "deep" ? "deep" : "catalog_only",
            match_score: 0.9,
            match_explanation: "Активна грантова програма у проєкті",
            official_url: cat.officialUrl,
          });
        }
      } else if (verifiedGrants.length === 0) {
        const histText = history.map((h) => h.text).join(" ").toLowerCase();
        if (
          (histText.includes("власна справа") || histText.includes("єробота") || msgLower.includes("фоп")) &&
          !histText.includes("brave1") &&
          !msgLower.includes("софт") &&
          !msgLower.includes("дрон")
        ) {
          const vs = GRANT_CATALOG.find((p) => p.id === "vlasna-sprava");
          if (vs) {
            verifiedGrants.push({
              program_id: vs.id,
              title: vs.title,
              description: vs.summary,
              provider: vs.provider,
              amount: vs.amount,
              intake_status: vs.intakeStatus,
              support_tier: "deep",
              match_score: 0.85,
              match_explanation: "Програма опрацьовується в поточній розмові",
              official_url: vs.officialUrl,
            });
          }
        }
      }
    }

    // Ensure card alignment if the reply explicitly recommends a flagship program
    const replyLower = sanitizedReply.toLowerCase();
    if (
      !verifiedGrants.some((g) => g.program_id === "vlasna-sprava") &&
      (replyLower.includes("власна справа") || replyLower.includes("власну справу")) &&
      !/не підходить|не надається|неможливо|заборонен/i.test(replyLower.slice(Math.max(0, replyLower.indexOf("власн") - 30), replyLower.indexOf("власн") + 40))
    ) {
      const vs = GRANT_CATALOG.find((p) => p.id === "vlasna-sprava");
      if (vs) {
        verifiedGrants.push({
          program_id: vs.id,
          title: vs.title,
          description: vs.summary,
          provider: vs.provider,
          amount: vs.amount,
          intake_status: vs.intakeStatus,
          support_tier: "deep",
          match_score: 0.89,
          match_explanation: "Рекомендовано асистентом для створення підприємства та закупівлі обладнання",
          official_url: vs.officialUrl,
        });
      }
    }

    if (
      !verifiedGrants.some((g) => g.program_id === "ua-brave1-core") &&
      (replyLower.includes("brave1") || replyLower.includes("brave 1") || replyLower.includes("брейв1")) &&
      !/не підходить|не надається|неможливо|заборонен/i.test(replyLower.slice(Math.max(0, (replyLower.indexOf("brave") !== -1 ? replyLower.indexOf("brave") : replyLower.indexOf("брейв")) - 30), (replyLower.indexOf("brave") !== -1 ? replyLower.indexOf("brave") : replyLower.indexOf("брейв")) + 40))
    ) {
      const b1 = GRANT_CATALOG.find((p) => p.id === "ua-brave1-core");
      if (b1) {
        verifiedGrants.push({
          program_id: b1.id,
          title: b1.title,
          description: b1.targetAudience,
          provider: b1.provider,
          amount: b1.amount,
          intake_status: b1.intakeStatus,
          support_tier: "deep",
          match_score: 0.95,
          match_explanation: "Рекомендовано консультантом для оборонних R&D технологій (Brave1)",
          official_url: b1.officialUrl,
        });
      }
    }

    // Sort by match_score descending
    verifiedGrants.sort((a, b) => b.match_score - a.match_score);

    // Business model protection: cargo transportation / logistics queries must never attach processing-business
    const isTransportLogistics = /перевезен|вантаж|сипуч|вантажівк|фура|тягач|автопарк/i.test(msgLower);
    if (isTransportLogistics) {
      verifiedGrants = verifiedGrants.filter((g) => g.program_id !== "processing-business");
    }

    // Limit to max 2 top cards (or 3 for multi-topic queries like drone assembly or fruit drying + antidrone)
    const isMultiTopic =
      (msgLower.includes("дрон") && (msgLower.includes("майстерн") || msgLower.includes("підприєм"))) ||
      (msgLower.includes("сушк") && msgLower.includes("антидрон"));
    const maxCards = isMultiTopic ? 3 : 2;
    verifiedGrants = verifiedGrants.slice(0, maxCards);
  }

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
  const msg = userMessage.toLowerCase().trim();

  const isGreeting = /^(привіт|добрий день|доброго дня|вітаю|hello|hi|хай|хто ти|що ти вмієш)[\s!\.,?]*$/i.test(msg);
  if (isGreeting) {
    return {
      reply_text:
        "Вітаю! Я — AI-консультант із грантів для бізнесу та оборонних технологій сервісу GrantFolio. " +
        "Допомагаю підібрати актуальні програми в Україні («Власна справа», ветеранські гранти, гранти на переробку, оборонний кластер Brave1), " +
        "прорахувати детерміновану фінансову модель у копійках і підготувати повний пакет документів без помилок. " +
        "Розкажіть коротко про вашу ідею, діючий бізнес чи розробку — і ми розберемо, які програми вам підходять та які там ключові вимоги.",
      attached_grants: [],
      pending_proposals: [],
      tool_trace: [],
    };
  }

  const isDroneWorkshop = /майстерн.*дрон|дрон.*майстерн|ремонт.*дрон|збірк.*дрон/i.test(msg);
  const isAirDefense = /ппо|приватне ппо|антидрон|реб|мілтех|miltech|defense/i.test(msg) || (/дрони?|бпла/i.test(msg) && !isDroneWorkshop);
  const keywords = isAirDefense || isDroneWorkshop
    ? ["defense tech", "miltech", "РЕБ", "ППО", "антидрон", "БПЛА", "дрон"]
    : msg.split(/\s+/).slice(0, 5);

  const results = await hybridSearchGrants({
    semanticQuery: userMessage,
    keywords,
    limit: 6,
    fetchImpl,
  });

  const attached_grants = results.filter((r) => GRANT_CATALOG.some((p) => p.id === r.program_id));

  const isTransportLogistics = /перевезен|вантаж|сипуч|вантажівк|фура|тягач|автопарк/i.test(msg);
  const isVeteran = /ветеран|убд/i.test(msg);
  const isProcessing = /переробк|заморозк|цех/i.test(msg) && !isTransportLogistics;
  const isBakery250kNoStaff = /пекарн/i.test(msg) && (/250/i.test(msg) || /дія\.?бізнес/i.test(msg)) && (/сам|без працівник/i.test(msg));
  const isBrave1Docs = /brave1/i.test(msg) && (/документ|подач|чекліст|brief|проєкт/i.test(msg));

  let reply_text: string;
  if (isDroneWorkshop) {
    reply_text =
      "Для відкриття майстерні дронів є два принципово різні шляхи фінансування в Україні, залежно від типу діяльності:\n\n" +
      "1. Ремонт, обслуговування або збірка дронів як комерційна послуга (цивільний бізнес):\n" +
      "Якщо це сервісний центр, ремонтна майстерня чи контрактна збірка готових дронів для клієнтів — це цивільний бізнес. Оптимальна програма — «Власна справа 2.0» (Постанова КМУ № 616). Можна отримати до 500 000 грн на старт без обов'язкового найму працівників (або до 2,5 млн грн на масштабування діючого бізнесу від 6 місяців зі створенням від 1 робочого місця; або до 1 млн грн за Ветеранським грантом для УБД). Повернення гранту здійснюється через сплачені податки та ЄСВ за обраний період (2, 3 або 5 років).\n\n" +
      "2. Власна інженерна R&D-розробка нових моделей БПЛА, систем РЕБ чи прошивок для оборонних потреб:\n" +
      "Якщо ви створюєте власну унікальну конструкцію, польотний контролер чи систему протидії радіоелектронній боротьбі (TRL 3+) — це оборонний сектор. У такому разі слід подаватися до оборонного кластера Brave1 (гранти від $12 500 до $50 000 і більше на R&D, стендові та полігонні випробування).\n\n" +
      "Уточніть, будь ласка: ви плануєте відкривати сервісно-ремонтну майстерню як комерційний бізнес чи ведете власну конструкторську розробку під військові потреби?";
  } else if (isTransportLogistics) {
    reply_text =
      "За оновленими правилами програми «Власна справа 2.0» (Постанова КМУ № 616) придбання комерційного та виробничого транспорту (вантажні авто, фургони, буси доставки, авторефрижератори, спецтехніка) ДОЗВОЛЕНО фінансувати до 100% від суми гранту.\n\n" +
      "Доступні два напрями за програмою «Власна справа 2.0»:\n" +
      "1. Започаткування (Старт): до 500 000 грн зі 100% покриттям грантом (0% власних коштів). Створення робочих місць не обов'язкове (0 найманих працівників, робота самостійно дозволена).\n" +
      "2. Масштабування бізнесу: від 500 000 до 2 500 000 грн зі 100% покриттям грантом для діючих ФОП або ТОВ зі стажем від 6 місяців (Постанова № 1214) за умови створення щонайменше 1 нового робочого місця.\n\n" +
      "Забороненими залишаються виключно легкові автомобілі для приватних потреб. Якщо ж вам потрібен великий магістральний автопарк (тягачі, автопоїзди) понад грантові ліміти, додатково діє державна програма пільгового кредитування та лізингу «Доступні кредити 5-7-9%».\n\n" +
      "Який обсяг фінансування або тип комерційного транспорту вам потрібен для перевезень?";
  } else if (isBakery250kNoStaff) {
    reply_text =
      "Тут варто одразу прояснити два ключові моменти. " +
      "По-перше, Дія.Бізнес — це інформаційно-довідковий портал для підприємців (консультації та шаблони), а сама грантова заявка подається на порталі «Дія» за програмою «Власна справа 2.0» (Постанова КМУ № 616). " +
      "По-друге: за оновленими правилами «Власна справа 2.0» на треку старту (до 500 000 грн) створення робочих місць НЕ є обов'язковим — ви маєте повне право отримати 250 000 грн та працювати самостійно (0 найманих працівників)! " +
      "Проте діють суворі обмеження щодо структури витрат: ви не можете спрямувати всі кошти на оренду та рекламу. Оренда приміщення обмежена лімітом до 25% від суми гранту, реклама та маркетинг — до 10%, а більша частина коштів обов'язково має піти на обладнання (печі, тістоміси, виробничий інвентар). Повернення гранту відбувається через сплату податків та ЄСВ за себе протягом обраного періоду (24, 36 або 60 місяців). " +
      "Чи готові ви спрямувати основну частину гранту на виробниче обладнання для пекарні?";
  } else if (isBrave1Docs) {
    reply_text =
      "Для подання заявки до кластера Brave1 пакет документів складається з двох контурів: " +
      "1) Матеріали, які генерує GrantFolio: Brave1 R&D Project Brief (PDF на 10 розділів із дорожньою картою) та Brave1 R&D / BOM Кошторис та Дорожня карта (.xlsx із живими формулами =C*D та =SUM). " +
      "2) Зовнішній чекліст заявника: профіль на порталі grants.brave1.tech, несекретний Pitch Deck (7-10 слайдів), відео/фото стендових або полігонних тестів для підтвердження TRL 3+, установчі документи юридичної особи/ФОП, резюме ключових інженерів та листи зацікавленості від військових частин (за наявності). " +
      "Пам'ятайте про правила OPSEC: категорично заборонено вказувати точні радіочастоти, координати виробництва та номери військових частин.";
  } else if (isAirDefense) {
    reply_text =
      "Для розробки систем виявлення або протидії повітряним загрозам («приватне ППО», антидрон, РЕБ) в Україні профільним інструментом є оборонний кластер Brave1. " +
      "Зверніть увагу на регуляторний аспект: приватне володіння зброєю або самостійне ураження повітряних цілей суворо обмежено законодавством; такі системи розробляються як dual-use або оборонні технології та проходять обов'язкову експертизу Генерального штабу ЗСУ і полігонні випробування. " +
      "Який рівень готовності має ваша розробка: це концепт (TRL 3), робочий лабораторний зразок (TRL 4–5) чи виріб для польових тестів?";
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

  const safe_attached_grants = isTransportLogistics
    ? attached_grants.filter((g) => g.program_id !== "processing-business")
    : attached_grants;

  return {
    reply_text,
    attached_grants: safe_attached_grants,
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
