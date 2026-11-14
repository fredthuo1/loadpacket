# ADR 0010 — OpenTelemetry and actionable paging

Status: PROPOSED — REQUIRES POC
Date: 2026-10-01
Decision owners: architecture, SRE, security and product; named operational owners must be assigned before acceptance.

## Context

Connectivity health and a few log messages cannot prove durable operation or detect missing evidence.

## Proposed decision

Correlate request/trace/operation IDs, expose safe readiness classes, monitor commits/object copies/outbox/backup recoverability and page on customer-impact conditions.

## Alternatives considered

Logging full payloads or tokens is unsafe; sampled traces do not replace durable audit; pager noise without owners is ineffective.

## Consequences

Adds implementation and operating cost to meet the explicit durability/security requirement. This ADR authorizes no provider action, application change or migration. Existing service remains unchanged until separate approved tickets pass release gates. Reassess if POC fails; do not weaken the acknowledgement contract to keep the preferred product.

## Validation and acceptance

Redaction tests, external synthetics, real pager acknowledgement, runbook links and collector outage behavior. See LP-PROD-010. Record pinned versions, source/configuration digests, evidence links and reviewers before changing status to ACCEPTED.

## Rollback

During evaluation discard only approved isolated synthetic POC resources. After any future production cutover, fence writes and reconcile newly acknowledged state before rollback; never return to a stale source merely to restore availability.

## Related design

[Detailed architecture](../architecture/observability.md) · [Backlog](../architecture/implementation-backlog.md) · [Release gates](../architecture/release-gates.md)
