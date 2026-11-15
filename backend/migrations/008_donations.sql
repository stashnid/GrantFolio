CREATE TABLE donations (
  id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL,
  amount_kopecks BIGINT NOT NULL CHECK (amount_kopecks > 0),
  target TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX donations_owner_created ON donations(owner_id, created_at DESC);
