/**
 * List-item blob minter: mints per-load blob URLs for shared-dependency
 * fetch-list items in leaves-first order, driven by the explicit
 * `imports`/`answers` edges each item records — no edge is derived from
 * source text at mint time (`cpt-frontx-algo-unit-format-contract-fetch-list-schema`).
 *
 * Dependency order comes from the list itself: a bare-specifier edge is
 * ordered before the item whose `answers` name it; a `{ unit }` edge is
 * ordered before the item carrying that content identity. Edges an
 * earlier mint of the same load already satisfied add no ordering edge —
 * the existing blob answers them. A cycle among unminted items admits no
 * order and fails the load deterministically.
 *
 * Source rewriting: bare specifiers go through the trust kernel's
 * `DynamicModuleOps.specifierEdits`; a relative specifier is
 * resolved against the importing item's own resolved location to the
 * item that supplies it (locations are compared by their resolved URL,
 * never by spelling); `import.meta.url` becomes the item's resolved
 * location; literal dynamic `import()` calls go through
 * `UnitDynamicImportRewriter` with the load's token resolver. After the
 * rewrite no static relative specifier may survive: a minted item that
 * still carries one fails the load, naming the item and the specifier.
 *
 * One class per file (`runtime_style`).
 *
 * @packageDocumentation
 * @internal
 */

import { MfeLoadError } from '../../errors';
import { DynamicModuleOps } from './mf-dynamic-module-ops';
import { SharedDepSpecifierScan } from './mf-shared-dep-specifier-scan';
import { DynamicImportScan } from '../../unit-format/dynamic-import-scan';
import { ImportMetaUrlRewriter } from './ImportMetaUrlRewriter';
import { SourceSplice } from './SourceSplice';
import { UnitDynamicImportRewriter } from './UnitDynamicImportRewriter';
import type {
  SharedDepFetchList,
  SharedDepUnit,
} from '../../unit-format/fetch-list';

/** A fetched list item ready to mint. */
export interface SharedDepListRecord {
  readonly item: SharedDepUnit;
  readonly text: string;
}

/**
 * Per-load minting surface a batch writes into: the content-identity →
 * blob map every minted item is published under, and the specifier →
 * blob map `answers` are claimed in.
 */
export interface SharedDepListMintMaps {
  /**
   * Blob key → blob URL, for every item minted for the load. The key is
   * the item's content identity, except for byte-identical units in
   * different directories whose recorded edges differ: those mint per
   * directory (see `blobKeyOf`).
   */
  readonly itemBlobByHash: Map<string, string>;
  /**
   * Location → blob key for the units that mint per directory — the
   * same bytes carried by twin units whose edges resolve to different
   * siblings. A unit absent here is keyed by its content identity.
   */
  readonly blobKeyOf?: ReadonlyMap<string, string>;
  /**
   * The specifiers the load declares: every `answers` entry of the
   * manifest's unit table. One that survives a minted unit's rewrite as a
   * bare specifier fails the load; a well-formed package specifier outside
   * this set is warned about.
   */
  readonly declaredSpecifiers?: ReadonlySet<string>;
  /** specifier → blob URL; the map the expose chain rewrites against. */
  readonly specifierToBlob: Map<string, string>;
}

/**
 * How the minter handles the dynamic imports in an item's source: every
 * literal and bounded-pattern `import()` becomes a `__frontx_lazy` call
 * naming the item's location (`UnitDynamicImportRewriter`), and
 * `loaderUrl` mints the per-load loader-stub blob URL on first use.
 */
export interface ListDynamicImportRewrites {
  readonly loaderUrl: () => string;
}

export class SharedDepListMinter {
  protected constructor() {}

  /**
   * Resolve a relative specifier against the importing item's `location`
   * to the shared-base-relative location of the item that supplies it —
   * the key the list's `lazy` / `patterns` records are keyed by.
   */
  static resolveLocation(fromLocation: string, specifier: string): string {
    // An absolute item location resolves to an absolute location, the form
    // an absolute list location is keyed by.
    if (/^https?:/i.test(fromLocation)) {
      return new URL(specifier, fromLocation).href;
    }
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
   * existing blob and adds no ordering edge. `resolveUrl` turns an item's
   * location into the absolute URL its file was fetched from.
   */
  static mint(
    records: readonly SharedDepListRecord[],
    items: ReadonlyMap<string, SharedDepUnit>,
    maps: SharedDepListMintMaps,
    entryId: string,
    resolveUrl: (location: string) => string,
    dynamicImports?: ListDynamicImportRewrites,
  ): void {
    const keyOf = (item: SharedDepUnit): string =>
      maps.blobKeyOf?.get(item.location) ?? item.contentHash;
    // A twin unit (one that mints per directory) is minted only once every
    // `{ unit }` edge of its own resolves to an item this load has minted or
    // this batch mints; until then it waits for a later batch, so it is
    // never minted with a relative specifier left unrewritten.
    const holds = (hash: string, ready: readonly SharedDepListRecord[]): boolean =>
      [...items.values()].some(
        (item) =>
          item.contentHash === hash &&
          (maps.itemBlobByHash.has(keyOf(item)) ||
            ready.some((r) => keyOf(r.item) === keyOf(item))),
      );
    for (const record of records) {
      if (maps.blobKeyOf?.has(record.item.location) !== true) continue;
      for (const edge of record.item.imports) {
        if (
          typeof edge !== 'string' &&
          ![...items.values()].some((item) => item.contentHash === edge.unit)
        ) {
          throw new MfeLoadError(
            `shared unit '${record.item.location}' imports the unit ` +
              `${edge.unit}, which no unit of the manifest carries, so it ` +
              'can never be minted.',
            entryId,
          );
        }
      }
    }
    let ready = [...records];
    for (let changed = true; changed; ) {
      changed = false;
      ready = ready.filter((record) => {
        if (maps.blobKeyOf?.has(record.item.location) !== true) return true;
        const resolvable = record.item.imports.every(
          (edge) => typeof edge === 'string' || holds(edge.unit, ready),
        );
        if (!resolvable) changed = true;
        return resolvable;
      });
    }
    const pending = new Map(ready.map((r) => [keyOf(r.item), r]));
    const minted = new Map<string, string>();
    // Only what this batch can order against: items the load already
    // minted and this batch's own records. An item another, still
    // unminted batch registered is no edge of this one, so it can neither
    // answer a specifier nor hold this batch behind a minting order that
    // never comes.
    const reachable = [...items.values()].filter(
      (item) =>
        maps.itemBlobByHash.has(keyOf(item)) || pending.has(keyOf(item)),
    );
    // specifier -> record answering it, across the reachable set.
    const answerer = new Map<string, SharedDepUnit>();
    for (const item of reachable) {
      for (const specifier of item.answers) {
        if (!answerer.has(specifier)) answerer.set(specifier, item);
      }
    }
    // A content identity carried by twin units that mint per directory
    // resolves, for an importer, to the twin in the importer's own
    // directory; any other identity has one key.
    const dirOf = (location: string): string =>
      location.slice(0, location.lastIndexOf('/') + 1);
    const keyForHash = (hash: string, fromLocation: string): string => {
      const twins = reachable.filter((item) => item.contentHash === hash);
      const local = twins.find(
        (item) => dirOf(item.location) === dirOf(fromLocation),
      );
      const chosen = local ?? twins[0];
      return chosen === undefined ? hash : keyOf(chosen);
    };
    const depsOf = (record: SharedDepListRecord): Set<string> => {
      const deps = new Set<string>();
      const self = keyOf(record.item);
      for (const edge of record.item.imports) {
        const targetKey =
          typeof edge === 'string'
            ? (() => {
                const answering = answerer.get(edge);
                return answering === undefined ? undefined : keyOf(answering);
              })()
            : keyForHash(edge.unit, record.item.location);
        if (
          targetKey !== undefined &&
          targetKey !== self &&
          pending.has(targetKey)
        ) {
          deps.add(targetKey);
        }
      }
      return deps;
    };
    const blobOf = (key: string): string | undefined =>
      minted.get(key) ?? maps.itemBlobByHash.get(key);
    // resolved URL → blob key over the load's combined item set; built
    // once rather than per record. Items are compared by the URL their
    // location resolves to, never by its spelling.
    // @cpt-begin:cpt-frontx-algo-unit-format-contract-fetch-list-schema:p1:inst-location-identity
    const urlToKey = new Map<string, string>();
    for (const item of reachable) {
      urlToKey.set(resolveUrl(item.location), keyOf(item));
    }
    // @cpt-end:cpt-frontx-algo-unit-format-contract-fetch-list-schema:p1:inst-location-identity

    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-mint-serialised
    // The whole batch mints in this one synchronous call — nothing
    // awaits between its first and last reference — so one load's batches
    // never interleave with one another or with a chain mint.
    while (pending.size > 0) {
      const before = pending.size;
      for (const [hash, record] of pending) {
        // @cpt-begin:cpt-frontx-algo-mfe-isolation-unit-memo-minting:p1:inst-umm-leaves-first
        const deps = depsOf(record);
        if (![...deps].every((d) => minted.has(d) || maps.itemBlobByHash.has(d))) {
          continue;
        }
        // @cpt-end:cpt-frontx-algo-mfe-isolation-unit-memo-minting:p1:inst-umm-leaves-first
        const unitUrl = resolveUrl(record.item.location);
        // The text is read once: every rewrite and check below works from
        // this scan's records.
        const scan = DynamicImportScan.scan(record.text);
        // Bare-specifier edges: each declared specifier is rewritten to the
        // blob of the item answering it (already in `specifierToBlob` once
        // its item minted). Intra-package relative edges: the source's
        // relative specifier resolves against this item's resolved location
        // to the supplying item, whose blob it is rewritten to. The two
        // sets of spellings are disjoint, so one pass rewrites both.
        const replacements = new Map<string, string>();
        // @cpt-begin:cpt-frontx-algo-mfe-isolation-unit-memo-minting:p1:inst-umm-subpath-rewrite
        // A subpath specifier is its own edge: it binds to the unit that
        // answers it, not to the package root.
        for (const edge of record.item.imports) {
          if (typeof edge !== 'string') continue;
          const blob = maps.specifierToBlob.get(edge);
          if (blob !== undefined) replacements.set(edge, blob);
        }
        // @cpt-end:cpt-frontx-algo-mfe-isolation-unit-memo-minting:p1:inst-umm-subpath-rewrite
        // @cpt-begin:cpt-frontx-algo-mfe-isolation-unit-memo-minting:p1:inst-umm-per-member-relative
        for (const { specifier } of scan.imports) {
          if (!specifier.startsWith('./') && !specifier.startsWith('../')) continue;
          const targetKey = urlToKey.get(new URL(specifier, unitUrl).href);
          const blob = targetKey === undefined ? undefined : blobOf(targetKey);
          if (blob !== undefined) replacements.set(specifier, blob);
        }
        // @cpt-end:cpt-frontx-algo-mfe-isolation-unit-memo-minting:p1:inst-umm-per-member-relative
        const edits = DynamicModuleOps.specifierEdits(
          record.text,
          scan.imports,
          replacements,
        );
        // @cpt-begin:cpt-frontx-algo-mfe-isolation-unit-memo-minting:p1:inst-umm-meta-url
        // Only the text that becomes the blob changes: the unit's cached
        // bytes stay as fetched.
        edits.push(...ImportMetaUrlRewriter.edits(scan.metaUrls, unitUrl));
        // @cpt-end:cpt-frontx-algo-mfe-isolation-unit-memo-minting:p1:inst-umm-meta-url
        // What the rewrite left unbound: the records no replacement names.
        const surviving = scan.imports.filter(
          (imported) => !replacements.has(imported.specifier),
        );
        // @cpt-begin:cpt-frontx-algo-mfe-isolation-unit-memo-minting:p1:inst-umm-unresolved-specifiers
        // A static relative specifier no item supplied has no blob to bind:
        // the unit is refused rather than minted to fail on evaluation.
        const relativeSurvivor = SharedDepSpecifierScan.findSurvivingRelative(surviving);
        if (relativeSurvivor !== undefined) {
          throw new MfeLoadError(
            `shared unit '${record.item.location}' still imports the ` +
              `relative specifier '${relativeSurvivor}' after rewriting, for ` +
              `microfrontend '${entryId}'. No unit of the load is located ` +
              'where that specifier resolves.',
            entryId,
          );
        }
        if (maps.declaredSpecifiers !== undefined) {
          // Only the unit's own bare `imports` edges can survive: they are
          // what its text was rewritten against.
          const survivor = SharedDepSpecifierScan.findSurvivingDeclared(
            surviving,
            new Set(
              record.item.imports.filter(
                (edge): edge is string =>
                  typeof edge === 'string' && maps.declaredSpecifiers!.has(edge),
              ),
            ),
          );
          if (survivor !== undefined) {
            throw new MfeLoadError(
              `shared unit '${record.item.location}' still imports the ` +
                `bare specifier '${survivor}' after rewriting, for ` +
                `microfrontend '${entryId}'. Every specifier a unit of ` +
                'the manifest answers must resolve to a blob URL; no ' +
                'unit on the load answers it.',
              entryId,
            );
          }
          for (const specifier of SharedDepSpecifierScan.findUndeclaredWellFormedSpecifiers(
            surviving,
            maps.declaredSpecifiers,
          )) {
            console.warn(
              `shared unit '${record.item.location}' imports ` +
                `'${specifier}', which no unit of the manifest answers, ` +
                `for microfrontend '${entryId}'. This specifier cannot ` +
                'resolve inside an isolated module. The load proceeds — ' +
                'this is a diagnostic only.',
            );
          }
        }
        // @cpt-end:cpt-frontx-algo-mfe-isolation-unit-memo-minting:p1:inst-umm-unresolved-specifiers
        let rewritten: string;
        if (dynamicImports !== undefined) {
          // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-rewrite-shared-dynamic-imports
          // @cpt-begin:cpt-frontx-algo-mfe-isolation-unit-memo-minting:p1:inst-umm-dynamic-import-rewrite
          rewritten = UnitDynamicImportRewriter.rewrite(
            record.text,
            scan.calls,
            dynamicImports.loaderUrl,
            record.item.location,
            edits,
          );
          // @cpt-end:cpt-frontx-algo-mfe-isolation-unit-memo-minting:p1:inst-umm-dynamic-import-rewrite
          // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-rewrite-shared-dynamic-imports
        } else {
          rewritten = SourceSplice.apply(record.text, edits);
        }
        // @cpt-begin:cpt-frontx-algo-mfe-isolation-unit-memo-minting:p1:inst-umm-one-blob-per-unit
        const blob = URL.createObjectURL(
          new Blob([rewritten], { type: 'text/javascript' }),
        );
        minted.set(hash, blob);
        // @cpt-end:cpt-frontx-algo-mfe-isolation-unit-memo-minting:p1:inst-umm-one-blob-per-unit
        // @cpt-begin:cpt-frontx-algo-mfe-isolation-unit-memo-minting:p1:inst-umm-return
        // The per-load maps are extended, never replaced.
        maps.itemBlobByHash.set(hash, blob);
        for (const specifier of record.item.answers) {
          if (!maps.specifierToBlob.has(specifier)) {
            maps.specifierToBlob.set(specifier, blob);
          }
        }
        // @cpt-end:cpt-frontx-algo-mfe-isolation-unit-memo-minting:p1:inst-umm-return
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
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-mint-serialised
  }
}

/** Re-export so consumers of the minter need no second import site. */
export type { SharedDepFetchList };
