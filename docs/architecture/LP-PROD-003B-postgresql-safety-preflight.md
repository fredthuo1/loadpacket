# LP-PROD-003B — PostgreSQL durability safety preflight

Completed 2026-10-20 (America/Chicago); failure recorded 2026-10-21 02:02:00 UTC. **RESULT: FAIL. Production advancement: BLOCKED.** The existing PrismaPg/pg transaction path reported success after synchronous-wait cancellation without remote durability. Qualification stopped immediately in Phase 3 under the ticket's early-stop rule. No workaround was implemented.

Production access/migrations, customer data, cloud provisioning, paid resources, application changes and commit/push: **NONE**. Local cloud spend: **$0**.

## 1. Versions and topology

Run ID: `pg003b261020`. Detailed evidence and disposable probe scripts: ignored `test-results/poc/pg003b261020/`.

- PostgreSQL **18.3**, Debian `18.3-1.pgdg12+1`, Linux amd64. Base image `postgres:18.3-bookworm`, digest `sha256:80630f83606d8db77d30b3851b16a9f78be2d0d4dda6f7b82a1fdca5ebe3acba`.
- Patroni **4.1.5**, psycopg2-binary **2.9.11**; task image ID `sha256:f9f8078dcef285e4dcf8fa27e66349a36547b258a49c3f2680bd754fc3cf51ce`. Installed Python dependencies recorded in `python-installed.json`.
- etcd **3.6.5**, commit `a061450`; image `quay.io/coreos/etcd:v3.6.5`, digest `sha256:3397341272b9e0a6f44d7e3fc7c321c6efe6cbe82ce866b9b01d0c704bfc5bf3`.
- Existing Node **24.19.0**, Prisma/PrismaPg **7.10.0**, pg **8.23.0**. No application dependency changes.
- Two PostgreSQL/Patroni containers and three healthy etcd members on one Docker Desktop **29.8.1** host. Primary `pg1`, synchronous standby `pg2`; SQL published only at `127.0.0.1:55490/55491`. Coordination and Patroni REST ports were not published.
- `synchronous_mode=true`, `synchronous_mode_strict=true`, `synchronous_node_count=1`, `check_timeline=true`, `failsafe_mode=false`, `synchronous_commit=on`, `fsync=on`, `full_page_writes=on`. Primary selected `pg2` as synchronous standby. Watchdog disabled: real host fencing was not available or qualified.

All containers, volumes, networks, database/user names and credentials were task-specific. The application test role had DML rights on synthetic operations and SELECT on the run marker; no superuser, role/database creation, replication, BYPASSRLS or object ownership. No application `.env` was loaded. Existing target/identity guards and fsynced journal code were reused; only synthetic marker/operation tables were created, with no application migrations.

Setup-only corrections: elevated PATH initially selected Node 20; subsequent probes explicitly used Node 24. Docker's internal-only network did not publish SQL ports, so a separate task-owned client bridge was attached to the database containers. A metadata lookup and a probe syntax error were corrected before the affected probes executed. These are recorded as harness setup issues, not database qualification failures.

## 2. Tests executed

Phase 1 isolation, marker, role, version, synchronous-replication and three-member etcd checks completed. Phase 2 executed all six requested scenarios. Phase 3 executed one cancellation probe through the existing generated Prisma client and PrismaPg/pg, then stopped on hard failure.

Declared bounds: 2-second blocked-commit observation, 10-second recovery/cleanup bound, 15-second raw-query guard; cancellation probe used a 10-second Prisma transaction budget. No deadline was classified as rollback. This preflight used five Phase 2 operation IDs and one cancellation operation, **not** the deferred 10,000-write regional qualification.

Evidence: `criteria.json`, `topology.json`, `versions.json`, `etcd-status.json`, `ack.jsonl`, `ack-results.json`, `cancellation.json`, `cancellation.jsonl`, `early-stop.json`.

## 3. Acknowledgement results

| Scenario | Observation | Classification |
| --- | --- | --- |
| Successful commit with remote flush | COMMIT returned; sampled primary and standby flush LSN both `0/349A990`; row readable on standby. | **ACKNOWLEDGED**, valid for this trial. |
| Missing synchronous standby | Standby stopped; transaction remained in `SyncRep` at 2,135ms. Completed 1,358ms after restoration began. | **UNKNOWN while waiting**, then **ACKNOWLEDGED** after restoration. |
| Standby disconnected before COMMIT | Replication network detached; `SyncRep` still waiting at 2,118ms. Completed 1,494ms after reconnection began. | **UNKNOWN while waiting**, then **ACKNOWLEDGED**. |
| Standby lost after ACK | Four acknowledged rows remained on primary and appeared on restarted standby. | **4/4 preserved; 0 missing**. |
| Delayed replication confirmation | Standby paused; `SyncRep` still waiting at 2,134ms. Completed 202ms after unpause began. | **UNKNOWN while waiting**, then **ACKNOWLEDGED**. |
| Client disconnected before COMMIT response | Socket destroyed during `SyncRep`; pg reported `Connection terminated unexpectedly`. After standby recovery the row existed on both nodes. | **UNKNOWN** to the caller; later reconciled committed. Never retroactively counted as an ACK. |

Phase 2 totals: **4 valid ACKNOWLEDGED operations, 1 UNKNOWN operation, 0 definite REJECTED operations**. PostgreSQL blocked commits while durability was unavailable; this does not prove bounded application-level write rejection. Standby recovery preserved acknowledged rows, but primary-loss recovery was not tested.

## 4. Cancellation behavior — HARD FAIL

The isolated client used `new PrismaClient({ adapter: new PrismaPg(pool) })` with the existing generated client and pool settings matching PrismaService: maximum 5, connection timeout 5 seconds, idle timeout 30 seconds. Observation hooks recorded pg notices and COMMIT results without converting them into errors. No API endpoint was invoked.

Sequence: pause standby; insert `PRISMA-CANCEL-SYNCREP` inside `$transaction`; identify that transaction's PID; observe PostgreSQL waiting on `SyncRep`; invoke `pg_cancel_backend(pid)` from the isolated observer. Cancellation returned `true`.

Exact client-visible result:

```text
pg notice: WARNING, SQLSTATE 01000
message: canceling wait for synchronous replication due to user request
detail: The transaction has already committed locally, but might not have been replicated to the standby.
pg result: { command: "COMMIT", rowCount: null }
Prisma $transaction: resolved successfully
value: { operationId: "PRISMA-CANCEL-SYNCREP" }
elapsed from transaction start: 120ms
```

At success, the standby was still paused. Its last receive/replay and primary-observed standby flush LSN remained **`0/349AE80`**, while primary flush advanced to **`0/349AF70`**. The inserted row was visible on the primary after cancellation; the backend was idle outside a transaction. Thus success was exposed through the real adapter path without the required remote copy.

**Observed client outcome: ACKNOWLEDGED, falsely successful under the contract. Safe durability classification: UNKNOWN, not REJECTED.** This behavior is consistent with the [PostgreSQL synchronous-wait cancellation path](https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/replication/syncrep.c) and [Patroni's documented caveat](https://patroni.readthedocs.io/en/latest/replication_modes.html).

After stopping qualification, cleanup unpaused the standby and reconciled all six rows, including the unsafe result. Later replication does not repair the earlier acknowledgement. No forced promotion or deliberate destruction was needed to establish the missing remote durability. Automatic Prisma deadline expiry and other cancellation variants were **NOT_RUN** after this failure.

## 5. Policy enforcement

**NOT_RUN — stopped before Phase 4.** The intended least-privilege synthetic role and initial settings were inspected, but authorized/unauthorized `SET`, `SET LOCAL`, `ALTER SYSTEM`, standby-name and replication-configuration mutation attempts were not executed. No claim is made that the role enforces the policy or that a bypass was experimentally demonstrated here. The feasibility report's session-override concern remains unresolved. Production advancement is already blocked by Phase 3.

## 6. Fencing observations

**NOT_QUALIFIED.** Initial leader election and synchronous standby recovery were observed. Primary failure, Patroni-only failure, coordinator quorum loss, old-primary rejoin, stale writer connections and promotion eligibility fault tests were **NOT_RUN** because the early-stop rule took precedence. Three running etcd members and a strict replication setting are not fencing proof. No conflicting primary was observed in the executed probes, but those probes cannot establish its impossibility.

## 7. Unverified regional guarantees

This single-host Docker setup does not prove regional independence, remote storage flush honesty under power failure, cloud fencing, WAN latency, application-site routing, safe regional promotion, independently protected backups or restoration. No primary-region-loss exercise, 10,000-write trial, Finance/migration suite, application regression or production inspection ran.

## 8. Hard blockers

1. **Demonstrated:** a cancelled synchronous wait yielded pg COMMIT success and successful Prisma transaction resolution without remote durability. The acknowledgement contract fails on the tested path.
2. **Unqualified:** enforceable commit-policy restrictions and cancellation/deadline behavior across all relevant paths.
3. **Unqualified:** fencing, failover eligibility, stale connection handling and regional/backup guarantees.

These findings block advancement of this design as currently specified. They do not prove that every PostgreSQL architecture is incapable of meeting the contract.

## 9. Recommendation and cleanup

**Do not advance to regional deployment or production implementation.** Review the failure first. Any proposed mitigation needs separate authorization and an enforceable acknowledgement/commit-policy design before another disposable qualification. No mitigation, role redesign or application workaround was attempted here.

**Cleanup PASS:** removed five task containers, five named volumes, both task networks, the custom image/intermediate image chain, newly downloaded component image tags, and ephemeral credential/configuration files. Label-scoped verification found no remaining task containers, volumes, networks or images. Existing Docker resources and Docker Desktop were preserved. Redacted configuration, pinned resource inventory and detailed evidence remain in the ignored run directory; `cleanup.json` records verification.

Five scoped source/harness/lockfile fingerprints remained unchanged. Probe syntax, document-reference and whitespace checks passed. The sole non-ignored task change is this report; no application lint/typecheck/full tests were run because application code was unchanged and the ticket excludes those suites.
