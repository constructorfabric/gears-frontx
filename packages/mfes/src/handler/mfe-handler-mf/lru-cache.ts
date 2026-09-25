/**
 * Minimal LRU cache with fixed capacity. Leverages insertion-order semantics
 * of `Map`: each `get` re-inserts the key (moving it to the end, i.e. "most
 * recent"), and `set` evicts the oldest key when capacity would be exceeded.
 *
 * Held in its own module, separate from `MfeHandlerMF.ts`, so that
 * `realm-shared-dep-text-cache.ts` can construct one for the realm-shared
 * shared-dependency source-text cache without importing `MfeHandlerMF.ts`
 * itself — that direction would be circular, since `MfeHandlerMF.ts` in
 * turn obtains its `sharedDepTextCache` field from
 * `getRealmSharedDepTextCache()`.
 *
 * We use this for source-text caches to prevent unbounded growth on
 * long-running hosts that accumulate many distinct chunk URLs over time.
 *
 * @internal Exported for unit testing; not part of the public API.
 */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly capacity: number) {
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
    } else if (this.map.size >= this.capacity) {
      // Evict the oldest (first) key.
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) this.map.delete(oldestKey);
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
