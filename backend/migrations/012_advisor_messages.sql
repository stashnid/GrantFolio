CREATE TABLE advisor_messages (
 id UUID PRIMARY KEY,
 conversation_id UUID NOT NULL,
 owner_id TEXT NOT NULL,
 question TEXT NOT NULL,
 reply TEXT NOT NULL,
 payload JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX advisor_messages_owner_conversation ON advisor_messages(owner_id, conversation_id, created_at, id);
