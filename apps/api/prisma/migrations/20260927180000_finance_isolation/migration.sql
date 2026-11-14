-- Match the repository's deny-by-default Data API boundary.
DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['financial_transactions','financial_import_batches','financial_import_rows','historical_load_records','financial_audit_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',table_name); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',table_name); END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON finance_records FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON finance_records FROM authenticated; END IF;
END $$;

-- Serialize imports against operational creation too, without modifying existing rows.
CREATE FUNCTION prevent_historical_live_duplicate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text,0));
 IF TG_TABLE_NAME='historical_load_records' THEN
  IF EXISTS(SELECT 1 FROM loads WHERE organization_id=NEW.organization_id AND
    (lower(btrim(load_number))=lower(btrim(NEW.load_number)) OR
     (NEW.invoice_number IS NOT NULL AND lower(btrim(invoice_number))=lower(btrim(NEW.invoice_number))))) THEN
   RAISE EXCEPTION 'Historical load or invoice already exists' USING ERRCODE='23505';
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM historical_load_records WHERE organization_id=NEW.organization_id AND
    (lower(btrim(load_number))=lower(btrim(NEW.load_number)) OR
     (NEW.invoice_number IS NOT NULL AND lower(btrim(invoice_number))=lower(btrim(NEW.invoice_number))))) THEN
   RAISE EXCEPTION 'Load or invoice already exists in imported history' USING ERRCODE='23505';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER historical_live_duplicate BEFORE INSERT OR UPDATE OF load_number,invoice_number ON historical_load_records FOR EACH ROW EXECUTE FUNCTION prevent_historical_live_duplicate();
CREATE TRIGGER live_historical_duplicate BEFORE INSERT OR UPDATE OF load_number,invoice_number ON loads FOR EACH ROW EXECUTE FUNCTION prevent_historical_live_duplicate();
CREATE UNIQUE INDEX historical_load_normalized ON historical_load_records(organization_id,lower(btrim(load_number)));
CREATE UNIQUE INDEX historical_invoice_normalized ON historical_load_records(organization_id,lower(btrim(invoice_number))) WHERE invoice_number IS NOT NULL;
