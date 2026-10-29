const { test, expect } = require('@playwright/test');
const fs = require('fs');

const ADMIN = { email: 'admin@flyto.test', password: 'e2e-admin-password' };

// any uncaught error in the page fails the test, the front must run clean
test.beforeEach(({ page }, testInfo) => {
  testInfo.pageErrors = [];
  page.on('pageerror', e => testInfo.pageErrors.push(e.message));
});

test.afterEach((_, testInfo) => {
  expect(testInfo.pageErrors, 'errors in the page').toEqual([]);
});

async function login(page) {
  await page.goto('login');
  await page.locator('#email').fill(ADMIN.email);
  await page.locator('#password').fill(ADMIN.password);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(/\/admin/);
}

async function uploadText(page, name, text) {
  await page.goto('./');
  await page.locator('#fileInput').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
  await expect(page.locator('.upload-files')).toContainText(name);
  await page.locator('#uploadBtn').click();
  const link = page.locator('.share-link a');
  await expect(link).toBeVisible({ timeout: 20000 });
  return link.getAttribute('href');
}

test('a visitor is asked to log in before uploading', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.upload-login a[href="login"]')).toBeVisible();
});

test('upload, open the link, preview and download', async ({ page }) => {
  await login(page);
  const name = `hello-${ Date.now() }.txt`;
  const url = await uploadText(page, name, 'hello from flyto');

  await page.goto(url);
  const row = page.locator('tr', { hasText: name });
  await expect(row).toBeVisible();
  await expect(page.locator('.btn-download-archive')).toBeVisible();

  await row.getByTitle('Preview').click();
  await expect(page.locator('.preview-modal pre')).toHaveText('hello from flyto');
  await page.keyboard.press('Escape');
  await expect(page.locator('.preview-modal')).toHaveCount(0);

  const download = page.waitForEvent('download');
  await row.locator('strong', { hasText: name }).click();
  const file = await (await download).path();
  expect(fs.readFileSync(file, 'utf8')).toBe('hello from flyto');
});

test('a password protects the transfer', async ({ page }) => {
  await login(page);
  await page.goto('./');
  await page.locator('#password').fill('s3cret-pass');
  const name = `locked-${ Date.now() }.txt`;
  await page.locator('#fileInput').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from('locked') });
  await page.locator('#uploadBtn').click();
  const url = await page.locator('.share-link a').getAttribute('href', { timeout: 20000 });

  await page.goto(url);
  const input = page.locator('input[type=password]');
  await input.fill('wrong');
  await page.locator('button.decrypt').click();
  await expect(page.locator('.text-danger strong')).toBeVisible();
  await input.fill('s3cret-pass');
  await page.locator('button.decrypt').click();
  await expect(page.locator('tr', { hasText: name })).toBeVisible();
});

test('every admin tab renders', async ({ page }) => {
  await login(page);
  for (const tab of ['dashboard', 'users', 'transfers', 'downloads', 'invites', 'audit', 'settings', 'system']) {
    await page.goto(`admin#/${ tab }`);
    await expect(page.locator('.admin-tabs li.active a')).toHaveAttribute('href', `#/${ tab }`);
    await expect(page.locator('.admin-app > .alert-danger')).toHaveCount(0);
  }

  await page.goto('admin#/users');
  await page.locator('tr.clickable', { hasText: ADMIN.email }).click();
  await expect(page).toHaveURL(/#\/users\/\d+/);
  await expect(page.locator('.admin-app')).toContainText(ADMIN.email);
});

test('my account lists the transfers and every tab renders', async ({ page }) => {
  await login(page);
  const name = `mine-${ Date.now() }.txt`;
  await uploadText(page, name, 'mine');

  await page.goto('account');
  await expect(page.locator('.my-account')).toContainText(name);
  for (const tab of ['profile', 'security', 'sessions', 'data', 'transfers']) {
    await page.locator(`.my-account .nav-tabs a[href="#${ tab }"]`).click();
    await expect(page.locator('.my-account .nav-tabs li.active a')).toHaveAttribute('href', `#${ tab }`);
  }
});
