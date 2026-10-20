import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import type { Customer, MeResponse, Paginated } from '@pointshub/shared';
import { DEMO_SLUG, DEMO_STATE } from './support';

/**
 * Automated WCAG 2.2 A/AA checks (axe-core) on every page, in light and dark themes, using the
 * seeded demo business so tables, charts and badges are full of realistic data.
 * Needs `pnpm db:seed`. Automated checks catch only part of accessibility problems, so focus
 * handling is tested directly below, and the journeys in the other specs drive the app through
 * roles and labels as assistive technology would.
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectAccessible(page: Page, path: string) {
  await page.goto(path);
  // Still on the page asked for: not bounced to a sign-in page.
  expect(new URL(page.url()).pathname).toBe(path.split('?')[0]);
  await expect(page.locator('main h1').first()).toBeVisible();
  // Let queries settle so the scan sees loaded data rather than skeletons.
  await page.waitForLoadState('networkidle');
  await expectNoViolations(page, path);
}

async function expectNoViolations(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }));
  expect(summary, `accessibility violations on ${label}`).toEqual([]);
}

async function demoTenantId(request: APIRequestContext): Promise<string> {
  const me = await request.get('/api/v1/auth/me');
  expect(me.ok(), 'demo owner session').toBe(true);
  return ((await me.json()) as MeResponse).memberships[0]!.tenantId;
}

const PUBLIC_PAGES = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password?token=example',
  '/register/complete?token=example',
  `/c/${DEMO_SLUG}/login`,
  `/c/${DEMO_SLUG}/register`,
  `/c/${DEMO_SLUG}/forgot-password`,
];

const MERCHANT_PAGES = [
  'dashboard',
  'customers',
  'record-purchase',
  'rewards',
  'redemptions',
  'program',
  'team',
  'billing',
  'audit-log',
];

const PORTAL_PAGES = ['', '/rewards', '/activity', '/redemptions'];

// One test per page: they run in parallel and a failure names its page.
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    for (const path of PUBLIC_PAGES) {
      test(`public ${path}`, async ({ page }) => {
        await expectAccessible(page, path);
      });
    }

    test.describe('signed in', () => {
      test.use({ storageState: DEMO_STATE });

      for (const path of MERCHANT_PAGES) {
        test(`merchant ${path}`, async ({ page }) => {
          await expectAccessible(page, `/app/${await demoTenantId(page.request)}/${path}`);
        });
      }

      test('merchant customer profile', async ({ page }) => {
        const tenantId = await demoTenantId(page.request);
        const customers = await page.request.get(`/api/v1/tenants/${tenantId}/customers?limit=1`);
        const customer = ((await customers.json()) as Paginated<Customer>).data[0]!;
        await expectAccessible(page, `/app/${tenantId}/customers/${customer.id}`);
      });

      test('merchant add customer dialog', async ({ page }) => {
        await page.goto(`/app/${await demoTenantId(page.request)}/customers`);
        await page.getByRole('button', { name: 'Add customer' }).first().click();
        await expect(page.getByRole('dialog', { name: 'Add a customer' })).toBeVisible();
        await expectNoViolations(page, 'add customer dialog');
      });

      for (const path of PORTAL_PAGES) {
        test(`portal ${path || '/'}`, async ({ page }) => {
          await expectAccessible(page, `/c/${DEMO_SLUG}${path}`);
        });
      }
    });
  });
}

test.describe('keyboard', () => {
  test.use({ storageState: DEMO_STATE });

  test('users can skip the navigation and get focus back from dialogs', async ({ page }) => {
    await page.goto(`/app/${await demoTenantId(page.request)}/customers`);
    await expect(page.getByRole('heading', { level: 1, name: 'Customers' })).toBeVisible();

    // The first Tab reaches a visible skip link.
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();

    // A dialog opened from the keyboard takes focus, closes on Escape and returns focus.
    const trigger = page.getByRole('button', { name: 'Add customer' }).first();
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Add a customer' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':focus')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
