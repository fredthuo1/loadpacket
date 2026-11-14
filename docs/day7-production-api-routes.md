# Day 7 API controller route inventory

Paths below use the /api/v1 prefix. This is a source declaration inventory; authorization is defined by controller/handler Roles and service checks. It includes retained legacy declarations; see modules for registration. The final report identifies changed feature families.

## apps/api/src/money-opportunities/money-opportunities.controller.ts

- `POST /api/v1/money-opportunities/loads/:loadId/scan`
- `GET /api/v1/money-opportunities/loads/:loadId`
- `PATCH /api/v1/money-opportunities/:opportunityId/amount`
- `POST /api/v1/money-opportunities/:opportunityId/approve`
- `POST /api/v1/money-opportunities/:opportunityId/dismiss`

## apps/api/src/loads/payment-readiness.controller.ts

- `GET /api/v1/back-office/queue`
- `GET /api/v1/back-office/loads/:loadId/readiness`
- `POST /api/v1/back-office/loads/:loadId/carrier-invoice`
- `GET /api/v1/back-office/loads/:loadId/billing-packet`
- `POST /api/v1/back-office/loads/:loadId/submit-billing`

## apps/api/src/loads/owner-dashboard.controller.ts

- `GET /api/v1/owner/dashboard`
- `GET /api/v1/owner/loads/:loadId`

## apps/api/src/loads/loads.controller.ts

- `POST /api/v1/loads`
- `POST /api/v1/loads/manual`
- `GET /api/v1/loads/dashboard`
- `POST /api/v1/loads/:loadId/assign-driver`
- `GET /api/v1/loads/:loadId`

## apps/api/src/loads/accounts-receivable.controller.ts

- `GET /api/v1/back-office/accounts-receivable`
- `POST /api/v1/back-office/accounts-receivable/loads/:loadId/mark-paid`

## apps/api/src/drivers/me-driver.controller.ts

- `GET /api/v1/me/loads`
- `GET /api/v1/me/loads/:loadId`
- `GET /api/v1/me/loads/:loadId/autopilot`
- `POST /api/v1/me/loads/:loadId/accept`
- `POST /api/v1/me/loads/:loadId/start`
- `POST /api/v1/me/loads/:loadId/complete`
- `POST /api/v1/me/loads/:loadId/documents/:documentType`

## apps/api/src/drivers/drivers.controller.ts

- `GET /api/v1/drivers`
- `POST /api/v1/drivers`
- `GET /api/v1/drivers/:driverId`
- `PATCH /api/v1/drivers/:driverId`
- `POST /api/v1/drivers/:driverId/activate`
- `POST /api/v1/drivers/:driverId/deactivate`
- `GET /api/v1/drivers/:driverId/loads`
- `GET /api/v1/drivers/:driverId/loads/:loadId`
- `POST /api/v1/drivers/:driverId/loads/:loadId/accept`
- `POST /api/v1/drivers/:driverId/loads/:loadId/start`
- `POST /api/v1/drivers/:driverId/loads/:loadId/complete`
- `POST /api/v1/drivers/:driverId/loads/:loadId/documents/:documentType`

## apps/api/src/drivers/driver-invitation.controller.ts

- `POST /api/v1/drivers/:driverId/invite`
- `POST /api/v1/drivers/:driverId/invite/resend`
- `POST /api/v1/me/complete-invitation`

## apps/api/src/documents/vault.controller.ts

- `GET /api/v1/documents/vault`
- `GET /api/v1/documents/vault/:documentId`
- `POST /api/v1/documents/vault/:documentId/versions`
- `POST /api/v1/documents/vault/:documentId/versions/:versionId/download`
- `GET /api/v1/company/documents`
- `POST /api/v1/company/documents`
- `GET /api/v1/drivers/:driverId/documents`
- `POST /api/v1/drivers/:driverId/documents`
- `GET /api/v1/documents/vault-files/:ticket`

## apps/api/src/documents/documents.controller.ts

- `GET /api/v1/documents/:documentId`
- `POST /api/v1/documents/:documentId/ratecon-draft`
- `POST /api/v1/documents/ratecon`
- `POST /api/v1/documents/:documentId/extract-text`

## apps/api/src/documents/document-review.controller.ts

- `GET /api/v1/back-office/loads/:loadId/requirements`
- `POST /api/v1/back-office/loads/:loadId/requirements/:requirementId/accept`
- `POST /api/v1/back-office/loads/:loadId/requirements/:requirementId/reject`
- `POST /api/v1/back-office/loads/:loadId/requirements/:requirementId/waive`

## apps/api/src/company/company.controller.ts

- `GET /api/v1/company`
- `PATCH /api/v1/company`

## apps/api/src/app.controller.ts

- `GET /api/v1/health`
- `GET /api/v1/health/database`

## apps/api/src/agreements/agreements.controller.ts

- `POST /api/v1/agreements/loads/:loadId/rate-confirmation`
- `GET /api/v1/agreements/loads/:loadId`
- `GET /api/v1/agreements/:agreementId`
- `POST /api/v1/agreements/:agreementId/accept`

## apps/api/src/autopilot/autopilot.controller.ts

- `GET /api/v1/autopilot/owner/exceptions`
- `GET /api/v1/autopilot/loads/:loadId`
- `GET /api/v1/autopilot/loads/:loadId/timeline`

## apps/api/src/auth/auth.controller.ts

- `GET /api/v1/me`

