import { test, expect } from '@playwright/test';

// screenshots of every screen in light and dark, kept as a CI artifact to review the interface
const ADMIN = { email: 'admin@flyto.test', password: 'e2e-admin-password' };
const DIR = 'screens';

test.skip(!process.env.FLYTO_SCREENSHOTS, 'only when FLYTO_SCREENSHOTS is set');

async function shoot(page, testInfo, name) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    await page.screenshot({ path: `${ DIR }/${ testInfo.project.name }-${ colorScheme }-${ name }.png`, fullPage: true });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

test('screens', async ({ page }, testInfo) => {
  test.setTimeout(120000);

  await page.goto('./');
  await shoot(page, testInfo, '01-upload-logged-out');
  await page.goto('login');
  await shoot(page, testInfo, '02-login');

  await page.locator('#email').fill(ADMIN.email);
  await page.locator('#password').fill(ADMIN.password);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(/\/admin/);

  await page.goto('./');
  await expect(page.locator('.dropzone')).toBeVisible();
  await shoot(page, testInfo, '03-upload-empty');

  await page.locator('#fileInput').setInputFiles([
    { name: 'rapport-annuel-2026.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(240000, 1) },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Ordre du jour\n- budget\n- planning\n') },
    { name: 'photos-vacances.zip', mimeType: 'application/zip', buffer: Buffer.alloc(900000, 2) },
  ]);
  await page.locator('.file-comment').first().fill('Version finale');
  await shoot(page, testInfo, '04-upload-files');

  await page.locator('#password').fill('soleil-42');
  await page.locator('#uploadBtn').click();
  await expect(page.locator('.share-link a')).toBeVisible({ timeout: 20000 });
  await shoot(page, testInfo, '05-ticket');
  const url = await page.locator('.share-link a').getAttribute('href');

  await page.context().clearCookies();
  await page.goto(url);
  await expect(page.locator('#downloadPassword')).toBeVisible();
  await shoot(page, testInfo, '06-download-locked');
  await page.locator('#downloadPassword').fill('soleil-42');
  await page.locator('button.decrypt').click();
  await expect(page.locator('.manifest-row').first()).toBeVisible();
  await shoot(page, testInfo, '07-download');
  await page.locator('.manifest-row', { hasText: 'notes.txt' }).getByTitle('Preview').click();
  await expect(page.locator('.preview-modal pre')).toBeVisible();
  await shoot(page, testInfo, '08-preview');
  await page.keyboard.press('Escape');

  await page.goto('nope-nope-nope');
  await shoot(page, testInfo, '09-download-missing');

  await page.goto('login');
  await page.locator('#email').fill(ADMIN.email);
  await page.locator('#password').fill(ADMIN.password);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(/\/admin/);
  for (const tab of ['dashboard', 'users', 'transfers', 'downloads', 'invites', 'audit', 'settings', 'system']) {
    await page.goto(`admin#/${ tab }`);
    await page.locator('.admin-tabs a[aria-current="page"]').waitFor();
    await shoot(page, testInfo, `10-admin-${ tab }`);
  }
  await page.goto('admin#/users');
  await page.locator('tr.clickable').first().click();
  await expect(page.locator('.back-link')).toBeVisible();
  await shoot(page, testInfo, '11-admin-user');
  await page.goto('admin#/transfers');
  await page.locator('tr.clickable').first().click();
  await expect(page.locator('.back-link')).toBeVisible();
  await shoot(page, testInfo, '12-admin-transfer');

  for (const tab of ['transfers', 'profile', 'security', 'sessions', 'data']) {
    await page.goto(`account#${ tab }`);
    await page.locator('.my-account .tabs a[aria-current="page"]').waitFor();
    await shoot(page, testInfo, `13-account-${ tab }`);
  }

  await page.goto('admin/nothing-here');
  await shoot(page, testInfo, '14-error');
});
