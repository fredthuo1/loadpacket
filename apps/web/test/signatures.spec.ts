import { expect, test } from "@playwright/test";
const load = "a0000000-0000-4000-8000-000000000011",
  doc = "a0000000-0000-4000-8000-000000000012",
  version = "a0000000-0000-4000-8000-000000000013";
test("review shows current and earlier signature evidence, authorized preview and unsigned documents", async ({
  page,
}) => {
  let authorized = false;
  await page.route(`**/back-office/loads/${load}/requirements`, (route) =>
    route.fulfill({
      json: {
        loadStatus: "DELIVERED",
        requirements: [
          {
            id: "bol",
            documentType: "BOL",
            status: "RECEIVED",
            reason: null,
            documentId: doc,
            versionId: version,
            versionNumber: 2,
            fileName: "fictional-bol.png",
            uploadedBy: "Fictional Driver",
          },
          {
            id: "pod",
            documentType: "POD",
            status: "RECEIVED",
            reason: null,
            documentId: "pod-doc",
            versionId: "pod-version",
            versionNumber: 1,
            fileName: "fictional-pod.png",
            uploadedBy: "Fictional Driver",
          },
        ],
      },
    }),
  );
  await page.route(`**/documents/${doc}/signatures`, (route) =>
    route.fulfill({
      json: {
        signatures: [
          {
            id: "current",
            documentId: doc,
            documentVersionId: version,
            versionNumber: 2,
            signerName: "Fictional Shipper",
            signerRole: "SHIPPER",
            signedAt: "2026-09-28T14:17:00Z",
          },
          {
            id: "old",
            documentId: doc,
            documentVersionId: "old-version",
            versionNumber: 1,
            signerName: "Previous Driver",
            signerRole: "DRIVER",
            signedAt: "2026-09-27T14:17:00Z",
          },
        ],
      },
    }),
  );
  await page.route("**/documents/pod-doc/signatures", (route) =>
    route.fulfill({ json: { signatures: [] } }),
  );
  await page.route(
    `**/documents/${doc}/signatures/current/content`,
    (route) => {
      authorized = !!route.request().headers().authorization;
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "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",
          "base64",
        ),
      });
    },
  );
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("owner@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto(`/back-office/loads/${load}/review`);
  await expect(
    page.getByText("Signature captured · Fictional Shipper"),
  ).toBeVisible();
  await expect(page.getByText("Shipper", { exact: true })).toBeVisible();
  await expect(page.getByText(/2026.*Version 2 · Current version/)).toBeVisible();
  await expect(page.getByText(/Version 1 · Earlier version/)).toBeVisible();
  await expect(page.getByText(/Version 2 · Current version/)).toBeVisible();
  await expect(
    page.getByText("No signature captured.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept POD", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "View Signature", exact: true })
    .first()
    .click();
  await expect(
    page.getByAltText("Captured signature of Fictional Shipper"),
  ).toBeVisible();
  expect(authorized).toBe(true);
  await expect(
    page.getByRole("button", { name: /Edit Signature|Delete Signature/ }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/signature-review-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/signature-review-narrow.png",
    fullPage: true,
  });
});
