// @cpt-FEATURE:implement-endpoint-descriptors:p2
// @cpt-dod:cpt-frontx-dod-request-lifecycle-query-provider:p2
// @cpt-flow:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2
// @cpt-flow:cpt-frontx-flow-request-lifecycle-flux-escape-hatch:p2
// @cpt-algo:cpt-frontx-algo-request-lifecycle-query-client-defaults:p2

/**
 * QueryCache Plugin - shared QueryClient lifecycle management
 *
 * Framework Layer: L2
 *
 * Owns the shared QueryClient lifecycle, cache invalidation via Flux events,
 * cache clearing on mock toggle, and cleanup on destroy.
 * Zero React imports — this plugin is headless.
 */

import {
  peekSharedFetchCache,
  releaseSharedFetchCache,
  retainSharedFetchCache,
} from '@gears-frontx/api';
import { QueryClient } from '@tanstack/query-core';
import { eventBus, type Subscription } from '@gears-frontx/state';
import type { HAI3App, HAI3Plugin } from '../types';
import { MockEvents } from '../effects/mockEffects';

const QUERY_CACHE_RUNTIME_CHANGED_EVENT = 'cache/runtime/changed' as const;

declare module '@gears-frontx/state' {
  interface EventPayloadMap {
    'cache/runtime/changed': CacheRuntimeChangedPayload;
    'cache/invalidate': CacheInvalidatePayload;
    'cache/set': CacheSetPayload;
    'cache/remove': CacheRemovePayload;
  }
}

type QueryCacheKey = readonly unknown[];
type QueryCacheRefetchMode = 'active' | 'inactive' | 'all' | 'none';
type QueryCacheUpdater<T> = T | ((old: T | undefined) => T | undefined);

interface QueryCacheInvalidateFilters {
  queryKey: QueryCacheKey;
  exact?: boolean;
  refetchType?: QueryCacheRefetchMode;
}

interface CacheEventBase {
  source?: string;
}

interface CacheRuntimeChangedPayload {
  available: boolean;
}

interface CacheInvalidatePayload extends QueryCacheInvalidateFilters, CacheEventBase {}

interface CacheSetPayload extends CacheEventBase {
  queryKey: QueryCacheKey;
  dataOrUpdater: QueryCacheUpdater<unknown>;
}

interface CacheRemovePayload extends CacheEventBase {
  queryKey: QueryCacheKey;
}

const SHARED_QUERY_CLIENT_SYMBOL = Symbol.for('hai3:query-cache:shared-client');
const SHARED_QUERY_CLIENT_RETAINERS_SYMBOL = Symbol.for('hai3:query-cache:shared-client-retainers');
const SHARED_QUERY_CLIENT_CONFIG_SYMBOL = Symbol.for('hai3:query-cache:shared-client-config');
const SHARED_QUERY_CLIENT_TEARDOWN_TOKEN_SYMBOL = Symbol.for(
  'hai3:query-cache:shared-client-teardown-token'
);
const QUERY_CLIENT_BROADCAST_TARGET_SYMBOL = Symbol.for('hai3:query-cache:broadcast-target');
const QUERY_CLIENT_BROADCAST_COUNTER_SYMBOL = Symbol.for('hai3:query-cache:broadcast-counter');
const APP_QUERY_CLIENT_SYMBOL = Symbol.for('hai3:query-cache:app-client');
const APP_QUERY_CLIENT_RESOLVER_SYMBOL = Symbol.for('hai3:query-cache:app-client-resolver');
const APP_QUERY_CLIENT_ACTIVATOR_SYMBOL = Symbol.for('hai3:query-cache:app-client-activator');
const DUPLICATE_PLUGIN_CLEANUP_SYMBOL = Symbol.for('hai3:plugin:duplicate-cleanup');

type QueryClientWithMetadata = QueryClient & {
  [QUERY_CLIENT_BROADCAST_TARGET_SYMBOL]?: string;
};

type QueryClientApp = HAI3App & {
  [APP_QUERY_CLIENT_SYMBOL]?: QueryClient;
  [APP_QUERY_CLIENT_RESOLVER_SYMBOL]?: () => QueryClient | undefined;
  [APP_QUERY_CLIENT_ACTIVATOR_SYMBOL]?: () => QueryClient | undefined;
};

type QueryCachePlugin = HAI3Plugin & {
  [DUPLICATE_PLUGIN_CLEANUP_SYMBOL]?: () => void;
};

type SharedQueryClientHost = typeof globalThis & {
  [SHARED_QUERY_CLIENT_SYMBOL]?: QueryClient;
  [SHARED_QUERY_CLIENT_RETAINERS_SYMBOL]?: number;
  [SHARED_QUERY_CLIENT_CONFIG_SYMBOL]?: ResolvedQueryCacheConfig;
  [SHARED_QUERY_CLIENT_TEARDOWN_TOKEN_SYMBOL]?: number;
  [QUERY_CLIENT_BROADCAST_COUNTER_SYMBOL]?: number;
};

type CacheEffectsEntry = {
  retainers: number;
  cleanup: () => void;
  disposed: boolean;
};

type SharedFetchCacheInvalidator = {
  invalidate(key: readonly unknown[]): void;
  invalidateMany?: (filters?: { key?: readonly unknown[]; exact?: boolean }) => void;
  clear(): void;
};

type InvalidatePayloadInput = {
  queryKey?: unknown;
  exact?: boolean;
  refetchType?: QueryCacheInvalidateFilters['refetchType'];
};

type CacheSetPayloadInput = {
  queryKey?: unknown;
  dataOrUpdater?: unknown;
  source?: unknown;
};

type CacheRemovePayloadInput = {
  queryKey?: unknown;
  source?: unknown;
};

type ResolvedQueryCacheConfig = Required<QueryCacheConfig>;

const cacheEffectsByClient = new WeakMap<QueryClient, CacheEffectsEntry>();

// @cpt-begin:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-shared-query-runtime-helpers
function finalizeCacheEffectsEntry(queryClient: QueryClient, entry: CacheEffectsEntry): void {
  if (entry.disposed) {
    return;
  }

  entry.disposed = true;
  entry.cleanup();
  cacheEffectsByClient.delete(queryClient);
}

function emitSharedQueryClientRuntimeChanged(available: boolean): void {
  eventBus.emit(QUERY_CACHE_RUNTIME_CHANGED_EVENT, { available });
}

/**
 * Subscribe to shared QueryClient availability changes (host init, teardown, MFE join).
 * Keeps the Flux event name internal to the queryCache plugin.
 */
export function subscribeQueryCacheRuntimeChanged(listener: () => void): Subscription {
  return eventBus.on(QUERY_CACHE_RUNTIME_CHANGED_EVENT, () => {
    listener();
  });
}

function resolveQueryCacheConfig(config?: QueryCacheConfig): ResolvedQueryCacheConfig {
  return {
    staleTime: config?.staleTime ?? 30_000,
    gcTime: config?.gcTime ?? 300_000,
    refetchOnWindowFocus: config?.refetchOnWindowFocus ?? true,
  };
}

function isSameQueryCacheConfig(
  left: ResolvedQueryCacheConfig,
  right: ResolvedQueryCacheConfig
): boolean {
  return (
    left.staleTime === right.staleTime &&
    left.gcTime === right.gcTime &&
    left.refetchOnWindowFocus === right.refetchOnWindowFocus
  );
}

function resolveSharedQueryClientRetainers(host: SharedQueryClientHost): number {
  const retainers = host[SHARED_QUERY_CLIENT_RETAINERS_SYMBOL];
  if (typeof retainers !== 'number' || !Number.isFinite(retainers) || retainers < 0) {
    return 0;
  }

  return retainers;
}

function resolveSharedQueryClientTeardownToken(host: SharedQueryClientHost): number {
  const token = host[SHARED_QUERY_CLIENT_TEARDOWN_TOKEN_SYMBOL];
  if (typeof token !== 'number' || !Number.isInteger(token) || token < 0) {
    return 0;
  }

  return token;
}

function ensureQueryClientBroadcastTarget(queryClient: QueryClient): string {
  const clientWithMetadata = queryClient as QueryClientWithMetadata;
  const existingTarget = clientWithMetadata[QUERY_CLIENT_BROADCAST_TARGET_SYMBOL];
  if (typeof existingTarget === 'string' && existingTarget.length > 0) {
    return existingTarget;
  }

  const host = globalThis as SharedQueryClientHost;
  const nextCounter = (host[QUERY_CLIENT_BROADCAST_COUNTER_SYMBOL] ?? 0) + 1;
  host[QUERY_CLIENT_BROADCAST_COUNTER_SYMBOL] = nextCounter;

  const broadcastTarget = `query-cache-${nextCounter}`;
  clientWithMetadata[QUERY_CLIENT_BROADCAST_TARGET_SYMBOL] = broadcastTarget;
  return broadcastTarget;
}

function attachQueryClientToApp(app: HAI3App, queryClient: QueryClient): void {
  (app as QueryClientApp)[APP_QUERY_CLIENT_SYMBOL] = queryClient;
}

function detachQueryClientFromApp(app: HAI3App, queryClient: QueryClient): void {
  const clientApp = app as QueryClientApp;
  if (clientApp[APP_QUERY_CLIENT_SYMBOL] === queryClient) {
    delete clientApp[APP_QUERY_CLIENT_SYMBOL];
  }
}

function attachQueryClientResolverToApp(
  app: HAI3App,
  resolver: () => QueryClient | undefined
): void {
  (app as QueryClientApp)[APP_QUERY_CLIENT_RESOLVER_SYMBOL] = resolver;
}

function detachQueryClientResolverFromApp(app: HAI3App): void {
  delete (app as QueryClientApp)[APP_QUERY_CLIENT_RESOLVER_SYMBOL];
}

function attachQueryClientActivatorToApp(
  app: HAI3App,
  activator: () => QueryClient | undefined
): void {
  (app as QueryClientApp)[APP_QUERY_CLIENT_ACTIVATOR_SYMBOL] = activator;
}

function detachQueryClientActivatorFromApp(app: HAI3App): void {
  delete (app as QueryClientApp)[APP_QUERY_CLIENT_ACTIVATOR_SYMBOL];
}

function createSharedQueryClient(config?: QueryCacheConfig): QueryClient {
  const resolvedConfig = resolveQueryCacheConfig(config);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: resolvedConfig.staleTime,
        gcTime: resolvedConfig.gcTime,
        retry: 0,
        refetchOnWindowFocus: resolvedConfig.refetchOnWindowFocus,
      },
    },
  });
  ensureQueryClientBroadcastTarget(queryClient);

  const host = globalThis as SharedQueryClientHost;
  host[SHARED_QUERY_CLIENT_CONFIG_SYMBOL] = resolvedConfig;
  return queryClient;
}

function getSharedQueryClient(config?: QueryCacheConfig): QueryClient {
  const host = globalThis as SharedQueryClientHost;
  const existingClient = host[SHARED_QUERY_CLIENT_SYMBOL];
  const resolvedConfig = resolveQueryCacheConfig(config);

  if (!existingClient) {
    const createdClient = createSharedQueryClient(config);
    host[SHARED_QUERY_CLIENT_SYMBOL] = createdClient;
    return createdClient;
  }

  const existingConfig = host[SHARED_QUERY_CLIENT_CONFIG_SYMBOL];
  if (existingConfig && !isSameQueryCacheConfig(existingConfig, resolvedConfig)) {
    throw new Error(
      '[HAI3] queryCache() received a config that conflicts with the existing shared QueryClient.'
    );
  }

  ensureQueryClientBroadcastTarget(existingClient);
  return existingClient;
}

function peekSharedQueryClient(): QueryClient | undefined {
  return (globalThis as SharedQueryClientHost)[SHARED_QUERY_CLIENT_SYMBOL];
}

function retainSharedQueryClient(config?: QueryCacheConfig): QueryClient {
  const host = globalThis as SharedQueryClientHost;
  const queryClient = getSharedQueryClient(config);
  const retainers = resolveSharedQueryClientRetainers(host);
  host[SHARED_QUERY_CLIENT_RETAINERS_SYMBOL] = retainers + 1;
  if (retainers === 0) {
    host[SHARED_QUERY_CLIENT_TEARDOWN_TOKEN_SYMBOL] = resolveSharedQueryClientTeardownToken(host) + 1;
  }
  emitSharedQueryClientRuntimeChanged(true);
  return queryClient;
}

function retainExistingSharedQueryClient(): QueryClient {
  const host = globalThis as SharedQueryClientHost;
  const queryClient = host[SHARED_QUERY_CLIENT_SYMBOL];
  if (!queryClient) {
    throw new Error(
      '[HAI3] queryCacheShared() requires an existing host queryCache() runtime.'
    );
  }

  ensureQueryClientBroadcastTarget(queryClient);
  const retainers = resolveSharedQueryClientRetainers(host);
  host[SHARED_QUERY_CLIENT_RETAINERS_SYMBOL] = retainers + 1;
  if (retainers === 0) {
    host[SHARED_QUERY_CLIENT_TEARDOWN_TOKEN_SYMBOL] = resolveSharedQueryClientTeardownToken(host) + 1;
  }
  return queryClient;
}

function releaseSharedQueryClient(): { released: boolean; isLastRetainer: boolean; teardownToken: number } {
  const host = globalThis as SharedQueryClientHost;
  const retainers = resolveSharedQueryClientRetainers(host);

  if (retainers === 0) {
    return { released: false, isLastRetainer: false, teardownToken: 0 };
  }

  if (retainers === 1) {
    const teardownToken = resolveSharedQueryClientTeardownToken(host) + 1;
    host[SHARED_QUERY_CLIENT_RETAINERS_SYMBOL] = 0;
    host[SHARED_QUERY_CLIENT_TEARDOWN_TOKEN_SYMBOL] = teardownToken;
    return { released: true, isLastRetainer: true, teardownToken };
  }

  host[SHARED_QUERY_CLIENT_RETAINERS_SYMBOL] = retainers - 1;
  return { released: true, isLastRetainer: false, teardownToken: 0 };
}

function finalizeReleasedSharedQueryClient(queryClient: QueryClient, teardownToken: number): boolean {
  const host = globalThis as SharedQueryClientHost;
  if (host[SHARED_QUERY_CLIENT_SYMBOL] !== queryClient) {
    return false;
  }

  if (resolveSharedQueryClientRetainers(host) !== 0) {
    return false;
  }

  if (resolveSharedQueryClientTeardownToken(host) !== teardownToken) {
    return false;
  }

  queryClient.clear();
  delete host[SHARED_QUERY_CLIENT_SYMBOL];
  delete host[SHARED_QUERY_CLIENT_RETAINERS_SYMBOL];
  delete host[SHARED_QUERY_CLIENT_CONFIG_SYMBOL];
  delete host[SHARED_QUERY_CLIENT_TEARDOWN_TOKEN_SYMBOL];
  emitSharedQueryClientRuntimeChanged(false);
  return true;
}

export function resetSharedQueryClient(): void {
  const host = globalThis as SharedQueryClientHost;
  const client = host[SHARED_QUERY_CLIENT_SYMBOL];
  if (client) {
    const cacheEffects = cacheEffectsByClient.get(client);
    if (cacheEffects) {
      finalizeCacheEffectsEntry(client, cacheEffects);
    }

    client.clear();
  }

  delete host[SHARED_QUERY_CLIENT_SYMBOL];
  delete host[SHARED_QUERY_CLIENT_RETAINERS_SYMBOL];
  delete host[SHARED_QUERY_CLIENT_CONFIG_SYMBOL];
  delete host[SHARED_QUERY_CLIENT_TEARDOWN_TOKEN_SYMBOL];
  emitSharedQueryClientRuntimeChanged(false);
}

function isNonEmptyQueryCacheKey(queryKey: unknown): queryKey is QueryCacheKey {
  return Array.isArray(queryKey) && queryKey.length > 0;
}

function isLocalBroadcast(queryClient: QueryClient, payload: unknown): boolean {
  if (payload === null || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as CacheEventBase;
  return candidate.source === ensureQueryClientBroadcastTarget(queryClient);
}

function invalidateSharedFetchCache(
  cache: SharedFetchCacheInvalidator | undefined,
  filters: QueryCacheInvalidateFilters
): void {
  if (!cache) {
    return;
  }

  if (filters.exact === false) {
    cache.invalidateMany?.({
      key: filters.queryKey,
      exact: false,
    });

    if (!cache.invalidateMany) {
      cache.clear();
    }
    return;
  }

  cache.invalidate(filters.queryKey);
}

function toScopedInvalidateFilters(payload: unknown): QueryCacheInvalidateFilters | null {
  if (payload === null || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as InvalidatePayloadInput;
  if (!isNonEmptyQueryCacheKey(candidate.queryKey)) {
    return null;
  }

  return {
    queryKey: candidate.queryKey,
    ...(candidate.exact === undefined ? {} : { exact: candidate.exact }),
    ...(candidate.refetchType === undefined ? {} : { refetchType: candidate.refetchType }),
  };
}

function toScopedCacheSetPayload(payload: unknown): CacheSetPayload | null {
  if (payload === null || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as CacheSetPayloadInput;
  if (!isNonEmptyQueryCacheKey(candidate.queryKey)) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(candidate, 'dataOrUpdater')) {
    return null;
  }

  return {
    queryKey: candidate.queryKey,
    dataOrUpdater: candidate.dataOrUpdater as QueryCacheUpdater<unknown>,
    ...(typeof candidate.source === 'string' ? { source: candidate.source } : {}),
  };
}

function toScopedCacheRemovePayload(payload: unknown): CacheRemovePayload | null {
  if (payload === null || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as CacheRemovePayloadInput;
  if (!isNonEmptyQueryCacheKey(candidate.queryKey)) {
    return null;
  }

  return {
    queryKey: candidate.queryKey,
    ...(typeof candidate.source === 'string' ? { source: candidate.source } : {}),
  };
}

/**
 * queryCache() plugin configuration.
 */
export interface QueryCacheConfig {
  /**
   * Time in ms before a query is considered stale and eligible for background refetch.
   * @default 30_000
   */
  staleTime?: number;

  /**
   * Time in ms that unused/inactive query cache entries are kept in memory.
   * @default 300_000
   */
  gcTime?: number;

  /**
   * Whether to refetch queries when the window regains focus.
   * @default true
   */
  refetchOnWindowFocus?: boolean;
}

// @cpt-end:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-shared-query-runtime-helpers

// @cpt-begin:implement-endpoint-descriptors:p2:inst-1
// @cpt-begin:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-mock-cache-clear
// @cpt-begin:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-flux-cache-invalidate
// @cpt-begin:cpt-frontx-flow-request-lifecycle-flux-escape-hatch:p2:inst-invalidate-after-flux
async function cancelQueriesForTeardown(queryClient: QueryClient): Promise<void> {
  let cancelError: unknown;

  try {
    await queryClient.cancelQueries();
  } catch (error: unknown) {
    cancelError = error;
  }

  if (cancelError) {
    throw cancelError;
  }
}

type QueryTeardownCallbacks = {
  onSettled?: () => void;
  onFailure?: () => void;
  onSuccess?: () => void;
};

function runQueryTeardown(
  queryClient: QueryClient,
  callbacks: QueryTeardownCallbacks,
  failureMessage: string
): void {
  void cancelQueriesForTeardown(queryClient)
    .then(() => {
      callbacks.onSuccess?.();
    })
    .catch((error: unknown) => {
      callbacks.onFailure?.();
      console.error(failureMessage, error);
    })
    .finally(() => {
      callbacks.onSettled?.();
    });
}

function createCacheEffects(queryClient: QueryClient): () => void {
  const mockToggleSub = eventBus.on(MockEvents.Toggle, () => {
    runQueryTeardown(
      queryClient,
      {
        onSettled: () => {
          queryClient.clear();
          peekSharedFetchCache()?.clear();
        },
      },
      '[HAI3] Failed to clear query cache after mock toggle'
    );
  });

  const invalidateSub = eventBus.on('cache/invalidate', (payload: unknown) => {
    const filters = toScopedInvalidateFilters(payload);
    if (!filters) {
      return;
    }

    if (!isLocalBroadcast(queryClient, payload)) {
      void queryClient.invalidateQueries(filters);
    }

    invalidateSharedFetchCache(peekSharedFetchCache(), filters);
  });

  const setSub = eventBus.on('cache/set', (payload: unknown) => {
    const cacheSetPayload = toScopedCacheSetPayload(payload);
    if (!cacheSetPayload) {
      return;
    }

    if (!isLocalBroadcast(queryClient, cacheSetPayload)) {
      queryClient.setQueryData(cacheSetPayload.queryKey, cacheSetPayload.dataOrUpdater);
    }

    peekSharedFetchCache()?.invalidate(cacheSetPayload.queryKey);
  });

  const removeSub = eventBus.on('cache/remove', (payload: unknown) => {
    const cacheRemovePayload = toScopedCacheRemovePayload(payload);
    if (!cacheRemovePayload) {
      return;
    }

    if (!isLocalBroadcast(queryClient, cacheRemovePayload)) {
      queryClient.removeQueries({ queryKey: cacheRemovePayload.queryKey });
    }

    peekSharedFetchCache()?.invalidate(cacheRemovePayload.queryKey);
  });

  return () => {
    mockToggleSub.unsubscribe();
    invalidateSub.unsubscribe();
    setSub.unsubscribe();
    removeSub.unsubscribe();
  };
}

function retainCacheEffects(queryClient: QueryClient): () => void {
  const existingEntry = cacheEffectsByClient.get(queryClient);
  if (existingEntry) {
    existingEntry.retainers += 1;
    return () => {
      if (existingEntry.disposed) {
        return;
      }

      existingEntry.retainers -= 1;
      if (existingEntry.retainers === 0) {
        finalizeCacheEffectsEntry(queryClient, existingEntry);
      }
    };
  }

  const entry: CacheEffectsEntry = {
    retainers: 1,
    cleanup: createCacheEffects(queryClient),
    disposed: false,
  };
  cacheEffectsByClient.set(queryClient, entry);

  return () => {
    if (entry.disposed) {
      return;
    }

    entry.retainers -= 1;
    if (entry.retainers === 0) {
      finalizeCacheEffectsEntry(queryClient, entry);
    }
  };
}
// @cpt-end:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-mock-cache-clear
// @cpt-end:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-flux-cache-invalidate
// @cpt-end:cpt-frontx-flow-request-lifecycle-flux-escape-hatch:p2:inst-invalidate-after-flux
// @cpt-end:implement-endpoint-descriptors:p2:inst-1

// @cpt-begin:implement-endpoint-descriptors:p2:inst-2
// @cpt-begin:cpt-frontx-algo-request-lifecycle-query-client-defaults:p2:inst-create-in-plugin
// @cpt-begin:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-create-query-client
// @cpt-begin:cpt-frontx-dod-request-lifecycle-query-provider:p2:inst-plugin-factory
export function queryCache(config?: QueryCacheConfig): HAI3Plugin {
  let queryClient: QueryClient | undefined;
  let cleanup: (() => void) | null = null;
  let sharedFetchCacheRetained = false;
  let sharedRetainerReleased = false;

  function releasePluginRetainer(): {
    released: boolean;
    isLastRetainer: boolean;
    teardownToken: number;
  } {
    if (!queryClient || sharedRetainerReleased) {
      return { released: false, isLastRetainer: false, teardownToken: 0 };
    }

    sharedRetainerReleased = true;
    const release = releaseSharedQueryClient();
    return {
      released: release.released,
      isLastRetainer: release.isLastRetainer,
      teardownToken: release.teardownToken,
    };
  }

  function releasePluginSharedFetchCacheRetainer(): void {
    if (!sharedFetchCacheRetained) {
      return;
    }

    sharedFetchCacheRetained = false;
    releaseSharedFetchCache();
  }

  const plugin: QueryCachePlugin = {
    name: 'queryCache',
    [DUPLICATE_PLUGIN_CLEANUP_SYMBOL]() {
      const { released } = releasePluginRetainer();
      if (!released) {
        return;
      }

      releasePluginSharedFetchCacheRetainer();
    },
    onInit(app) {
      if (!queryClient) {
        queryClient = retainSharedQueryClient(config);
        retainSharedFetchCache();
        sharedFetchCacheRetained = true;
        cleanup = retainCacheEffects(queryClient);
      }
      attachQueryClientToApp(app, queryClient);
    },
    onDestroy(app) {
      if (queryClient) {
        detachQueryClientFromApp(app, queryClient);
      }
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
      const { released, isLastRetainer, teardownToken } = releasePluginRetainer();
      if (!released) {
        return;
      }
      const sharedQueryClient = queryClient;
      if (!sharedQueryClient) {
        return;
      }
      const isLastSharedRetainer = isLastRetainer;
      if (isLastSharedRetainer) {
        runQueryTeardown(
          sharedQueryClient,
          {
            onSettled: () => {
              finalizeReleasedSharedQueryClient(sharedQueryClient, teardownToken);
              releasePluginSharedFetchCacheRetainer();
            },
          },
          '[HAI3] Failed to destroy query cache runtime'
        );
        return;
      }

      releasePluginSharedFetchCacheRetainer();
    },
  };

  return plugin;
}
// @cpt-end:cpt-frontx-algo-request-lifecycle-query-client-defaults:p2:inst-create-in-plugin
// @cpt-end:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-create-query-client
// @cpt-end:cpt-frontx-dod-request-lifecycle-query-provider:p2:inst-plugin-factory
// @cpt-end:implement-endpoint-descriptors:p2:inst-2

export function queryCacheShared(): HAI3Plugin {
  let queryClient: QueryClient | undefined;
  let cleanup: (() => void) | null = null;
  let sharedFetchCacheRetained = false;
  let sharedRetainerReleased = false;

  function ensureSharedQueryClient(app: HAI3App): QueryClient | undefined {
    if (queryClient) {
      attachQueryClientToApp(app, queryClient);
      return queryClient;
    }

    if (!peekSharedQueryClient()) {
      return undefined;
    }

    queryClient = retainExistingSharedQueryClient();
    attachQueryClientToApp(app, queryClient);

    if (!sharedFetchCacheRetained) {
      retainSharedFetchCache();
      sharedFetchCacheRetained = true;
    }

    cleanup = retainCacheEffects(queryClient);
    return queryClient;
  }

function releasePluginRetainer(): { released: boolean; isLastRetainer: boolean; teardownToken: number } {
    if (!queryClient || sharedRetainerReleased) {
      return { released: false, isLastRetainer: false, teardownToken: 0 };
    }

    sharedRetainerReleased = true;
    const release = releaseSharedQueryClient();
    return {
      released: release.released,
      isLastRetainer: release.isLastRetainer,
      teardownToken: release.teardownToken,
    };
  }

  function releasePluginSharedFetchCacheRetainer(): void {
    if (!sharedFetchCacheRetained) {
      return;
    }

    sharedFetchCacheRetained = false;
    releaseSharedFetchCache();
  }

  const plugin: QueryCachePlugin = {
    name: 'queryCacheShared',
    [DUPLICATE_PLUGIN_CLEANUP_SYMBOL]() {
      const { released } = releasePluginRetainer();
      if (!released) {
        return;
      }

      releasePluginSharedFetchCacheRetainer();
    },
    onInit(app) {
      attachQueryClientResolverToApp(app, () => (app as QueryClientApp)[APP_QUERY_CLIENT_SYMBOL]);
      attachQueryClientActivatorToApp(app, () => ensureSharedQueryClient(app));
      ensureSharedQueryClient(app);
    },
    onDestroy(app) {
      detachQueryClientResolverFromApp(app);
      detachQueryClientActivatorFromApp(app);
      if (queryClient) {
        detachQueryClientFromApp(app, queryClient);
      }
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
      const { released, isLastRetainer, teardownToken } = releasePluginRetainer();
      if (!released) {
        return;
      }
      const isLastSharedRetainer = isLastRetainer;
      if (isLastSharedRetainer) {
        const sharedQueryClient = queryClient;
        if (!sharedQueryClient) {
          return;
        }
        runQueryTeardown(
          sharedQueryClient,
          {
            onSettled: () => {
              finalizeReleasedSharedQueryClient(sharedQueryClient, teardownToken);
              releasePluginSharedFetchCacheRetainer();
            },
          },
          '[HAI3] Failed to destroy shared query cache runtime'
        );
        return;
      }

      releasePluginSharedFetchCacheRetainer();
    },
  };

  return plugin;
}
