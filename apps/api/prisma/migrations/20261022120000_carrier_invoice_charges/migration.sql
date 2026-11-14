-- B1c: additive invoice evidence. No financial history is rewritten.
BEGIN;
CREATE UNIQUE INDEX load_charge_opportunities_id_organization_id_load_id_key
 ON load_charge_opportunities(id, organization_id, load_id);
CREATE TABLE carrier_invoices (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 load_id uuid NOT NULL,
 original_invoice_id uuid,
 invoice_number varchar(150) NOT NULL,
 issued_at timestamptz(3) NOT NULL,
 payment_terms_days integer NOT NULL CHECK(payment_terms_days BETWEEN 0 AND 365),
 payment_due_at timestamptz(3) NOT NULL,
 currency varchar(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 total_amount numeric(12,2) NOT NULL CHECK(total_amount >= 0),
 document_version_id uuid NOT NULL,
 snapshot jsonb NOT NULL,
 idempotency_key varchar(100) NOT NULL,
 request_hash varchar(64) NOT NULL,
 created_by_user_id uuid NOT NULL,
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 submitted_at timestamptz(3),
 UNIQUE(id, organization_id, load_id),
 UNIQUE(organization_id, invoice_number),
 UNIQUE(organization_id, idempotency_key),
 UNIQUE(organization_id, document_version_id),
 FOREIGN KEY(load_id, organization_id) REFERENCES loads(id, organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(original_invoice_id, organization_id, load_id) REFERENCES carrier_invoices(id, organization_id, load_id) ON DELETE RESTRICT,
 FOREIGN KEY(document_version_id, organization_id) REFERENCES document_versions(id, organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(created_by_user_id, organization_id) REFERENCES users(id, organization_id) ON DELETE RESTRICT,
 CHECK(original_invoice_id IS NULL OR (original_invoice_id <> id AND total_amount > 0))
);
CREATE UNIQUE INDEX carrier_invoices_one_original ON carrier_invoices(organization_id, load_id) WHERE original_invoice_id IS NULL;
CREATE INDEX carrier_invoices_organization_id_load_id_issued_at_idx ON carrier_invoices(organization_id, load_id, issued_at);
CREATE INDEX carrier_invoices_organization_id_submitted_at_payment_due_at_idx ON carrier_invoices(organization_id, submitted_at, payment_due_at);
CREATE TABLE carrier_invoice_charges (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 load_id uuid NOT NULL,
 invoice_id uuid NOT NULL,
 charge_opportunity_id uuid NOT NULL,
 amount numeric(12,2) NOT NULL CHECK(amount > 0),
 currency varchar(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 description text NOT NULL,
 snapshot jsonb NOT NULL,
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(organization_id, charge_opportunity_id),
 FOREIGN KEY(invoice_id, organization_id, load_id) REFERENCES carrier_invoices(id, organization_id, load_id) ON DELETE RESTRICT,
 FOREIGN KEY(charge_opportunity_id, organization_id, load_id) REFERENCES load_charge_opportunities(id, organization_id, load_id) ON DELETE RESTRICT
);
CREATE INDEX carrier_invoice_charges_organization_id_invoice_id_idx ON carrier_invoice_charges(organization_id, invoice_id);
ALTER TABLE load_payments ADD COLUMN invoice_id uuid;
ALTER TABLE load_payments ADD CONSTRAINT load_payments_invoice_id_organization_id_load_id_fkey
 FOREIGN KEY(invoice_id, organization_id, load_id) REFERENCES carrier_invoices(id, organization_id, load_id) ON DELETE RESTRICT;
CREATE INDEX load_payments_organization_id_invoice_id_recorded_at_idx ON load_payments(organization_id, invoice_id, recorded_at);

CREATE FUNCTION protect_carrier_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Issued invoice evidence cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-'submitted_at') IS DISTINCT FROM (to_jsonb(OLD)-'submitted_at')
    OR OLD.submitted_at IS NOT NULL OR NEW.submitted_at IS NULL THEN
   RAISE EXCEPTION 'Issued invoice evidence is immutable; only first submission is permitted';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER carrier_invoice_immutable BEFORE UPDATE OR DELETE ON carrier_invoices
 FOR EACH ROW EXECUTE FUNCTION protect_carrier_invoice();
CREATE FUNCTION protect_invoice_charge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Billed charge allocations are permanent immutable evidence';
END $$;
CREATE TRIGGER invoice_charge_immutable BEFORE UPDATE OR DELETE ON carrier_invoice_charges
 FOR EACH ROW EXECUTE FUNCTION protect_invoice_charge();
CREATE FUNCTION validate_invoice_charge() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c load_charge_opportunities; i carrier_invoices;
BEGIN
 SELECT * INTO i FROM carrier_invoices WHERE id=NEW.invoice_id AND organization_id=NEW.organization_id AND load_id=NEW.load_id;
 SELECT * INTO c FROM load_charge_opportunities WHERE id=NEW.charge_opportunity_id AND organization_id=NEW.organization_id AND load_id=NEW.load_id FOR UPDATE;
 IF i.id IS NULL OR c.id IS NULL OR c.status<>'APPROVED' OR c.amount IS DISTINCT FROM NEW.amount
    OR c.currency<>NEW.currency OR i.currency<>NEW.currency THEN
   RAISE EXCEPTION 'Invoice allocation requires a matching approved charge';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invoice_charge_valid BEFORE INSERT ON carrier_invoice_charges
 FOR EACH ROW EXECUTE FUNCTION validate_invoice_charge();
CREATE FUNCTION protect_allocated_opportunity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM carrier_invoice_charges WHERE charge_opportunity_id=OLD.id AND organization_id=OLD.organization_id) THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Billed opportunity history cannot be deleted'; END IF;
   IF OLD.status<>'APPROVED' OR NEW.status<>'BILLED'
      OR (to_jsonb(NEW)-'status'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'updated_at') THEN
     RAISE EXCEPTION 'Billed opportunity history is immutable';
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER allocated_opportunity_immutable BEFORE UPDATE OR DELETE ON load_charge_opportunities
 FOR EACH ROW EXECUTE FUNCTION protect_allocated_opportunity();

-- CREATE OR REPLACE retains the existing view's ownership and grants.
CREATE OR REPLACE VIEW finance_records AS
 SELECT t.id::text AS id, t.organization_id, t.transaction_date AS date,
 t.type::text AS type, t.effect::text AS effect, t.category, t.amount, t.currency,
 t.description, t.source::text AS source, t.status::text AS status,
 t.load_id, COALESCE(l.load_number,h.load_number) AS load_number, t.driver_id,
 CASE WHEN d.id IS NOT NULL THEN d.first_name || ' ' || d.last_name ELSE h.driver_name END AS driver_name,
 COALESCE(t.broker_name,l.broker_name,h.broker_name) AS broker_name,
 t.document_id,t.import_batch_id,t.import_row_number,t.source_column,t.historical_load_id
 FROM financial_transactions t
 LEFT JOIN loads l ON l.id=t.load_id AND l.organization_id=t.organization_id
 LEFT JOIN drivers d ON d.id=t.driver_id AND d.organization_id=t.organization_id
 LEFT JOIN historical_load_records h ON h.id=t.historical_load_id AND h.organization_id=t.organization_id
 UNION ALL
 SELECT 'load:'||l.id::text,l.organization_id,l.invoice_issued_at::date,
 'INCOME','INCOME','Load Revenue',l.total_rate,l.currency,
 'Invoice '||COALESCE(l.invoice_number,l.load_number),'LOADPACKET','POSTED',
 l.id,l.load_number,NULL::uuid,NULL::text,l.broker_name,NULL::uuid,NULL::uuid,NULL::integer,NULL::text,NULL::uuid
 FROM loads l WHERE l.invoice_issued_at IS NOT NULL AND l.status IN ('INVOICED','PAID')
 AND NOT EXISTS(SELECT 1 FROM carrier_invoices i WHERE i.organization_id=l.organization_id AND i.load_id=l.id AND i.original_invoice_id IS NULL)
 UNION ALL
 SELECT 'invoice:'||i.id::text,i.organization_id,i.issued_at::date,
 'INCOME','INCOME','Load Revenue',i.total_amount,i.currency,
 'Invoice '||i.invoice_number,'LOADPACKET','POSTED',
 l.id,l.load_number,NULL::uuid,NULL::text,l.broker_name,v.document_id,NULL::uuid,NULL::integer,NULL::text,NULL::uuid
 FROM carrier_invoices i JOIN loads l ON l.id=i.load_id AND l.organization_id=i.organization_id
 JOIN document_versions v ON v.id=i.document_version_id AND v.organization_id=i.organization_id
 WHERE i.submitted_at IS NOT NULL
 UNION ALL
 SELECT 'payment:'||p.id::text,p.organization_id,p.recorded_at::date,
 'PAYMENT','PAYMENT','Customer Payment',p.amount,p.currency,
 'Payment for '||l.load_number,'LOADPACKET','POSTED',l.id,l.load_number,
 NULL::uuid,NULL::text,l.broker_name,NULL::uuid,NULL::uuid,NULL::integer,NULL::text,NULL::uuid
 FROM load_payments p JOIN loads l ON l.id=p.load_id AND l.organization_id=p.organization_id;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON carrier_invoices,carrier_invoice_charges,finance_records FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON carrier_invoices,carrier_invoice_charges,finance_records FROM authenticated; END IF;
END $$;
COMMIT;
