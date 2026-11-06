/**
 * Per-handler shared-dependency load diagnostics accumulator
 * (finding F-011).
 *
 * Collects, across the loads one handler serves:
 *  - the byte-agreement warning emitted once per page when identical
 *    shared-dep bytes (the same `graphFile.contentHash`) are declared by
 *    two manifests, naming the producers behind the files;
 *  - the `sharedChunkRule` same-rule comparison, summarized once per
 *    page when deps declaring identical bytes carry different rules;
 *  - the absent-reachability-roots report when an expose carries no
 *    declared `entryRoots`;
 *  - the requires-cannot-be-checked report when no fetched graph file
 *    declares `requires` (suppressed by an explicit `requires: []`);
 *  - the per-load summary carrying bytes fetched, pack-fallback
 *    packages, and realm cache totals.
 *
 * Warnings are deduplicated per handler instance by key — the "once per
 * page" contract — via an LRU so a long-running host does not retain
 * one string per noticed pair forever. One class per file
 * (`runtime_style`).
 *
 * @packageDocumentation
 * @internal
 */

import type { MfManifestShared } from '../../manifest/mf-manifest';
import type { SharedDepGraphFile } from '../../unit-format/graph-file';
import { LruCache } from './LruCache';
import type { SharedDepTextCache } from './RealmSharedDepTextCacheProvider';
import type { RealmSharedDepTextCacheDiagnostics } from './ByteBudgetLruCache';

interface ByteAgreementRecord {
  readonly packageName: string;
  readonly producer: string;
  readonly manifestId: string;
  readonly contentHash: string;
}

export class LoadDiagnosticsAccumulator {
  private readonly emitted = new LruCache<string, true>(64);
  // Keyed by `name@version` — the pair a conflict or agreement is ABOUT.
  // Keying by content hash made identical bytes the trigger (a warn on
  // agreement) and left different bytes for the same name@version silent,
  // which is the case that actually needs a diagnostic.
  private readonly agreements = new LruCache<string, ByteAgreementRecord>(64);

  /** Emit `message` once per handler lifetime, deduplicated by `key`. */
  warnOnce(key: string, message: string): void {
    if (this.emitted.has(key)) return;
    this.emitted.set(key, true);
    console.warn(message);
  }

  /**
   * Record a graph declaration. When the same content hash was already
   * recorded under a different manifest, emit the byte-agreement warning
   * naming both producers — once per page (F-011).
   */
  recordByteAgreement(
    dep: MfManifestShared,
    graph: SharedDepGraphFile,
    manifestId: string,
  ): void {
    const hash = dep.graphFile?.contentHash;
    if (hash === undefined) return;
    const producer = graph.producer
      ? `${graph.producer.name}@${graph.producer.version}`
      : 'unknown producer';
    const key = `${dep.name}@${dep.version}`;
    const prior = this.agreements.get(key);
    if (prior === undefined) {
      this.agreements.set(key, {
        packageName: dep.name,
        producer,
        manifestId,
        contentHash: hash,
      });
      return;
    }
    if (prior.manifestId === manifestId) return;
    const pair = [prior.manifestId, manifestId].sort().join('|');
    if (prior.contentHash !== hash) {
      // Conflict: the same name@version declares different bytes across
      // manifests — each load resolves its own declared identity, and the
      // disagreement is surfaced rather than silently tolerated.
      this.warnOnce(
        `byte-conflict:${key}:${pair}`,
        `[MfeHandlerMF] shared-dep conflict: '${key}' declares ` +
          `different bytes across manifests — contentHash ` +
          `${prior.contentHash.slice(0, 12)}… ('${prior.producer}' in ` +
          `manifest '${prior.manifestId}') versus ${hash.slice(0, 12)}… ` +
          `('${producer}' in manifest '${manifestId}'). The same ` +
          `name@version carries different bytes; each load resolves its ` +
          `own declared identity.`,
      );
      return;
    }
    this.warnOnce(
      `byte-agreement:${key}:${pair}`,
      `[MfeHandlerMF] byte-agreement: shared dep '${dep.name}' declares ` +
        `identical bytes (contentHash ${hash.slice(0, 12)}…) already ` +
        `declared by '${prior.producer}' in manifest '${prior.manifestId}' ` +
        `and now by '${producer}' in manifest '${manifestId}' — the same ` +
        `bytes are shared under one realm cache entry.`,
    );
  }

  /**
   * The `sharedChunkRule` same-rule comparison: deps declaring identical
   * graph-file bytes must declare the same rule; differing rules are
   * summarized once per page (F-011).
   */
  compareSharedChunkRules(
    deps: readonly { dep: MfManifestShared; graph: SharedDepGraphFile }[],
    manifestId: string,
  ): void {
    const byHash = new Map<string, { name: string; rule?: string }[]>();
    for (const { dep } of deps) {
      const hash = dep.graphFile?.contentHash;
      if (hash === undefined) continue;
      const list = byHash.get(hash) ?? [];
      list.push({ name: dep.name, rule: dep.sharedChunkRule });
      byHash.set(hash, list);
    }
    for (const [hash, list] of byHash) {
      const rules = new Set(list.map((e) => e.rule));
      if (rules.size <= 1) continue;
      this.warnOnce(
        `sharedChunkRule:${hash}`,
        `[MfeHandlerMF] sharedChunkRule mismatch in manifest ` +
          `'${manifestId}': shared deps ${list
            .map((e) => `'${e.name}' ('${e.rule ?? 'unset'}')`)
            .join(', ')} declare identical bytes but different ` +
          `sharedChunkRule values — compared same-rule to same-rule, ` +
          `summarized once per page.`,
      );
    }
  }

  /** Report an expose carrying no declared reachability roots (F-011). */
  reportAbsentRoots(manifestId: string, exposedModule: string): void {
    console.warn(
      `[MfeHandlerMF] manifest '${manifestId}' declares no reachability ` +
        `roots (entryRoots) for expose '${exposedModule}' — every unit ` +
        `of every declared shared dep is loaded.`,
    );
  }

  /** Report a requires closure that cannot be checked (F-011/F-027). */
  reportRequiresUncheckable(manifestId: string): void {
    this.warnOnce(
      `requires-uncheckable:${manifestId}`,
      `[MfeHandlerMF] manifest '${manifestId}': no fetched graph file ` +
        `declares 'requires' — the requires closure cannot be checked.`,
    );
  }

  /**
   * Per-load diagnostics summary: bytes fetched, pack-fallback
   * packages, and realm cache totals (F-011).
   */
  summarize(
    manifestId: string,
    bytesFetched: number,
    packFallbackPackages: readonly string[],
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
        `unit/pack text; pack fallback packages: ` +
        `${packFallbackPackages.length > 0 ? packFallbackPackages.join(', ') : 'none'}; ` +
        `realm cache holds ${diag?.bytes ?? 0} bytes in ` +
        `${diag?.entries ?? 0} entries (budget ${diag?.budget ?? 0}, ` +
        `evictions ${diag?.evictions ?? 0}).`,
    );
  }
}
