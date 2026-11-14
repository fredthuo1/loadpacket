# credential rotation

Status: PROPOSED RUNBOOK — NOT AN EXECUTION AUTHORIZATION. Controls described below must be implemented and rehearsed before use. No provider-specific command is safe to invent before selecting a pinned service/topology. Operational owner and pager contacts must be assigned under LP-PROD-010/012.

## PURPOSE

Rotate credentials safely with recovery continuity.

## TRIGGER

Approved scheduled rotation or confirmed compromise.

## PRECONDITIONS

Named secret owner, consumers inventory, approved change, dual-key support analysis and proven backup decryption.

## AUTOMATIC ACTIONS

Secret manager versions/audit and expiry alerts; no automatic deletion of sole decrypting key.

## MANUAL ACTIONS

1. Provision scoped replacement through approved secret controls; never paste values into logs/docs.
2. Canary consumers, support dual verification where safe and bound overlap.
3. Validate all sites/workers/download grants and recovery key reads.
4. Revoke old credentials after propagation; for compromise shorten overlap and fence affected actions.
5. Confirm no leaked copies/images/config and audit completion.

## VALIDATION

New auth works, old credentials revoked, least privilege maintained, old backups readable and grants expire as documented.

## ROLLBACK

Use old key only if uncompromised and explicitly approved; otherwise remain fenced and repair consumers. Never restore compromised credential to meet uptime.

## CUSTOMER IMPACT

Possible reauthentication; short-lived links may expire. Core service stays closed if credentials cannot be trusted.

## ESCALATION

Security lead, secret owner and recovery custodian for encryption changes.

## POST-INCIDENT ACTIONS

Update inventory/expiry, evidence of revocation, incident scope and consumer test coverage.

Record incident/run ID, environment, source/config digest, operator/reviewer, timestamps and evidence links. Use [durability policy](../architecture/data-durability.md), [DR](../architecture/disaster-recovery.md) and [release gates](../architecture/release-gates.md). Never execute against production from this planning ticket.
