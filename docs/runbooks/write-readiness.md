# write readiness

Status: PROPOSED RUNBOOK — NOT AN EXECUTION AUTHORIZATION. Controls described below must be implemented and rehearsed before use. No provider-specific command is safe to invent before selecting a pinned service/topology. Operational owner and pager contacts must be assigned under LP-PROD-010/012.

## PURPOSE

Stop writes when configured durability cannot be met.

## TRIGGER

Write-ready failure, stale policy lease, missing regional receipt capability or quorum degradation.

## PRECONDITIONS

Operation-class policy, fenced APIs/workers and safe diagnostic access implemented; current app lacks this control.

## AUTOMATIC ACTIONS

Expire stale readiness; reject before mutation with 503 and bounded Retry-After; maintain safe readable routes.

## MANUAL ACTIONS

1. Identify DB, object, auth or policy dependency and impacted classes.
2. Confirm no worker/admin path bypasses fence.
3. Distinguish pre-mutation rejection from post-commit unknown outcome.
4. Reconcile unknown operations with same key; repair dependency without weakening policy.
5. Validate before transitioning RECOVERING to NORMAL/DEGRADED.

## VALIDATION

Attempt unsafe class and observe no ACK; safe synthetic commit includes required audit/outbox/receipts; prior unknown result resolves exactly once.

## ROLLBACK

Return to READ_ONLY on failed probe/reconciliation; never override quorum or set an allow-unsafe environment flag.

## CUSTOMER IMPACT

Before mutation: No changes were accepted. Unknown outcome: Could not confirm; check status. These messages are not interchangeable.

## ESCALATION

SRE and relevant DB/storage owner; incident commander for extended outage.

## POST-INCIDENT ACTIONS

Log policy epoch/state transitions, false green probes, customer outcomes and recovery proof.

Record incident/run ID, environment, source/config digest, operator/reviewer, timestamps and evidence links. Use [durability policy](../architecture/data-durability.md), [DR](../architecture/disaster-recovery.md) and [release gates](../architecture/release-gates.md). Never execute against production from this planning ticket.
