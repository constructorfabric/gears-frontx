/**
 * SseMockPlugin - SSE-specific mock plugin
 *
 * Intercepts SSE connections and returns MockEventSource via short-circuit.
 * Protocol-specific replacement for generic MockPlugin SSE behavior.
 *
 * SDK Layer: L1 (Zero dependencies)
 */

// @cpt-dod:cpt-frontx-dod-api-communication-sse-mock-plugin:p2
// @cpt-flow:cpt-frontx-flow-api-communication-mock-activation:p2
// @cpt-algo:cpt-frontx-algo-api-communication-sse-mock-match:p2

import {
  SsePluginWithConfig,
  type SseConnectContext,
  type SseShortCircuitResponse,
  MOCK_PLUGIN,
} from '@gears-frontx/api';
import { MockEventSource, type SseMockEvent } from '../mocks/MockEventSource';

/**
 * SSE Mock Configuration
 */
export interface SseMockConfig {
  /** Mock event streams map: URL -> event array */
  mockStreams: Readonly<Record<string, readonly SseMockEvent[]>>;
  /** Delay between events in ms */
  delay?: number;
}

/**
 * SseMockPlugin Implementation
 *
 * Intercepts SSE connections and returns MockEventSource for matching URLs.
 * Emits configured events through the mock EventSource.
 *
 * @example
 * ```typescript
 * const mockPlugin = new SseMockPlugin({
 *   mockStreams: {
 *     '/stream/chat': [
 *       { data: '{"delta": {"content": "Hello"}}' },
 *       { data: '{"delta": {"content": " World"}}' },
 *       { event: 'done', data: '' }
 *     ]
 *   },
 *   delay: 50,
 * });
 *
 * // Register globally
 * apiRegistry.plugins.add(SseProtocol, mockPlugin);
 *
 * // Or per-instance
 * sseProtocol.plugins.add(mockPlugin);
 * ```
 */
export class SseMockPlugin extends SsePluginWithConfig<SseMockConfig> {
  /** Mock plugin marker - identifies this as a mock plugin for framework management */
  static readonly [MOCK_PLUGIN] = true;
  /** Current mock streams map (can be updated via setMockStreams) */
  private currentMockStreams: Readonly<Record<string, readonly SseMockEvent[]>>;

  constructor(config: SseMockConfig) {
    super(config);
    this.currentMockStreams = config.mockStreams;
  }

  /**
   * Update mock streams map dynamically.
   */
  setMockStreams(mockStreams: Readonly<Record<string, readonly SseMockEvent[]>>): void {
    this.currentMockStreams = mockStreams;
  }

  /**
   * Intercept SSE connection and return MockEventSource if available.
   * Returns SseShortCircuitResponse to skip real EventSource connection.
   */
  // @cpt-begin:cpt-frontx-flow-api-communication-mock-activation:p2:inst-1
  // @cpt-begin:cpt-frontx-algo-api-communication-sse-mock-match:p2:inst-1
  async onConnect(
    context: SseConnectContext
  ): Promise<SseConnectContext | SseShortCircuitResponse> {
    const mockEvents = this.findMockEvents(context.url);

    if (mockEvents) {
      // Create MockEventSource with configured events
      const mockSource = new MockEventSource(mockEvents, this.config.delay ?? 50);

      // Return SSE short-circuit response (skips real EventSource)
      return {
        shortCircuit: mockSource,
      };
    }

    // No mock found, pass through to real EventSource
    return context;
  }
  // @cpt-end:cpt-frontx-flow-api-communication-mock-activation:p2:inst-1
  // @cpt-end:cpt-frontx-algo-api-communication-sse-mock-match:p2:inst-1

  /**
   * Find mock events for the given URL.
   */
  // @cpt-begin:cpt-frontx-algo-api-communication-sse-mock-match:p2:inst-find-mock-events
  private findMockEvents(url: string): readonly SseMockEvent[] | undefined {
    // Try exact match first
    const exactMatch = this.currentMockStreams[url];
    if (exactMatch) {
      return exactMatch;
    }

    // Try pattern matching (simple prefix match for now)
    for (const [pattern, events] of Object.entries(this.currentMockStreams)) {
      if (this.matchUrlPattern(pattern, url)) {
        return events;
      }
    }

    return undefined;
  }
  // @cpt-end:cpt-frontx-algo-api-communication-sse-mock-match:p2:inst-find-mock-events

  /**
   * Match URL against pattern.
   * Supports simple prefix matching and exact matching.
   */
  // @cpt-begin:cpt-frontx-algo-api-communication-sse-mock-match:p2:inst-match-url-pattern
  private matchUrlPattern(pattern: string, url: string): boolean {
    // Exact match
    if (pattern === url) {
      return true;
    }

    // Prefix match with wildcard
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return url.startsWith(prefix);
    }

    return false;
  }
  // @cpt-end:cpt-frontx-algo-api-communication-sse-mock-match:p2:inst-match-url-pattern

  /**
   * Cleanup plugin resources.
   */
  destroy(): void {
    // Nothing to cleanup
  }
}
