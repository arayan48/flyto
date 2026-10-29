import { test as setup, expect } from '@playwright/test';

// one login for the whole run: Flyto rate-limits logins per account
setup('log in as the admin', async ({ page }) => {
  await page.goto('login');
  await page.locator('#email').fill('admin@flyto.test');
  await page.locator('#password').fill('e2e-admin-password');
  await page.locator('form button[type=submit]').click();
  await expect(page).toHaveURL(/\/admin/);
  await page.context().storageState({ path: 'e2e/.auth/admin.json' });
});
