/**
 * Byte-budget LRU cache for realm-shared source text.
 *
 * Ported from `salvage/issue-718-impl-20261105` with two review fixes:
 * byte accounting is in UTF-8 BYTES (`TextEncoder`), not UTF-16 code
 * units (finding F-025), and eviction has no sole-remaining-entry
 * exemption — a single text larger than the whole budget is deliberately
 * not retained past the bound (finding F-012). In-flight entries
 * contribute zero bytes and are never chosen as eviction victims, so a
 * later large admission cannot evict an unsettled fetch as if it were
 * sized (finding F-026).
 *
 * Bounds the cache by a byte budget on the source text it retains —
 * once for the whole realm, never multiplied by handler count or by
 * compatible package-copy count — evicting least-recently-used FULFILLED
 * entries when admitted bytes would exceed the budget. Bytes are
 * accounted when text is fulfilled, since an in-flight
 * fetch has no size yet; a rejected promise counts nothing toward the
 * budget (`cpt-frontx-adr-shared-dep-cache-reach`, ADR-0035).
 *
 * Held in its own module, separate from `MfeHandlerMF.ts`, so that
 * {@link RealmSharedDepTextCacheProvider} can construct one for the
 * realm-shared source-text cache without importing `MfeHandlerMF.ts`
 * itself — that direction would be circular, since `MfeHandlerMF.ts`
 * in turn obtains its `sharedDepTextCache` field from
 * `RealmSharedDepTextCacheProvider.getCache()`.
 *
 * @internal Exported for unit testing; not part of the public API.
 */

import type { SharedDepTextCache } from './RealmSharedDepTextCacheProvider';

/**
 * Diagnostics snapshot reported by the realm cache so the retained-memory
 * threshold of `cpt-frontx-nfr-resource-efficiency` can be checked without
 * browser developer tools
 * (`cpt-frontx-dod-mfe-isolation-realm-shared-dep-text-cache`).
 */
export interface RealmSharedDepTextCacheDiagnostics {
  /** Total UTF-8 bytes of fulfilled source text currently retained. */
  readonly bytes: number;
  /** Number of entries currently in the cache (including in-flight). */
  readonly entries: number;
  /** The byte budget the cache is bounded by. */
  readonly budget: number;
  /** Total number of entries evicted since the cache was created. */
  readonly evictions: number;
}

/**
 * One cache entry. `bytes` is `0` until the promise fulfills; once
 * fulfilled it holds the UTF-8 byte length of the resolved text — the
 * measure the byte budget accounts
 * (`cpt-frontx-adr-shared-dep-cache-reach`: "Bytes are accounted when
 * text is fulfilled, since an in-flight fetch has no size
 * yet"). `bytes === 0` also marks an entry in-flight (or genuinely
 * empty), which is what exempts it from eviction: an unsettled fetch
 * has no bytes to reclaim.
 */
interface ByteBudgetCacheEntry {
  readonly promise: Promise<string>;
  bytes: number;
}

/**
 * Byte-budget LRU cache for realm-shared source text.
 *
 * Stores `Promise<string>` values — both in-flight and fulfilled. When
 * a promise fulfills, the text's UTF-8 byte length is used for budget
 * accounting. A rejected promise does not count toward the budget.
 * Eviction of a fulfilled entry is safe: a caller already holding the
 * evicted promise proceeds unaffected (the promise resolves; only the
 * cache no longer holds a reference for future callers).
 */
export class ByteBudgetLruCache implements SharedDepTextCache {
  /** Insertion-ordered map: oldest key first, newest key last. */
  private readonly entries = new Map<string, ByteBudgetCacheEntry>();
  private readonly encoder = new TextEncoder();
  private totalBytes = 0;
  private evictionCount = 0;

  /**
   * @param budget The byte budget on retained fulfilled source text.
   * Must be a positive integer.
   */
  constructor(private readonly budget: number) {
    if (!Number.isInteger(budget) || budget <= 0) {
      throw new RangeError(
        `ByteBudgetLruCache budget must be a positive integer, got ${budget}`
      );
    }
  }

  get(key: string): Promise<string> | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    // Re-insert to mark as most-recently-used.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.promise;
  }

  set(key: string, value: Promise<string>): void {
    const existing = this.entries.get(key);
    if (existing !== undefined) {
      this.totalBytes -= existing.bytes;
      this.entries.delete(key);
    }

    const entry: ByteBudgetCacheEntry = { promise: value, bytes: 0 };
    this.entries.set(key, entry);

    // Account bytes when the promise fulfills. The rejection handler is
    // a no-op: a rejected promise does not count toward the budget, and
    // the caller's own eviction-on-rejection callback removes the
    // mapping.
    value.then(
      (text: string) => {
        const current = this.entries.get(key);
        if (current !== undefined && current.promise === value) {
          const bytes = this.encoder.encode(text).length;
          if (bytes > this.budget) {
            // A single text larger than the whole budget is never
            // retained — evict it rather than flushing older entries
            // that legitimately fit (F-012, F-025, F-026).
            this.entries.delete(key);
            this.evictionCount += 1;
            return;
          }
          current.bytes = bytes;
          this.totalBytes += bytes;
          this.evictToBudget();
        }
      },
      () => {
        // Rejection: no bytes to account.
      }
    );
  }

  delete(key: string): boolean {
    const entry = this.entries.get(key);
    if (entry === undefined) return false;
    this.totalBytes -= entry.bytes;
    this.entries.delete(key);
    return true;
  }

  /**
   * Returns a diagnostics snapshot: bytes held, entry count, budget,
   * and total evictions. Realizes the reporting requirement of
   * `cpt-frontx-dod-mfe-isolation-realm-shared-dep-text-cache`.
   */
  getDiagnostics(): RealmSharedDepTextCacheDiagnostics {
    return {
      bytes: this.totalBytes,
      entries: this.entries.size,
      budget: this.budget,
      evictions: this.evictionCount,
    };
  }

  /**
   * Evict least-recently-used FULFILLED entries until the retained bytes
   * fit within the budget. Entries with `bytes === 0` are in flight (or
   * empty) and are skipped — evicting one would reclaim nothing and
   * would punish a fetch that has not even reported its size (F-026).
   * There is no sole-remaining-entry exemption: a single text larger
   * than the whole budget is evicted too rather than silently retained
   * past the bound (F-012).
   */
  private evictToBudget(): void {
    while (this.totalBytes > this.budget) {
      let victimKey: string | undefined;
      for (const [key, entry] of this.entries) {
        if (entry.bytes > 0) {
          victimKey = key;
          break;
        }
      }
      if (victimKey === undefined) break;
      const victim = this.entries.get(victimKey);
      this.totalBytes -= victim?.bytes ?? 0;
      this.entries.delete(victimKey);
      this.evictionCount += 1;
    }
  }
}
