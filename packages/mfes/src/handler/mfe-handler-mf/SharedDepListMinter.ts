/**
 * List-item blob minter: mints per-load blob URLs for shared-dependency
 * fetch-list items in leaves-first order, driven by the explicit
 * `imports`/`answers` edges each item records — no edge is derived from
 * source text at mint time (`cpt-frontx-algo-unit-format-contract-fetch-list-schema-v2`).
 *
 * Dependency order comes from the list itself: a bare-specifier edge is
 * ordered before the item whose `answers` name it; an `{ item }` edge is
 * ordered before the item carrying that content identity. Edges an
 * earlier mint of the same load already satisfied add no ordering edge —
 * the existing blob answers them. A cycle among unminted items admits no
 * order and fails the load deterministically.
 *
 * Source rewriting: bare specifiers go through the trust kernel's
 * `DynamicModuleOps.rewriteBareSpecifier`; a relative specifier is
 * resolved against the importing item's own `location` to the location
 * of the item that supplies it (chunk locations are content-addressed
 * and live under one shared base, so the resolved location names the
 * supplying item); literal dynamic `import()` calls go through
 * `UnitDynamicImportRewriter` with the load's token resolver.
 *
 * One class per file (`runtime_style`).
 *
 * @packageDocumentation
 * @internal
 */

import { MfeLoadError } from '../../errors';
import { DynamicModuleOps } from './mf-dynamic-module-ops';
import { UnitDynamicImportRewriter } from './UnitDynamicImportRewriter';
import type {
  SharedDepFetchList,
  SharedDepListItem,
} from '../../unit-format/fetch-list';

/** A fetched list item ready to mint. */
export interface SharedDepListRecord {
  readonly item: SharedDepListItem;
  readonly text: string;
}

/**
 * Per-load minting surface a batch writes into: the content-identity →
 * blob map every minted item is published under, and the specifier →
 * blob map `answers` are claimed in.
 */
export interface SharedDepListMintMaps {
  /** contentHash → blob URL, for every item minted for the load. */
  readonly itemBlobByHash: Map<string, string>;
  /** specifier → blob URL; the map the expose chain rewrites against. */
  readonly specifierToBlob: Map<string, string>;
}

/**
 * How the minter handles a literal dynamic `import('<specifier>')` in an
 * item's source: `tokenFor` resolves the specifier — relative to the
 * issuing item's location, or bare — to the resolver token the rewritten
 * call passes to `__frontx_lazy` (or `undefined` to leave the call
 * untouched), and `loaderUrl` mints the per-load loader-stub blob URL on
 * first use.
 */
export interface ListDynamicImportRewrites {
  readonly loaderUrl: () => string;
  readonly tokenFor: (
    record: SharedDepListRecord,
    specifier: string,
  ) => string | undefined;
}

export class SharedDepListMinter {
  protected constructor() {}

  /**
   * Resolve a relative specifier against the importing item's `location`
   * to the shared-base-relative location of the item that supplies it —
   * the key {@link SharedDepListItem.location} and the list's `lazy` /
   * `patterns` records are keyed by.
   */
  static resolveLocation(fromLocation: string, specifier: string): string {
    const syntheticBase = 'http://r/';
    const from = new URL(fromLocation, syntheticBase);
    return new URL(specifier, from).pathname.slice(1);
  }

  /**
   * Mint one blob URL per record, leaves first, and publish each minted
   * item into `maps.itemBlobByHash` and its `answers` specifiers into
   * `maps.specifierToBlob` — extended, never replaced. `items` is the
   * load's combined item set (every list registered for the load), so an
   * edge naming an item an earlier batch minted is satisfied by its
   * existing blob and adds no ordering edge.
   */
  static mint(
    records: readonly SharedDepListRecord[],
    items: ReadonlyMap<string, SharedDepListItem>,
    maps: SharedDepListMintMaps,
    entryId: string,
    dynamicImports?: ListDynamicImportRewrites,
  ): void {
    const pending = new Map(records.map((r) => [r.item.contentHash, r]));
    const minted = new Map<string, string>();
    // specifier -> record answering it, across the load's combined set.
    const answerer = new Map<string, SharedDepListItem>();
    for (const item of items.values()) {
      for (const specifier of item.answers) {
        if (!answerer.has(specifier)) answerer.set(specifier, item);
      }
    }
    const depsOf = (record: SharedDepListRecord): Set<string> => {
      const deps = new Set<string>();
      for (const edge of record.item.imports) {
        const targetHash =
          typeof edge === 'string'
            ? answerer.get(edge)?.contentHash
            : edge.item;
        if (
          targetHash !== undefined &&
          targetHash !== record.item.contentHash &&
          !maps.itemBlobByHash.has(targetHash)
        ) {
          deps.add(targetHash);
        }
      }
      return deps;
    };
    const blobOf = (hash: string): string | undefined =>
      minted.get(hash) ?? maps.itemBlobByHash.get(hash);
    // location → contentHash over the load's combined item set; built
    // once rather than per record.
    const locationToHash = new Map<string, string>();
    for (const item of items.values()) {
      locationToHash.set(item.location, item.contentHash);
    }

    while (pending.size > 0) {
      const before = pending.size;
      for (const [hash, record] of pending) {
        const deps = depsOf(record);
        if (![...deps].every((d) => minted.has(d) || maps.itemBlobByHash.has(d))) {
          continue;
        }
        let rewritten = record.text;
        // Bare-specifier edges: rewrite each declared specifier to the
        // blob of the item answering it (already in `specifierToBlob`
        // once its item minted).
        for (const edge of record.item.imports) {
          if (typeof edge !== 'string') continue;
          const blob = maps.specifierToBlob.get(edge);
          if (blob !== undefined) {
            rewritten = DynamicModuleOps.rewriteBareSpecifier(
              rewritten,
              edge,
              blob,
            );
          }
        }
        // Intra-package relative edges: the source's relative specifier
        // resolves against this item's `location` to the supplying
        // item's location; rewrite to that item's blob.
        rewritten = rewritten.replace(
          /(from|import)(\s*["'])([^"']+)(["'])/g,
          (whole, kind: string, gap: string, specifier: string, quote: string) => {
            if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
              return whole as string;
            }
            const targetHash = locationToHash.get(
              SharedDepListMinter.resolveLocation(
                record.item.location,
                specifier,
              ),
            );
            const blob =
              targetHash === undefined ? undefined : blobOf(targetHash);
            return blob === undefined
              ? (whole as string)
              : `${kind}${gap}${blob}${quote}`;
          },
        );
        if (dynamicImports !== undefined) {
          rewritten = UnitDynamicImportRewriter.rewrite(
            rewritten,
            dynamicImports.loaderUrl,
            (specifier) => dynamicImports.tokenFor(record, specifier),
          );
        }
        const blob = URL.createObjectURL(
          new Blob([rewritten], { type: 'text/javascript' }),
        );
        minted.set(hash, blob);
        maps.itemBlobByHash.set(hash, blob);
        for (const specifier of record.item.answers) {
          if (!maps.specifierToBlob.has(specifier)) {
            maps.specifierToBlob.set(specifier, blob);
          }
        }
        pending.delete(hash);
      }
      if (pending.size === before) {
        const names = [...pending.values()]
          .map((r) => `'${r.item.location}' (${r.item.contentHash.slice(0, 12)}…)`)
          .join(', ');
        throw new MfeLoadError(
          'circular shared-dependency items: no minting order exists over ' +
            `${names}.`,
          entryId,
        );
      }
    }
  }
}

/** Re-export so consumers of the minter need no second import site. */
export type { SharedDepFetchList };
