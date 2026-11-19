import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { PLAYBOOKS } from "./data.js";
import type { ProgramPlaybook } from "./schema.js";

type Queryable = Pick<Pool, "query">;

export function programKnowledgeHash(playbook: ProgramPlaybook): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        playbook.searchTags,
        playbook.searchSynonyms,
        playbook.useCaseExamples,
      ]),
    )
    .digest("hex");
}

export async function syncPlaybooks(
  db: Queryable,
): Promise<{ updated: number; total: number }> {
  const records = PLAYBOOKS.map((playbook) => ({
    program_id: playbook.programId,
    support_tier: playbook.supportTier,
    search_tags: playbook.searchTags,
    search_synonyms: playbook.searchSynonyms,
    use_case_examples: playbook.useCaseExamples,
    playbook,
    rules_version: playbook.rulesVersion,
    content_hash: programKnowledgeHash(playbook),
  }));

  const result = await db.query(
    `WITH incoming AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(
         program_id text, support_tier text, search_tags text[], search_synonyms text[],
         use_case_examples text[], playbook jsonb, rules_version text, content_hash text
       )
     )
     INSERT INTO grant_program_knowledge AS existing
       (program_id, support_tier, search_tags, search_synonyms, use_case_examples, playbook, rules_version)
     SELECT program_id, support_tier, search_tags, search_synonyms, use_case_examples, playbook, rules_version
       FROM incoming
       ORDER BY program_id
     ON CONFLICT (program_id) DO UPDATE SET
       support_tier = EXCLUDED.support_tier,
       search_tags = EXCLUDED.search_tags,
       search_synonyms = EXCLUDED.search_synonyms,
       use_case_examples = EXCLUDED.use_case_examples,
       playbook = EXCLUDED.playbook,
       rules_version = EXCLUDED.rules_version,
       embedding_vector = CASE WHEN existing.embedding_hash =
         (SELECT content_hash FROM incoming WHERE program_id = EXCLUDED.program_id)
         THEN existing.embedding_vector ELSE NULL END,
       embedding_model = CASE WHEN existing.embedding_hash =
         (SELECT content_hash FROM incoming WHERE program_id = EXCLUDED.program_id)
         THEN existing.embedding_model ELSE NULL END,
       embedding_hash = CASE WHEN existing.embedding_hash =
         (SELECT content_hash FROM incoming WHERE program_id = EXCLUDED.program_id)
         THEN existing.embedding_hash ELSE NULL END,
       updated_at = NOW()
     WHERE (existing.support_tier, existing.search_tags, existing.search_synonyms,
            existing.use_case_examples, existing.playbook, existing.rules_version)
       IS DISTINCT FROM
           (EXCLUDED.support_tier, EXCLUDED.search_tags, EXCLUDED.search_synonyms,
            EXCLUDED.use_case_examples, EXCLUDED.playbook, EXCLUDED.rules_version)
       OR existing.embedding_hash IS NOT NULL AND existing.embedding_hash <>
         (SELECT content_hash FROM incoming WHERE program_id = EXCLUDED.program_id)`,
    [JSON.stringify(records)],
  );
  return { updated: result.rowCount ?? 0, total: records.length };
}

type SavedEmbedding = {
  program_id: string;
  embedding_vector: number[] | null;
  embedding_model: string | null;
  embedding_hash: string | null;
};

export type ProgramKnowledge = {
  supportTier: ProgramPlaybook["supportTier"];
  searchTags: string[];
  searchSynonyms: string[];
  useCaseExamples: string[];
  playbook: ProgramPlaybook;
  embeddingVector: number[] | null;
  embeddingModel: string | null;
  embeddingHash: string | null;
};

export async function hydrateProgramKnowledge<T extends { id: string }>(
  db: Queryable,
  programs: readonly T[],
): Promise<(T & Partial<ProgramKnowledge>)[]> {
  const existing = await db.query<SavedEmbedding>(
    `SELECT program_id, embedding_vector, embedding_model, embedding_hash
     FROM grant_program_knowledge
     WHERE program_id = ANY($1::text[])`,
    [PLAYBOOKS.map((playbook) => playbook.programId)],
  );
  const embeddings = new Map(existing.rows.map((row) => [row.program_id, row]));
  return programs.map((program) => {
    const curated = PLAYBOOKS.find(
      (playbook) => playbook.programId === program.id,
    );
    if (!curated) return program;
    // Public rule content comes from the reviewed bundle. Database rows only
    // contribute a numerical cache for the exact same reviewed search text.
    const playbook = structuredClone(curated);
    const saved = embeddings.get(program.id);
    const validEmbedding =
      saved?.embedding_hash === programKnowledgeHash(playbook) &&
      Boolean(saved.embedding_model) &&
      Boolean(saved.embedding_vector?.length) &&
      saved.embedding_vector?.every(Number.isFinite);
    return {
      ...program,
      supportTier: playbook.supportTier,
      searchTags: playbook.searchTags,
      searchSynonyms: playbook.searchSynonyms,
      useCaseExamples: playbook.useCaseExamples,
      playbook,
      embeddingVector: validEmbedding ? saved.embedding_vector : null,
      embeddingModel: validEmbedding ? saved.embedding_model : null,
      embeddingHash: validEmbedding ? saved.embedding_hash : null,
    };
  });
}
