CREATE TABLE grant_source_checks (
 program_id TEXT PRIMARY KEY,
 source_url TEXT NOT NULL,
 availability JSONB,
 last_attempt_at TIMESTAMPTZ NOT NULL,
 last_error TEXT
);
