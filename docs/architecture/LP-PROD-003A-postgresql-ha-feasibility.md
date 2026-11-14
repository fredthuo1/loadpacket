# LP-PROD-003A — PostgreSQL HA feasibility

Evidence date: 2026-10-20. Feasibility only; no implementation authorization. **Production access/changes, migrations, provisioning, paid resources, commit and push: NONE.**

## 1. Executive decision

**CONDITIONALLY_VIABLE.** Retaining PostgreSQL is technically credible for RPO 0 after a single complete primary-region loss, provided every authoritative success is durably recorded outside that region, promotion selects an eligible history, and the previous writer is fenced. This is an engineering feasibility conclusion, **not a qualified production guarantee or a selected winner**.

Prioritize candidate A for a separately approved qualification gate because it preserves the existing database semantics. The smallest design must stop accepting writes after losing its only remote data copy. Continued write service after region loss requires another independent data region. Automatic promotion alone does not imply write availability.

Reused evidence: [LP-PROD-001](lp-prod-001-report.md), [compatibility inventory](database-compatibility-inventory.md), [POC plan](database-poc-plan.md), [Yugabyte deadline failure](yugabyte-local-compatibility.md), and [Cockroach major-adaptation preflight](cockroach-local-preflight.md). Those alternative-engine results remain scoped findings, not universal impossibility claims. Current production topology, privileges and backup protection remain unverified; retaining PostgreSQL does not establish that the current hosting arrangement can implement this design.

Labels below: **Documented** = official product behavior; **Design/inference** = proposed LoadPacket requirement or engineering deduction; **Unverified** = needs version-specific evidence or execution.

## 2. Candidate comparison

| Candidate | Documented foundation | Assessment for LoadPacket |
| --- | --- | --- |
| **A. PostgreSQL physical synchronous replication + Patroni + etcd** | PostgreSQL supports remote durable WAL confirmation. Patroni offers synchronous promotion rules and strict mode. | **CONDITIONALLY_VIABLE.** Best first qualification target for compatibility; cancellation, policy enforcement, fencing and regional operation remain unproven. Self-managed operational responsibility is substantial. |
| **B. Managed PostgreSQL with cross-region synchronous durability** | EDB Cloud Service documents distributed HA and a cross-group synchronous preset. Common AWS/Azure/Google regional HA offerings do not establish this requirement. | **INSUFFICIENT_EVIDENCE for the full contract.** EDB is a concrete shortlist candidate, not a verified drop-in service. Obtain exact supported version, topology and guarantees before selection. |
| **C. Ordinary PostgreSQL on synchronously replicated storage, with external fencing** | DRBD Protocol C confirms local and remote disk writes; storage quorum and minimum redundancy are separate controls. | **CONDITIONALLY_VIABLE in principle.** Preserves a single PostgreSQL writer but adds kernel, filesystem, storage and cluster-manager failure modes. No qualified deployment or small-team support arrangement established. |

**A — documented boundaries.** With nonempty `synchronous_standby_names`, `synchronous_commit=on` waits for remote durable WAL flush; `remote_write` does not provide the same OS-crash protection. `remote_apply` adds replay visibility. Empty standby configuration provides no remote guarantee, and sessions can change commit settings. Require `fsync` and durable storage. These are protocol conditions, not proof of correct regional placement or safe promotion. [PostgreSQL WAL settings](https://www.postgresql.org/docs/18/runtime-config-wal.html#GUC-SYNCHRONOUS-COMMIT).

Patroni synchronous mode restricts promotion to eligible synchronized nodes; strict mode prevents dropping to standalone writes when none is available. Manual unsafe promotion and per-session overrides can defeat the intended protection. Its documented cancellation caveat allows locally visible, incompletely replicated transactions. [Patroni replication modes](https://patroni.readthedocs.io/en/latest/replication_modes.html).

**B — actual options, not category assumptions.** [Azure PostgreSQL](https://learn.microsoft.com/en-us/azure/reliability/reliability-database-postgresql) provides synchronous zonal HA but asynchronous cross-region replicas. [Cloud SQL HA](https://docs.cloud.google.com/sql/docs/postgres/high-availability) is regional; its [cross-region recovery](https://cloud.google.com/sql/docs/postgres/replication/cross-region-replicas) can lose recent commits. [Aurora Global Database unplanned failover](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-global-database-disaster-recovery.html) can lose data from asynchronous replication. These configurations are **NOT_VIABLE for the stated regional RPO 0**; a planned zero-loss switchover is not equivalent.

[EDB distributed HA](https://www.enterprisedb.com/docs/edb-postgres-ai/cloud-service/references/supported_cluster_types/distributed_highavailability/) supports two regional data groups and a third-region witness group using PGD logical replication. Its hosted option is closed to new customers; the customer-cloud-account option remains documented. The recommended synchronous layout uses three data nodes per data group, not two plus a witness. [Cloud Service preset `ba004`](https://www.enterprisedb.com/docs/edb-postgres-ai/cloud-service/references/distributed_high_availability/pgd_defaults_ba/) combines local-majority and external-node synchronous confirmation; the default `ba001` is local-only. [PGD scope groups](https://www.enterprisedb.com/docs/pgd/latest/commit-scopes/origin_groups/) describe explicit regional durability policies. **Unverified:** this exact service/version's cancellation, eligible promotion, forced write rejection, failover fencing, supported scope configuration and LoadPacket semantics. Keep one global application writer; do not assume local advisory locks enforce invariants across active writers. No async-degradation scope is acceptable. These documents identify a credible offering, not an end-to-end guarantee.

**C — storage alternative.** [DRBD Protocol C](https://linbit.com/drbd-user-guide/drbd-guide-9_0-en/#s-replication-protocols) supplies synchronous block replication. A diskless tiebreaker can retain quorum without a second data copy, so quorum alone is insufficient. The [minimum-redundancy control](https://linbit.com/man/v9/?linbitman=drbdsetup.8.html) separately requires enough up-to-date disks. **Design:** single-primary storage, one mounted PostgreSQL data directory, verified remote-region disk participation, fail-closed I/O, and cluster-manager power/storage fencing before ownership transfer. Protocol C alone does not certify these conditions. Require vendor-supported versions and proof that degraded/disconnected operation cannot acknowledge local-only writes. This adds more operational layers than A; retain as an alternative, not the first experiment.

## 3. Failure-mode matrix

**Design expectations, not executed results.** Baseline is A with one data node in each of A/B and an etcd member in A/B/C. “Preserved” assumes a validated durable ACK under the enforced policy and no simultaneous destruction of all data copies. B/C must independently prove equivalent outcomes; their defaults do not inherit this matrix.

| Failure | Prior acknowledged writes | New writes / required rejection |
| --- | --- | --- |
| 1. Entire A region lost immediately after COMMIT | Preserved on B if remote flush completed before ACK. | B+C may authorize eligible promotion after fencing. Reject writes until a remote data copy is restored; witness C cannot supply one. |
| 2. A–B network partition | Preserved on surviving durable copies. | Both sides reject new authoritative successes without the required data path, even if one has control quorum. Fence the losing writer. |
| 3. PostgreSQL primary process/host lost | Preserved on eligible B. | Interrupt in-flight work; resume only after fenced promotion and restored cross-region durability. Three data regions can shorten this pause. |
| 4. Only synchronous standby lost | Prior ACKs remain on primary. | Reject new successes until a remote replacement is synchronized. No automatic async fallback. |
| 5. Quorum/coordinator lost | Stored ACKs are not erased by coordinator loss. | One failed etcd member can leave a majority. Without majority, no new promotion; close admission and fence the writer by lease expiry. |
| 6. Replication ACK delayed/lost | Previously confirmed writes preserved; current commit may be unknown. | Bound admission/waits; no success without confirmation. Timeout must not be reported as proof of rollback. |
| 7. COMMIT completed but response lost | Data survives if the durability wait completed, but caller has no ACK. | Reconcile the same operation key on the authoritative history; retry idempotently. Existing unrelated writes may continue if safe. |
| 8. Old primary rejoins | Preserve chosen authoritative history and audit unknown operations. | Old node remains fenced; inspect divergence, rewind/reseed and catch up before eligibility. Never reopen its old writer endpoint. |
| 9. Corruption or accidental deletion | **Not guaranteed by replication:** damaging changes may propagate. | Isolate affected service; restore independently protected backup/PITR and reconcile later valid writes. Restore is a separate recovery objective. |
| 10. Concurrent application writes during failover | Confirmed transactions survive; interrupted ones may be unknown. | One authorized writer only; terminate stale sessions, enforce unique operation keys and preserve transaction boundaries. Reject stale-side writes. |

**ACK versus proof:** replication status, `SELECT 1`, a successful read, a control-plane lease, or a raw COMMIT completion alone is insufficient evidence of the entire contract. Establish the transaction's safe completion, durable remote location, timeline and promotion eligibility together. PostgreSQL's [synchronous-wait cancellation path](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/replication/syncrep.c) can emit a warning after local commit instead of rolling it back. Qualification must establish how PrismaPg/pg surfaces this and prevent a cancelled wait from becoming an HTTP success. A read finding that row locally cannot resolve its durability; require a validated durability barrier on the current authoritative history. Never count a lost response as a definite rejection.

## 4. Minimum topology

**Design, not deployable configuration:**

- **A:** application/API instance, PostgreSQL primary with Patroni, etcd member, local database routing endpoint.
- **B:** warm application/API instance, synchronous PostgreSQL standby with Patroni, etcd member, equivalent routing endpoint.
- **C:** independent-region etcd member. Three members require two votes and tolerate one member loss; WAN delay affects elections. A majority protects coordination state, not PostgreSQL WAL. [etcd quorum and cross-region behavior](https://etcd.io/docs/v3.6/faq/).
- **Data policy:** every authoritative ACK requires durable WAL in at least two independent regions. Start qualification with `synchronous_mode=on`, `synchronous_mode_strict=true`, one required remote standby and no local-only eligible substitute. These are candidate settings, not sufficient proof of enforcement.
- **Automatic routing:** a global health-aware application endpoint directs traffic to A/B; regional DB proxies route to the eligible leader. Refresh/break pooled connections on leadership change. DNS changes alone cannot fence an old connection. Patroni's [`/primary` or `/read-write`](https://patroni.readthedocs.io/en/latest/rest_api.html) checks leader-lock status; add separate fresh durability admission evidence. Probes never replace enforcement at commit.
- **Fencing:** require watchdog or independently effective power/storage fencing, covering scheduler stalls, process death, network partition and VM pause/resume. Patroni documents refusing leadership when required watchdog activation fails, and tighter safety-margin settings for suspension timing. Validate fencing completion before a competing leader serves. [Watchdog limitations](https://patroni.readthedocs.io/en/latest/watchdog.html). Keep [DCS failsafe mode](https://patroni.readthedocs.io/en/latest/dcs_failsafe_mode.html) disabled in the initial qualification to avoid introducing a separate availability exception.
- **Independent backup destination:** separate administrative account and region, immutable/versioned base backups plus WAL archive, separate recovery keys, restricted backup credentials and an isolated restore target. The live application role must not delete backups. Existing [backup evidence](current-backup-evidence.md) proves none of this is currently enabled.

**Availability extension:** put a third full PostgreSQL data node in C if writes must resume while A remains destroyed. One node per region makes any eligible remote peer geographically independent. Qualify synchronous-candidate transitions and B-to-C durability before reopening writes. Do not invent a fixed all-node guarantee from `synchronous_node_count=2`: Patroni can reduce the count to available eligible nodes. [Dynamic configuration](https://patroni.readthedocs.io/en/latest/dynamic_configuration.html). The policy is two durable regions at every success, including transitions; control quorum alone never permits a stale promotion.

Cost minimum and service minimum differ: two data sites can preserve ACKs while rejecting writes; three data sites provide a plausible path to continued writes after one region fails. Both still trade WAN commit latency and partition availability for durability. Independent application routing, identity and document storage must also survive for full product continuity; this database gate does not qualify those systems.

## 5. LoadPacket compatibility

**Reused source evidence / architectural inference, not new test results:** A retains ordinary PostgreSQL, and C retains it above storage replication. Neither inherently requires changing Prisma 7.10.0/PrismaPg, 26 models, 17 migrations, Finance PL/pgSQL/triggers, advisory locks/`hashtextextended`, row locks, composite tenant FKs or Decimal/Numeric precision. Match the actual PostgreSQL version/extensions/roles before claiming binary or migration compatibility. B's PGD logical/active-active model needs separate equivalence evidence.

[PrismaService](../../apps/api/src/database/prisma.service.ts) currently uses one `DATABASE_URL`, pool maximum 5, 5-second connection timeout and 30-second idle timeout. [API health](../../apps/api/src/app.controller.ts) is liveness plus `SELECT 1`; the [Docker probe](../../infrastructure/docker/api.Dockerfile) uses liveness. Neither establishes writable-leader authority or remote durability.

Architecture-specific future work only:

1. Validated TLS writer endpoint, stale-pool eviction, bounded reconnects and fail-closed write readiness. Do not route financial/authorization decisions to stale replicas.
2. Transaction-scoped operation identifiers and reconciliation for unknown results; bounded retries only for proven retryable transactions. Finance/import and driver-invitation callbacks retain their existing atomic boundaries. External/provider/file effects inside callbacks must not be replayed blindly.
3. A tested acknowledgement path for cancellation warnings and timeout races. Existing 20/30-second invitation and 60-second import transaction budgets are not proof of bounded HA behavior.
4. Enforce the durability policy against runtime session overrides and administrative/configuration drift. A role/database default alone cannot prevent `SET LOCAL synchronous_commit=off`; no enforcement mechanism is qualified here. Promotion APIs, replication identities and fencing controls require separate least-privilege protection. Tenant authorization remains unchanged.

## 6. Operational risks

Principal blockers are an unsafe ACK after cancellation, a bypassable commit policy, ineffective fencing, wrong promotion eligibility, and unbounded recovery—not SQL syntax. Require pinned versions, reviewed maintenance/reconfiguration procedures, no forced stale promotion and a named on-call owner. Region independence does not imply independent account/IAM or encryption-key custody.

WAN stalls can exhaust the small API pool and retain locks; admission and queue limits must reject safely. WAL retention/replication slots can exhaust storage during outages. Restore, corruption detection and backup deletion protection need recurring evidence. Physical or logical replication can copy a destructive authorized change; it is not a backup. A PITR restore to an earlier point intentionally excludes later commits and requires reconciliation, rather than a claim of universal RPO 0.

## 7. Focused qualification plan — future, not executed

Reuse the existing [harness](database-poc-harness.md), [failure matrix](database-poc-failure-matrix.md) and target guards. Do not repeat ordinary PostgreSQL compatibility suites. Before execution approve exact versions, topology, policy enforcement, fencing mechanism and quantitative limits.

1. Run **at least 10,000 synthetic acknowledged writes per declared baseline trial**, with tenant, stable operation ID, payload hash and exact financial values. An independent client outside the failed region durably journals each validated success before a fault barrier can fire. Log attempted, rejected, acknowledged and unknown operations separately; a volatile log is insufficient.
2. Fault immediately after journaled ACK, during commit and after commit before the response. Kill primary process/host, remove an entire site, partition replication/control/client paths independently, lose quorum, delay flush responses and exhaust a standby. Exercise both application sites concurrently and every eligible leader.
3. Pause/kill Patroni while PostgreSQL lives, interrupt fencing, and resume the old primary. Attempt writes through stale pools and direct old endpoints. Record lease, timeline, promotion, fencing and commit evidence; require **zero overlapping authoritative writers and zero conflicting histories**.
4. Inject PostgreSQL cancellation, Prisma deadlines and lost responses during synchronous waits. Test forbidden session overrides, missing standby configuration, local-only substitutes and maintenance transitions. Require **zero falsely acknowledged non-durable operations**, bounded admission and cleanup, and no orphaned transactions/locks after recovery.
5. Reconcile **every ACK** against the recovered authoritative database: zero missing IDs, hash mismatches, duplicate financial effects or tenant violations. Resolve every unknown by the same key and safe durability confirmation; never turn uncertain status into a new mutation. A database-only pass cannot certify the current API's unimplemented universal retry contract.
6. Restore base backup plus WAL/PITR into an isolated target using separate recovery access; simulate deletion and loss of the primary administrative account. Validate synthetic balances, tenant constraints, evidence-reference/checksum manifests and recovery keys. Record recovery time and the exact recovery boundary.

Proposed acceptance budgets for review: deny new admissions within 5 seconds of a confirmed unsafe-policy signal; effective fencing before the old lease expires and before any competing writer; no request/cleanup wait without a declared bound; safe writer service within 60 seconds **only when sufficient remote data capacity remains**. The two-data-site loss case passes by staying unavailable, not by weakening policy. Record ordinary mutation p95/p99 against the existing proposed 1.5s/3s targets; import/upload limits need separate agreement. These are targets, not measured results.

Local Docker can test state transitions, faults and client behavior. It cannot prove independent regional/control-plane failures, cloud fencing effectiveness, real WAN latency, storage flush honesty, provider contractual guarantees or separately administered backup survival. Regional controlled faults and restore evidence remain necessary; no finite test proves every possible failure.

## 8. Cost categories

No provider prices were quoted or resources purchased. These are quantities/categories for a future bill of materials, not verified dollar estimates.

| Category | A: PostgreSQL/Patroni | B: EDB shortlist | C: synchronous storage |
| --- | --- | --- | --- |
| Infrastructure | 2 data hosts minimum; 3 for surviving-region write service; 3 etcd members, A/B app/proxies and global routing. Co-location requires capacity review. | Documented synchronous pattern: two groups of 3 data nodes plus third-region witness-group capacity, proxies, cloud resources and service/license charges; exact SKU unverified. | 2–3 data/storage hosts, witness/control service, fencing devices/APIs and cluster manager; A/B apps/routing. |
| Backup/storage | Data disks, retained WAL, independent immutable archive, keys and temporary restore capacity. | Provider backups plus independently administered recovery/export coverage; retention and restore charges. | Replicated block capacity plus PostgreSQL-consistent backup/WAL, independent archive and restore capacity. |
| Network | Cross-region WAL, control traffic, initial copies, resync, backup egress and client-to-writer traffic. | Cross-group replication, backup/export and failover traffic. | Synchronous block traffic, resync and backup egress. |
| Monitoring/operations | Replication/lease/slot/pool alerts, patching, drills, on-call and optional support. | Managed support reduces some labor; scope/IAM/compatibility/restore ownership remains. | PostgreSQL plus kernel/storage/cluster-manager expertise, coordinated upgrades and support. |
| One-time setup | Guarded POC, routing/fencing, ACK/retry qualification, restore drills and eventual migration/cutover planning. | Vendor guarantee review, logical-replication compatibility work, supported topology setup and cutover. | Storage/fencing validation, filesystem/crash recovery testing, operational training and cutover. |

For a small team, prefer supported operation once guarantees are evidenced; do not buy lower latency or lower cost by permitting async fallback. Prior **$150 total / 72-hour** POC boundaries remain a ceiling, not provisioning authorization. Obtain a current bounded quote including network, retained backups, taxes/support and teardown reserve; stop before any portion exceeds the cap. Inventory and verify destruction of all future temporary paid resources.

## 9. Open questions

- Must writes resume during an unrepaired region outage? If yes, require the third data region and its budget; witness-only C is insufficient.
- What PostgreSQL/provider/version, pooling/TLS path and effective runtime privileges are actually deployed? Can that host expose the required replication and fencing controls?
- How will runtime commit-policy overrides and cancellation warnings be prevented from producing unsafe acknowledgements with PrismaPg? What durability confirmation resolves a locally visible unknown transaction?
- Which regional layout, latency/load targets, fencing mechanism and operator/support owner are acceptable? Can the chosen platform provide reliable host/storage fencing?
- Does the exact EDB customer-cloud offering support the required non-degrading scope, safe eligible promotion and single-writer semantics without changing existing integrity rules? Obtain version-matched written evidence; latest PGD docs are not proof of the deployed managed version.
- Where are backup administration and recovery keys isolated, and what retention, restore time and document-byte recovery requirements must be met?

## 10. Recommended next gate

**Propose LP-PROD-003B: strict PostgreSQL ACK, cancellation and fencing qualification.** Review this document first. Explicitly authorize a disposable local harness gate with pinned versions, two-data-site rejection behavior, optional third-data-site continuation, enforced commit policy and quantified failure bounds. Stop on unsafe ACK, bypassable durability, stale promotion or ineffective fencing before spending on regional tests.

Only after that gate passes should a separately approved regional bill of materials and execution plan test actual failure-domain independence and restore. EDB remains a parallel procurement-evidence option if a supported offer can meet the entire contract. **No production architecture winner, implementation or paid execution is approved by this report.**

Validation for this task: scoped source/document review, official-document research, local-reference and whitespace checks only. No application tests, migrations or HA experiments were run; this file is the sole task change.
