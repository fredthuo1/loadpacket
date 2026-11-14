import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { parseRateConDraft } from "../src/lib/api/ratecon-draft";
test("real scanned intake, evidence, correction and explicit load confirmation at mobile width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/auth/register");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`b3-${randomUUID()}@example.invalid`);
  await page.getByLabel("Password", { exact: true }).fill("Fictional-B3-123!");
  await page.getByLabel("Confirm password", { exact: true }).fill("Fictional-B3-123!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("First name", { exact: true }).fill("Fictional");
  await page.getByLabel("Last name", { exact: true }).fill("Reviewer");
  await page
    .getByLabel("Legal company name", { exact: true })
    .fill("Fictional OCR Carrier");
  await page
    .getByRole("button", { name: "Create organization", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Company Profile", exact: true }),
  ).toBeVisible();
  await page.goto("/loads/new");
  await page
    .locator("input[type=file]")
    .setInputFiles(
      path.resolve(
        "../../test-results/document-intelligence/fixtures/scanned.pdf",
      ),
    );
  const processed = page.waitForResponse(
    (r) => r.url().endsWith("/intelligence"),
    { timeout: 150000 },
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const response = await processed;
  expect(response.status()).toBe(201);
  const payload: unknown = await response.json();
  const documentId = new URL(response.url()).pathname.split("/").at(-2)!;
  const draft = parseRateConDraft(payload, documentId);
  expect(draft.intelligence!.status).toBe("SUCCEEDED");
  expect(draft.intelligence!.pages[0].method).toBe("LOCAL_OCR");
  expect(() =>
    parseRateConDraft(
      {
        ...draft,
        intelligence: {
          ...draft.intelligence,
          fields: { broken: { value: 1 } },
        },
      },
      documentId,
    ),
  ).toThrow();
  await expect(
    page.getByRole("heading", { name: "Review Your Load" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open original document" }),
  ).toBeVisible();
  await page
    .getByText("Field evidence and uncertainty", { exact: true })
    .click();
  await expect(page.getByText(/Page 1 · Local OCR/).first()).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Add required document").selectOption("SCALE_TICKET");
  await expect(page.getByLabel("Scale Ticket requirement")).toHaveValue(
    "REQUIRED",
  );
  await page.getByLabel("Scale Ticket requirement").selectOption("OMIT");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Confirm & Create Load", exact: true })
    .click();
  await expect(
    page.getByText(
      "Verify the original and all values, select USD, and explicitly confirm your review.",
    ),
  ).toBeVisible();
  await page
    .getByLabel("Broker", { exact: true })
    .fill("Human Verified Brokerage");
  await page
    .getByLabel("Load Number", { exact: true })
    .fill(`B3-BROWSER-${Date.now()}`);
  await page.getByLabel("Payment terms (days)", { exact: true }).fill("0");
  await page.getByRole("checkbox").check();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Confirm & Create Load", exact: true })
    .click();
  await expect(page).toHaveURL(/\/loads\/[0-9a-f-]+$/);
  await expect(
    page.getByText("Human Verified Brokerage").first(),
  ).toBeVisible();
});
