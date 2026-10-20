import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import type { Customer, MeResponse, Paginated } from '@pointshub/shared';

/**
 * Automated WCAG 2.2 A/AA checks (axe-core) on every page, in light and dark themes, using the
 * seeded demo business so tables, charts and badges are full of realistic data.
 * Needs `pnpm db:seed`. Automated checks catch only part of accessibility problems, so focus
 * handling is tested directly below, and the journeys in the other specs drive the app through
 * roles and labels as assistive technology would.
 */

const DEMO_PASSWORD = 'DemoPass123!';
const SLUG = 'bean-and-brew';
const csrf = { 'X-Requested-With': 'XMLHttpRequest' };
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
  // Soft, so one run reports every page's problems rather than stopping at the first.
  expect.soft(summary, `accessibility violations on ${label}`).toEqual([]);
}

test('keyboard users can skip the navigation and get focus back from dialogs', async ({ page }) => {
  const login = await page.request.post('/api/v1/auth/login', {
    headers: csrf,
    data: { email: 'owner@beanbrew.demo', password: DEMO_PASSWORD },
  });
  const tenantId = ((await login.json()) as MeResponse).memberships[0]!.tenantId;
  await page.goto(`/app/${tenantId}/customers`);
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

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test('public and sign-in pages', async ({ page }) => {
      for (const path of [
        '/',
        '/login',
        '/register',
        '/forgot-password',
        '/reset-password?token=example',
        '/register/complete?token=example',
        `/c/${SLUG}/login`,
        `/c/${SLUG}/register`,
        `/c/${SLUG}/forgot-password`,
      ]) {
        await expectAccessible(page, path);
      }
    });

    test('merchant dashboard pages', async ({ page }) => {
      const login = await page.request.post('/api/v1/auth/login', {
        headers: csrf,
        data: { email: 'owner@beanbrew.demo', password: DEMO_PASSWORD },
      });
      expect(login.ok(), 'demo owner login (run pnpm db:seed)').toBe(true);
      const tenantId = ((await login.json()) as MeResponse).memberships[0]!.tenantId;
      const customers = await page.request.get(`/api/v1/tenants/${tenantId}/customers?limit=1`);
      const customer = ((await customers.json()) as Paginated<Customer>).data[0]!;

      const base = `/app/${tenantId}`;
      for (const path of [
        'dashboard',
        'customers',
        `customers/${customer.id}`,
        'record-purchase',
        'rewards',
        'redemptions',
        'program',
        'team',
        'billing',
        'audit-log',
      ]) {
        await expectAccessible(page, `${base}/${path}`);
      }

      // Dialogs, with their forms.
      await page.goto(`${base}/customers`);
      await page.getByRole('button', { name: 'Add customer' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Add a customer' })).toBeVisible();
      await expectNoViolations(page, 'add customer dialog');
    });

    test('customer portal pages', async ({ page }) => {
      const login = await page.request.post(`/api/v1/portal/${SLUG}/auth/login`, {
        headers: csrf,
        data: { email: 'customer@beanbrew.demo', password: DEMO_PASSWORD },
      });
      expect(login.ok(), 'demo customer login (run pnpm db:seed)').toBe(true);

      for (const path of ['', '/rewards', '/activity', '/redemptions']) {
        await expectAccessible(page, `/c/${SLUG}${path}`);
      }
    });
  });
}
