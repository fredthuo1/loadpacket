import { test, expect } from '@playwright/test';

test('billing terms default without silently posting 30; zero override freezes after generation', async ({ page }) => {
  const id = '00000000-0000-4000-8000-000000000010';
  const item = {
    load: { id, loadNumber: 'SYNTHETIC-INVOICE', brokerName: 'Test Broker', status: 'DELIVERED', totalRate: '1234.56', pickup: null, delivery: null, effectivePaymentTermsDays: 45, paymentTermsDays: null as number | null, invoiceIssuedAt: null as string | null, paymentDueAt: null as string | null },
    driver: null,
    readiness: { ready: false, blockingCount: 1, requiredCount: 1, satisfiedCount: 0, requirements: [{ id: 'req', documentType: 'CARRIER_INVOICE', requirement: 'REQUIRED', status: 'MISSING', blocking: true }] },
  };
  await page.route('**/api/v1/back-office/queue', route => route.fulfill({ json: [item] }));
  let failFirst = true;
  await page.route('**/api/v1/back-office/loads/*/carrier-invoice', async route => {
    if (failFirst) {
      expect(route.request().postDataJSON()).toEqual({});
      failFirst = false;
      await route.fulfill({ status: 400, json: { message: 'Company setup required: ask an Owner to save the Legal Company Name in Company Settings before generating an invoice.' } });
      return;
    }
    expect(route.request().postDataJSON()).toEqual({ paymentTermsDays: 0 });
    Object.assign(item.load, { status: 'PAYMENT_READY', paymentTermsDays: 0, effectivePaymentTermsDays: 0, invoiceIssuedAt: '2026-10-21T18:00:00Z', paymentDueAt: '2026-10-21T12:00:00Z' });
    Object.assign(item.readiness, { ready: true, blockingCount: 0, satisfiedCount: 1 });
    Object.assign(item.readiness.requirements[0], { status: 'ACCEPTED', blocking: false });
    await route.fulfill({ status: 201, json: { created: true, load: item.load } });
  });
  await page.route('**/api/v1/back-office/loads/*/submit-billing', async route => {
    expect(route.request().postDataJSON()).toMatchObject({ paymentTermsDays: 0 });
    await route.fulfill({ json: { submitted: true, load: { ...item.load, invoiceNumber: 'TEST' } } });
  });
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('backoffice@example.com');
  await page.getByLabel('Password', { exact: true }).fill('local-fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const terms = page.getByLabel('Payment Terms (days)');
  await expect(terms).toHaveValue('');
  await expect(terms).toHaveAttribute('placeholder', 'Use effective default: 45');
  await page.getByRole('button', { name: 'Generate Carrier Invoice' }).click();
  await expect(page.getByText(/Company setup required:/)).toBeVisible();
  await terms.fill('366');
  await page.getByRole('button', { name: 'Generate Carrier Invoice' }).click();
  await expect(page.getByText('Payment terms must be a whole number from 0 to 365 days.', { exact: true })).toBeVisible();
  await terms.fill('0');
  await page.getByRole('button', { name: 'Generate Carrier Invoice' }).click();
  await expect(terms).toHaveValue('0');
  await expect(terms).toBeDisabled();
  await expect(page.getByText(/Issued terms: 0 days. Due Oct 21, 2026/)).toBeVisible();
  await page.getByRole('button', { name: 'Submit Billing', exact: true }).click();
  await expect(page.getByText(/submitted for billing. Invoice TEST/)).toBeVisible();
});
