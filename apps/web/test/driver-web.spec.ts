import { test, expect } from "@playwright/test";
import {
  api,
  auth,
  createLoad,
  fixture,
  json,
  login,
  manage,
  noOverflow,
  pdf,
  post,
} from "./b41-fixture";

test("isolated API: Driver stale reassignment, retry, stops, BOL/POD, duplicate commands and revocation", async ({
  page,
  request,
}) => {
  const { driverId } = await fixture();
  const load = await createLoad(request, ["BOL", "POD"]);
  const base = `/me/loads/${load.id}`;
  await manage(request, load.id, "assign-driver", { driverId });
  const oldToken = (await json(request, base, "driver")).actionToken;
  const foreign = await createLoad(request, [], "foreign");
  const unassigned = await createLoad(request);
  expect(
    (
      await request.get(api + `/me/loads/${unassigned.id}`, {
        headers: auth("driver"),
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.get(api + `/me/loads/${foreign.id}`, {
        headers: auth("driver"),
      })
    ).status(),
  ).toBe(404);
  expect(
    (await request.get(api + base, { headers: auth("owner") })).status(),
  ).toBe(403);
  expect((await request.get(api + base)).status()).toBe(401);
  await login(page, "driver");
  let fail = true;
  let releaseInitialResponse!: () => void;
  const initialResponse = new Promise<void>((resolve) => {
    releaseInitialResponse = resolve;
  });
  await page.route(`**/api/v1${base}`, async (route) => {
    await initialResponse;
    if (fail)
      return route.fulfill({
        status: 503,
        json: { message: "Synthetic temporary outage" },
      });
    await route.fallback();
  });
  await page.goto(`/driver/loads/${load.id}`);
  await expect(page.getByRole("status")).toContainText(
    "Loading Driver Load Packet",
  );
  releaseInitialResponse();
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)'),
  ).toContainText("Synthetic temporary outage");
  fail = false;
  await page.getByRole("button", { name: "Retry load details" }).click();
  await expect(
    page.getByRole("heading", { name: load.loadNumber, exact: true }),
  ).toBeVisible();
  await manage(request, load.id, "unassign");
  await manage(request, load.id, "assign-driver", { driverId });
  await page.getByRole("button", { name: "Accept Load", exact: true }).click();
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)'),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: load.loadNumber, exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await request.post(api + base + "/start", {
        headers: auth("driver"),
        data: { actionToken: oldToken },
      })
    ).status(),
  ).toBe(409);
  await page.getByRole("button", { name: "Retry load details" }).click();
  await page.getByRole("button", { name: "Accept Load", exact: true }).click();
  await page.getByRole("button", { name: "Start Load", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Record arrival at pickup" }),
  ).toBeVisible();
  const packet = await json(request, base, "driver");
  const command = { actionToken: packet.actionToken };
  expect(JSON.stringify(packet)).not.toMatch(/totalRate|brokerName/);
  expect(
    (
      await request.post(api + base + "/complete", {
        headers: auth("driver"),
        data: command,
      })
    ).ok(),
  ).toBe(false);
  await noOverflow(page, "driver-active", 390);
  for (const label of [
    "Record arrival at pickup",
    "Record departure from pickup",
    "Record arrival at delivery",
    "Record departure from delivery",
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toHaveCount(0);
  }
  for (const [type, label] of [
    ["BOL", "Bill of Lading"],
    ["POD", "Proof of Delivery"],
  ]) {
    await page
      .locator("section")
      .filter({
        has: page.getByRole("heading", { name: "Paperwork", exact: true }),
      })
      .getByLabel(`Upload ${label}`, { exact: true })
      .setInputFiles(pdf(type));
    await expect(page.getByRole("status")).toContainText(
      `${label} captured successfully.`,
    );
  }
  await page.getByRole("button", { name: /Complete (Load|Delivery)/i }).click();
  await expect(
    page.getByText("Your work on this load is complete."),
  ).toBeVisible();
  for (const action of [
    "complete",
    `stops/${packet.load.stops[1].id}/depart`,
  ]) {
    await post(request, base + "/" + action, command, "driver");
  }
  const result = await json(request, base + "/autopilot", "driver");
  for (const type of [
    "LOAD_COMPLETED",
    "ARRIVED_PICKUP",
    "DEPARTED_PICKUP",
    "ARRIVED_DELIVERY",
    "DEPARTED_DELIVERY",
  ])
    expect(
      result.timeline.filter((event: { type: string }) => event.type === type),
    ).toHaveLength(1);
  await noOverflow(page, "driver-complete", 390);
  await post(request, `/drivers/${driverId}/deactivate`, {});
  try {
    await page.getByRole("button", { name: "Refresh load details" }).click();
    await expect(
      page.locator('[role="alert"]:not(#__next-route-announcer__)'),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: load.loadNumber, exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await request.post(api + base + "/complete", {
          headers: auth("driver"),
          data: command,
        })
      ).status(),
    ).toBe(403);
  } finally {
    await post(request, `/drivers/${driverId}/activate`, {});
  }
});
