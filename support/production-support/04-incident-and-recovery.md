# 04 — General Incident Response and Recovery

For **hacking, data leaks, unauthorized access or credential compromise**, use the dedicated **Security & Incident Response Support Runbook**. This file handles operational outages and data-integrity incidents.

## Incident lifecycle

1. **Detect:** alert or ticket; timestamp UTC, initial symptoms, affected services.
2. **Declare:** severity, incident commander, incident channel, start timeline.
3. **Assess:** blast radius (tenants, routes, regions, business functions), customer impact, security indicators.
4. **Mitigate:** safest reversible action; record approval and exact command/change.
5. **Recover:** restore service, verify data integrity and dependent workflows.
6. **Communicate:** initial acknowledgement, regular updates, resolution note.
7. **Review:** root cause, contributing factors, detection gap, prevention owner and due date.

## Incident record template

```markdown
# INC-YYYY-NNN — [short title]
Severity: SEV1/SEV2/SEV3 | Status: Investigating/Mitigating/Monitoring/Resolved
Started (UTC): | Detected (UTC): | Resolved (UTC):
Incident commander: | Technical owner: | Customer communications owner:
Affected features/tenants: [internal only] | Release/version:
Customer impact:
Timeline (UTC):
- HH:MM detection / evidence
- HH:MM mitigation proposed / approved
- HH:MM action performed / observed outcome
Hypotheses and confidence:
Mitigation and rollback plan:
Verification performed:
Customer updates sent:
Follow-up actions (owner / due date):
```

## Recovery decision guide

| Problem | Preferred initial response | High-risk actions requiring explicit approval |
|---|---|---|
| Bad deployment | Roll back application release if schema-compatible | Reverting schema migrations |
| Database outage | Check provider status, connection pool, network | Failover, restore, credential rotation |
| Worker backlog | Inspect queue and worker health, pause intake if necessary | Replaying jobs, clearing queues |
| Bad financial records | Stop affected write workflow; preserve evidence | Direct DB edits or backfills |
| Email outage | Diagnose provider, show truthful UI status | Provider swap, sender/credential change |
| Storage outage | Check provider and access policies | Bulk object moves or restores |

## Backup and disaster recovery

**Not verified:** production backup frequency, retention, point-in-time recovery availability, RPO/RTO, restoration permissions, and documented restore test. These must be defined before customer launch.

Safe restoration procedure outline:

1. Declare incident and assign recovery owner.
2. Identify last verified recovery point and potential data-loss window.
3. Export/retain relevant logs and evidence; communicate likely impact.
4. Restore into an **isolated environment first**; validate schema, row counts, tenancy, documents and financial integrity.
5. Obtain explicit approval before production cutover; confirm rollback/fallback plan.
6. Perform end-to-end smoke tests and reconcile writes occurring during outage.
7. Document RPO/RTO achieved and customer notifications.

Never restore directly over a live production database as a troubleshooting shortcut.

## Postmortem template

- Summary and customer impact
- Detection and response timeline
- Root cause (confirmed vs suspected)
- What worked / what failed
- Why controls did not prevent or detect earlier
- Corrective actions (priority, owner, due date, validation test)
- Customer communications and contractual/regulatory follow-up as applicable
