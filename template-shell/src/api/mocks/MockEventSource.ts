/**
 * MockEventSource - Mock implementation of EventSource for SSE testing
 *
 * Implements EventSourceLike interface to allow SSE mocking in tests and development.
 *
 * SDK Layer: L1 (Zero dependencies)
 */

// @cpt-dod:cpt-frontx-dod-api-communication-sse-mock-plugin:p2
// @cpt-algo:cpt-frontx-algo-api-communication-mock-event-source:p2
// @cpt-state:cpt-frontx-state-api-communication-mock-event-source:p2

import type { EventSourceLike } from '@gears-frontx/api';

/**
 * SSE Mock Event
 * Represents a single SSE event to emit
 */
export interface SseMockEvent {
  /** Event type (e.g., 'message', 'done') */
  event?: string;
  /** Event data */
  data: string;
}

/**
 * MockEventSource Implementation
 *
 * Simulates EventSource behavior by emitting events asynchronously.
 * Stays CONNECTING until after construction returns (microtask), matching
 * native EventSource so onopen and addEventListener('open') can be attached first.
 * Supports abort via close() and proper readyState management.
 *
 * @example
 * ```typescript
 * const mockSource = new MockEventSource([
 *   { data: '{"delta": {"content": "Hello"}}' },
 *   { data: '{"delta": {"content": " World"}}' },
 *   { event: 'done', data: '' }
 * ], 50);
 *
 * mockSource.onmessage = (e) => console.log(e.data);
 * mockSource.addEventListener('done', () => console.log('Complete'));
 * ```
 */
export class MockEventSource implements EventSourceLike {
  /** Current ready state */
  public readyState: number = 0; // CONNECTING

  /** Event handler for open event */
  public onopen: ((this: EventSource, ev: Event) => void) | null = null;

  /** Event handler for message event */
  public onmessage: ((this: EventSource, ev: MessageEvent) => void) | null = null;

  /** Event handler for error event */
  public onerror: ((this: EventSource, ev: Event) => void) | null = null;

  /** Event listeners map */
  private listeners: Map<string, Set<EventListenerOrEventListenerObject>> = new Map();

  /** Abort controller for event emission */
  private abortController: AbortController | null = null;

  /** Events to emit */
  private events: readonly SseMockEvent[];

  /** Delay between events in milliseconds */
  private delay: number;

  // @cpt-begin:cpt-frontx-state-api-communication-mock-event-source:p2:inst-constructor
  constructor(events: readonly SseMockEvent[], delay = 50) {
    this.events = events;
    this.delay = delay;

    // Start emitting events asynchronously
    this.startEmitting();
  }
  // @cpt-end:cpt-frontx-state-api-communication-mock-event-source:p2:inst-constructor

  /**
   * Add event listener
   */
  // @cpt-begin:cpt-frontx-algo-api-communication-mock-event-source:p2:inst-add-event-listener
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }
  // @cpt-end:cpt-frontx-algo-api-communication-mock-event-source:p2:inst-add-event-listener

  /**
   * Remove event listener
   */
  // @cpt-begin:cpt-frontx-algo-api-communication-mock-event-source:p2:inst-remove-event-listener
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.delete(listener);
    }
  }
  // @cpt-end:cpt-frontx-algo-api-communication-mock-event-source:p2:inst-remove-event-listener

  /**
   * Close the connection
   */
  // @cpt-begin:cpt-frontx-state-api-communication-mock-event-source:p2:inst-1
  close(): void {
    if (this.readyState === 2) return; // Already closed

    this.readyState = 2; // CLOSED

    // Abort event emission
    if (this.abortController) {
      this.abortController.abort();
    }
  }
  // @cpt-end:cpt-frontx-state-api-communication-mock-event-source:p2:inst-1

  /**
   * Start emitting events asynchronously
   */
  // @cpt-begin:cpt-frontx-algo-api-communication-mock-event-source:p2:inst-1
  private async startEmitting(): Promise<void> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Async functions run synchronously until the first await; without this yield,
    // OPEN and `open` would fire before the constructor returns (breaking the
    // EventSource contract and listeners assigned after `new`).
    await Promise.resolve();

    if (signal.aborted) {
      return;
    }

    this.readyState = 1; // OPEN
    this.emitEvent('open', new Event('open'));

    // Emit events with delay
    for (const mockEvent of this.events) {
      // Check if aborted
      if (signal.aborted) {
        return;
      }

      // Wait for delay
      await this.sleep(this.delay, signal);

      // Check if aborted after delay
      if (signal.aborted) {
        return;
      }

      // Emit the event
      const eventType = mockEvent.event || 'message';
      const messageEvent = new MessageEvent(eventType, {
        data: mockEvent.data,
      });

      if (eventType === 'message') {
        // Call onmessage handler
        if (this.onmessage) {
          this.onmessage.call(this as unknown as EventSource, messageEvent);
        }
      }

      // Call registered event listeners
      this.emitEvent(eventType, messageEvent);
    }

    // All events emitted - close connection
    this.readyState = 2; // CLOSED
  }
  // @cpt-end:cpt-frontx-algo-api-communication-mock-event-source:p2:inst-1

  /**
   * Emit an event to registered listeners
   */
  // @cpt-begin:cpt-frontx-algo-api-communication-mock-event-source:p2:inst-emit-event
  private emitEvent(type: string, event: Event | MessageEvent): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.forEach((listener) => {
        if (typeof listener === 'function') {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      });
    }

    // Call handler property if it exists
    if (type === 'open' && this.onopen) {
      this.onopen.call(this as unknown as EventSource, event);
    } else if (type === 'error' && this.onerror) {
      this.onerror.call(this as unknown as EventSource, event);
    }
  }
  // @cpt-end:cpt-frontx-algo-api-communication-mock-event-source:p2:inst-emit-event

  /**
   * Sleep with abort signal support
   */
  // @cpt-begin:cpt-frontx-algo-api-communication-mock-event-source:p2:inst-sleep-abort
  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const timeout = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);
        resolve();
      };
      signal.addEventListener('abort', onAbort);
    });
  }
  // @cpt-end:cpt-frontx-algo-api-communication-mock-event-source:p2:inst-sleep-abort
}
