# Day 7E — Canonical Payment Readiness

Implementation complete; no schema migration required. `readiness-policy.ts` is the shared deterministic policy consumed by the queue, both dashboard services, Autopilot/owner exceptions, invoice generation/reconciliation, review reconciliation, billing submission and packet generation.

Required MISSING/RECEIVED/REJECTED block. ACCEPTED/WAIVED pass. Conditional receipts become applicable on actual submission, including rejection of that evidence; untouched conditional MISSING receipts remain inactive. Requirements explicitly designated REQUIRED always apply. Empty configurations do not claim readiness. The response includes reasoned blockers and active/satisfied counts.

One transaction helper locks and rereads the load before DELIVERED → PAYMENT_READY and emits a single event. Final review and invoice generation call it. LoadPacket-generated immutable invoices are intentionally auto-accepted with version/reviewer metadata. Billing rereads policy inside its load-lock transaction; packets use approved versions and omit waived documents. Owner/Back Office copy distinguishes awaiting review from missing paperwork.

Checks: API typecheck/lint/build pass; 57 unit tests and 161 HTTP tests pass. Web typecheck/lint pass; review browser and production web build passed immediately before the readiness copy change. Final release repeats all browser/build checks. The HTTP workflow confirms invoice generation cannot bypass unreviewed documents, rejection blocks, waiver/acceptance enables exactly one readiness transition, and retries do not duplicate events.

Primary files: src/loads/readiness-policy.ts, readiness-transition.ts, associated unit test; payment-readiness, carrier-invoice, billing-submission, billing-packet, owner-dashboard, loads services; document-review service; Autopilot services; Back Office status text; document-review/auth HTTP tests.
