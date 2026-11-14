# LoadPacket isolated database POC harness

LP-PROD-002A, completed 2026-10-02. Preparation only. No production target, cloud provisioner or cloud deletion executor is included. Read the [execution boundary](../../docs/architecture/database-poc-harness.md), [BOM](../../docs/architecture/database-poc-bom.md), [failure matrix](../../docs/architecture/database-poc-failure-matrix.md), and [teardown plan](../../docs/architecture/database-poc-teardown.md) first.

## Safe offline checks

From the repository root with Node 24 and the existing installed dependencies:

```powershell
node apps/api/node_modules/typescript/bin/tsc -p scripts/poc/tsconfig.json
node apps/api/node_modules/eslint/bin/eslint.js --config scripts/poc/eslint.config.mjs 'scripts/poc/**/*.mts'
node --test scripts/poc/test/harness.test.mts
```

No package install, dependency upgrade, `.env` loading, migration or database connection is required for these commands. Unit tests are simulations, not regional durability evidence.

## Explicit target

Use a fresh shell with no ordinary `DATABASE_URL`. Never copy an application `.env`. Each candidate/scenario trial has a new unique run ID. Example **offline-only** target file, under ignored `test-results/poc`:

```json
{
  "runId": "localpoc01",
  "candidate": "postgres",
  "database": "loadpacket_poc_localpoc01",
  "user": "lp_poc_localpoc01",
  "port": 55480,
  "nonce": "0000000000000000000000000000000000000000000000000000000000000000",
  "isolationAttested": true
}
```

Replace the example nonce with `randomBytes(32).toString('hex')` before any live run. It is a run marker, not a credential. Attest isolation only after checking the dedicated cluster/account, user, database and route; localhost alone does not prove isolation. Candidate names: `postgres`, `cockroach`, `yugabyte`.

Set `LOADPACKET_POC=true`, `LOADPACKET_POC_TARGET`, `LOADPACKET_POC_RUN_ID` and `LOADPACKET_POC_DATABASE_URL` in the isolated process. The URL must use literal `127.0.0.1`, port 55000–55999 excluding 55439, and the exact dedicated user/database names above. No query parameters, provider hostname or ordinary `DATABASE_URL` is accepted. Inject a fresh POC password privately when needed; never print the URL. A later approved remote POC requires a reviewed encrypted tunnel and upstream identity attestation. This tool does not create that tunnel.

```powershell
node scripts/poc/cli.mts plan test-results/poc/target.json
node scripts/poc/cli.mts prepare test-results/poc/target.json
node scripts/poc/cli.mts cleanup-plan test-results/poc/target.json
```

These three commands are offline. `plan` records schema/migration hashes, all fixtures, scenarios and the unpriced BOM. `prepare` creates a new isolated API source copy with a shared read-only-use dependency junction, a generated client destination inside the copy, a fresh no-dotenv Prisma config and modified **copies** of the narrow Finance/signature target guards. It refuses overwrite. `cleanup-plan` outputs instructions and identifiers; it deletes nothing.

## Future disposable database execution

Prerequisites: independently provisioned **empty dedicated disposable** database and its dedicated role, proven isolation, operator permission, and inert `NOLOGIN` roles named `anon` and `authenticated` in that disposable cluster. These roles support unchanged migration REVOKEs; they are not Supabase credentials. No role/user/database creation command is embedded in the harness. Ordinary API launchers must not be used as an alternative to this guard.

Set `LOADPACKET_POC_BOOTSTRAP` to the run ID for `init` only. Initialization checks database/user/engine identity and refuses any existing non-system table. It creates the private `loadpacket_poc` marker/operation/effect tables. Subsequent live commands check that marker before work.

```powershell
node scripts/poc/cli.mts init test-results/poc/target.json
node scripts/poc/cli.mts schema test-results/poc/target.json
node scripts/poc/cli.mts seed test-results/poc/target.json
node scripts/poc/cli.mts qualify test-results/poc/target.json
node scripts/poc/cli.mts checks test-results/poc/target.json
node scripts/poc/cli.mts application test-results/poc/target.json
node scripts/poc/cli.mts database-suites test-results/poc/target.json
```

`schema` runs Prisma validate, generate and all existing migrations in the copy, then captures the catalog. Cockroach execution is deliberately blocked for migration/application stages until a separately reviewed connector and equivalent baseline exist. Never edit production migrations to bypass this. Yugabyte retains the PostgreSQL provider but must prove actual compatibility; protocol compatibility is not a PASS.

`qualify` checks all model fixtures, exact Decimal/Json/Bytes/date values, selected compound unique/FK/check constraints, Finance/signature immutability, the Finance view, historical/live duplicate trigger, cascade and restrict behavior. `checks` uses independent SQL connections for rollback, savepoint, concurrent same-key writes, row locks and advisory locks. `disconnect-deadlock` adds before-commit client disconnect and a real inverse-lock deadlock with bounded retry. Network interruption and leader changes still require the declared failure setup. A savepoint test does not substitute for every nested service path.

`application` runs API typecheck, lint, build, unit tests and HTTP suites without changing the original API. `database-suites` runs Finance, signatures, stop-event concurrency, payments and company/driver tests. Existing HTTP mocks are reported separately from real DB suites. External production credentials are not inherited. A source test guard change makes preparation fail and requires review.

## ACK and unknown outcomes

```powershell
node scripts/poc/cli.mts workload test-results/poc/target.json
# Inject approved fault externally, restore authoritative access, then:
node scripts/poc/cli.mts reconcile test-results/poc/target.json
```

Each new run writes exactly one exclusive `ack.jsonl` with fsynced intent and observed result per attempt. The baseline has 10,000 planned IDs. Re-running cannot overwrite it. For a **different fresh trial**, append `10` to `workload` to suppress each tenth response after commit. Then run `retry-unknown` followed by `reconcile` with the same target. This simulates a lost response at the POC client boundary; it is not a TCP fault, API idempotency implementation or regional failure test.

Unfinished intents recover as `UNKNOWN_OUTCOME`. Genuine execution uncertainty stops the writer; it is never reclassified as rejection. Reconciliation exits nonzero on both `HARD_FAIL` and `INCOMPLETE`. Preserve the before-failure ACK denominator. A successful retry cannot excuse an ACK previously missing from recovered state. `retry-stress` replays each original unknown key ten times sequentially and ten concurrently, requiring its original effect already present; if there are no unknowns it probes WRITE-000001 only. Reconcile before and after stress. Its exclusive `stress.jsonl` is included in later reconciliation. Run it once per fresh trial.

## Latency and restore

```powershell
node scripts/poc/cli.mts latency-database test-results/poc/target.json latbatch01
node scripts/poc/cli.mts latency-report test-results/poc/target.json test-results/poc/api-samples.json
node scripts/poc/cli.mts snapshot test-results/poc/target.json
```

`latency-database` commits eight kinds of SQL probe against real migrated tables: ten warmups plus 100 timed iterations each, concurrency one. Use a new batch label for every invocation. These are SQL analogues, not production service execution. `runLatencySuite` in `latency.mts` accepts eight API callbacks that await and assert complete real HTTP responses; use the isolated Nest/Supertest setup in existing database suites with synthetic `TokenVerifier`, real candidate Prisma service and test-local storage. Bind those callbacks during 002B setup; no standalone provider-authenticated API benchmark is provided. See the precise mapping in the architecture harness guide. Missing API measurements remain `NOT_RUN`; never substitute DB timings.

Capture and copy `snapshot.json` to a named immutable boundary file **before** restore. Snapshot output hashes every row of all 26 tables and includes the POC ledger. Restore the same run/marker to a separate isolated database cluster using the same dedicated database/user names and a different manifest port. Capture its snapshot and immediately run `restore-compare <target.json> <boundary-file.json>`. Command output shares the run directory, so preserve the reference first. Comparison includes all table counts/content and ledger identities; it does not validate object bytes or recover later valid ACKs automatically. Retain those as a separate delta for F12/F13.

## Evidence and cleanup

All generated evidence stays under ignored `test-results/poc/<run>/<candidate>`. Export a redacted, hashed evidence copy outside any fault domain before teardown. Capture actual DB versions, topology, role grants, fault times, candidate settings, SQL/API results, costs and deletion verification. The tools never promote a candidate or mark a production release gate PASS. Cleanup requires the run marker and exact resource inventory; there is intentionally no broad recursive database/cloud deletion command.
