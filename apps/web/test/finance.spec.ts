import { expect, test, type Page } from "@playwright/test";
const id = "a0000000-0000-4000-8000-000000000001";
const record = {
  id,
  date: "2026-09-15",
  type: "EXPENSE",
  effect: "EXPENSE",
  category: "Fuel",
  amount: "612.44",
  description: "Fictional diesel",
  source: "MANUAL",
  status: "POSTED",
  loadId: null,
  loadNumber: null,
  driverId: null,
  driverName: null,
  brokerName: null,
  documentId: null,
  importBatchId: null,
  importRowNumber: null,
  sourceColumn: null,
  historicalLoadId: null,
};
const overview = {
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
  categories: [{ category: "Fuel", effect: "EXPENSE", amount: "612.44" }],
  aging: [{ bucket: "Current", count: 1, amount: "2450.00" }],
};
test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/finance/transactions?*", (r) =>
    r.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 25 } }),
  );
});
async function login(page: Page, role = "owner") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(`${role}@example.com`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
test("missing Finance schema explains setup without offering broken mutations and recovers after setup", async ({
  page,
}) => {
  let enabled = false;
  await page.route("**/api/v1/finance/overview?*", (r) =>
    r.fulfill(
      enabled
        ? { json: overview }
        : {
            status: 503,
            json: {
              statusCode: 503,
              code: "FINANCE_SETUP_REQUIRED",
              message: "Private database error must not be rendered",
            },
          },
    ),
  );
  await login(page);
  await page.goto("/finance");
  await expect(
    page.getByRole("heading", { name: "Finance setup required" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Finance is not enabled in this environment yet. Contact your administrator to complete setup.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "+ Add Transaction", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Import Spreadsheet", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Open Accounts Receivable" }),
  ).toHaveAttribute("href", "/back-office/accounts-receivable");
  await expect(
    page.getByText("Private database error must not be rendered"),
  ).toHaveCount(0);
  enabled = true;
  await page.getByRole("button", { name: "Check setup" }).click();
  await expect(
    page.getByRole("heading", { name: "Finance & Records" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recorded Revenue" }).locator(".."),
  ).toContainText("$3,450.00");
});
test("Finance displays real API totals, accessible chart, annual tax period and empty state", async ({
  page,
}) => {
  await page.route("**/api/v1/finance/overview?*", (r) =>
    r.fulfill({ json: overview }),
  );
  await login(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Finance", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Finance & Records" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Net Operating Result" }).locator(".."),
  ).toContainText("$2,837.56");
  await expect(
    page.getByRole("img", { name: /Monthly recorded/ }),
  ).toBeVisible();
  await expect(page.getByText("Insufficient recorded data")).toHaveCount(2);
  await expect(
    page
      .locator("details")
      .filter({
        has: page.locator("summary", { hasText: "Per-mile metrics" }),
      }),
  ).not.toHaveAttribute("open");
  await page.screenshot({
    path: "test-results/finance-overview.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Tax Center", exact: true }).click();
  await expect(page).toHaveURL(/from=\d{4}-01-01&to=\d{4}-12-31/);
  await expect(page.getByText(/not a tax return/)).toBeVisible();
  await page.route("**/api/v1/finance/transactions?*", (r) =>
    r.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 25 } }),
  );
  await page.getByRole("link", { name: "Transactions", exact: true }).click();
  await expect(
    page.getByText("No financial records match this period and filters."),
  ).toBeVisible();
});

test("overview keeps financial context, real attention buckets and source links on mobile", async ({
  page,
}) => {
  await page.route("**/api/v1/finance/overview?*", (r) =>
    r.fulfill({
      json: {
        ...overview,
        net: "-100.25",
        trend: [
          {
            month: "2026-09",
            revenue: "-100.25",
            expenses: "0.00",
            net: "-100.25",
          },
        ],
        aging: [
          { bucket: "1–30", count: 2, amount: "2000.00" },
          { bucket: "Due date missing", count: 1, amount: "450.00" },
        ],
      },
    }),
  );
  await page.route("**/api/v1/finance/transactions?*", (r) =>
    r.fulfill({ json: { items: [record], total: 1, page: 1, pageSize: 25 } }),
  );
  await login(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/finance?from=2026-09-01&to=2026-09-30");
  await expect(
    page.getByLabel("Primary financial metrics").getByRole("link"),
  ).toHaveCount(4);
  await expect(
    page.getByRole("heading", { name: "Net Operating Result" }).locator(".."),
  ).toContainText("-$100.25");
  await expect(
    page
      .getByRole("heading", { name: "Current Outstanding A/R" })
      .locator(".."),
  ).toContainText("All dates");
  await expect(
    page.getByRole("region", { name: "Needs attention" }),
  ).toContainText("1–30 days overdue");
  await expect(
    page.getByRole("region", { name: "Needs attention" }),
  ).toContainText("$450.00");
  await expect(
    page.getByRole("link", { name: "Fictional diesel" }),
  ).toHaveAttribute("href", `/finance/transactions/${id}`);
  await expect(page.getByText("Source: Manual", { exact: true })).toBeVisible();
  await page
    .getByText("View exact monthly values and net", { exact: true })
    .click();
  await expect(
    page.getByRole("table", { name: "Monthly recorded amounts in USD" }),
  ).toContainText("-$100.25");
  const chart = page.getByRole("img", { name: /Monthly recorded/ });
  expect((await chart.boundingBox())!.height).toBeLessThanOrEqual(225);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/finance-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: /^Recorded Expenses / }).click();
  await expect(page).toHaveURL(
    /section=transactions&from=2026-09-01&to=2026-09-30/,
  );
  await expect(
    page.getByRole("link", { name: "Fictional diesel" }),
  ).toBeVisible();
});

test("date presets retain transaction filters and overview survives a recent-activity failure", async ({
  page,
}) => {
  await page.route("**/api/v1/finance/overview?*", (r) =>
    r.fulfill({ json: overview }),
  );
  await login(page);
  await page.goto(
    "/finance?section=transactions&type=EXPENSE&category=Fuel&page=2",
  );
  await page.getByLabel("Period preset").selectOption("lastMonth");
  await expect(page).toHaveURL(/type=EXPENSE/);
  await expect(page).toHaveURL(/category=Fuel/);
  await expect(page).not.toHaveURL(/page=2/);
  await expect(page.getByLabel("Period preset")).toHaveValue("lastMonth");
  await page.route("**/api/v1/finance/transactions?*", (r) =>
    r.fulfill({ status: 500, json: { message: "private database text" } }),
  );
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(
    page.getByText(
      "Recent activity is unavailable. Open Transactions to retry.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recorded Revenue" }).locator(".."),
  ).toContainText("$3,450.00");
  await expect(page.getByText("private database text")).toHaveCount(0);
});
test("manual entry submits decimal strings, reloads ledger and presents a safe error", async ({
  page,
}) => {
  let saved = false;
  await page.route("**/api/v1/finance/transactions?*", (r) =>
    r.fulfill({
      json: {
        items: saved ? [record] : [],
        total: saved ? 1 : 0,
        page: 1,
        pageSize: 25,
      },
    }),
  );
  await page.route("**/api/v1/finance/lookups", (r) =>
    r.fulfill({ json: { loads: [], drivers: [], documents: [] } }),
  );
  await page.route("**/api/v1/finance/categories", (r) =>
    r.fulfill({ json: { income: ["Linehaul"], expense: ["Fuel"] } }),
  );
  await page.route("**/api/v1/finance/transactions", async (r) => {
    const body = r.request().postDataJSON() as Record<string, string>;
    expect(body.amount).toBe("612.44");
    expect(body.category).toBe("Fuel");
    expect(body.idempotencyKey).toMatch(/^[\da-f-]{36}$/);
    saved = true;
    await r.fulfill({ status: 201, json: record });
  });
  await login(page);
  await page.goto("/finance?section=transactions");
  await page
    .getByRole("button", { name: "+ Add Transaction", exact: true })
    .click();
  const form = page.getByRole("form", { name: "Add financial transaction" });
  await form.getByLabel("Amount (USD)").fill("612.44");
  await form
    .getByLabel("Description", { exact: true })
    .fill("Fictional diesel");
  await form.getByRole("button", { name: "Save Transaction" }).click();
  await expect(
    page.getByRole("link", { name: "Fictional diesel" }),
  ).toBeVisible();
  await page.route("**/api/v1/finance/overview?*", (r) =>
    r.fulfill({
      status: 500,
      json: { message: "Internal database text should not be shown" },
    }),
  );
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Finance is temporarily unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByText("Internal database text should not be shown"),
  ).toHaveCount(0);
});
test("import wizard requires preview and explicit confirmation, preserves mapping and source", async ({
  page,
}) => {
  let confirms = 0;
  const batch = {
    id,
    fileName: "fictional.csv",
    fileChecksum: "a".repeat(64),
    status: "DRAFT",
    revision: 0,
    headers: ["Trip", "Broker", "Date", "Gross"],
    columnMapping: {
      loadNumber: "Trip",
      brokerName: "Broker",
      deliveryDate: "Date",
      grossRevenue: "Gross",
    },
    counts: { total: 1 },
    createdAt: "2026-09-20T10:00:00Z",
    completedAt: null,
  };
  await page.route("**/api/v1/finance/categories", (r) =>
    r.fulfill({
      json: {
        importFields: [
          "loadNumber",
          "brokerName",
          "deliveryDate",
          "grossRevenue",
        ],
      },
    }),
  );
  await page.route("**/api/v1/finance/imports", (r) =>
    r.fulfill({ json: r.request().method() === "POST" ? batch : [] }),
  );
  await page.route("**/api/v1/finance/imports/" + id, (r) =>
    r.fulfill({ json: batch }),
  );
  const preview = {
    ...batch,
    status: "PREVIEWED",
    revision: 1,
    counts: { total: 1, VALID: 0, WARNING: 1, INVALID: 0, DUPLICATE: 0 },
    rows: [
      {
        rowNumber: 2,
        status: "WARNING",
        normalizedData: {
          loadNumber: "HIST-1",
          brokerName: "Fictional",
          deliveryDate: "2026-09-20",
          grossRevenue: "3450.00",
        },
        issues: ["Payment status is unknown."],
      },
    ],
  };
  await page.route(
    "**/api/v1/finance/imports/" + id + "/preview",
    async (r) => {
      expect(
        (r.request().postDataJSON() as { mapping: object }).mapping,
      ).toEqual(batch.columnMapping);
      await r.fulfill({ json: preview });
    },
  );
  await page.route(
    "**/api/v1/finance/imports/" + id + "/confirm",
    async (r) => {
      confirms++;
      expect(r.request().postDataJSON()).toEqual({
        revision: 1,
        acceptWarnings: true,
        skipInvalidRows: false,
      });
      await r.fulfill({
        json: {
          ...preview,
          status: "CONFIRMED",
          counts: { ...preview.counts, imported: 1 },
        },
      });
    },
  );
  await login(page);
  await page.goto("/finance/imports");
  await page.getByLabel("Choose CSV or XLSX").setInputFiles({
    name: "fictional.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Trip,Broker,Date,Gross\nHIST-1,Fictional,2026-09-20,3450.00",
    ),
  });
  await page.getByRole("button", { name: "Upload for Review" }).click();
  await expect(
    page.getByText("File uploaded. No financial records have been created."),
  ).toBeVisible();
  expect(confirms).toBe(0);
  await expect(page.getByLabel("load Number")).toHaveValue("Trip");
  await page.getByRole("button", { name: "Validate & Preview" }).click();
  await expect(
    page.getByText("Payment status is unknown.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm Import", exact: true })
    .click();
  expect(confirms).toBe(0);
  await page.getByLabel("I reviewed and accept the warning rows.").check();
  await page
    .getByLabel("I confirm these historical financial records are accurate.")
    .check();
  await page
    .getByRole("button", { name: "Confirm Import", exact: true })
    .click();
  await expect(
    page.getByText("Historical financial records imported.", { exact: false }),
  ).toBeVisible();
  expect(confirms).toBe(1);
  await expect(
    page.getByRole("link", { name: "View imported transactions" }),
  ).toHaveAttribute("href", /importBatchId=/);
});
test("transaction correction appends a signed difference and keeps source visible", async ({
  page,
}) => {
  await page.route("**/api/v1/finance/transactions/" + id, (r) =>
    r.fulfill({
      json: {
        record,
        entry: {
          memo: null,
          vendorName: "Example fuel",
          correctionOfId: null,
          createdAt: "2026-09-15",
          createdBy: { firstName: "Demo", lastName: "Owner" },
        },
        batch: null,
        audit: [],
      },
    }),
  );
  let submitted = false;
  await page.route("**/api/v1/finance/transactions", async (r) => {
    const body = r.request().postDataJSON() as Record<string, string>;
    expect(body.amount).toBe("-12.44");
    expect(body.correctionOfId).toBe(id);
    expect(body.type).toBe("ADJUSTMENT");
    expect(body.memo).toBe("Correct duplicate charge");
    submitted = true;
    await r.fulfill({ json: { id } });
  });
  await login(page);
  await page.goto("/finance/transactions/" + id);
  await expect(
    page.getByRole("heading", { name: "Fictional diesel" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Record Correction" }).click();
  await page.getByLabel("Adjustment amount (USD)").fill("-12.44");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Correct duplicate charge");
  await page.getByRole("button", { name: "Save Correction" }).click();
  await expect(
    page.getByRole("button", { name: "Save Correction" }),
  ).toHaveCount(0);
  expect(submitted).toBe(true);
});
test("dispatcher cannot enter Finance or see its navigation", async ({
  page,
}) => {
  await login(page, "dispatcher");
  await expect(
    page
      .getByRole("navigation")
      .getByRole("link", { name: "Finance", exact: true }),
  ).toHaveCount(0);
  await page.goto("/finance");
  await expect(
    page.getByRole("heading", { name: "Finance & Records" }),
  ).toHaveCount(0);
});
