import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { parseRateConDraft } from "../src/lib/api/ratecon-draft";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("owner@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("real sample PDF upload → extraction → review → confirm → created load GET", async ({
  page,
  request,
}, testInfo) => {
  await login(page);
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (
      !/^\/api\/v1\/(?:documents\/|loads(?:\/|$)|owner\/loads\/|money-opportunities\/)/.test(
        url.pathname,
      )
    )
      return route.continue();
    url.port = "3102";
    await route.continue({
      url: url.href,
      headers: {
        ...route.request().headers(),
        authorization: "Bearer ratecon-browser-owner",
      },
    });
  });
  await page.goto("/loads/new");
  await page
    .locator("input[type=file]")
    .setInputFiles(path.resolve("../api/test/fixtures/ratecon-brf-94726.pdf"));
  const draftResponse = page.waitForResponse((r) =>
    r.url().endsWith("/intelligence"),
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const response = await draftResponse;
  expect(response.status()).toBe(201);
  const documentId = new URL(response.url()).pathname.split("/").at(-2)!;
  const draft = parseRateConDraft(await response.json(), documentId);
  for (const missing of [
    "loadNumber",
    "pickup",
    "delivery",
    "extraction",
    "requirements",
  ]) {
    expect(() =>
      parseRateConDraft({ ...draft, [missing]: undefined }, documentId),
    ).toThrow("Some required load information is missing or invalid.");
  }
  expect(draft.extraction.pageCount).toBe(2);
  expect(draft).toMatchObject({
    loadNumber: "BRF-94726",
    brokerName: "BlueRiver Freight Brokerage LLC",
    brokerContact: "Melissa Grant",
    equipment: "53 ft Dry Van",
    currency: "",
    linehaul: "3250.00",
    fuelSurcharge: "200.00",
    totalRate: "",
  });
  expect(draft.pickup).toMatchObject({
    facilityName: "Midwest Food Products Distribution Center",
    address: "2400 Enterprise Ave, St. Louis, MO 63147",
    date: "September 28, 2026",
    appointment: "8:00 AM CDT",
    referenceNumber: "PU-882451",
  });
  expect(draft.delivery).toMatchObject({
    facilityName: "Lone Star Retail Distribution Center",
    address: "8800 Logistics Pkwy, Dallas, TX 75241",
    date: "September 29, 2026",
    appointment: "2:00 PM CDT",
    referenceNumber: "DEL-663921",
  });
  for (const type of ["BOL", "POD", "CARRIER_INVOICE"])
    expect(draft.requirements).toContainEqual({
      type,
      documentType: type,
      requirement: "REQUIRED",
      confidence: 0.98,
    });
  await expect(
    page.getByRole("heading", { name: "Review Your Load" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Load Number", exact: true }),
  ).toHaveValue("BRF-94726");
  const pickup = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Pickup", exact: true }),
  });
  const delivery = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Delivery", exact: true }),
  });
  await expect(
    pickup.getByRole("textbox", { name: "Appointment", exact: true }),
  ).toHaveValue("September 28, 2026 8:00 AM CDT");
  await expect(
    delivery.getByRole("textbox", { name: "Appointment", exact: true }),
  ).toHaveValue("September 29, 2026 2:00 PM CDT");
  const createdResponse = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith("/api/v1/loads"),
  );
  await page.screenshot({
    path: testInfo.outputPath("review.png"),
    fullPage: true,
  });
  // B3 intentionally leaves ambiguous money/currency for human confirmation.
  expect(draft.intelligence?.fields.totalRate.uncertainty).toBe("CONFLICT");
  await page.getByLabel("Total Rate", { exact: true }).fill("3450.00");
  await page.getByLabel("Confirmed currency").selectOption("USD");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm & Create Load" }).click();
  const created = await createdResponse;
  expect(created.status()).toBe(201);
  const body = (await created.json()) as { load: { id: string } };
  await expect(page).toHaveURL(new RegExp(`/loads/${body.load.id}$`));
  const loaded = await request.get(
    `http://127.0.0.1:3102/api/v1/loads/${body.load.id}`,
    { headers: { authorization: "Bearer ratecon-browser-owner" } },
  );
  expect(loaded.status()).toBe(200);
  const result = await loaded.json();
  await testInfo.attach("ratecon-extraction-and-created-load", {
    body: JSON.stringify({ draft, createdLoad: result }, null, 2),
    contentType: "application/json",
  });
  expect(result).toMatchObject({
    loadNumber: "BRF-94726",
    equipment: "53 ft Dry Van",
    linehaul: expect.stringMatching(/^3250(?:\.0{1,2})?$/),
    fuelSurcharge: expect.stringMatching(/^200(?:\.0{1,2})?$/),
    totalRate: expect.stringMatching(/^3450(?:\.0{1,2})?$/),
  });
  expect(result.stops).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "PICKUP",
        address: "2400 Enterprise Ave, St. Louis, MO 63147",
        appointmentText: "September 28, 2026 8:00 AM CDT",
      }),
      expect.objectContaining({
        type: "DELIVERY",
        address: "8800 Logistics Pkwy, Dallas, TX 75241",
        appointmentText: "September 29, 2026 2:00 PM CDT",
      }),
    ]),
  );
});

for (const malformed of [
  null,
  { draft: { loadNumber: "BRF-94726" } },
  { loadNumber: "BRF-94726" },
]) {
  test(`invalid draft shows actionable error: ${JSON.stringify(malformed)}`, async ({
    page,
  }) => {
    await login(page);
    await page.route("**/ratecon-draft", (route) =>
      route.fulfill({
        status: 201,
        body: JSON.stringify(malformed),
        contentType: "application/json",
      }),
    );
    await page.goto("/loads/new/review/00000000-0000-4000-8000-000000000101");
    await expect(
      page.getByText("Some required load information is missing or invalid.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Try another RateCon" }),
    ).toHaveAttribute("href", "/loads/new");
    await expect(
      page.getByText("Cannot read properties", { exact: false }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Confirm & Create Load" }),
    ).toHaveCount(0);
  });
}
