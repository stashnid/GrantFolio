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
  const playbook = PLAYBOOKS[program.id];
  const allTerms = [...queryWords, ...keywords.map(normalize)];

  let matchedTermsCount = 0;
  const matchedList: string[] = [];

  for (const term of allTerms) {
    if (!term || term.length < 2) continue;
    if (doc.includes(term)) {
      matchedTermsCount++;
      matchedList.push(term);
    }
  }

  // Exact playbook domain tag / synonym match bonus
  if (playbook) {
    for (const tag of [...playbook.domain_tags, ...playbook.synonyms_uk_en]) {
      const normTag = normalize(tag);
      if (allTerms.some((term) => term && (normTag.includes(term) || term.includes(normTag)))) {
        matchedTermsCount += 2;
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

export async function hybridSearchGrants(
  params: HybridSearchParams
): Promise<HybridSearchCandidate[]> {
  const limit = params.limit ?? 8;
  const semanticQuery = params.semanticQuery.trim();
  const keywords = params.keywords ?? [];
  const applicantTraits = params.applicantTraits ?? [];

  const queryWords = normalize(semanticQuery)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["для", "який", "хочу", "потрібно", "грант"].includes(w));

  // Try generating semantic embedding
  let queryVector: number[] | null = null;
  if (semanticQuery) {
    queryVector = await callGeminiEmbedding(semanticQuery, params.fetchImpl);
  }

  const candidates: HybridSearchCandidate[] = [];

  for (const program of GRANT_CATALOG) {
    const isDeep = program.supportTier === "deep" || Boolean(PLAYBOOKS[program.id]);
    const supportTier: "deep" | "catalog_only" = isDeep ? "deep" : "catalog_only";

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

    // If query contains specific defense keywords, strongly boost Brave1
    if (
      program.id === "ua-brave1-core" &&
      queryWords.some((w) => ["ппо", "антидрон", "реб", "дрон", "defense", "miltech", "бпла", "нрк", "зброя"].includes(w))
    ) {
      finalScore = Math.max(finalScore, 0.88);
    }

    // If query contains veteran keywords, boost veteran-grant
    if (
      program.id === "veteran-grant" &&
      queryWords.some((w) => ["ветеран", "убд", "ветеранськ"].includes(w))
    ) {
      finalScore = Math.max(finalScore, 0.89);
    }

    if (finalScore > 0.15 || candidates.length < 4) {
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
