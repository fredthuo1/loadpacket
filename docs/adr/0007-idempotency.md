# ADR 0007 — Durable mutation idempotency

Status: PROPOSED — REQUIRES POC
Date: 2026-10-01
Decision owners: architecture, SRE, security and product; named operational owners must be assigned before acceptance.

## Context

Feature-specific keys do not cover every mutation and timeouts can hide successful commits.

## Proposed decision

Use tenant/actor/action/key uniqueness, canonical request hash and durable minimal outcome; authorize every replay, preserve tombstones and reconcile unknown outcomes.

## Alternatives considered

Process-memory locks/cache keys do not survive failover. Allocating a new key on timeout risks duplicate financial operations.

## Consequences

Adds implementation and operating cost to meet the explicit durability/security requirement. This ADR authorizes no provider action, application change or migration. Existing service remains unchanged until separate approved tickets pass release gates. Reassess if POC fails; do not weaken the acknowledgement contract to keep the preferred product.

## Validation and acceptance

Concurrent duplicates, wrong payload/tenant, restart/failover, expiry and stale authorization. See LP-PROD-006. Record pinned versions, source/configuration digests, evidence links and reviewers before changing status to ACCEPTED.

## Rollback

During evaluation discard only approved isolated synthetic POC resources. After any future production cutover, fence writes and reconcile newly acknowledged state before rollback; never return to a stale source merely to restore availability.

## Related design

[Detailed architecture](../architecture/data-durability.md) · [Backlog](../architecture/implementation-backlog.md) · [Release gates](../architecture/release-gates.md)
