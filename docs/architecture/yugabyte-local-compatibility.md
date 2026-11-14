# Yugabyte local LoadPacket compatibility — LP-PROD-002B1

Date: 2026-10-02. **YUGABYTE_LOCAL_COMPATIBILITY_PASS_WITH_ADAPTATIONS.** Tested application/data semantics passed without changing production code, dependencies or migrations. SQL timeout behavior differs and needs review before regional execution. This is **LOCAL_COMPATIBILITY_ONLY**, not production readiness or RPO-0 evidence.

## 1. Version tested

Pinned image: `yugabytedb/yugabyte:2025.2.6.0-b111`, digest `sha256:98ad2aa1843f73b79f8f0e5bd9e3c90f0b9d7b63aed7a22eadd72abc2dc23d67`. Engine binary verified build 111, revision `ae22ef35ff65de63303467d95ac3e6d2382feba9`. YSQL reports `PostgreSQL 15.12-YB-2025.2.6.0-b0`; that SQL version string is recorded alongside the actual binary build, not interpreted as a version switch. This is the existing BOM's version; see the [official release](https://docs.yugabyte.com/stable/releases/ybdb-releases/v2025.2/#v2025260---september-4-2026).

## 2. Environment

Existing Docker Desktop 29.8.1, Linux x86_64 engine on Windows/WSL2; one disposable node, 4 CPU limit, 6 GiB memory limit. Dedicated tagged container/network, only `127.0.0.1:55486` published for YSQL. The first internal-only Docker network did not publish the port; it and its empty target were removed and replaced with a dedicated bridge. Telemetry was disabled on the tested replacement. No runtime installation or cloud resource creation occurred.

Run ID `yb002b1a2602`; dedicated database `loadpacket_poc_yb002b1a2602`, non-superuser login `lp_poc_yb002b1a2602`. Existing POC environment guard, engine/user/database identity and nonce marker passed. Child processes received the explicitly constructed local URL; no normal application `.env` or production URL was used. Existing source was copied into the ignored POC workspace. `packages/database` contains no implementation; the active adapter is API `PrismaService` / PrismaPg. Prisma validate/generate passed.

Detailed evidence and reproducible local probes: `test-results/poc/yb002b1a2602/` (ignored). No architecture inventory was regenerated.

## 3. Migrations result

**17/17 PASS** through unchanged `prisma migrate deploy` on an empty application schema. No migration failure or edited migration. Individual names/statuses are in `migrations.json`; CLI output is in `prisma-migrate.log`. Fresh-cluster setup explicitly created inert `anon` and `authenticated` NOLOGIN roles for the existing REVOKEs.

## 4. Construct compatibility

| Construct                     | Result                     | Local evidence / limitation                                                             |
| ----------------------------- | -------------------------- | --------------------------------------------------------------------------------------- |
| Decimal                       | PASS                       | Exact `0.10 + 0.20 = 0.30`; Prisma money and concurrent payment totals                  |
| JSON                          | PASS                       | Fixture round trip, Finance/audit workflows                                             |
| Bytes                         | PASS                       | Original CSV checksum and Finance import source bytes                                   |
| DateTime                      | PASS                       | Fixture date/timestamp checks and stop timestamps; exhaustive timezone edges not tested |
| UUID                          | PASS                       | Deterministic fixtures and Prisma-generated IDs                                         |
| Enums                         | PASS                       | All 26 match actual migration order/members; schema-order harness issue below           |
| Compound unique constraints   | PASS                       | SQL/Prisma violations and concurrent idempotency tests                                  |
| Foreign keys                  | PASS                       | Prisma P2003, relationship traversal and signature binding                              |
| Tenant composite foreign keys | PASS                       | Cross-tenant actor insert rejected; Finance/signature isolation tests                   |
| Cascade/restrict              | PASS                       | Existing qualification probes                                                           |
| Raw SQL                       | PASS                       | Finance summaries, aggregates and qualification queries                                 |
| Finance view                  | PASS                       | Actual Finance DB/HTTP results and view queries                                         |
| PL/pgSQL                      | PASS                       | Real migration functions and triggered rejection/duplicate behavior                     |
| Triggers                      | PASS                       | Four triggers; Finance/signature immutability and historical/live duplicate checks      |
| Advisory locks                | PASS / REQUIRES_ADAPTATION | Competing transaction blocks; timeout behavior differs                                  |
| `hashtextextended`            | PASS                       | Direct query and existing Finance/signature paths                                       |
| Explicit row locks            | PASS / REQUIRES_ADAPTATION | Blocking, stop/payment concurrency and real deadlock retry; timeout behavior differs    |
| Partial indexes               | PASS                       | Unchanged migration, catalog and Finance suite                                          |
| Expression indexes            | PASS                       | Normalized indexes and Finance duplicate checks                                         |
| Role-name assumptions         | REQUIRES_ADAPTATION        | Provision inert compatibility roles in a fresh isolated cluster                         |
| Supabase-role REVOKEs         | PASS with prerequisite     | Original SQL applied; both roles lack payment SELECT permission                         |

Catalog evidence contains 111 indexes, 106 constraints and four application triggers. These results do not certify every legacy tenant relation, production-role privilege or deletion policy.

## 5. Targeted test results

- Deterministic fixtures and existing semantic checks: PASS; **78 rows, all 26 models, two tenants**, exact amounts, document/version/signature links, Finance and audits.
- Representative Prisma CRUD/relationships: PASS for Organization, User, Driver, Load, Stop, Document, DocumentVersion, DocumentSignature, FinancialTransaction and audit records. Mutable updates, protected signature/Finance update rejection, rollback, P2002/P2003 and tenant-composite-FK rejection passed.
- Existing Finance database/HTTP gate: **19 scenarios PASS**.
- Existing signature database/HTTP gate: **8 scenarios PASS**, including tenant/role isolation and immutable exact-version evidence.
- Existing stop-event DB suite: PASS; ordering, row-lock concurrency, timestamps, event uniqueness, detention and broker regeneration.
- Existing payment DB suite: PASS; competing billing/payment/approval mutations, exact amounts and event counts.
- Client disconnect before commit and real inverse-lock deadlock: PASS; bounded retry completed after one retry. This is not network/leader-failure evidence.
- Initial generic transaction harness: FAIL on timeout; bounded follow-up established actual locking and the timeout incompatibility below. The original failure is retained, not erased.
- Small latency sanity: **15/15 successful measured operations**, three per operation after one warmup, concurrency one. Median milliseconds: read 1.99; write 4.31; two-record transaction 6.73; load creation 12.76; Finance transaction 7.44. These tiny local samples are not a production benchmark or reliable tail-latency estimate.

No web/mobile tests, full regression, regional faults or cloud tests ran.

## 6. Required adaptations

1. **SQL deadline handling — real engine difference.** With `lock_timeout=250ms`, both row/advisory waiters remained blocked until the holder released at 750ms. With `statement_timeout=250ms`, both returned SQLSTATE 57014 only after holder release at approximately 2,018/2,022ms. A statement-timeout substitution therefore did **not** establish prompt cancellation. Review supported engine settings and application transaction/cancellation behavior, then prove bounded wait/cancellation and rollback before regional execution. Do not disable locks or call a delayed error a successful deadline test. No explicit `lock_timeout`/`statement_timeout` setting was found in the inspected runtime services; no production change was made here.
2. **Fresh-cluster prerequisites.** Provision the two inert role names before unchanged migrations; preserve revocations and verify actual runtime permissions separately.
3. **POC catalog expectation.** The original harness compared enum ordering to current Prisma declaration order. The unchanged SQL history appends three LoadEventType values at the end. A separate check verified all 26 enums against actual migration order. This is a test-expectation issue, not a Yugabyte schema defect; no enum or migration was rewritten.
4. **POC TypeScript test launchers.** Stop/payment tests initially failed to resolve generated Prisma `.js` imports. Explicit `ts-node.register({experimentalResolver:true})`, already used by the Finance/signature launchers, made the unchanged tests pass. The adjustment exists only in ignored local test execution; production files and the shared harness were not edited.

## 7. Blockers and cleanup

Unresolved advancement gate: prompt SQL deadline/cancellation behavior under lock contention. Local tested business invariants passed; this result does not authorize relaxing deadlines, security, locks or durability.

**Cleanup PASS:** marked container stopped/removed, anonymous data volumes removed, dedicated network removed and newly downloaded image removed. No ticket-owned Yugabyte process remains. Initial-attempt resources were also removed. Evidence: `cleanup.json` and resource manifests. Existing Docker/WSL installations remain available; unrelated resources were not deleted.

Production access/changes: NONE. Paid resources: NONE. Cloud spend: **$0**. Commit/push: NONE. Existing source/migration/release-gate fingerprints are preserved.

## 8. Recommendation

Retain Yugabyte as a candidate, conditional on resolving and retesting lock-wait cancellation/deadlines and incorporating the isolated test/setup adaptations. **Do not advance to a paid regional POC yet.** No production application or data-semantic rewrite was needed for the passing local workflows, and no regional durability claim follows from this test.

## Deadline and cancellation qualification

**LP-PROD-002B2, 2026-10-03: YUGABYTE_DEADLINE_QUALIFICATION_FAIL.** Same B1 image digest, pg 8.23.0 and Prisma/PrismaPg 7.10.0; fresh marked local database with synthetic operations only. Acceptance was declared before testing: 250ms requested deadline, response within 500ms, server cleanup within a further 1,000ms, independent of a five-second lock holder. No application migrations or previous compatibility suites were repeated.

- SQL baseline: `lock_timeout=250ms` returned after 5,032ms for row locks (lock acquired) and 2,294ms for advisory locks (`XX000`). `statement_timeout=250ms` returned `57014` after 1,939/2,359ms respectively. These longer-holder observations reproduce missed deadlines; they do not establish that every timeout waits indefinitely for release.
- `pg_cancel_backend` and the driver's PostgreSQL CancelRequest returned `57014` only after holder release, approximately 5,020–5,033ms. `pg_terminate_backend` took 5,054ms for row contention and 284ms for advisory contention; it did not qualify both. Prisma interactive transaction timeout took 5,061/5,025ms (`P2028`); subsequent Prisma SELECT/write/rollback passed. No AbortSignal cancellation API was found in the installed PrismaPg path.
- `pg.query_timeout` returned at 261–279ms but rollback still took approximately 4.7 seconds. Supported [pool connection disposal](https://node-postgres.com/apis/pool) bounded client responses, but left the server transactions active beyond the cleanup limit while holders remained locked. A fast client error is insufficient. [Yugabyte transaction cancellation](https://docs.yugabyte.com/stable/api/ysql/exprs/func_yb_cancel_transaction/) remained unqualified: ordinary-role lock inspection was denied, and a diagnostic admin lookup could not safely identify the waiter (`pg_locks.pid` was NULL). No arbitrary transaction cancellation or privilege grant was attempted.
- Disposal stress: **0/20 sequential and 0/20 concurrent qualified**, alternating row/advisory contention. Client response ranges were **251–266ms row / 250–263ms advisory**; all 40 server transactions missed cleanup bounds. Replacement-connection SELECT, transaction, write and rollback passed **40/40**. Unknown outcomes remained unknown until backend disappearance and operation-ID reconciliation after holder release. No partial/committed test writes, residual transaction locks or stuck transactions remained in final inspection.

**Required application adaptation: none qualified; no production code changed.** Keep regional advancement blocked pending an engine-supported cancellation resolution and a fresh focused gate. Evidence/probes: ignored `test-results/poc/yb002b2a2603/`. Production access/changes, paid resources and commit/push: NONE; cloud spend: $0. **Cleanup PASS:** B2 container/processes, network, both anonymous volumes and newly downloaded image removed; existing Docker runtime preserved. Verification: `cleanup.json`.
