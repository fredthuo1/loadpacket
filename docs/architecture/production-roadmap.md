# Production roadmap

Status: PLANNING COMPLETE / PHASE 0 REPOSITORY EVIDENCE COMPLETE / PROVIDER EVIDENCE DEFERRED / INFRASTRUCTURE IMPLEMENTATION NOT STARTED. Preserve existing functional modules. Numbers refer to [LP-PROD tickets](implementation-backlog.md); no production action is authorized by this roadmap.

## PHASE 0 — Audit and proof of concept

LP-PROD-001 delivered the [repository evidence baseline](lp-prod-001-report.md). LP-PROD-002A added the [locally validated preparation harness](lp-prod-002a-report.md), explicit [BOM](database-poc-bom.md), failure/restore procedures and cleanup gate. Current provider topology, backup, privileges and ownership remain UNKNOWN under repository-only scope. The [database](database-poc-plan.md) and [object](object-storage-poc-plan.md) plans use a shared $150 USD/72-hour boundary. LP-PROD-002B live execution is NOT_STARTED and awaits verified priced feasibility, candidate integration/fault controls, named operator/reviewer and explicit authorization. This is not Phase 0 exit or a database selection.

- Objectives: establish real topology/ownership and choose a database on measured correctness, compatibility and cost.
- Tickets: 001, 002; this architecture/audit package is preparation, not the POC result.
- Dependencies: read-only operator evidence, approved synthetic environment and budget, named reviewers.
- Risks: hidden unsupported SQL, misleading provider HA claim, unknown backup keys or actual customer evidence inventory.
- Tests: real schema/regression, advisory/row locks/triggers, partition/ACK ledger, restore, regional latency.
- Exit criteria: all external unknowns assigned, supported durability topology and engine selected with evidence, ADR reviewed.
- Rollback: preserve existing hosting; remove only approved synthetic POC resources after evidence retention.

## PHASE 1 — Multi-site foundation

- Objectives: independent A/B serving, C quorum/recovery boundaries, private networking and reproducible environments.
- Tickets: 003, foundation of 009/010/013.
- Dependencies: Phase 0 approved topology/vendor, domain/certificate ownership and security/IaC access.
- Risks: shared administrative failure domains, unsafe origin access, per-region config divergence and underprovisioned N-1 capacity.
- Tests: routing removal, environment isolation, IAM, artifact identity, network/secret boundaries and synthetic connectivity.
- Exit criteria: staged A/B/C provisioned through reviewed IaC with all authority and backup roles separated; no customer cutover.
- Rollback: revert staged plans with state retained; no deletion of customer-bearing resources.

## PHASE 2 — Durability implementation

- Objectives: shared idempotency, evidence receipts, commit readiness, audit/outbox and durable mobile operations.
- Tickets: 006 registry then 004/005/007, 011; 023 with Phase 3 guards. Finish all mutation adoption before qualification.
- Dependencies: selected engine, region stores, expandable schema and stable operation contracts.
- Risks: external side effects in retried transactions, ambiguous commit cleanup, offline stale identity and local evidence loss.
- Tests: duplicate/hash conflicts, partial object copy, scanner/DB failures, lost ACK, outbox lease death and device restart.
- Exit criteria: every authoritative success uses the contract; no sole local evidence/critical event; pending is distinct from submitted.
- Rollback: retain schema/queues/receipts/dedup state; compatible application downgrade or read-only forward repair.

## PHASE 3 — Security and tenant isolation

- Objectives: complete model/route boundaries, least-privileged DB roles, immutable Finance/evidence history and minimum lifecycle safeguards.
- Tickets: 008, 023, security portions of 014; proposed role additions in 020 are not prerequisite if existing roles are safely constrained.
- Dependencies: engine-specific RLS/constraints, complete data inventory and counsel/product retention decisions.
- Risks: legacy inconsistent tenant edges, pool context leakage, broad cascades, wrong-role export or support access.
- Tests: direct DB and API IDOR matrix, role/assignment revocation, malicious uploads, update/delete and exact-currency history tests.
- Exit criteria: security review has no unresolved P0, inconsistent data explicitly reconciled before constraint rollout, owner/Driver/Finance boundaries proven.
- Rollback: keep restrictive policies or read-only mode; never reopen public grants to restore availability.

## PHASE 4 — Backup, restore and failover qualification

- Objectives: independently recoverable data, observable failures and measured RPO/RTO/capacity.
- Tickets: complete 009/010/013/015, then 012.
- Dependencies: Phases 1–3 and complete durability implementation, independent ACK ledger and real escalation roster.
- Risks: missing encryption keys, stale backup/object manifest, impossible cold-restore target, silent failing pager.
- Tests: regional/DB/storage/partition failures, PITR/old backup, bad deployment, auth/billing/email outage, load and 24h soak.
- Exit criteria: all technical release gates have current evidence; <60s safe failover and qualified warm DR target, full restored integrity, pager tested.
- Rollback: remove faults only in approved test environment; no production chaos; preserve reports and retry failed gates.

## PHASE 5 — Customer operations, billing and support

- Objectives: safe onboarding/export/closure/support and bounded future billing responsibilities.
- Tickets: complete P0 014; P1 018/020/021 may follow launch if their proposed features are not exposed.
- Dependencies: audited authorization, backup retention/deletion ledger, named support/security ownership.
- Risks: overprivileged support, legal holds versus purge, coupling billing outage to POD work.
- Tests: scoped support/export/deletion/hold restore; duplicate webhook/provider outage when billing is separately approved.
- Exit criteria: minimum customer support/privacy/lifecycle controls operational; any deferred billing/role features remain unavailable.
- Rollback: pause destructive jobs and optional billing; preserve logistics, audit and evidence.

## PHASE 6 — Controlled customer launch

- Objectives: rehearsed source-to-target transition and limited monitored rollout.
- Tickets: 016 then 017; P2 019/022 only after measured need.
- Dependencies: every P0 gate PASS, budget/support/ownership and explicit production cutover approval.
- Risks: source/target double writer, missing file, old mobile schema, rollback losing newly accepted target writes.
- Tests: full copy/checksum reconciliation, final freeze/CDC boundary, shadow reads, target-write rollback rehearsal and customer-safe synthetic verification.
- Exit criteria: signed release manifest, no P0 unknowns, source preserved, scoped launch approval and watch coverage.
- Rollback: before target ACK route back to proven source; after target ACK fence and reconcile deltas or repair forward. Never stale DNS rollback.
