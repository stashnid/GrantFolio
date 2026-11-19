CREATE TABLE agent_proposals (
 id UUID PRIMARY KEY, owner_id TEXT NOT NULL, case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK (kind IN ('text_application_fields','profile_fields','financial_assumptions')),
 changes JSONB NOT NULL, case_revision INTEGER NOT NULL, profile_revision INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied')),
 applied_key UUID, applied_request JSONB, applied_result JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), applied_at TIMESTAMPTZ
);
CREATE INDEX agent_proposals_owner_case ON agent_proposals(owner_id, case_id, created_at DESC);
CREATE UNIQUE INDEX agent_proposals_owner_key ON agent_proposals(owner_id, applied_key) WHERE applied_key IS NOT NULL;
ALTER TABLE assistant_exchanges ADD COLUMN agent_payload JSONB NOT NULL DEFAULT '{}'::jsonb;
