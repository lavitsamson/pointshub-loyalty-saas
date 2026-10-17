import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Merchant flows are desktop-first; the phone run covers the public pages and the portal.
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /(home|portal)\.spec\.ts/ },
  ],
  // Start the production builds of the API and web app, unless pointed at a running deployment.
  // Both read the repository's .env; infrastructure comes from docker compose.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'pnpm --filter @pointshub/api start',
          url: 'http://localhost:4000/api/v1/health/live',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: 'pnpm start',
          port: PORT,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});
