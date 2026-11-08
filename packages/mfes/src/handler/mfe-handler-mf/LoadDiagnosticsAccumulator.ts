/**
 * Per-handler shared-dependency load diagnostics accumulator
 * (finding F-011).
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

import { LruCache } from './LruCache';
import type { SharedDepTextCache } from './RealmSharedDepTextCacheProvider';
import type { RealmSharedDepTextCacheDiagnostics } from './ByteBudgetLruCache';

export class LoadDiagnosticsAccumulator {
  private readonly emitted = new LruCache<string, true>(64);
  // Keyed by `name@version` — the pair a conflict or agreement is ABOUT.
  // Keying by content hash made identical bytes the trigger (a warn on
  // agreement) and left different bytes for the same name@version silent,
  // which is the case that actually needs a diagnostic.


  /** Emit `message` once per handler lifetime, deduplicated by `key`. */
  warnOnce(key: string, message: string): void {
    if (this.emitted.has(key)) return;
    this.emitted.set(key, true);
    console.warn(message);
  }

  /**
   * Per-load diagnostics summary: bytes fetched and realm cache totals
   * (F-011).
   */
  summarize(
    manifestId: string,
    bytesFetched: number,
    realmCache: SharedDepTextCache,
  ): void {
    const diagSource = realmCache as unknown as {
      getDiagnostics?: () => RealmSharedDepTextCacheDiagnostics;
    };
    const diag =
      typeof diagSource.getDiagnostics === 'function'
        ? diagSource.getDiagnostics()
        : undefined;
    console.warn(
      `[MfeHandlerMF] shared-dependency diagnostics for manifest ` +
        `'${manifestId}': fetched ${bytesFetched} bytes of verified ` +
        `unit text; realm cache holds ${diag?.bytes ?? 0} bytes in ` +
        `${diag?.entries ?? 0} entries (budget ${diag?.budget ?? 0}, ` +
        `evictions ${diag?.evictions ?? 0}).`,
    );
  }
}
