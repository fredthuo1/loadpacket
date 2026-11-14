import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test("carrier registration, real staff administration, recovery and narrow-screen acceptance", async ({
  page,
  browser,
  request,
}) => {
  const owner = `owner-${randomUUID()}@example.invalid`,
    office = `office-${randomUUID()}@example.invalid`;
  const password = "Fictional-only-123!",
    updated = "Fictional-updated-456!";
  const noOverflow = async () =>
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/auth/register");
  await page.getByLabel("Email", { exact: true }).fill(owner);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Set up your organization" }),
  ).toBeVisible();
  await page.getByLabel("First name", { exact: true }).fill("Fictional");
  await page.getByLabel("Last name", { exact: true }).fill("Owner");
  await page
    .getByLabel("Legal company name", { exact: true })
    .fill("Fictional Browser Carrier");
  await noOverflow();
  await page
    .getByRole("button", { name: "Create organization", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Company Profile", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Legal Company Name")
    .fill("Fictional Browser Carrier Updated");
  await page.getByLabel("Default Payment Terms Days").fill("14");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Company profile saved.")).toBeVisible();
  await noOverflow();
  await page.goto("/settings/team");
  await expect(
    page.getByRole("heading", { name: "Team & Access" }),
  ).toBeVisible();
  await page.getByLabel("Invitee email").fill(office);
  await page.getByRole("button", { name: "Create invitation link" }).click();
  const link = await page.getByLabel("Shareable invitation link").inputValue();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: office })
      .getByText(/^PENDING/),
  ).toBeVisible();
  await noOverflow();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const staff = await context.newPage();
  await staff.goto(link);
  await staff
    .getByRole("button", { name: "Need an account? Register" })
    .click();
  await staff.getByLabel("Email", { exact: true }).fill(office);
  await staff.getByLabel("Password", { exact: true }).fill(password);
  await staff.getByLabel("Confirm password", { exact: true }).fill(password);
  await staff
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    staff.getByText(/Fictional Browser Carrier Updated · Back Office/),
  ).toBeVisible();
  await staff.getByLabel("First name", { exact: true }).fill("Fictional");
  await staff.getByLabel("Last name", { exact: true }).fill("Staff");
  await staff
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await expect(staff).toHaveURL(/\/back-office$/);
  await page.reload();
  const member = page
    .getByRole("row")
    .filter({
      has: page.getByRole("combobox", {
        name: `Role for ${office}`,
        exact: true,
      }),
    });
  await member.getByRole("combobox").selectOption("DISPATCHER");
  await member.getByRole("button", { name: "Save role" }).click();
  await expect(page.getByRole("status")).toContainText("Access change saved");
  await member.getByRole("button", { name: "Revoke access" }).click();
  await expect(member.getByText("Revoked", { exact: true })).toBeVisible();
  await staff.reload();
  await expect(
    staff.getByRole("heading", { name: "Account unavailable" }),
  ).toBeVisible();
  await context.close();
  const ownRow = page
    .getByRole("row")
    .filter({
      has: page.getByRole("combobox", {
        name: `Role for ${owner}`,
        exact: true,
      }),
    });
  await ownRow.getByRole("button", { name: "Revoke access" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "final Owner" })).toBeVisible();
  await noOverflow();
  await page.goto("/auth/forgot");
  await page.getByLabel("Email", { exact: true }).fill(owner);
  await page.getByRole("button", { name: "Request recovery" }).click();
  await expect(page.getByRole("status")).toContainText(
    "does not confirm an account exists or that delivery occurred",
  );
  await noOverflow();
  const recovery = (await (
    await request.get("http://127.0.0.1:3104/test/recovery")
  ).json()) as { requested: boolean; code: string; redirect: string };
  expect(recovery.requested).toBe(true);
  expect(recovery.redirect).toBe(
    "http://127.0.0.1:3100/auth/callback?next=/auth/reset",
  );
  // Provider boundary supplies a synthetic code; real PKCE callback exchanges it using the browser's verifier cookie.
  await page.goto(
    `${recovery.redirect}&code=${encodeURIComponent(recovery.code)}`,
  );
  await expect(
    page.getByRole("heading", { name: "Reset your password" }),
  ).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill(updated);
  await page.getByLabel("Confirm password", { exact: true }).fill(updated);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("status")).toContainText("Password updated");
  await page.getByRole("link", { name: "Return to sign in" }).click();
  await page.getByLabel("Email", { exact: true }).fill(owner);
  await page.getByLabel("Password", { exact: true }).fill(updated);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$|\/owner$|\/$/);
  await page.goto("/settings/team");
  await expect(
    page.getByRole("heading", { name: "Team & Access" }),
  ).toBeVisible();
  await noOverflow();
});
