CREATE TABLE newsletter_preview_cooldowns (
  owner_id TEXT PRIMARY KEY,
  last_requested_at TIMESTAMPTZ NOT NULL
);
