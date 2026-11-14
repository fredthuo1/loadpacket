import { test, expect } from "@playwright/test";
const token = "test-only-broker-token-placeholder-not-a-credential";
test("public broker page works logged out, uses header token and clears fragment", async ({
  page,
}) => {
  let authenticatedCalls = 0;
  await page.route("**/api/v1/me", (route) => {
    authenticatedCalls++;
    return route.fulfill({ status: 401 });
  });
  await page.route("**/api/v1/external/transactions", (route) => {
    expect(route.request().headers()["x-broker-token"]).toBe(token);
    expect(route.request().url()).not.toContain(token);
    return route.fulfill({
      json: {
        summary: {
          carrier: "Test Carrier",
          loadNumber: "REG-BROKER",
          status: "DELIVERED",
          equipment: "Van",
        },
        route: [
          {
            sequence: 1,
            type: "PICKUP",
            address: "Chicago, IL",
            facilityName: "Origin",
          },
        ],
        documents: [],
        documentStatus: [{ type: "POD", status: "RECEIVED" }],
        agreements: [],
        timeline: [],
      },
    });
  });
  await page.goto(`/broker/t#${token}`);
  await expect(
    page.getByRole("heading", { name: "Load REG-BROKER" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/broker\/t$/);
  await expect(page.getByText("POD — RECEIVED")).toBeVisible();
  expect(authenticatedCalls).toBe(0);
  await expect(page.getByRole("navigation")).toHaveCount(0);
});
test("expired, revoked or unknown broker link shows generic unavailable state", async ({
  page,
}) => {
  await page.route("**/api/v1/external/transactions", (route) =>
    route.fulfill({ status: 404, json: { message: "Unavailable" } }),
  );
  await page.goto(`/broker/t#${token}`);
  await expect(page.locator('main [role="alert"]')).toContainText(
    "Ask the carrier",
  );
  await expect(
    page.getByRole("heading", { name: "Shared Load" }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/broker/t");
});
