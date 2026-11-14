# ADR 0006 — Transactional outbox

Status: PROPOSED — REQUIRES POC
Date: 2026-10-01
Decision owners: architecture, SRE, security and product; named operational owners must be assigned before acceptance.

## Context

Provider calls and business transactions currently cannot commit atomically; worker directory is empty.

## Proposed decision

Commit business/audit/outbox together; SQL-polled workers with leases, fencing, retry and inbox/provider dedup. Preserve durable intent across restarts.

## Alternatives considered

Redis-only critical queues lose reconstructability; Kafka and event sourcing are unnecessary. Exactly-once external email is not promised.

## Consequences

Adds implementation and operating cost to meet the explicit durability/security requirement. This ADR authorizes no provider action, application change or migration. Existing service remains unchanged until separate approved tickets pass release gates. Reassess if POC fails; do not weaken the acknowledgement contract to keep the preferred product.

## Validation and acceptance

Crash before/after delivery, lease takeover, poison/replay, ordering and email ambiguity tests. See LP-PROD-007. Record pinned versions, source/configuration digests, evidence links and reviewers before changing status to ACCEPTED.

## Rollback

During evaluation discard only approved isolated synthetic POC resources. After any future production cutover, fence writes and reconcile newly acknowledged state before rollback; never return to a stale source merely to restore availability.

## Related design

[Detailed architecture](../architecture/data-durability.md) · [Backlog](../architecture/implementation-backlog.md) · [Release gates](../architecture/release-gates.md)
