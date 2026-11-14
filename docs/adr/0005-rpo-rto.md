# ADR 0005 — RPO/RTO and fail-closed policy

Status: PROPOSED — REQUIRES POC
Date: 2026-10-01
Decision owners: architecture, SRE, security and product; named operational owners must be assigned before acceptance.

## Context

Customer success messages must not precede durable state; arbitrary cold restore cannot be promised in fifteen minutes.

## Proposed decision

Regional acknowledged-write RPO 0 for stated single-region failure; target safe failover below 60s and warm DR below 15m subject to measured qualification. Fail closed when contract cannot hold; separate logical-corruption backup RPO.

## Alternatives considered

Always-available minority writes and forced stale promotion violate durability. Slow-but-safe recovery is preferable to losing ACKed work.

## Consequences

Adds implementation and operating cost to meet the explicit durability/security requirement. This ADR authorizes no provider action, application change or migration. Existing service remains unchanged until separate approved tickets pass release gates. Reassess if POC fails; do not weaken the acknowledgement contract to keep the preferred product.

## Validation and acceptance

Independent ACK ledger, unknown-outcome reconciliation, cold/warm timings and approved limits. See LP-PROD-004/012. Record pinned versions, source/configuration digests, evidence links and reviewers before changing status to ACCEPTED.

## Rollback

During evaluation discard only approved isolated synthetic POC resources. After any future production cutover, fence writes and reconcile newly acknowledged state before rollback; never return to a stale source merely to restore availability.

## Related design

[Detailed architecture](../architecture/data-durability.md) · [Backlog](../architecture/implementation-backlog.md) · [Release gates](../architecture/release-gates.md)
