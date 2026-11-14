import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

test("real isolated API: prepare, review, approve, partial/final payment and immutable adjustment", async ({
  page,
}) => {
  const fixture = JSON.parse(
    await readFile(
      path.resolve("../../test-results/settlements/browser-fixture.json"),
      "utf8",
    ),
  ) as { driverId: string; loadId: string; loadNumber: string };
  let dropFirstPreparedResponse = true;
  await page.route("**/api/v1/finance/**", async (route) => {
    const original = new URL(route.request().url());
    const response = await route.fetch({
      url: `http://127.0.0.1:3103${original.pathname}${original.search}`,
      headers: { ...route.request().headers(), authorization: "Bearer owner" },
    });
    if (
      dropFirstPreparedResponse &&
      original.pathname.endsWith("/settlements") &&
      route.request().method() === "POST" &&
      response.ok()
    ) {
      dropFirstPreparedResponse = false;
      await route.abort("failed");
      return;
    }
    await route.fulfill({ response });
  });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("owner@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("/");
  await page.goto("/finance/settlements");
  await expect(page.getByText("No settlements prepared yet.")).toBeVisible();
  await page
    .getByRole("button", { name: "Prepare settlement", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Driver", exact: true })
    .selectOption(fixture.driverId);
  await page.getByLabel("Period start").fill("2026-10-01");
  await page.getByLabel("Period end").fill("2026-10-31");
  await page.getByRole("button", { name: "Find completed work" }).click();
  await page
    .getByRole("checkbox", { name: new RegExp(fixture.loadNumber) })
    .check();
  await page.getByLabel("Amount USD", { exact: true }).fill("100.00");
  await page.getByRole("button", { name: "Add bonus" }).click();
  await page
    .getByLabel("Description", { exact: true })
    .nth(1)
    .fill("Reviewed bonus");
  await page.getByLabel("Amount USD", { exact: true }).nth(1).fill("0.25");
  await expect(page.getByText(/Preview · .*net: \$100.25/)).toBeVisible();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByRole("button", { name: "Mark reviewed", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Approve and freeze statement" })
    .click();
  const detail = page.getByRole("region", { name: "Settlement details" });
  await expect(
    detail.getByRole("button", { name: "Download statement" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download statement" }).click();
  expect((await download).suggestedFilename()).toMatch(/^Settlement-.*\.pdf$/);
  await page.getByLabel("Payment amount USD").fill("40.00");
  await page.getByLabel("Payment date").fill("2026-10-20");
  await page
    .getByLabel("Reference", { exact: true })
    .fill("Synthetic partial transfer");
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await expect(
    detail.getByRole("heading", { name: "Payment history · PARTIALLY_PAID" }),
  ).toBeVisible();
  await page.getByLabel("Payment amount USD").fill("60.25");
  await page
    .getByLabel("Reference", { exact: true })
    .fill("Synthetic final transfer");
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await expect(
    detail.getByRole("heading", { name: "Payment history · PAID" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Prepare adjustment", exact: true })
    .click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("Additional reviewed compensation");
  await page.getByLabel("Amount USD", { exact: true }).fill("10.00");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByRole("button", { name: "Mark reviewed", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Approve and freeze statement" })
    .click();
  await expect(
    detail.getByRole("button", { name: "Download statement" }),
  ).toBeVisible();
  await expect(
    detail.getByRole("button", { name: "Edit compensation" }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../../test-results/settlements/mobile-width.png",
    fullPage: true,
  });
});
