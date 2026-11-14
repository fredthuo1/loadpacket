BEGIN;
-- CreateTable
CREATE TABLE "document_processing_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "source_checksum" VARCHAR(64) NOT NULL,
    "pipeline_key" VARCHAR(64) NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'QUEUED',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "lease_token" UUID,
    "lease_expires_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "error_code" VARCHAR(64),
    "attempts" JSONB NOT NULL DEFAULT '[]',
    "result" JSONB,
    "review" JSONB,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_load_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_processing_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_processing_runs_status_lease_expires_at_idx" ON "document_processing_runs"("status", "lease_expires_at");

-- CreateIndex
CREATE INDEX "document_processing_runs_organization_id_created_at_idx" ON "document_processing_runs"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_processing_runs_id_organization_id_key" ON "document_processing_runs"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_processing_runs_organization_id_document_version_i_key" ON "document_processing_runs"("organization_id", "document_version_id", "pipeline_key");

-- CreateIndex
CREATE UNIQUE INDEX "document_processing_runs_organization_id_created_load_id_key" ON "document_processing_runs"("organization_id", "created_load_id");

-- AddForeignKey
ALTER TABLE "document_processing_runs" ADD CONSTRAINT "document_processing_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "document_processing_runs" ADD CONSTRAINT "document_processing_runs_document_version_id_document_id_o_fkey" FOREIGN KEY ("document_version_id", "document_id", "organization_id") REFERENCES "document_versions"("id", "document_id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "document_processing_runs" ADD CONSTRAINT "document_processing_runs_requested_by_user_id_organization_fkey" FOREIGN KEY ("requested_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "document_processing_runs" ADD CONSTRAINT "document_processing_runs_reviewed_by_user_id_organization__fkey" FOREIGN KEY ("reviewed_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "document_processing_runs" ADD CONSTRAINT "document_processing_runs_created_load_id_organization_id_fkey" FOREIGN KEY ("created_load_id", "organization_id") REFERENCES "loads"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE document_processing_runs ADD CONSTRAINT processing_shape CHECK (
 source_checksum ~ '^[0-9a-f]{64}$' AND pipeline_key ~ '^[0-9a-f]{64}$'
 AND status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED') AND attempt_count BETWEEN 0 AND 2
 AND jsonb_typeof(attempts)='array' AND jsonb_array_length(attempts)<=attempt_count
 AND pg_column_size(attempts)<=16384 AND (result IS NULL OR pg_column_size(result)<=1048576)
 AND (review IS NULL OR pg_column_size(review)<=1048576)
 AND ((status='RUNNING' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND started_at IS NOT NULL AND finished_at IS NULL)
 OR (status<>'RUNNING' AND lease_token IS NULL AND lease_expires_at IS NULL))
 AND ((status='SUCCEEDED' AND result IS NOT NULL) OR (status<>'SUCCEEDED' AND result IS NULL))
 AND ((review IS NULL AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL AND created_load_id IS NULL)
 OR (review IS NOT NULL AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL AND created_load_id IS NOT NULL AND status IN ('SUCCEEDED','FAILED'))));
CREATE FUNCTION protect_document_processing() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Processing evidence cannot be deleted'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'QUEUED' OR NEW.attempt_count<>0 OR NEW.review IS NOT NULL OR NEW.attempts<>'[]'::jsonb THEN RAISE EXCEPTION 'Processing starts queued'; END IF;
  IF NOT EXISTS(SELECT 1 FROM document_versions v JOIN documents d ON d.id=v.document_id AND d.organization_id=v.organization_id WHERE v.id=NEW.document_version_id AND v.document_id=NEW.document_id AND v.organization_id=NEW.organization_id AND v.checksum=NEW.source_checksum AND d.type='RATE_CONFIRMATION') THEN RAISE EXCEPTION 'Processing source mismatch'; END IF;
 ELSE
  IF OLD.review IS NOT NULL THEN RAISE EXCEPTION 'Reviewed evidence is immutable'; END IF;
  IF (NEW.id,NEW.organization_id,NEW.document_id,NEW.document_version_id,NEW.source_checksum,NEW.pipeline_key,NEW.requested_by_user_id,NEW.created_at) IS DISTINCT FROM
     (OLD.id,OLD.organization_id,OLD.document_id,OLD.document_version_id,OLD.source_checksum,OLD.pipeline_key,OLD.requested_by_user_id,OLD.created_at) THEN RAISE EXCEPTION 'Processing source is immutable'; END IF;
  IF OLD.status='SUCCEEDED' AND (to_jsonb(NEW)-'review'-'reviewed_by_user_id'-'reviewed_at'-'created_load_id'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'review'-'reviewed_by_user_id'-'reviewed_at'-'created_load_id'-'updated_at') THEN RAISE EXCEPTION 'Successful extraction is immutable'; END IF;
  IF NEW.attempt_count<OLD.attempt_count OR NEW.attempt_count>OLD.attempt_count+1 THEN RAISE EXCEPTION 'Invalid attempt counter'; END IF;
  IF NEW.status='RUNNING' AND (OLD.status NOT IN ('QUEUED','FAILED') OR NEW.attempt_count<>OLD.attempt_count+1 OR NEW.lease_token IS NULL) THEN RAISE EXCEPTION 'Invalid processing claim'; END IF;
  IF NEW.status<>OLD.status AND NEW.status IN ('SUCCEEDED','FAILED') AND OLD.status<>'RUNNING' THEN RAISE EXCEPTION 'Invalid completion'; END IF;
  IF NEW.status='QUEUED' THEN RAISE EXCEPTION 'Processing cannot reset'; END IF;
  IF jsonb_array_length(NEW.attempts)<jsonb_array_length(OLD.attempts) THEN RAISE EXCEPTION 'Attempt history cannot shrink'; END IF;
  FOR n IN 0..jsonb_array_length(OLD.attempts)-1 LOOP
   IF NEW.attempts->n IS DISTINCT FROM OLD.attempts->n THEN RAISE EXCEPTION 'Attempt history is immutable'; END IF;
  END LOOP;
  IF NEW.review IS NOT NULL AND NOT EXISTS(SELECT 1 FROM load_documents WHERE organization_id=NEW.organization_id AND load_id=NEW.created_load_id AND document_id=NEW.document_id AND role='RATE_CONFIRMATION') THEN RAISE EXCEPTION 'Review load source mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER document_processing_guard BEFORE INSERT OR UPDATE OR DELETE ON document_processing_runs FOR EACH ROW EXECUTE FUNCTION protect_document_processing();
REVOKE ALL ON document_processing_runs FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON document_processing_runs FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON document_processing_runs FROM authenticated; END IF;
END $$;

COMMIT;
