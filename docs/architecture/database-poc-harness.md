# Database POC harness — LP-PROD-002A

Prepared 2026-10-02. **LOCAL PREPARATION VALIDATED; LIVE CANDIDATE QUALIFICATION NOT_RUN.** No winner selected. Read the [prior repository audit](lp-prod-001-report.md), [compatibility inventory](database-compatibility-inventory.md), [write paths](current-write-paths.md) and [POC plan](database-poc-plan.md). The [CLI instructions](../../scripts/poc/README.md) are the executable entry point.

## Isolation and evidence boundary

All additions are isolated under `scripts/poc`; production runtime/schema/dependencies, application test files and release gates are unchanged. The guard requires explicit POC opt-in, dedicated database/user/run, literal loopback on a dedicated port, operator isolation attestation and a nonce marker in the connected database. An ordinary `DATABASE_URL` is rejected, not used as a default. Host redirection query parameters and provider hostnames are rejected. The process must not load normal `.env` files. Even a valid local URL cannot prove the destination of an arbitrary tunnel; the operator must establish its upstream isolation before connection.

Bootstrap requires a separate run-ID opt-in, verifies engine/user/database and refuses nonempty application databases. Live commands verify the marker; cleanup planning is read-only. No cloud SDK, provider login, resource creation or deletion executor is included. Preparing the copy uses existing installed dependencies; no new packages are installed. Child test processes receive only basic OS variables, the explicit disposable URL, test opt-ins and local storage settings.

## Deterministic fixtures

`fixtures.mts` derives UUIDs, timestamps, checksums and fictional values deterministically from the run ID, covering all **26 models and 26 source enums in the inventory**, with two tenants. Every fixture scalar column and required field is checked against the real schema. Money is decimal text, never floating-point. Rows include OWNER, DISPATCHER, BACK_OFFICE, DRIVER, drivers/assignments, loads/stops, RateCon/BOL/POD metadata, document versions, signature evidence metadata, agreements/acceptances, grants, invitations, imports, historical loads, Finance and audit records. The actual schema has no ADMIN role: the OWNER account is the administrative persona; no production role is invented.

Fixtures contain only `example.invalid` addresses and fictional content. Database Bytes include a tiny synthetic CSV. Object keys/checksums are metadata; matching PDF/signature files are not supplied or claimed durable. Seed refuses existing fixtures rather than overwriting immutable evidence. Fresh-run IDs allow repeatable independent trials; same-ID regeneration is byte-deterministic.

## Schema qualification

`inventory()` reads the actual schema and all **17 existing SQL migrations**, captures complete declarations and SQL plus SHA-256 hashes, and fails on unreviewed model/enum/migration count drift. The isolated Prisma config has no dotenv/seed hook. `schema` runs validate, generate, migrate deploy, then catalog checks on the guarded target.

Catalog checks assert every model table, exact enum members/order, four application triggers and two normalized expression/partial indexes; capture all public constraint/index/column definitions, numeric precision/scale and temporal types; query the Finance view and `hashtextextended`. `qualify` probes Decimal, Json, Bytes, DateTime, deterministic UUID IDs, compound uniqueness, cross-tenant composite FK insertion, payment checks, Finance/signature UPDATE immutability, duplicate-load trigger, tenant predicates, cascade and restrict behavior. `checks` tests real row/advisory blocking and transaction rollback/savepoints/concurrent same-key insertion. SQL incompatibility fails a stage; no automatic translation occurs.

This is deliberately not an assertion that every catalog object is semantically equivalent. Before qualification, compare captured definitions to the inventory, run the existing real database suites and add source upgrade/backfill fixtures; include UUID defaults/casts, Decimal limits, Json edge cases, nullable uniqueness, timezone/DST precision, PL/pgSQL error behavior, grants/RLS and intended low-privilege runtime roles. Current legacy ID-only relations and delete paths are not magically protected by a successful tenant predicate probe.

Supabase-role prerequisites: migrations contain unconditional REVOKEs referring to `anon`/`authenticated`. Disposable setup must supply inert NOLOGIN roles with no production grants. No production role or credential is copied. These names alone do not reproduce Supabase Data API behavior. Runtime privilege/RLS evidence remains a separate hard review.

## Existing application suites

`application.mts` copies the existing API and contracts into the ignored run workspace; source production files remain untouched. Only four copied Finance/signature target guard literals are adapted to the dedicated POC database/port, and a no-dotenv Prisma config is created. This is a target adapter, not a business-rule change. The original launchers still require their original isolated target.

The command manifest contains API strict typecheck, ESLint, Nest build, Jest unit/HTTP suites, real Finance/signature tests, stop-event concurrency, payments and company/driver tests. HTTP suites include authentication/role/tenant tests, but many use database doubles; report those separately from real candidate tests. Finance/signature integration uses synthetic auth while exercising actual services and database constraints. Do not infer regional safety from any mocked suite.

Track A uses unchanged PostgreSQL migrations/provider. Track B is explicitly `BLOCKED_COCKROACH_CONNECTOR_BASELINE`: production Prisma uses the PostgreSQL provider/adapter and PostgreSQL-specific history; a reviewed isolated connector and equivalent migration design are prerequisites. Track C uses the unchanged PostgreSQL protocol path but must pass advisory-lock, PL/pgSQL, trigger, index, adapter and transaction semantics. Any unsupported feature is evidence, not a reason to remove a test. External adapters must remain synthetic and local in all tracks.

## Client ACK ledger and idempotency

`operations()` produces WRITE-000001 through WRITE-010000, alternating fictional tenants, stable same-key payload hashes and exact decimal amounts. `Journal` uses exclusive creation and fsync for submitted intent and observed result on the independent runner. Client history and recovered database rows are separate inputs to reconciliation. Incomplete intent becomes UNKNOWN_OUTCOME. REJECTED is supported for definite pre-mutation rejection only; live SQL uncertainty is conservatively unknown.

The POC-only transaction atomically records a unique operation and one corresponding effect, locks/checks the original payload and awaits COMMIT before ACK. Retry is limited to serialization/deadlock SQLSTATEs 40001/40P01 with bounded attempts, not arbitrary connection failures. Response suppression deliberately records unknown after a successful commit, then `retry-unknown` reuses the same key. This is **POC/TARGET CAPABILITY**. **CURRENT APPLICATION CAPABILITY** has no universal operation registry or safe retry of all external side effects. Production idempotency remains NOT_VERIFIED.

Reconciliation records attempted, ACKed, rejected, unknown, present, missing ACKs, duplicate authoritative records, mismatches, unresolved unknowns and unattempted IDs. Any lost ACK, duplicate/conflicting effect or rejected-but-present contradiction fails. Unresolved unknowns or incomplete workload fail the completeness gate. Run and retain reconciliation immediately after fault recovery **before retries**, then again after reconciliation/retry. Do not let retry reconstruction hide data loss. A baseline trial must have all 10,000 durable pre-fault ACKs; a response-loss trial has a different declared ACK denominator.

## Transactions and fault execution

Prepared executable SQL checks cover commit, rollback, savepoint, unique race, two independent connections, row/advisory locks and bounded retry. The additional `disconnect-deadlock` probe disconnects an uncommitted client and creates a real inverse-lock deadlock that must recover through bounded retry. `retry-stress` executes ten sequential and ten concurrent same-key replays for each original unknown operation and rejects a changed payload. These live probes are NOT_RUN here. Unit injection tests serialization/deadlock codes and connection uncertainty; that is not a real deadlock or network experiment. Nested service behavior and application concurrency use the existing real DB suites. Before/after-commit network disconnect, leader transition and repeated concurrent retries use the staged procedures in the [13-scenario matrix](database-poc-failure-matrix.md). Provider-specific kill/partition/restore adapters must be pinned and reviewed against actual allowlisted resource IDs in 002B. None is executed here.

## Latency protocol

The measured dimensions are simple read, simple write, multi-record transaction, load creation, document metadata commit, driver stop event, signature commit and Finance transaction, each separately for database and end-to-end API. `latency-workloads.mts` provides eight committed SQL probes against the real model tables. `runLatencySuite` requires all eight callbacks, excludes warmups, awaits completion, retains failed samples, and reports nearest-rank p50/p95/p99 with sample count. Missing dimensions remain NOT_RUN. Never report a failed request as successful low latency.

API binding recipe for the isolated existing Nest/Supertest real-database setup:

- Simple read: authenticated load detail; assert ID/tenant and expected values.
- Simple write: authenticated assign-driver mutation on a fresh load; include response validation.
- Multi-record transaction: existing load-from-RateCon workflow on synthetic confirmed document metadata.
- Load creation: existing manual-load endpoint with fresh load number and valid stops.
- Document metadata commit: driver BOL/POD capture using a tiny synthetic upload and local storage; label the end-to-end result as including upload/validation.
- Driver stop event: assigned driver's arrival/departure endpoint with a fresh eligible stop/assignment per trial.
- Signature commit: optional BOL/POD signature endpoint with synthetic image/evidence and fresh idempotency key; include existing validation and local storage.
- Finance transaction: existing Finance create endpoint as OWNER/BACK_OFFICE with a fresh key; assert exact amount and linked audit record.

Bind callbacks using current DTOs and real services, synthetic token verification and local storage from the existing database tests. The generic measurement runner is executable; these eight full API workload bindings remain an explicit 002B integration prerequisite and are not presented as measured or completed. Direct SQL analogues intentionally do not reimplement production domain decisions.

Default SQL probe load is concurrency 1, 10 warmups and 100 measured operations per dimension. For credible p99, collect at least 1,000 measured samples per dimension in the approved live run and state concurrency, throughput, payload bytes, pool size, timeouts and retry rate. Repeat normal and one-region-lost phases from the independent runner; record DB commit round trip separately from HTTP/service/file time. Existing proposed p95 1.5s/p99 3s mutation targets are preferences, never permission to weaken durability.

## Restore protocol

`snapshot` reads all 26 tables in a repeatable-read transaction, stores counts and full-row content hashes, and includes authoritative POC operations/effects. Thus tenant ownership, relations, load/stops, Finance/import Bytes, document metadata/versions/signatures and audits all contribute to the comparison. Preserve the original manifest outside the failed domain. Restore into a new isolated cluster with the same run marker/database identity, capture another manifest and compare. Record migration/schema versions, roles, backup hashes, engine timeline/target time and encryption access separately.

Snapshot/PITR/logical-corruption recovery must reproduce the declared boundary exactly. PITR intentionally precedes later writes: preserve and reconcile the later valid ACK delta before any hypothetical cutover; comparing only the older boundary is insufficient for no-loss recovery. Object bytes are OUT_OF_SCOPE. No live backup or restore occurred in 002A.

## Qualification status

Local unit/type/lint/dry-run results validate tooling only. No installed disposable DB/container engine was available; all engine migrations, real application/database integration, SQL benchmarks, live faults and restores are NOT_RUN. This ticket does not change any of the 27 production release gates. See the [scorecard](database-poc-scorecard.md), [BOM](database-poc-bom.md) and [final preparation report](lp-prod-002a-report.md).
