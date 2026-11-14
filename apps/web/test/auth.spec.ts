import { test, expect } from "@playwright/test";

test("protected pages redirect anonymous visitors", async ({ page }) => {
  for (const path of [
    "/",
    "/driver",
    "/back-office",
    "/back-office/accounts-receivable",
    "/loads/unknown",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

for (const role of ["owner", "driver"]) {
  test(`${role} login, bearer requests, session refresh and logout`, async ({
    page,
  }) => {
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/"))
        apiRequests.push(request.headers()["authorization"] ?? "");
    });
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(`${role}@example.com`);
    await page
      .getByLabel("Password", { exact: true })
      .fill("local-fixture-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(
      role === "owner" ? "http://127.0.0.1:3100/" : /\/driver$/,
    );
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    expect(apiRequests.length).toBeGreaterThan(1);
    expect(apiRequests.every((header) => header.startsWith("Bearer "))).toBe(
      true,
    );
    if (role === "driver") {
      await expect(
        page.getByText("Driver Preview", { exact: true }),
      ).toHaveCount(0);
      await page.goto("/back-office");
      await expect(page).toHaveURL(/\/driver$/);
    }
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/driver");
    await expect(page).toHaveURL(/\/login$/);
  });
}

test("shows authentication errors without leaving login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("owner@example.com");
  await page.getByLabel("Password", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator('form [role="alert"]')).toContainText(
    "Invalid login credentials",
  );
  await expect(page).toHaveURL(/\/login$/);
});
