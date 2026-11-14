ALTER TYPE "LoadEventType" ADD VALUE 'DOCUMENT_SIGNATURE_CAPTURED';
CREATE UNIQUE INDEX document_versions_id_document_id_organization_id_key ON document_versions(id, document_id, organization_id);
CREATE TABLE document_signatures (
 id UUID PRIMARY KEY,
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 load_id UUID NOT NULL,
 document_id UUID NOT NULL,
 document_version_id UUID NOT NULL,
 document_type "DocumentType" NOT NULL,
 signer_name VARCHAR(120) NOT NULL CHECK (length(btrim(signer_name)) BETWEEN 1 AND 120),
 signer_role VARCHAR(16) NOT NULL,
 signature_storage_key TEXT NOT NULL,
 signature_checksum VARCHAR(64) NOT NULL,
 signed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_by_user_id UUID NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 idempotency_key VARCHAR(80) NOT NULL,
 CONSTRAINT document_signatures_role_check CHECK ((document_type='BOL' AND signer_role IN ('DRIVER','SHIPPER')) OR (document_type='POD' AND signer_role IN ('DRIVER','RECEIVER'))),
 CONSTRAINT document_signatures_load_fkey FOREIGN KEY(load_id,organization_id) REFERENCES loads(id,organization_id) ON DELETE RESTRICT,
 CONSTRAINT document_signatures_version_fkey FOREIGN KEY(document_version_id,document_id,organization_id) REFERENCES document_versions(id,document_id,organization_id) ON DELETE RESTRICT,
 CONSTRAINT document_signatures_link_fkey FOREIGN KEY(organization_id,load_id,document_id,document_type) REFERENCES load_documents(organization_id,load_id,document_id,role) ON DELETE RESTRICT,
 CONSTRAINT document_signatures_actor_fkey FOREIGN KEY(created_by_user_id,organization_id) REFERENCES users(id,organization_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX document_signatures_organization_id_created_by_user_id_idemp_key ON document_signatures(organization_id,created_by_user_id,idempotency_key);
CREATE UNIQUE INDEX document_signatures_organization_id_signature_storage_key_key ON document_signatures(organization_id,signature_storage_key);
CREATE INDEX document_signatures_organization_id_document_id_document_ver_idx ON document_signatures(organization_id,document_id,document_version_id);
CREATE FUNCTION prevent_signature_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Captured signature evidence is immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER document_signatures_immutable BEFORE UPDATE ON document_signatures FOR EACH ROW EXECUTE FUNCTION prevent_signature_update();
ALTER TABLE document_signatures ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON document_signatures FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON document_signatures FROM authenticated; END IF;
END $$;
