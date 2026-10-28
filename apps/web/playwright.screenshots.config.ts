import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Captures the README screenshots from the seeded demo business (`pnpm screenshots`).
 * Same servers and demo sign-in as the e2e suite; not part of `pnpm test:e2e`.
 */
export default defineConfig({
  ...base,
  testDir: './screenshots',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  projects: [
    { name: 'setup', testDir: './e2e', testMatch: /demo\.setup\.ts/ },
    { name: 'screenshots', dependencies: ['setup'] },
  ],
});
