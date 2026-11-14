import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, role = "owner") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(`${role}@example.com`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}
test("owner edits company profile and changes survive refresh", async ({
  page,
}) => {
  await login(page);
  await page
    .getByRole("link", { name: "Company Settings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Company Profile", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Legal Company Name").fill("D7A Updated Carrier");
  await page.getByLabel("Default Payment Terms Days").fill("45");
  await page.getByLabel("City", { exact: true }).fill("Chicago");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Company profile saved.",
  );
  await page.reload();
  await expect(page.getByLabel("Legal Company Name")).toHaveValue(
    "D7A Updated Carrier",
  );
  await expect(page.getByLabel("Default Payment Terms Days")).toHaveValue("45");
});
test("owner adds, edits, deactivates, filters and reactivates a driver", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Drivers", exact: true }).click();
  await expect(page.getByText("Marcus Reed", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "+ Add Driver" }).click();
  await page.getByLabel("First Name").fill("D7A");
  await page.getByLabel("Last Name").fill("Test Driver");
  await page.getByLabel("Email", { exact: true }).fill("d7a-ui@example.com");
  await page.getByLabel("CDL Number").fill("TEST-123");
  await page.getByLabel("CDL State").fill("IL");
  await page.getByLabel("CDL Expiration").fill("2028-02-29");
  await page.getByRole("button", { name: "Add Driver", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Driver added successfully.",
  );
  await expect(
    page.getByText("Account: Not connected", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Phone", { exact: true }).fill("555-0107");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("555-0107", { exact: true })).toBeVisible();
  await expect(page.getByText("2028-02-29", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Driver deactivated.");
  await page.getByRole("link", { name: "Back to Drivers" }).click();
  await page.getByLabel("Search drivers").fill("d7a-ui@example.com");
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("INACTIVE");
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", { name: "D7A Test Driver", exact: true }),
    })
    .click();
  await page.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Driver activated.");
  await page.goto("/drivers/new");
  await page.getByLabel("First Name").fill("Duplicate");
  await page.getByLabel("Last Name").fill("Driver");
  await page.getByLabel("Email", { exact: true }).fill("d7a-ui@example.com");
  await page.getByRole("button", { name: "Add Driver", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "already exists",
  );
});
test("Marcus shows account and history; active assignment blocks deactivation", async ({
  page,
}) => {
  await login(page);
  await page.goto("/drivers/22222222-2222-4222-8222-222222222222");
  await expect(
    page.getByText("Account: Connected", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recent Loads (1 total)" }),
  ).toBeVisible();
  await expect(page.getByText("D7A-ACTIVE", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "cannot be deactivated",
  );
  await expect(
    page.getByRole("button", { name: "Deactivate", exact: true }),
  ).toBeEnabled();
});
test("driver cannot open company or roster management", async ({ page }) => {
  await login(page, "driver");
  await expect(
    page.getByRole("link", { name: "Drivers", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Company Settings" }),
  ).toHaveCount(0);
  for (const path of ["/drivers", "/drivers/new", "/settings/company"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/driver$/);
  }
});
test("dispatcher can manage drivers but cannot open company settings", async ({
  page,
}) => {
  await login(page, "dispatcher");
  await page.getByRole("link", { name: "Drivers", exact: true }).click();
  await expect(page.getByRole("link", { name: "+ Add Driver" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Company Settings" }),
  ).toHaveCount(0);
  await page.goto("/settings/company");
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
});
test("mobile form fits the viewport and roster failures are readable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/drivers/new");
  await expect(page.getByLabel("First Name")).toBeVisible();
  await page.getByLabel("First Name").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Last Name")).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/day7a-mobile-form.png",
    fullPage: true,
  });
  await page.route("**/api/v1/drivers", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Driver roster is temporarily unavailable. Please retry.",
      }),
    }),
  );
  await page.goto("/drivers");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
});
