# Mandatory production release gates

READY_FOR_REAL_CUSTOMER_PRODUCTION: **NO**.

LP-PROD-001 evidence update (2026-10-01): [repository audit and POC preparation](lp-prod-001-report.md) completed without provider access or runtime qualification. All production gates below remain NOT_VERIFIED. Source inventories, documentation validation and the $150/72-hour future POC budget boundary are planning evidence only; none proves deployed privilege isolation, backups, regional commit durability, immutable regional objects or safe failover.

All gates below are P0 and currently **NOT_VERIFIED** against this production contract. Existing code tests are useful partial evidence, not substitution for the specified deployed topology/drill. Each must become PASS with environment, source/image/schema/configuration digest, test date, expected/actual observations, evidence artifact and independent reviewer. Stale evidence after relevant change must be rerun. No unresolved P0 is waived by documentation completion.

| Gate                          | Required objective evidence                                                                    | Ticket      |
| ----------------------------- | ---------------------------------------------------------------------------------------------- | ----------- |
| Site A deployment             | Immutable digest, private origin, current health and safe synthetic                            | 003,013     |
| Site B deployment             | Same digest/config policy; independent regional serving, N-1 capacity                          | 003,015     |
| Global routing                | TLS/WAF/origin trust, both sites, no manual DNS incident step                                  | 003         |
| Automated site failover       | Measured safe serving <60s or approved technically justified target before launch              | 012         |
| DB quorum/failover            | Single-region/partition/fencing proof on selected engine/topology                              | 002,012     |
| RPO-0 acknowledged-write test | Independent ACK ledger, zero missing/duplicated authoritative results after region destruction | 002,012     |
| Object durability             | Every confirmed upload has two distinct regional verified receipts; partial failure denies ACK | 005,012     |
| Document checksum validation  | Full committed-version/signature manifest reconciles to restored exact bytes                   | 005,009     |
| PITR                          | Restore chosen time with verified metadata/object/Finance consistency and measured limits      | 009,012     |
| Immutable backup              | Independent admin/key domain and proven production-delete denial                               | 009         |
| Backup restoration            | Weekly drill evidence, complete integrity checks, recoverable keys and deletion ledger         | 009,012     |
| Tenant isolation              | Every-model constraints/runtime scope and pooled-context negative tests                        | 008         |
| IDOR testing                  | All routes, roles, nested associations, grants and exports tested                              | 008,014     |
| Idempotency                   | Every mutation family concurrent/retry/hash/revocation cases, retained tombstones              | 006         |
| Transactional outbox          | Atomic business/audit/event; restart/replay/lease/provider ambiguity tests                     | 007         |
| Audit logging                 | Critical actions atomic, runtime cannot alter history, protected archive and trace correlation | 007,010,023 |
| Write fail-closed             | APIs/workers/admin paths reject unsafe writes, distinguish unknown outcomes                    | 004         |
| Monitoring                    | Customer/durability/dependency metrics and redaction verified externally                       | 010         |
| Paging                        | Real contact rota and page/ack/escalation exercise                                             | 010,012     |
| Security review               | No unresolved P0; least privilege, upload scanner, support and secret controls verified        | 005,008,014 |
| Load testing                  | Peak x2 and N-1, largest tenant, 24h soak, pools/quotas/restore-size budgets                   | 015         |
| Incident runbook              | Named owners and exercised containment/customer communication                                  | 012,014     |
| DR runbook                    | Warm <15m objective qualified; cold limits explicit, zero unsafe forced promotion              | 009,012     |
| Durable mobile pending work   | Restart/disk/network/account-switch and lost-ACK acceptance                                    | 011         |
| Finance/evidence history      | Exact currency/provenance/correction invariants; no unauthorized update/delete                 | 023         |
| Controlled release/migration  | Protected job, same-artifact promotion solution and post-target-write rollback rehearsal       | 013,016     |
| Customer lifecycle/support    | Approved privacy/retention/holds/export/closure; time-limited audited support                  | 014         |

Gate owner roles are assigned in [backlog](implementation-backlog.md); named assignees and artifact URLs are required before PASS. Proof of ordinary HTTP health, signed native build, or a RevenueCat transaction alone cannot satisfy these gates. The architecture ticket ran only safe documentation validation; it did not execute this qualification matrix.
