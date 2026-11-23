/**
 * Minimal LRU cache with fixed capacity. Leverages insertion-order semantics
 * of `Map`: each `get` re-inserts the key (moving it to the end, i.e. "most
 * recent"), and `set` evicts the oldest key when capacity would be exceeded.
 *
 * Held in its own module, separate from `MfeHandlerMF.ts`, so that
 * `RealmSharedDepTextCacheProvider.ts` can construct one for the realm-shared
 * shared-dependency source-text cache without importing `MfeHandlerMF.ts`
 * itself — that direction would be circular, since `MfeHandlerMF.ts` in
 * turn obtains its `sharedDepTextCache` field from
 * `RealmSharedDepTextCacheProvider.getCache()`.
 *
 * We use this for source-text caches to prevent unbounded growth on
 * long-running hosts that accumulate many distinct chunk URLs over time.
 *
 * @internal Exported for unit testing; not part of the public API.
 */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  /**
   * @param capacity - Entries held before the oldest evictable one goes.
   * @param evictable - Whether a value may be evicted; a value it refuses
   *   stays however full the cache is, so the cache can exceed `capacity`
   *   while its refused entries are held, and returns to it on the first
   *   insert after they become evictable. Every value may be evicted by default.
   */
  constructor(
    private readonly capacity: number,
    private readonly evictable: (value: V) => boolean = () => true,
  ) {
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new RangeError(`LruCache capacity must be a positive integer, got ${capacity}`);
    }
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key) as V;
    // Re-insert to mark as most-recently-used.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    // If already present, delete first so the re-insert moves it to the end.
    if (this.map.has(key)) {
      this.map.delete(key);
    } else {
      // Evict the oldest evictable keys until the new entry fits or nothing
      // evictable is left: entries held past `capacity` while they could not
      // go are shed once they can, so the cache returns to its capacity.
      for (const [heldKey, held] of this.map) {
        if (this.map.size < this.capacity) break;
        if (this.evictable(held)) this.map.delete(heldKey);
      }
    }
    this.map.set(key, value);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }
}

/**
 * Max entries of a once-per-pair notice ledger (the adoption notice keyed by
 * `name@version` plus the declaring manifest's id, and the deduplicated
 * warnings of the diagnostics accumulator).
 *
 * Entries are bounded by the distinct pairs a host actually observes, which
 * stays small; the bound only keeps a long-running host from retaining one
 * string per pair for the handler's entire lifetime. Eviction means a pair
 * may be noticed again later; it never affects the correctness of a load.
 */
export const SHARED_DEP_ADOPTION_NOTICE_CACHE_CAPACITY = 64;
