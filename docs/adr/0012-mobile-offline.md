# ADR 0012 — Durable mobile synchronization

Status: PROPOSED — REQUIRES POC
Date: 2026-10-01
Decision owners: architecture, SRE, security and product; named operational owners must be assigned before acceptance.

## Context

Session persistence and in-memory upload retries do not protect pending Driver operations after restart.

## Proposed decision

Encrypted private transactional queue with operation ID/hash/key, immutable local evidence and explicit PENDING_LOCAL/SUBMITTING/CONFIRMED_SERVER/FAILED; server idempotency and status reconciliation.

## Alternatives considered

Background callbacks alone are not reliable. Local saved must never mean submitted. No silent replay under a different account.

## Consequences

Adds implementation and operating cost to meet the explicit durability/security requirement. This ADR authorizes no provider action, application change or migration. Existing service remains unchanged until separate approved tickets pass release gates. Reassess if POC fails; do not weaken the acknowledgement contract to keep the preferred product.

## Validation and acceptance

Process/device storage/network failures, duplicate retries, lost ACK, account switch and exact signature-version conflict. See LP-PROD-011. Record pinned versions, source/configuration digests, evidence links and reviewers before changing status to ACCEPTED.

## Rollback

During evaluation discard only approved isolated synthetic POC resources. After any future production cutover, fence writes and reconcile newly acknowledged state before rollback; never return to a stale source merely to restore availability.

## Related design

[Detailed architecture](../architecture/mobile-offline.md) · [Backlog](../architecture/implementation-backlog.md) · [Release gates](../architecture/release-gates.md)
