import type { EventEnvelope } from '@pointshub/shared';

/** Where the relay sends events. RabbitMQ in the app; a stub in some tests. */
export interface EventPublisher {
  readonly connected: boolean;
  /** Resolves only once the broker has accepted every event. */
  publishEvents(events: readonly EventEnvelope[]): Promise<void>;
}

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
