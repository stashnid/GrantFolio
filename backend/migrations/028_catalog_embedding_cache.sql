-- Catalog-only search caches do not imply a sourced programme playbook exists.
ALTER TABLE grant_program_knowledge ALTER COLUMN playbook DROP NOT NULL;
ALTER TABLE grant_program_knowledge ALTER COLUMN rules_version DROP NOT NULL;
ALTER TABLE grant_program_knowledge ADD CONSTRAINT deep_knowledge_requires_playbook
  CHECK (support_tier <> 'deep' OR (playbook IS NOT NULL AND rules_version IS NOT NULL));
