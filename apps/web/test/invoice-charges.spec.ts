import { test, expect } from "@playwright/test";

test("Back Office approved charge to original, supplemental, submission and invoice payment", async ({
  page,
}) => {
  const loadId = "00000000-0000-4000-8000-000000000010",
    chargeId = "00000000-0000-4000-8000-000000000020";
  const originalId = "00000000-0000-4000-8000-000000000030",
    supplementId = "00000000-0000-4000-8000-000000000031";
  const item = {
    load: {
      id: loadId,
      loadNumber: "SYNTHETIC-B1C",
      brokerName: "Synthetic Broker",
      status: "DELIVERED",
      totalRate: "1100",
      effectivePaymentTermsDays: 45,
      paymentTermsDays: null as number | null,
      invoiceIssuedAt: null as string | null,
      paymentDueAt: null as string | null,
      pickup: null,
      delivery: null,
    },
    driver: null,
    readiness: {
      ready: false,
      blockingCount: 1,
      requiredCount: 1,
      satisfiedCount: 0,
      requirements: [
        {
          id: "r",
          documentType: "CARRIER_INVOICE",
          requirement: "REQUIRED",
          status: "MISSING",
          blocking: true,
        },
      ],
    },
  };
  const charges = [
    {
      id: chargeId,
      description: "Reviewed detention",
      amount: "25.25",
      status: "DETECTED",
      currency: "USD",
    },
  ];
  const invoices: {
    id: string;
    invoiceNumber: string;
    originalInvoiceId: string | null;
    totalAmount: string;
    amountPaid: string;
    remainingBalance: string;
    currency: string;
    submittedAt: string | null;
    paymentDueAt: string;
  }[] = [];
  let counter = 1,
    hasOriginal = false,
    paid = false;
  const token = () => String(counter).padStart(64, "0");
  await page.route("**/api/v1/back-office/queue", (r) =>
    r.fulfill({ json: [item] }),
  );
  await page.route("**/api/v1/back-office/loads/*/invoices", (r) =>
    r.fulfill({
      json: {
        expectedToken: token(),
        baseRate: "1100.00",
        hasOriginal,
        outstanding: paid ? "0.00" : "25.25",
        invoices,
        charges,
      },
    }),
  );
  await page.route("**/api/v1/money-opportunities/*/approve", async (r) => {
    charges[0].status = "APPROVED";
    counter++;
    await r.fulfill({ json: { approved: true } });
  });
  await page.route(
    "**/api/v1/back-office/loads/*/carrier-invoice",
    async (r) => {
      const body = r.request().postDataJSON() as {
        expectedToken: string;
        idempotencyKey: string;
        chargeIds: string[];
        supplemental: boolean;
      };
      expect(body.expectedToken).toBe(token());
      expect(body.idempotencyKey).toMatch(/^[a-f0-9-]{36}$/);
      expect(body.chargeIds).toEqual([charges[0].id]);
      expect(body.supplemental).toBe(hasOriginal);
      invoices.push({
        id: hasOriginal ? supplementId : originalId,
        invoiceNumber: hasOriginal ? "TEST-SUPPLEMENT" : "TEST-ORIGINAL",
        originalInvoiceId: hasOriginal ? originalId : null,
        totalAmount: hasOriginal ? "25.25" : "1125.25",
        amountPaid: "0.00",
        remainingBalance: hasOriginal ? "25.25" : "1125.25",
        currency: "USD",
        submittedAt: null,
        paymentDueAt: "2026-12-01T12:00:00Z",
      });
      charges[0].status = "BILLED";
      hasOriginal = true;
      counter++;
      Object.assign(item.load, {
        status: "PAYMENT_READY",
        paymentTermsDays: 45,
        invoiceIssuedAt: "2026-10-22T18:00:00Z",
        paymentDueAt: "2026-12-01T12:00:00Z",
      });
      Object.assign(item.readiness, {
        ready: true,
        blockingCount: 0,
        satisfiedCount: 1,
      });
      Object.assign(item.readiness.requirements[0], {
        status: "ACCEPTED",
        blocking: false,
      });
      await r.fulfill({
        status: 201,
        json: { created: true, load: item.load },
      });
    },
  );
  await page.route(
    "**/api/v1/back-office/loads/*/submit-billing",
    async (r) => {
      invoices[0].submittedAt = "2026-10-22T18:01:00Z";
      invoices[0].amountPaid = "1125.25";
      invoices[0].remainingBalance = "0.00";
      charges[0] = {
        id: "00000000-0000-4000-8000-000000000021",
        description: "Additional approved fee",
        amount: "25.25",
        status: "APPROVED",
        currency: "USD",
      };
      counter++;
      await r.fulfill({
        json: {
          submitted: true,
          load: { ...item.load, invoiceNumber: "TEST-ORIGINAL" },
        },
      });
    },
  );
  await page.route(
    "**/api/v1/back-office/loads/*/invoices/*/submit",
    async (r) => {
      invoices[1].submittedAt = "2026-10-22T18:02:00Z";
      await r.fulfill({ json: { submitted: true } });
    },
  );
  await page.route("**/api/v1/back-office/accounts-receivable", (r) =>
    r.fulfill({
      json: {
        summary: {
          outstanding: { amount: paid ? "0.00" : "25.25", count: paid ? 0 : 1 },
          dueSoon: { amount: "0", count: 0 },
          overdue: { amount: "0", count: 0 },
          paid: { amount: paid ? "25.25" : "0", count: paid ? 1 : 0 },
        },
        invoices: [
          {
            id: supplementId,
            invoiceId: supplementId,
            loadId,
            originalInvoiceId: originalId,
            loadNumber: "SYNTHETIC-B1C",
            brokerName: "Synthetic Broker",
            status: paid ? "PAID" : "INVOICED",
            currency: "USD",
            totalRate: "25.25",
            remainingBalance: paid ? "0.00" : "25.25",
            amountPaid: paid ? "25.25" : "0",
            invoiceNumber: "TEST-SUPPLEMENT",
            invoiceIssuedAt: "2026-10-22T18:00:00Z",
            billingSubmittedAt: "2026-10-22T18:00:00Z",
            paymentDueAt: "2026-12-01T12:00:00Z",
            agingStatus: "NOT_DUE",
            daysUntilDue: 40,
          },
        ],
      },
    }),
  );
  await page.route(
    "**/api/v1/back-office/accounts-receivable/loads/*/mark-paid",
    async (r) => {
      expect(r.request().url()).toContain(`/loads/${loadId}/mark-paid`);
      expect(r.request().postDataJSON()).toMatchObject({
        invoiceId: supplementId,
        amountPaid: "25.25",
      });
      paid = true;
      await r.fulfill({
        json: {
          recorded: true,
          message: "Payment recorded.",
          load: { status: "PAID" },
        },
      });
    },
  );
  page.on("dialog", (d) => void d.accept());
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill("backoffice@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Approve reviewed charge" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Issue itemized invoice" }).click();
  await expect(
    page.getByRole("heading", { name: "TEST-ORIGINAL", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Submit Billing", exact: true })
    .click();
  await page.getByRole("button", { name: "Refresh review" }).click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Issue supplemental invoice" })
    .click();
  await expect(
    page.getByText("Supplement to TEST-ORIGINAL", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Submit supplemental billing" })
    .click();
  await page.getByRole("link", { name: "Record invoice payment" }).click();
  await page.getByRole("button", { name: /Record Payment/i }).click();
  await expect(page.getByText("Paid", { exact: true }).last()).toBeVisible();
  expect(paid).toBe(true);
});
