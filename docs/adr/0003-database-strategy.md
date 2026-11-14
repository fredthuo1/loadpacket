# ADR 0003 — Database strategy

Status: PROPOSED — REQUIRES POC
Date: 2026-10-01
Decision owners: architecture, SRE, security and product; named operational owners must be assigned before acceptance.

## Context

Prisma 7.10.0 PostgreSQL schema relies on row/advisory locks, raw SQL, PL/pgSQL triggers, RLS and composite relations.

## Proposed decision

Keep the current database unchanged; qualify supported strict cross-region synchronous PostgreSQL first and compare CockroachDB region survival and YugabyteDB synchronous YSQL. Select only after real schema and full regression/chaos/restore POC.

## Alternatives considered

Regional HA with asynchronous remote replica does not provide regional acknowledged-write RPO 0. Protocol compatibility alone is insufficient. Self-managed HA is not the default for a small team.

## Consequences

Adds implementation and operating cost to meet the explicit durability/security requirement. This ADR authorizes no provider action, application change or migration. Existing service remains unchanged until separate approved tickets pass release gates. Reassess if POC fails; do not weaken the acknowledgement contract to keep the preferred product.

## Validation and acceptance

All 17 migrations or reviewed equivalent baseline, retries/locks/triggers, zero lost ACKs, costs and support. No waived correctness tests. See LP-PROD-002. Record pinned versions, source/configuration digests, evidence links and reviewers before changing status to ACCEPTED.

## Rollback

During evaluation discard only approved isolated synthetic POC resources. After any future production cutover, fence writes and reconcile newly acknowledged state before rollback; never return to a stale source merely to restore availability.

## Related design

[Detailed architecture](../architecture/database-evaluation.md) · [Backlog](../architecture/implementation-backlog.md) · [Release gates](../architecture/release-gates.md)
