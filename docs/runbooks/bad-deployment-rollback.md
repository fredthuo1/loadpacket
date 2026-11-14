# bad deployment rollback

Status: PROPOSED RUNBOOK — NOT AN EXECUTION AUTHORIZATION. Controls described below must be implemented and rehearsed before use. No provider-specific command is safe to invent before selecting a pinned service/topology. Operational owner and pager contacts must be assigned under LP-PROD-010/012.

## PURPOSE

Recover a bad application release without destroying new data.

## TRIGGER

Canary regression, elevated failures or integrity violation after deployment.

## PRECONDITIONS

Previous immutable image/config digest, expand-compatible schema, artifact provenance and data-effect assessment.

## AUTOMATIC ACTIONS

Halt rollout, remove unhealthy canary from routing; maintain safe site; fence writes if integrity risk.

## MANUAL ACTIONS

1. Compare release digest/config/schema and isolate scope.
2. Reconcile writes already acknowledged by new release.
3. Redeploy prior digest only if it safely reads/writes current schema and evidence.
4. Stop incompatible workers; preserve outbox schema/version compatibility.
5. If reverse is unsafe, hold READ_ONLY and repair forward; no casual down-migration.

## VALIDATION

Old clients and current data work, tenant tests and synthetic workflow pass, no dropped outbox events; observe error/latency recovery.

## ROLLBACK

Do not bounce between versions. Keep site drained if rollback unhealthy; use recovery runbook if data corrupted.

## CUSTOMER IMPACT

Canary limits impact; customers may experience delayed writes. A UI rollback does not undo financial records.

## ESCALATION

Release owner, DB lead and incident commander; security if auth/isolation regressed.

## POST-INCIDENT ACTIONS

Record exact digests, affected operations, automatic stop evidence and missing release test.

Record incident/run ID, environment, source/config digest, operator/reviewer, timestamps and evidence links. Use [durability policy](../architecture/data-durability.md), [DR](../architecture/disaster-recovery.md) and [release gates](../architecture/release-gates.md). Never execute against production from this planning ticket.
