# ADR 0011 — Immutable artifacts and controlled migration

Status: PROPOSED — REQUIRES POC
Date: 2026-10-01
Decision owners: architecture, SRE, security and product; named operational owners must be assigned before acceptance.

## Context

No CI workflows exist; Next public configuration is compiled into browser assets.

## Proposed decision

Build signed immutable artifacts once per release configuration; same digests in A/B; protected staging, compatible migrations, canary and fenced cutover. Resolve staging/production public-config difference explicitly before claiming same-byte promotion.

## Alternatives considered

Regional rebuilds, mutable tags, laptop migrations and automatic destructive rollback are rejected.

## Consequences

Adds implementation and operating cost to meet the explicit durability/security requirement. This ADR authorizes no provider action, application change or migration. Existing service remains unchanged until separate approved tickets pass release gates. Reassess if POC fails; do not weaken the acknowledgement contract to keep the preferred product.

## Validation and acceptance

Artifact identity, N-1 deployment, rollback schema compatibility and rehearsed cutover after target writes. See LP-PROD-013/016. Record pinned versions, source/configuration digests, evidence links and reviewers before changing status to ACCEPTED.

## Rollback

During evaluation discard only approved isolated synthetic POC resources. After any future production cutover, fence writes and reconcile newly acknowledged state before rollback; never return to a stale source merely to restore availability.

## Related design

[Detailed architecture](../architecture/deployment.md) · [Backlog](../architecture/implementation-backlog.md) · [Release gates](../architecture/release-gates.md)
