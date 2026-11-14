# incident response

Status: PROPOSED RUNBOOK — NOT AN EXECUTION AUTHORIZATION. Controls described below must be implemented and rehearsed before use. No provider-specific command is safe to invent before selecting a pinned service/topology. Operational owner and pager contacts must be assigned under LP-PROD-010/012.

## PURPOSE

Coordinate safe containment, recovery and customer communication.

## TRIGGER

Pager, customer report, security alert or loss of integrity.

## PRECONDITIONS

Assigned incident commander/secondary, contact schedule and secure evidence system must be operational before launch.

## AUTOMATIC ACTIONS

Correlate alerts/request IDs; preserve redacted telemetry and fence safety-compromised writes.

## MANUAL ACTIONS

1. Declare severity and assign incident, technical and communications owners.
2. Identify scope without exposing documents/secrets; preserve evidence.
3. Contain writes/access if integrity/security uncertain; follow subsystem runbook.
4. Publish truthful impact and next update time, distinguishing pending/confirmed actions.
5. Recover through reviewed checks; maintain timeline and customer-specific reconciliation.

## VALIDATION

Safe service restored, ACK/evidence integrity verified, paging quiet for valid reason, affected customers identified privately.

## ROLLBACK

Re-enter containment if integrity uncertain; no unverified failback, purge or blanket secret rotation without dependency plan.

## CUSTOMER IMPACT

Communicate degraded availability and known data status; do not assert no loss until reconciled.

## ESCALATION

SRE/security/vendor as appropriate; counsel/privacy for breach/notification duties, without inventing legal deadlines.

## POST-INCIDENT ACTIONS

Blameless review, measured RPO/RTO, evidence retention, corrective tickets and retest dates.

Record incident/run ID, environment, source/config digest, operator/reviewer, timestamps and evidence links. Use [durability policy](../architecture/data-durability.md), [DR](../architecture/disaster-recovery.md) and [release gates](../architecture/release-gates.md). Never execute against production from this planning ticket.
