import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export const PASSWORD = 'correct horse battery staple';

export const uniqueEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@example.test`;

/** Registers a brand-new business and lands on its dashboard. */
export async function registerBusiness(page: Page, businessName = 'E2E Coffee House') {
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Erin Owner');
  await page.getByLabel('Email').fill(uniqueEmail('owner'));
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Business name').fill(businessName);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  return { base: page.url().replace(/\/dashboard$/, '') };
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
