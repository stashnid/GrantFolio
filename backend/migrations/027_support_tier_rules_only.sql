-- 027_support_tier_rules_only.sql
-- Allow rules_only and playbook_only support tiers in catalog_programs

ALTER TABLE catalog_programs DROP CONSTRAINT IF EXISTS catalog_programs_support_tier_check;
ALTER TABLE catalog_programs ADD CONSTRAINT catalog_programs_support_tier_check CHECK (support_tier IN ('deep', 'rules_only', 'playbook_only', 'catalog_only'));
