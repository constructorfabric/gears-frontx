// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
/**
 * Focused tests for public exports from the package barrel (`src/index.ts`).
 *
 * These tests guard the package's public API surface — the things that downstream
 * consumers may depend on — and exercise each exported symbol at least once so a
 * rename, accidental removal, or contract drift surfaces as a failing test instead
 * of only a type error during consumer builds.
 *
 * Plugin-chain behaviour that uses these guards end-to-end is already covered by
 * the REST/SSE integration suites; the goal here is to pin the exports themselves.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as api from '../index';
import {
  ApiPlugin,
  ApiPluginBase,
  isRestShortCircuit,
  isShortCircuit,
  isSseShortCircuit,
  MOCK_PLUGIN,
  RestPlugin,
  RestPluginWithConfig,
  SHARED_FETCH_CACHE_SYMBOL,
  SsePlugin,
  SsePluginWithConfig,
  isMockPlugin,
  peekSharedFetchCache,
  releaseSharedFetchCache,
  resetSharedFetchCache,
  retainSharedFetchCache,
} from '../index';
import { SHARED_FETCH_CACHE_RETAINERS_SYMBOL } from '../sharedFetchCache';
import type {
  ApiRequestContext,
  RestRequestContext,
  RestResponseContext,
  RestShortCircuitResponse,
  SseConnectContext,
  SseShortCircuitResponse,
  ShortCircuitResponse,
  EventSourceLike,
} from '../index';

function withBearerAuthHeaders<H extends Record<string, string>>(
  headers: H,
  getToken: () => string
): H & { Authorization: string } {
  return {
    ...headers,
    Authorization: `Bearer ${getToken()}`,
  };
}

beforeEach(() => {
  resetSharedFetchCache();
});

afterEach(() => {
  resetSharedFetchCache();
});

describe('package barrel exports', () => {
  it('re-exports the documented runtime surface', () => {
    const expected = [
      'ApiPluginBase',
      'ApiPlugin',
      'ApiProtocol',
      'isShortCircuit',
      'RestPlugin',
      'RestPluginWithConfig',
      'SsePlugin',
      'SsePluginWithConfig',
      'isRestShortCircuit',
      'isSseShortCircuit',
      'MOCK_PLUGIN',
      'isMockPlugin',
      'BaseApiService',
      'RestProtocol',
      'SseProtocol',
      'RestEndpointProtocol',
      'SseStreamProtocol',
      'SHARED_FETCH_CACHE_SYMBOL',
      'SHARED_FETCH_CACHE_RETAINERS_SYMBOL',
      'createSharedFetchCache',
      'getSharedFetchCache',
      'peekSharedFetchCache',
      'retainSharedFetchCache',
      'releaseSharedFetchCache',
      'resetSharedFetchCache',
      'apiRegistry',
    ] as const;

    for (const name of expected) {
      expect(api, `missing export: ${name}`).toHaveProperty(name);
      expect((api as Record<string, unknown>)[name]).toBeDefined();
    }
  });
});

describe('SHARED_FETCH_CACHE_SYMBOL / SHARED_FETCH_CACHE_RETAINERS_SYMBOL', () => {
  it('uses Symbol.for so separate bundles converge on the same slot', () => {
    expect(SHARED_FETCH_CACHE_SYMBOL).toBe(Symbol.for('frontx:fetch-cache'));
    expect(SHARED_FETCH_CACHE_RETAINERS_SYMBOL).toBe(
      Symbol.for('frontx:fetch-cache-retainers')
    );
    expect(typeof SHARED_FETCH_CACHE_SYMBOL).toBe('symbol');
    expect(typeof SHARED_FETCH_CACHE_RETAINERS_SYMBOL).toBe('symbol');
  });

  it('stores retain/release bookkeeping on globalThis under the retainers symbol', () => {
    const host = globalThis as unknown as Record<symbol, unknown>;

    expect(host[SHARED_FETCH_CACHE_SYMBOL]).toBeUndefined();
    expect(host[SHARED_FETCH_CACHE_RETAINERS_SYMBOL]).toBeUndefined();

    retainSharedFetchCache();
    retainSharedFetchCache();

    expect(host[SHARED_FETCH_CACHE_SYMBOL]).toBeDefined();
    expect(host[SHARED_FETCH_CACHE_RETAINERS_SYMBOL]).toBe(2);

    releaseSharedFetchCache();
    expect(host[SHARED_FETCH_CACHE_RETAINERS_SYMBOL]).toBe(1);

    releaseSharedFetchCache();
    expect(host[SHARED_FETCH_CACHE_SYMBOL]).toBeUndefined();
    expect(host[SHARED_FETCH_CACHE_RETAINERS_SYMBOL]).toBeUndefined();
  });
});

describe('peekSharedFetchCache', () => {
  it('returns undefined when no cache has been created', () => {
    expect(peekSharedFetchCache()).toBeUndefined();
  });

  it('returns the current singleton once it has been retained, without creating one', () => {
    expect(peekSharedFetchCache()).toBeUndefined();

    const retained = retainSharedFetchCache();
    expect(peekSharedFetchCache()).toBe(retained);

    releaseSharedFetchCache();
    expect(peekSharedFetchCache()).toBeUndefined();
  });

  it('does not create the cache as a side effect (unlike getSharedFetchCache)', () => {
    peekSharedFetchCache();
    peekSharedFetchCache();

    const host = globalThis as unknown as Record<symbol, unknown>;
    expect(host[SHARED_FETCH_CACHE_SYMBOL]).toBeUndefined();
  });
});

describe('isShortCircuit', () => {
  it('returns true for values carrying a shortCircuit property', () => {
    const response: ShortCircuitResponse = {
      shortCircuit: { status: 200, headers: {}, data: { ok: true } },
    };

    expect(isShortCircuit(response)).toBe(true);
  });

  it('returns false for a plain ApiRequestContext', () => {
    const ctx: ApiRequestContext = {
      method: 'GET',
      url: '/users',
      headers: {},
    };

    expect(isShortCircuit(ctx)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isShortCircuit(undefined)).toBe(false);
  });
});

describe('isRestShortCircuit', () => {
  it('returns true for values whose shortCircuit carries a status (REST response shape)', () => {
    const response: RestShortCircuitResponse = {
      shortCircuit: { status: 204, headers: {}, data: null },
    };

    expect(isRestShortCircuit(response)).toBe(true);
  });

  it('returns false for an SSE-shaped short circuit (shortCircuit is an EventSource-like)', () => {
    const eventSource: EventSourceLike = {
      readyState: 0,
      onopen: null,
      onmessage: null,
      onerror: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      close: () => undefined,
    };
    const sseResponse: SseShortCircuitResponse = { shortCircuit: eventSource };

    // Intentional cross-type check: isRestShortCircuit must distinguish by shape,
    // not just by the presence of the `shortCircuit` key.
    expect(isRestShortCircuit(sseResponse as unknown as RestShortCircuitResponse)).toBe(
      false
    );
  });

  it('returns false for a plain RestRequestContext', () => {
    const ctx: RestRequestContext = {
      method: 'POST',
      url: '/users',
      headers: {},
      body: { name: 'ada' },
    };

    expect(isRestShortCircuit(ctx)).toBe(false);
    expect(isRestShortCircuit(undefined)).toBe(false);
  });
});

describe('isSseShortCircuit', () => {
  it('returns true for values whose shortCircuit carries a close() (EventSource-like)', () => {
    const eventSource: EventSourceLike = {
      readyState: 0,
      onopen: null,
      onmessage: null,
      onerror: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      close: () => undefined,
    };
    const response: SseShortCircuitResponse = { shortCircuit: eventSource };

    expect(isSseShortCircuit(response)).toBe(true);
  });

  it('returns false for a REST-shaped short circuit (shortCircuit is a response context)', () => {
    const restResponse: RestShortCircuitResponse = {
      shortCircuit: { status: 200, headers: {}, data: {} } satisfies RestResponseContext,
    };

    expect(
      isSseShortCircuit(restResponse as unknown as SseShortCircuitResponse)
    ).toBe(false);
  });

  it('returns false for a plain SseConnectContext and for undefined', () => {
    const ctx: SseConnectContext = { url: '/events', headers: {} };
    expect(isSseShortCircuit(ctx)).toBe(false);
    expect(isSseShortCircuit(undefined)).toBe(false);
  });
});

describe('RestPluginWithConfig', () => {
  interface AuthConfig {
    getToken: () => string;
  }

  class AuthPlugin extends RestPluginWithConfig<AuthConfig> {
    destroyCalls = 0;

    onRequest(ctx: RestRequestContext): RestRequestContext {
      return {
        ...ctx,
        headers: withBearerAuthHeaders(ctx.headers, () => this.config.getToken()),
      };
    }

    override destroy(): void {
      this.destroyCalls += 1;
    }

    peekConfig(): AuthConfig {
      return this.config;
    }
  }

  it('constructs with the supplied config and exposes it to subclasses', () => {
    const config: AuthConfig = { getToken: () => 't0' };
    const plugin = new AuthPlugin(config);

    expect(plugin).toBeInstanceOf(AuthPlugin);
    expect(plugin).toBeInstanceOf(RestPluginWithConfig);
    expect(plugin.peekConfig()).toBe(config);
  });

  it('invokes onRequest using config to decorate headers', () => {
    let token = 'initial';
    const plugin = new AuthPlugin({ getToken: () => token });

    const first = plugin.onRequest({ method: 'GET', url: '/me', headers: {} });
    expect(first.headers.Authorization).toBe('Bearer initial');

    token = 'rotated';
    const second = plugin.onRequest({ method: 'GET', url: '/me', headers: { 'X-Id': '1' } });
    expect(second.headers.Authorization).toBe('Bearer rotated');
    expect(second.headers['X-Id']).toBe('1');
  });

  it('exposes a default destroy that subclasses can override safely', () => {
    class NoCleanupPlugin extends RestPluginWithConfig<{ value: number }> {}
    const basePlugin = new NoCleanupPlugin({ value: 7 });

    expect(() => {
      basePlugin.destroy();
    }).not.toThrow();

    const overriding = new AuthPlugin({ getToken: () => 'x' });
    overriding.destroy();
    overriding.destroy();
    expect(overriding.destroyCalls).toBe(2);
  });

  it('does not extend ApiPluginBase / ApiPlugin — only implements RestPluginHooks', () => {
    const plugin = new AuthPlugin({ getToken: () => 'x' });
    expect(plugin).not.toBeInstanceOf(ApiPluginBase);
    expect(plugin).not.toBeInstanceOf(ApiPlugin);
    expect(plugin).not.toBeInstanceOf(RestPlugin);
  });
});

describe('SsePluginWithConfig', () => {
  interface SseAuthConfig {
    getToken: () => string;
  }

  class SseAuthPlugin extends SsePluginWithConfig<SseAuthConfig> {
    destroyCalls = 0;

    onConnect(ctx: SseConnectContext): SseConnectContext {
      const getToken = () => this.config.getToken();
      return {
        ...ctx,
        headers: withBearerAuthHeaders(ctx.headers, getToken),
      };
    }

    override destroy(): void {
      this.destroyCalls += 1;
    }

    peekConfig(): SseAuthConfig {
      return this.config;
    }
  }

  it('constructs with the supplied config and exposes it to subclasses', () => {
    const config: SseAuthConfig = { getToken: () => 'sse-0' };
    const plugin = new SseAuthPlugin(config);

    expect(plugin).toBeInstanceOf(SseAuthPlugin);
    expect(plugin).toBeInstanceOf(SsePluginWithConfig);
    expect(plugin.peekConfig()).toBe(config);
  });

  it('invokes onConnect using config to decorate headers', () => {
    let token = 'sse-initial';
    const plugin = new SseAuthPlugin({ getToken: () => token });

    const first = plugin.onConnect({ url: '/events', headers: {} });
    expect(first.headers.Authorization).toBe('Bearer sse-initial');

    token = 'sse-rotated';
    const second = plugin.onConnect({
      url: '/events',
      headers: { 'X-Stream': 'users' },
    });
    expect(second.headers.Authorization).toBe('Bearer sse-rotated');
    expect(second.headers['X-Stream']).toBe('users');
  });

  it('exposes a default destroy that subclasses can override safely', () => {
    class NoCleanupSsePlugin extends SsePluginWithConfig<{ value: number }> {}
    const basePlugin = new NoCleanupSsePlugin({ value: 3 });

    expect(() => {
      basePlugin.destroy();
    }).not.toThrow();

    const overriding = new SseAuthPlugin({ getToken: () => 'x' });
    overriding.destroy();
    expect(overriding.destroyCalls).toBe(1);
  });

  it('does not extend ApiPluginBase / ApiPlugin — only implements SsePluginHooks', () => {
    const plugin = new SseAuthPlugin({ getToken: () => 'x' });
    expect(plugin).not.toBeInstanceOf(ApiPluginBase);
    expect(plugin).not.toBeInstanceOf(ApiPlugin);
    expect(plugin).not.toBeInstanceOf(SsePlugin);
  });
});

describe('MOCK_PLUGIN / isMockPlugin', () => {
  it('treats classes that carry the MOCK_PLUGIN static symbol as mock plugins', () => {
    class LocalMockPlugin extends RestPlugin {
      static readonly [MOCK_PLUGIN] = true;
    }

    expect(isMockPlugin(new LocalMockPlugin())).toBe(true);
  });

  it('returns false for plain plugins and non-objects', () => {
    class PlainPlugin extends RestPlugin {}
    expect(isMockPlugin(new PlainPlugin())).toBe(false);
    expect(isMockPlugin(null)).toBe(false);
    expect(isMockPlugin(undefined)).toBe(false);
    expect(isMockPlugin('nope')).toBe(false);
  });
});
