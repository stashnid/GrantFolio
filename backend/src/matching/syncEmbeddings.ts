import type { Pool } from "pg";
import { GRANT_CATALOG, type GrantCatalogEntry } from "../grant-catalog-data.js";
import { catalogSearchKnowledge } from "./hybridSearch.js";
import { validVector, type Embedder } from "./embeddings.js";
/** Explicit operational action; one request per stale catalog entry, resumable after failure. */
export async function syncCatalogEmbeddings(db: Pick<Pool,"query">, embedder: Embedder, programs: readonly GrantCatalogEntry[] = GRANT_CATALOG, signal?: AbortSignal) {
  let updated = 0;
  let unchanged = 0;
  for (const program of programs) {
    signal?.throwIfAborted();
    const knowledge = catalogSearchKnowledge(program);
    const existing = await db.query("SELECT embedding_hash, embedding_model, embedding_vector FROM grant_program_knowledge WHERE program_id=$1", [program.id]);
    const saved = existing.rows[0];
    if (saved?.embedding_hash === knowledge.hash && saved.embedding_model === embedder.model && validVector(saved.embedding_vector)) { unchanged++; continue; }
    const vector = await embedder.embed(knowledge.text, "RETRIEVAL_DOCUMENT", signal);
    if (!validVector(vector)) throw new Error("embedding_invalid");
    await db.query(`INSERT INTO grant_program_knowledge(program_id,support_tier,search_tags,search_synonyms,use_case_examples,embedding_vector,embedding_model,embedding_hash)
      VALUES($1,'catalog_only',$2,$3,$4,$5,$6,$7) ON CONFLICT(program_id) DO UPDATE SET
      embedding_vector=EXCLUDED.embedding_vector,embedding_model=EXCLUDED.embedding_model,embedding_hash=EXCLUDED.embedding_hash,updated_at=NOW()`,
      [program.id,knowledge.searchTags,knowledge.searchSynonyms,knowledge.useCaseExamples,vector,embedder.model,knowledge.hash]);
    updated++;
  }
  return { updated, unchanged };
}
