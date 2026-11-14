# ADR 0008 — Tenant isolation defense in depth

Status: PROPOSED — REQUIRES POC
Date: 2026-10-01
Decision owners: architecture, SRE, security and product; named operational owners must be assigned before acceptance.

## Context

Server filters exist but legacy ID-only FKs and privileged DB access remain defense gaps.

## Proposed decision

Preserve verified identity-derived tenant, add composite integrity and qualified transaction-local tenant RLS using non-owner runtime roles. Map proposed RBAC explicitly; narrowly scope global identity/grant lookup.

## Alternatives considered

Public Data API access and frontend-only role checks are rejected. Separate DB per tenant is not justified without measured residency/isolation needs.

## Consequences

Adds implementation and operating cost to meet the explicit durability/security requirement. This ADR authorizes no provider action, application change or migration. Existing service remains unchanged until separate approved tickets pass release gates. Reassess if POC fails; do not weaken the acknowledgement contract to keep the preferred product.

## Validation and acceptance

Every-model constraints, role/IDOR matrix, pool context leakage, worker/export/support authorization. See LP-PROD-008. Record pinned versions, source/configuration digests, evidence links and reviewers before changing status to ACCEPTED.

## Rollback

During evaluation discard only approved isolated synthetic POC resources. After any future production cutover, fence writes and reconcile newly acknowledged state before rollback; never return to a stale source merely to restore availability.

## Related design

[Detailed architecture](../architecture/multi-tenancy.md) · [Backlog](../architecture/implementation-backlog.md) · [Release gates](../architecture/release-gates.md)
