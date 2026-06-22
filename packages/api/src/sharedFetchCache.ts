/**
 * Shared fetch cache for protocol-level request reuse across runtime roots.
 *
 * Stored on globalThis so multiple bundle instances in the same realm can
 * converge on one cache without introducing a direct dependency from L1 to L2/L3.
 */
// @cpt-dod:cpt-frontx-dod-request-lifecycle-use-api-query:p2
// @cpt-flow:cpt-frontx-flow-request-lifecycle-use-api-query:p2
// @cpt-flow:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2

const DEFAULT_SHARED_FETCH_STALE_TIME = 30_000;

export const SHARED_FETCH_CACHE_SYMBOL = Symbol.for('frontx:fetch-cache');
export const SHARED_FETCH_CACHE_RETAINERS_SYMBOL = Symbol.for('frontx:fetch-cache-retainers');

export interface SharedFetchCacheFetchOptions {
  signal?: AbortSignal;
  aliases?: readonly (readonly unknown[])[];
  staleTime?: number;
}

export interface SharedFetchCacheLookupOptions {
  staleTime?: number;
}

export type SharedFetchCacheLookupResult<TData> =
  | { hit: true; data: TData }
  | { hit: false };

export interface SharedFetchCacheInvalidateFilters {
  key?: readonly unknown[];
  exact?: boolean;
}

export interface SharedFetchCache {
  lookup<TData>(
    key: readonly unknown[],
    options?: SharedFetchCacheLookupOptions
  ): SharedFetchCacheLookupResult<TData>;
  isPending(key: readonly unknown[]): boolean;
  getOrFetch<TData>(
    key: readonly unknown[],
    fetcher: (options: { signal?: AbortSignal }) => Promise<TData>,
    options?: SharedFetchCacheFetchOptions
  ): Promise<TData>;
  invalidate(key: readonly unknown[]): void;
  invalidateMany(filters?: SharedFetchCacheInvalidateFilters): void;
  clear(): void;
}

interface CacheEntry<TData> {
  activeConsumers: number;
  readonly controller: AbortController;
  data?: TData;
  maxStaleTime: number;
  readonly promise: Promise<TData>;
  pending: boolean;
  resolvedAt?: number;
  readonly version: number;
}

type SharedFetchCacheHost = typeof globalThis & {
  [SHARED_FETCH_CACHE_SYMBOL]?: SharedFetchCache;
  [SHARED_FETCH_CACHE_RETAINERS_SYMBOL]?: number;
};

// @cpt-begin:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-l1-shared-fetch-cache-core
function resolveSharedFetchCacheRetainers(host: SharedFetchCacheHost): number {
  const retainers = host[SHARED_FETCH_CACHE_RETAINERS_SYMBOL];
  if (typeof retainers !== 'number' || !Number.isFinite(retainers) || retainers < 0) {
    return 0;
  }

  return retainers;
}

function createAbortError(reason?: unknown): Error {
  if (reason instanceof Error && reason.name === 'AbortError') {
    return reason;
  }

  if (reason instanceof Error) {
    const error = new Error(reason.message);
    Object.defineProperty(error, 'cause', {
      value: reason,
      configurable: true,
      enumerable: false,
      writable: true,
    });
    error.name = 'AbortError';
    return error;
  }

  if (typeof DOMException !== 'undefined') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }

  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function compareObjectKeysAlphabetically(a: string, b: string): number {
  return String.prototype.localeCompare.call(a, b);
}

function stableSerialize(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort(compareObjectKeysAlphabetically);
    const entries = keys.map((key) => {
      const serializedKey = JSON.stringify(key);
      const serializedValue = stableSerialize(record[key]);
      return serializedKey + ':' + serializedValue;
    });
    return '{' + entries.join(',') + '}';
  }

  if (value === undefined) {
    return 'undefined';
  }

  return JSON.stringify(value);
}

function resolveCacheKey(key: readonly unknown[]): string {
  return stableSerialize(key);
}

export function serializeSharedFetchKey(key: readonly unknown[]): string {
  return resolveCacheKey(key);
}

function resolveSharedFetchStaleTime(staleTime?: number): number {
  return staleTime ?? DEFAULT_SHARED_FETCH_STALE_TIME;
}

function mergeSharedFetchStaleTime(current: number, next: number): number {
  if (current === Number.POSITIVE_INFINITY || next === Number.POSITIVE_INFINITY) {
    return Number.POSITIVE_INFINITY;
  }

  if (Number.isNaN(current)) {
    return next;
  }

  if (Number.isNaN(next)) {
    return current;
  }

  return Math.max(current, next);
}

function isEntryFresh(entry: CacheEntry<unknown>, staleTime: number, now: number): boolean {
  if (staleTime <= 0 || entry.resolvedAt === undefined) {
    return false;
  }

  if (staleTime === Number.POSITIVE_INFINITY) {
    return true;
  }

  return entry.resolvedAt + staleTime > now;
}

function matchesSerializedPrefix(
  cacheKey: string,
  filters: SharedFetchCacheInvalidateFilters
): boolean {
  if (filters.key === undefined) {
    return false;
  }

  const serializedKey = resolveCacheKey(filters.key);
  if (filters.exact !== false) {
    return cacheKey === serializedKey;
  }

  if (filters.key.length === 0) {
    return false;
  }

  return cacheKey === serializedKey || cacheKey.startsWith(`${serializedKey.slice(0, -1)},`);
}

class SharedFetchCacheImpl implements SharedFetchCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly primaryKeysByAlias = new Map<string, Set<string>>();
  private readonly aliasesByPrimaryKey = new Map<string, Set<string>>();
  private readonly versions = new Map<string, number>();

  lookup<TData>(
    key: readonly unknown[],
    options?: SharedFetchCacheLookupOptions
  ): SharedFetchCacheLookupResult<TData> {
    const cacheKey = resolveCacheKey(key);
    const version = this.versions.get(cacheKey) ?? 0;
    const entry = this.entries.get(cacheKey) as CacheEntry<TData> | undefined;

    if (!entry || entry.version !== version || entry.pending) {
      return { hit: false };
    }

    if (!isEntryFresh(entry, resolveSharedFetchStaleTime(options?.staleTime), Date.now())) {
      return { hit: false };
    }

    return {
      hit: true,
      data: entry.data as TData,
    };
  }

  isPending(key: readonly unknown[]): boolean {
    const cacheKey = resolveCacheKey(key);
    const version = this.versions.get(cacheKey) ?? 0;
    const entry = this.entries.get(cacheKey);
    return entry?.version === version && entry.pending === true;
  }

  getOrFetch<TData>(
    key: readonly unknown[],
    fetcher: (options: { signal?: AbortSignal }) => Promise<TData>,
    options?: SharedFetchCacheFetchOptions
  ): Promise<TData> {
    if (options?.signal?.aborted) {
      return Promise.reject(createAbortError(options.signal.reason));
    }

    const cacheKey = resolveCacheKey(key);
    const version = this.versions.get(cacheKey) ?? 0;
    const now = Date.now();
    const existingEntry = this.entries.get(cacheKey) as CacheEntry<TData> | undefined;
    const requestedStaleTime = resolveSharedFetchStaleTime(options?.staleTime);
    this.registerAliases(cacheKey, options?.aliases);

    if (
      existingEntry &&
      existingEntry.version === version &&
      !existingEntry.pending &&
      isEntryFresh(existingEntry, requestedStaleTime, now)
    ) {
      // @cpt-begin:cpt-frontx-flow-request-lifecycle-use-api-query:p2:inst-cache-hit
      return Promise.resolve(existingEntry.data as TData);
      // @cpt-end:cpt-frontx-flow-request-lifecycle-use-api-query:p2:inst-cache-hit
    }

    if (existingEntry && existingEntry.version === version && existingEntry.pending) {
      existingEntry.maxStaleTime = mergeSharedFetchStaleTime(
        existingEntry.maxStaleTime,
        requestedStaleTime
      );
      // @cpt-begin:cpt-frontx-flow-request-lifecycle-use-api-query:p2:inst-dedup
      return this.attachConsumer(existingEntry, options?.signal);
      // @cpt-end:cpt-frontx-flow-request-lifecycle-use-api-query:p2:inst-dedup
    }

    const controller = new AbortController();
    const entry: CacheEntry<TData> = {
      activeConsumers: 0,
      controller,
      pending: true,
      maxStaleTime: requestedStaleTime,
      promise: Promise.resolve()
        .then(() => fetcher({ signal: controller.signal }))
        .then((data) => {
          entry.pending = false;

          if (this.entries.get(cacheKey) === entry && (this.versions.get(cacheKey) ?? 0) === version) {
            const staleTime = entry.maxStaleTime;
            if (staleTime > 0) {
              entry.data = data;
              entry.resolvedAt = Date.now();
            } else {
              this.entries.delete(cacheKey);
              this.removeAliases(cacheKey);
            }
          }

          this.cleanupVersion(cacheKey, version);

          return data;
        })
        .catch((error: unknown) => {
          entry.pending = false;
          if (this.entries.get(cacheKey) === entry) {
            this.entries.delete(cacheKey);
            this.removeAliases(cacheKey);
          }
          this.cleanupVersion(cacheKey, version);
          throw error;
        }),
      version,
    };

    this.entries.set(cacheKey, entry);
    return this.attachConsumer(entry, options?.signal);
  }

  invalidate(key: readonly unknown[]): void {
    this.invalidateMany({ key });
  }

  invalidateMany(filters: SharedFetchCacheInvalidateFilters = {}): void {
    if (filters.key === undefined) {
      return;
    }

    const matchingKeys = new Set<string>();

    this.entries.forEach((_entry, cacheKey) => {
      if (matchesSerializedPrefix(cacheKey, filters)) {
        matchingKeys.add(cacheKey);
      }
    });

    this.versions.forEach((_version, cacheKey) => {
      if (matchesSerializedPrefix(cacheKey, filters)) {
        matchingKeys.add(cacheKey);
      }
    });

    this.primaryKeysByAlias.forEach((primaryKeys, aliasKey) => {
      if (!matchesSerializedPrefix(aliasKey, filters)) {
        return;
      }

      primaryKeys.forEach((cacheKey) => {
        matchingKeys.add(cacheKey);
      });
    });

    matchingKeys.forEach((cacheKey) => {
      this.invalidateCacheKey(cacheKey);
    });
  }

  clear(): void {
    this.entries.forEach((entry) => {
      if (entry.pending) {
        entry.controller.abort(createAbortError());
      }
    });

    this.entries.clear();
    this.aliasesByPrimaryKey.clear();
    this.primaryKeysByAlias.clear();
    this.versions.clear();
  }

  /** @internal Test-only accessor used by `inspectSharedFetchCacheBookkeepingForTest`. */
  peekBookkeepingForTest(): {
    entries: number;
    aliasesByPrimaryKey: number;
    primaryKeysByAlias: number;
    versions: number;
  } {
    return {
      entries: this.entries.size,
      aliasesByPrimaryKey: this.aliasesByPrimaryKey.size,
      primaryKeysByAlias: this.primaryKeysByAlias.size,
      versions: this.versions.size,
    };
  }

  private registerAliases(
    primaryCacheKey: string,
    aliases?: readonly (readonly unknown[])[]
  ): void {
    if (!aliases || aliases.length === 0) {
      return;
    }

    const primaryAliases =
      this.aliasesByPrimaryKey.get(primaryCacheKey) ?? new Set<string>();

    aliases.forEach((alias) => {
      const aliasKey = resolveCacheKey(alias);
      primaryAliases.add(aliasKey);

      const aliasedPrimaryKeys =
        this.primaryKeysByAlias.get(aliasKey) ?? new Set<string>();
      aliasedPrimaryKeys.add(primaryCacheKey);
      this.primaryKeysByAlias.set(aliasKey, aliasedPrimaryKeys);
    });

    this.aliasesByPrimaryKey.set(primaryCacheKey, primaryAliases);
  }

  private attachConsumer<TData>(
    entry: CacheEntry<TData>,
    signal?: AbortSignal
  ): Promise<TData> {
    if (signal?.aborted) {
      return Promise.reject(createAbortError(signal.reason));
    }

    entry.activeConsumers += 1;

    return new Promise<TData>((resolve, reject) => {
      let released = false;

      const release = (): void => {
        if (released) {
          return;
        }

        released = true;
        signal?.removeEventListener('abort', onAbort);
        entry.activeConsumers -= 1;

        if (entry.pending && entry.activeConsumers === 0) {
          entry.controller.abort(createAbortError(signal?.reason));
        }
      };

      const onAbort = (): void => {
        release();
        reject(createAbortError(signal?.reason));
      };

      signal?.addEventListener('abort', onAbort, { once: true });

      entry.promise.then(
        (data) => {
          if (released) {
            return;
          }

          release();
          resolve(data);
        },
        (error: unknown) => {
          if (released) {
            return;
          }

          release();
          reject(error);
        }
      );
    });
  }

  private invalidateCacheKey(cacheKey: string): void {
    const entry = this.entries.get(cacheKey);
    if (entry?.pending) {
      entry.controller.abort(createAbortError());
      this.versions.set(cacheKey, entry.version + 1);
    } else {
      this.versions.delete(cacheKey);
    }

    this.entries.delete(cacheKey);
    this.removeAliases(cacheKey);
  }

  private cleanupVersion(cacheKey: string, version: number): void {
    if (this.entries.has(cacheKey)) {
      return;
    }

    if (this.versions.get(cacheKey) === version + 1) {
      this.versions.delete(cacheKey);
    }
  }

  private removeAliases(primaryCacheKey: string): void {
    const aliases = this.aliasesByPrimaryKey.get(primaryCacheKey);
    if (!aliases) {
      return;
    }

    aliases.forEach((aliasKey) => {
      const primaryKeys = this.primaryKeysByAlias.get(aliasKey);
      if (!primaryKeys) {
        return;
      }

      primaryKeys.delete(primaryCacheKey);
      if (primaryKeys.size === 0) {
        this.primaryKeysByAlias.delete(aliasKey);
      }
    });

    this.aliasesByPrimaryKey.delete(primaryCacheKey);
  }
}
// @cpt-end:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-l1-shared-fetch-cache-core

// @cpt-begin:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-l1-shared-fetch-singleton-wiring
export function createSharedFetchCache(): SharedFetchCache {
  return new SharedFetchCacheImpl();
}

export function getSharedFetchCache(): SharedFetchCache {
  const host = globalThis as SharedFetchCacheHost;
  host[SHARED_FETCH_CACHE_SYMBOL] ??= createSharedFetchCache();
  return host[SHARED_FETCH_CACHE_SYMBOL];
}

export function peekSharedFetchCache(): SharedFetchCache | undefined {
  return (globalThis as SharedFetchCacheHost)[SHARED_FETCH_CACHE_SYMBOL];
}

export function retainSharedFetchCache(): SharedFetchCache {
  const host = globalThis as SharedFetchCacheHost;
  const cache = getSharedFetchCache();
  host[SHARED_FETCH_CACHE_RETAINERS_SYMBOL] = resolveSharedFetchCacheRetainers(host) + 1;
  return cache;
}

export function resetSharedFetchCache(): void {
  const host = globalThis as SharedFetchCacheHost;
  host[SHARED_FETCH_CACHE_SYMBOL]?.clear();
  delete host[SHARED_FETCH_CACHE_SYMBOL];
  delete host[SHARED_FETCH_CACHE_RETAINERS_SYMBOL];
}

export function releaseSharedFetchCache(): void {
  const host = globalThis as SharedFetchCacheHost;
  const retainers = resolveSharedFetchCacheRetainers(host);

  if (retainers === 0) {
    return;
  }

  if (retainers === 1) {
    resetSharedFetchCache();
    return;
  }

  host[SHARED_FETCH_CACHE_RETAINERS_SYMBOL] = retainers - 1;
}
// @cpt-end:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-l1-shared-fetch-singleton-wiring

/**
 * Test-only diagnostics for SharedFetchCache bookkeeping state.
 *
 * Returns the current sizes of the internal bookkeeping maps so tests can
 * assert that invalidation/cleanup paths release memory. Intentionally
 * exposed as a dedicated test seam so test files do not need to cast to
 * the private impl type. Not re-exported from `index.ts`; consumers outside
 * this package must go through the public `SharedFetchCache` contract.
 *
 * @internal Test-only; do not rely on this outside `__tests__/`.
 */
export interface SharedFetchCacheBookkeepingSnapshot {
  readonly entries: number;
  readonly aliasesByPrimaryKey: number;
  readonly primaryKeysByAlias: number;
  readonly versions: number;
}

/**
 * @internal Test-only diagnostic. Returns the current sizes of
 * {@link SharedFetchCacheImpl}'s internal bookkeeping maps. Only works for
 * caches created via {@link createSharedFetchCache} / the shared singleton;
 * throws for foreign implementations so tests do not silently see zeros.
 */
export function inspectSharedFetchCacheBookkeepingForTest(
  cache: SharedFetchCache
): SharedFetchCacheBookkeepingSnapshot {
  if (!(cache instanceof SharedFetchCacheImpl)) {
    throw new TypeError(
      `${inspectSharedFetchCacheBookkeepingForTest.name} only supports caches created by createSharedFetchCache().`
    );
  }
  return cache.peekBookkeepingForTest();
}
