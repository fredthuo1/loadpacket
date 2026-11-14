# Day 7G — Runtime Validation and Errors

Implementation complete; no migration. Existing company, driver, invitation, review and payment DTOs remain. Previously bodyless commands now validate an empty DTO and reject injected fields; remaining document IDs use UUID pipes. Agreement/billing names are trimmed before nonempty checks. Load/stop text and requirement arrays are bounded; input money and calculated totals are bounded to Decimal(12,2), reject nonfinite/fractional overflow, and use Decimal addition.

Global whitelist/forbidNonWhitelisted and existing authentication/role guards enforce controlled 400/401/403/404 errors. Business conflicts use 409; invite cooldown uses 429. Prisma transaction conflicts/timeouts now produce a safe actionable 409 rather than exposing provider details. Schema/uniqueness errors retain safe consistent messages.

Audit domains: company, driver profiles/status, invitations/completion, agreement creation/acceptance, document upload/extraction/review, invoice generation/billing, payment, money-opportunity scan/amount/approve/dismiss, load creation/assignment and driver commands/capture.

Checks: API typecheck/build and targeted 76 auth/validation HTTP cases pass. Unit suite 64/64 passes with monetary precision/overflow cases. Final full HTTP/lint outcomes are recorded in the progress ledger. Web unchanged in this phase. No secrets or live provider calls added.
