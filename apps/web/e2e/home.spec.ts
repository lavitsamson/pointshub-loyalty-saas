import { expect, test } from '@playwright/test';

test('home page introduces the product', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('PointsHub');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Loyalty programmes');
  await expect(page.getByRole('listitem')).toHaveCount(3);
});
