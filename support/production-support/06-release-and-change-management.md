# 06 — Release and Change Management

## Change types

- **Standard:** preapproved, low-risk, documented reversible changes.
- **Normal:** feature release, configuration update, dependency update, migrations; requires review, test evidence, rollback plan and scheduled window.
- **Emergency:** production-impacting fix; incident commander approval and retrospective review.

## Pre-release checklist

- [ ] Scope, owner, issue/PR and release version documented.
- [ ] Target environment verified; no production/dev credential mixing.
- [ ] Code review completed; secret/dependency/static scans passed.
- [ ] Targeted unit/integration tests passed.
- [ ] Manual regression cases relevant to changed pages/workflows passed.
- [ ] Authorization and tenant-isolation tests passed for affected routes.
- [ ] Schema migration SQL reviewed for locks, destructive changes, compatibility and backfill.
- [ ] Backup/recovery point verified before high-risk changes.
- [ ] Rollback plan and customer impact window agreed.
- [ ] Monitoring dashboards and on-call coverage ready.

## Deployment procedure (provider-specific commands TBD)

1. Record current production app version, DB migration status and environment.
2. Deploy compatible backend changes before client changes when contract requires it.
3. Apply approved migrations with verified production datasource, using least-privilege deployment identity.
4. Verify migration outcome; do not rerun blindly after partial failure.
5. Deploy web/worker/mobile as applicable; mobile store rollout may be delayed.
6. Run smoke tests and watch error rate/latency for defined observation period.
7. Mark release complete or initiate rollback under incident process.

## Required post-deploy smoke tests

- [ ] Login and logout with test user; recovery email flow (if configured).
- [ ] Owner dashboard loads without 500/503.
- [ ] Create sample RateCon intake and verify extracted fields/review.
- [ ] Open loads, drivers, documents and team pages.
- [ ] Test one authorized document download and one unauthorized denial.
- [ ] Verify invoice/settlement views and safe non-destructive operations.
- [ ] Confirm finance overview loads and filters work.
- [ ] Verify driver app API compatibility and key workflow.
- [ ] Check error logs, queue backlog and provider status.

## Rollback caution

Rolling back application code does not necessarily undo database migrations or financial events. Use forward-compatible migrations and an explicit rollback assessment. Never run destructive Prisma reset commands on production.

## Change record template

```markdown
Change ID: CHG-YYYY-NNN
Owner / approver:
Environment / version before / version after:
Purpose and customer impact:
Risk and dependencies:
Migration details and backup confirmation:
Test evidence:
Deployment window (UTC):
Rollback criteria and steps:
Observed outcome and monitoring period:
```
