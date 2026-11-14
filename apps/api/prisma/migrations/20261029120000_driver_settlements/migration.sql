BEGIN;
-- CreateTable
CREATE TABLE "driver_settlements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "original_settlement_id" UUID,
    "kind" VARCHAR(16) NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "net_amount" DECIMAL(12,2) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_revision" INTEGER,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "document_version_id" UUID,
    "cancelled_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" VARCHAR(1000),

    CONSTRAINT "driver_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_settlement_work" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,
    "load_id" UUID NOT NULL,
    "completion_event_id" UUID NOT NULL,
    "source_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),

    CONSTRAINT "driver_settlement_work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_settlement_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "work_id" UUID,
    "kind" VARCHAR(16) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_settlement_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_settlement_payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "payment_date" DATE NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "reference" VARCHAR(200),
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" UUID NOT NULL,
    "request_hash" CHAR(64) NOT NULL,

    CONSTRAINT "driver_settlement_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_settlements_organization_id_driver_id_period_start_idx" ON "driver_settlements"("organization_id", "driver_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "driver_settlements_id_organization_id_key" ON "driver_settlements"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_settlements_id_organization_id_driver_id_currency_key" ON "driver_settlements"("id", "organization_id", "driver_id", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "driver_settlements_organization_id_document_version_id_key" ON "driver_settlements"("organization_id", "document_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_settlement_work_id_organization_id_settlement_id_key" ON "driver_settlement_work"("id", "organization_id", "settlement_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_settlement_work_organization_id_settlement_id_load_i_key" ON "driver_settlement_work"("organization_id", "settlement_id", "load_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_settlement_items_organization_id_settlement_id_posit_key" ON "driver_settlement_items"("organization_id", "settlement_id", "position");

-- CreateIndex
CREATE INDEX "driver_settlement_payments_organization_id_settlement_id_pa_idx" ON "driver_settlement_payments"("organization_id", "settlement_id", "payment_date");

-- CreateIndex
CREATE UNIQUE INDEX "driver_settlement_payments_organization_id_idempotency_key_key" ON "driver_settlement_payments"("organization_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "load_events_id_organization_id_load_id_key" ON "load_events"("id", "organization_id", "load_id");

-- AddForeignKey
ALTER TABLE "driver_settlements" ADD CONSTRAINT "driver_settlements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "driver_settlements" ADD CONSTRAINT "driver_settlements_driver_id_organization_id_fkey" FOREIGN KEY ("driver_id", "organization_id") REFERENCES "drivers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "driver_settlements" ADD CONSTRAINT "driver_settlements_created_by_id_organization_id_fkey" FOREIGN KEY ("created_by_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "driver_settlements" ADD CONSTRAINT "driver_settlements_reviewed_by_id_organization_id_fkey" FOREIGN KEY ("reviewed_by_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "driver_settlements" ADD CONSTRAINT "driver_settlements_approved_by_id_organization_id_fkey" FOREIGN KEY ("approved_by_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "driver_settlements" ADD CONSTRAINT "driver_settlements_cancelled_by_id_organization_id_fkey" FOREIGN KEY ("cancelled_by_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "driver_settlements" ADD CONSTRAINT "driver_settlements_document_version_id_organization_id_fkey" FOREIGN KEY ("document_version_id", "organization_id") REFERENCES "document_versions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "driver_settlements" ADD CONSTRAINT "driver_settlements_original_settlement_id_organization_id__fkey" FOREIGN KEY ("original_settlement_id", "organization_id", "driver_id", "currency") REFERENCES "driver_settlements"("id", "organization_id", "driver_id", "currency") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "driver_settlement_work" ADD CONSTRAINT "driver_settlement_work_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "driver_settlement_work" ADD CONSTRAINT "driver_settlement_work_settlement_id_organization_id_fkey" FOREIGN KEY ("settlement_id", "organization_id") REFERENCES "driver_settlements"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "driver_settlement_work" ADD CONSTRAINT "driver_settlement_work_load_id_organization_id_fkey" FOREIGN KEY ("load_id", "organization_id") REFERENCES "loads"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "driver_settlement_work" ADD CONSTRAINT "driver_settlement_work_completion_event_id_organization_id_fkey" FOREIGN KEY ("completion_event_id", "organization_id", "load_id") REFERENCES "load_events"("id", "organization_id", "load_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "driver_settlement_items" ADD CONSTRAINT "driver_settlement_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "driver_settlement_items" ADD CONSTRAINT "driver_settlement_items_settlement_id_organization_id_fkey" FOREIGN KEY ("settlement_id", "organization_id") REFERENCES "driver_settlements"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "driver_settlement_items" ADD CONSTRAINT "driver_settlement_items_work_id_organization_id_settlement_fkey" FOREIGN KEY ("work_id", "organization_id", "settlement_id") REFERENCES "driver_settlement_work"("id", "organization_id", "settlement_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "driver_settlement_payments" ADD CONSTRAINT "driver_settlement_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "driver_settlement_payments" ADD CONSTRAINT "driver_settlement_payments_settlement_id_organization_id_fkey" FOREIGN KEY ("settlement_id", "organization_id") REFERENCES "driver_settlements"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "driver_settlement_payments" ADD CONSTRAINT "driver_settlement_payments_recorded_by_id_organization_id_fkey" FOREIGN KEY ("recorded_by_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- RenameIndex
ALTER INDEX "carrier_invoices_organization_id_submitted_at_payment_due_at_id" RENAME TO "carrier_invoices_organization_id_submitted_at_payment_due_a_idx";

-- Constraints and triggers intentionally apply only to the new settlement domain.
ALTER TABLE driver_settlements ADD CONSTRAINT settlement_shape CHECK (
 kind IN ('BASE','ADJUSTMENT') AND state IN ('DRAFT','REVIEWED','APPROVED','CANCELLED')
 AND revision >= 1 AND period_start <= period_end AND currency='USD'
 AND ((kind='BASE' AND original_settlement_id IS NULL AND net_amount>0)
   OR (kind='ADJUSTMENT' AND original_settlement_id IS NOT NULL AND net_amount<>0))
 AND ((state IN ('REVIEWED','APPROVED') AND reviewed_by_id IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_revision IS NOT NULL AND reviewed_revision=revision)
   OR (state IN ('DRAFT','CANCELLED') AND reviewed_by_id IS NULL AND reviewed_at IS NULL AND reviewed_revision IS NULL))
 AND ((state='APPROVED' AND approved_by_id IS NOT NULL AND approved_at IS NOT NULL AND document_version_id IS NOT NULL)
   OR (state<>'APPROVED' AND approved_by_id IS NULL AND approved_at IS NULL AND document_version_id IS NULL))
 AND ((state='CANCELLED' AND cancelled_by_id IS NOT NULL AND cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL AND length(trim(cancellation_reason)) BETWEEN 3 AND 1000)
   OR (state<>'CANCELLED' AND cancelled_by_id IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL)));
ALTER TABLE driver_settlement_items ADD CONSTRAINT settlement_item_shape CHECK (
 position>0 AND length(trim(description))>0 AND kind IN ('PER_LOAD','FLAT','BONUS','DEDUCTION','ADJUSTMENT')
 AND ((kind='ADJUSTMENT' AND amount<>0) OR (kind<>'ADJUSTMENT' AND amount>0))
 AND ((kind='PER_LOAD' AND work_id IS NOT NULL) OR (kind<>'PER_LOAD' AND work_id IS NULL)));
ALTER TABLE driver_settlement_payments ADD CONSTRAINT settlement_payment_shape CHECK (
 amount>0 AND currency='USD' AND method IN ('CASH','CHECK','ACH','WIRE','OTHER')
 AND (method='CASH' OR (reference IS NOT NULL AND length(trim(reference))>0))
 AND request_hash ~ '^[0-9a-f]{64}$');
CREATE UNIQUE INDEX settlement_active_work ON driver_settlement_work(organization_id,load_id) WHERE released_at IS NULL;
CREATE UNIQUE INDEX settlement_per_load_item ON driver_settlement_items(organization_id,settlement_id,work_id) WHERE kind='PER_LOAD';
CREATE UNIQUE INDEX settlement_flat_item ON driver_settlement_items(organization_id,settlement_id) WHERE kind='FLAT';
CREATE UNIQUE INDEX settlement_command_key ON financial_audit_events(organization_id,(details->>'requestKey')) WHERE record_type='DRIVER_SETTLEMENT';
ALTER TABLE financial_audit_events ADD CONSTRAINT settlement_command_shape CHECK (
 record_type<>'DRIVER_SETTLEMENT' OR COALESCE(
 jsonb_typeof(details)='object' AND details->>'version'='1'
 AND details->>'requestKey' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 AND details->>'requestHash' ~ '^[0-9a-f]{64}$'
 AND details ?& ARRAY['action','revision','before','after','response'],false));

CREATE FUNCTION settlement_remaining(root uuid, tenant uuid) RETURNS numeric LANGUAGE sql VOLATILE AS $$
 SELECT s.net_amount + COALESCE((SELECT sum(a.net_amount) FROM driver_settlements a WHERE a.organization_id=tenant AND a.original_settlement_id=root AND a.state='APPROVED'),0)
 - COALESCE((SELECT sum(p.amount) FROM driver_settlement_payments p WHERE p.organization_id=tenant AND p.settlement_id=root),0)
 FROM driver_settlements s WHERE s.id=root AND s.organization_id=tenant AND s.kind='BASE' AND s.state='APPROVED'
$$;

CREATE FUNCTION settlement_work_eligible(s driver_settlements, lid uuid, eid uuid) RETURNS boolean LANGUAGE sql VOLATILE AS $$
 SELECT EXISTS(SELECT 1 FROM loads l JOIN load_events e ON e.load_id=l.id AND e.organization_id=l.organization_id
 JOIN load_assignments a ON a.load_id=l.id AND a.organization_id=l.organization_id AND a.id::text=e.metadata->>'assignmentId'
 WHERE l.id=lid AND l.organization_id=s.organization_id AND l.currency=s.currency
 AND l.status IN ('DELIVERED','PAYMENT_READY','INVOICED','PAID') AND e.id=eid AND e.type='LOAD_COMPLETED'
 AND a.driver_id=s.driver_id AND a.status='COMPLETED' AND a.completed_at=e.occurred_at
 AND (e.occurred_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::date BETWEEN s.period_start AND s.period_end
 AND (SELECT count(*) FROM load_events x WHERE x.organization_id=s.organization_id AND x.load_id=lid AND x.type='LOAD_COMPLETED')=1)
$$;

CREATE FUNCTION guard_settlement_header() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent driver_settlements;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Settlement history cannot be deleted'; END IF;
 PERFORM id FROM drivers WHERE id=NEW.driver_id AND organization_id=NEW.organization_id FOR UPDATE;
 IF TG_OP='INSERT' AND (NEW.state<>'DRAFT' OR NEW.revision<>1) THEN RAISE EXCEPTION 'Settlement starts as draft'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.state IN ('APPROVED','CANCELLED') THEN RAISE EXCEPTION 'Final settlement evidence is immutable'; END IF;
  IF (NEW.id,NEW.organization_id,NEW.driver_id,NEW.original_settlement_id,NEW.kind,NEW.currency,NEW.created_by_id,NEW.created_at,NEW.period_start,NEW.period_end)
    IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.driver_id,OLD.original_settlement_id,OLD.kind,OLD.currency,OLD.created_by_id,OLD.created_at,OLD.period_start,OLD.period_end)
    THEN RAISE EXCEPTION 'Settlement identity and period cannot change'; END IF;
  IF NEW.state='APPROVED' AND (OLD.state<>'REVIEWED' OR NEW.revision<>OLD.reviewed_revision OR NEW.net_amount<>OLD.net_amount
    OR (NEW.snapshot-'statementChecksum') IS DISTINCT FROM OLD.snapshot
    OR (NEW.reviewed_by_id,NEW.reviewed_at,NEW.reviewed_revision) IS DISTINCT FROM (OLD.reviewed_by_id,OLD.reviewed_at,OLD.reviewed_revision)) THEN RAISE EXCEPTION 'Approval requires exact reviewed evidence'; END IF;
  IF NEW.state='REVIEWED' AND (OLD.state<>'DRAFT' OR NEW.revision<>OLD.revision OR NEW.net_amount<>OLD.net_amount OR NEW.snapshot IS DISTINCT FROM OLD.snapshot)
    THEN RAISE EXCEPTION 'Review requires unchanged draft evidence'; END IF;
  IF NEW.state='DRAFT' AND NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Draft edits require next revision'; END IF;
 END IF;
 IF NEW.kind='BASE' AND NEW.state<>'CANCELLED' AND EXISTS(
  SELECT 1 FROM driver_settlements s WHERE s.organization_id=NEW.organization_id AND s.driver_id=NEW.driver_id AND s.kind='BASE'
   AND s.state<>'CANCELLED' AND s.id<>NEW.id AND s.period_start<=NEW.period_end AND s.period_end>=NEW.period_start)
  THEN RAISE EXCEPTION 'Driver already has a settlement for an overlapping period'; END IF;
 IF NEW.kind='ADJUSTMENT' THEN
  SELECT * INTO parent FROM driver_settlements WHERE id=NEW.original_settlement_id AND organization_id=NEW.organization_id FOR UPDATE;
  IF parent.id IS NULL OR parent.kind<>'BASE' OR parent.state<>'APPROVED' OR parent.driver_id<>NEW.driver_id OR parent.currency<>NEW.currency
    OR parent.period_start<>NEW.period_start OR parent.period_end<>NEW.period_end THEN RAISE EXCEPTION 'Adjustment requires matching approved original'; END IF;
  IF NEW.state='APPROVED' AND settlement_remaining(parent.id,parent.organization_id)+NEW.net_amount<0
    THEN RAISE EXCEPTION 'Adjustment would reduce obligation below recorded payments'; END IF;
 END IF;
 IF NEW.state='APPROVED' AND NOT EXISTS(SELECT 1 FROM document_versions v JOIN documents d ON d.id=v.document_id AND d.organization_id=v.organization_id
  WHERE v.id=NEW.document_version_id AND v.organization_id=NEW.organization_id AND d.type='OTHER' AND v.mime_type='application/pdf'
   AND v.checksum=NEW.snapshot->>'statementChecksum') THEN RAISE EXCEPTION 'Approval requires matching private statement evidence'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER settlement_header_guard BEFORE INSERT OR UPDATE OR DELETE ON driver_settlements FOR EACH ROW EXECUTE FUNCTION guard_settlement_header();

CREATE FUNCTION guard_settlement_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s driver_settlements; sid uuid; tenant uuid;
BEGIN
 sid:=CASE WHEN TG_OP='DELETE' THEN OLD.settlement_id ELSE NEW.settlement_id END;
 tenant:=CASE WHEN TG_OP='DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
 SELECT * INTO s FROM driver_settlements WHERE id=sid AND organization_id=tenant FOR UPDATE;
 IF s.id IS NULL OR s.state<>'DRAFT' THEN RAISE EXCEPTION 'Only draft settlement items/work can change'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id,NEW.organization_id,NEW.settlement_id) IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.settlement_id)
  THEN RAISE EXCEPTION 'Settlement child identity cannot change'; END IF;
 IF TG_TABLE_NAME='driver_settlement_work' THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Work history cannot be deleted'; END IF;
  IF s.kind<>'BASE' THEN RAISE EXCEPTION 'Adjustments cannot reserve work'; END IF;
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'released_at') IS DISTINCT FROM (to_jsonb(OLD)-'released_at') THEN RAISE EXCEPTION 'Work source evidence is immutable'; END IF;
  IF NEW.released_at IS NULL AND NOT settlement_work_eligible(s,NEW.load_id,NEW.completion_event_id) THEN RAISE EXCEPTION 'Work is incomplete or ambiguous'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER settlement_work_guard BEFORE INSERT OR UPDATE OR DELETE ON driver_settlement_work FOR EACH ROW EXECUTE FUNCTION guard_settlement_child();
CREATE TRIGGER settlement_item_guard BEFORE INSERT OR UPDATE OR DELETE ON driver_settlement_items FOR EACH ROW EXECUTE FUNCTION guard_settlement_child();

CREATE FUNCTION validate_settlement_totals() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s driver_settlements; sid uuid; tenant uuid; calculated numeric; bases integer; flats integer; works integer;
BEGIN
 IF TG_TABLE_NAME='driver_settlements' THEN sid:=NEW.id; tenant:=NEW.organization_id;
 ELSIF TG_OP='DELETE' THEN sid:=OLD.settlement_id; tenant:=OLD.organization_id;
 ELSE sid:=NEW.settlement_id; tenant:=NEW.organization_id; END IF;
 SELECT * INTO s FROM driver_settlements WHERE id=sid AND organization_id=tenant;
 IF s.state='CANCELLED' THEN
  IF EXISTS(SELECT 1 FROM driver_settlement_work WHERE settlement_id=sid AND organization_id=tenant AND released_at IS NULL) THEN RAISE EXCEPTION 'Cancelled reservations must be released'; END IF;
  RETURN NULL;
 END IF;
 SELECT sum(CASE WHEN kind='DEDUCTION' THEN -amount ELSE amount END), count(*) FILTER(WHERE kind='PER_LOAD'),count(*) FILTER(WHERE kind='FLAT')
 INTO calculated,bases,flats FROM driver_settlement_items WHERE settlement_id=sid AND organization_id=tenant;
 IF calculated IS NULL OR calculated<>s.net_amount THEN RAISE EXCEPTION 'Settlement totals do not match itemization'; END IF;
 SELECT count(*) INTO works FROM driver_settlement_work WHERE settlement_id=sid AND organization_id=tenant AND released_at IS NULL;
 IF s.kind='BASE' THEN
  IF works=0 OR NOT ((flats=1 AND bases=0) OR (flats=0 AND bases=works)) OR EXISTS(
    SELECT 1 FROM driver_settlement_items i LEFT JOIN driver_settlement_work w ON w.id=i.work_id AND w.organization_id=i.organization_id
    WHERE i.settlement_id=sid AND i.organization_id=tenant AND (i.kind='ADJUSTMENT' OR (i.kind='PER_LOAD' AND w.released_at IS NOT NULL)))
   THEN RAISE EXCEPTION 'Choose complete per-load coverage or one flat amount'; END IF;
  IF EXISTS(SELECT 1 FROM driver_settlement_work w WHERE w.settlement_id=sid AND w.organization_id=tenant AND w.released_at IS NULL
   AND NOT settlement_work_eligible(s,w.load_id,w.completion_event_id)) THEN RAISE EXCEPTION 'Settlement work no longer eligible'; END IF;
 ELSE
  IF works<>0 OR EXISTS(SELECT 1 FROM driver_settlement_items WHERE settlement_id=sid AND organization_id=tenant AND kind<>'ADJUSTMENT') THEN RAISE EXCEPTION 'Adjustment statement requires adjustment items only'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER settlement_totals_header AFTER INSERT OR UPDATE ON driver_settlements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_settlement_totals();
CREATE CONSTRAINT TRIGGER settlement_totals_items AFTER INSERT OR UPDATE OR DELETE ON driver_settlement_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_settlement_totals();
CREATE CONSTRAINT TRIGGER settlement_totals_work AFTER INSERT OR UPDATE ON driver_settlement_work DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_settlement_totals();

CREATE FUNCTION guard_settlement_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s driver_settlements;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Recorded settlement payments are immutable'; END IF;
 SELECT * INTO s FROM driver_settlements WHERE id=NEW.settlement_id AND organization_id=NEW.organization_id;
 PERFORM id FROM drivers WHERE id=s.driver_id AND organization_id=s.organization_id FOR UPDATE;
 SELECT * INTO s FROM driver_settlements WHERE id=NEW.settlement_id AND organization_id=NEW.organization_id FOR UPDATE;
 IF s.id IS NULL OR s.kind<>'BASE' OR s.state<>'APPROVED' OR s.currency<>NEW.currency THEN RAISE EXCEPTION 'Payment requires matching approved original'; END IF;
 IF NEW.amount>settlement_remaining(s.id,s.organization_id) THEN RAISE EXCEPTION 'Payment exceeds remaining payable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER settlement_payment_guard BEFORE INSERT OR UPDATE OR DELETE ON driver_settlement_payments FOR EACH ROW EXECUTE FUNCTION guard_settlement_payment();

CREATE FUNCTION guard_settlement_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' AND OLD.record_type='DRIVER_SETTLEMENT' THEN RAISE EXCEPTION 'Settlement commands are immutable'; END IF;
 IF TG_OP<>'DELETE' AND NEW.record_type='DRIVER_SETTLEMENT' THEN
  IF TG_OP<>'INSERT' OR NOT EXISTS(SELECT 1 FROM driver_settlements WHERE id=NEW.record_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'Settlement audit requires matching settlement'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER settlement_audit_guard BEFORE INSERT OR UPDATE OR DELETE ON financial_audit_events FOR EACH ROW EXECUTE FUNCTION guard_settlement_audit();

CREATE FUNCTION guard_settlement_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (TG_TABLE_NAME='document_versions' AND EXISTS(SELECT 1 FROM driver_settlements WHERE document_version_id=OLD.id AND organization_id=OLD.organization_id AND state='APPROVED'))
 OR (TG_TABLE_NAME='documents' AND EXISTS(SELECT 1 FROM driver_settlements s JOIN document_versions v ON v.id=s.document_version_id AND v.organization_id=s.organization_id WHERE v.document_id=OLD.id AND v.organization_id=OLD.organization_id AND s.state='APPROVED'))
 THEN RAISE EXCEPTION 'Approved settlement document evidence is immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER settlement_version_guard BEFORE UPDATE OR DELETE ON document_versions FOR EACH ROW EXECUTE FUNCTION guard_settlement_document();
CREATE TRIGGER settlement_document_guard BEFORE UPDATE OR DELETE ON documents FOR EACH ROW EXECUTE FUNCTION guard_settlement_document();

REVOKE ALL ON driver_settlements,driver_settlement_work,driver_settlement_items,driver_settlement_payments FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON driver_settlements,driver_settlement_work,driver_settlement_items,driver_settlement_payments FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON driver_settlements,driver_settlement_work,driver_settlement_items,driver_settlement_payments FROM authenticated; END IF;
END $$;

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
 FROM load_payments p JOIN loads l ON l.id=p.load_id AND l.organization_id=p.organization_id
 UNION ALL
 SELECT 'settlement:'||s.id::text,s.organization_id,(s.approved_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::date,
 'EXPENSE','EXPENSE','Driver Settlement',s.net_amount,s.currency,
 CASE WHEN s.kind='BASE' THEN 'Approved Driver settlement' ELSE 'Approved Driver settlement adjustment' END,'LOADPACKET','POSTED',
 NULL::uuid,NULL::text,s.driver_id,s.snapshot->>'driverName',NULL::text,v.document_id,NULL::uuid,NULL::integer,NULL::text,NULL::uuid
 FROM driver_settlements s JOIN document_versions v ON v.id=s.document_version_id AND v.organization_id=s.organization_id WHERE s.state='APPROVED';
COMMIT;
