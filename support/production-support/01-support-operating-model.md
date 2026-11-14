# 01 — Support Operating Model

## 1. Scope and support tiers

**Tier 1 (customer support):** receive tickets, verify identity without requesting secrets, collect reproducible steps, inspect approved user-visible status, answer documented usage questions. **No database writes or privileged access.**

**Tier 2 (engineering):** inspect redacted logs, trace request IDs, reproduce in non-production, diagnose code/configuration, propose fixes, run approved read-only database queries.

**Incident commander (initially founder/on-call):** declares incidents, coordinates response, authorizes communication and emergency changes, tracks restoration and postmortem. A separate approver should be added as team grows.

## 2. Ticket intake form

- Ticket ID; received at (UTC); contact channel; customer organization (verified); reporter role.
- Feature/page, device/browser/app version, environment, first observed time and timezone.
- Expected versus actual result, steps to reproduce, frequency, error text and request ID.
- Number of affected users/organizations, business impact, workaround, attachments (redacted).
- Severity, assignee, next update time, linked incident/bug, resolution and customer confirmation.

**Identity verification:** use the authenticated support portal or established account-contact verification process; do not rely solely on an email claiming to represent an organization. Never disclose tenant-specific information until authorization is confirmed.

## 3. Severity matrix (proposed; confirm contractual targets)

| Severity | Examples | Initial response target* | Update cadence* |
|---|---|---|---|
| SEV1 Critical | Broad outage, widespread inability to access loads, confirmed data exposure | 15 min | Every 30 min |
| SEV2 High | Key workflow unavailable for multiple organizations; payments/invoicing blocked | 1 hour | Every 2 hours |
| SEV3 Medium | Partial feature failure, limited customers, workaround available | 1 business day | Daily while active |
| SEV4 Low | Cosmetic defect, guidance, non-urgent request | 2 business days | As agreed |

*These are **internal planning targets, not customer promises**. Publish only after staffing, coverage hours and monitoring support them. Suspected data exposure always triggers the separate security runbook, regardless of availability severity.

## 4. Triage decision tree

1. **Safety/security/data leak?** → security incident procedure immediately.
2. **Many customers affected?** → verify status/monitoring, declare SEV1/SEV2, assign incident commander.
3. **One tenant/user?** → verify permissions, configuration, data state and client version; do not assume platform outage.
4. **Recent release?** → correlate deployment timestamp, feature flags and migration status; consider rollback.
5. **External dependency?** → check Supabase, SMTP provider, storage, AI provider and hosting status; communicate known dependency issue without guessing restoration time.
6. **Resolved?** → retest original workflow, document root cause or best-known cause, obtain confirmation, close ticket.

## 5. Handoff and escalation

- Tier 1 → Tier 2: include repro, impact, timestamps (UTC), redacted request IDs, environment, checks performed.
- Tier 2 → incident commander: include blast radius, customer impact, hypotheses with confidence, mitigation options, risk of each action.
- Incident commander → customers: approved status, affected functions, safe workaround, next update; no speculative cause or exposed identifiers.

## 6. Support boundaries

Do not impersonate customers or use service-role credentials for convenience. Do not manually change invoices, settlements, audit events or authentication records. Route billing disputes and data deletion/export requests through authorized workflows with an audit trail.
