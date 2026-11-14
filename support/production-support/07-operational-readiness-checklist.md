# 07 — Production Support Readiness and Evidence Tracker

**Status convention:** `[ ]` not verified; `[x]` verified with linked evidence. Do not check a control merely because it is planned.

## People and process

- [ ] Named primary/backup on-call and escalation contacts; coverage hours defined.
- [ ] Ticket intake, customer verification, response targets and status communications approved.
- [ ] Incident commander, engineering owner and communications owner assigned.
- [ ] Security incident runbook accessible to authorized responders.
- [ ] Customer support privacy/data request handling reviewed.

## Infrastructure and observability

- [ ] Production web/API/worker hosting inventory and URLs documented.
- [ ] External uptime monitoring and API health checks configured.
- [ ] Logs centralized with redaction, correlation IDs and retention policy.
- [ ] Alerts configured for 5xx, latency, queue failures, Auth/SMTP and backups.
- [ ] Dependency/provider status and escalation channels documented.
- [ ] Production secrets stored securely; access reviewed and rotation documented.

## Data and recoverability

- [ ] Production database environment verified separate from development.
- [ ] Database backup policy and recovery point documented.
- [ ] Restore test performed in isolated environment with evidence.
- [ ] RPO/RTO targets approved and tested.
- [ ] Document storage backup/retention and object recovery verified.
- [ ] Finance record reconciliation and audit integrity checks documented.

## Product workflows

- [ ] Login, MFA (if required), invitations and password recovery tested.
- [ ] Owner dashboard, loads, drivers, team and documents smoke-tested.
- [ ] RateCon upload/extraction/review/load creation tested.
- [ ] Invoice, payment and settlement happy/negative paths tested.
- [ ] Cross-tenant access denial tested across major API resources.
- [ ] Driver mobile build, login, assignments, document upload and offline behavior tested.
- [ ] Rollback and post-deployment verification rehearsed.

## Known open items from development

- **Supabase SMTP recovery email:** 535 credential errors observed; successful recovery email not yet confirmed.
- **Mobile release:** device/store validation and production release status not confirmed.
- **Production deployment/monitoring/backups:** actual providers, alerts, restore testing and contacts not supplied; treat as unverified.
- **Development DB migrations:** five pending Prisma migrations applied successfully on 2026-11-01; verify production separately.

## Evidence log

| Control/test | Result | Evidence link / ticket | Verified by | Date UTC | Next review |
|---|---|---|---|---|---|
| Example: external API health check | Pending | TBD | TBD | TBD | TBD |
| Example: isolated backup restore | Pending | TBD | TBD | TBD | TBD |
| Example: password recovery | Blocked | SMTP issue | TBD | TBD | TBD |

## Readiness decision

**Go:** no unmitigated critical issues; approved support coverage; backups/restore verified; essential workflows and security gates passed.

**Conditional go:** only documented low-risk gaps with named owners, deadlines and approved mitigations.

**No-go:** unresolved data exposure risk, missing verified recovery capability, failed critical workflow, or no incident escalation coverage.
