# LP-PROD-003C — Durable acknowledgement and commit policy

Completed 2026-10-20 (America/Chicago). Local research only; reused [003A](LP-PROD-003A-postgresql-ha-feasibility.md), [003B](LP-PROD-003B-postgresql-safety-preflight.md) and the existing guarded harness. Evidence: ignored `test-results/poc/pg003c261020/`. No production access, application/dependency changes, migrations, customer data, cloud resources, payments, commit or push. Cloud spend **$0**.

## 1. Executive decision

**FAIL.** The tested acknowledgement path can return success without remote durability, even with no warning delivered. Ordinary PostgreSQL role/default/parameter privileges also failed to prevent a session-level durability downgrade.

No replacement acknowledgement mechanism is qualified. Phase B is **NOT_QUALIFIED**; Phase E's proposed mechanism tests were **NOT_RUN** because their prerequisites were not met. Live investigation stopped at the first demonstrated policy bypass in Phase C. Remaining design analysis below records requirements and limitations; it does not authorize or implement a custom commit protocol.

This disqualifies the current success interpretation and tested enforcement controls. It does not establish that every PostgreSQL architecture is incapable of meeting the requirement. A safe solution needs a stronger, separately reviewed trust boundary and failover proof than configuration defaults plus successful Prisma resolution.

## 2. Exact root cause of 003B's unsafe success

PostgreSQL writes the transaction's commit record locally before waiting for synchronous replication. Cancelling that wait cannot undo the local commit. The [PostgreSQL cancellation path](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/replication/syncrep.c) exits the replication wait with a warning; normal command completion can still follow. [Patroni documents this limitation](https://patroni.readthedocs.io/en/latest/replication_modes.html), including with strict synchronous mode.

Installed **pg 8.23.0** emits notices through the connection's `notice` event. Its query completion path supplies a successful result when no query error occurred. Installed **PrismaPg 7.10.0** awaits `client.query()` and translates thrown errors; it does not return a transaction-specific replication receipt or treat notices as failed commits. Prisma's transaction promise therefore resolved in 003B despite the missing remote confirmation. Inspected sources: `apps/api/node_modules/pg/lib/client.js`, `pg/lib/query.js`, and `@prisma/adapter-pg/dist/index.js`.

This is a mismatch between SQL transaction completion and LoadPacket's stronger two-region acknowledgement contract, not evidence that the business transaction rolled back. Pool settings from [PrismaService](../../apps/api/src/database/prisma.service.ts) do not close that gap.

## 3. Machine-readable acknowledgement evidence

**No reliable positive durable-commit distinction was found in the installed result path.** The cancellation notice observed in 003B had machine-readable severity `WARNING` and generic SQLSTATE `01000`; that code is not a unique synchronous-durability receipt. Message text and source-file/routine fields are not a supported transaction confirmation protocol. PostgreSQL's [message formats](https://www.postgresql.org/docs/18/protocol-message-formats.html) give COMMIT command completion a command tag, not a commit LSN, replica identity or durability certificate. ReadyForQuery's transaction state does not certify replication.

The minimal new reproduction set `SET LOCAL client_min_messages=error` inside the transaction, paused the standby, waited for `SyncRep`, then cancelled only that backend. Results:

- **pg notices: `[]`**; COMMIT result `{ command: "COMMIT", rowCount: null }`.
- **Prisma resolved successfully in 122ms**, returning `{ operationId: "PRISMA-CANCEL-SYNCREP" }`.
- Standby remained paused with receive/replay/flush LSN **`0/3445EE0`**. Primary flush advanced to **`0/3446048`** and the synthetic row became locally visible.
- The backend was idle outside a transaction. After restoration the row replicated; this did not validate its earlier success.

Thus even “success with no warning” is insufficient. Warning suppression is documented by [`client_min_messages`](https://www.postgresql.org/docs/18/runtime-config-client.html#GUC-CLIENT-MIN-MESSAGES); no warning-text parser was used to determine the outcome.

**Delivery and attribution:** messages received on one intact connection retain protocol order; this task found no arbitrary TCP reordering. However, notices may be filtered before transmission, lost with a broken connection, ignored without a listener, or misattributed when connection-level events are pooled without transaction association. [Notice fields](https://www.postgresql.org/docs/18/protocol-error-fields.html) do not supply a durable application operation ID. Absence of a notice is not positive proof.

**Different interruption paths:** explicit PostgreSQL cancellation during `SyncRep` was reproduced. Socket loss can hide a completed commit, as 003B already demonstrated. Prisma callback timeout before COMMIT may cause rollback, but a timeout during completion must not be presumed equivalent. [Prisma v7 transaction documentation](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions) describes timeout/rollback behavior, not a cross-region durability receipt. API timeout or application shutdown may occur while the database continues independently. Automatic Prisma timeout, process shutdown and ordering/pool stress were not newly tested; those uncertainties remain `UNKNOWN_PENDING` unless independently resolved.

## 4. Durability confirmation mechanisms — none qualified

The following are **conditional reasoning from supported primitives**, not implemented mechanisms or test passes. PostgreSQL exposes [WAL positions](https://www.postgresql.org/docs/18/functions-admin.html) and [replica flush/replay statistics](https://www.postgresql.org/docs/18/monitoring-stats.html#MONITORING-PG-STAT-REPLICATION-VIEW). Neither by itself binds a customer result to safe future promotion.

| Candidate evidence | What it can establish | Why it is insufficient alone |
| --- | --- | --- |
| Operation ID and request hash committed with effects | Identifies the intended operation and supports deduplication in one authoritative history. | A local row can exist after cancelled replication. It is not proof of a remote copy. |
| LSN sampled before COMMIT | Position of preceding WAL. | May exclude the transaction's commit record. |
| Post-commit WAL upper bound on the same history | An insert position obtained after local commit can bound the commit record on that history. | Bare LSNs are not globally unique across timelines/clusters. A sampled flush position can lag an asynchronous commit; it is not automatically that upper bound. Connection/leader changes invalidate casual comparisons. |
| Identified remote flush at or beyond a valid bound | Under an unchanged physical WAL history and trustworthy storage, that copy has durably received the preceding WAL, including the bounded commit. | Must bind cluster/timeline ancestry, operation identity, physical replica identity and regional placement. Replacement or promotion can invalidate an unrelated/stale measurement. No complete binding/fencing mechanism was qualified here. |
| Read of the operation on a standby | Shows that the selected endpoint can see that row. | Does not by itself attest flush semantics, two independent regions, the chosen authoritative history or future promotion eligibility. A reused endpoint name is insufficient. |
| Later genuinely synchronous WAL-producing commit | On the same WAL history, durable remote flush through the later commit covers earlier WAL. | Its reported success has the same cancellation/override weakness unless independently proven. A read-only/no-op transaction need not wait for replication. A new leader's unrelated history cannot certify the old one. |
| Leader lease / healthy replication query | Useful admission and coordination evidence at observation time. | Not atomic with commit or acknowledgement, and not proof that every eligible future leader contains the operation. |

The WAL-prefix reasoning is technically useful under its assumptions. It is **not** a production-ready operation-confirmation API. [Physical synchronous replication](https://www.postgresql.org/docs/18/warm-standby.html#SYNCHRONOUS-REPLICATION) supplies the underlying flush behavior; LoadPacket still needs a supported, enforceable way to preserve the operation/history/placement relationship through cancellation and topology transitions. Repeatedly querying LSNs or adding another unverified commit would create a custom protocol without closing those races. No such protocol was built.

## 5. Commit-policy enforcement findings

Fresh synthetic role: non-superuser, non-owner, no CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS, only synthetic DML and marker-read grants. The administrator set **both role and database `synchronous_commit=on` defaults**, then executed `REVOKE ALL PRIVILEGES ON PARAMETER synchronous_commit FROM PUBLIC, <app-role>`. A fresh application session initially showed `on`.

| Local probe | Actual result |
| --- | --- |
| App `SET synchronous_standby_names='pg2'` | Rejected, `55P02`: cannot change now; catalog context is `sighup`, not a session setting. |
| App `ALTER SYSTEM SET synchronous_standby_names='pg2'` | Rejected, `42501`. |
| App `ALTER SYSTEM SET wal_level='replica'` | Rejected, `42501`. |
| App changes database default | Rejected, `42501`: database ownership required. |
| App changes administrator role default | Rejected, `42501`. |
| App `BEGIN; SET LOCAL synchronous_commit=local; SHOW synchronous_commit` | **Succeeded: `local`**, despite defaults and revoked parameter grants. Immediate stop; cleanup rolled back this settings-only transaction. |

No business write was needed to prove the session-policy bypass. `local` removes the remote wait; this is documented in [WAL settings](https://www.postgresql.org/docs/18/runtime-config-wal.html#GUC-SYNCHRONOUS-COMMIT). Catalog inspection confirmed `synchronous_commit` and `client_min_messages` have context `user`; `fsync` and standby names are `sighup`, and `wal_level` is `postmaster`.

[PostgreSQL parameter privileges](https://www.postgresql.org/docs/18/ddl-priv.html) delegate settings that otherwise require superuser authority; revoking them does not turn a user-settable parameter into a protected setting. Session `SET` and transaction-local settings therefore remain a concern. Ordinary users can also change applicable own-role defaults under [`ALTER ROLE`](https://www.postgresql.org/docs/18/sql-alterrole.html); that additional bypass route was documented, not executed after the stop.

Protecting files, ALTER SYSTEM, replication identities and Patroni/DCS administration remains necessary but does not constrain this user-level override. Administrative defaults, pool initialization, a query-time health check or revoking `set_config` alone cannot establish the required policy. No supported deny control was demonstrated for this role's existing arbitrary-SQL capability. A restricted mutation interface, trusted gateway or engine-supported enforcement would change the trust boundary and require broader design/qualification. Trigger checks or function-local settings must not be assumed to govern the later COMMIT. No such redesign was attempted. Patroni/DCS administrative permission attacks were not tested.

## 6. Unknown-outcome reconciliation design

**Conceptual minimum, not an implemented acknowledgement protocol:**

- Use a stable operation key scoped by authenticated organization, a canonical request hash, and a transaction-scoped operation/result record committed atomically with all database effects. Enforce uniqueness; same key with a different hash is a conflict. Preserve tenant checks on status lookup and retry.
- `ACKNOWLEDGED_DURABLE`: return the original result only after the exact committed effects satisfy qualified remote durability and authoritative-history evidence. **This transition has no qualified implementation here.** Neither a locally stored “complete” flag nor successful Prisma resolution can authorize it.
- `UNKNOWN_PENDING`: COMMIT response loss, cancelled replication wait, connection loss after possible commit, API deadline, shutdown or uncertain leader transition. Retain the key; do not claim rollback, regenerate an ID, or blindly replay the callback.
- `REJECTED_BEFORE_COMMIT`: only when admission rejected before mutation/commit was attempted and no earlier attempt with that key is unresolved.
- `FAILED_WITH_CONFIRMED_ROLLBACK`: only when execution evidence establishes rollback of that attempt before commit, with no unresolved previous attempt. An attempted ROLLBACK after a cancelled COMMIT cannot undo the already committed transaction.

After recovery, fence the old writer and identify the authoritative history before reconciliation. If the matching operation exists, verify its complete atomic effects and the still-unqualified durability condition before returning success. If absent, absence on a lagging reader or while an earlier writer/transaction might still finish is inconclusive. Only after that ambiguity is closed may the same key be retried transactionally. Concurrent retry is serialized by the unique key and existing domain constraints; never duplicate Finance effects, loads, signatures or document metadata.

External file/provider side effects need their own stable identities and recoverable coordination; a SQL uniqueness constraint cannot make them transactional. Existing callbacks must not be replayed wholesale. Designing these boundaries across all mutation paths exceeds this local research ticket. Without the missing confirmation and fencing proof, the safe outcome remains `UNKNOWN_PENDING`, with no unsupported promise of eventual automatic resolution.

## 7. Local results and cleanup

Run `pg003c261020`: PostgreSQL **18.3**, Patroni **4.1.5**, etcd **3.6.5**, Node **24.19.0**, pg **8.23.0**, Prisma/PrismaPg **7.10.0**. Two PostgreSQL nodes, three etcd members; fresh isolated database/credentials, guarded marker, loopback ports **55492/55493**, private coordination network and task-only client bridge. Component versions matched 003B; exact image digests and installed packages are in `resources.json` and `python-installed.json`. Watchdog was disabled; no host fencing claim.

Executed only topology/identity checks, **one cancellation reproduction with warning suppression**, administrator default/ACL setup, **five denied configuration probes and one successful session downgrade**, plus recovery/cleanup. Reused 003B's normal commit, standby interruption and lost-response findings; did not repeat those scenarios. No new normal-commit or 10,000-write qualification is claimed. No application/Finance/migration/regression tests ran.

Evidence: `cancellation.json`, `policy.json`, `early-stop.json`, `post-stop-reconciliation.json`, `cleanup.json`. The reused reproduction's `phase-a-finding.json` retains its original numeric phase label from 003B; it is Phase A evidence for this ticket. No alternative acknowledgement implementation was tested; Phase E stayed **NOT_RUN**.

**Cleanup PASS:** removed five task containers, five volumes, two networks, task-created images/intermediate images, newly pulled component images and ephemeral credential/configuration files. Label-scoped inventory is empty. Preserved existing Docker resources and the Docker Desktop engine. Five scoped source/harness/lockfile fingerprints are unchanged. Redacted evidence and probe scripts remain ignored. Document structure/references/whitespace and probe syntax checks passed.

## 8. Unresolved risks

No complete operation-to-WAL-to-authoritative-history certificate, enforceable application commit policy, proven fencing or transition-safe reconciliation exists in this qualification. Regional storage independence, storage flush honesty, standby replacement, forced/unsafe promotion, node identity reuse, real WAN failures, backup/restore and external document effects remain unverified. Warning suppression was demonstrated; warning loss/reordering stress and automatic timeout/shutdown variants were not. A local probe cannot establish cross-region RPO 0.

## 9. Recommended next gate

Stop advancement of the current configuration-only design. Seek a separately authorized architecture decision identifying a **supported enforcement and acknowledgement boundary**, with explicit cancellation, arbitrary-SQL privileges, operation identity, regional-copy identity and promotion/fencing guarantees. Require evidence before selecting any candidate or resuming tests. A managed service or another enforcement architecture must prove the same contract; its product label is not sufficient.

If meeting that contract requires a restricted write interface or a new recovery service, estimate and review that redesign explicitly. Do not expand this ticket into its implementation. No regional provisioning, production changes or deployment are authorized by this report.
