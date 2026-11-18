ALTER TABLE grant_preparation_pilot
  ADD COLUMN acquiring_creation_started_at TIMESTAMPTZ,
  ADD COLUMN acquiring_invoice_id TEXT UNIQUE,
  ADD COLUMN acquiring_payment_url TEXT,
  ADD COLUMN acquiring_status TEXT,
  ADD COLUMN acquiring_modified_at TIMESTAMPTZ,
  ADD COLUMN acquiring_reversed_at TIMESTAMPTZ,
  ADD COLUMN acquiring_reversed_invoice_id TEXT;

-- A pending checkout must not outlive its owning case.
CREATE FUNCTION prevent_case_deletion_with_pending_checkout() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM grant_preparation_pilot WHERE case_id=OLD.id
    AND acquiring_creation_started_at IS NOT NULL
    AND (acquiring_status IS NULL OR acquiring_status NOT IN ('expired', 'reversed', 'success'))) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='case has an unresolved payment';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER case_pending_checkout_delete BEFORE DELETE ON cases
  FOR EACH ROW EXECUTE FUNCTION prevent_case_deletion_with_pending_checkout();
