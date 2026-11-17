CREATE TABLE funding_discovery_sources (
 source_id TEXT PRIMARY KEY,
 last_attempt_at TIMESTAMPTZ NOT NULL,
 last_success_at TIMESTAMPTZ,
 last_error TEXT,
 discovered_count INTEGER NOT NULL DEFAULT 0 CHECK (discovered_count >= 0),
 rejected_count INTEGER NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
 truncated BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE funding_discovery_candidates (
 source_id TEXT NOT NULL,
 external_id TEXT NOT NULL,
 candidate JSONB NOT NULL CHECK (jsonb_typeof(candidate) = 'object'),
 last_seen_at TIMESTAMPTZ NOT NULL,
 PRIMARY KEY (source_id, external_id)
);
