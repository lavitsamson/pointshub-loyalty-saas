import { createPrismaClient, type PrismaClient } from '@pointshub/db';
import { randomUUID } from 'node:crypto';
import { currentTenantContext, runInTenantContext } from '../src/tenancy/tenant-context';
import { TenantScopeError, withTenantScope } from '../src/tenancy/tenant-scope';
import { testEnv } from './support/infra';

describe('Tenant-scoped Prisma client (real database)', () => {
  let base: PrismaClient;
  let scoped: ReturnType<typeof withTenantScope>;
  let tenantA: string;
  let tenantB: string;
  let tierB: string;

  // Prisma queries are lazy: they run when awaited, so the await must happen inside the context.
  const inTenant = <T>(tenantId: string, fn: () => PromiseLike<T>) =>
    runInTenantContext({ tenantId }, async () => await fn());

  beforeAll(async () => {
    base = createPrismaClient({ connectionString: testEnv().DATABASE_URL });
    scoped = withTenantScope(base, () => currentTenantContext()?.tenantId);

    const [a, b] = await Promise.all(
      ['A', 'B'].map((n) =>
        base.tenant.create({ data: { name: `Scope ${n}`, slug: `scope-${randomUUID()}` } }),
      ),
    );
    tenantA = a!.id;
    tenantB = b!.id;
    const tier = { name: 'Gold', minLifetimePoints: 1500, multiplier: '1.5', sortOrder: 1 };
    await base.tier.create({ data: { ...tier, tenantId: tenantA } });
    tierB = (await base.tier.create({ data: { ...tier, tenantId: tenantB } })).id;
  });

  afterAll(async () => {
    await base.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await base.$disconnect();
  });

  it('only returns rows of the current tenant', async () => {
    const tiers = await inTenant(tenantA, () => scoped.tier.findMany());
    expect(tiers.map((t) => t.tenantId)).toEqual([tenantA]);
  });

  it('cannot read another tenant’s row even by primary key', async () => {
    await expect(
      inTenant(tenantA, () => scoped.tier.findUnique({ where: { id: tierB } })),
    ).resolves.toBeNull();
  });

  it('cannot modify another tenant’s rows', async () => {
    const result = await inTenant(tenantA, () =>
      scoped.tier.updateMany({ where: { id: tierB }, data: { name: 'Hijacked' } }),
    );
    expect(result.count).toBe(0);
    expect((await base.tier.findUniqueOrThrow({ where: { id: tierB } })).name).toBe('Gold');
  });

  it('stamps the current tenant on new rows', async () => {
    const tier = await inTenant(tenantA, () =>
      scoped.tier.create({
        data: { name: 'Platinum', minLifetimePoints: 5000, multiplier: '2', sortOrder: 2 } as never,
      }),
    );
    expect(tier.tenantId).toBe(tenantA);
  });

  it('keeps the scope inside interactive transactions', async () => {
    const count = await inTenant(tenantA, () =>
      scoped.$transaction((tx) => tx.tier.count({ where: { id: tierB } })),
    );
    expect(count).toBe(0);
  });

  it('refuses to run without a tenant context', async () => {
    await expect(scoped.tier.findMany()).rejects.toThrow(TenantScopeError);
  });

  it('fails closed when a query built inside the context is executed outside it', async () => {
    const escaped = runInTenantContext({ tenantId: tenantA }, () => scoped.tier.findMany());
    await expect(escaped).rejects.toThrow(TenantScopeError);
  });

  it('leaves models that are not tenant-owned alone', async () => {
    await expect(scoped.tenant.count({ where: { id: tenantB } })).resolves.toBe(1);
  });
});
