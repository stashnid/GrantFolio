import type { Pool } from "pg";
import { GRANT_CATALOG, type GrantCatalogEntry } from "../grant-catalog-data.js";
import { PLAYBOOKS } from "../playbooks/index.js";
import { callGeminiEmbedding } from "../ai/geminiClient.js";
import { normalize } from "../grant-discovery.js";

export interface HybridSearchCandidate {
  program_id: string;
  title: string;
  description: string;
  provider: string;
  amount: string;
  intake_status: "open" | "unconfirmed" | "paused" | "archived";
  support_tier: "deep" | "catalog_only";
  match_score: number;
  match_explanation: string;
  official_url: string;
}

export interface HybridSearchParams {
  semanticQuery: string;
  keywords?: string[];
  applicantTraits?: string[];
  maxAmountUah?: number;
  limit?: number;
  fetchImpl?: typeof fetch;
}

// In-memory embedding cache for catalog programs
const PROGRAM_EMBEDDINGS = new Map<string, number[]>();

export function getProgramSearchDocument(program: GrantCatalogEntry): string {
  const playbook = PLAYBOOKS[program.id];
  const tags = [
    ...(program.tags || []),
    ...(playbook?.domain_tags || []),
    ...(program.searchTerms || []),
    ...(playbook?.synonyms_uk_en || []),
  ];
  const useCases = playbook?.use_case_examples || [];

  return [
    program.title,
    program.categoryLabel,
    program.provider,
    program.summary,
    program.targetAudience,
    program.keyCondition,
    program.details.overview,
    tags.join(" "),
    useCases.join(" "),
    program.eligibleCosts.join(" "),
  ].join("\n");
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

function calculateLexicalSynonymScore(
  program: GrantCatalogEntry,
  queryWords: string[],
  keywords: string[]
): { score: number; explanation: string } {
  const doc = normalize(getProgramSearchDocument(program));
  const docTokens = new Set(doc.split(/\s+/).filter(Boolean));
  const playbook = PLAYBOOKS[program.id];
  const allTerms = [...queryWords, ...keywords.map(normalize)].filter(
    (t) => t && t.length >= 2
  );

  let matchedTermsCount = 0;
  const matchedList: string[] = [];

  for (const term of allTerms) {
    if (!term || term.length < 2) continue;
    // For short terms (<= 4 chars, like "авто"), require exact word token match to avoid
    // false positives on "автоматизація", "авторське"
    let matched = false;
    if (term.length <= 4) {
      matched = docTokens.has(term);
    } else {
      matched = docTokens.has(term) || Array.from(docTokens).some((t) => t.startsWith(term) || (t.length >= 5 && term.startsWith(t)));
    }

    if (matched) {
      matchedTermsCount++;
      matchedList.push(term);
    }
  }

  // Exact playbook domain tag / synonym match bonus
  if (playbook) {
    for (const tag of [...playbook.domain_tags, ...playbook.synonyms_uk_en]) {
      const normTagTokens = normalize(tag).split(/\s+/).filter(Boolean);
      for (const term of allTerms) {
        if (normTagTokens.some((t) => t === term || (term.length >= 5 && t.startsWith(term)))) {
          matchedTermsCount += 1.5;
        }
      }
    }
  }

  const normalizedScore = Math.min(1, matchedTermsCount / Math.max(1, allTerms.length));
  const explanation = matchedList.length > 0
    ? `Збіг за ключовими поняттями: ${matchedList.slice(0, 4).join(", ")}`
    : "Тематична відповідність категоріям програми";

  return { score: normalizedScore, explanation };
}

function calculateTagTraitBonus(
  program: GrantCatalogEntry,
  applicantTraits: string[] = []
): number {
  let bonus = 0;
  const tags = new Set([
    ...(program.tags || []).map(normalize),
    program.category,
    ...(PLAYBOOKS[program.id]?.domain_tags || []).map(normalize),
  ]);

  for (const trait of applicantTraits) {
    const norm = normalize(trait);
    if (tags.has(norm)) bonus += 0.2;
  }

  // Priority bonus: open programs and deep flagship tier
  if (program.intakeStatus === "open") bonus += 0.15;
  else if (program.intakeStatus === "unconfirmed") bonus += 0.05;

  if (program.supportTier === "deep" || PLAYBOOKS[program.id]) bonus += 0.15;

  return Math.min(1, bonus);
}

const SEARCH_STOP_WORDS = new Set([
  "для", "який", "яка", "яке", "які", "хочу", "потрібно", "потрібна", "потрібне",
  "потрібні", "грант", "гранти", "чи", "є", "на", "це", "програми", "програма",
  "можна", "якщо", "ведення", "роботи", "може", "справа", "бізнес", "підкажи",
  "скільки", "можуть", "дати", "буде", "буду", "мені", "нам", "про", "без",
  "від", "до", "під", "що", "як", "та", "і", "й", "але", "або", "там", "тут",
  "лише", "тільки"
]);

export async function hybridSearchGrants(
  params: HybridSearchParams
): Promise<HybridSearchCandidate[]> {
  const limit = params.limit ?? 8;
  const semanticQuery = params.semanticQuery.trim();
  const keywords = params.keywords ?? [];
  const applicantTraits = params.applicantTraits ?? [];

  // Zero-result guard for pure greetings and illegal/prohibited activities
  const isGreetingQuery = /^(привіт|добрий день|доброго дня|вітаю|hello|hi|хай|хто ти|що ти вмієш)[\s!\.,?]*$/i.test(semanticQuery);
  const isIllegalOrProhibited = /казино|азартн|гральн.*автомат|рулетк|букмекер|лотере/i.test(semanticQuery);

  if (isGreetingQuery || isIllegalOrProhibited) {
    return [];
  }

  const queryWords = normalize(semanticQuery)
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !SEARCH_STOP_WORDS.has(w));

  // Domain intent detectors
  const hasDefenseIntent = queryWords.some((w) =>
    ["ппо", "антидрон", "реб", "дрон", "defense", "miltech", "бпла", "нрк", "зброя", "оборон", "військов", "розвідк", "боєприпас"].some((kw) => w.includes(kw))
  );

  const hasVeteranIntent = queryWords.some((w) =>
    ["ветеран", "убд", "боparticip", "ветеранськ", "військов", "комбатант"].some((kw) => w.includes(kw))
  ) || applicantTraits.some((t) => ["veteran", "убд"].includes(t.toLowerCase()));

  const hasAgroIntent = queryWords.some((w) =>
    ["сад", "теплиц", "ягід", "фермер", "полів", "агро", "врожай", "земл", "трактор"].some((kw) => w.includes(kw))
  );

  const hasTransportLogisticsIntent = queryWords.some((w) =>
    ["перевезен", "вантаж", "вантажівк", "фура", "тягач", "логістик", "грузовик", "сипуч"].some((kw) => w.includes(kw))
  );

  const hasProcessingIntent = !hasTransportLogisticsIntent && queryWords.some((w) =>
    ["перероб", "заморозк", "сушк", "консерв", "сировин", "харчов", "борошн", "елеватор", "фасуван"].some((kw) => w.includes(kw))
  );

  // Try generating semantic embedding
  let queryVector: number[] | null = null;
  if (semanticQuery) {
    queryVector = await callGeminiEmbedding(semanticQuery, params.fetchImpl);
  }

  const candidates: HybridSearchCandidate[] = [];

  for (const program of GRANT_CATALOG) {
    const isDeep = program.supportTier === "deep" || Boolean(PLAYBOOKS[program.id]);
    const supportTier: "deep" | "catalog_only" = isDeep ? "deep" : "catalog_only";

    // Domain guarding: do not attach specialized domain programs to irrelevant queries
    if ((program.id === "ua-brave1-core" || program.id === "ua-bravetech-eu") && !hasDefenseIntent) {
      continue;
    }
    if ((program.id === "veteran-grant" || program.id === "uvf-reimbursement") && !hasVeteranIntent) {
      continue;
    }
    if ((program.id === "agro-gardens" || program.id === "mercy-corps-uasp-agro") && !hasAgroIntent) {
      continue;
    }
    // Processing grants strictly require genuine processing intent and must NEVER be attached to transport/logistics
    if (program.id === "processing-business" && !hasProcessingIntent) {
      continue;
    }

    // 1. Semantic score
    let semanticScore = 0;
    if (queryVector) {
      const cachedVector = PROGRAM_EMBEDDINGS.get(program.id);
      if (cachedVector) {
        semanticScore = Math.max(0, cosineSimilarity(queryVector, cachedVector));
      }
    }

    // 2. Lexical and synonym score
    const { score: lexicalScore, explanation: lexicalExplanation } =
      calculateLexicalSynonymScore(program, queryWords, keywords);

    // 3. Tag and trait bonus
    const tagBonus = calculateTagTraitBonus(program, applicantTraits);

    // Combined score
    let finalScore: number;
    if (queryVector && PROGRAM_EMBEDDINGS.size > 0) {
      finalScore = 0.60 * semanticScore + 0.25 * lexicalScore + 0.15 * tagBonus;
    } else {
      // Graceful fallback to lexical + tag scoring
      finalScore = 0.70 * lexicalScore + 0.30 * tagBonus;
    }

    // Domain boosts
    if (program.id === "ua-brave1-core" && hasDefenseIntent) {
      finalScore = Math.max(finalScore, 0.92);
    }
    if (program.id === "veteran-grant" && hasVeteranIntent) {
      finalScore = Math.max(finalScore, 0.92);
    }
    if (program.id === "processing-business" && hasProcessingIntent) {
      finalScore = Math.max(finalScore, 0.90);
    }
    if (program.id === "agro-gardens" && hasAgroIntent) {
      finalScore = Math.max(finalScore, 0.88);
    }
    if (
      program.id === "vlasna-sprava" &&
      (queryWords.some((w) =>
        ["відкри", "започатк", "майстерн", "збірк", "збор", "складан", "виробництв", "підприєм", "сервіс", "малий", "справ", "послуг", "кав", "пекар", "сто", "шаурм", "цех"].some((kw) => w.includes(kw))
      ) || (!hasDefenseIntent && !hasAgroIntent))
    ) {
      finalScore = Math.max(finalScore, 0.89);
    }

    // Require genuine minimum threshold
    if (finalScore >= 0.38) {
      candidates.push({
        program_id: program.id,
        title: program.title,
        description: program.summary,
        provider: program.provider,
        amount: program.amount,
        intake_status: program.intakeStatus,
        support_tier: supportTier,
        match_score: Number(finalScore.toFixed(3)),
        match_explanation: lexicalExplanation,
        official_url: program.officialUrl,
      });
    }
  }

  candidates.sort((a, b) => b.match_score - a.match_score);
  return candidates.slice(0, limit);
}

// In-memory or database embedding synchronization
export async function syncCatalogEmbeddings(
  db?: Pool,
  fetchImpl: typeof fetch = fetch
): Promise<{ total: number; generated: number }> {
  let generated = 0;

  for (const program of GRANT_CATALOG) {
    if (PROGRAM_EMBEDDINGS.has(program.id)) continue;

    // Check DB first if db pool provided
    if (db) {
      const existing = await db.query(
        "SELECT embedding_vector FROM catalog_programs WHERE program_id = $1",
        [program.id]
      ).catch(() => ({ rowCount: 0, rows: [] }));

      if (existing.rowCount && existing.rows[0].embedding_vector) {
        const raw = existing.rows[0].embedding_vector;
        const vec = Array.isArray(raw) ? raw : (typeof raw === "string" ? JSON.parse(raw) : null);
        if (Array.isArray(vec) && vec.length > 0) {
          PROGRAM_EMBEDDINGS.set(program.id, vec);
          continue;
        }
      }
    }

    // Generate new embedding
    const doc = getProgramSearchDocument(program);
    const vector = await callGeminiEmbedding(doc, fetchImpl);
    if (vector) {
      PROGRAM_EMBEDDINGS.set(program.id, vector);
      generated++;

      if (db) {
        await db.query(
          `INSERT INTO catalog_programs (program_id, canonical_name, embedding_vector, updated_at)
           VALUES ($1, $2, $3::jsonb, now())
           ON CONFLICT (program_id) DO UPDATE SET
             embedding_vector = EXCLUDED.embedding_vector,
             updated_at = now()`,
          [program.id, program.title, JSON.stringify(vector)]
        ).catch(() => {});
      }
    }
  }

  return { total: GRANT_CATALOG.length, generated };
}

// Standalone CLI runner for embeddings sync
if (process.argv[1]?.endsWith("hybridSearch.ts") || process.argv[1]?.endsWith("hybridSearch.js")) {
  console.log("Generating catalog embeddings for GrantFolio programs...");
  syncCatalogEmbeddings()
    .then((res) => {
      console.log(`Embeddings synchronization complete: ${res.generated} newly generated, ${res.total} total.`);
    })
    .catch((err) => {
      console.error("Failed to sync embeddings:", err);
    });
}
