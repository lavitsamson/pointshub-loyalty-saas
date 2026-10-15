import { EVENTS_EXCHANGE, type EventEnvelope } from '@pointshub/shared';
import { type Channel, type ChannelModel, connect, type GetMessage } from 'amqplib';
import { randomUUID } from 'node:crypto';
import { createCustomer, createTenant, drainOutbox } from './support/fixtures';
import { eventually, startWorker, type TestWorker } from './support/harness';

describe('Event consumers', () => {
  let worker: TestWorker;
  let broker: ChannelModel;
  let channel: Channel;

  beforeAll(async () => {
    worker = await startWorker();
    await drainOutbox(worker.prisma);
    broker = await connect(process.env.TEST_RABBITMQ_URL!);
    channel = await broker.createChannel();
  });

  afterAll(async () => {
    await broker.close();
    await worker.close();
  });

  const envelope = (
    tenantId: string,
    type: EventEnvelope['type'],
    payload: Record<string, unknown>,
    occurredAt = '2026-05-04T10:00:00.000Z',
  ): EventEnvelope => ({ id: randomUUID(), type, tenantId, occurredAt, version: 1, payload });

  const publish = (event: EventEnvelope | string, routingKey?: string) =>
    channel.publish(
      EVENTS_EXCHANGE,
      routingKey ?? (event as EventEnvelope).type,
      Buffer.from(typeof event === 'string' ? event : JSON.stringify(event)),
      { messageId: typeof event === 'string' ? 'malformed' : event.id, persistent: true },
    );

  /** Waits for a message with this id to appear in a queue; others are put back. */
  const findIn = (queue: string, messageId: string) =>
    eventually(async () => {
      const seen: GetMessage[] = [];
      try {
        for (;;) {
          const message = await channel.get(queue);
          if (!message) throw new Error(`${messageId} not in ${queue} yet`);
          if (message.properties.messageId === messageId) {
            channel.ack(message);
            return message;
          }
          seen.push(message);
        }
      } finally {
        for (const m of seen) channel.nack(m, false, true);
      }
    });

  const statsFor = (tenantId: string) =>
    worker.prisma.dailyStats.findUnique({
      where: { tenantId_date: { tenantId, date: new Date('2026-05-04T00:00:00.000Z') } },
    });

  it('turns outbox events into daily stats, end to end', async () => {
    const { id: tenantId } = await createTenant(worker.prisma);
    const movement = { customerId: 'c', ledgerEntryId: 'l', balanceAfter: 0 };
    await worker.prisma.outboxEvent.createMany({
      data: [
        { tenantId, type: 'customer.created', payload: { customerId: 'c' } },
        {
          tenantId,
          type: 'points.earned',
          payload: { ...movement, points: 40, purchaseId: 'p1', amount: '4.00' },
        },
        {
          tenantId,
          type: 'points.earned',
          payload: { ...movement, points: 125, purchaseId: 'p2', amount: '12.55' },
        },
        {
          tenantId,
          type: 'points.redeemed',
          payload: { ...movement, points: -100, redemptionId: 'r', rewardId: 'w' },
        },
      ].map((row) => ({ ...row, occurredAt: new Date('2026-05-04T10:00:00.000Z') })),
    });

    const stats = await eventually(async () => {
      const row = await statsFor(tenantId);
      if (row?.pointsRedeemed !== 100 || row.purchases !== 2) throw new Error('not yet');
      return row;
    });
    expect(stats).toMatchObject({ newCustomers: 1, pointsEarned: 165, purchases: 2 });
    expect(stats.revenue.toFixed(2)).toBe('16.55');
    expect(await worker.prisma.outboxEvent.count({ where: { tenantId, publishedAt: null } })).toBe(
      0,
    );
  });

  it('counts an event delivered twice only once', async () => {
    const { id: tenantId } = await createTenant(worker.prisma);
    const event = envelope(tenantId, 'customer.created', { customerId: 'c' });
    publish(event);
    publish(event);

    await eventually(async () => {
      const processed = await worker.prisma.processedEvent.count({ where: { eventId: event.id } });
      if (processed !== 1) throw new Error('not yet');
    });
    // Give the duplicate time to be handled (and skipped) before checking.
    const marker = envelope(tenantId, 'customer.created', { customerId: 'c2' });
    publish(marker);
    await eventually(async () => {
      if ((await statsFor(tenantId))?.newCustomers !== 2) throw new Error('not yet');
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect((await statsFor(tenantId))?.newCustomers).toBe(2);
  });

  it('emails a customer who reaches a new tier', async () => {
    const tenant = await createTenant(worker.prisma, 'Studio Test');
    const customer = await createCustomer(worker.prisma, tenant.id, 'Priya Shah');
    publish(
      envelope(tenant.id, 'tier.changed', {
        customerId: customer.id,
        fromTierId: null,
        toTierId: randomUUID(),
        toTierName: 'Silver',
      }),
    );

    const [email] = await eventually(() => {
      const sent = worker.mailbox.to(customer.email);
      if (sent.length === 0) throw new Error('no email yet');
      return sent;
    });
    expect(email?.subject).toBe("You've reached Silver at Studio Test");
    expect(email?.text).toContain(`http://localhost:3000/c/${tenant.slug}`);
  });

  it('emails the customer when a redemption is fulfilled', async () => {
    const tenant = await createTenant(worker.prisma);
    const customer = await createCustomer(worker.prisma, tenant.id);
    const reward = await worker.prisma.reward.create({
      data: { tenantId: tenant.id, name: 'Free croissant', description: '', pointsCost: 200 },
    });
    publish(
      envelope(tenant.id, 'redemption.fulfilled', {
        redemptionId: randomUUID(),
        customerId: customer.id,
        rewardId: reward.id,
      }),
    );

    const [email] = await eventually(() => {
      const sent = worker.mailbox.to(customer.email);
      if (sent.length === 0) throw new Error('no email yet');
      return sent;
    });
    expect(email?.subject).toBe('Enjoy your Free croissant');
  });

  it('does not let a customer of one tenant be reached through another tenant', async () => {
    const tenantA = await createTenant(worker.prisma);
    const tenantB = await createTenant(worker.prisma);
    const customerOfB = await createCustomer(worker.prisma, tenantB.id);
    const event = envelope(tenantA.id, 'points.expiring', {
      customerId: customerOfB.id,
      points: 50,
      expiresOn: '2026-05-11',
    });
    publish(event);

    await eventually(async () => {
      const processed = await worker.prisma.processedEvent.count({ where: { eventId: event.id } });
      if (processed !== 1) throw new Error('not yet');
    });
    expect(worker.mailbox.to(customerOfB.email)).toHaveLength(0);
  });

  it('retries a failing event five times, then moves it to the dead-letter queue', async () => {
    // DailyStats references Tenant, so stats for a tenant that does not exist always fail.
    const event = envelope(randomUUID(), 'customer.created', { customerId: 'c' });
    publish(event);

    const dead = await findIn('pointshub.stats.dlq', event.id);
    expect(dead.properties.headers?.['x-retry-count']).toBe(5);
    expect(String(dead.properties.headers?.['x-last-error'])).toMatch(/foreign key|constraint/i);
    expect(JSON.parse(dead.content.toString())).toMatchObject({ id: event.id });
    expect(await worker.prisma.processedEvent.count({ where: { eventId: event.id } })).toBe(0);
  });

  it('dead-letters a malformed message straight away', async () => {
    publish('{"not": "an event"}', 'customer.created');

    const dead = await findIn('pointshub.stats.dlq', 'malformed');
    expect(dead.properties.headers?.['x-retry-count']).toBe(0);
  });
});
