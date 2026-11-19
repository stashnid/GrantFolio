import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { GRANT_CATALOG, type GrantCatalogEntry } from "../grant-catalog-data.js";
import { findNamedPrograms, grantIntake, grantSupport, normalize, searchGrants, type GrantMatch, type SearchResult } from "../grant-discovery.js";
import { PLAYBOOKS } from "../playbooks/data.js";
import { programKnowledgeHash } from "../playbooks/sync.js";
import { configuredEmbedder, validVector, type Embedder } from "./embeddings.js";

export function catalogSearchKnowledge(program: GrantCatalogEntry) {
  const playbook = PLAYBOOKS.find(p => p.programId === program.id);
  const searchTags = playbook?.searchTags ?? program.tags ?? [];
  const searchSynonyms = playbook?.searchSynonyms ?? [...(program.aliases ?? []), ...(program.searchTerms ?? [])];
  const useCaseExamples = playbook?.useCaseExamples ?? [program.title, program.summary, program.targetAudience, ...program.eligibleCosts];
  const text = JSON.stringify([searchTags, searchSynonyms, useCaseExamples]);
  return { searchTags, searchSynonyms, useCaseExamples, text,
    hash: playbook ? programKnowledgeHash(playbook) : createHash("sha256").update(text).digest("hex") };
}
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!validVector(a) || !validVector(b) || a.length !== b.length) return 0;
  const dot = a.reduce((n, v, i) => n + v * b[i], 0);
  const denominator = Math.hypot(...a) * Math.hypot(...b);
  return denominator && Number.isFinite(dot / denominator) ? Math.max(0, Math.min(1, dot / denominator)) : 0;
}
export type HybridSearchResult = SearchResult & { retrieval: "hybrid" | "lexical"; weak: boolean; diagnostics?: { semanticAvailable: boolean } };
type Options = { db?: Pick<Pool, "query">; programs?: readonly GrantCatalogEntry[]; embedder?: Embedder | null; signal?: AbortSignal; limit?: number; now?: Date };
/** No availability filter: relevance, intake and actual preparation support are separate facts. */
export async function hybridSearch(query: string, options: Options = {}): Promise<HybridSearchResult> {
  const programs = options.programs ?? GRANT_CATALOG;
  const boundedQuery = query.slice(-2000);
  const legacy = searchGrants(boundedQuery, programs, options.now, { includeUnavailable: true });
  const named = new Set(findNamedPrograms(boundedQuery, programs).map(p => p.id));
  const lexical = new Map(legacy.matches.map(m => [m.programId, m]));
  const tokens = normalize(boundedQuery).split(" ").filter(w => w.length > 2 && !["грант", "гранти", "хочу", "мені", "для", "потрібно"].includes(w));
  const embedder = options.embedder === undefined ? configuredEmbedder() : options.embedder;
  let queryVector: number[] | undefined;
  const vectors = new Map<string, number[]>();
  if (embedder && options.db) {
    try {
      // Generate only a bounded query embedding; catalog vectors are prepared by the explicit sync CLI.
      const rows = await options.db.query("SELECT program_id, embedding_vector, embedding_model, embedding_hash FROM grant_program_knowledge WHERE embedding_model=$1", [embedder.model]);
      for (const row of rows.rows) {
        const program = programs.find(p => p.id === row.program_id);
        if (program && row.embedding_hash === catalogSearchKnowledge(program).hash && validVector(row.embedding_vector)) vectors.set(program.id, row.embedding_vector);
      }
      if (vectors.size) queryVector = await embedder.embed(boundedQuery, "RETRIEVAL_QUERY", options.signal);
    } catch { /* Explicit lexical mode survives unavailable/invalid embedding infrastructure. */ }
  }
  let semanticAvailable = false;
  const cleaned = normalize(boundedQuery);
  const futureOnlyPurchase = /майбутн|плану.*(?:куп|придб)|не (?:купив|купила|придбав|придбала)/u.test(cleaned);
  const personalOnly = /особист|для себе|personal|for myself/u.test(cleaned) && !/достав|комерц|виробниц|кавяр|пекар/u.test(cleaned);
  const studyOnly = legacy.intents.includes("study") && !legacy.intents.some(intent => ["business", "production", "equipment", "garden"].includes(intent));
  const scored = programs.filter(program => named.has(program.id) || (
    !(program.fundingType === "reimbursement" && futureOnlyPurchase) &&
    !personalOnly && !studyOnly
  )).map(program => {
    const knowledge = catalogSearchKnowledge(program);
    const text = normalize([program.title, program.provider, program.summary, ...knowledge.searchSynonyms, ...knowledge.useCaseExamples].join(" "));
    const overlap = tokens.length ? tokens.filter(token => text.includes(token)).length / tokens.length : 0;
    const tagText = normalize(knowledge.searchTags.join(" "));
    const tags = tokens.length ? tokens.filter(token => tagText.includes(token)).length / tokens.length : 0;
    const existing = lexical.get(program.id);
    const lex = Math.max(overlap, existing ? Math.min(1, Math.max(0.25, existing.score / 100)) : 0);
    const vector = vectors.get(program.id);
    const compatible = Boolean(queryVector && vector && queryVector.length === vector.length);
    if (compatible) semanticAvailable = true;
    const semantic = compatible ? cosineSimilarity(queryVector!, vector!) : 0;
    // Keep the specified weights. Offline confidence is separately labeled, not fabricated semantic similarity.
    const score = 0.60 * semantic + 0.25 * lex + 0.15 * tags;
    return { program, existing, lex, semantic, score, direct: named.has(program.id) };
  }).filter(row => row.direct || row.lex > 0 || row.semantic >= 0.45)
    .sort((a,b) => Number(b.direct)-Number(a.direct) || b.score-a.score || a.program.id.localeCompare(b.program.id));
  const matches: GrantMatch[] = scored.slice(0, Math.max(1, Math.min(10, options.limit ?? 10))).map(({program,existing,score,direct}) => ({
    ...(existing ?? { programId: program.id, title: program.title, reason: "Збіг із збереженим описом і пошуковими ознаками; відповідність потребує перевірки.", caution: "Перевірте умови й актуальний прийом у надавача.", evidenceUrl: program.officialUrl }),
    score: Math.round(score * 1000) / 10, matchKind: direct ? "direct" : "thematic", ...grantIntake(program, options.now), ...grantSupport(program.id),
  }));
  return { ...legacy, query: boundedQuery, matches, retrieval: semanticAvailable ? "hybrid" : "lexical",
    weak: !scored.length || (!scored[0].direct && scored[0].score < 0.20),
    explanation: matches.length ? "Знайдено можливі напрями за каталогом. Релевантність не підтверджує прийом або право на грант." : "За цим пошуком збігів у каталозі немає; це не означає відсутності фінансування поза каталогом." };
}
