# backup restore test

Status: PROPOSED RUNBOOK — NOT AN EXECUTION AUTHORIZATION. Controls described below must be implemented and rehearsed before use. No provider-specific command is safe to invent before selecting a pinned service/topology. Operational owner and pager contacts must be assigned under LP-PROD-010/012.

## PURPOSE

Prove recoverability rather than only backup creation.

## TRIGGER

Weekly early-production schedule, after major schema/key/topology changes or failed backup alert.

## PRECONDITIONS

Approved isolated recovery environment, synthetic dataset or production-class security for real backup, intact keys, outbound providers disabled.

## AUTOMATIC ACTIONS

Restore harness selects backup/recovery point and records a manifest; no destructive production action.

## MANUAL ACTIONS

1. Select recent backup and periodically older retained recovery point.
2. Restore SQL and exact referenced object versions.
3. Validate all tenants, loads, Finance totals, signature bindings and full checksum manifest.
4. Run integrity/authorization/idempotency tests and record timings.
5. Independently review report; authorize scoped teardown only after evidence/holds checked.

## VALIDATION

No missing versions or amount drift; schema constraints enforced; secrets not logged; deletion ledger applied; RPO/RTO measured against approved targets.

## ROLLBACK

Keep failed target quarantined for investigation; production untouched. Never delete the only backup or key as cleanup.

## CUSTOMER IMPACT

No intended customer impact; failure blocks launch or triggers recovery-risk incident.

## ESCALATION

Backup owner and recovery custodian; page on failed restore/expired evidence.

## POST-INCIDENT ACTIONS

Store redacted report, restore versions, dataset size and corrective ticket; verify later teardown scope.

Record incident/run ID, environment, source/config digest, operator/reviewer, timestamps and evidence links. Use [durability policy](../architecture/data-durability.md), [DR](../architecture/disaster-recovery.md) and [release gates](../architecture/release-gates.md). Never execute against production from this planning ticket.
