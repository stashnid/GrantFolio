-- Enable cascading deletes on budget_commands and details_commands
-- so deleting a case removes all related command history.
-- assistant_exchanges already has ON DELETE CASCADE from migration 004.

ALTER TABLE budget_commands DROP CONSTRAINT budget_commands_case_id_fkey;
ALTER TABLE budget_commands ADD CONSTRAINT budget_commands_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;

ALTER TABLE details_commands DROP CONSTRAINT details_commands_case_id_fkey;
ALTER TABLE details_commands ADD CONSTRAINT details_commands_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;

ALTER TABLE budget_history DROP CONSTRAINT budget_history_case_id_fkey;
ALTER TABLE budget_history ADD CONSTRAINT budget_history_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE;
