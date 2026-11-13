CREATE TABLE IF NOT EXISTS profiles (
  owner_id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
