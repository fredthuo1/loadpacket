# read only mode

Status: PROPOSED RUNBOOK — NOT AN EXECUTION AUTHORIZATION. Controls described below must be implemented and rehearsed before use. No provider-specific command is safe to invent before selecting a pinned service/topology. Operational owner and pager contacts must be assigned under LP-PROD-010/012.

## PURPOSE

Preserve safe access while stopping authoritative mutations.

## TRIGGER

Durability risk, planned cutover or incident containment.

## PRECONDITIONS

Durable authenticated mode/fencing controls; inventory of APIs, workers, admin jobs and hidden read-side mutations.

## AUTOMATIC ACTIONS

Apply read-only epoch to every mutator; preserve safe authorized current reads; distinguish readiness pools.

## MANUAL ACTIONS

1. Activate approved mode with reason and expiry/review owner.
2. Drain/reconcile in-flight operations and stop job side effects.
3. Block read endpoints that mutate lastAccessedAt or similar until made safe; do not assume HTTP GET is read-only.
4. Reject writes honestly; retain device pending operations.
5. Restore only after DB/object/auth contract and replay tests pass.

## VALIDATION

No mutator succeeds through either site/worker/admin path; reads cannot bypass revoked membership or return stale financial authority.

## ROLLBACK

If reopening fails, renew read-only fence. Never clear mode solely because timeout expired.

## CUSTOMER IMPACT

Operational changes pause; some protected reads may also be unavailable when fresh authorization cannot be established.

## ESCALATION

Incident commander, SRE and product/support for customer messaging.

## POST-INCIDENT ACTIONS

Inventory missed paths, record all mode changes, drain outcomes and agreed restoration criteria.

Record incident/run ID, environment, source/config digest, operator/reviewer, timestamps and evidence links. Use [durability policy](../architecture/data-durability.md), [DR](../architecture/disaster-recovery.md) and [release gates](../architecture/release-gates.md). Never execute against production from this planning ticket.
