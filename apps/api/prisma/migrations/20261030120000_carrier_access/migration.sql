BEGIN;
-- CreateTable
CREATE TABLE "staff_invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "token_hash" CHAR(64) NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "accepted_by_id" UUID,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_id" UUID,

    CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_invitations_token_hash_key" ON "staff_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "staff_invitations_organization_id_status_idx" ON "staff_invitations"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "staff_invitations_id_organization_id_key" ON "staff_invitations"("id", "organization_id");

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_invited_by_id_organization_id_fkey" FOREIGN KEY ("invited_by_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_accepted_by_id_organization_id_fkey" FOREIGN KEY ("accepted_by_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_revoked_by_id_organization_id_fkey" FOREIGN KEY ("revoked_by_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

CREATE UNIQUE INDEX staff_pending_email ON staff_invitations(organization_id,email) WHERE status='PENDING';
ALTER TABLE staff_invitations ADD CONSTRAINT staff_invitation_shape CHECK (
 role IN ('BACK_OFFICE','DISPATCHER') AND email=lower(trim(email)) AND length(email)>3
 AND token_hash ~ '^[0-9a-f]{64}$' AND expires_at>created_at AND status IN ('PENDING','ACCEPTED','REVOKED','EXPIRED')
 AND ((status='ACCEPTED' AND accepted_at IS NOT NULL AND accepted_by_id IS NOT NULL) OR (status<>'ACCEPTED' AND accepted_at IS NULL AND accepted_by_id IS NULL))
 AND ((status='REVOKED' AND revoked_at IS NOT NULL AND revoked_by_id IS NOT NULL) OR (status<>'REVOKED' AND revoked_at IS NULL AND revoked_by_id IS NULL)));
CREATE FUNCTION protect_staff_invitation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Invitation history cannot be deleted'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'PENDING' THEN RAISE EXCEPTION 'Invitation starts pending'; END IF;
 ELSE
  IF OLD.status<>'PENDING' OR NEW.status='PENDING' OR
   (to_jsonb(NEW)-'status'-'accepted_at'-'accepted_by_id'-'revoked_at'-'revoked_by_id') IS DISTINCT FROM
   (to_jsonb(OLD)-'status'-'accepted_at'-'accepted_by_id'-'revoked_at'-'revoked_by_id') THEN RAISE EXCEPTION 'Invitation identity and terminal history are immutable'; END IF;
  IF NEW.status='ACCEPTED' AND (OLD.expires_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') OR NOT EXISTS(
   SELECT 1 FROM users u WHERE u.id=NEW.accepted_by_id AND u.organization_id=NEW.organization_id AND lower(trim(u.email))=NEW.email AND u.role=NEW.role AND u.active))
   THEN RAISE EXCEPTION 'Invitation requires unexpired matching membership'; END IF;
  IF NEW.status='EXPIRED' AND OLD.expires_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN RAISE EXCEPTION 'Invitation is not expired'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER staff_invitation_immutable BEFORE INSERT OR UPDATE OR DELETE ON staff_invitations FOR EACH ROW EXECUTE FUNCTION protect_staff_invitation();

CREATE FUNCTION protect_last_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.organization_id,NEW.auth_user_id) IS DISTINCT FROM (OLD.organization_id,OLD.auth_user_id)
 THEN RAISE EXCEPTION 'Membership identity and tenant ownership cannot change'; END IF;
 IF OLD.role='OWNER' AND OLD.active AND (TG_OP='DELETE' OR NEW.role<>'OWNER' OR NOT NEW.active) THEN
  PERFORM id FROM organizations WHERE id=OLD.organization_id FOR UPDATE;
  -- Organization deletion is a distinct privileged operation; this guards membership changes.
  IF FOUND AND NOT EXISTS(SELECT 1 FROM users WHERE organization_id=OLD.organization_id AND role='OWNER' AND active AND id<>OLD.id)
   THEN RAISE EXCEPTION 'The final active Owner cannot be removed or downgraded'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER last_owner_guard BEFORE UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION protect_last_owner();

CREATE UNIQUE INDEX access_command_key ON financial_audit_events(organization_id,(details->>'requestKey')) WHERE record_type='ACCESS_ADMIN';
ALTER TABLE financial_audit_events ADD CONSTRAINT access_command_shape CHECK(record_type<>'ACCESS_ADMIN' OR COALESCE(
 details->>'version'='1' AND details->>'requestKey' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 AND details->>'requestHash' ~ '^[0-9a-f]{64}$' AND details ?& ARRAY['before','after','response'],false));
CREATE FUNCTION protect_access_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' AND OLD.record_type='ACCESS_ADMIN' THEN RAISE EXCEPTION 'Access administration history is immutable'; END IF;
 IF TG_OP='UPDATE' AND NEW.record_type='ACCESS_ADMIN' THEN RAISE EXCEPTION 'Existing history cannot become access audit'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER access_audit_immutable BEFORE UPDATE OR DELETE ON financial_audit_events FOR EACH ROW EXECUTE FUNCTION protect_access_audit();
REVOKE ALL ON staff_invitations FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON staff_invitations FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON staff_invitations FROM authenticated; END IF;
END $$;

COMMIT;
