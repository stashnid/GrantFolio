ALTER TABLE cases ADD COLUMN program_id VARCHAR(64) NOT NULL DEFAULT 'vlasna-sprava';
CREATE INDEX IF NOT EXISTS cases_program_id ON cases(program_id);
