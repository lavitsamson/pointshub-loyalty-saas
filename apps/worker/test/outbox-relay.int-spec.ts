import type { EventEnvelope } from '@pointshub/shared';
import { PrismaService } from '../src/infra/prisma.service';
import type { EventPublisher } from '../src/outbox/event-publisher';
import { OUTBOX_BATCH_SIZE, OutboxRelayService } from '../src/outbox/outbox-relay.service';
import { createTenant, drainOutbox } from './support/fixtures';
import { testEnv } from './support/harness';

/** Records what it was asked to publish; can be made slow or failing. */
class StubPublisher implements EventPublisher {
  readonly connected = true;
  readonly published: EventEnvelope[] = [];
  delayMs = 0;
  failWith: Error | undefined;

  async publishEvents(events: readonly EventEnvelope[]): Promise<void> {
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (this.failWith) throw this.failWith;
    this.published.push(...events);
  }
}

describe('Outbox relay', () => {
  const env = testEnv();
  const prisma = new PrismaService(env);
  const db = prisma.client;
  let tenantId: string;

  beforeAll(async () => {
    tenantId = (await createTenant(db)).id;
  });

  beforeEach(() => drainOutbox(db));

  afterAll(() => prisma.onModuleDestroy());

  const addEvents = (count: number, start = Date.now()) =>
    db.outboxEvent.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        tenantId,
        type: 'customer.created',
        payload: { customerId: `customer-${i}` },
        occurredAt: new Date(start + i),
      })),
    });

  it('publishes pending events oldest first as v1 envelopes and marks them published', async () => {
    await addEvents(3);
    const publisher = new StubPublisher();
    const relay = new OutboxRelayService(prisma, publisher, env);

    expect(await relay.publishBatch()).toBe(3);

    expect(publisher.published.map((e) => e.payload.customerId)).toEqual([
      'customer-0',
      'customer-1',
      'customer-2',
    ]);
    expect(publisher.published[0]).toMatchObject({
      type: 'customer.created',
      tenantId,
      version: 1,
      occurredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown,
    });
    expect(await db.outboxEvent.count({ where: { tenantId, publishedAt: null } })).toBe(0);
    expect(await relay.publishBatch()).toBe(0);
  });

  it('publishes at most one batch at a time', async () => {
    await addEvents(OUTBOX_BATCH_SIZE + 20);
    const relay = new OutboxRelayService(prisma, new StubPublisher(), env);

    expect(await relay.publishBatch()).toBe(OUTBOX_BATCH_SIZE);
    expect(await relay.publishBatch()).toBe(20);
  });

  it('lets concurrent relays share the work without publishing anything twice', async () => {
    await addEvents(250);
    const publishers = [new StubPublisher(), new StubPublisher(), new StubPublisher()];
    for (const p of publishers) p.delayMs = 100;
    const relays = publishers.map((p) => new OutboxRelayService(prisma, p, env));

    // Each relay keeps going until it finds nothing it can claim.
    await Promise.all(
      relays.map(async (relay) => {
        while ((await relay.publishBatch()) > 0);
      }),
    );

    const ids = publishers.flatMap((p) => p.published.map((e) => e.id));
    expect(ids).toHaveLength(250);
    expect(new Set(ids).size).toBe(250);
    // SKIP LOCKED means the relays worked in parallel rather than queueing behind each other.
    expect(publishers.filter((p) => p.published.length > 0).length).toBeGreaterThan(1);
  });

  it('leaves events pending when the broker does not accept them', async () => {
    await addEvents(5);
    const publisher = new StubPublisher();
    publisher.failWith = new Error('broker unavailable');
    const relay = new OutboxRelayService(prisma, publisher, env);

    await expect(relay.publishBatch()).rejects.toThrow('broker unavailable');
    expect(await db.outboxEvent.count({ where: { tenantId, publishedAt: null } })).toBe(5);

    publisher.failWith = undefined;
    expect(await relay.publishBatch()).toBe(5);
  });
});
