CREATE TABLE IF NOT EXISTS advisor_conversation_meta (
  owner_id TEXT NOT NULL,
  conversation_id UUID NOT NULL,
  title TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, conversation_id)
);
