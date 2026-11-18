CREATE TABLE grant_preparation_pilot (
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  program_id TEXT NOT NULL CHECK (program_id = 'vlasna-sprava'),
  reference UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_kopecks INTEGER CHECK (amount_kopecks > 0),
  bank_operation_id TEXT UNIQUE,
  confirmed_at TIMESTAMPTZ,
  UNIQUE (case_id, program_id),
  CHECK ((amount_kopecks IS NULL AND bank_operation_id IS NULL AND confirmed_at IS NULL)
      OR (amount_kopecks IS NOT NULL AND bank_operation_id IS NOT NULL AND confirmed_at IS NOT NULL))
);
