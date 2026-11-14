ALTER TABLE cases ADD COLUMN details JSONB NOT NULL DEFAULT '{"projectDescription":"","customers":"","salesChannels":"","implementationPlan":"","expectedResults":""}';
CREATE TABLE details_commands (
 case_id UUID NOT NULL REFERENCES cases(id),
 idempotency_key UUID NOT NULL,
 request JSONB NOT NULL,
 response JSONB NOT NULL,
 PRIMARY KEY (case_id, idempotency_key)
);
