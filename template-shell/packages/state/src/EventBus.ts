/**
 * EventBus - Central event emitter for domain communication
 *
 * Implements Observable pattern for loose coupling between domains.
 * Based on RxJS Subject pattern but lightweight with zero dependencies.
 *
 * Type Safety: EventPayloadMap ensures emit/on use correct payload per event.
 */

import type {
  EventPayloadMap,
  EventHandler,
  Subscription,
  EventBus as IEventBus,
} from './types';

/**
 * EventBus Implementation
 *
 * A lightweight, type-safe event emitter that enables loose coupling
 * between application domains through the publish-subscribe pattern.
 *
 * @example
 * ```typescript
 * // Emit an event
 * eventBus.emit('chat/threads/selected', { threadId: '123' });
 *
 * // Subscribe to an event
 * const subscription = eventBus.on('chat/threads/selected', ({ threadId }) => {
 *   console.log('Thread selected:', threadId);
 * });
 *
 * // Unsubscribe
 * subscription.unsubscribe();
 * ```
 */
// @cpt-dod:cpt-frontx-dod-state-management-eventbus:p1
// @cpt-state:cpt-frontx-state-state-management-handler-registration:p1
class EventBusImpl<TEvents extends EventPayloadMap = EventPayloadMap> implements IEventBus<TEvents> {
  private handlers: Map<string, Set<EventHandler<unknown>>> = new Map();

  /**
   * Emit an event with payload.
   * Type-safe: payload must match event type in EventPayloadMap.
   * Payload is optional for void events.
   */
  // @cpt-algo:cpt-frontx-algo-state-management-eventbus-emit:p1
  emit<K extends keyof TEvents>(
    eventType: K,
    ...args: TEvents[K] extends void ? [] : [TEvents[K]]
  ): void {
    const handlers = this.handlers.get(eventType as string);
    if (handlers) {
      const payload = args[0];
      handlers.forEach((handler) => handler(payload));
    }
  }

  /**
   * Subscribe to an event.
   * Type-safe: handler receives correct payload type for event.
   * Returns subscription object with unsubscribe method.
   */
  // @cpt-algo:cpt-frontx-algo-state-management-eventbus-subscribe:p1
  // @cpt-flow:cpt-frontx-flow-state-management-type-augmentation:p1
  on<K extends keyof TEvents>(
    eventType: K,
    handler: EventHandler<TEvents[K]>
  ): Subscription {
    const key = eventType as string;
    if (!this.handlers.has(key)) {
      this.handlers.set(key, new Set());
    }

    // Cast is safe because we control the payload type at emit time
    this.handlers.get(key)!.add(handler as EventHandler<unknown>);

    return {
      unsubscribe: (): void => {
        const handlers = this.handlers.get(key);
        if (handlers) {
          handlers.delete(handler as EventHandler<unknown>);
          if (handlers.size === 0) {
            this.handlers.delete(key);
          }
        }
      },
    };
  }

  /**
   * Subscribe to event, but only fire once then auto-unsubscribe.
   * Type-safe: handler receives correct payload type for event.
   */
  // @cpt-algo:cpt-frontx-algo-state-management-eventbus-subscribe-once:p2
  once<K extends keyof TEvents>(
    eventType: K,
    handler: EventHandler<TEvents[K]>
  ): Subscription {
    const wrappedHandler = (payload: TEvents[K]): void => {
      handler(payload);
      subscription.unsubscribe();
    };

    const subscription = this.on(eventType, wrappedHandler);
    return subscription;
  }

  /**
   * Remove all handlers for an event type.
   */
  clear(eventType: string): void {
    this.handlers.delete(eventType);
  }

  /**
   * Remove all event handlers.
   */
  clearAll(): void {
    this.handlers.clear();
  }
}

/**
 * Singleton EventBus instance.
 * Use this instance throughout the application for event communication.
 */
export const eventBus: IEventBus<EventPayloadMap> = new EventBusImpl<EventPayloadMap>();

/**
 * Export the class for testing purposes.
 * @internal
 */
export { EventBusImpl };
