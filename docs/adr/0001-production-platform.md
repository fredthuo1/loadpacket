# ADR 0001 — Production cloud/platform strategy

Status: PROPOSED — REQUIRES POC
Date: 2026-10-01
Decision owners: architecture, SRE, security and product; named operational owners must be assigned before acceptance.

## Context

The reference Render deployment and local volume do not establish three-domain data durability or safe multi-site serving.

## Proposed decision

Use managed container compute in two regions with a qualified global edge, managed durable SQL and private regional object storage. AWS ECS/Fargate and Cloudflare are reference candidates, not selected contracts. Keep the modular monolith and provider adapters.

## Alternatives considered

Remain on single-instance Render fails the stated failure model; Kubernetes introduces unnecessary operator burden; multi-cloud compute adds complexity without proving database safety.

## Consequences

Adds implementation and operating cost to meet the explicit durability/security requirement. This ADR authorizes no provider action, application change or migration. Existing service remains unchanged until separate approved tickets pass release gates. Reassess if POC fails; do not weaken the acknowledgement contract to keep the preferred product.

## Validation and acceptance

Provider capability/region/security/budget review; demonstrate independent sites, origin protection and safe routing. See LP-PROD-001/003. Record pinned versions, source/configuration digests, evidence links and reviewers before changing status to ACCEPTED.

## Rollback

During evaluation discard only approved isolated synthetic POC resources. After any future production cutover, fence writes and reconcile newly acknowledged state before rollback; never return to a stale source merely to restore availability.

## Related design

[Detailed architecture](../architecture/production-architecture.md) · [Backlog](../architecture/implementation-backlog.md) · [Release gates](../architecture/release-gates.md)
