# Day 7D — Document Review and Compliance

Implementation complete. Migration `20260920041000_add_document_review` adds REJECTED, rejection/waiver events and nullable current/reviewed version, reviewer, time and reason fields. Composite foreign keys enforce organization ownership. Migration preservation checks passed for all original rows and mappings; fresh status confirms all 11 migrations applied.

Owner and Back Office review at GET /api/v1/back-office/loads/:loadId/requirements and POST :requirementId/accept, reject or waive. Acceptance/rejection requires the current immutable version ID. Rejection/waiver requires a trimmed, bounded reason. Stale versions and conflicting terminal states return 409; other tenants get 404; Driver/Dispatcher are denied. Identical retries emit no duplicate event. Review and capture lock the load before the requirement. Billed/paid paperwork cannot be changed.

Rejected driver paperwork can be corrected after delivery. Corrections append DocumentVersion to the same Document and clear the current review decision; previous files and review events remain intact. Missing/rejected required driver documents block delivery completion. The driver sees the rejection reason and upload action.

Review controls appear on the load detail and /back-office/loads/:loadId/review, linked from Back Office. Company/driver expiration remains derived independently, as implemented and tested in phase 7C.

Checks: Prisma validate/generate, API/web typecheck, lint and builds pass; full HTTP suite 160/160 passes. Review browser test passes for accept/reject/waive and reasons. Prior phase unit suite 50/50 and browser suite 18/18 passed; final release will rerun all suites together. No live provider requests were made.

Primary files: schema/migration; document-review.service.ts/controller.ts/dto.ts; driver-document-capture.service.ts; drivers.service.ts; web document-review.tsx, review route, load/driver/back-office pages; test/document-review.e2e-spec.ts and web/test/document-review.spec.ts.
