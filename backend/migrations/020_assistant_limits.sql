CREATE TABLE assistant_limit_owners (
  owner_id TEXT PRIMARY KEY,
  last_admitted_at TIMESTAMPTZ
);

CREATE TABLE assistant_limit_leases (
  owner_id TEXT NOT NULL REFERENCES assistant_limit_owners(owner_id) ON DELETE CASCADE,
  token UUID PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX assistant_limit_leases_owner ON assistant_limit_leases(owner_id);
