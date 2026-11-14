import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const media = '/marketing/loadpacket/';

test('welcome and only approved assets are public; carrier routes remain protected', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/welcome');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('From load to paid.');
  for (const name of ['road-ahead.webp', 'loadpacket-overview.mp4', 'overview-captions.vtt']) {
    const response = await request.get(media + name);
    expect(response.status()).toBe(200);
    const original = readFileSync(resolve('../../design-reference/LoadPacket_Landing/assets', name));
    expect(createHash('sha256').update(await response.body()).digest('hex')).toBe(createHash('sha256').update(original).digest('hex'));
  }
  for (const path of ['/', '/finance', '/documents', '/driver', '/welcome/private', '/marketing/loadpacket/private.json']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
  expect(errors).toEqual([]);
});

test('existing registration and sign-in navigation returns to role home; welcome remains accessible', async ({ page }) => {
  await page.goto('/welcome');
  await page.getByRole('navigation').getByRole('link', { name: 'Get started', exact: false }).click();
  await expect(page).toHaveURL(/\/auth\/register$/);
  await expect(page.getByRole('heading', { name: 'Start your carrier account' })).toBeVisible();
  await page.goto('/welcome');
  await page.getByRole('navigation').getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('owner@example.com');
  await page.getByLabel('Password', { exact: true }).fill('local-fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3100/');
  await page.goto('/welcome');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('paid.');
  await page.getByRole('navigation').getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3100/');
});

test('sample selection, validation, literal edits and reset stay browser-local', async ({ page }) => {
  const productRequests: string[] = [];
  const errors: string[] = [];
  page.on('request', request => { if (/\/api\/v1\/|\/auth\/v1\//.test(request.url())) productRequests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Reefer · $3,450' }).click();
  await expect(page.locator('#sample-document')).toContainText('LP-3072');
  await page.getByRole('button', { name: 'Extract sample details' }).click();
  const load = page.getByLabel('Load number', { exact: true });
  await expect(load).toBeFocused();
  await page.getByLabel('Rate (USD)').fill('0');
  await page.getByRole('button', { name: 'Create sample load' }).click();
  await expect(page.locator('#sample-form')).toBeVisible();
  expect(await page.getByLabel('Rate (USD)').evaluate((input: HTMLInputElement) => input.validity.rangeUnderflow)).toBe(true);
  await page.getByLabel('Rate (USD)').fill('1200.01');
  await load.fill('   ');
  await page.getByRole('button', { name: 'Create sample load' }).click();
  await expect(page.locator('#sample-form [role="alert"]')).toContainText('Enter a load number');
  await load.fill('<img src=x onerror=alert(1)>');
  await page.getByLabel('Broker', { exact: true }).fill('Fictional edited broker');
  await page.getByLabel('Pickup', { exact: true }).fill('Synthetic origin');
  await page.getByLabel('Delivery', { exact: true }).fill('Synthetic destination');
  await page.getByRole('button', { name: 'Create sample load' }).click();
  await expect(page.locator('#sample-success-title')).toBeFocused();
  await expect(page.locator('#sample-result')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#sample-result img')).toHaveCount(0);
  for (const text of ['Fictional edited broker', 'Synthetic origin', 'Synthetic destination', '$1,200.01']) await expect(page.locator('#sample-result')).toContainText(text);
  await page.getByRole('button', { name: 'Try another sample' }).click();
  await expect(page.locator('#sample-success')).toBeHidden();
  await page.getByRole('button', { name: 'Extract sample details' }).click();
  await expect(load).toHaveValue('LP-3072');
  await expect(page.getByLabel('Rate (USD)')).toHaveValue('3450.00');
  await page.getByRole('button', { name: 'Dry van · $2,850' }).click();
  await expect(page.locator('#sample-form')).toBeHidden();
  await expect(page.locator('#sample-document')).toContainText('LP-2048');
  expect(productRequests).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});

test('preview supports keyboard tabs, play, pause, hidden-page pause and replay', async ({ page }) => {
  await page.clock.install();
  await page.goto('/welcome');
  const load = page.getByRole('tab', { name: 'The load', exact: true });
  const docs = page.getByRole('tab', { name: 'The paperwork', exact: true });
  await load.focus(); await load.press('ArrowRight');
  await expect(docs).toBeFocused(); await expect(docs).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#panel-docs')).toBeVisible();
  await docs.press('End');
  await expect(page.getByRole('tab', { name: 'The payment' })).toBeFocused();
  await page.getByRole('tab', { name: 'The payment' }).press('Home');
  await expect(load).toBeFocused();
  await page.getByRole('button', { name: 'Play guided demo' }).click();
  await page.clock.fastForward(6100);
  await expect(docs).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Pause guided demo' }).click();
  await page.clock.fastForward(7000);
  await expect(docs).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Play guided demo' }).click();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.getByRole('button', { name: 'Play guided demo' })).toHaveAttribute('aria-pressed', 'false');
  await page.clock.fastForward(7000);
  await expect(docs).toHaveAttribute('aria-selected', 'true');
  await page.evaluate(() => { delete (document as unknown as { hidden?: boolean }).hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.getByRole('button', { name: 'Play guided demo' }).click();
  await page.clock.fastForward(6100); await page.clock.fastForward(6100);
  await expect(page.getByRole('button', { name: 'Replay guided demo' })).toBeVisible();
  await page.getByRole('button', { name: 'Replay guided demo' }).click();
  await expect(load).toHaveAttribute('aria-selected', 'true');
  await page.goto('/login'); // Effect cleanup on unmount; no delayed navigation or requests.
  await page.clock.fastForward(20000);
  await expect(page).toHaveURL(/\/login$/);
});

for (const width of [390, 1440, 720]) {
  test(`approved landing layout, reduced motion and keyboard navigation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/welcome');
    await expect(page.locator('.story-load')).toHaveCSS('opacity', '1');
    await expect(page.locator('.story-document')).toHaveCSS('opacity', '0');
    await expect(page.locator('.story-load')).toHaveCSS('animation-name', 'none');
    await expect(page.getByRole('button', { name: 'Replay the journey' })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390) {
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await expect(page.getByRole('navigation').getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Close', exact: true }).press('Escape');
      await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();
    }
    const faq = page.getByText('Will I review the extracted details?', { exact: true });
    await faq.focus(); await faq.press('Enter');
    await expect(page.getByText('Yes. Check and correct the extracted information', { exact: false })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`welcome-${width}.png`), fullPage: true });
  });
}

test('hero plays once and replay preserves headline; local video plays only on user action', async ({ page }) => {
  await page.goto('/welcome');
  const headline = page.getByRole('heading', { level: 1 });
  const before = await headline.boundingBox();
  await expect(page.locator('.story-load')).toHaveCSS('animation-iteration-count', '1');
  await page.getByRole('button', { name: 'Replay the journey' }).click();
  expect(await headline.boundingBox()).toEqual(before);
  const film = page.locator('video');
  expect(await film.evaluate((video: HTMLVideoElement) => video.paused && video.currentTime === 0 && !video.autoplay)).toBe(true);
  await expect(film).toHaveAttribute('preload', 'none');
  await page.getByRole('link', { name: /Watch the overview.*0:20/ }).click();
  await expect.poll(() => film.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0);
  expect(await film.evaluate((video: HTMLVideoElement) => video.duration)).toBeCloseTo(20, 0);
  await expect(film).toHaveAttribute('playsinline', '');
  await expect(film.locator('track')).toHaveAttribute('src', media + 'overview-captions.vtt');
  await film.evaluate((video: HTMLVideoElement) => video.pause());
  await page.getByText('Read the transcript', { exact: true }).click();
  await expect(page.getByText('One load. Every detail. Keep your loads, drivers and documents together.', { exact: false })).toBeVisible();
});

test('failed overview retains a readable transcript and keyboard skip link', async ({ page }, testInfo) => {
  await page.route('**/marketing/loadpacket/loadpacket-overview.mp4', route => route.abort());
  await page.goto('/welcome');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.getByRole('link', { name: /Watch the overview.*0:20/ }).click();
  await expect(page.locator('main [role="alert"]')).toContainText('overview could not load');
  await page.getByText('Read the transcript', { exact: true }).click();
  await expect(page.getByText('One load. Every detail. Keep your loads, drivers and documents together.', { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('media-error.png') });
});
