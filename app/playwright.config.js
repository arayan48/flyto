const { defineConfig, devices } = require('@playwright/test');
const os = require('os');
const path = require('path');

const PORT = 3100;

module.exports = defineConfig({
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
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
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
