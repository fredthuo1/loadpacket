-- CreateEnum
CREATE TYPE "FinancialType" AS ENUM ('INCOME', 'EXPENSE', 'PAYMENT', 'ADJUSTMENT', 'DRIVER_PAY');

-- CreateEnum
CREATE TYPE "FinancialEffect" AS ENUM ('INCOME', 'EXPENSE', 'PAYMENT');

-- CreateEnum
CREATE TYPE "FinancialStatus" AS ENUM ('POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "FinancialSource" AS ENUM ('MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "FinancialImportStatus" AS ENUM ('DRAFT', 'PREVIEWED', 'CONFIRMED', 'REVERSED');

-- CreateTable
CREATE TABLE "financial_transactions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" "FinancialType" NOT NULL,
    "effect" "FinancialEffect" NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "transaction_date" DATE NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "memo" VARCHAR(1000),
    "vendor_name" VARCHAR(200),
    "broker_name" VARCHAR(200),
    "load_id" UUID,
    "driver_id" UUID,
    "document_id" UUID,
    "historical_load_id" UUID,
    "import_batch_id" UUID,
    "import_row_number" INTEGER,
    "source_column" VARCHAR(100),
    "correction_of_id" UUID,
    "source" "FinancialSource" NOT NULL DEFAULT 'MANUAL',
    "status" "FinancialStatus" NOT NULL DEFAULT 'POSTED',
    "idempotency_key" VARCHAR(100) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_import_batches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "file_name" VARCHAR(200) NOT NULL,
    "file_checksum" VARCHAR(64) NOT NULL,
    "file_bytes" BYTEA NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "headers" JSONB NOT NULL,
    "column_mapping" JSONB NOT NULL,
    "counts" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "status" "FinancialImportStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "financial_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_import_rows" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "normalized_data" JSONB NOT NULL,
    "issues" JSONB NOT NULL,

    CONSTRAINT "financial_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historical_load_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "load_number" VARCHAR(100) NOT NULL,
    "invoice_number" VARCHAR(100),
    "broker_name" VARCHAR(200) NOT NULL,
    "delivery_date" DATE NOT NULL,
    "origin" VARCHAR(300),
    "destination" VARCHAR(300),
    "miles" DECIMAL(10,2),
    "driver_name" VARCHAR(200),
    "truck_reference" VARCHAR(100),
    "gross_revenue" DECIMAL(12,2) NOT NULL,
    "payment_status" VARCHAR(20) NOT NULL,
    "due_date" DATE,
    "import_batch_id" UUID NOT NULL,
    "import_row_number" INTEGER NOT NULL,
    "status" "FinancialStatus" NOT NULL DEFAULT 'POSTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historical_load_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_audit_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "record_id" UUID NOT NULL,
    "record_type" VARCHAR(30) NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "details" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_transactions_organization_id_transaction_date_typ_idx" ON "financial_transactions"("organization_id", "transaction_date", "type");

-- CreateIndex
CREATE INDEX "financial_transactions_organization_id_category_transaction_idx" ON "financial_transactions"("organization_id", "category", "transaction_date");

-- CreateIndex
CREATE INDEX "financial_transactions_organization_id_load_id_idx" ON "financial_transactions"("organization_id", "load_id");

-- CreateIndex
CREATE INDEX "financial_transactions_organization_id_driver_id_transactio_idx" ON "financial_transactions"("organization_id", "driver_id", "transaction_date");

-- CreateIndex
CREATE INDEX "financial_transactions_organization_id_import_batch_id_idx" ON "financial_transactions"("organization_id", "import_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_transactions_id_organization_id_key" ON "financial_transactions"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_transactions_organization_id_idempotency_key_key" ON "financial_transactions"("organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "financial_import_batches_organization_id_created_at_idx" ON "financial_import_batches"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "financial_import_batches_id_organization_id_key" ON "financial_import_batches"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_import_batches_organization_id_file_checksum_key" ON "financial_import_batches"("organization_id", "file_checksum");

-- CreateIndex
CREATE INDEX "financial_import_rows_organization_id_batch_id_idx" ON "financial_import_rows"("organization_id", "batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_import_rows_batch_id_row_number_key" ON "financial_import_rows"("batch_id", "row_number");

-- CreateIndex
CREATE UNIQUE INDEX "financial_import_rows_id_organization_id_key" ON "financial_import_rows"("id", "organization_id");

-- CreateIndex
CREATE INDEX "historical_load_records_organization_id_delivery_date_idx" ON "historical_load_records"("organization_id", "delivery_date");

-- CreateIndex
CREATE UNIQUE INDEX "historical_load_records_id_organization_id_key" ON "historical_load_records"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "historical_load_records_organization_id_load_number_key" ON "historical_load_records"("organization_id", "load_number");

-- CreateIndex
CREATE UNIQUE INDEX "historical_load_records_import_batch_id_import_row_number_key" ON "historical_load_records"("import_batch_id", "import_row_number");

-- CreateIndex
CREATE INDEX "financial_audit_events_organization_id_created_at_idx" ON "financial_audit_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "financial_audit_events_organization_id_record_id_idx" ON "financial_audit_events"("organization_id", "record_id");

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_created_by_id_organization_id_fkey" FOREIGN KEY ("created_by_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_load_id_organization_id_fkey" FOREIGN KEY ("load_id", "organization_id") REFERENCES "loads"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_driver_id_organization_id_fkey" FOREIGN KEY ("driver_id", "organization_id") REFERENCES "drivers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_document_id_organization_id_fkey" FOREIGN KEY ("document_id", "organization_id") REFERENCES "documents"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_historical_load_id_organization_id_fkey" FOREIGN KEY ("historical_load_id", "organization_id") REFERENCES "historical_load_records"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_import_batch_id_organization_id_fkey" FOREIGN KEY ("import_batch_id", "organization_id") REFERENCES "financial_import_batches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_correction_of_id_organization_id_fkey" FOREIGN KEY ("correction_of_id", "organization_id") REFERENCES "financial_transactions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_import_batches" ADD CONSTRAINT "financial_import_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_import_batches" ADD CONSTRAINT "financial_import_batches_created_by_id_organization_id_fkey" FOREIGN KEY ("created_by_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_import_rows" ADD CONSTRAINT "financial_import_rows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_import_rows" ADD CONSTRAINT "financial_import_rows_batch_id_organization_id_fkey" FOREIGN KEY ("batch_id", "organization_id") REFERENCES "financial_import_batches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_load_records" ADD CONSTRAINT "historical_load_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_load_records" ADD CONSTRAINT "historical_load_records_import_batch_id_organization_id_fkey" FOREIGN KEY ("import_batch_id", "organization_id") REFERENCES "financial_import_batches"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_audit_events" ADD CONSTRAINT "financial_audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_audit_events" ADD CONSTRAINT "financial_audit_events_actor_id_organization_id_fkey" FOREIGN KEY ("actor_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE financial_transactions ADD CONSTRAINT finance_currency CHECK (currency='USD'),
 ADD CONSTRAINT finance_amount CHECK ((type='ADJUSTMENT' OR amount >= 0) AND amount <> 0),
 ADD CONSTRAINT finance_effect CHECK ((type='INCOME' AND effect='INCOME') OR (type IN ('EXPENSE','DRIVER_PAY') AND effect='EXPENSE') OR (type='PAYMENT' AND effect='PAYMENT') OR type='ADJUSTMENT'),
 ADD CONSTRAINT finance_provenance CHECK ((source='MANUAL' AND import_batch_id IS NULL) OR (source='IMPORT' AND import_batch_id IS NOT NULL AND import_row_number IS NOT NULL AND historical_load_id IS NOT NULL));
ALTER TABLE financial_import_batches ADD CONSTRAINT finance_file_limit CHECK (octet_length(file_bytes) <= 5242880);

CREATE VIEW finance_records AS
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
 UNION ALL
 SELECT 'payment:'||p.id::text,p.organization_id,p.recorded_at::date,
 'PAYMENT','PAYMENT','Customer Payment',p.amount,p.currency,
 'Payment for '||l.load_number,'LOADPACKET','POSTED',l.id,l.load_number,
 NULL::uuid,NULL::text,l.broker_name,NULL::uuid,NULL::uuid,NULL::integer,NULL::text,NULL::uuid
 FROM load_payments p JOIN loads l ON l.id=p.load_id AND l.organization_id=p.organization_id;

CREATE FUNCTION protect_financial_amounts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') OR OLD.status='VOID' THEN
   RAISE EXCEPTION 'Financial entries are immutable; record an adjustment';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER financial_amounts_immutable BEFORE UPDATE ON financial_transactions
 FOR EACH ROW EXECUTE FUNCTION protect_financial_amounts();
