-- 026_program_playbooks_and_search.sql
-- Flagship Playbooks, Support Tier, Search enrichment & Embeddings for Catalog Programs

CREATE TABLE IF NOT EXISTS catalog_programs (
  program_id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  support_tier TEXT NOT NULL DEFAULT 'catalog_only' CHECK (support_tier IN ('deep', 'catalog_only')),
  search_tags TEXT[] NOT NULL DEFAULT '{}',
  search_synonyms TEXT[] NOT NULL DEFAULT '{}',
  use_case_examples TEXT[] NOT NULL DEFAULT '{}',
  embedding_vector JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_programs_tier ON catalog_programs (support_tier);
