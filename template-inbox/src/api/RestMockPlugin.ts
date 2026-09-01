/**
 * REST mock plugin - short-circuits a request that a mock map answers.
 *
 * The app's own, deliberately: `@gears-frontx/api` publishes the plugin
 * *primitives* (`RestPluginWithConfig`, the `MOCK_PLUGIN` marker, the request
 * and short-circuit context types) but not a mock plugin built from them - a
 * mock is a decision about a project's data, so the ecosystem package leaves
 * it to whoever owns the project. A seeded app owns this file and can replace
 * the whole thing the day its service talks to a real backend, by deleting the
 * `registerPlugin` call in `InboxApiService` and nothing else.
 */

import {
  MOCK_PLUGIN,
  RestPluginWithConfig,
  type JsonCompatible,
  type JsonValue,
  type MockResponseFactory,
  type RestRequestContext,
  type RestShortCircuitResponse,
} from '@gears-frontx/api';

export type RestMockConfig = {
  /** `'METHOD /path'` -> response factory. A path may carry `:param` segments. */
  mockMap?: Readonly<Record<string, MockResponseFactory<JsonValue, JsonCompatible>>>;
  /** Simulated network latency, in milliseconds. */
  delay?: number;
};

export class RestMockPlugin extends RestPluginWithConfig<RestMockConfig> {
  /** Identifies this as a mock plugin to anything managing mock activation. */
  static readonly [MOCK_PLUGIN] = true;

  private currentMockMap?: Readonly<Record<string, MockResponseFactory<JsonValue, JsonCompatible>>>;

  constructor(config: RestMockConfig = {}) {
    super(config);
    this.currentMockMap = config.mockMap;
  }

  setMockMap(
    mockMap: Readonly<Record<string, MockResponseFactory<JsonValue, JsonCompatible>>>
  ): void {
    this.currentMockMap = mockMap;
  }

  async onRequest(
    context: RestRequestContext
  ): Promise<RestRequestContext | RestShortCircuitResponse> {
    const mockFactory = this.findMockFactory(context.method, context.url);
    if (!mockFactory) return context;

    if (this.config.delay !== undefined && this.config.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.delay));
    }

    return {
      shortCircuit: {
        status: 200,
        headers: { 'x-frontx-short-circuit': 'true' },
        data: mockFactory(context.body as JsonValue),
      },
    };
  }

  /** Exact match first, then the `:param` patterns - a literal route must never
   * lose to a pattern that happens to be enumerated earlier. */
  private findMockFactory(
    method: string,
    url: string
  ): MockResponseFactory<unknown, unknown> | undefined {
    const mockMap = this.currentMockMap ?? {};

    const exactMatch = mockMap[`${method.toUpperCase()} ${url}`];
    if (exactMatch) return exactMatch as MockResponseFactory<unknown, unknown>;

    for (const [key, factory] of Object.entries(mockMap)) {
      const [keyMethod, keyUrl] = key.split(' ', 2);
      if (
        keyMethod.toUpperCase() === method.toUpperCase() &&
        this.matchUrlPattern(keyUrl, url)
      ) {
        return factory as MockResponseFactory<unknown, unknown>;
      }
    }

    return undefined;
  }

  private matchUrlPattern(pattern: string, url: string): boolean {
    if (!pattern.includes(':')) return pattern === url;

    const regexPattern = pattern
      .split('/')
      .map((segment) => (segment.startsWith(':') ? '[^/]+' : segment))
      .join('/');
    return new RegExp(`^${regexPattern}$`).test(url);
  }

  destroy(): void {
    // Nothing to clean up.
  }
}
