CREATE TABLE cases (
 id UUID PRIMARY KEY,
 owner_id TEXT NOT NULL,
 title TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 items JSONB NOT NULL DEFAULT '[]',
 total_kopecks BIGINT NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cases_owner_created ON cases(owner_id, created_at DESC);
CREATE TABLE budget_commands (
 case_id UUID NOT NULL REFERENCES cases(id),
 idempotency_key UUID NOT NULL,
 request JSONB NOT NULL,
 response JSONB NOT NULL,
 PRIMARY KEY (case_id, idempotency_key)
);
CREATE TABLE budget_history (
 case_id UUID NOT NULL REFERENCES cases(id),
 revision INTEGER NOT NULL,
 items JSONB NOT NULL,
 total_kopecks BIGINT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(case_id, revision)
);
