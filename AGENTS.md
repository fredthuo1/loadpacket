\# LoadPacket Engineering Rules



\## Product Mission



LoadPacket is a freight paperwork and financial-readiness platform

for trucking companies.



Primary MVP workflow:



Rate Confirmation

→ Load

→ Driver

→ BOL / POD

→ Document Validation

→ Payment Ready

→ Billing Packet

→ Driver Settlement



\## Architecture



1\. Use a modular monolith for the MVP.

2\. Keep domain logic out of controllers and UI components.

3\. Every tenant-owned entity must contain organization\_id.

4\. Every request must enforce organization authorization.

5\. Integrations must use adapters/interfaces.

6\. Do not place provider-specific fields in core domain entities.



\## Documents



7\. Uploaded documents are immutable evidence.

8\. Never overwrite an existing document.

9\. Corrections create a new DocumentVersion.

10\. Store checksums for uploaded document versions.

11\. Never expose permanent public storage URLs.

12\. Sensitive documents require stricter permissions.



\## AI



13\. AI proposes information; AI does not make authoritative financial decisions.

14\. Extracted financial data requires confirmation.

15\. Store extraction confidence and processing metadata.

16\. Payment readiness must use deterministic business rules.

17\. The application must remain usable when AI processing fails.



\## Financial Rules



18\. Never use JavaScript floating-point arithmetic for currency.

19\. Use Decimal/database decimal types for money.

20\. Approved financial records must not be silently edited.

21\. Corrections generate adjustments.

22\. Approved settlements are immutable.



\## Backend



23\. Validate every public API input.

24\. Consider idempotency for mutations.

25\. APIs must use consistent error responses.

26\. Domain rules require automated tests.

27\. Database writes requiring atomic behavior must use transactions.



\## Security



28\. Every protected endpoint requires authentication and authorization.

29\. Cross-organization access must be impossible.

30\. Never log document contents or sensitive financial information.

31\. Never commit secrets, credentials or API keys.

32\. Private files must be delivered through temporary authorized URLs.



\## Quality



33\. TypeScript strict mode stays enabled.

34\. New behavior requires tests.

35\. Do not disable tests to complete a ticket.

36\. Do not add dependencies without a clear reason.

37\. Run lint, typecheck and tests before declaring work complete.



\## AI Agent Workflow



Before changing code:



1\. Read this AGENTS.md.

2\. Read the relevant feature ticket.

3\. Inspect the existing architecture.

4\. Produce an implementation plan.

5\. Identify affected files.

6\. Identify security implications.

7\. Identify required tests.

8\. Then implement.



A feature is not complete until:



\- backend works

\- frontend works where applicable

\- tests pass

\- typecheck passes

\- lint passes

\- error states are handled

\- it works end-to-end

