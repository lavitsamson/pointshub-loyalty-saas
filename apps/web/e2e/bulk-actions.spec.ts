import { expect, test } from '@playwright/test';
import { addCustomer, registerBusiness, uniqueEmail } from './support';

test('bulk actions tag and credit several customers at once', async ({ page }) => {
  const { base } = await registerBusiness(page, 'E2E Bulk Bakery');
  const names = ['Alex Able', 'Blair Baker', 'Cory Cole'];
  for (const name of names) await addCustomer(page, base, name, uniqueEmail('bulk'));

  await page.goto(`${base}/customers`);
  await page.getByLabel('Select all customers on this page').check();
  const bar = page.getByRole('region', { name: 'Bulk actions' });
  await expect(bar.getByText('3 selected')).toBeVisible();

  await bar.getByRole('button', { name: 'Add tag' }).click();
  const tagDialog = page.getByRole('dialog', { name: 'Add a tag' });
  await tagDialog.getByLabel('Tag').fill('Regulars');
  await tagDialog.getByRole('button', { name: 'Add tag' }).click();
  await expect(page.getByText('3 customers updated.', { exact: true })).toBeVisible();
  await expect(bar).toBeHidden();

  await page.getByLabel('Select all customers on this page').check();
  await bar.getByRole('button', { name: 'Adjust points' }).click();
  const pointsDialog = page.getByRole('dialog', { name: 'Adjust points' });
  await pointsDialog.getByLabel('Points').fill('50');
  await pointsDialog.getByLabel('Reason').fill('Grand opening bonus');
  await pointsDialog.getByRole('button', { name: 'Adjust points' }).click();
  await expect(page.getByText('Points adjusted', { exact: true })).toBeVisible();

  // Tags are normalised to lower case; filtering finds all three, each with 50 points.
  await page.getByLabel('Filter by tag').fill('regulars');
  const rows = page.getByRole('row').filter({ has: page.getByRole('link') });
  await expect(rows).toHaveCount(3);
  for (const name of names) {
    await expect(
      rows.filter({ hasText: name }).getByRole('cell', { name: '50' }).first(),
    ).toBeVisible();
  }
});
