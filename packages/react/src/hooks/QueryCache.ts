/**
 * QueryCache — restricted interface for interacting with the shared QueryClient.
 *
 * MFEs and screen-set components access the cache only through this sanctioned
 * public interface. It is injected as { queryCache } into useApiMutation
 * callbacks and also returned by useQueryCache() for controlled imperative
 * cache access.
 */
// @cpt-dod:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2
// @cpt-flow:cpt-frontx-flow-request-lifecycle-use-api-mutation:p2:inst-create-query-cache
// @cpt-FEATURE:implement-endpoint-descriptors:p3

import type { EndpointDescriptor } from '@gears-frontx/framework';
import { eventBus } from '@gears-frontx/framework';
import { type QueryClient, type QueryState } from '@tanstack/react-query';

export type QueryCacheKey = readonly unknown[];
export type QueryCacheRefetchMode = 'active' | 'inactive' | 'all' | 'none';
export type QueryCacheInvalidateTarget =
  | EndpointDescriptor<unknown>
  | QueryCacheKey
  | null
  | undefined;

export interface QueryCacheState<TData = unknown, TError = Error> {
  data: TData | undefined;
  dataUpdatedAt: number;
  error: TError | null;
  errorUpdatedAt: number;
  fetchFailureCount: number;
  fetchFailureReason: TError | null;
  fetchStatus: 'fetching' | 'paused' | 'idle';
  isInvalidated: boolean;
  status: 'pending' | 'error' | 'success';
}

export type QueryCacheInvalidateFilters = {
  queryKey?: QueryCacheInvalidateTarget;
  exact?: boolean;
  refetchType?: QueryCacheRefetchMode;
};

type QueryCacheUpdater<T> = T | ((old: T | undefined) => T | undefined);

type CacheInvalidateEvent = {
  queryKey: QueryCacheKey;
  exact?: boolean;
  refetchType?: QueryCacheRefetchMode;
  source?: string;
};

type CacheSetEvent = {
  queryKey: QueryCacheKey;
  dataOrUpdater: QueryCacheUpdater<unknown>;
  source?: string;
};

type CacheRemoveEvent = {
  queryKey: QueryCacheKey;
  source?: string;
};

const QUERY_CLIENT_BROADCAST_TARGET = Symbol.for('hai3:query-cache:broadcast-target');
const QUERY_CLIENT_BROADCAST_COUNTER = Symbol.for('hai3:query-cache:broadcast-counter');

type QueryClientWithMetadata = QueryClient & {
  [QUERY_CLIENT_BROADCAST_TARGET]?: string;
};

type QueryClientCounterHost = typeof globalThis & {
  [QUERY_CLIENT_BROADCAST_COUNTER]?: number;
};

function emitCacheEvent(event: string, payload: unknown): void {
  (eventBus.emit as (eventType: string, payload: unknown) => void)(event, payload);
}

function ensureBroadcastSource(queryClient: QueryClient): string {
  const clientWithMetadata = queryClient as QueryClientWithMetadata;
  const existingSource = clientWithMetadata[QUERY_CLIENT_BROADCAST_TARGET];
  if (typeof existingSource === 'string' && existingSource.length > 0) {
    return existingSource;
  }

  const host = globalThis as QueryClientCounterHost;
  const nextCounter = (host[QUERY_CLIENT_BROADCAST_COUNTER] ?? 0) + 1;
  host[QUERY_CLIENT_BROADCAST_COUNTER] = nextCounter;

  const source = `query-cache-${nextCounter}`;
  clientWithMetadata[QUERY_CLIENT_BROADCAST_TARGET] = source;
  return source;
}

// @cpt-begin:implement-endpoint-descriptors:p3:inst-resolve-key
export function resolveKey(target: EndpointDescriptor<unknown> | QueryCacheKey): readonly unknown[] {
  if (
    target !== null &&
    typeof target === 'object' &&
    !Array.isArray(target) &&
    'key' in target &&
    'fetch' in target &&
    Array.isArray(target.key) &&
    typeof target.fetch === 'function'
  ) {
    return target.key;
  }

  return target as readonly unknown[];
}
// @cpt-end:implement-endpoint-descriptors:p3:inst-resolve-key

// @cpt-begin:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-query-cache-interface
export interface QueryCache {
  get<T>(queryKey: EndpointDescriptor<unknown> | QueryCacheKey): T | undefined;
  getState<TData = unknown, TError = Error>(
    queryKey: EndpointDescriptor<unknown> | QueryCacheKey
  ): QueryCacheState<TData, TError> | undefined;
  set<T>(
    queryKey: EndpointDescriptor<unknown> | QueryCacheKey,
    dataOrUpdater: T | ((old: T | undefined) => T | undefined)
  ): void;
  cancel(queryKey: EndpointDescriptor<unknown> | QueryCacheKey): Promise<void>;
  invalidate(queryKey: EndpointDescriptor<unknown> | QueryCacheKey): Promise<void>;
  invalidateMany(filters?: QueryCacheInvalidateFilters | null): Promise<void>;
  remove(queryKey: EndpointDescriptor<unknown> | QueryCacheKey): void;
}
// @cpt-end:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-query-cache-interface

// @cpt-begin:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-mutation-callback-context
export interface MutationCallbackContext {
  queryCache: QueryCache;
}
// @cpt-end:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-mutation-callback-context

function toQueryUpdater<T>(
  dataOrUpdater: QueryCacheUpdater<T>
): (old: T | undefined) => T | undefined {
  if (typeof dataOrUpdater === 'function') {
    return dataOrUpdater as (old: T | undefined) => T | undefined;
  }

  return () => dataOrUpdater;
}

function mapQueryState<TData, TError = Error>(
  state: QueryState<TData, TError>
): QueryCacheState<TData, TError> {
  return {
    data: state.data,
    dataUpdatedAt: state.dataUpdatedAt,
    error: state.error,
    errorUpdatedAt: state.errorUpdatedAt,
    fetchFailureCount: state.fetchFailureCount,
    fetchFailureReason: state.fetchFailureReason,
    fetchStatus: state.fetchStatus,
    isInvalidated: state.isInvalidated,
    status: state.status,
  };
}

// @cpt-begin:implement-endpoint-descriptors:p3:inst-create-query-cache
export function createQueryCache(queryClient: QueryClient): QueryCache {
  return {
    get: <T,>(key: EndpointDescriptor<unknown> | QueryCacheKey): T | undefined => {
      return queryClient.getQueryData<T>(resolveKey(key));
    },
    getState: <TData = unknown, TError = Error>(key: EndpointDescriptor<unknown> | QueryCacheKey) => {
      const state = queryClient.getQueryState<TData, TError>(resolveKey(key));
      return state ? mapQueryState(state) : undefined;
    },
    set: <T,>(key: EndpointDescriptor<unknown> | QueryCacheKey, dataOrUpdater: QueryCacheUpdater<T>): void => {
      const resolvedKey = resolveKey(key);
      queryClient.setQueryData<T>(resolvedKey, toQueryUpdater(dataOrUpdater));
      emitCacheEvent('cache/set', {
        queryKey: resolvedKey,
        dataOrUpdater: dataOrUpdater as QueryCacheUpdater<unknown>,
        source: ensureBroadcastSource(queryClient),
      } satisfies CacheSetEvent);
    },
    cancel: (key: EndpointDescriptor<unknown> | QueryCacheKey): Promise<void> => {
      return queryClient.cancelQueries({ queryKey: resolveKey(key) });
    },
    invalidate: (key: EndpointDescriptor<unknown> | QueryCacheKey): Promise<void> => {
      const resolvedKey = resolveKey(key);
      const result = queryClient.invalidateQueries({ queryKey: resolvedKey });
      emitCacheEvent('cache/invalidate', {
        queryKey: resolvedKey,
        source: ensureBroadcastSource(queryClient),
      } satisfies CacheInvalidateEvent);
      return result;
    },
    invalidateMany: (filters): Promise<void> => {
      if (filters?.queryKey == null) {
        return Promise.resolve();
      }

      const resolvedKey = resolveKey(filters.queryKey);
      if (!Array.isArray(resolvedKey) || resolvedKey.length === 0) {
        return Promise.resolve();
      }

      const payload = {
        ...filters,
        queryKey: resolvedKey,
      };
      const result = queryClient.invalidateQueries(payload);
      emitCacheEvent('cache/invalidate', {
        ...payload,
        source: ensureBroadcastSource(queryClient),
      } satisfies CacheInvalidateEvent);
      return result;
    },
    remove: (key: EndpointDescriptor<unknown> | QueryCacheKey): void => {
      const resolvedKey = resolveKey(key);
      queryClient.removeQueries({ queryKey: resolvedKey });
      emitCacheEvent('cache/remove', {
        queryKey: resolvedKey,
        source: ensureBroadcastSource(queryClient),
      } satisfies CacheRemoveEvent);
    },
  };
}
// @cpt-end:implement-endpoint-descriptors:p3:inst-create-query-cache
