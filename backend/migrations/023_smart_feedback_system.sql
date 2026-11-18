ALTER TABLE user_feedback
  ADD COLUMN IF NOT EXISTS rating_ux INTEGER CHECK (rating_ux BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS rating_usefulness INTEGER CHECK (rating_usefulness BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS rating_ai INTEGER CHECK (rating_ai BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS task_outcome TEXT NOT NULL DEFAULT 'unspecified'
    CHECK (task_outcome IN ('completed', 'partial', 'failed', 'unspecified')),
  ADD COLUMN IF NOT EXISTS would_recommend BOOLEAN,
  ADD COLUMN IF NOT EXISTS willingness_to_pay TEXT NOT NULL DEFAULT 'none'
    CHECK (willingness_to_pay IN ('none', 'free_only', 'pay_per_application', 'monthly_subscription', 'donation_ready', 'already_paid')),
  ADD COLUMN IF NOT EXISTS suggested_price_uah INTEGER CHECK (suggested_price_uah >= 0 AND suggested_price_uah <= 500000),
  ADD COLUMN IF NOT EXISTS category_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tester_role TEXT NOT NULL DEFAULT 'entrepreneur'
    CHECK (tester_role IN ('entrepreneur', 'fop', 'startup_founder', 'accountant', 'student_business', 'volunteer', 'other')),
  ADD COLUMN IF NOT EXISTS contact_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contact_info TEXT CHECK (length(contact_info) <= 254),
  ADD COLUMN IF NOT EXISTS context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewed', 'planned', 'resolved', 'dismissed')),
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  ADD COLUMN IF NOT EXISTS resolution_note TEXT CHECK (length(resolution_note) <= 2000),
  ADD COLUMN IF NOT EXISTS resolved_commit_or_pr TEXT CHECK (length(resolved_commit_or_pr) <= 120),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS notify_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (notify_status IN ('pending', 'sent', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS notify_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notify_error TEXT CHECK (length(notify_error) <= 500),
  ADD COLUMN IF NOT EXISTS content_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS ai_triage JSONB,
  ADD COLUMN IF NOT EXISTS ai_triaged_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS feedback_change_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES user_feedback(id) ON DELETE CASCADE,
  change_summary TEXT NOT NULL CHECK (length(change_summary) BETWEEN 5 AND 1000),
  pull_request_or_commit TEXT NOT NULL CHECK (length(pull_request_or_commit) <= 120),
  verification_evidence TEXT CHECK (length(verification_evidence) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback_batch_syntheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  feedback_count INTEGER NOT NULL,
  deterministic_metrics JSONB NOT NULL,
  ai_synthesis JSONB,
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'deterministic_only')),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_status_created ON user_feedback (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_feedback_notify_queue ON user_feedback (notify_status, notify_attempts) WHERE notify_status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_user_feedback_rating_created ON user_feedback (rating, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_change_links_feedback_id ON feedback_change_links (feedback_id);
CREATE INDEX IF NOT EXISTS idx_feedback_batch_syntheses_created ON feedback_batch_syntheses (created_at DESC);
