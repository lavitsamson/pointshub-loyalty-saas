import { expect, test } from '@playwright/test';
import { addCustomer, registerBusiness, uniqueEmail } from './support';

test('a new business sets up its programme and serves a customer end to end', async ({ page }) => {
  const { base } = await registerBusiness(page);
  const nav = page.getByRole('navigation', { name: 'Main' });

  // Programme: 2 points per pound.
  await nav.getByRole('link', { name: 'Programme' }).click();
  const rate = page.getByLabel(/Points per GBP/);
  await rate.fill('2');
  await page.getByRole('button', { name: 'Save changes' }).nth(1).click();
  await expect(page.getByText('Earning rules saved', { exact: true })).toBeVisible();

  // A reward worth redeeming.
  await nav.getByRole('link', { name: 'Rewards' }).click();
  await page.getByRole('button', { name: 'New reward' }).click();
  const rewardDialog = page.getByRole('dialog', { name: 'New reward' });
  await rewardDialog.getByLabel('Name').fill('Free flat white');
  await rewardDialog.getByLabel('Points cost').fill('20');
  await rewardDialog.getByRole('button', { name: 'Save reward' }).click();
  await expect(page.getByRole('heading', { name: 'Free flat white' })).toBeVisible();

  // A customer, then a purchase at the till: £12.50 × 2 points × Bronze 1.0 = 25 points.
  const email = uniqueEmail('customer');
  await addCustomer(page, base, 'Casey Customer', email);
  await nav.getByRole('link', { name: 'Record purchase' }).click();
  await page.getByLabel('Search by email, phone or name').fill(email);
  await page.getByRole('button', { name: /Casey Customer/ }).click();
  await page.getByLabel(/Amount/).fill('12.50');
  await page.getByRole('button', { name: 'Record purchase' }).click();
  await expect(page.getByText('+25 points for Casey Customer')).toBeVisible();

  // Redeem at the counter from the customer's page.
  await page.getByRole('link', { name: 'View customer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Casey Customer' })).toBeVisible();
  await page.getByRole('button', { name: 'Redeem reward' }).click();
  const redeemDialog = page.getByRole('dialog', { name: 'Redeem a reward' });
  await redeemDialog.getByRole('button', { name: 'Redeem', exact: true }).click();
  const codeText = page.getByRole('dialog', { name: 'Reward redeemed' }).locator('.font-mono');
  const code = (await codeText.textContent())?.trim() ?? '';
  expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('cell', { name: /Redeemed/ })).toBeVisible();

  // Staff fulfil it by code.
  await nav.getByRole('link', { name: 'Redemptions' }).click();
  await page.getByLabel('Redemption code').fill(code.toLowerCase());
  await page.getByRole('button', { name: 'Find' }).click();
  // The pending list below has its own Fulfil buttons; act on the looked-up redemption only.
  const lookup = page.getByRole('region', { name: 'Code lookup result' });
  await lookup.getByRole('button', { name: 'Fulfil', exact: true }).click();
  await expect(page.getByText('Free flat white handed over', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fulfilled', exact: true }).click();
  await expect(page.getByRole('cell', { name: code })).toBeVisible();
});

test('signed-out visitors are sent to the login page and back', async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login\?next=%2Fapp$/);
  await expect(page.getByRole('heading', { name: 'Sign in to PointsHub' })).toBeVisible();
});
