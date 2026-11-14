# ADR 0009 — Independent immutable backup strategy

Status: PROPOSED — REQUIRES POC
Date: 2026-10-01
Decision owners: architecture, SRE, security and product; named operational owners must be assigned before acceptance.

## Context

Replication propagates bad changes and does not protect against credential/account destruction.

## Proposed decision

Continuous PITR plus independent immutable snapshots/object manifests in a separately administered recovery domain; keys recoverable independently; weekly early-production restore evidence.

## Alternatives considered

Same-account mutable snapshots alone do not isolate administrative failure. Retention periods require privacy/legal/product agreement.

## Consequences

Adds implementation and operating cost to meet the explicit durability/security requirement. This ADR authorizes no provider action, application change or migration. Existing service remains unchanged until separate approved tickets pass release gates. Reassess if POC fails; do not weaken the acknowledgement contract to keep the preferred product.

## Validation and acceptance

Complete metadata/object/signature/Finance restore and deletion/hold replay; verify production roles cannot delete archives. See LP-PROD-009/012. Record pinned versions, source/configuration digests, evidence links and reviewers before changing status to ACCEPTED.

## Rollback

During evaluation discard only approved isolated synthetic POC resources. After any future production cutover, fence writes and reconcile newly acknowledged state before rollback; never return to a stale source merely to restore availability.

## Related design

[Detailed architecture](../architecture/backup-and-recovery.md) · [Backlog](../architecture/implementation-backlog.md) · [Release gates](../architecture/release-gates.md)
