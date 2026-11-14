# Mutation controller declaration inventory

Source inspection only, 2026-10-01. Prefix `/api/v1` comes from main.ts. Listed decorators are declarations, not live requests or proof that every controller is mounted; review module registration before rollout. Only normal `*.controller.ts` filenames are included; duplicate draft filenames are excluded. Semantics and priority are in [mutation audit](mutation-audit.md).

## agreements.controller.ts

[Source](../../apps/api/src/agreements/agreements.controller.ts)

- POST `/api/v1/agreements/loads/:loadId/rate-confirmation` — source line 27
- POST `/api/v1/agreements/:agreementId/accept` — source line 73

## company.controller.ts

[Source](../../apps/api/src/company/company.controller.ts)

- PATCH `/api/v1/company` — source line 16

## document-review.controller.ts

[Source](../../apps/api/src/documents/document-review.controller.ts)

- POST `/api/v1/back-office/loads/:loadId/requirements/:requirementId/accept` — source line 31
- POST `/api/v1/back-office/loads/:loadId/requirements/:requirementId/reject` — source line 47
- POST `/api/v1/back-office/loads/:loadId/requirements/:requirementId/waive` — source line 64

## documents.controller.ts

[Source](../../apps/api/src/documents/documents.controller.ts)

- POST `/api/v1/documents/:documentId/ratecon-draft` — source line 42
- POST `/api/v1/documents/ratecon` — source line 53
- POST `/api/v1/documents/:documentId/extract-text` — source line 74

## signatures.controller.ts

[Source](../../apps/api/src/documents/signatures.controller.ts)

- POST `/api/v1/documents/:documentId/signatures` — source line 19

## vault.controller.ts

[Source](../../apps/api/src/documents/vault.controller.ts)

- POST `/api/v1/documents/vault/:documentId/versions` — source line 60
- POST `/api/v1/documents/vault/:documentId/versions/:versionId/download` — source line 71
- POST `/api/v1/company/documents` — source line 92
- POST `/api/v1/drivers/:driverId/documents` — source line 120

## driver-invitation.controller.ts

[Source](../../apps/api/src/drivers/driver-invitation.controller.ts)

- POST `/api/v1/drivers/:driverId/invite` — source line 20
- POST `/api/v1/drivers/:driverId/invite/resend` — source line 30
- POST `/api/v1/me/complete-invitation` — source line 45

## drivers.controller.ts

[Source](../../apps/api/src/drivers/drivers.controller.ts)

- POST `/api/v1/drivers` — source line 52
- PATCH `/api/v1/drivers/:driverId` — source line 65
- POST `/api/v1/drivers/:driverId/activate` — source line 74
- POST `/api/v1/drivers/:driverId/deactivate` — source line 85
- POST `/api/v1/drivers/:driverId/loads/:loadId/accept` — source line 132
- POST `/api/v1/drivers/:driverId/loads/:loadId/start` — source line 157
- POST `/api/v1/drivers/:driverId/loads/:loadId/complete` — source line 182
- POST `/api/v1/drivers/:driverId/loads/:loadId/documents/:documentType` — source line 207

## me-driver.controller.ts

[Source](../../apps/api/src/drivers/me-driver.controller.ts)

- POST `/api/v1/me/loads/:loadId/accept` — source line 99
- POST `/api/v1/me/loads/:loadId/stops/:stopId/arrive` — source line 110
- POST `/api/v1/me/loads/:loadId/stops/:stopId/depart` — source line 121
- POST `/api/v1/me/loads/:loadId/start` — source line 132
- POST `/api/v1/me/loads/:loadId/complete` — source line 143
- POST `/api/v1/me/loads/:loadId/documents/:documentType` — source line 154

## external.controller.ts

[Source](../../apps/api/src/external/external.controller.ts)

- POST `/api/v1/loads/:loadId/broker-access` — source line 34
- POST `/api/v1/loads/:loadId/broker-access/:accessId/revoke` — source line 41
- POST `/api/v1/external/transactions/download` — source line 62

## finance.controller.ts

[Source](../../apps/api/src/finance/finance.controller.ts)

- POST `/api/v1/finance/transactions` — source line 99
- POST `/api/v1/finance/imports` — source line 185
- POST `/api/v1/finance/imports/:id/preview` — source line 204
- POST `/api/v1/finance/imports/:id/confirm` — source line 211
- POST `/api/v1/finance/imports/:id/reverse` — source line 218

## accounts-receivable.controller.ts

[Source](../../apps/api/src/loads/accounts-receivable.controller.ts)

- POST `/api/v1/back-office/accounts-receivable/loads/:loadId/mark-paid` — source line 31

## loads.controller.ts

[Source](../../apps/api/src/loads/loads.controller.ts)

- POST `/api/v1/loads` — source line 35
- POST `/api/v1/loads/manual` — source line 52
- POST `/api/v1/loads/:loadId/assign-driver` — source line 68

## payment-readiness.controller.ts

[Source](../../apps/api/src/loads/payment-readiness.controller.ts)

- POST `/api/v1/back-office/loads/:loadId/carrier-invoice` — source line 59
- POST `/api/v1/back-office/loads/:loadId/submit-billing` — source line 109

## money-opportunities.controller.ts

[Source](../../apps/api/src/money-opportunities/money-opportunities.controller.ts)

- POST `/api/v1/money-opportunities/loads/:loadId/detention-terms` — source line 30
- POST `/api/v1/money-opportunities/loads/:loadId/scan` — source line 39
- PATCH `/api/v1/money-opportunities/:opportunityId/amount` — source line 70
- POST `/api/v1/money-opportunities/:opportunityId/approve` — source line 87
- POST `/api/v1/money-opportunities/:opportunityId/dismiss` — source line 103
