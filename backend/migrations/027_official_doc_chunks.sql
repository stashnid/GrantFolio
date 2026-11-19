-- 027_official_doc_chunks.sql: Official Sources Pack and RAG storage for verified grant rules

CREATE TABLE IF NOT EXISTS official_doc_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id VARCHAR(64) NOT NULL,
  doc_id VARCHAR(64) NOT NULL,
  section_title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT NOT NULL,
  embedding_vector JSONB,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_official_doc_chunks_program ON official_doc_chunks(program_id);
CREATE INDEX IF NOT EXISTS idx_official_doc_chunks_doc ON official_doc_chunks(doc_id);
