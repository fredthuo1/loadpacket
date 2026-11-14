# Day 7H — Operations dashboard

Status: COMPLETE (final combined release gate recorded in the Day 7 report).

Extended the existing dashboard with active/inactive/pending drivers, review and paperwork blockers, 30-day expirations, expired documents, driver compliance, partial/overdue receivables, Money Found, recent activity and quick actions. Company/driver document counts use the vault's authorization and expiration rules. Load blockers use the shared readiness policy; monetary sums use Decimal.

Owner sees all cards. Dispatcher sees operational navigation and authorized document counts; sensitive driver compliance and new financial summaries return null. Back Office and Driver retain their existing landing pages. Existing operational access to load rates is unchanged.

Compliance attention means an active driver has an expired profile CDL date or lacks a currently dated CDL/medical-certificate document. This is a document-completeness indicator, not a legal compliance certification.

Verification: API/web typechecks pass; eight vault/dashboard HTTP cases pass; both Owner/Dispatcher dashboard browser cases pass. Full lint/build and regression results are consolidated in the final report.

Files: apps/api/src/loads/owner-dashboard.service.ts; apps/api/src/autopilot/owner-autopilot.service.ts; apps/api/test/vault.e2e-spec.ts; apps/web/src/app/page.tsx; apps/web/src/components/operations-summary.tsx; apps/web/test/dashboard.spec.ts.
