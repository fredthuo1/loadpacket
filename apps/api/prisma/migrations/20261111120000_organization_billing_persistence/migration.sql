-- REVIEW ONLY: generated offline; never applied by LP-PRODUCT-B4.3C2.
-- No enrollment/backfill, provider setup, or live enforcement is performed here.
BEGIN;

-- CreateTable
CREATE TABLE "organization_subscriptions" (
    "organization_id" UUID NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN',
    "revision" BIGINT NOT NULL DEFAULT 0,
    "enrolled_at" TIMESTAMPTZ(3),
    "first_trial_started_at" TIMESTAMPTZ(3),
    "plan_id" VARCHAR(100),
    "plan_version" INTEGER,
    "plan_snapshot" JSONB,
    "cadence" VARCHAR(8),
    "paid_period_started_at" TIMESTAMPTZ(3),
    "paid_period_ends_at" TIMESTAMPTZ(3),
    "first_payment_failed_at" TIMESTAMPTZ(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "organization_billing_customers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "environment" VARCHAR(16) NOT NULL,
    "provider_account_id" VARCHAR(200) NOT NULL,
    "external_customer_id" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_billing_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_billing_links" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "environment" VARCHAR(16) NOT NULL,
    "provider_account_id" VARCHAR(200) NOT NULL,
    "external_subscription_id" VARCHAR(200) NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "retired_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_billing_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_billing_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "link_id" UUID,
    "actor_id" UUID,
    "source" VARCHAR(16) NOT NULL,
    "source_scope" VARCHAR(512) NOT NULL,
    "source_event_id" VARCHAR(200) NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "normalized_input" JSONB NOT NULL,
    "effective_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_revision" BIGINT,
    "before_snapshot" JSONB,
    "after_snapshot" JSONB,
    "outcome" VARCHAR(16),
    "response" JSONB,
    "finalized_at" TIMESTAMPTZ(3),

    CONSTRAINT "organization_billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_usage_buckets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "capability" VARCHAR(32) NOT NULL,
    "window_key" VARCHAR(128) NOT NULL,
    "window_started_at" TIMESTAMPTZ(3) NOT NULL,
    "window_ends_at" TIMESTAMPTZ(3) NOT NULL,
    "plan_version" INTEGER NOT NULL,
    "limit" BIGINT,
    "used" BIGINT NOT NULL DEFAULT 0,
    "reserved" BIGINT NOT NULL DEFAULT 0,
    "configuration_event_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_usage_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_usage_reservations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "bucket_id" UUID NOT NULL,
    "command_event_id" UUID NOT NULL,
    "operation_key" VARCHAR(200) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "quantity" BIGINT NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'RESERVED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMPTZ(3),
    "outcome_evidence" JSONB,

    CONSTRAINT "organization_usage_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_entitlement_grants" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "load_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "assignment_generation_key" CHAR(64) NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL,
    "assignment_event_id" UUID,
    "decision_event_id" UUID NOT NULL,
    "subscription_revision" BIGINT NOT NULL,
    "policy_version" INTEGER NOT NULL,
    "origin" VARCHAR(32) NOT NULL,
    "evidence" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_entitlement_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_billing_customers_organization_id_idx" ON "organization_billing_customers"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_customer_scope_key" ON "organization_billing_customers"("id", "organization_id", "provider", "environment", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_customer_external_key" ON "organization_billing_customers"("provider", "environment", "provider_account_id", "external_customer_id");

-- CreateIndex
CREATE INDEX "organization_billing_links_organization_id_created_at_idx" ON "organization_billing_links"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "billing_link_tenant_key" ON "organization_billing_links"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_link_external_key" ON "organization_billing_links"("provider", "environment", "provider_account_id", "external_subscription_id");

-- CreateIndex
CREATE INDEX "organization_billing_events_organization_id_received_at_idx" ON "organization_billing_events"("organization_id", "received_at");

-- CreateIndex
CREATE INDEX "organization_billing_events_outcome_received_at_idx" ON "organization_billing_events"("outcome", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "billing_event_tenant_key" ON "organization_billing_events"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_event_delivery_key" ON "organization_billing_events"("source", "source_scope", "source_event_id");

-- CreateIndex
CREATE INDEX "organization_usage_buckets_organization_id_capability_windo_idx" ON "organization_usage_buckets"("organization_id", "capability", "window_started_at");

-- CreateIndex
CREATE UNIQUE INDEX "usage_bucket_tenant_key" ON "organization_usage_buckets"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "usage_bucket_window_key" ON "organization_usage_buckets"("organization_id", "capability", "window_key");

-- CreateIndex
CREATE INDEX "organization_usage_reservations_bucket_id_organization_id_s_idx" ON "organization_usage_reservations"("bucket_id", "organization_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "usage_reservation_tenant_key" ON "organization_usage_reservations"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "usage_reservation_operation_key" ON "organization_usage_reservations"("organization_id", "operation_key");

-- CreateIndex
CREATE INDEX "assignment_entitlement_grants_organization_id_driver_id_loa_idx" ON "assignment_entitlement_grants"("organization_id", "driver_id", "load_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_grant_generation_key" ON "assignment_entitlement_grants"("organization_id", "load_id", "assignment_generation_key");

-- AddForeignKey
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "organization_billing_customers" ADD CONSTRAINT "organization_billing_customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "organization_billing_links" ADD CONSTRAINT "organization_billing_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "organization_billing_links" ADD CONSTRAINT "billing_link_customer_scope_fk" FOREIGN KEY ("customer_id", "organization_id", "provider", "environment", "provider_account_id") REFERENCES "organization_billing_customers"("id", "organization_id", "provider", "environment", "provider_account_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "organization_billing_events" ADD CONSTRAINT "organization_billing_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "organization_billing_events" ADD CONSTRAINT "billing_event_link_tenant_fk" FOREIGN KEY ("link_id", "organization_id") REFERENCES "organization_billing_links"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "organization_billing_events" ADD CONSTRAINT "billing_event_actor_tenant_fk" FOREIGN KEY ("actor_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "organization_usage_buckets" ADD CONSTRAINT "organization_usage_buckets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "organization_usage_buckets" ADD CONSTRAINT "usage_bucket_config_tenant_fk" FOREIGN KEY ("configuration_event_id", "organization_id") REFERENCES "organization_billing_events"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "organization_usage_reservations" ADD CONSTRAINT "organization_usage_reservations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "organization_usage_reservations" ADD CONSTRAINT "usage_reservation_bucket_tenant_fk" FOREIGN KEY ("bucket_id", "organization_id") REFERENCES "organization_usage_buckets"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "organization_usage_reservations" ADD CONSTRAINT "usage_reservation_event_tenant_fk" FOREIGN KEY ("command_event_id", "organization_id") REFERENCES "organization_billing_events"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assignment_entitlement_grants" ADD CONSTRAINT "assignment_entitlement_grants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assignment_entitlement_grants" ADD CONSTRAINT "assignment_grant_load_tenant_fk" FOREIGN KEY ("load_id", "organization_id") REFERENCES "loads"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assignment_entitlement_grants" ADD CONSTRAINT "assignment_grant_driver_tenant_fk" FOREIGN KEY ("driver_id", "organization_id") REFERENCES "drivers"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assignment_entitlement_grants" ADD CONSTRAINT "assignment_grant_occurrence_fk" FOREIGN KEY ("assignment_event_id", "organization_id", "load_id") REFERENCES "load_events"("id", "organization_id", "load_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assignment_entitlement_grants" ADD CONSTRAINT "assignment_grant_decision_tenant_fk" FOREIGN KEY ("decision_event_id", "organization_id") REFERENCES "organization_billing_events"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;
-- BEGIN MANUAL BILLING INVARIANTS (Prisma cannot represent these).
CREATE UNIQUE INDEX billing_one_current_link
  ON organization_billing_links(organization_id) WHERE is_current;
CREATE UNIQUE INDEX billing_applied_revision
  ON organization_billing_events(organization_id, applied_revision)
  WHERE applied_revision IS NOT NULL;

ALTER TABLE organization_subscriptions ADD CONSTRAINT billing_subscription_shape CHECK (
  state IN ('UNKNOWN','GRANDFATHERED','TRIALING','ACTIVE','PAST_DUE','CANCELED','EXPIRED')
  AND revision >= 0
  AND (cadence IS NULL OR cadence IN ('MONTHLY','ANNUAL'))
  AND ((plan_id IS NULL AND plan_version IS NULL AND plan_snapshot IS NULL)
       OR (plan_id IS NOT NULL AND btrim(plan_id)<>'' AND plan_version IS NOT NULL
           AND plan_version>0 AND plan_snapshot IS NOT NULL AND jsonb_typeof(plan_snapshot)='object'))
  AND (state IN ('UNKNOWN','GRANDFATHERED') OR enrolled_at IS NOT NULL)
  AND (first_trial_started_at IS NULL OR (enrolled_at IS NOT NULL AND first_trial_started_at>=enrolled_at))
  AND ((paid_period_started_at IS NULL AND paid_period_ends_at IS NULL)
       OR (paid_period_started_at IS NOT NULL AND paid_period_ends_at IS NOT NULL
           AND enrolled_at IS NOT NULL AND paid_period_started_at>=enrolled_at
           AND paid_period_ends_at>paid_period_started_at))
  AND (first_payment_failed_at IS NULL OR (enrolled_at IS NOT NULL AND first_payment_failed_at>=enrolled_at))
  AND (state<>'GRANDFATHERED' OR (enrolled_at IS NULL AND first_trial_started_at IS NULL
       AND paid_period_started_at IS NULL AND first_payment_failed_at IS NULL
       AND plan_id IS NULL AND NOT cancel_at_period_end))
  AND (state NOT IN ('TRIALING','ACTIVE','PAST_DUE','CANCELED') OR plan_id IS NOT NULL)
  AND (state<>'TRIALING' OR first_trial_started_at IS NOT NULL)
  AND (state NOT IN ('ACTIVE','CANCELED') OR (paid_period_ends_at IS NOT NULL AND cadence IS NOT NULL))
  AND (state<>'PAST_DUE' OR (first_payment_failed_at IS NOT NULL AND cadence IS NOT NULL))
  AND (NOT cancel_at_period_end OR paid_period_ends_at IS NOT NULL)
);
ALTER TABLE organization_billing_customers ADD CONSTRAINT billing_customer_shape CHECK (
  btrim(provider)<>'' AND environment IN ('TEST','LIVE')
  AND btrim(provider_account_id)<>'' AND btrim(external_customer_id)<>''
);
ALTER TABLE organization_billing_links ADD CONSTRAINT billing_link_shape CHECK (
  btrim(external_subscription_id)<>'' AND
  ((is_current AND retired_at IS NULL) OR (NOT is_current AND retired_at IS NOT NULL AND retired_at>=created_at))
);
ALTER TABLE organization_billing_events ADD CONSTRAINT billing_event_shape CHECK (
  source IN ('OWNER','OPERATION','SYSTEM','PROVIDER') AND btrim(source_scope)<>''
  AND btrim(source_event_id)<>'' AND btrim(kind)<>'' AND payload_hash ~ '^[0-9a-f]{64}$'
  AND schema_version>0 AND jsonb_typeof(normalized_input)='object'
  AND ((source IN ('OWNER','OPERATION') AND actor_id IS NOT NULL AND link_id IS NULL)
    OR (source='SYSTEM' AND actor_id IS NULL AND link_id IS NULL)
    OR (source='PROVIDER' AND actor_id IS NULL AND link_id IS NOT NULL))
  AND ((outcome IS NULL AND finalized_at IS NULL AND response IS NULL
        AND applied_revision IS NULL AND before_snapshot IS NULL AND after_snapshot IS NULL)
    OR (outcome IS NOT NULL AND outcome IN ('APPLIED','IGNORED','REJECTED')
        AND finalized_at IS NOT NULL AND finalized_at>=received_at
        AND response IS NOT NULL AND jsonb_typeof(response)='object'))
  AND (applied_revision IS NULL OR (applied_revision>=0 AND outcome='APPLIED'
       AND source<>'OPERATION' AND after_snapshot IS NOT NULL AND jsonb_typeof(after_snapshot)='object'))
);
ALTER TABLE organization_usage_buckets ADD CONSTRAINT usage_bucket_shape CHECK (
  capability IN ('LOAD_CREATE','LOAD_ASSIGN','DOCUMENT_PROCESS') AND btrim(window_key)<>''
  AND window_ends_at>window_started_at AND plan_version>0
  AND used>=0 AND reserved>=0 AND used<=9007199254740991-reserved
  AND ("limit" IS NULL OR ("limit">=0 AND "limit"<=9007199254740991))
);
ALTER TABLE organization_usage_reservations ADD CONSTRAINT usage_reservation_shape CHECK (
  btrim(operation_key)<>'' AND request_hash ~ '^[0-9a-f]{64}$'
  AND quantity>0 AND quantity<=9007199254740991
  AND ((state='RESERVED' AND finalized_at IS NULL AND outcome_evidence IS NULL)
    OR (state IN ('COMMITTED','RELEASED') AND finalized_at IS NOT NULL
        AND finalized_at>=created_at AND outcome_evidence IS NOT NULL
        AND jsonb_typeof(outcome_evidence)='object' AND outcome_evidence<>'{}'::jsonb))
);
ALTER TABLE assignment_entitlement_grants ADD CONSTRAINT assignment_grant_shape CHECK (
  assignment_generation_key ~ '^[0-9a-f]{64}$' AND subscription_revision>=0
  AND policy_version=1 AND jsonb_typeof(evidence)='object' AND evidence<>'{}'::jsonb
  AND origin IN ('AUTHORIZED_ASSIGNMENT','LEGACY_SNAPSHOT')
  AND (origin<>'AUTHORIZED_ASSIGNMENT' OR assignment_event_id IS NOT NULL)
  AND assigned_at<=created_at
);

CREATE FUNCTION billing_protect_subscription() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Subscription/trial history cannot be deleted'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.revision<>0 OR NEW.state NOT IN ('UNKNOWN','GRANDFATHERED')
       OR NEW.enrolled_at IS NOT NULL OR NEW.first_trial_started_at IS NOT NULL
       OR NEW.paid_period_started_at IS NOT NULL OR NEW.first_payment_failed_at IS NOT NULL
    THEN RAISE EXCEPTION 'Subscriptions start with an explicit audited unenrolled state'; END IF;
  ELSE
    IF NEW.organization_id<>OLD.organization_id OR NEW.created_at<>OLD.created_at
       OR NEW.revision<>OLD.revision+1
    THEN RAISE EXCEPTION 'Subscription identity is immutable; revision must advance once'; END IF;
    IF (OLD.enrolled_at IS NOT NULL AND NEW.enrolled_at IS DISTINCT FROM OLD.enrolled_at)
       OR (OLD.first_trial_started_at IS NOT NULL AND NEW.first_trial_started_at IS DISTINCT FROM OLD.first_trial_started_at)
       OR (NEW.state='GRANDFATHERED' AND OLD.enrolled_at IS NOT NULL)
    THEN RAISE EXCEPTION 'Enrollment and first-trial history cannot be reset'; END IF;
    IF NEW.state='TRIALING' AND OLD.state<>'TRIALING' AND OLD.first_trial_started_at IS NOT NULL
    THEN RAISE EXCEPTION 'A used trial cannot be reactivated'; END IF;
    IF NEW.first_trial_started_at IS DISTINCT FROM OLD.first_trial_started_at AND NEW.state<>'TRIALING'
    THEN RAISE EXCEPTION 'First trial may only be claimed by a trial transition'; END IF;
    IF OLD.first_payment_failed_at IS NOT NULL AND
       NEW.first_payment_failed_at IS DISTINCT FROM OLD.first_payment_failed_at
       AND NOT (NEW.state='ACTIVE' AND NEW.first_payment_failed_at IS NULL)
    THEN RAISE EXCEPTION 'Failure episode remains anchored until audited paid recovery'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER billing_subscription_guard BEFORE INSERT OR UPDATE OR DELETE ON organization_subscriptions
  FOR EACH ROW EXECUTE FUNCTION billing_protect_subscription();

-- Every subscription write must have a finalized, canonical DB snapshot audit in the SAME transaction.
-- Use the queued row versions, not the current subscription: several revisions may
-- be written in one transaction, and every intermediate revision needs its own audit.
CREATE FUNCTION billing_require_subscription_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_before jsonb;
BEGIN
  expected_before := CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  IF NOT EXISTS (SELECT 1 FROM organization_billing_events e
    WHERE e.organization_id=NEW.organization_id AND e.applied_revision=NEW.revision
      AND e.outcome='APPLIED' AND e.finalized_at IS NOT NULL
      AND e.after_snapshot=to_jsonb(NEW) AND e.before_snapshot IS NOT DISTINCT FROM expected_before
      AND (NEW.state<>'ACTIVE' OR e.source IN ('SYSTEM','PROVIDER')))
  THEN RAISE EXCEPTION 'Subscription mutation requires a matching immutable audit event'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER billing_subscription_audit AFTER INSERT OR UPDATE ON organization_subscriptions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION billing_require_subscription_audit();

CREATE FUNCTION billing_protect_customer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Provider customer ownership/history is immutable';
END $$;
CREATE TRIGGER billing_customer_guard BEFORE UPDATE OR DELETE ON organization_billing_customers
  FOR EACH ROW EXECUTE FUNCTION billing_protect_customer();

CREATE FUNCTION billing_protect_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Provider subscription ownership/history cannot be deleted'; END IF;
  IF NOT OLD.is_current OR NEW.is_current OR NEW.retired_at IS NULL
     OR (to_jsonb(NEW)-'is_current'-'retired_at') IS DISTINCT FROM
        (to_jsonb(OLD)-'is_current'-'retired_at')
  THEN RAISE EXCEPTION 'Links may only retire once; ownership cannot change'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER billing_link_guard BEFORE UPDATE OR DELETE ON organization_billing_links
  FOR EACH ROW EXECUTE FUNCTION billing_protect_link();

CREATE FUNCTION billing_protect_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scope text;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Billing receipts/audit cannot be deleted'; END IF;
  IF TG_OP='INSERT' THEN
    -- Serialize tenant commands with enrollment, membership changes and quota writes.
    PERFORM id FROM organizations WHERE id=NEW.organization_id FOR UPDATE;
    IF NEW.source IN ('OWNER','OPERATION') AND NOT EXISTS (
      SELECT 1 FROM users WHERE id=NEW.actor_id AND organization_id=NEW.organization_id AND active
        AND (NEW.source<>'OWNER' OR role='OWNER'))
    THEN RAISE EXCEPTION 'An active authorized tenant actor is required'; END IF;
    IF NEW.source='PROVIDER' THEN
      SELECT jsonb_build_array(provider,environment,provider_account_id)::text INTO scope
        FROM organization_billing_links WHERE id=NEW.link_id AND organization_id=NEW.organization_id;
    ELSE scope := NEW.organization_id::text; END IF;
    IF scope IS NULL OR NEW.source_scope<>scope
    THEN RAISE EXCEPTION 'Event namespace must derive from server-owned tenant/provider mapping'; END IF;
  ELSE
    IF OLD.outcome IS NOT NULL OR NEW.outcome IS NULL OR
       (to_jsonb(NEW)-'outcome'-'response'-'finalized_at'-'applied_revision'-'before_snapshot'-'after_snapshot')
       IS DISTINCT FROM
       (to_jsonb(OLD)-'outcome'-'response'-'finalized_at'-'applied_revision'-'before_snapshot'-'after_snapshot')
    THEN RAISE EXCEPTION 'Event source is immutable and outcome may finalize only once'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER billing_event_guard BEFORE INSERT OR UPDATE OR DELETE ON organization_billing_events
  FOR EACH ROW EXECUTE FUNCTION billing_protect_event();

CREATE FUNCTION billing_protect_bucket() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actual_used numeric; actual_reserved numeric;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Usage history cannot be deleted'; END IF;
  IF TG_OP='INSERT' THEN
    PERFORM id FROM organizations WHERE id=NEW.organization_id FOR UPDATE;
    IF NEW.used<>0 OR NEW.reserved<>0 THEN RAISE EXCEPTION 'Buckets start empty'; END IF;
    IF EXISTS (SELECT 1 FROM organization_usage_buckets
      WHERE organization_id=NEW.organization_id AND capability=NEW.capability
        AND window_started_at<NEW.window_ends_at AND window_ends_at>NEW.window_started_at)
    THEN RAISE EXCEPTION 'Overlapping windows cannot reset quota consumption'; END IF;
  ELSE
    IF (to_jsonb(NEW)-'used'-'reserved'-'limit'-'plan_version'-'configuration_event_id') IS DISTINCT FROM
       (to_jsonb(OLD)-'used'-'reserved'-'limit'-'plan_version'-'configuration_event_id')
    THEN RAISE EXCEPTION 'Bucket identity and window cannot change'; END IF;
    -- Trigger nesting is not authorization. Validate against the actual ledger,
    -- including when an unrelated nested trigger attempts to change counters.
    SELECT COALESCE(sum(quantity) FILTER (WHERE state='COMMITTED'),0),
           COALESCE(sum(quantity) FILTER (WHERE state='RESERVED'),0)
      INTO actual_used,actual_reserved FROM organization_usage_reservations
      WHERE bucket_id=NEW.id AND organization_id=NEW.organization_id;
    IF NEW.used<>actual_used OR NEW.reserved<>actual_reserved
    THEN RAISE EXCEPTION 'Counters must equal the reservation ledger'; END IF;
    -- Recheck aggregate growth after multi-row writes. A limit downgrade may
    -- retain existing usage; commit/release must remain possible without growth.
    IF NEW.used::numeric+NEW.reserved>OLD.used::numeric+OLD.reserved
       AND NEW."limit" IS NOT NULL AND NEW.used::numeric+NEW.reserved>NEW."limit"
    THEN RAISE EXCEPTION 'Quota exceeded'; END IF;
    IF (NEW."limit",NEW.plan_version) IS DISTINCT FROM (OLD."limit",OLD.plan_version)
       AND NEW.configuration_event_id=OLD.configuration_event_id
    THEN RAISE EXCEPTION 'Plan/limit changes require a new audited configuration'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER billing_bucket_guard BEFORE INSERT OR UPDATE OR DELETE ON organization_usage_buckets
  FOR EACH ROW EXECUTE FUNCTION billing_protect_bucket();

CREATE FUNCTION billing_apply_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bucket organization_usage_buckets%ROWTYPE; prior organization_usage_reservations%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reservations cannot be deleted'; END IF;
  IF TG_OP='INSERT' THEN
    PERFORM id FROM organizations WHERE id=NEW.organization_id FOR UPDATE;
    SELECT * INTO prior FROM organization_usage_reservations
      WHERE organization_id=NEW.organization_id AND operation_key=NEW.operation_key;
    IF FOUND THEN
      IF (prior.bucket_id,prior.command_event_id,prior.request_hash,prior.quantity)
         IS DISTINCT FROM (NEW.bucket_id,NEW.command_event_id,NEW.request_hash,NEW.quantity)
      THEN RAISE EXCEPTION 'Conflicting reservation retry' USING ERRCODE='23505'; END IF;
      -- Suppress exact retry before changing counters, even with ON CONFLICT DO NOTHING.
      -- Caller fetches the existing reservation/result; a released key never reserves twice.
      RETURN NULL;
    END IF;
    IF NEW.state<>'RESERVED' OR NEW.quantity<=0 OR NEW.quantity>9007199254740991
    THEN RAISE EXCEPTION 'A positive bounded reservation must start RESERVED'; END IF;
  ELSE
    IF OLD.state<>'RESERVED' OR NEW.state NOT IN ('COMMITTED','RELEASED')
       OR (to_jsonb(NEW)-'state'-'finalized_at'-'outcome_evidence') IS DISTINCT FROM
          (to_jsonb(OLD)-'state'-'finalized_at'-'outcome_evidence')
    THEN RAISE EXCEPTION 'Reservations are immutable except one terminal outcome'; END IF;
  END IF;
  SELECT * INTO bucket FROM organization_usage_buckets
    WHERE id=NEW.bucket_id AND organization_id=NEW.organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant quota bucket required'; END IF;
  IF TG_OP='INSERT' THEN
    IF bucket."limit" IS NOT NULL AND NEW.quantity>bucket."limit"-bucket.used-bucket.reserved
    THEN RAISE EXCEPTION 'Quota exceeded'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER billing_reservation_guard BEFORE INSERT OR UPDATE OR DELETE ON organization_usage_reservations
  FOR EACH ROW EXECUTE FUNCTION billing_apply_reservation();

-- The BEFORE guard holds the bucket lock for the transaction. AFTER triggers see
-- every row written by the statement; recompute totals instead of applying deltas
-- so batched writes and skipped ON CONFLICT rows cannot create phantom usage.
CREATE FUNCTION billing_sync_reservation_counters() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actual_used numeric; actual_reserved numeric;
BEGIN
  SELECT COALESCE(sum(quantity) FILTER (WHERE state='COMMITTED'),0),
         COALESCE(sum(quantity) FILTER (WHERE state='RESERVED'),0)
    INTO actual_used,actual_reserved FROM organization_usage_reservations
    WHERE bucket_id=NEW.bucket_id AND organization_id=NEW.organization_id;
  IF actual_used+actual_reserved>9007199254740991
  THEN RAISE EXCEPTION 'Usage exceeds the supported integer bound'; END IF;
  UPDATE organization_usage_buckets SET used=actual_used::bigint,reserved=actual_reserved::bigint
    WHERE id=NEW.bucket_id AND organization_id=NEW.organization_id;
  RETURN NULL;
END $$;
CREATE TRIGGER billing_reservation_counters AFTER INSERT OR UPDATE ON organization_usage_reservations
  FOR EACH ROW EXECUTE FUNCTION billing_sync_reservation_counters();

-- Deferred accounting catches any counter/ledger divergence at commit.
CREATE FUNCTION billing_verify_bucket() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b organization_usage_buckets%ROWTYPE; actual_used numeric; actual_reserved numeric;
BEGIN
  SELECT * INTO b FROM organization_usage_buckets WHERE id=NEW.id AND organization_id=NEW.organization_id;
  SELECT COALESCE(sum(quantity) FILTER (WHERE state='COMMITTED'),0),
         COALESCE(sum(quantity) FILTER (WHERE state='RESERVED'),0)
    INTO actual_used,actual_reserved FROM organization_usage_reservations
    WHERE bucket_id=b.id AND organization_id=b.organization_id;
  IF b.used<>actual_used OR b.reserved<>actual_reserved
  THEN RAISE EXCEPTION 'Usage counters must match retained reservations'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organization_billing_events e
    WHERE e.id=b.configuration_event_id AND e.organization_id=b.organization_id
      AND e.outcome='APPLIED' AND e.kind='QUOTA_CONFIG' AND e.source IN ('OWNER','SYSTEM'))
  THEN RAISE EXCEPTION 'Finalized quota configuration event required'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER billing_bucket_balance AFTER INSERT OR UPDATE ON organization_usage_buckets
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION billing_verify_bucket();

CREATE FUNCTION billing_protect_grant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a load_assignments%ROWTYPE; s organization_subscriptions%ROWTYPE; events jsonb; generation text;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Assignment entitlement evidence is immutable'; END IF;
  -- Match existing lock order; callers acquire organization/subscription before Driver/load.
  PERFORM id FROM organizations WHERE id=NEW.organization_id FOR UPDATE;
  SELECT * INTO s FROM organization_subscriptions WHERE organization_id=NEW.organization_id FOR UPDATE;
  IF NOT FOUND OR s.revision<>NEW.subscription_revision
  THEN RAISE EXCEPTION 'Current tenant subscription revision required'; END IF;
  PERFORM id FROM drivers WHERE id=NEW.driver_id AND organization_id=NEW.organization_id AND status='ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active tenant Driver required'; END IF;
  PERFORM id FROM loads WHERE id=NEW.load_id AND organization_id=NEW.organization_id FOR UPDATE;
  SELECT * INTO a FROM load_assignments WHERE id=NEW.assignment_id AND organization_id=NEW.organization_id
    AND load_id=NEW.load_id AND driver_id=NEW.driver_id AND status IN ('ASSIGNED','ACCEPTED','IN_PROGRESS');
  IF NOT FOUND OR (a.assigned_at AT TIME ZONE 'UTC')<>NEW.assigned_at
  THEN RAISE EXCEPTION 'Grant must match the current authorized assignment occurrence'; END IF;
  -- Corrections rotate action tokens but do not replace assignment entitlement.
  -- Include the whole immutable assignment/unassignment/cancellation event set,
  -- avoiding ties in event timestamps and same-Driver/same-millisecond reuse.
  SELECT COALESCE(jsonb_agg(id::text ORDER BY id::text),'[]'::jsonb) INTO events FROM load_events
    WHERE organization_id=NEW.organization_id AND load_id=NEW.load_id
      AND type IN ('DRIVER_ASSIGNED','DRIVER_UNASSIGNED','LOAD_CANCELLED');
  generation := encode(sha256(convert_to(jsonb_build_array(NEW.organization_id::text,NEW.load_id::text,
    NEW.driver_id::text,a.id::text,(extract(epoch FROM NEW.assigned_at)*1000)::bigint,events)::text,'UTF8')),'hex');
  IF generation<>NEW.assignment_generation_key THEN RAISE EXCEPTION 'Stale assignment generation'; END IF;
  IF NEW.assignment_event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM load_events
    WHERE id=NEW.assignment_event_id AND organization_id=NEW.organization_id AND load_id=NEW.load_id
      AND type='DRIVER_ASSIGNED' AND (occurred_at AT TIME ZONE 'UTC')>=NEW.assigned_at)
  THEN RAISE EXCEPTION 'Assignment source event must belong to this occurrence'; END IF;
  IF NEW.origin='LEGACY_SNAPSHOT' AND (s.state<>'GRANDFATHERED' OR s.enrolled_at IS NOT NULL)
  THEN RAISE EXCEPTION 'Legacy grants require explicit grandfathering'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER billing_grant_guard BEFORE INSERT OR UPDATE OR DELETE ON assignment_entitlement_grants
  FOR EACH ROW EXECUTE FUNCTION billing_protect_grant();

CREATE FUNCTION billing_verify_grant_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organization_billing_events e WHERE e.id=NEW.decision_event_id
    AND e.organization_id=NEW.organization_id AND e.kind='ASSIGNMENT_GRANT' AND e.outcome='APPLIED'
    AND e.response->>'billingAllowed'='true'
    AND e.response->>'assignmentGenerationKey'=NEW.assignment_generation_key
    AND (NEW.origin<>'LEGACY_SNAPSHOT' OR e.source='SYSTEM'))
  THEN RAISE EXCEPTION 'Server-authorized assignment decision evidence required'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER billing_grant_audit AFTER INSERT ON assignment_entitlement_grants
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION billing_verify_grant_audit();
-- Prevent ordinary TRUNCATE from bypassing row-level retention guards.
CREATE FUNCTION billing_forbid_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Billing history cannot be truncated';
END $$;
CREATE TRIGGER billing_no_truncate_1 BEFORE TRUNCATE ON organization_subscriptions
  FOR EACH STATEMENT EXECUTE FUNCTION billing_forbid_truncate();
CREATE TRIGGER billing_no_truncate_2 BEFORE TRUNCATE ON organization_billing_customers
  FOR EACH STATEMENT EXECUTE FUNCTION billing_forbid_truncate();
CREATE TRIGGER billing_no_truncate_3 BEFORE TRUNCATE ON organization_billing_links
  FOR EACH STATEMENT EXECUTE FUNCTION billing_forbid_truncate();
CREATE TRIGGER billing_no_truncate_4 BEFORE TRUNCATE ON organization_billing_events
  FOR EACH STATEMENT EXECUTE FUNCTION billing_forbid_truncate();
CREATE TRIGGER billing_no_truncate_5 BEFORE TRUNCATE ON organization_usage_buckets
  FOR EACH STATEMENT EXECUTE FUNCTION billing_forbid_truncate();
CREATE TRIGGER billing_no_truncate_6 BEFORE TRUNCATE ON organization_usage_reservations
  FOR EACH STATEMENT EXECUTE FUNCTION billing_forbid_truncate();
CREATE TRIGGER billing_no_truncate_7 BEFORE TRUNCATE ON assignment_entitlement_grants
  FOR EACH STATEMENT EXECUTE FUNCTION billing_forbid_truncate();
COMMIT;
