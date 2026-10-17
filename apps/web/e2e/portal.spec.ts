import { expect, test } from '@playwright/test';
import type { MeResponse } from '@pointshub/shared';
import { emailLink, PASSWORD, uniqueEmail } from './support';

const csrf = { 'X-Requested-With': 'XMLHttpRequest' };

test('a new customer joins a business from its portal', async ({ page, request }) => {
  const email = uniqueEmail('member');
  // The business and its catalogue are set up through the API; this test is about the portal.
  const registered = await request.post('/api/v1/auth/register', {
    headers: csrf,
    data: {
      name: 'Pat Owner',
      email: uniqueEmail('owner'),
      password: PASSWORD,
      businessName: 'Portal Bakery',
    },
  });
  expect(registered.ok()).toBe(true);
  const { tenantId, tenantSlug } = ((await registered.json()) as MeResponse).memberships[0]!;
  const reward = await request.post(`/api/v1/tenants/${tenantId}/rewards`, {
    headers: csrf,
    data: { name: 'Cinnamon bun', pointsCost: 50 },
  });
  expect(reward.ok()).toBe(true);

  // Signed-out visitors land on the sign-in page.
  await page.goto(`/c/${tenantSlug}`);
  await expect(page).toHaveURL(new RegExp(`/c/${tenantSlug}/login\\?next=`));
  await expect(
    page.getByRole('heading', { name: 'Sign in to Portal Bakery rewards' }),
  ).toBeVisible();
  await expect(page.getByText('Earn 1 point for every £1 you spend.')).toBeVisible();

  await page.getByRole('link', { name: 'Join the rewards programme' }).click();
  await page.getByLabel('Your name').fill('Mia Member');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  await page.goto(await emailLink(request, email, /http\S+\/set-password\?token=\S+/));
  await page.getByLabel('New password').fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Save and sign in' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Hi, Mia' })).toBeVisible();
  await expect(page.getByText('500 to Silver')).toBeVisible();
  await expect(page.getByText('No points yet')).toBeVisible();

  const account = page.getByRole('navigation', { name: 'Account' });
  await account.getByRole('link', { name: 'Rewards' }).click();
  await expect(page.getByRole('heading', { name: 'Cinnamon bun' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '50 more points needed for Cinnamon bun' }),
  ).toBeDisabled();

  await account.getByRole('link', { name: 'My codes' }).click();
  await expect(page.getByText('No rewards redeemed yet')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(
    page.getByRole('heading', { name: 'Sign in to Portal Bakery rewards' }),
  ).toBeVisible();
});

test('an unknown business shows a not-found page', async ({ page }) => {
  await page.goto('/c/no-such-business/login');
  await expect(page.getByText('Business not found')).toBeVisible();
});
