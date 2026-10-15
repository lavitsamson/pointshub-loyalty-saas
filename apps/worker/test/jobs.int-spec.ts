import { RedisLockService } from '../src/infra/redis-lock.service';
import { ExpiryWarningsService } from '../src/jobs/expiry-warnings.service';
import { PointsExpiryService } from '../src/jobs/points-expiry.service';
import { ScheduledJobs } from '../src/jobs/scheduled-jobs';
import {
  createCustomer,
  createTenant,
  daysFrom,
  drainOutbox,
  ledgerSum,
  writeHistory,
} from './support/fixtures';
import { eventually, startWorker, type TestWorker } from './support/harness';

describe('Scheduled jobs', () => {
  let worker: TestWorker;
  const now = new Date();

  beforeAll(async () => {
    worker = await startWorker();
  });

  afterAll(() => worker.close());

  const eventsFor = (tenantId: string, type: string) =>
    worker.prisma.outboxEvent.findMany({ where: { tenantId, type } });

  describe('points expiry', () => {
    it('writes off unspent points from expired lots, oldest first, and keeps the ledger consistent', async () => {
      const { id: tenantId } = await createTenant(worker.prisma);
      const customer = await createCustomer(worker.prisma, tenantId);
      await writeHistory(worker.prisma, tenantId, customer.id, [
        // 100 expired yesterday; 50 expire next month; spending 30 came out of the first lot.
        { type: 'EARN', points: 100, at: daysFrom(now, -400), expiresAt: daysFrom(now, -1) },
        { type: 'EARN', points: 50, at: daysFrom(now, -10), expiresAt: daysFrom(now, 30) },
        { type: 'REDEEM', points: -30, at: daysFrom(now, -5) },
      ]);

      await worker.get(PointsExpiryService).expireDue(now);

      const after = await worker.prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
      expect(after.pointsBalance).toBe(50);
      expect(await ledgerSum(worker.prisma, customer.id)).toBe(50);

      const entry = await worker.prisma.pointsLedgerEntry.findFirstOrThrow({
        where: { customerId: customer.id, type: 'EXPIRE' },
      });
      expect(entry).toMatchObject({ points: -70, balanceAfter: 50, reason: 'Points expired' });

      const [event] = await eventsFor(tenantId, 'points.expired');
      expect(event?.payload).toMatchObject({
        customerId: customer.id,
        points: -70,
        balanceAfter: 50,
      });
    });

    it('does nothing on a second run', async () => {
      const { id: tenantId } = await createTenant(worker.prisma);
      const customer = await createCustomer(worker.prisma, tenantId);
      await writeHistory(worker.prisma, tenantId, customer.id, [
        { type: 'EARN', points: 80, at: daysFrom(now, -400), expiresAt: daysFrom(now, -2) },
      ]);
      const expiry = worker.get(PointsExpiryService);

      await expiry.expireDue(now);
      await expiry.expireDue(now);

      expect(
        await worker.prisma.pointsLedgerEntry.count({
          where: { customerId: customer.id, type: 'EXPIRE' },
        }),
      ).toBe(1);
      expect(await eventsFor(tenantId, 'points.expired')).toHaveLength(1);
    });

    it('leaves points that were already spent or never expire', async () => {
      const { id: tenantId } = await createTenant(worker.prisma);
      const customer = await createCustomer(worker.prisma, tenantId);
      await writeHistory(worker.prisma, tenantId, customer.id, [
        { type: 'EARN', points: 60, at: daysFrom(now, -400), expiresAt: daysFrom(now, -1) },
        { type: 'REDEEM', points: -60, at: daysFrom(now, -100) },
        { type: 'ADJUST', points: 25, at: daysFrom(now, -50) },
      ]);

      await worker.get(PointsExpiryService).expireDue(now);

      const after = await worker.prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
      expect(after.pointsBalance).toBe(25);
      expect(await eventsFor(tenantId, 'points.expired')).toHaveLength(0);
    });
  });

  describe('expiry warnings', () => {
    it('raises an event for unspent points expiring in seven days', async () => {
      const { id: tenantId } = await createTenant(worker.prisma);
      const soon = await createCustomer(worker.prisma, tenantId, 'Soon Expiring');
      const spent = await createCustomer(worker.prisma, tenantId, 'Already Spent');
      const later = await createCustomer(worker.prisma, tenantId, 'Expires Later');
      const inSevenDays = daysFrom(now, 7);

      await writeHistory(worker.prisma, tenantId, soon.id, [
        { type: 'EARN', points: 90, at: daysFrom(now, -300), expiresAt: inSevenDays },
        { type: 'REDEEM', points: -20, at: daysFrom(now, -100) },
      ]);
      await writeHistory(worker.prisma, tenantId, spent.id, [
        { type: 'EARN', points: 40, at: daysFrom(now, -300), expiresAt: inSevenDays },
        { type: 'REDEEM', points: -40, at: daysFrom(now, -100) },
      ]);
      await writeHistory(worker.prisma, tenantId, later.id, [
        { type: 'EARN', points: 40, at: daysFrom(now, -300), expiresAt: daysFrom(now, 9) },
      ]);

      const result = await worker.get(ExpiryWarningsService).warnExpiringSoon(now);

      expect(result.expiresOn).toBe(inSevenDays.toISOString().slice(0, 10));
      const events = await eventsFor(tenantId, 'points.expiring');
      expect(events.map((e) => e.payload)).toEqual([
        { customerId: soon.id, points: 70, expiresOn: result.expiresOn },
      ]);
    });

    it('runs once per day even if triggered again, and the customer gets one email', async () => {
      await drainOutbox(worker.prisma);
      const tenant = await createTenant(worker.prisma, 'Daily Grind');
      const customer = await createCustomer(worker.prisma, tenant.id, 'Leo Martin');
      const runAt = daysFrom(now, 1000); // a day no other test uses, so the marker is fresh
      await writeHistory(worker.prisma, tenant.id, customer.id, [
        { type: 'EARN', points: 300, at: now, expiresAt: daysFrom(runAt, 7) },
      ]);
      const jobs = worker.get(ScheduledJobs);

      await jobs.warnExpiringSoon(runAt);
      await jobs.warnExpiringSoon(runAt);

      expect(await eventsFor(tenant.id, 'points.expiring')).toHaveLength(1);
      const [email] = await eventually(() => {
        const sent = worker.mailbox.to(customer.email);
        if (sent.length === 0) throw new Error('no email yet');
        return sent;
      });
      expect(email?.subject).toMatch(/^300 points expire on /);
      expect(worker.mailbox.to(customer.email)).toHaveLength(1);
    });
  });

  describe('job lock', () => {
    it('lets only one instance run a job at a time', async () => {
      const lock = worker.get(RedisLockService);
      let release!: () => void;
      const running = new Promise<void>((resolve) => (release = resolve));

      const first = lock.runExclusive('test-job', 10_000, () => running.then(() => 'first'));
      const second = await lock.runExclusive('test-job', 10_000, () => Promise.resolve('second'));
      release();

      expect(second).toEqual({ acquired: false });
      expect(await first).toEqual({ acquired: true, result: 'first' });
      // Released afterwards, so the next run can take it.
      expect(await lock.runExclusive('test-job', 10_000, () => Promise.resolve('next'))).toEqual({
        acquired: true,
        result: 'next',
      });
    });
  });
});
