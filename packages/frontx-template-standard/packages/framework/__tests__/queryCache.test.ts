/**
 * Tests for queryCache() plugin lifecycle — Phase 5 (implement-endpoint-descriptors)
 *
 * Scope: narrow unit tests that exercise the queryCache() / queryCacheShared()
 * lifecycle, event contract, and shared-retainer invariants. Cross-package
 * integration via full service / RestEndpointProtocol descriptors is
 * intentionally out of scope for this feature (see
 * `architecture/features/feature-request-lifecycle/FEATURE.md` — Non-Applicable
 * Domains). Plugin wiring with L1 `sharedFetchCache` is asserted only through
 * the plugin's own public bridge (cache/set/remove/invalidate + mock toggle),
 * never through real API services.
 *
 * @packageDocumentation
 * @vitest-environment jsdom
 *
 * @cpt-FEATURE:implement-endpoint-descriptors:p2
 * @cpt-dod:cpt-frontx-dod-request-lifecycle-query-provider:p2
 * @cpt-flow:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2
 * @cpt-flow:cpt-frontx-flow-request-lifecycle-flux-escape-hatch:p2
 * @cpt-algo:cpt-frontx-algo-request-lifecycle-query-client-defaults:p2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueryClient } from '@tanstack/query-core';
import { getSharedFetchCache, resetSharedFetchCache } from '@gears-frontx/api';
import { createFrontX } from '../src/createFrontX';
import { queryCache, queryCacheShared } from '../src/plugins/queryCache';
import {
  resetSharedQueryClient,
  peekSharedQueryClient,
  peekSharedQueryClientRetainers,
  peekQueryClientBroadcastTarget,
  peekAppQueryClient,
  peekAppQueryClientResolver,
  peekAppQueryClientActivator,
} from '../src/testing';
import { eventBus, resetStore } from '@gears-frontx/state';
import { MockEvents } from '../src/effects/mockEffects';
import type { FrontXApp, FrontXPlugin } from '../src/types';

// ============================================================================
// Test helpers
// ============================================================================

/**
 * Real minimal app from the builder — queryCache onInit/onDestroy only attach
 * symbol metadata; no package plugins are registered.
 */
function stubApp(): FrontXApp {
  return createFrontX().build();
}

/**
 * Drain the queryCache teardown async chain (cancelQueries().then(() => clear())).
 * Tied to the plugin's async API surface: after emitting a toggle/destroy,
 * the listener awaits cancelQueries() before clear(); yield microtasks + one
 * macrotask so the `.then(() => clear())` continuation runs.
 *
 * Prefer `waitForQueryData(client, key)` (vi.waitFor) for assertions on
 * observable cache state.
 */
async function flushQueryCacheClear(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Wait until `client.getQueryData(key)` matches a predicate. */
async function waitForQueryDataGone(
  client: QueryClient,
  key: readonly unknown[]
): Promise<void> {
  await vi.waitFor(() => {
    expect(client.getQueryData(key)).toBeUndefined();
  });
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

/**
 * Typed stand-in for malformed cache event payloads. Matches the production
 * event-map key set (`queryKey`, `exact`, `dataOrUpdater`) with every field
 * optional so tests can deliberately omit required fields without resorting to
 * `as unknown` double-casts. The queryCache plugin declares strict payload
 * interfaces on `EventPayloadMap`; this helper narrows the emit surface used
 * by validation tests.
 */
type MalformedCachePayload = {
  queryKey?: unknown;
  exact?: boolean;
  dataOrUpdater?: unknown;
};

type MalformedCacheEvent = 'cache/invalidate' | 'cache/set' | 'cache/remove';

function emitMalformedCacheEvent(
  eventType: MalformedCacheEvent,
  payload: MalformedCachePayload
): void {
  // eventBus.emit is typed against EventPayloadMap; the whole point of this
  // helper is to feed deliberately-wrong shapes through the same runtime path.
  const emitter = eventBus as unknown as {
    emit(type: MalformedCacheEvent, payload: MalformedCachePayload): void;
  };
  emitter.emit(eventType, payload);
}

/**
 * Run a block with `console.error` silenced, guaranteeing restore even when
 * assertions throw. Avoids cross-test bleed when a test fails mid-flight.
 */
async function withSilencedConsoleError<T>(
  fn: (spy: ReturnType<typeof vi.spyOn>) => Promise<T>
): Promise<T> {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    return await fn(spy);
  } finally {
    spy.mockRestore();
  }
}

function requireSharedQueryClient(): QueryClient {
  const client = peekSharedQueryClient();
  if (!client) {
    throw new Error('expected shared query client');
  }
  return client;
}

function requireBroadcastTarget(client: QueryClient): string {
  const target = peekQueryClientBroadcastTarget(client);
  if (!target) {
    throw new Error('expected query client broadcast target');
  }
  return target;
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
  resetStore();
  resetSharedFetchCache();
  resetSharedQueryClient();
});

afterEach(() => {
  // Clear listeners accumulated by tested plugins so they don't bleed across tests.
  eventBus.clearAll();
  resetSharedFetchCache();
  resetSharedQueryClient();
  resetStore();
  vi.restoreAllMocks();
});

// ============================================================================
// Plugin shape
// ============================================================================

describe('queryCache() — plugin shape', () => {
  it('returns an object with name "queryCache"', () => {
    const plugin: FrontXPlugin = queryCache();
    expect(plugin.name).toBe('queryCache');
  });

  it('does not retain the shared QueryClient until onInit', () => {
    queryCache();
    expect(peekSharedQueryClient()).toBeUndefined();
    expect(peekSharedQueryClientRetainers()).toBe(0);
  });

  it('onDestroy without onInit does not retain the shared QueryClient', () => {
    const plugin = queryCache();
    plugin.onDestroy!(stubApp());
    expect(peekSharedQueryClient()).toBeUndefined();
    expect(peekSharedQueryClientRetainers()).toBe(0);
  });

  it('creates a shared QueryClient on onInit', () => {
    const plugin = queryCache();
    plugin.onInit!(stubApp());
    expect(requireSharedQueryClient()).toBeInstanceOf(QueryClient);
  });

  it('exposes a broadcast target token for local cache event fan-out', () => {
    const plugin = queryCache();
    plugin.onInit!(stubApp());

    expect(requireBroadcastTarget(requireSharedQueryClient())).toMatch(/^query-cache-/);
  });

  it('assigns a fresh broadcast target after the shared client is reset', () => {
    const firstPlugin = queryCache();
    firstPlugin.onInit!(stubApp());
    const firstTarget = requireBroadcastTarget(requireSharedQueryClient());

    resetSharedQueryClient();

    const secondPlugin = queryCache();
    secondPlugin.onInit!(stubApp());
    const secondTarget = requireBroadcastTarget(requireSharedQueryClient());

    expect(firstTarget).not.toBe(secondTarget);
  });

  it('has onInit and onDestroy lifecycle hooks', () => {
    const plugin = queryCache();
    expect(typeof plugin.onInit).toBe('function');
    expect(typeof plugin.onDestroy).toBe('function');
  });

  it('queryCacheShared() joins the shared QueryClient', () => {
    const hostPlugin = queryCache();
    const sharedPlugin: FrontXPlugin = queryCacheShared();

    expect(sharedPlugin.name).toBe('queryCacheShared');

    hostPlugin.onInit?.(stubApp());
    sharedPlugin.onInit?.(stubApp());

    const hostClient = requireSharedQueryClient();
    expect(peekSharedQueryClient()).toBe(hostClient);
    expect(requireBroadcastTarget(hostClient)).toBe(requireBroadcastTarget(hostClient));

    sharedPlugin.onDestroy?.(stubApp());
    hostPlugin.onDestroy?.(stubApp());
  });

  it('queryCacheShared() joins a host QueryClient created with custom config', () => {
    const hostPlugin = queryCache({ staleTime: 60_000 });
    const sharedPlugin: FrontXPlugin = queryCacheShared();

    hostPlugin.onInit?.(stubApp());
    sharedPlugin.onInit?.(stubApp());

    const client = requireSharedQueryClient();
    expect(client.getDefaultOptions().queries?.staleTime).toBe(60_000);

    sharedPlugin.onDestroy?.(stubApp());
    hostPlugin.onDestroy?.(stubApp());
  });

  it('queryCacheShared() can build before the host runtime and join later', async () => {
    const childApp = createFrontX().use(queryCacheShared()).build();

    expect(peekAppQueryClient(childApp)).toBeUndefined();
    expect(peekAppQueryClientResolver(childApp)?.()).toBeUndefined();
    expect(typeof peekAppQueryClientActivator(childApp)).toBe('function');

    const hostApp = createFrontX().use(queryCache()).build();
    const sharedClient = peekAppQueryClientActivator(childApp)?.();

    const hostClient = peekAppQueryClient(hostApp);
    expect(sharedClient).toBe(hostClient);
    expect(peekAppQueryClient(childApp)).toBe(hostClient);
    expect(peekAppQueryClientResolver(childApp)?.()).toBe(hostClient);

    childApp.destroy();
    hostApp.destroy();
    await flushQueryCacheClear();
  });

  it('reuses the same QueryClient across host plugins with matching config', () => {
    const hostPlugin = queryCache();
    const siblingHostPlugin = queryCache();

    siblingHostPlugin.onInit?.(stubApp());
    hostPlugin.onInit?.(stubApp());

    const hostClient = requireSharedQueryClient();
    expect(hostClient).toBeDefined();

    siblingHostPlugin.onDestroy?.(stubApp());
    hostPlugin.onDestroy?.(stubApp());
  });

  it('rejects conflicting queryCache() configs once the shared client exists', () => {
    const hostPlugin = queryCache({ staleTime: 60_000 });
    hostPlugin.onInit?.(stubApp());

    const conflicting = queryCache({ staleTime: 30_000 });
    expect(() => {
      conflicting.onInit?.(stubApp());
    }).toThrow(
      '[Gears FrontX] queryCache() received a config that conflicts with the existing shared QueryClient.'
    );

    hostPlugin.onDestroy?.(stubApp());
  });

  it('builder skips duplicate queryCache() registrations without leaking shared retainers', async () => {
    const firstCache = getSharedFetchCache();
    const app = createFrontX().use(queryCache()).use(queryCache()).build();

    app.destroy();
    await flushQueryCacheClear();

    expect(peekSharedQueryClient()).toBeUndefined();
    expect(getSharedFetchCache()).not.toBe(firstCache);
  });

  it('builder skips duplicate queryCacheShared() registrations without leaking shared retainers', async () => {
    const firstCache = getSharedFetchCache();
    const app = createFrontX()
      .use(queryCache())
      .use(queryCacheShared())
      .use(queryCacheShared())
      .build();

    app.destroy();
    await flushQueryCacheClear();

    expect(peekSharedQueryClient()).toBeUndefined();
    expect(getSharedFetchCache()).not.toBe(firstCache);
  });
});

// ============================================================================
// Runtime default options
// ============================================================================

describe('queryCache() — runtime default options', () => {
  it('creates runtime with staleTime 30_000 by default', () => {
    const plugin = queryCache();
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();

    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(30_000);
  });

  it('creates runtime with gcTime 300_000 by default', () => {
    const plugin = queryCache();
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();

    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.gcTime).toBe(300_000);
  });

  it('creates runtime with retry 0 by default', () => {
    const plugin = queryCache();
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();

    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.retry).toBe(0);
  });

  it('creates runtime with refetchOnWindowFocus true by default', () => {
    const plugin = queryCache();
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();

    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.refetchOnWindowFocus).toBe(true);
  });
});

// ============================================================================
// Custom config overrides
// ============================================================================

describe('queryCache(config) — custom config overrides', () => {
  it('custom staleTime overrides default', () => {
    const plugin = queryCache({ staleTime: 60_000 });
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();

    expect(client.getDefaultOptions().queries?.staleTime).toBe(60_000);
  });

  it('custom gcTime overrides default', () => {
    const plugin = queryCache({ gcTime: 600_000 });
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();

    expect(client.getDefaultOptions().queries?.gcTime).toBe(600_000);
  });

  it('refetchOnWindowFocus: false overrides default', () => {
    const plugin = queryCache({ refetchOnWindowFocus: false });
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();

    expect(client.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });

  it('partial config leaves unspecified options at their defaults', () => {
    const plugin = queryCache({ staleTime: 0 });
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();
    const defaults = client.getDefaultOptions();

    expect(defaults.queries?.staleTime).toBe(0);
    expect(defaults.queries?.gcTime).toBe(300_000);
    expect(defaults.queries?.retry).toBe(0);
  });
});

// ============================================================================
// onInit — event subscriptions
// ============================================================================

describe('queryCache() — onInit subscribes to events', () => {
  it('onInit installs the shared runtime and MockEvents.Toggle listener', async () => {
    const plugin = queryCache();
    const onSpy = vi.spyOn(eventBus, 'on');

    plugin.onInit!(stubApp());

    expect(peekSharedQueryClient()).toBeInstanceOf(QueryClient);
    expect(peekSharedQueryClientRetainers()).toBe(1);
    // Observe the subscription via eventBus.on() rather than the absent
    // listenerCount() API: the plugin must register a handler for the toggle
    // event during onInit.
    expect(onSpy).toHaveBeenCalledWith(MockEvents.Toggle, expect.any(Function));

    // Extra proof the listener is actually live: toggling mock mode should
    // drain the cache instead of throwing.
    const client = requireSharedQueryClient();
    client.setQueryData(['toggle-sentinel'], 'value');
    eventBus.emit(MockEvents.Toggle, { enabled: true });
    await waitForQueryDataGone(client, ['toggle-sentinel']);
  });

  it('MockEvents.Toggle on an empty cache does not throw and leaves the client usable', async () => {
    const plugin = queryCache();
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();

    expect(() => {
      eventBus.emit(MockEvents.Toggle, { enabled: true });
    }).not.toThrow();
    await flushQueryCacheClear();

    // Listener is still alive — seeding + firing again still clears.
    client.setQueryData(['later'], 'value');
    eventBus.emit(MockEvents.Toggle, { enabled: false });
    await waitForQueryDataGone(client, ['later']);
  });

  it('cache/invalidate against an empty cache does not throw and the listener stays armed', () => {
    const plugin = queryCache();
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();

    expect(() => {
      eventBus.emit('cache/invalidate', { queryKey: ['someKey'] });
    }).not.toThrow();

    // Seed post-hoc and re-emit — listener still invalidates.
    client.setQueryData(['someKey'], 'value');
    eventBus.emit('cache/invalidate', { queryKey: ['someKey'] });
    expect(client.getQueryState(['someKey'])?.isInvalidated).toBe(true);
  });

  it('onInit creates the shared fetch cache', () => {
    const plugin = queryCache();
    plugin.onInit!(stubApp());

    expect(getSharedFetchCache()).toBeDefined();
  });
});

// ============================================================================
// MockEvents.Toggle — clears cache
// ============================================================================

describe('queryCache() — MockEvents.Toggle clears the cache', () => {
  it('clears all cached data when MockEvents.Toggle fires', async () => {
    const plugin = queryCache();
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();

    client.setQueryData(['users'], [{ id: 1 }]);
    client.setQueryData(['profile'], { name: 'Alice' });

    expect(client.getQueryData(['users'])).toBeDefined();
    expect(client.getQueryData(['profile'])).toBeDefined();

    eventBus.emit(MockEvents.Toggle, { enabled: true });

    await waitForQueryDataGone(client, ['users']);
    await waitForQueryDataGone(client, ['profile']);
  });

  it('clears cache on toggle regardless of enabled flag value', async () => {
    const plugin = queryCache();
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();

    client.setQueryData(['key'], 'value');

    eventBus.emit(MockEvents.Toggle, { enabled: false });

    await waitForQueryDataGone(client, ['key']);
  });

  it('clears the shared fetch cache on mock toggle', async () => {
    const plugin = queryCache();
    const sharedFetchCache = getSharedFetchCache();
    const fetcher = vi.fn().mockResolvedValue('first');

    await sharedFetchCache.getOrFetch(['shared'], fetcher, { staleTime: 1_000 });
    plugin.onInit!(stubApp());

    eventBus.emit(MockEvents.Toggle, { enabled: true });
    await flushQueryCacheClear();

    await sharedFetchCache.getOrFetch(['shared'], fetcher, { staleTime: 1_000 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('waits for cancellation before clearing runtime and shared fetch cache', async () => {
    const plugin = queryCache();
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();
    const deferred = createDeferred();
    const sharedFetchCache = getSharedFetchCache();
    const clearSpy = vi.spyOn(client, 'clear');
    const sharedClearSpy = vi.spyOn(sharedFetchCache, 'clear');

    const cancelQueriesSpy = vi
      .spyOn(client, 'cancelQueries')
      .mockImplementation(() => deferred.promise);

    eventBus.emit(MockEvents.Toggle, { enabled: true });
    await flushQueryCacheClear();

    expect(cancelQueriesSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).not.toHaveBeenCalled();
    expect(sharedClearSpy).not.toHaveBeenCalled();

    deferred.resolve();
    await flushQueryCacheClear();

    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(sharedClearSpy).toHaveBeenCalledTimes(1);
  });

  it('still clears runtime and shared fetch cache when cancellation fails', async () => {
    await withSilencedConsoleError(async (consoleErrorSpy) => {
      const plugin = queryCache();
      plugin.onInit!(stubApp());
      const client = requireSharedQueryClient();
      const sharedFetchCache = getSharedFetchCache();
      const fetcher = vi.fn().mockResolvedValue('first');
      const clearSpy = vi.spyOn(client, 'clear');
      const sharedClearSpy = vi.spyOn(sharedFetchCache, 'clear');

      const cancelQueriesSpy = vi
        .spyOn(client, 'cancelQueries')
        .mockRejectedValue(new Error('cancel failed'));
      await sharedFetchCache.getOrFetch(['shared'], fetcher, { staleTime: 1_000 });

      eventBus.emit(MockEvents.Toggle, { enabled: true });
      await flushQueryCacheClear();

      expect(cancelQueriesSpy).toHaveBeenCalledTimes(1);
      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(sharedClearSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Gears FrontX] Failed to clear query cache after mock toggle',
        expect.any(Error)
      );

      await sharedFetchCache.getOrFetch(['shared'], fetcher, { staleTime: 1_000 });
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });
});

// ============================================================================
// cache/invalidate event — marks queries stale
// ============================================================================

describe('queryCache() — cache/invalidate invalidates query keys', () => {
  it('marks the specified query key as invalidated', () => {
    const plugin = queryCache({ gcTime: 300_000 });
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();

    client.setQueryData(['entity', 42], { value: 'original' });

    eventBus.emit('cache/invalidate', { queryKey: ['entity', 42] });

    const state = client.getQueryState(['entity', 42]);
    expect(state?.isInvalidated).toBe(true);
  });

  it('does not affect unrelated cache keys', () => {
    const plugin = queryCache({ gcTime: 300_000 });
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();

    client.setQueryData(['target'], 'will be invalidated');
    client.setQueryData(['unrelated'], 'should stay fresh');

    eventBus.emit('cache/invalidate', { queryKey: ['target'] });

    expect(client.getQueryState(['target'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['unrelated'])?.isInvalidated).toBeFalsy();
  });

  it('invalidates descendant shared fetch cache entries when exact is false', async () => {
    const plugin = queryCache();
    const sharedFetchCache = getSharedFetchCache();
    const parentFetcher = vi
      .fn()
      .mockResolvedValueOnce('parent-first')
      .mockResolvedValueOnce('parent-second');
    const childFetcher = vi
      .fn()
      .mockResolvedValueOnce('child-first')
      .mockResolvedValueOnce('child-second');

    await sharedFetchCache.getOrFetch(['entity'], parentFetcher, { staleTime: 1_000 });
    await sharedFetchCache.getOrFetch(['entity', { page: 1 }], childFetcher, {
      staleTime: 1_000,
    });
    plugin.onInit!(stubApp());

    eventBus.emit('cache/invalidate', { queryKey: ['entity'], exact: false });

    await sharedFetchCache.getOrFetch(['entity'], parentFetcher, { staleTime: 1_000 });
    await sharedFetchCache.getOrFetch(['entity', { page: 1 }], childFetcher, {
      staleTime: 1_000,
    });

    expect(parentFetcher).toHaveBeenCalledTimes(2);
    expect(childFetcher).toHaveBeenCalledTimes(2);
  });

  it('ignores malformed cache/invalidate events that omit queryKey', async () => {
    const plugin = queryCache({ gcTime: 300_000 });
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();
    const sharedFetchCache = getSharedFetchCache();
    const fetcher = vi.fn().mockResolvedValue('cached');

    client.setQueryData(['target'], 'target');
    client.setQueryData(['unrelated'], 'unrelated');
    await sharedFetchCache.getOrFetch(['target'], fetcher, { staleTime: 1_000 });

    emitMalformedCacheEvent('cache/invalidate', {});

    expect(client.getQueryState(['target'])?.isInvalidated).toBeFalsy();
    expect(client.getQueryState(['unrelated'])?.isInvalidated).toBeFalsy();

    await sharedFetchCache.getOrFetch(['target'], fetcher, { staleTime: 1_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('ignores broad cache/invalidate events with an empty queryKey', async () => {
    const plugin = queryCache({ gcTime: 300_000 });
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();
    const sharedFetchCache = getSharedFetchCache();
    const fetcher = vi.fn().mockResolvedValue('cached');

    client.setQueryData(['target'], 'target');
    client.setQueryData(['unrelated'], 'unrelated');
    await sharedFetchCache.getOrFetch(['target'], fetcher, { staleTime: 1_000 });

    emitMalformedCacheEvent('cache/invalidate', {
      queryKey: [],
      exact: false,
    });

    expect(client.getQueryState(['target'])?.isInvalidated).toBeFalsy();
    expect(client.getQueryState(['unrelated'])?.isInvalidated).toBeFalsy();

    await sharedFetchCache.getOrFetch(['target'], fetcher, { staleTime: 1_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('invalidates the same key in two separate plugin runtimes', () => {
    const pluginA = queryCache({ gcTime: 300_000 });
    const pluginB = queryCache({ gcTime: 300_000 });
    pluginA.onInit!(stubApp());
    pluginB.onInit!(stubApp());
    const clientA = requireSharedQueryClient();
    const clientB = requireSharedQueryClient();

    clientA.setQueryData(['shared'], 'a');
    clientB.setQueryData(['shared'], 'b');

    eventBus.emit('cache/invalidate', { queryKey: ['shared'] });

    expect(clientA.getQueryState(['shared'])?.isInvalidated).toBe(true);
    expect(clientB.getQueryState(['shared'])?.isInvalidated).toBe(true);
  });
});

// ============================================================================
// cache/set and cache/remove events — sync sibling runtimes
// ============================================================================

describe('queryCache() — cache/set and cache/remove synchronize runtimes', () => {
  it('cache/set updates the shared QueryClient once and invalidates shared fetch cache', async () => {
    const pluginA = queryCache({ gcTime: 300_000 });
    const pluginB = queryCache({ gcTime: 300_000 });
    pluginA.onInit!(stubApp());
    pluginB.onInit!(stubApp());
    const clientA = requireSharedQueryClient();
    const clientB = requireSharedQueryClient();
    const sharedFetchCache = getSharedFetchCache();
    const fetcher = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

    clientA.setQueryData(['entity', 'shared'], { value: 'seed' });
    await sharedFetchCache.getOrFetch(['entity', 'shared'], fetcher, { staleTime: 1_000 });

    eventBus.emit('cache/set', {
      queryKey: ['entity', 'shared'],
      dataOrUpdater: { value: 'optimistic' },
    });

    expect(clientA.getQueryData(['entity', 'shared'])).toEqual({ value: 'optimistic' });
    expect(clientB.getQueryData(['entity', 'shared'])).toEqual({ value: 'optimistic' });

    await sharedFetchCache.getOrFetch(['entity', 'shared'], fetcher, { staleTime: 1_000 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('ignores malformed cache/set events without a queryKey', async () => {
    const pluginA = queryCache({ gcTime: 300_000 });
    const pluginB = queryCache({ gcTime: 300_000 });
    pluginA.onInit!(stubApp());
    pluginB.onInit!(stubApp());
    const clientA = requireSharedQueryClient();
    const clientB = requireSharedQueryClient();
    const sharedFetchCache = getSharedFetchCache();
    const fetcher = vi.fn().mockResolvedValue('cached');

    clientA.setQueryData(['entity', 'shared'], { value: 'seed' });
    await sharedFetchCache.getOrFetch(['entity', 'shared'], fetcher, { staleTime: 1_000 });

    emitMalformedCacheEvent('cache/set', {
      dataOrUpdater: { value: 'optimistic' },
    });

    expect(clientA.getQueryData(['entity', 'shared'])).toEqual({ value: 'seed' });
    expect(clientB.getQueryData(['entity', 'shared'])).toEqual({ value: 'seed' });

    await sharedFetchCache.getOrFetch(['entity', 'shared'], fetcher, { staleTime: 1_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed cache/set events without dataOrUpdater', () => {
    const pluginA = queryCache({ gcTime: 300_000 });
    const pluginB = queryCache({ gcTime: 300_000 });
    pluginA.onInit!(stubApp());
    pluginB.onInit!(stubApp());
    const clientA = requireSharedQueryClient();
    const clientB = requireSharedQueryClient();

    clientA.setQueryData(['entity', 'shared'], { value: 'seed' });

    emitMalformedCacheEvent('cache/set', {
      queryKey: ['entity', 'shared'],
    });

    expect(clientA.getQueryData(['entity', 'shared'])).toEqual({ value: 'seed' });
    expect(clientB.getQueryData(['entity', 'shared'])).toEqual({ value: 'seed' });
  });

  it('ignores broad cache/set events with an empty queryKey', async () => {
    const pluginA = queryCache({ gcTime: 300_000 });
    const pluginB = queryCache({ gcTime: 300_000 });
    pluginA.onInit!(stubApp());
    pluginB.onInit!(stubApp());
    const clientA = requireSharedQueryClient();
    const clientB = requireSharedQueryClient();
    const sharedFetchCache = getSharedFetchCache();
    const fetcher = vi.fn().mockResolvedValue('cached');

    clientA.setQueryData(['entity', 'shared'], { value: 'seed' });
    clientA.setQueryData(['entity', 'other'], { value: 'other-seed' });
    await sharedFetchCache.getOrFetch(['entity', 'shared'], fetcher, { staleTime: 1_000 });

    emitMalformedCacheEvent('cache/set', {
      queryKey: [],
      dataOrUpdater: { value: 'optimistic' },
    });

    expect(clientA.getQueryData(['entity', 'shared'])).toEqual({ value: 'seed' });
    expect(clientB.getQueryData(['entity', 'shared'])).toEqual({ value: 'seed' });
    expect(clientA.getQueryData(['entity', 'other'])).toEqual({ value: 'other-seed' });
    expect(clientB.getQueryData(['entity', 'other'])).toEqual({ value: 'other-seed' });

    await sharedFetchCache.getOrFetch(['entity', 'shared'], fetcher, { staleTime: 1_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('cache/remove evicts the shared QueryClient and invalidates shared fetch cache', async () => {
    const pluginA = queryCache({ gcTime: 300_000 });
    const pluginB = queryCache({ gcTime: 300_000 });
    pluginA.onInit!(stubApp());
    pluginB.onInit!(stubApp());
    const clientA = requireSharedQueryClient();
    const clientB = requireSharedQueryClient();
    const sharedFetchCache = getSharedFetchCache();
    const fetcher = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

    clientA.setQueryData(['entity', 'remove'], { value: 'seed' });
    await sharedFetchCache.getOrFetch(['entity', 'remove'], fetcher, { staleTime: 1_000 });

    eventBus.emit('cache/remove', {
      queryKey: ['entity', 'remove'],
    });

    expect(clientA.getQueryData(['entity', 'remove'])).toBeUndefined();
    expect(clientB.getQueryData(['entity', 'remove'])).toBeUndefined();

    await sharedFetchCache.getOrFetch(['entity', 'remove'], fetcher, { staleTime: 1_000 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('ignores malformed cache/remove events without a queryKey', async () => {
    const pluginA = queryCache({ gcTime: 300_000 });
    const pluginB = queryCache({ gcTime: 300_000 });
    pluginA.onInit!(stubApp());
    pluginB.onInit!(stubApp());
    const clientA = requireSharedQueryClient();
    const clientB = requireSharedQueryClient();
    const sharedFetchCache = getSharedFetchCache();
    const fetcher = vi.fn().mockResolvedValue('cached');

    clientA.setQueryData(['entity', 'remove'], { value: 'seed' });
    await sharedFetchCache.getOrFetch(['entity', 'remove'], fetcher, { staleTime: 1_000 });

    emitMalformedCacheEvent('cache/remove', {});

    expect(clientA.getQueryData(['entity', 'remove'])).toEqual({ value: 'seed' });
    expect(clientB.getQueryData(['entity', 'remove'])).toEqual({ value: 'seed' });

    await sharedFetchCache.getOrFetch(['entity', 'remove'], fetcher, { staleTime: 1_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('ignores broad cache/remove events with an empty queryKey', async () => {
    const pluginA = queryCache({ gcTime: 300_000 });
    const pluginB = queryCache({ gcTime: 300_000 });
    pluginA.onInit!(stubApp());
    pluginB.onInit!(stubApp());
    const clientA = requireSharedQueryClient();
    const clientB = requireSharedQueryClient();
    const sharedFetchCache = getSharedFetchCache();
    const fetcher = vi.fn().mockResolvedValue('cached');

    clientA.setQueryData(['entity', 'remove'], { value: 'seed' });
    clientA.setQueryData(['entity', 'keep'], { value: 'keep-seed' });
    await sharedFetchCache.getOrFetch(['entity', 'remove'], fetcher, { staleTime: 1_000 });

    emitMalformedCacheEvent('cache/remove', {
      queryKey: [],
    });

    expect(clientA.getQueryData(['entity', 'remove'])).toEqual({ value: 'seed' });
    expect(clientB.getQueryData(['entity', 'remove'])).toEqual({ value: 'seed' });
    expect(clientA.getQueryData(['entity', 'keep'])).toEqual({ value: 'keep-seed' });
    expect(clientB.getQueryData(['entity', 'keep'])).toEqual({ value: 'keep-seed' });

    await sharedFetchCache.getOrFetch(['entity', 'remove'], fetcher, { staleTime: 1_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// onDestroy — cleanup
// ============================================================================

describe('queryCache() — onDestroy cleanup', () => {
  it('onDestroy releases the shared retainer and stops responding to MockEvents.Toggle', async () => {
    const plugin = queryCache();
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();

    client.setQueryData(['stale'], 'value');
    plugin.onDestroy!(stubApp());

    await flushQueryCacheClear();

    expect(peekSharedQueryClientRetainers()).toBe(0);
    expect(peekSharedQueryClient()).toBeUndefined();

    // The listener must be gone: seeding the (now-detached) client and
    // emitting MockEvents.Toggle should not purge the reference we still
    // hold — if the listener were still live and the shared client still
    // alive it would have been cleared.
    client.setQueryData(['after-destroy'], 'value');
    eventBus.emit(MockEvents.Toggle, { enabled: true });
    // Allow any lingering microtasks a chance to run.
    await Promise.resolve();
    await Promise.resolve();
    expect(client.getQueryData(['after-destroy'])).toBe('value');
  });

  it('clears cached data on destroy', async () => {
    const plugin = queryCache({ gcTime: 300_000 });
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();

    client.setQueryData(['key'], 'value');

    plugin.onDestroy!(stubApp());
    await flushQueryCacheClear();

    expect(client.getQueryData(['key'])).toBeUndefined();
  });

  it('resets the shared fetch cache after the last plugin runtime is destroyed', async () => {
    const plugin = queryCache();
    const firstCache = getSharedFetchCache();
    const fetcher = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

    plugin.onInit!(stubApp());
    await firstCache.getOrFetch(['shared'], fetcher, { staleTime: 1_000 });

    plugin.onDestroy!(stubApp());
    await flushQueryCacheClear();

    const secondCache = getSharedFetchCache();
    await secondCache.getOrFetch(['shared'], fetcher, { staleTime: 1_000 });

    expect(secondCache).not.toBe(firstCache);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('clears retained shared fetch cache entries on destroy', async () => {
    const plugin = queryCache();
    const sharedFetchCache = getSharedFetchCache();
    const fetcher = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

    plugin.onInit!(stubApp());
    await sharedFetchCache.getOrFetch(['shared'], fetcher, { staleTime: 1_000 });
    await sharedFetchCache.getOrFetch(['shared'], fetcher, { staleTime: 1_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);

    plugin.onDestroy!(stubApp());
    await flushQueryCacheClear();

    await sharedFetchCache.getOrFetch(['shared'], fetcher, { staleTime: 1_000 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('after onDestroy, MockEvents.Toggle no longer clears cache (unsubscribed)', () => {
    const plugin = queryCache({ gcTime: 300_000 });
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();

    plugin.onDestroy!(stubApp());

    client.setQueryData(['key'], 'fresh');

    eventBus.emit(MockEvents.Toggle, { enabled: true });

    expect(client.getQueryData(['key'])).toBe('fresh');
  });

  it('after onDestroy, cache/invalidate no longer invalidates queries (unsubscribed)', () => {
    const plugin = queryCache({ gcTime: 300_000 });
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();

    plugin.onDestroy!(stubApp());

    client.setQueryData(['key'], 'fresh');

    eventBus.emit('cache/invalidate', { queryKey: ['key'] });

    const state = client.getQueryState(['key']);
    expect(state?.isInvalidated).toBeFalsy();
  });

  it('calling onDestroy multiple times does not change retainer count below zero', async () => {
    const plugin = queryCache();
    plugin.onInit!(stubApp());
    plugin.onDestroy!(stubApp());
    await flushQueryCacheClear();

    expect(peekSharedQueryClientRetainers()).toBe(0);
    expect(() => {
      plugin.onDestroy!(stubApp());
    }).not.toThrow();
    await flushQueryCacheClear();

    expect(peekSharedQueryClientRetainers()).toBe(0);
    expect(peekSharedQueryClient()).toBeUndefined();
  });

  it('two plugin instances have independent cleanup — destroying one does not break the other', async () => {
    const pluginA = queryCache();
    const pluginB = queryCache();
    pluginA.onInit!(stubApp());
    pluginB.onInit!(stubApp());
    const clientA = requireSharedQueryClient();
    const clientB = requireSharedQueryClient();

    clientA.setQueryData(['a'], 'dataA');
    clientB.setQueryData(['b'], 'dataB');

    pluginA.onDestroy!(stubApp());
    await flushQueryCacheClear();

    clientB.setQueryData(['b'], 'dataB-fresh');
    eventBus.emit('cache/invalidate', { queryKey: ['b'] });

    expect(clientB.getQueryState(['b'])?.isInvalidated).toBe(true);
    expect(clientA.getQueryData(['a'])).toBe('dataA');

    eventBus.emit(MockEvents.Toggle, { enabled: true });
    await waitForQueryDataGone(clientB, ['b']);

    pluginB.onDestroy!(stubApp());
  });

  it('does not reset the shared fetch cache while another plugin runtime is still active', async () => {
    const pluginA = queryCache();
    const pluginB = queryCache();
    const fetcher = vi.fn().mockResolvedValue('shared');

    pluginA.onInit!(stubApp());
    pluginB.onInit!(stubApp());

    const firstCache = getSharedFetchCache();
    await firstCache.getOrFetch(['shared'], fetcher, { staleTime: 1_000 });

    pluginA.onDestroy!(stubApp());
    await flushQueryCacheClear();

    const secondCache = getSharedFetchCache();
    await secondCache.getOrFetch(['shared'], fetcher, { staleTime: 1_000 });

    expect(secondCache).toBe(firstCache);
    expect(fetcher).toHaveBeenCalledTimes(1);

    pluginB.onDestroy!(stubApp());
  });

  it('waits for cancellation before clearing runtime and releasing shared fetch cache', async () => {
    const plugin = queryCache();
    plugin.onInit!(stubApp());
    const client = requireSharedQueryClient();
    const deferred = createDeferred();
    const firstCache = getSharedFetchCache();
    const clearSpy = vi.spyOn(client, 'clear');

    const cancelQueriesSpy = vi
      .spyOn(client, 'cancelQueries')
      .mockImplementation(() => deferred.promise);

    plugin.onDestroy!(stubApp());
    await flushQueryCacheClear();

    expect(cancelQueriesSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).not.toHaveBeenCalled();
    expect(getSharedFetchCache()).toBe(firstCache);

    deferred.resolve();
    await flushQueryCacheClear();

    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(getSharedFetchCache()).not.toBe(firstCache);
  });

  it('reuses the same shared QueryClient if a new host plugin starts before destroy teardown settles', async () => {
    const firstPlugin = queryCache();
    firstPlugin.onInit!(stubApp());
    const firstClient = requireSharedQueryClient();
    const deferred = createDeferred();
    const clearSpy = vi.spyOn(firstClient, 'clear');

    vi.spyOn(firstClient, 'cancelQueries').mockImplementation(() => deferred.promise);

    firstPlugin.onDestroy!(stubApp());
    await flushQueryCacheClear();

    expect(peekSharedQueryClient()).toBe(firstClient);
    expect(peekSharedQueryClientRetainers()).toBe(0);

    const secondPlugin = queryCache();
    secondPlugin.onInit!(stubApp());
    const secondClient = requireSharedQueryClient();

    expect(secondClient).toBe(firstClient);
    expect(peekSharedQueryClient()).toBe(firstClient);
    expect(peekSharedQueryClientRetainers()).toBe(1);

    deferred.resolve();
    await flushQueryCacheClear();

    expect(clearSpy).not.toHaveBeenCalled();
    expect(peekSharedQueryClient()).toBe(firstClient);
    expect(peekSharedQueryClientRetainers()).toBe(1);

    secondPlugin.onDestroy!(stubApp());
    await flushQueryCacheClear();
  });

  it('releases the original shared fetch cache retain when host teardown is superseded', async () => {
    const firstPlugin = queryCache();
    firstPlugin.onInit!(stubApp());
    const firstClient = requireSharedQueryClient();
    const firstCache = getSharedFetchCache();
    const deferred = createDeferred();
    const fetcher = vi.fn().mockResolvedValue('shared');

    vi.spyOn(firstClient, 'cancelQueries')
      .mockImplementationOnce(() => deferred.promise)
      .mockResolvedValue(undefined);

    await firstCache.getOrFetch(['shared'], fetcher, { staleTime: 1_000 });

    firstPlugin.onDestroy!(stubApp());
    await flushQueryCacheClear();

    const secondPlugin = queryCache();
    secondPlugin.onInit!(stubApp());

    deferred.resolve();
    await flushQueryCacheClear();

    secondPlugin.onDestroy!(stubApp());
    await flushQueryCacheClear();

    const secondCache = getSharedFetchCache();
    await secondCache.getOrFetch(['shared'], fetcher, { staleTime: 1_000 });

    expect(secondCache).not.toBe(firstCache);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('lets queryCacheShared() join the pending shared runtime before destroy teardown settles', async () => {
    const hostPlugin = queryCache();
    const sharedPlugin = queryCacheShared();
    hostPlugin.onInit!(stubApp());
    const hostClient = requireSharedQueryClient();
    const deferred = createDeferred();
    const clearSpy = vi.spyOn(hostClient, 'clear');

    vi.spyOn(hostClient, 'cancelQueries').mockImplementation(() => deferred.promise);

    hostPlugin.onDestroy!(stubApp());
    await flushQueryCacheClear();

    sharedPlugin.onInit!(stubApp());

    expect(peekSharedQueryClient()).toBe(hostClient);
    expect(peekSharedQueryClientRetainers()).toBe(1);

    deferred.resolve();
    await flushQueryCacheClear();

    expect(clearSpy).not.toHaveBeenCalled();
    expect(peekSharedQueryClient()).toBe(hostClient);
    expect(peekSharedQueryClientRetainers()).toBe(1);

    sharedPlugin.onDestroy!(stubApp());
    await flushQueryCacheClear();
  });

  it('releases the original shared fetch cache retain when shared teardown is superseded', async () => {
    const hostPlugin = queryCache();
    const firstSharedPlugin = queryCacheShared();
    hostPlugin.onInit!(stubApp());
    firstSharedPlugin.onInit!(stubApp());
    const hostClient = requireSharedQueryClient();
    const firstCache = getSharedFetchCache();
    const deferred = createDeferred();
    const fetcher = vi.fn().mockResolvedValue('shared');

    vi.spyOn(hostClient, 'cancelQueries')
      .mockImplementationOnce(() => deferred.promise)
      .mockResolvedValue(undefined);

    await firstCache.getOrFetch(['shared'], fetcher, { staleTime: 1_000 });

    hostPlugin.onDestroy!(stubApp());
    await flushQueryCacheClear();

    firstSharedPlugin.onDestroy!(stubApp());
    await flushQueryCacheClear();

    const secondSharedPlugin = queryCacheShared();
    secondSharedPlugin.onInit!(stubApp());

    deferred.resolve();
    await flushQueryCacheClear();

    secondSharedPlugin.onDestroy!(stubApp());
    await flushQueryCacheClear();

    const secondCache = getSharedFetchCache();
    await secondCache.getOrFetch(['shared'], fetcher, { staleTime: 1_000 });

    expect(secondCache).not.toBe(firstCache);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('still releases the shared fetch cache when runtime cancellation fails on destroy', async () => {
    await withSilencedConsoleError(async (consoleErrorSpy) => {
      const plugin = queryCache();
      plugin.onInit!(stubApp());
      const client = requireSharedQueryClient();
      const firstCache = getSharedFetchCache();
      const fetcher = vi.fn().mockResolvedValue('shared');
      const clearSpy = vi.spyOn(client, 'clear');

      const cancelQueriesSpy = vi
        .spyOn(client, 'cancelQueries')
        .mockRejectedValue(new Error('cancel failed'));
      client.setQueryData(['stale'], 'value');
      await firstCache.getOrFetch(['shared'], fetcher, { staleTime: 1_000 });

      plugin.onDestroy!(stubApp());
      await flushQueryCacheClear();

      expect(cancelQueriesSpy).toHaveBeenCalledTimes(1);
      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Gears FrontX] Failed to destroy query cache runtime',
        expect.any(Error)
      );
      expect(client.getQueryData(['stale'])).toBeUndefined();

      const secondCache = getSharedFetchCache();
      await secondCache.getOrFetch(['shared'], fetcher, { staleTime: 1_000 });

      expect(secondCache).not.toBe(firstCache);
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });
});
