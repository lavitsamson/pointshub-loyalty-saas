import type { ConsumerQueues } from './topology';

/** Header carrying how many times a message has already been retried. */
export const RETRY_COUNT_HEADER = 'x-retry-count';

export type FailureAction =
  | { kind: 'retry'; queue: string; delayMs: number; retryCount: number }
  | { kind: 'dead-letter'; queue: string };

export interface Failure {
  /** Retries already made before this failure; 0 on the first delivery. */
  retryCount: number;
  /** False when retrying cannot help, e.g. the message does not match the event contract. */
  retryable: boolean;
}

/**
 * Where a failed message goes next: the holding queue for its next retry, or the
 * dead-letter queue once the retries (one per configured delay) are used up.
 */
export function onFailure(
  queues: ConsumerQueues,
  delaysMs: readonly number[],
  failure: Failure,
): FailureAction {
  const next = failure.retryCount + 1;
  const queue = queues.retries[next - 1];
  const delayMs = delaysMs[next - 1];
  if (!failure.retryable || queue === undefined || delayMs === undefined) {
    return { kind: 'dead-letter', queue: queues.deadLetter };
  }
  return { kind: 'retry', queue, delayMs, retryCount: next };
}

/** Reads the retry count from message headers, treating anything unexpected as 0. */
export function retryCountOf(headers: Record<string, unknown> | undefined): number {
  const value = headers?.[RETRY_COUNT_HEADER];
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}
