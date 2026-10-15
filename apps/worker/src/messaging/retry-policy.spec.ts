import { onFailure, retryCountOf } from './retry-policy';
import { queuesFor } from './topology';

describe('queuesFor', () => {
  it('names a main queue, five retry queues and a dead-letter queue', () => {
    expect(queuesFor('stats')).toEqual({
      main: 'pointshub.stats',
      retries: [
        'pointshub.stats.retry.1',
        'pointshub.stats.retry.2',
        'pointshub.stats.retry.3',
        'pointshub.stats.retry.4',
        'pointshub.stats.retry.5',
      ],
      deadLetter: 'pointshub.stats.dlq',
    });
  });
});

describe('onFailure', () => {
  const queues = queuesFor('stats');
  const delays = [1_000, 5_000, 30_000, 120_000, 600_000];

  it('parks a first failure in the first retry queue with the first delay', () => {
    expect(onFailure(queues, delays, { retryCount: 0, retryable: true })).toEqual({
      kind: 'retry',
      queue: 'pointshub.stats.retry.1',
      delayMs: 1_000,
      retryCount: 1,
    });
  });

  it('backs off further on each retry', () => {
    const delaysUsed = [0, 1, 2, 3, 4].map((retryCount) => {
      const action = onFailure(queues, delays, { retryCount, retryable: true });
      return action.kind === 'retry' ? action.delayMs : null;
    });
    expect(delaysUsed).toEqual(delays);
  });

  it('dead-letters once five retries have failed', () => {
    expect(onFailure(queues, delays, { retryCount: 5, retryable: true })).toEqual({
      kind: 'dead-letter',
      queue: 'pointshub.stats.dlq',
    });
  });

  it('dead-letters a message that can never succeed without retrying it', () => {
    expect(onFailure(queues, delays, { retryCount: 0, retryable: false })).toEqual({
      kind: 'dead-letter',
      queue: 'pointshub.stats.dlq',
    });
  });
});

describe('retryCountOf', () => {
  it('reads the header', () => {
    expect(retryCountOf({ 'x-retry-count': 3 })).toBe(3);
  });

  it('treats a missing or malformed header as no retries yet', () => {
    expect(retryCountOf(undefined)).toBe(0);
    expect(retryCountOf({})).toBe(0);
    expect(retryCountOf({ 'x-retry-count': 'three' })).toBe(0);
    expect(retryCountOf({ 'x-retry-count': -1 })).toBe(0);
  });
});
