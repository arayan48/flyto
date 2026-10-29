import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

const PORT = 3100;
const AUTH = 'e2e/.auth/admin.json';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${ PORT }/`,
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    { name: 'chromium', dependencies: ['setup'], use: { ...devices['Desktop Chrome'], storageState: AUTH } },
    { name: 'mobile', dependencies: ['setup'], use: { ...devices['Pixel 7'], storageState: AUTH } },
  ],
  webServer: {
    command: 'node ../app.js',
    url: `http://localhost:${ PORT }/healthz`,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    env: {
      NODE_ENV: 'production',
      FLYTO_PORT: String(PORT),
      FLYTO_DB_URL: process.env.FLYTO_TEST_DB_URL || '',
      FLYTO_REDIS_URL: process.env.FLYTO_TEST_REDIS_URL || '',
      FLYTO_UPLOAD_DIR: path.join(os.tmpdir(), 'flyto-e2e'),
      FLYTO_ADMIN_EMAIL: 'admin@flyto.test',
      FLYTO_ADMIN_PASSWORD: 'e2e-admin-password',
    },
  },
});
