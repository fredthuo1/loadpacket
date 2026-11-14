# database failover

Status: PROPOSED RUNBOOK — NOT AN EXECUTION AUTHORIZATION. Controls described below must be implemented and rehearsed before use. No provider-specific command is safe to invent before selecting a pinned service/topology. Operational owner and pager contacts must be assigned under LP-PROD-010/012.

## PURPOSE

Promote or recover SQL authority without losing acknowledged commits.

## TRIGGER

Writer loss, quorum loss, partition or suspected split brain.

## PRECONDITIONS

Pinned engine runbook, topology/commit policy evidence, fencing mechanism, allowed promotion candidates and independent ACK ledger.

## AUTOMATIC ACTIONS

Supported consensus leader election or strict-sync manager elects eligible writer; minority commits fail.

## MANUAL ACTIONS

1. Fence suspect writer and workers using qualified mechanism, not DNS alone.
2. Inspect current voter/quorum and durable log/commit positions with redacted tooling.
3. Permit only supported promotion retaining quorum/remote-flush contract.
4. If no proven eligible authority exists, remain READ_ONLY and engage vendor; never force stale promotion.

## VALIDATION

All client-observed ACKs exist exactly once; constraints, Finance totals, signature links, operation status and new durable synthetic pass.

## ROLLBACK

Old primary stays fenced until supported rejoin/catch-up or reseed; do not reverse promotion just to match old topology.

## CUSTOMER IMPACT

Writes pause during elections or indefinitely without safe quorum; authorized reads only where current authority can be established.

## ESCALATION

DB lead and managed vendor urgent support; incident commander approves any manual failover.

## POST-INCIDENT ACTIONS

Attach replica positions, policy epoch, ACK reconciliation, observed RPO/RTO and remediation.

Record incident/run ID, environment, source/config digest, operator/reviewer, timestamps and evidence links. Use [durability policy](../architecture/data-durability.md), [DR](../architecture/disaster-recovery.md) and [release gates](../architecture/release-gates.md). Never execute against production from this planning ticket.
