import { expect, test as setup } from '@playwright/test';
import { DEMO_PASSWORD, DEMO_SLUG, DEMO_STATE } from './support';

/**
 * Signs in the seeded demo owner and portal customer once per run and saves their cookies, so
 * specs reading the demo business reuse one session instead of signing in per test (which
 * would soon hit the login rate limit). Needs `pnpm db:seed`.
 */
const csrf = { 'X-Requested-With': 'XMLHttpRequest' };

setup('sign in the demo accounts', async ({ request }) => {
  const owner = await request.post('/api/v1/auth/login', {
    headers: csrf,
    data: { email: 'owner@beanbrew.demo', password: DEMO_PASSWORD },
  });
  expect(owner.ok(), 'demo owner login (run pnpm db:seed)').toBe(true);

  const customer = await request.post(`/api/v1/portal/${DEMO_SLUG}/auth/login`, {
    headers: csrf,
    data: { email: 'customer@beanbrew.demo', password: DEMO_PASSWORD },
  });
  expect(customer.ok(), 'demo customer login (run pnpm db:seed)').toBe(true);

  await request.storageState({ path: DEMO_STATE });
});
