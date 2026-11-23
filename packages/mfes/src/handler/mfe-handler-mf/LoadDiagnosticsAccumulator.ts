/**
 * Per-handler shared-dependency load diagnostics accumulator.
 *
 * Collects, across the loads one handler serves, deduplicated
 * once-per-page warnings (`warnOnce`) and the per-load summary
 * carrying bytes fetched and realm cache totals.
 *
 * Warnings are deduplicated per handler instance by key — the "once per
 * page" contract — via an LRU so a long-running host does not retain
 * one string per noticed pair forever. One class per file
 * (`runtime_style`).
 *
 * @packageDocumentation
 * @internal
 */

import { LruCache, SHARED_DEP_ADOPTION_NOTICE_CACHE_CAPACITY } from './LruCache';
import type { SharedDepTextCache } from './RealmSharedDepTextCacheProvider';

export class LoadDiagnosticsAccumulator {
  private readonly emitted = new LruCache<string, true>(
    SHARED_DEP_ADOPTION_NOTICE_CACHE_CAPACITY,
  );

  /** Emit `message` once per handler lifetime, deduplicated by `key`. */
  warnOnce(key: string, message: string): void {
    if (this.emitted.has(key)) return;
    this.emitted.set(key, true);
    console.warn(message);
  }

  /**
   * The per-load diagnostic, written once for the load at `console.warn`
   * level: the bytes this load itself fetched and the realm cache's held
   * bytes, entry count, budget and evictions, read through the cache's
   * `getDiagnostics` operation. A cache that has no such operation — one
   * another copy of the package published — gets a diagnostic that states
   * the figures are unavailable.
   */
  // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-emit-load-diagnostic
  summarize(
    manifestId: string,
    bytesFetched: number,
    realmCache: SharedDepTextCache,
  ): void {
    const diag = realmCache.getDiagnostics?.();
    const realm =
      diag === undefined
        ? 'realm cache figures are unavailable (the adopted cache reports no diagnostics)'
        : `realm cache holds ${diag.bytes} bytes in ${diag.entries} entries ` +
          `(budget ${diag.budget}, evictions ${diag.evictions})`;
    console.warn(
      `[MfeHandlerMF] shared-dependency diagnostics for manifest ` +
        `'${manifestId}': fetched ${bytesFetched} bytes of unit text; ${realm}.`,
    );
  }
  // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-emit-load-diagnostic
}
