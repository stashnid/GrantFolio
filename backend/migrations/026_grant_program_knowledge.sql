-- Additive lookup data. Older application revisions ignore this table.
CREATE TABLE grant_program_knowledge (
  program_id TEXT PRIMARY KEY,
  support_tier TEXT NOT NULL CHECK (support_tier IN ('deep', 'catalog_only')),
  search_tags TEXT[] NOT NULL,
  search_synonyms TEXT[] NOT NULL,
  use_case_examples TEXT[] NOT NULL,
  embedding_vector DOUBLE PRECISION[],
  embedding_model TEXT,
  embedding_hash TEXT,
  playbook JSONB NOT NULL CHECK (jsonb_typeof(playbook) = 'object'),
  rules_version TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (embedding_vector IS NULL AND embedding_model IS NULL AND embedding_hash IS NULL)
    OR
    (embedding_vector IS NOT NULL AND cardinality(embedding_vector) > 0
      AND embedding_model IS NOT NULL AND btrim(embedding_model) <> ''
      AND embedding_hash IS NOT NULL AND embedding_hash ~ '^[0-9a-f]{64}$')
  )
);
