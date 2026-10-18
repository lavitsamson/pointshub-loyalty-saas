import { expect, test } from '@playwright/test';
import { addCustomer, registerBusiness, uniqueEmail } from './support';

// Stripe Checkout itself is covered by the API's webhook tests; here the owner sees their plan.
test('the owner sees their plan and how much of it is used', async ({ page }) => {
  const { base } = await registerBusiness(page, 'E2E Billing Bistro');
  await addCustomer(page, base, 'Dana Diner', uniqueEmail('billing'));

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Billing' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Billing' })).toBeVisible();
  await expect(page.getByText('Free, for up to 100 customers.')).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Customers' })).toHaveAttribute(
    'aria-valuetext',
    '1 of 100 customers',
  );
  await expect(page.getByRole('heading', { name: 'Plans' })).toBeVisible();
  await expect(page.getByText('Unlimited customers')).toBeVisible();
});
