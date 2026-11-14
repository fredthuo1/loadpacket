import { expect, test, type Page } from '@playwright/test';

// Measure the rendered foreground against its composited ancestor backgrounds.
// This catches inherited text colors, including OS color-scheme regressions.
async function expectReadableText(page: Page) {
  const failures = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const rgba = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    const composite = (front: number[], back: number[]) => front.slice(0, 3).map((value, i) => value * front[3] / 255 + back[i] * (1 - front[3] / 255));
    const luminance = (rgb: number[]) => rgb.map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const issues: string[] = [];
    const inspect = (element: Element, text: string, pseudo?: string) => {
      if (!text.trim() || !element.getClientRects().length) return;
      const style = getComputedStyle(element, pseudo);
      if (style.visibility !== 'visible' || style.display === 'none') return;
      const ancestors: Element[] = [];
      for (let current: Element | null = element; current; current = current.parentElement) ancestors.unshift(current);
      let background = [255, 255, 255];
      for (const ancestor of ancestors) background = composite(rgba(getComputedStyle(ancestor).backgroundColor), background);
      const foreground = composite(rgba(style.color), background);
      const a = luminance(foreground), b = luminance(background);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && parseInt(style.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) issues.push(`${text.trim().slice(0, 80)}: ${ratio.toFixed(2)} (${style.color})`);
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const element = node.parentElement;
      if (!element || element.closest('script,style,option,svg') || !/[a-z0-9]/i.test(node.textContent ?? '')) continue;
      const range = document.createRange();
      range.selectNode(node);
      if (!Array.from(range.getClientRects()).some(rect => rect.width > 0 && rect.height > 0)) continue;
      inspect(element, node.textContent ?? '');
    }
    for (const element of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]),textarea')) {
      inspect(element, element.value);
      if (!element.value && element.placeholder) inspect(element, element.placeholder, '::placeholder');
    }
    for (const element of document.querySelectorAll('select')) inspect(element, element.selectedOptions[0]?.textContent ?? '');
    return issues;
  });
  expect(failures, `Text contrast on ${new URL(page.url()).pathname}`).toEqual([]);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`light theme remains readable with ${colorScheme} device preference`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.route('**/api/v1/documents/vault', route => route.fulfill({ json: [] }));
    await page.route('**/api/v1/back-office/queue', route => route.fulfill({ json: [] }));
    const loadId = '00000000-0000-4000-8000-000000000010';
    await page.route('**/api/v1/back-office/accounts-receivable', route => route.fulfill({ json: {
      generatedAt: new Date().toISOString(),
      summary: { outstanding: { amount: '2250.00', count: 1 }, dueSoon: { amount: '0.00', count: 0 }, overdue: { amount: '0.00', count: 0 }, paid: { amount: '0.00', count: 0 } },
      invoices: [{ id: loadId, loadNumber: 'THEME-TEST', brokerName: 'Test Broker', status: 'INVOICED', totalRate: '3250.00', invoiceNumber: 'INV-TEST', invoiceIssuedAt: '2026-09-20T00:00:00Z', billingSubmittedAt: '2026-09-20T00:00:00Z', paymentTermsDays: 30, paymentDueAt: '2026-10-20T00:00:00Z', billingRecipientName: 'Test Broker', billingRecipientEmail: null, amountPaid: '1000.00', remainingBalance: '2250.00', paidAt: null, agingStatus: 'OUTSTANDING', daysUntilDue: 30 }],
    } }));
    await page.route(`**/api/v1/back-office/loads/${loadId}/requirements`, route => route.fulfill({ json: {
      loadStatus: 'DELIVERED', requirements: [{ id: 'bol', documentType: 'BOL', status: 'RECEIVED', reason: null, documentId: 'doc-bol', versionId: 'version-bol', versionNumber: 1, fileName: 'bol.pdf', uploadedBy: 'Test Driver' }],
    } }));
    await page.route('**/api/v1/owner/dashboard', route => route.fulfill({ json: {
      generatedAt: new Date().toISOString(),
      metrics: { totalLoads: 2, totalLoadValue: '3250.00', activeLoads: 1, paymentReadyLoads: 0, activeDrivers: 1, outstandingReceivables: { amount: '2250.00', count: 1 }, paidRevenue: { amount: '0.00', count: 0 } },
      recentLoads: [],
      operations: { drivers: { active: 1, inactive: 1, invitePending: 1 }, attention: { awaitingReview: 2, blockedLoads: 1, expiringDocuments: 1, expiredDocuments: 1, driverComplianceIssues: 1 }, receivables: { partialCount: 1, overdueCount: 1, overdueAmount: '2250.00' }, moneyFound: { count: 1, amount: '100.00' }, recentActivity: [] },
    } }));
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in to your carrier account' })).toBeVisible();
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
    await page.getByLabel('Email', { exact: true }).fill('owner@example.com');
    await page.getByLabel('Password', { exact: true }).fill('local-fixture-password');
    await page.getByLabel('Email', { exact: true }).focus();
    await expect(page.getByLabel('Email', { exact: true })).toHaveCSS('outline-style', 'solid');
    await expectReadableText(page);
    await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Operations overview' })).toBeVisible();
    await expectReadableText(page);
    await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });

    for (const path of ['/documents', '/drivers', '/drivers/new', '/settings/company', '/loads/new', '/loads/new/manual', '/back-office', '/back-office/accounts-receivable', `/back-office/loads/${loadId}/review`]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(page.getByText(/^Loading/)).toHaveCount(0);
      await expectReadableText(page);
    }
    // Hold a real form submission at the API boundary to inspect disabled fields.
    await page.goto('/documents');
    let release = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/v1/company/documents', async route => {
      await gate;
      await route.fulfill({ status: 503, json: { message: 'Test upload paused.' } });
    });
    await page.getByLabel('File (PDF, PNG, JPEG; maximum 10 MB)').setInputFiles({ name: 'test.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 test') });
    await page.getByRole('button', { name: 'Upload Document', exact: true }).click();
    try {
      await expect(page.getByRole('button', { name: 'Working…', exact: true })).toBeDisabled();
      await expectReadableText(page);
    } finally { release(); }
    await expect(page.getByRole('alert').filter({ hasText: 'Test upload paused.' })).toBeVisible();
    await expectReadableText(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/documents');
    await expect(page.getByLabel('Search documents')).toBeVisible();
    await expectReadableText(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('documents-mobile.png'), fullPage: true });
  });
}
