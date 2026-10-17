import { expect, test } from '@playwright/test';
import { addCustomer, emailLink, PASSWORD, registerBusiness, uniqueEmail } from './support';

test('a new business sets up its programme and serves a customer end to end', async ({
  page,
  browser,
  request,
}) => {
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

  // The customer joins the shop's portal on their own device. They were enrolled at the till,
  // so the emailed link sets up that account, with the 25 points already on it.
  const portalUrl = await nav.getByRole('link', { name: /Customer portal/ }).getAttribute('href');
  const phone = await (await browser.newContext()).newPage();
  await phone.goto(`${portalUrl}/register`);
  await phone.getByLabel('Your name').fill('Casey Customer');
  await phone.getByLabel('Email').fill(email);
  await phone.getByRole('button', { name: 'Join' }).click();
  await expect(phone.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  await phone.goto(await emailLink(request, email, /http\S+\/set-password\?token=\S+/));
  await phone.getByLabel('New password').fill(PASSWORD);
  await phone.getByLabel('Confirm password').fill(PASSWORD);
  await phone.getByRole('button', { name: 'Save and sign in' }).click();
  await expect(phone.getByRole('heading', { level: 1, name: 'Hi, Casey' })).toBeVisible();
  await expect(phone.getByText('25', { exact: true })).toBeVisible();

  // ...and redeems a reward, getting a code to show at the counter.
  await phone
    .getByRole('navigation', { name: 'Account' })
    .getByRole('link', { name: 'Rewards' })
    .click();
  await phone.getByRole('button', { name: 'Redeem for Free flat white' }).click();
  await phone
    .getByRole('dialog', { name: 'Redeem Free flat white?' })
    .getByRole('button', { name: 'Redeem', exact: true })
    .click();
  const codeText = phone.getByRole('dialog', { name: 'Your reward code' }).locator('.font-mono');
  const code = (await codeText.textContent())?.trim() ?? '';
  expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
  await phone.getByRole('button', { name: 'Done' }).click();
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

  // The customer sees it claimed.
  await phone.getByRole('link', { name: 'My codes' }).click();
  await expect(phone.getByText('Claimed', { exact: true })).toBeVisible();
});

test('signed-out visitors are sent to the login page and back', async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login\?next=%2Fapp$/);
  await expect(page.getByRole('heading', { name: 'Sign in to PointsHub' })).toBeVisible();
});
