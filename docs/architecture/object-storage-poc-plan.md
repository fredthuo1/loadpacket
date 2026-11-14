# Isolated object-storage POC preparation — LP-PROD-002

2026-10-01, PLAN ONLY. No bucket/account/object was created or modified. Current SOURCE evidence: [LocalDocumentStorage](../../apps/api/src/documents/document-storage.ts), [write paths](current-write-paths.md) and [backup baseline](current-backup-evidence.md). This plan tests the proposed contract in [object architecture](object-storage.md); it is not a current feature claim.

## Scope and cost boundary

Synthetic RateCon/PDF, BOL/POD JPG/PNG, invoice, vault and signature files only, with deterministic SHA-256 and manifest. No real documents, signatures, names or production credentials. Use the database POC's approved isolated resource allowlist and independent controller. The **same total $150 USD / 72-hour limit** applies across all DB and object tracks from the first paid creation. Explicit LP-PROD-002 paid-resource approval, priced components and cleanup rights are prerequisites. No separate additional object budget is implied.

Local object emulators can test protocol/idempotency logic but cannot prove independent provider regions, durable storage receipts, encryption policy or object-lock recovery. If a valid regional/private/immutable-storage test is not economical within the cap, stop before that portion and report the additional priced requirement.

## Proposed acceptance protocol

1. Generate a run ID and tenant/operation/document/version IDs; canonical request hash binds bytes, MIME/size, intended role and exact source version. Never overwrite a prior version. Signature records bind both original document version/checksum and signature checksum in the future protocol.
2. Validate type/size/magic and calculate SHA-256. Stage into private **quarantine** destinations; scanner result must be bound to the same checksum/version. Scanner failure/timeout leaves pending/quarantined evidence and cannot count as accepted BOL/POD. No client permanent URL, public ACL or uncontrolled direct upload path.
3. Obtain **two independently verified regional durable receipts** before authoritative final success. Receipt identifies region/account/bucket, immutable object/version ID, exact SHA-256, bytes, encryption/retention policy and operation. Verify provider completion semantics; multipart ETag is not a substitute for SHA-256. Use checksum APIs plus read-back verification where required by the provider contract.
4. Usually A+B; if A is lost, B+C can qualify only under the same predefined two-domain policy. A mirror in the same region or unverified async replica does not count as the second receipt. Preserve all receipts on retry, verify their underlying objects and do not silently downgrade to one.
5. Commit business linkage, exact version/receipts, accepted scanner evidence, audit and operation result atomically in the qualified DB. Return authoritative SUCCESS only after that commit and the two receipt conditions. Before finalization use an honest pending state; proposed API contracts require later implementation, not this audit.
6. Lost ACK or uncertain commit uses the same operation key and status reconciliation. If only one copy completed, retain staging state for retry. If two copies exist but DB outcome is uncertain, preserve both. Cleanup requires proof of non-commit, retention/hold checks and an approved age policy; never delete merely because a request threw.

Native cross-region replication must be timed and proved. An asynchronous replication status scheduled after source PUT success cannot establish two receipts at ACK time. Default design is application-coordinated dual writes or an equivalent provider mechanism that demonstrably waits for distinct-region durability. Do not claim native replication meets the contract without fault-and-receipt evidence; an eventual second copy is useful recovery protection but not the required ACK boundary.

## Access, immutability and encryption tests

- Dedicated least-privilege POC identities, private access, TLS and server-side encryption; regional/account key custody and recovery explicitly recorded. Deny public listing/reading, unauthorized tenant fetch, direct bucket writes by client and runtime overwrite/delete of finalized evidence.
- Short-lived signed authorized download or API grant; require server tenant/role/version checks before issuance, exact object/version binding, expiry and revocation semantics. Redact signatures/query strings from logs. A signed URL's lifetime may outlast a permission change; explicitly bound that exposure and test the chosen contract.
- New document corrections get new immutable versions. Wrong key, wrong bytes, MIME mismatch, truncated upload and corrupt checksum must fail without replacing evidence. Signature retry with different document/version/name/checksum must conflict.
- Exercise object/version lock and runtime deletion denial. On a separate expendable synthetic object, intentionally simulate deletion/marker/corruption using an explicitly permitted POC admin path and recover the prior correct version. Do not weaken locked accepted evidence to run a deletion test.
- Prove backup/archive administration is independent of the primary deletion identity; verify that losing primary credentials does not lose every copy/key. Different regions under one all-powerful principal are not independent administrative recovery domains.

## Failure and recovery matrix

Execute with expected result recorded before injection:

1. A PUT succeeds/B fails: no authoritative ACK, one preserved staged receipt; retry completes without duplicate document/version.
2. Two PUTs succeed/DB fails or response lost: reconcile using same operation, preserve evidence, exactly one metadata/history result.
3. DB metadata attempts finalization before scan/second receipt: rejected by the proposed protocol; no partial accepted evidence.
4. Lose A immediately after accepted upload/signature: B exact immutable version is retrievable with matching SHA-256. Before accepting new writes restore two eligible domains (e.g. B+C) or fail closed.
5. Partition/misroute/stale DNS/key permission failure: refuse to count the same region twice; authorized surviving reads succeed, no public fallback; insufficient receipt domains reject final writes.
6. Scanner rejects synthetic harmless malware-test fixture or scanner unavailable: remain quarantined, deny normal downloads/use, and do not mark requirement RECEIVED. No production fixture uploads.
7. Restore SQL and object version manifest from an isolated backup at a coordinated boundary: enumerate all synthetic DocumentVersions/signatures/invoice references and verify content SHA-256, size, role, source-version binding and permissions. Missing/mismatched accepted references must be zero. Unreferenced uncertain artifacts are classified, not automatically deleted.
8. Restore previous version after synthetic delete, then test archive/key recovery with primary credentials withheld. Record achieved RTO and data-loss boundary. Fail any ACKed-object loss under the defined single-region failure model.

Maintain an independent accepted-object ledger: operation/tenant IDs, original and signature checksums, object versions, receipt regions, DB commit result and client-observed ACK. Reconcile this against the DB [10,000-operation ledger](database-poc-plan.md); no claim of full RPO 0 unless both the financial/metadata record **and all accepted evidence bytes** survive. Unknown outcomes remain separate.

## Expected resources and bounded execution

Two primary regional private stores plus third-region fallback/recovery storage when needed for the planned failure scenario; minimal encryption-key resources, scanner/API test process, independent manifest runner, network traffic and a temporary restoration target. Exact service/storage class and measured per-GB/request/egress/key/log cost must be quoted before approval. Include inter-region duplicate uploads, retained versions, snapshot/restore and any minimum retention billing. No invented estimate or promise that all tracks fit $150.

Plan 4–8 active hours of protocol/fault/restore measurements after local harness preparation, shared within the DB plan's 72h global window. Reserve time for version/lock expiry and full teardown. **Do not create immutable retention that prevents disposal by the deadline.** Use a short bounded POC retention supported by the chosen provider and expire it well before H60; if the provider enforces a longer minimum, the paid locked-object portion is blocked pending a revised approved plan. A production retention design remains a separate ticket.

Teardown inventory includes every bucket/container, replica/archive, object version/delete marker, unfinished multipart upload, scanner image/process, key, temporary access grant, private endpoint, network/log resource and billing plan. Export only synthetic evidence; stop jobs, revoke POC access, empty/delete after approved retention expiry, delete unused keys under safe provider rules, and verify remaining retained billable resources. Never force-unlock a real/legal-hold object. Report provider-mandated delayed deletion and cost exposure before creation so it cannot violate the approved budget/runtime.

## Output and decision

Produce dated redacted topology/policy/receipt evidence, checksums/manifest, rejected/unknown/accepted counts, regional loss and restore results, observed latency, remaining gaps, actual cost and verified teardown. Engine/object compatibility alone does not implement the production upload protocol. No storage provider is selected by this ticket; object regional durability and backup gates remain NOT_VERIFIED.
