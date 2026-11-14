# regional failover

Status: PROPOSED RUNBOOK — NOT AN EXECUTION AUTHORIZATION. Controls described below must be implemented and rehearsed before use. No provider-specific command is safe to invent before selecting a pinned service/topology. Operational owner and pager contacts must be assigned under LP-PROD-010/012.

## PURPOSE

Restore safe customer serving after loss of a site.

## TRIGGER

Site probes or external synthetic detect A/B outage.

## PRECONDITIONS

Qualified target with N-1 capacity, supported quorum/fencing and object policy; exact provider controls already exercised in staging.

## AUTOMATIC ACTIONS

Edge removes unhealthy origin after configured debounce; APIs/workers deny unsafe mutations; surviving quorum elects under vendor protocol.

## MANUAL ACTIONS

1. Incident commander identifies failed fault domain and freezes deployment.
2. Confirm old site cannot write through stale routing and healthy site is not a minority.
3. Verify SQL authority, required object copies, auth and capacity before increasing traffic.
4. Keep unsupported operation classes READ_ONLY; communicate pending versus confirmed writes.

## VALIDATION

Reconcile independent ACK ledger, synthetic same-key replay, tenant reads, POD checksum and safe submission; measure disruption to restored safe service.

## ROLLBACK

Do not fail back until replication repair, fencing and five minutes stable health; drain/reintroduce site gradually.

## CUSTOMER IMPACT

Reads may recover before uploads; clients retain pending work. No lost-ACK promise without ledger verification.

## ESCALATION

Page SRE and DB/storage lead immediately; security joins if failure indicates compromise.

## POST-INCIDENT ACTIONS

Record timings, lost/unknown requests, receipts, repair proof and fault-domain correction.

Record incident/run ID, environment, source/config digest, operator/reviewer, timestamps and evidence links. Use [durability policy](../architecture/data-durability.md), [DR](../architecture/disaster-recovery.md) and [release gates](../architecture/release-gates.md). Never execute against production from this planning ticket.
