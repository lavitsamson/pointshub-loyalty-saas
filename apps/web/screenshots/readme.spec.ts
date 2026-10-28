import { devices, expect, type Page, test } from '@playwright/test';
import type { Customer, MeResponse, Paginated } from '@pointshub/shared';
import path from 'node:path';
import { DEMO_SLUG, DEMO_STATE } from '../e2e/support';

const OUT_DIR = path.resolve(__dirname, '../../../docs/images');

test.use({ storageState: DEMO_STATE });

/** Waits for data and chart animations to settle, then saves the viewport. */
async function capture(page: Page, url: string, name: string) {
  await page.goto(url);
  await expect(page.locator('main h1').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

async function demoTenantId(page: Page): Promise<string> {
  const me = await page.request.get('/api/v1/auth/me');
  expect(me.ok(), 'demo owner session').toBe(true);
  return ((await me.json()) as MeResponse).memberships[0]!.tenantId;
}

test.describe('merchant dashboard', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`dashboard (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await capture(page, `/app/${await demoTenantId(page)}/dashboard`, `dashboard-${colorScheme}`);
    });
  }

  test('customers', async ({ page }) => {
    await capture(page, `/app/${await demoTenantId(page)}/customers`, 'customers');
  });

  test('customer profile', async ({ page }) => {
    const tenantId = await demoTenantId(page);
    const list = await page.request.get(`/api/v1/tenants/${tenantId}/customers`, {
      params: { q: 'customer@beanbrew.demo', limit: 1 },
    });
    const customer = ((await list.json()) as Paginated<Customer>).data[0];
    expect(customer, 'the seeded portal customer').toBeDefined();
    await capture(page, `/app/${tenantId}/customers/${customer!.id}`, 'customer-profile');
  });
});

test.describe('customer portal', () => {
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices['Pixel 7'];
  test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent });

  test('portal home', async ({ page }) => {
    await capture(page, `/c/${DEMO_SLUG}`, 'portal-home');
  });

  test('portal rewards', async ({ page }) => {
    await capture(page, `/c/${DEMO_SLUG}/rewards`, 'portal-rewards');
  });
});
