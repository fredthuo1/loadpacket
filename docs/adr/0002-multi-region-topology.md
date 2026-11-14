# ADR 0002 — Multi-region topology

Status: PROPOSED — REQUIRES POC
Date: 2026-10-01
Decision owners: architecture, SRE, security and product; named operational owners must be assigned before acceptance.

## Context

Two independent writers without consensus permit split brain; two voters lose progress during partition.

## Proposed decision

Active-active A/B applications with one authoritative durable data plane spanning A/B/C. Quorum/strict-sync and fencing control write authority. C data voters are distinct from independently administered recovery archives.

## Alternatives considered

Active-passive apps simplify serving but do not remove data-plane requirements. Unfenced dual primary and DNS-only failover are rejected.

## Consequences

Adds implementation and operating cost to meet the explicit durability/security requirement. This ADR authorizes no provider action, application change or migration. Existing service remains unchanged until separate approved tickets pass release gates. Reassess if POC fails; do not weaken the acknowledgement contract to keep the preferred product.

## Validation and acceptance

Single-region destruction and minority-partition drill with independent ACK ledger; N-1 capacity. See LP-PROD-002/003/012. Record pinned versions, source/configuration digests, evidence links and reviewers before changing status to ACCEPTED.

## Rollback

During evaluation discard only approved isolated synthetic POC resources. After any future production cutover, fence writes and reconcile newly acknowledged state before rollback; never return to a stale source merely to restore availability.

## Related design

[Detailed architecture](../architecture/multi-region.md) · [Backlog](../architecture/implementation-backlog.md) · [Release gates](../architecture/release-gates.md)
