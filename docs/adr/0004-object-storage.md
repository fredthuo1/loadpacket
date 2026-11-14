# ADR 0004 — Immutable regional object storage

Status: PROPOSED — REQUIRES POC
Date: 2026-10-01
Decision owners: architecture, SRE, security and product; named operational owners must be assigned before acceptance.

## Context

API-local files are a single evidence durability domain and block independent app replicas.

## Proposed decision

Evolve existing storage adapter to private immutable version receipts in at least two of three approved regions before metadata quorum commit. Repair third copy asynchronously, with separate recovery archive and retention.

## Alternatives considered

Ordinary asynchronous CRR alone cannot establish upload ACK durability. Shared network filesystem or local disk replication adds operational burden and unclear regional guarantees.

## Consequences

Adds implementation and operating cost to meet the explicit durability/security requirement. This ADR authorizes no provider action, application change or migration. Existing service remains unchanged until separate approved tickets pass release gates. Reassess if POC fails; do not weaken the acknowledgement contract to keep the preferred product.

## Validation and acceptance

Byte/hash/receipt verification, one-copy failure, lost DB ACK, orphan reconciliation, private downloads and restore. See LP-PROD-005. Record pinned versions, source/configuration digests, evidence links and reviewers before changing status to ACCEPTED.

## Rollback

During evaluation discard only approved isolated synthetic POC resources. After any future production cutover, fence writes and reconcile newly acknowledged state before rollback; never return to a stale source merely to restore availability.

## Related design

[Detailed architecture](../architecture/object-storage.md) · [Backlog](../architecture/implementation-backlog.md) · [Release gates](../architecture/release-gates.md)
