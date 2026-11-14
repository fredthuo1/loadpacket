# customer data recovery

Status: PROPOSED RUNBOOK — NOT AN EXECUTION AUTHORIZATION. Controls described below must be implemented and rehearsed before use. No provider-specific command is safe to invent before selecting a pinned service/topology. Operational owner and pager contacts must be assigned under LP-PROD-010/012.

## PURPOSE

Recover scoped customer evidence while preserving other tenants and audit history.

## TRIGGER

Verified customer request, tenant-specific corruption or missing evidence.

## PRECONDITIONS

Verified requester/owner authority, approved scope, holds/privacy review, exact identifiers and recovery point; dual review for irreversible action.

## AUTOMATIC ACTIONS

Preserve source and related backups; no automatic live tenant overwrite.

## MANUAL ACTIONS

1. Restore necessary backup into isolated authorized recovery target.
2. Locate exact tenant records/version receipts and compare current state.
3. Propose minimal append/correction/restore plan retaining IDs, signature bindings and Finance provenance.
4. Dry-run constraints/hash/tenant checks; get approval for concrete plan.
5. Apply later through controlled scoped job, record audit and reconcile dependent outbox/exports.

## VALIDATION

Only approved tenant/resources changed; totals/links/checksums correct; other tenants unchanged; deletion/hold ledger respected.

## ROLLBACK

Keep before-state and restore manifest; reverse only uncommitted or explicitly reviewed changes, never silently erase accepted corrections.

## CUSTOMER IMPACT

Customer-specific recovery window; disclose any unrecoverable evidence and pending work.

## ESCALATION

Support owner, DB/storage/recovery lead, security and counsel for privacy/hold constraints.

## POST-INCIDENT ACTIONS

Provide redacted recovery report, customer acknowledgement, root cause and prevention ticket.

Record incident/run ID, environment, source/config digest, operator/reviewer, timestamps and evidence links. Use [durability policy](../architecture/data-durability.md), [DR](../architecture/disaster-recovery.md) and [release gates](../architecture/release-gates.md). Never execute against production from this planning ticket.
