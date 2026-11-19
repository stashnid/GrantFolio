CREATE TABLE grant_program_snapshots (
  program_id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  last_changed_at TIMESTAMPTZ NOT NULL,
  last_extracted_json JSONB,
  extraction_status TEXT NOT NULL CHECK (
    extraction_status IN (
      'unmodified',
      'verified',
      'verifier_failed',
      'ai_disabled',
      'llm_error',
      'fetch_error'
    )
  ),
  verifier_errors TEXT[] NOT NULL DEFAULT '{}',
  last_error TEXT
);

CREATE TABLE grant_change_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id TEXT NOT NULL,
  field_name TEXT NOT NULL CHECK (
    field_name IN (
      'amount',
      'eligibilityUkraine',
      'requiredDocuments',
      'applicationFormat',
      'allowedCosts',
      'availability'
    )
  ),
  old_value JSONB,
  new_value JSONB NOT NULL,
  evidence_quote TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (
    status IN ('pending_review', 'approved', 'rejected', 'auto_applied')
  ),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  review_notes TEXT
);

CREATE INDEX idx_grant_program_snapshots_extraction_status
  ON grant_program_snapshots (extraction_status);

CREATE INDEX idx_grant_change_proposals_pending_program
  ON grant_change_proposals (program_id, status)
  WHERE status = 'pending_review';
