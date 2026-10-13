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
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // Start the production build unless pointed at an already-running deployment.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm start',
        port: PORT,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
