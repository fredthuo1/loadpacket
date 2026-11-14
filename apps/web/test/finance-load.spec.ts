import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
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

for (const role of ["owner", "office"] as const)
  test(`isolated API: ${role} finance load totals, charge evidence, empty state, retry and tenant boundaries`, async ({
    page,
    request,
  }) => {
    const load = await createLoad(request, ["LUMPER_RECEIPT"]);
    const { driverId } = await fixture();
    await manage(request, load.id, "assign-driver", { driverId });
    const base = `/me/loads/${load.id}`;
    const { actionToken } = await json(request, base, "driver");
    for (const action of ["accept", "start"])
      await post(request, `${base}/${action}`, { actionToken }, "driver");
    const upload = await request.post(
      api + base + "/documents/LUMPER_RECEIPT",
      {
        headers: auth("driver"),
        multipart: { actionToken, file: pdf("lumper") },
      },
    );
    expect(upload.ok(), await upload.text()).toBe(true);
    await post(request, `/money-opportunities/loads/${load.id}/scan`, {});
    const [charge] = await json(
      request,
      `/money-opportunities/loads/${load.id}`,
    );
    expect(charge.sourceDocumentId).toBeTruthy();
    const amount = await request.patch(
      api + `/money-opportunities/${charge.id}/amount`,
      { headers: auth(), data: { amount: "80.25" } },
    );
    expect(amount.ok(), await amount.text()).toBe(true);
    await post(request, `/money-opportunities/${charge.id}/approve`, {});
    await post(request, base + "/complete", { actionToken }, "driver");
    await login(page, role);
    let fail = true;
    await page.route(`**/api/v1/finance/loads/${load.id}`, async (route) => {
      if (fail)
        return route.fulfill({
          status: 503,
          json: { message: "Synthetic finance outage" },
        });
      await route.fallback();
    });
    await page.goto(`/finance/loads/${load.id}`);
    await expect(
      page.locator('[role="alert"]:not(#__next-route-announcer__)'),
    ).toContainText("Finance is temporarily unavailable");
    fail = false;
    await page.getByRole("button", { name: "Retry load financials" }).click();
    await expect(
      page.getByText("No additional income or costs recorded."),
    ).toBeVisible();
    for (const [type, value, category] of [
      ["INCOME", "10.25", "OTHER"],
      ["EXPENSE", "80.25", "LUMPER"],
    ]) {
      await post(
        request,
        "/finance/transactions",
        {
          type,
          category,
          amount: value,
          transactionDate: "2026-10-31",
          description: `Synthetic ${category} evidence`,
          loadId: load.id,
          documentId: charge.sourceDocumentId,
          idempotencyKey: randomUUID(),
        },
        role,
      );
    }
    await page.getByRole("button", { name: "Refresh review" }).click();
    for (const [label, value] of [
      ["Agreed Rate", "$1,200.30"],
      ["Additional Recorded Income", "$10.25"],
      ["Gross Load Value", "$1,210.55"],
      ["Recorded Costs", "$80.25"],
      ["Estimated Net", "$1,130.30"],
    ]) {
      await expect(
        page
          .locator("section")
          .filter({
            has: page.getByRole("heading", { name: label, exact: true }),
          }),
      ).toContainText(value);
    }
    await expect(page.getByText("Approved — available to bill")).toBeVisible();
    await expect(
      page.getByText("LUMPER_REIMBURSEMENT · APPROVED · $80.25"),
    ).toBeVisible();
    const totals = await json(request, `/finance/loads/${load.id}`, role);
    expect(totals).toMatchObject({
      agreedRate: "1200.30",
      grossRevenue: "1210.55",
      expenses: "80.25",
      net: "1130.30",
    });
    for (const width of [390, 1440])
      await noOverflow(page, `finance-${role}`, width);
    await page.getByRole("link", { name: "View this load's ledger" }).click();
    await expect(page.getByText("Synthetic LUMPER evidence")).toBeVisible();
    await page.getByText("Synthetic LUMPER evidence").click();
    await expect(
      page.getByRole("link", { name: "Supporting document in Vault" }),
    ).toHaveAttribute(
      "href",
      `/documents?documentId=${charge.sourceDocumentId}`,
    );
    await page
      .getByRole("link", { name: "Supporting document in Vault" })
      .click();
    await expect(
      page.getByText("lumper.pdf", { exact: true }).first(),
    ).toBeVisible();
    expect(
      (
        await request.get(api + `/finance/loads/${load.id}`, {
          headers: auth("foreign"),
        })
      ).status(),
    ).toBe(404);
    for (const denied of ["driver", "dispatch"])
      expect(
        (
          await request.get(api + `/finance/loads/${load.id}`, {
            headers: auth(denied),
          })
        ).status(),
      ).toBe(403);
    expect(
      (await request.get(api + `/finance/loads/${load.id}`)).status(),
    ).toBe(401);
    const foreign = await createLoad(request, [], "foreign");
    await page.goto(`/finance/loads/${foreign.id}`);
    await expect(
      page.getByRole("heading", {
        name: `Load ${foreign.loadNumber} Financials`,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Retry load financials" }),
    ).toBeVisible();
  });
