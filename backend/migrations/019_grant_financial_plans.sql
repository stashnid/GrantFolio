CREATE TABLE grant_financial_plans (
  case_id UUID NOT NULL,
  program_id TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  case_revision INTEGER NOT NULL CHECK (case_revision >= 0),
  application_revision INTEGER NOT NULL CHECK (application_revision > 0),
  revision INTEGER NOT NULL CHECK (revision > 0),
  plan JSONB NOT NULL CHECK (jsonb_typeof(plan) = 'object'),
  PRIMARY KEY (case_id, program_id, rules_version),
  FOREIGN KEY (case_id, program_id, rules_version)
    REFERENCES grant_applications(case_id, program_id, rules_version) ON DELETE CASCADE
);
