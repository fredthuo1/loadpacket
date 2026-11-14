# LoadPacket Production Support Handbook

**Status:** Draft for operational adoption | **Audience:** Founder, on-call engineer, customer support | **Last updated:** 2026-11-01

This handbook covers general production support for LoadPacket's carrier web application, driver app, NestJS API, Supabase authentication, PostgreSQL, document processing, and financial workflows. It complements the separate security incident response runbook and manual regression test plan.

> **Important:** Commands and service names below reflect the known development architecture. Production hosting, observability, backup, alerting, support addresses, and ownership are **not yet verified**. Replace every `TBD` before launch. Do not run development commands against production without confirming the target environment.

## Document map

| Document | When to use |
|---|---|
| [01 - Support Operating Model](01-support-operating-model.md) | Intake, triage, severity, SLAs, ownership, communication |
| [02 - Daily Operations](02-daily-operations.md) | Start-of-day checks, monitoring, deployments, maintenance |
| [03 - Troubleshooting Playbooks](03-troubleshooting-playbooks.md) | Login, API, database, documents, finance, mobile, email failures |
| [04 - Incident & Recovery](04-incident-and-recovery.md) | Outages, escalation, rollback, backup restoration, postmortems |
| [05 - Customer Support Procedures](05-customer-support-procedures.md) | Tickets, safe account support, data requests, templates |
| [06 - Release & Change Management](06-release-and-change-management.md) | Deployments, migrations, smoke tests, rollback decisions |
| [07 - Operational Readiness Checklist](07-operational-readiness-checklist.md) | Launch gates, weekly/monthly reviews, evidence tracker |

## Known architecture (verify in production)

- Web: Next.js (`apps/web`); local development `http://localhost:3000`.
- API: NestJS (`apps/api`); local development `http://localhost:3001/api/v1`.
- Mobile: Expo-based LoadPacket Driver (`apps/mobile`); device/store release verification pending.
- Database: PostgreSQL via Supabase; Prisma migrations in `apps/api/prisma/migrations`.
- Authentication: Supabase Auth; recovery email via configurable SMTP/Resend.
- Document workflows: RateCon intake, extraction, review, document vault, BOL/POD, invoices.
- Finance: transactions, invoices, payments, driver settlements and audit evidence.

## Support rules

1. Confirm environment, tenant, time range, and affected feature before investigating.
2. Prefer read-only checks. Never reset, delete, backfill, migrate, or restore without approved change procedure.
3. Never ask customers for passwords, recovery links, access tokens, API keys, or full financial documents in ordinary tickets.
4. Redact PII, organization identifiers, document contents, credentials, and tokens from shared logs.
5. A support agent must not bypass role/tenant authorization to solve a ticket.
6. If unauthorized access or data exposure is suspected, stop the general support workflow and invoke the security incident response runbook.
7. Record every production action in the incident/ticket timeline, including who approved it and the outcome.

## Immediate setup tasks

- [ ] Define production URL, API URL, hosting providers, and on-call contact (`TBD`).
- [ ] Configure centralized logging, uptime checks, alert destinations and retention (`TBD`).
- [ ] Define verified database backup and restore procedures (`TBD`).
- [ ] Create customer support mailbox/helpdesk and escalation contacts (`TBD`).
- [ ] Confirm production deployment and rollback mechanism (`TBD`).
- [ ] Verify SMTP domain, sender and password-recovery delivery (`TBD`).
- [ ] Run end-to-end smoke tests on the actual deployed environment.
