CREATE TABLE grant_applications (
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  case_revision INTEGER NOT NULL CHECK (case_revision >= 0),
  revision INTEGER NOT NULL CHECK (revision > 0),
  answers JSONB NOT NULL CHECK (jsonb_typeof(answers) = 'object'),
  PRIMARY KEY (case_id, program_id, rules_version)
);
