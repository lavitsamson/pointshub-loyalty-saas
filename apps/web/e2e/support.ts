import { type APIRequestContext, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export const PASSWORD = 'correct horse battery staple';

export const uniqueEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@example.test`;

export const SIGNUP_LINK = /http\S+\/register\/complete\?token=\S+/;

/**
 * Signs up a brand-new business, following the emailed link to choose a password, and lands
 * on its dashboard.
 */
export async function registerBusiness(page: Page, businessName = 'E2E Coffee House') {
  const email = uniqueEmail('owner');
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Erin Owner');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Business name').fill(businessName);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  await page.goto(await emailLink(page.request, email, SIGNUP_LINK));
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  return { base: page.url().replace(/\/dashboard$/, ''), email };
}

export async function addCustomer(page: Page, base: string, name: string, email: string) {
  await page.goto(`${base}/customers`);
  await page.getByRole('button', { name: 'Add customer' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add a customer' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByRole('button', { name: 'Add customer' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('link', { name })).toBeVisible();
}

const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

/** Waits for an email to `to` (delivered to Mailpit) and returns the first link matching `pattern`. */
export async function emailLink(
  request: APIRequestContext,
  to: string,
  pattern: RegExp,
): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await request.get(`${MAILPIT_URL}/api/v1/search`, {
          params: { query: `to:"${to}"` },
        });
        const { messages } = (await search.json()) as { messages: Array<{ ID: string }> };
        const latest = messages[0];
        if (!latest) return undefined;
        const message = await request.get(`${MAILPIT_URL}/api/v1/message/${latest.ID}`);
        link = pattern.exec(((await message.json()) as { Text: string }).Text)?.[0];
        return link;
      },
      { message: `an email with a link to ${to}` },
    )
    .toBeTruthy();
  return link!;
}
