import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const password = "Fictional-screen-123!";
async function register(page: Page, email: string) {
  await page.goto("/auth/register");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
}

test("signup validation, visibility, verification callback and company setup", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const email = `verify-${randomUUID()}@example.invalid`;
  await page.goto("/login");
  await page.getByRole("link", { name: "Start a carrier account" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("Different-only-123!");
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page
    .getByRole("button", { name: "Hide password", exact: true })
    .press("Enter");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "Passwords must match.",
  );
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("provider email");
  await expect(
    page.getByRole("button", { name: "Create organization", exact: true }),
  ).toHaveCount(0);
  const confirmation = await (
    await request.get("http://127.0.0.1:3104/test/confirmation")
  ).json();
  await page.goto(
    `${confirmation.redirect}&code=${encodeURIComponent(confirmation.code)}`,
  );
  await expect(page.getByText("Step 1 of 2", { exact: false })).toBeVisible();
  await page.getByLabel("First name", { exact: true }).fill("Fictional");
  await page.getByLabel("Last name", { exact: true }).fill("Owner");
  await page
    .getByLabel("Legal company name", { exact: true })
    .fill("Verified Fictional Carrier");
  await page
    .getByRole("button", { name: "Create organization", exact: true })
    .click();
  await expect(page.getByLabel("Legal Company Name")).toHaveValue(
    "Verified Fictional Carrier",
  );
  await page.getByLabel("Default Payment Terms Days").fill("0");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Company profile saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Default Payment Terms Days")).toHaveValue("0");
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await page.goto("/login");
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
});

test("failed eligibility hides provisioning and can retry", async ({
  page,
}) => {
  let failed = true;
  await page.route("**/api/v1/auth/account", async (route) => {
    if (failed)
      await route.fulfill({
        status: 503,
        json: { message: "Account check temporarily unavailable." },
      });
    else await route.continue();
  });
  await register(page, `retry-${randomUUID()}@example.invalid`);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Create organization", exact: true }),
  ).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Retry account check" }).click();
  await expect(
    page.getByRole("button", { name: "Create organization", exact: true }),
  ).toBeVisible();
});

test("invalid callbacks, recovery and staff links provide safe exits", async ({
  page,
}) => {
  await page.goto("/auth/callback?code=expired&next=https://example.invalid");
  await expect(page).toHaveURL(/\/auth\/start\?error=invalid$/);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "invalid or expired",
  );
  await expect(
    page.getByRole("button", { name: "Create organization", exact: true }),
  ).toHaveCount(0);
  await page.goto("/auth/reset?error=invalid");
  await page.getByRole("link", { name: "Request a new recovery link" }).click();
  await page
    .getByLabel("Email", { exact: true })
    .fill("absent@example.invalid");
  await page.getByRole("button", { name: "Request recovery" }).click();
  await expect(page.getByRole("status")).toContainText(
    "does not confirm an account exists",
  );
  await page.goto("/auth/staff#token=bad");
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
});

for (const width of [390, 768, 1440]) {
  test(`public access screens fit ${width}px with keyboard labels`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/login",
      "/auth/register",
      "/auth/forgot",
      "/auth/reset?error=invalid",
      "/auth/start?error=invalid",
      "/auth/invite?error=invalid",
      "/auth/staff",
    ]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const first = page
        .locator("input:visible,button:visible,a:visible")
        .first();
      await first.focus();
      await expect(first).toBeFocused();
      await expect(first).toHaveCSS("outline-style", "solid");
    }
  });
}
