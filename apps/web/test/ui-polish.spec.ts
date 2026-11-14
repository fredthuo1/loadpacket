import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// Fictional browser fixtures only; this suite never calls the configured database.
const id = "00000000-0000-4000-8000-000000000010";
const stamp = "2026-09-29T12:00:00Z";
const stops = [
  {
    id: "pickup",
    sequence: 1,
    type: "PICKUP",
    facilityName: "Fictional Midwest Distribution",
    address: "St. Louis, MO",
    appointmentText: "Sep 29 · 8:00 AM",
    referenceNumber: "DEMO-PU-21",
  },
  {
    id: "delivery",
    sequence: 2,
    type: "DELIVERY",
    facilityName: "Fictional Lone Star Warehouse",
    address: "Dallas, TX",
    appointmentText: "Sep 30 · 2:00 PM",
    referenceNumber: "DEMO-DEL-42",
  },
];
const requirements = ["BOL", "POD"].map((type) => ({
  id: type,
  documentType: type,
  requirement: "REQUIRED",
  status: "RECEIVED",
  blocking: true,
  reason: null,
  documentId: `doc-${type}`,
  versionId: `version-${type}`,
  versionNumber: 1,
  fileName: `fictional-${type.toLowerCase()}.pdf`,
  uploadedBy: "Fictional Driver",
}));
for (const width of [1440, 768, 390])
  test(`UI polish representative layouts at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    const phase =
      process.env.LP_UI_CAPTURE_PHASE === "before" ? "before" : "after";
    const dir = path.resolve("../../test-results/ui-polish", phase);
    mkdirSync(dir, { recursive: true });
    await page.setViewportSize({ width, height: 1000 });
    await page.route("**/api/v1/owner/dashboard", (r) =>
      r.fulfill({
        json: {
          generatedAt: stamp,
          metrics: {
            totalLoads: 1,
            totalLoadValue: "3450.00",
            activeLoads: 1,
            paymentReadyLoads: 0,
            activeDrivers: 1,
            outstandingReceivables: { amount: "2450.00", count: 1 },
            paidRevenue: { amount: "1000.00", count: 1 },
          },
          recentLoads: [
            {
              id,
              loadNumber: "LP-DEMO-21",
              brokerName: "Fictional Freight",
              status: "IN_TRANSIT",
              totalRate: "3450.00",
              pickup: stops[0],
              delivery: stops[1],
              driver: {
                id: "driver",
                name: "Fictional Driver",
                assignmentStatus: "IN_PROGRESS",
              },
              paperwork: { requiredCount: 2, blockingCount: 2, clear: false },
              invoiceNumber: null,
              paymentDueAt: null,
              paidAt: null,
            },
          ],
        },
      }),
    );
    await page.route(`**/api/v1/owner/loads/${id}`, (r) =>
      r.fulfill({
        json: {
          load: {
            id,
            loadNumber: "LP-DEMO-21",
            status: "IN_TRANSIT",
            brokerName: "Fictional Freight",
            brokerContact: null,
            equipment: "Dry Van",
            currency: "USD",
            linehaul: "3250.00",
            fuelSurcharge: "200.00",
            totalRate: "3450.00",
            createdAt: stamp,
            updatedAt: stamp,
          },
          route: { stops },
          driver: {
            id: "driver",
            name: "Fictional Driver",
            phone: null,
            email: null,
            assignmentStatus: "IN_PROGRESS",
            assignedAt: stamp,
          },
          paperwork: {
            requiredCount: 2,
            blockingCount: 2,
            ready: false,
            requirements,
          },
          billing: {
            invoiceNumber: null,
            invoiceIssuedAt: null,
            billingSubmittedAt: null,
            paymentTermsDays: 30,
            paymentDueAt: null,
            billingRecipientName: null,
            billingRecipientEmail: null,
            amountPaid: "0.00",
            paidAt: null,
            balanceDue: "3450.00",
          },
          availableDrivers: [],
        },
      }),
    );
    await page.route(`**/api/v1/autopilot/loads/${id}`, (r) =>
      r.fulfill({
        json: {
          load: { id, loadNumber: "LP-DEMO-21", status: "IN_TRANSIT" },
          ownerAction: {
            type: "WAIT",
            priority: "NORMAL",
            label: "Load in transit",
            message: "Review paperwork as it arrives.",
          },
          timeline: [],
        },
      }),
    );
    await page.route(`**/api/v1/money-opportunities/loads/${id}**`, (r) =>
      r.fulfill({
        json:
          r.request().method() === "POST"
            ? { createdCount: 0, opportunities: [] }
            : [],
      }),
    );
    await page.route(`**/api/v1/loads/${id}/broker-access`, (r) =>
      r.fulfill({ json: [] }),
    );
    await page.route(`**/api/v1/back-office/loads/${id}/requirements`, (r) =>
      r.fulfill({ json: { loadStatus: "DELIVERED", requirements } }),
    );
    await page.route("**/api/v1/documents/*/signatures", (r) =>
      r.fulfill({ json: { signatures: [] } }),
    );
    await page.route("**/api/v1/finance/overview?*", (r) =>
      r.fulfill({
        json: {
          revenue: "3450.00",
          expenses: "612.44",
          net: "2837.56",
          collected: "1000.00",
          outstanding: "2450.00",
          transactionCount: 3,
          recordedLoads: 1,
          averageRevenuePerLoad: "3450.00",
          revenuePerMile: null,
          costPerMile: null,
          profitPerMile: null,
          trend: [
            {
              month: "2026-09",
              revenue: "3450.00",
              expenses: "612.44",
              net: "2837.56",
            },
          ],
          categories: [
            { category: "Fuel", effect: "EXPENSE", amount: "612.44" },
          ],
          aging: [{ bucket: "Current", count: 1, amount: "2450.00" }],
        },
      }),
    );
    await page.route("**/api/v1/finance/transactions?*", (r) =>
      r.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 25 } }),
    );
    await page.route("**/api/v1/documents/vault*", (r) =>
      r.fulfill({ json: [] }),
    );
    await page.route("**/api/v1/back-office/queue", (r) =>
      r.fulfill({ json: [] }),
    );
    await page.route("**/api/v1/back-office/accounts-receivable", (r) =>
      r.fulfill({
        json: {
          generatedAt: stamp,
          summary: {
            outstanding: { amount: "0.00", count: 0 },
            dueSoon: { amount: "0.00", count: 0 },
            overdue: { amount: "0.00", count: 0 },
            paid: { amount: "0.00", count: 0 },
          },
          invoices: [],
        },
      }),
    );
    const issues: string[] = [];
    async function capture(name: string, fullPage = true) {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: path.join(dir, `${name}-${width}.png`),
        fullPage,
        animations: "disabled",
      });
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        )
      )
        issues.push(name);
    }
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await capture("login");
    await page.getByLabel("Email", { exact: true }).fill("owner@example.com");
    await page
      .getByLabel("Password", { exact: true })
      .fill("local-fixture-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "LP-DEMO-21", exact: true }),
    ).toBeVisible();
    await capture("dashboard");
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Loads", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Recent Loads" }),
    ).toBeInViewport();
    await capture("loads", false);
    for (const [name, url, ready] of [
      ["load-detail", `/loads/${id}`, "LP-DEMO-21"],
      ["smart-intake", "/loads/new", "Create New Load"],
      ["review", `/back-office/loads/${id}/review`, "Load Paperwork"],
      ["finance", "/finance", "Finance"],
      ["drivers", "/drivers", "Drivers"],
      ["documents", "/documents", "Documents"],
      ["company", "/settings/company", "Company Profile"],
      ["back-office", "/back-office", "Delivered Loads"],
      [
        "receivables",
        "/back-office/accounts-receivable",
        "Accounts Receivable",
      ],
    ]) {
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        ready,
      );
      await expect(page.getByText(/^Loading/)).toHaveCount(0);
      if (name === "review")
        await expect(
          page.getByRole("button", { name: "Accept POD", exact: true }),
        ).toBeEnabled();
      if (name === "finance")
        await expect(
          page.getByLabel("Primary financial metrics").getByRole("link"),
        ).toHaveCount(4);
      await capture(name);
    }
    writeFileSync(
      path.join(dir, `overflow-${width}.json`),
      JSON.stringify(issues),
    );
    if (phase === "after")
      expect(issues, "Screens with horizontal page overflow").toEqual([]);
  });
