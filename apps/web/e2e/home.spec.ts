import { expect, test } from '@playwright/test';

test('home page introduces the product', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('PointsHub');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Loyalty programmes');
  await expect(page.getByRole('listitem')).toHaveCount(3);
});

test('pages are served with security headers and run within their policy', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(message.text());
  });

  const response = await page.goto('/login');
  const headers = response!.headers();
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('same-origin');
  expect(headers['x-content-type-options']).toBe('nosniff');

  // The page hydrates (the theme switch works) and nothing was blocked along the way.
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(violations).toEqual([]);
});
