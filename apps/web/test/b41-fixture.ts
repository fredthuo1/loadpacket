import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const api = "http://127.0.0.1:3103/api/v1";
export const auth = (role = "owner") => ({ authorization: `Bearer ${role}` });
export async function fixture() {
  return JSON.parse(
    await readFile(
      path.resolve("../../test-results/settlements/browser-fixture.json"),
      "utf8",
    ),
  ) as { driverId: string; loadId: string };
}
export async function json(
  request: APIRequestContext,
  route: string,
  role = "owner",
) {
  const response = await request.get(api + route, { headers: auth(role) });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
export async function post(
  request: APIRequestContext,
  route: string,
  data: unknown,
  role = "owner",
) {
  const response = await request.post(api + route, {
    headers: auth(role),
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
export async function createLoad(
  request: APIRequestContext,
  documents: string[] = [],
  role = "owner",
) {
  const { load } = await post(
    request,
    "/loads/manual",
    {
      loadNumber: `B41-${randomUUID().slice(0, 8)}`,
      brokerName: "Fictional B4.1 Broker",
      linehaul: "1000.10",
      fuelSurcharge: "200.20",
      totalRate: "1200.30",
      pickup: { facilityName: "Synthetic pickup", address: "1 Fictional Road" },
      delivery: {
        facilityName: "Synthetic delivery",
        address: "2 Fictional Road",
      },
      requirements: documents.map((documentType) => ({
        documentType,
        requirement:
          documentType === "LUMPER_RECEIPT" ? "CONDITIONAL" : "REQUIRED",
      })),
    },
    role,
  );
  return load as { id: string; loadNumber: string };
}
export async function manage(
  request: APIRequestContext,
  id: string,
  command: string,
  extra = {},
) {
  const { token } = await json(request, `/loads/${id}/management`);
  return post(request, `/loads/${id}/${command}`, {
    expectedToken: token,
    idempotencyKey: randomUUID(),
    reason: "Synthetic acceptance operation",
    ...extra,
  });
}
export async function login(page: Page, role: "owner" | "office" | "driver") {
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `http://127.0.0.1:3103${url.pathname}${url.search}`,
      headers: { ...route.request().headers(), ...auth(role) },
    });
    await route.fulfill({ response });
  });
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`${role === "office" ? "backoffice" : role}@example.com`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(
    role === "driver" ? "/driver" : role === "office" ? "/back-office" : "/",
  );
}
export async function noOverflow(page: Page, name: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `../../test-results/b41/${name}-${width}.png`,
    fullPage: true,
  });
}
export const pdf = (name: string) => ({
  name: `${name}.pdf`,
  mimeType: "application/pdf",
  buffer: Buffer.from(`%PDF-1.7 synthetic B4.1 ${name}`),
});
