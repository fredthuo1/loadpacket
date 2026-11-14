import { test, expect, type Page } from '@playwright/test';
async function login(page: Page, role='owner') {
  await page.goto('/login'); await page.getByLabel('Email',{exact:true}).fill(`${role}@example.com`);
  await page.getByLabel('Password',{exact:true}).fill('local-fixture-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('button',{name:'Sign out'})).toBeVisible();
}
test('owner confirms invitation, sees durable pending state, resends and cannot edit account email', async ({page}) => {
  await login(page); await page.goto('/drivers/new');
  await page.getByLabel('First Name').fill('D7B');await page.getByLabel('Last Name').fill('Test Driver');
  await page.getByLabel('Email',{exact:true}).fill('d7b-ui@example.com');
  await page.getByRole('button',{name:'Add Driver',exact:true}).click();
  await page.getByRole('button',{name:'Send Invitation',exact:true}).click();
  const dialog=page.getByRole('dialog'); await expect(dialog).toContainText('d7b-ui@example.com');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByText('Account: Not connected',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Send Invitation',exact:true}).click();
  await dialog.getByRole('button',{name:'Send Invitation',exact:true}).click();
  await expect(page.getByText('Account: Invitation Sent',{exact:true})).toBeVisible();
  await page.reload(); await expect(page.getByRole('button',{name:'Resend Invitation',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Resend Invitation',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Invitation resent.');
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await expect(page.getByLabel('Email',{exact:true})).toHaveAttribute('readonly','');
  await page.route('**/api/v1/drivers/*/invite/resend',route=>route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({message:'Wait at least 60 seconds between invitation emails.'})}));
  await page.getByRole('button',{name:'Resend Invitation',exact:true}).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('60 seconds');
});
test('dispatcher can manage profile but has no identity provisioning controls', async ({page}) => {
  await login(page,'dispatcher'); await page.goto('/drivers/new');
  await page.getByLabel('First Name').fill('Dispatch');await page.getByLabel('Last Name').fill('Test');
  await page.getByLabel('Email',{exact:true}).fill('dispatcher-created@example.com');
  await page.getByRole('button',{name:'Add Driver',exact:true}).click();
  await expect(page.getByRole('button',{name:'Edit',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Send Invitation',exact:true})).toHaveCount(0);
});
test('SSR invite confirmation sets cookies, validates password, completes onboarding and redirects locally', async ({page,context}) => {
  await page.goto('/auth/confirm?token_hash=local-invite-hash&type=invite&next=https://attacker.invalid');
  await expect(page).toHaveURL('http://127.0.0.1:3100/auth/invite');
  await expect(page.getByRole('heading',{name:'Welcome to LoadPacket'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Activate Account',exact:true})).toBeVisible();
  expect((await context.cookies()).some(cookie=>cookie.name.includes('auth-token'))).toBe(true);
  await page.goto('/driver'); await expect(page).toHaveURL(/\/auth\/invite$/);
  await page.getByLabel('Create Password',{exact:true}).fill('new-password-123');
  await page.getByLabel('Confirm Password',{exact:true}).fill('mismatch-123');
  await page.getByRole('button',{name:'Activate Account',exact:true}).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Passwords must match.');
  await page.getByLabel('Create Password',{exact:true}).fill('weakpassword');
  await page.getByLabel('Confirm Password',{exact:true}).fill('weakpassword');
  await page.getByRole('button',{name:'Activate Account',exact:true}).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('include a number');
  await page.getByLabel('Create Password',{exact:true}).fill('new-password-123');
  await page.getByLabel('Confirm Password',{exact:true}).fill('new-password-123');
  await page.getByRole('button',{name:'Activate Account',exact:true}).click();
  await expect(page).toHaveURL(/\/driver$/);
  await expect(page.getByRole('button',{name:'Sign out'})).toBeVisible();
  await page.reload(); await expect(page).toHaveURL(/\/driver$/);
});
test('expired, missing and unsupported callback tokens show safe errors without open redirects', async ({page,request}) => {
  // B2 adds signup confirmation; email_change remains unsupported here.
  for(const query of ['token_hash=expired&type=invite','type=invite','token_hash=local-invite-hash&type=email_change']) {
    await page.goto(`/auth/confirm?${query}&redirectTo=https://attacker.invalid`);
    await expect(page).toHaveURL(/\/auth\/invite\?error=invalid$/);
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Ask your company administrator to resend');
    await expect(page.getByRole('button',{name:'Activate Account',exact:true})).toHaveCount(0);
  }
  const signup = await request.get('/auth/confirm?token_hash=local-invite-hash&type=signup&next=https://attacker.invalid', {maxRedirects:0});
  expect(signup.status()).toBe(303);
  expect(signup.headers().location).toBe('/auth/start');
  const missingCode = await request.get('/auth/callback?next=https://attacker.invalid', {maxRedirects:0});
  expect(missingCode.status()).toBe(303);
  expect(missingCode.headers().location).toBe('/auth/start?error=invalid');
});
test('confirmed but pending account can use recovery confirmation to resume onboarding', async ({page}) => {
  await page.goto('/auth/confirm?token_hash=local-invite-hash&type=recovery');
  await expect(page).toHaveURL('http://127.0.0.1:3100/auth/invite');
  await expect(page.getByRole('button',{name:'Activate Account',exact:true})).toBeVisible();
});
test('activation can retry the same password after the API completion request fails', async ({page}) => {
  await page.goto('/auth/confirm?token_hash=local-invite-hash&type=invite');
  await page.getByLabel('Create Password',{exact:true}).fill('retry-password-123');
  await page.getByLabel('Confirm Password',{exact:true}).fill('retry-password-123');
  await page.route('**/api/v1/me/complete-invitation',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Temporary activation failure. Please retry.'})}),{times:1});
  await page.getByRole('button',{name:'Activate Account',exact:true}).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Temporary activation failure');
  await page.getByRole('button',{name:'Activate Account',exact:true}).click();
  await expect(page).toHaveURL('http://127.0.0.1:3100/driver');
});

