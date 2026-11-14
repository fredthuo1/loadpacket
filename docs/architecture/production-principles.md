# LoadPacket production principles

Status: REQUIRED POLICY; implementation and operational evidence are not yet complete. Reviewed 2026-10-01. The earlier hosting-readiness ticket is a single-instance reference, not certification against this policy.

> A LoadPacket acknowledgement is a durability contract.
>
> When LoadPacket reports that a customer action has succeeded, the authoritative business state must already be committed to the configured redundant durability domains.
>
> LoadPacket must never trade acknowledged customer data for temporary write availability.
>
> If the platform cannot satisfy its durability contract, authoritative writes must fail closed until durability is restored.

1. **Acknowledgement:** saved, uploaded, signed, completed, accepted, paid and submitted require a confirmed authoritative commit; receiving bytes or queuing work is not that commit.
2. **Acknowledged-write RPO 0:** no lost acknowledged records under the stated single-region failure model, including a partition during commit. The model includes regional data loss, not just compute loss. It does not promise survival of simultaneous destruction of all replicas and backups or a malicious authorized business transaction; these require separate recovery controls.
3. **Consistency before availability:** minority partitions cannot accept authoritative writes. Never automatically downgrade synchronous replication, quorum, object receipt count or authorization.
4. **Fail closed:** readiness probes aid routing; the actual commit/storage protocol enforces durability. Cached green health is never permission for a weaker write.
5. **Replication is not backup:** replicated corruption/deletion requires independent immutable history, credentials and tested restoration. Backup RPO is measured separately from acknowledged-write regional RPO.
6. **Stateless application sites:** identical Nest/Next images in A and B; neither local disk nor process memory holds the sole authoritative copy.
7. **Immutable evidence:** document and signature bytes are versioned, checksummed and private. Corrections create new evidence; retention deletion is a controlled, audited operation.
8. **Idempotent mutations:** stable tenant/actor/action/key plus canonical payload hash; replay the same outcome, reject conflicting reuse, reconcile unknown outcomes.
9. **Durable events:** business record, audit and outbox commit together. Delivery is at least once; handlers and external effects must deduplicate or reconcile.
10. **Tenant isolation:** server-derived membership, service scoping, composite relationships and tested database safeguards. No client-selected tenant authority.
11. **Least privilege:** separate runtime, migration, backup and support identities; no public business Data API, no unreviewed support impersonation.
12. **Automatic safe failover:** route around app failures; only a fenced database leader/quorum may commit. DNS routing cannot make data safe.
13. **Proven restoration:** weekly isolated drills initially; evidence covers objects, metadata, signatures, Finance, keys and authorization, not only a successful restore command.
14. **Infrastructure as code:** reviewed plans, isolated state/identities per environment, no laptop production migration or mutable deploy tag.
15. **Observable systems:** request/trace correlation, customer-impact metrics, tested paging and credential/document redaction.
16. **Controlled migrations:** expand/contract, staging rehearsal, backup/readiness evidence, one privileged release job and explicit approval.

The enforceable contract, uncertain outcomes and platform state machine are specified in [data durability](data-durability.md). Launch requires every [P0 release gate](release-gates.md), not simply successful application tests.
