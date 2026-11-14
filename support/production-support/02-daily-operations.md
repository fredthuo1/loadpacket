# 02 — Daily Operations and Monitoring

## Start-of-day checklist

- [ ] Check web and API availability from outside the hosting network.
- [ ] Confirm API health endpoint (verify exact production path before configuring).
- [ ] Review failed requests by route/status, latency, request volume and error-rate trends.
- [ ] Review database connectivity, connection saturation, slow queries and disk/storage capacity.
- [ ] Check document processing queue: queued age, retries, failed jobs, worker availability.
- [ ] Check SMTP/Auth errors: password recovery, invitations and email delivery failures.
- [ ] Check recent deployments, migrations, environment changes and failed background tasks.
- [ ] Review finance anomalies: failed invoice/settlement actions, duplicate/idempotency errors.
- [ ] Verify scheduled backups succeeded and are within retention policy.
- [ ] Review unresolved SEV1/SEV2 incidents and overdue tickets.

## Suggested monitoring signals (thresholds are placeholders)

| Signal | Alert guidance | Action |
|---|---|---|
| External web/API uptime | Consecutive failed checks from multiple locations | Confirm outage, declare incident |
| API 5xx error rate | Sustained increase over baseline | Identify failing endpoints and recent changes |
| API p95 latency | Sustained increase over baseline | Check DB, external services, queue load |
| Database connections | Approaching configured pool limit | Inspect pool usage; avoid blind restarts |
| Document queue age | Jobs exceeding agreed processing time | Check worker and provider errors |
| Auth/SMTP errors | Repeated 5xx or SMTP 535 | Check provider settings and credential rotation |
| Backup failures | Any scheduled backup failure | Escalate; verify restore point |
| Unexpected bulk downloads | Anomalous tenant activity | Invoke security response |

## Safe first checks

1. Identify environment and release version.
2. Check status pages and monitoring dashboards (URLs: `TBD`).
3. Inspect application logs using correlation/request IDs, redacting secrets.
4. Check service configuration changes without displaying secret values.
5. Reproduce using a test organization and non-sensitive test data.
6. Document findings before proposing intervention.

## Database discipline

Prisma `migrate status` is a diagnostic, but confirm the datasource/environment before use. Migration deployment is a **change**, not a health check. Never run `migrate reset`, `db push`, destructive SQL, or manual edits to financial evidence in production.

## Weekly and monthly operations

**Weekly:** review error trends, recurring tickets, security updates, dependency vulnerabilities, backup success, queue performance and certificate expiry.

**Monthly:** test a backup restore in isolation; review least-privilege access, support permissions, retention, audit log integrity, capacity forecasts, incident metrics and disaster recovery assumptions.

## Operating dashboard inventory (fill before launch)

| System | Dashboard URL | Owner | Alert channel | Runbook |
|---|---|---|---|---|
| Web hosting | TBD | TBD | TBD | Troubleshooting |
| NestJS API | TBD | TBD | TBD | Troubleshooting |
| Supabase Auth/DB | TBD | TBD | TBD | Troubleshooting |
| Storage/document worker | TBD | TBD | TBD | Troubleshooting |
| Email/SMTP | TBD | TBD | TBD | Troubleshooting |
| Mobile release monitoring | TBD | TBD | TBD | Troubleshooting |
