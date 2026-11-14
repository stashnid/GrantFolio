CREATE TABLE assistant_exchanges (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  question TEXT NOT NULL,
  reply TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX assistant_exchanges_owner_case_order ON assistant_exchanges(owner_id, case_id, created_at DESC, id DESC);
