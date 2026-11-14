import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("owner@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
}

test("account check failure retries and an expired session returns to sign in", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/v1/me", (r) =>
    r.fulfill({
      status: 503,
      json: { message: "Account temporarily unavailable." },
    }),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Account unavailable" }),
  ).toBeVisible();
  await page.unroute("**/api/v1/me");
  await page.getByRole("button", { name: "Retry account check" }).click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await page.route("**/api/v1/**", (r) =>
    r.fulfill({ status: 401, json: { message: "Session expired" } }),
  );
  await page.route("**/auth/v1/token*", (r) =>
    r.fulfill({
      status: 400,
      json: { error_code: "refresh_token_not_found", msg: "Session expired" },
    }),
  );
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled();
});

for (const width of [390, 768, 1440])
  test(`company and settlement recovery/navigation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.route("**/api/v1/company", (r) =>
      r.fulfill({
        status: 503,
        json: { message: "Company temporarily unavailable." },
      }),
    );
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Company Settings" })
      .click();
    await expect(
      page.getByRole("button", { name: "Retry company profile" }),
    ).toBeVisible();
    await page.unroute("**/api/v1/company");
    await page.getByRole("button", { name: "Retry company profile" }).click();
    await expect(page.getByLabel("Legal Company Name")).toBeVisible();
    let failed = true;
    await page.route("**/api/v1/finance/settlements", (r) =>
      failed
        ? r.fulfill({ status: 503, json: { message: "Unavailable" } })
        : r.fulfill({ json: [] }),
    );
    await page.route("**/api/v1/finance/lookups", (r) =>
      r.fulfill({ json: { drivers: [] } }),
    );
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Settlements", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Retry settlements" }),
    ).toBeVisible();
    await expect(page.getByText("No settlements prepared yet.")).toHaveCount(0);
    failed = false;
    await page.getByRole("button", { name: "Retry settlements" }).click();
    await expect(page.getByText("No settlements prepared yet.")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Settlements", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page
        .getByRole("navigation")
        .getByRole("link", { name: "Finance", exact: true }),
    ).not.toHaveAttribute("aria-current", "page");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.goto("/loads/unknown/missing");
    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Return to your account" }).click();
    await expect(page).toHaveURL("http://127.0.0.1:3100/");
  });

test("manual load form creates a real synthetic load through Nest", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page);
  await page.route("**/api/v1/loads/manual", (route) =>
    route.continue({
      url: "http://127.0.0.1:3102/api/v1/loads/manual",
      headers: {
        ...route.request().headers(),
        authorization: "Bearer ratecon-browser-owner",
      },
    }),
  );
  await page.goto("/loads/new/manual");
  await page.getByRole("button", { name: "Create Load", exact: true }).click();
  await expect(page.getByText(/required|enter|missing/i).first()).toBeVisible();
  const number = `SCREEN-${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Load Number").fill(number);
  await page.getByLabel(/^Broker\s*\*?$/).fill("Fictional Broker");
  await page.getByLabel("Total Rate").fill("1200.00");
  for (const name of ["Pickup", "Delivery"]) {
    const section = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
    await section.getByLabel("Facility").fill(`Fictional ${name}`);
    await section.getByLabel("Address").fill("1 Fictional Road");
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const created = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith("/loads/manual"),
  );
  await page.getByRole("button", { name: "Create Load", exact: true }).click();
  expect((await created).status()).toBe(201);
  await expect(page).toHaveURL(/\/loads\/[0-9a-f-]+$/);
});
