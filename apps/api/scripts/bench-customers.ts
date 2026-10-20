/**
 * Measures the customer list end to end over HTTP (guards, tenant scoping, validation,
 * serialisation) against the performance dataset, and fails if any p95 is over budget.
 *
 *   pnpm db:seed:perf
 *   pnpm --filter @pointshub/api start      # in another terminal
 *   pnpm perf:customers
 *
 * Requests are sequential, so the numbers are per-request latency, not throughput.
 */
import type { Customer, MeResponse, Paginated, Tier } from '@pointshub/shared';

const API = `${process.env.API_URL ?? 'http://localhost:4000'}/api/v1`;
const OWNER = { email: 'owner@loadtest.demo', password: 'DemoPass123!' };
const PAGE_SIZE = 25;
const WARMUP = 5;
const RUNS = 50;
const P95_BUDGET_MS = 300;

let cookie = '';

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { cookie, 'x-requested-with': 'bench', 'content-type': 'application/json' },
  });
  if (!res.ok)
    throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`);
  return res;
}

async function getJson<T>(path: string): Promise<T> {
  return (await request(path)).json() as Promise<T>;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

async function measure(path: string) {
  const timings: number[] = [];
  for (let i = 0; i < WARMUP + RUNS; i++) {
    const started = performance.now();
    await (await request(path)).arrayBuffer();
    if (i >= WARMUP) timings.push(performance.now() - started);
  }
  timings.sort((a, b) => a - b);
  return { p50: percentile(timings, 50), p95: percentile(timings, 95), max: timings.at(-1)! };
}

async function main(): Promise<void> {
  const login = await request('/auth/login', { method: 'POST', body: JSON.stringify(OWNER) });
  cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const tenantId = ((await login.json()) as MeResponse).memberships[0]!.tenantId;
  const base = `/tenants/${tenantId}/customers`;

  const tiers = await getJson<Paginated<Tier>>(`/tenants/${tenantId}/tiers`);
  const gold = tiers.data.find((t) => t.name === 'Gold')!;

  // A cursor 20 pages in, to show keyset pagination does not slow down with depth.
  let cursor = '';
  for (let page = 1; page < 20; page++) {
    const res = await getJson<Paginated<Customer>>(
      `${base}?limit=${PAGE_SIZE}${cursor && `&cursor=${cursor}`}`,
    );
    cursor = res.pageInfo.nextCursor!;
  }
  const someone = (await getJson<Paginated<Customer>>(`${base}?limit=1&sort=points`)).data[0]!;

  const scenarios: Array<[string, string]> = [
    ['Newest first (default)', `${base}?limit=${PAGE_SIZE}`],
    ['Sorted by name', `${base}?limit=${PAGE_SIZE}&sort=name`],
    ['Sorted by points', `${base}?limit=${PAGE_SIZE}&sort=points`],
    ['Page 20 (cursor)', `${base}?limit=${PAGE_SIZE}&cursor=${cursor}`],
    ['Search, common name ("patel")', `${base}?limit=${PAGE_SIZE}&q=patel`],
    ['Search by email ("olivia.patel.4")', `${base}?limit=${PAGE_SIZE}&q=olivia.patel.4`],
    ['Search by phone ("0712")', `${base}?limit=${PAGE_SIZE}&q=0712`],
    ['Search, no match', `${base}?limit=${PAGE_SIZE}&q=zzzqx`],
    ['Filter by tier (Gold)', `${base}?limit=${PAGE_SIZE}&tierId=${gold.id}`],
    ['Filter by tag ("vip")', `${base}?limit=${PAGE_SIZE}&tag=vip`],
    ['Tag + sorted by points', `${base}?limit=${PAGE_SIZE}&tag=vip&sort=points`],
    ['Customer ledger', `${base}/${someone.id}/ledger?limit=${PAGE_SIZE}`],
  ];

  console.log(`${RUNS} sequential requests each, after ${WARMUP} warm-up requests\n`);
  console.log('| Scenario | p50 (ms) | p95 (ms) | max (ms) |');
  console.log('| --- | ---: | ---: | ---: |');
  const overBudget: string[] = [];
  for (const [name, path] of scenarios) {
    const { p50, p95, max } = await measure(path);
    console.log(`| ${name} | ${p50.toFixed(1)} | ${p95.toFixed(1)} | ${max.toFixed(1)} |`);
    if (p95 > P95_BUDGET_MS) overBudget.push(name);
  }

  if (overBudget.length > 0) {
    console.error(`\np95 over ${P95_BUDGET_MS} ms: ${overBudget.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
