# 03 — Troubleshooting Playbooks

Use these steps in order. **Read-only first; no production writes without an approved change.** Capture timestamp (UTC), tenant (internally), request ID, deployment version and redacted errors.

## A. Login, registration or password recovery

**Symptoms:** failed login, missing recovery email, `/auth/v1/recover` HTTP 500, expired link.

1. Confirm Supabase project and Auth service health; check user-visible error and HTTP status.
2. Inspect Supabase Auth logs for request ID and provider error, without sharing identities/tokens.
3. If SMTP error `535 Invalid username` or `535 Authentication credentials invalid`, check configured provider username/password **in the provider and Supabase consoles**, not in logs or chat.
4. If mail accepted but not delivered, inspect sender domain verification, provider delivery events, recipient restrictions, spam and rate limits.
5. Confirm redirect allowlist includes approved production callback URLs; verify token expiry and single-use behavior.
6. Retest with a dedicated test account; do not ask users to send reset links.

**Known development incident (2026-11-01):** Supabase password recovery returned HTTP 500 with SMTP 535 errors. This is **not confirmed resolved**. Resend sandbox sender may be restricted to authorized test recipients; verify domain before general delivery.

## B. Dashboard or API returns 500/503

1. Check API health, deployment and upstream availability.
2. Correlate request ID with API logs; identify DB error versus external service failure.
3. Verify database connectivity using approved read-only checks; confirm API uses intended datasource.
4. Compare Prisma migration status against deployed code **without applying changes**.
5. Review last deployment and config change; choose rollback or fix via change control.
6. Retest owner dashboard, finance overview, document vault, team and load management.

**Known development incident:** five missing migrations caused broad page failures; they were applied successfully in development on 2026-11-01. Do not assume the same cause for future incidents.

## C. RateCon upload/extraction fails

1. Capture file type, size, page count and request ID; never paste document content into public tickets.
2. Verify upload limit, private storage access and document ownership checks.
3. Inspect processing-run status, queue age, worker logs, retry count and AI/OCR provider errors.
4. Distinguish upload failure, extraction failure, low-confidence fields and load-creation failure.
5. Reproduce with sanitized sample RateCon; require user review of extracted data.
6. Never bypass malware scanning or force a failed job to succeeded; use documented retry workflow only.

## D. Document vault/download fails

1. Confirm authenticated user, role and tenant access; test only with authorized account.
2. Verify document record, version and storage object exist without exposing signed URLs.
3. Check signed URL expiry, storage policy, file integrity and API/storage error logs.
4. Investigate 403 as a potential correct denial; do not weaken authorization to make it pass.
5. Suspected cross-tenant access or public bucket exposure → security incident runbook immediately.

## E. Load/driver workflow fails

1. Capture load state, intended transition, actor role, assigned driver and event time.
2. Check API validation and business rules for assignment, pickup, delivery and completion.
3. Confirm mobile/web clients use compatible API versions and timestamps/timezones.
4. Check for duplicate events, retry/idempotency behavior and offline sync conflicts.
5. Reproduce on test data; do not directly rewrite event history.

## F. Invoice, payment or settlement fails

1. Confirm actor role, organization, load state, invoice/settlement state and idempotency key (redacted).
2. Check for validation failures, duplicates, immutable-record constraints and transaction errors.
3. Reconcile displayed totals against approved source records without modifying evidence.
4. If money movement or records appear incorrect, escalate to engineering and designated financial approver.
5. Never manually delete/recreate issued invoices, approved settlements, payments or audit records.
6. Record exact reconciliation outcome and customer communication.

## G. Mobile driver app issue

1. Capture iOS/Android version, app build, device OS, connectivity and repro steps.
2. Confirm sign-in/session state, driver assignment and relevant API endpoint behavior.
3. Check permissions for camera, photos, notifications and document upload as applicable.
4. Test on physical device and simulator where available; note offline behavior and retry.
5. Verify released app build; mobile store release and device validation remain `TBD` until confirmed.

## H. Performance or intermittent timeouts

1. Determine affected routes, users, regions, time range and p95/p99 latency.
2. Check database pool, slow queries, locks, queue backlogs and third-party latency.
3. Compare against traffic spikes, recent deployments and batch jobs.
4. Prefer reversible mitigations (rate limiting, disabling noncritical jobs, scaling within budget) with approval.
5. Monitor after mitigation and capture before/after evidence.

## Escalation triggers

- Cross-tenant access, unexpected public document link, exposed secret → **security incident**.
- Missing/incorrect financial evidence, possible double payment → **financial integrity escalation**.
- Broad login or API outage → **SEV1/SEV2 incident**.
- Data loss or corrupted backups → **incident commander and recovery owner**.
