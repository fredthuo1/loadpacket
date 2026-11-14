import { expect, test } from '@playwright/test';

for (const role of ['owner', 'dispatcher']) {
  test(`${role} sees the appropriate operations overview and actions`, async ({ page }) => {
    const owner = role === 'owner';
    await page.route('**/api/v1/owner/dashboard', route => route.fulfill({ json: {
      generatedAt: new Date().toISOString(),
      metrics: { totalLoads: 2, totalLoadValue: '3250.00', activeLoads: 1, paymentReadyLoads: 0, activeDrivers: 1, outstandingReceivables: { amount: '2250.00', count: 1 }, paidRevenue: { amount: '0.00', count: 0 } },
      recentLoads: [],
      operations: {
        drivers: { active: 1, inactive: 1, invitePending: 1 },
        attention: { awaitingReview: 2, blockedLoads: 1, expiringDocuments: 1, expiredDocuments: 1, driverComplianceIssues: owner ? 1 : null },
        receivables: owner ? { partialCount: 1, overdueCount: 1, overdueAmount: '2250.00' } : null,
        moneyFound: owner ? { count: 1, amount: '100.00' } : null,
        recentActivity: [],
      },
    } }));
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(`${role}@example.com`);
    await page.getByLabel('Password', { exact: true }).fill('local-fixture-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const overview = page.getByRole('region', { name: 'Operations overview' });
    await expect(overview.getByText('2 documents awaiting review', { exact: true })).toBeVisible();
    await expect(overview.getByRole('link', { name: 'Add Driver', exact: true })).toHaveAttribute('href', '/drivers/new');
    await expect(page.getByText('1 partially paid invoices', { exact: true })).toHaveCount(owner ? 1 : 0);
    await expect(overview.getByRole('link', { name: 'Review Documents', exact: true })).toHaveCount(owner ? 1 : 0);
    await expect(overview.getByText('1 drivers need compliance attention', { exact: true })).toHaveCount(owner ? 1 : 0);
    if (owner) {
      await page.goto('/finance/imports');
      await expect(page.getByRole('navigation').getByRole('link', { name: 'Finance', exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('navigation').getByRole('link', { name: 'Settlements', exact: true })).not.toHaveAttribute('aria-current');
    }
  });
}

test('Loads navigation waits for dashboard data and supports repeated clicks', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('owner@example.com');
  await page.getByLabel('Password', { exact: true }).fill('local-fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recent Loads' })).toBeVisible();
  await page.goto('/drivers');
  await expect(page.getByRole('heading', { name: 'Drivers', exact: true })).toBeVisible();
  let release!: () => void;
  const loaded = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/owner/dashboard', async route => {
    await loaded;
    await route.continue();
  });
  await page.getByRole('navigation').getByRole('link', { name: 'Loads', exact: true }).click();
  await expect(page.getByText('Loading command center...')).toBeVisible();
  release();
  await expect(page.getByRole('heading', { name: 'Recent Loads' })).toBeInViewport();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Loads', exact: true })).toHaveAttribute('aria-current', 'location');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('navigation').getByRole('link', { name: 'Loads', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recent Loads' })).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('navigation').getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Loads', exact: true })).not.toHaveAttribute('aria-current');
});

for (const width of [390, 1440]) {
  test(`refined dashboard filters real response data and preserves scopes at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const operations = {
      drivers: { active: 2, inactive: 1, invitePending: 1 },
      attention: { awaitingReview: 2, blockedLoads: 1, expiringDocuments: 1, expiredDocuments: 0, driverComplianceIssues: 1 },
      receivables: { partialCount: 1, overdueCount: 1, overdueAmount: '950.00' },
      moneyFound: { count: 2, amount: '199.50' },
      recentActivity: [{ id: 'activity', loadId: 'test-moving', type: 'LOAD_STARTED', actorName: 'Synthetic Driver', occurredAt: '2026-11-01T12:00:00Z' }],
    };
    await page.route('**/api/v1/owner/dashboard', route => route.fulfill({ json: {
      generatedAt: '2026-11-01T12:00:00Z',
      metrics: { totalLoads: 2, totalLoadValue: '2000.00', activeLoads: 1, paymentReadyLoads: 0, activeDrivers: 2, outstandingReceivables: { amount: '950.00', count: 1 }, paidRevenue: { amount: '1000.00', count: 1 } },
      operations,
      recentLoads: ['IN_TRANSIT', 'PAID'].map((status, i) => ({
        id: i ? 'test-paid' : 'test-moving', loadNumber: i ? 'SYN-PAID' : 'SYN-MOVING', brokerName: 'Synthetic Broker', status, totalRate: '1000.00',
        pickup: { facilityName: 'Synthetic pickup', address: 'Test origin' }, delivery: { facilityName: 'Synthetic delivery', address: 'Test destination' },
        driver: { id: 'test-driver', name: 'Synthetic Driver', assignmentStatus: 'ACCEPTED' },
        paperwork: { requiredCount: 3, blockingCount: 1, clear: false }, invoiceNumber: null, paymentDueAt: null, paidAt: null,
      })),
    } }));
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill('owner@example.com');
    await page.getByLabel('Password', { exact: true }).fill('local-fixture-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('$2,000.00', { exact: true })).toBeVisible();
    await expect(page.getByText('1 loads blocked by paperwork', { exact: true })).toBeVisible();
    await expect(page.getByText('$199.50 in potential charges · 2 opportunities', { exact: true })).toBeVisible();
    await page.getByText('Active-load exceptions — details', { exact: true }).click();
    await expect(page.getByText('No active-load exceptions reported')).toBeVisible();
    await expect(page.getByText('Nothing needs your attention')).toHaveCount(0);
    await expect(page.getByText('Potential charges on exception loads')).toBeVisible();
    const loads = page.locator('#loads');
    await loads.getByRole('button', { name: 'Paid · 1', exact: true }).click();
    await expect(loads.getByRole('link', { name: 'SYN-MOVING' })).toHaveCount(0);
    await expect(loads.getByRole('link', { name: 'SYN-PAID' }).filter({ visible: true })).toBeVisible();
    await loads.getByRole('button', { name: 'All · 2', exact: true }).click();
    await expect(loads.getByRole('link', { name: 'SYN-MOVING' }).filter({ visible: true })).toHaveAttribute('href', '/loads/test-moving');
    const activity = page.getByRole('region', { name: 'Recent activity', exact: true });
    expect((await activity.boundingBox())!.y).toBeGreaterThan((await loads.boundingBox())!.y);
    if (width === 390) {
      const nav = page.getByRole('navigation', { name: 'Primary navigation' });
      await expect(nav.getByRole('link', { name: 'Finance', exact: true })).toBeHidden();
      await nav.getByRole('button', { name: 'More', exact: true }).click();
      await expect(nav.getByRole('link', { name: 'Finance', exact: true })).toBeVisible();
      await nav.getByRole('button', { name: 'Less', exact: true }).click();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${width}.png`), fullPage: true });
    // A 1440px viewport at 200% browser zoom has 720 CSS pixels available.
    if (width === 1440) {
      await page.setViewportSize({ width: 720, height: 500 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(loads.getByRole('link', { name: 'SYN-MOVING' }).filter({ visible: true })).toBeVisible();
    }
  });
}

test('dashboard and exception failures recover through their retry controls', async ({ page }) => {
  let dashboardFails = true;
  let inboxFails = true;
  await page.route('**/api/v1/owner/dashboard', route => dashboardFails ? route.fulfill({ status: 503, json: { message: 'Synthetic unavailable' } }) : route.continue());
  await page.route('**/api/v1/autopilot/owner/exceptions', route => inboxFails ? route.fulfill({ status: 503, json: { message: 'Synthetic unavailable' } }) : route.continue());
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('owner@example.com');
  await page.getByLabel('Password', { exact: true }).fill('local-fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('main [role="alert"]')).toContainText('503');
  dashboardFails = false;
  await page.getByRole('button', { name: 'Retry dashboard' }).click();
  await expect(page.getByText('No loads yet', { exact: true })).toBeVisible();
  await expect(page.getByText(/Operations summary unavailable/)).toBeVisible();
  await page.getByText('Active-load exceptions — details', { exact: true }).click();
  await expect(page.locator('main [role="alert"]')).toContainText('503');
  inboxFails = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('No active-load exceptions reported')).toBeVisible();
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);
});
