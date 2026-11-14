# 05 — Customer Support Procedures and Templates

## Support workflow

1. Acknowledge ticket and assign reference number.
2. Verify reporter's organization and authorized role using approved process.
3. Gather minimum necessary details: feature, time, error, impact, device, steps.
4. Classify incident/bug/question/billing/access/data request/security concern.
5. Troubleshoot with approved read-only tools; escalate privileged actions.
6. Explain workaround only if safe and tested.
7. Verify resolution with customer; close with summary and knowledge-base link.

## Common support categories

| Category | First checks | Escalate when |
|---|---|---|
| Login/recovery | Auth error, mail delivery, redirect | Provider outage or repeated failures |
| Organization/team | Role, invitation status, expiry | Access inconsistency or suspected takeover |
| Drivers | Invitation, assignment, mobile version | Incorrect tenant data or broken lifecycle |
| Loads | Validation, status, extracted RateCon fields | Incorrect state transition or data corruption |
| Documents | Upload type/size, permissions, version | Unauthorized access or missing evidence |
| Invoices/payments | Status, totals, duplicate request | Financial discrepancy |
| Settlements | Review/approval state, work eligibility | Immutable record conflict or payout discrepancy |
| Finance/import | Date filters, source mapping, duplicates | Reconciliation mismatch |
| Mobile | Build/OS, connectivity, permissions | Reproducible crash or sync loss |

## Safe account assistance

- Support cannot see or request a user's password or recovery token.
- Use approved self-service recovery and verified invitation flows.
- Role changes require authorized organization owner and audit trail.
- If account takeover suspected, invoke security incident response.
- Never send customer data to a different email without verified authorization.

## Data export/deletion and privacy requests

Log request, verify identity/authority, identify scope, preserve legal/contractual retention requirements, route to designated privacy owner (`TBD`), document decision and completion. Do not promise deletion or retention timelines until policy and applicable law are reviewed.

## Customer message templates

### Acknowledgement

> Thanks for reporting this. We've opened ticket **[ID]** for **[feature]**. We're reviewing the issue and will update you by **[time/timezone]**. Please do not send passwords, reset links, or API keys.

### Investigating service disruption

> We're investigating an issue affecting **[feature]** beginning around **[time/timezone]**. We understand this may interrupt **[business workflow]**. We'll provide our next update by **[time]**. We don't yet have a confirmed restoration time.

### Request for reproduction details

> To help us reproduce this safely, please share the page or action, approximate time and timezone, error message, and device/browser version. Please redact customer names, financial information, and any credentials from screenshots.

### Workaround

> While we investigate **[issue]**, you can use **[tested safe workaround]**. Please avoid repeating **[operation]** if it could create duplicate invoices, payments, or settlements. We'll confirm when normal operation is restored.

### Resolution

> We've resolved **[issue]** as of **[time/timezone]** and verified **[checks]**. Please retry **[specific action]** and let us know if the problem continues. Your ticket reference is **[ID]**.

## Knowledge-base article template

```markdown
# [Task or error title]
Applies to: [web/mobile, roles, versions]
Symptoms:
Before you begin:
Steps:
Expected result:
If it still fails:
When to contact support:
Last verified: YYYY-MM-DD | Owner:
```
