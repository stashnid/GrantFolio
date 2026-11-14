CREATE TABLE IF NOT EXISTS user_feedback (
  id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  task TEXT NOT NULL CHECK (task IN ('profile', 'project', 'budget', 'assistant', 'catalog', 'export')),
  comment TEXT NOT NULL CHECK (length(comment) BETWEEN 1 AND 3000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_owner_created ON user_feedback(owner_id, created_at DESC);
