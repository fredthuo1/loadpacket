# database restore

Status: PROPOSED RUNBOOK — NOT AN EXECUTION AUTHORIZATION. Controls described below must be implemented and rehearsed before use. No provider-specific command is safe to invent before selecting a pinned service/topology. Operational owner and pager contacts must be assigned under LP-PROD-010/012.

## PURPOSE

Recover from corruption or loss using an independently verified recovery point.

## TRIGGER

No safe live authority or logical corruption requiring PITR.

## PRECONDITIONS

Approved recovery point/scope, intact backups and keys, isolated production-security-class target, outbound effects disabled, operator plus reviewer.

## AUTOMATIC ACTIONS

Keep production mutations and workers fenced; monitor backup chain; no automatic destructive overwrite.

## MANUAL ACTIONS

1. Preserve source and incident evidence.
2. Restore snapshot plus WAL/equivalent to a new isolated target; never restore over live source.
3. Validate schema/roles/migrations and exact object-version manifest.
4. Reconcile valid later ACKs, deletion/hold ledger and provider intents; record any unrecoverable gap.
5. Obtain reviewed cutover approval before changing authority/routing.

## VALIDATION

Per-tenant counts, exact decimal totals, all object hashes, signatures, audits, tenant/IDOR tests, no outbound side effects; record bytes and total time.

## ROLLBACK

Leave original fenced copy intact; discard only explicitly approved failed restore target. After cutover, reconcile target writes before any reverse switch.

## CUSTOMER IMPACT

Read-only/maintenance until trustworthy state restored; PITR may intentionally rewind changes and must not be described as zero-loss without reconciliation.

## ESCALATION

Recovery custodian, DB lead, security for corruption and product/customer-support owner.

## POST-INCIDENT ACTIONS

Retain restore report, key availability evidence, cause, measured RPO/RTO and backup policy fixes.

Record incident/run ID, environment, source/config digest, operator/reviewer, timestamps and evidence links. Use [durability policy](../architecture/data-durability.md), [DR](../architecture/disaster-recovery.md) and [release gates](../architecture/release-gates.md). Never execute against production from this planning ticket.
