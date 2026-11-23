/**
 * List-driven shared-dependency loader: the runtime half of the
 * per-entry flat fetch-list model
 * (`cpt-frontx-adr-shared-dep-reuse`). Reads an entry's
 * {@link SharedDepFetchList} — held in the registered manifest —
 * fetches every unit missing from the realm text cache in
 * one parallel batch through `SharedTextAdmission` +
 * `SharedAssetUrlResolver`, and mints per load in dependency order
 * through `SharedDepListMinter`. There is no runtime graph discovery.
 *
 * Lazy-target and pattern lists load on first use: the target's nested
 * list names its units, those missing
 * from the realm cache are fetched in one parallel batch and minted
 * into the same load — the per-load maps are extended, never replaced —
 * and concurrent resolutions of one target are deduplicated. A failed
 * resolution is evicted so a later call retries. A fully opaque
 * `import(expr)` stays native.
 *
 * One class per file (`runtime_style`).
 *
 * @packageDocumentation
 * @internal
 */

import type { AttemptSourceTextLedger } from './AttemptSourceTextLedger';
import {
  RealmSharedDepTextCacheProvider,
  type SharedDepTextCache,
} from './RealmSharedDepTextCacheProvider';
import { SharedTextAdmission } from './SharedTextAdmission';
import {
  SharedDepListMinter,
  type ListDynamicImportRewrites,
  type SharedDepListRecord,
} from './SharedDepListMinter';
import type {
  SharedDepFetchList,
  SharedDepUnit,
} from '../../unit-format/fetch-list';

/**
 * Per-load shared-list state: every item the load's lists carry (entry
 * list plus every lazy/pattern delta fetched since), the per-load
 * content-identity and specifier blob maps, the dependent-list lookup,
 * and the dedupe/serialization machinery lazy resolutions share.
 */
export interface SharedDepListContext {
  /** Every fetch list of the manifest, by key. */
  readonly lists: Readonly<Record<string, SharedDepFetchList>>;
  /** specifier → blob URL — the map the expose chain rewrites against. */
  readonly specifierToBlob: Map<string, string>;
  /** blob key → blob URL, every item minted for the load. */
  readonly itemBlobByHash: Map<string, string>;
  /**
   * Location → blob key for units that mint per directory: byte-identical
   * units (one content identity) in different directories whose recorded
   * edges differ, so their relative specifiers bind different siblings
   * and one shared blob would bind the wrong one. Every other unit is
   * keyed by its content identity.
   */
  readonly blobKeyOf: Map<string, string>;
  /** Every specifier a unit of the manifest's table answers. */
  readonly declaredSpecifiers: ReadonlySet<string>;
  /** Every table unit carrying a content identity that mints per directory. */
  readonly twinsByHash: Map<string, SharedDepUnit[]>;
  /**
   * contentHash → list item, the load's combined item set; its `answers`
   * are those of every table unit carrying the content identity.
   */
  readonly itemByHash: Map<string, SharedDepUnit>;
  /**
   * Resolved URL → list item: locations are compared by the URL they
   * resolve to, never by their spelling.
   */
  readonly itemByUrl: Map<string, SharedDepUnit>;
  /** The URL a unit location resolves to (the shared asset URL rules). */
  readonly resolveUrl: (location: string) => string;
  /**
   * Dependent-list lookup keyed by the `lazy`/`patterns` record key —
   * the nested list of that lazy target or pattern match.
   */
  readonly dependentLists: Map<string, SharedDepFetchList>;
  /** One in-flight resolution per dependent-list key. */
  readonly pending: Map<string, Promise<void>>;
}

export class SharedDepListLoader {
  private readonly admission: SharedTextAdmission;
  private readonly fetchText: (url: string) => Promise<string>;

  private readonly encoder = new TextEncoder();
  private fetchedBytes = 0;

  constructor(
    fetchText: (url: string) => Promise<string>,
    private readonly entryId: string,
    cache: SharedDepTextCache = RealmSharedDepTextCacheProvider.getCache(),
    ledger?: AttemptSourceTextLedger,
  ) {
    this.fetchText = async (url) => {
      const text = await fetchText(url);
      this.fetchedBytes += this.encoder.encode(text).length;
      return text;
    };
    this.admission = new SharedTextAdmission(cache, ledger);
  }

  /**
   * UTF-8 bytes this loader's `fetchText` actually transferred so far —
   * realm cache joins and deduplicated repeats count nothing.
   */
  get bytesFetched(): number {
    return this.fetchedBytes;
  }

  /**
   * Fresh per-load context over the manifest's unit table and lists:
   * every unit is registered once, so a list's content identities and the
   * relative specifiers of a minted unit resolve against it, and a unit
   * minted under a content identity answers the specifiers of every table
   * unit carrying that identity. `resolveUrl` turns a unit location into
   * the absolute URL its file is fetched from.
   */
  createContext(
    units: readonly SharedDepUnit[],
    lists: Readonly<Record<string, SharedDepFetchList>>,
    resolveUrl: (location: string) => string,
  ): SharedDepListContext {
    const itemByHash = new Map<string, SharedDepUnit>();
    const itemByUrl = new Map<string, SharedDepUnit>();
    const answersByHash = new Map<string, Set<string>>();
    for (const unit of units) {
      const answers = answersByHash.get(unit.contentHash) ?? new Set<string>();
      for (const specifier of unit.answers) answers.add(specifier);
      answersByHash.set(unit.contentHash, answers);
      if (!itemByHash.has(unit.contentHash)) {
        itemByHash.set(unit.contentHash, unit);
      }
      // Every location registers: the same content identity emitted
      // under another package's directory is a distinct location — a
      // minted unit's relative specifier resolves against its own
      // location and must find the twin's location too.
      itemByUrl.set(resolveUrl(unit.location), unit);
    }
    for (const [hash, unit] of itemByHash) {
      itemByHash.set(hash, {
        ...unit,
        answers: [...(answersByHash.get(hash) ?? unit.answers)],
      });
    }
    // Twin units whose edges differ mint per directory.
    const carriers = new Map<string, SharedDepUnit[]>();
    for (const unit of units) {
      const group = carriers.get(unit.contentHash) ?? [];
      group.push(unit);
      carriers.set(unit.contentHash, group);
    }
    const blobKeyOf = new Map<string, string>();
    const twinsByHash = new Map<string, SharedDepUnit[]>();
    for (const [hash, group] of carriers) {
      const edges = new Set(group.map((unit) => JSON.stringify(unit.imports)));
      if (edges.size < 2) continue;
      twinsByHash.set(hash, group);
      for (const unit of group) {
        const dir = unit.location.slice(0, unit.location.lastIndexOf('/') + 1);
        blobKeyOf.set(unit.location, `${hash}@${dir}`);
      }
    }
    return {
      lists,
      specifierToBlob: new Map(),
      itemBlobByHash: new Map(),
      blobKeyOf,
      declaredSpecifiers: new Set(units.flatMap((unit) => unit.answers)),
      twinsByHash,
      itemByHash,
      itemByUrl,
      resolveUrl,
      dependentLists: new Map(),
      pending: new Map(),
    };
  }

  /** Register the lazy and pattern lists `list` names, by key, on `ctx`. */
  registerList(ctx: SharedDepListContext, list: SharedDepFetchList): void {
    for (const keys of [list.lazy, list.patterns]) {
      for (const key of keys ?? []) {
        const nested = ctx.lists[key];
        if (nested !== undefined && !ctx.dependentLists.has(key)) {
          ctx.dependentLists.set(key, nested);
        }
      }
    }
  }

  /**
   * Fetch every item of `list` missing from the realm text cache in one
   * parallel batch — cache hits are joined without a request — then
   * mint the unminted items in dependency order. The first failure in
   * list order is thrown after every sibling settles (deterministic
   * surfacing); nothing is minted on failure, so a retry re-runs the
   * batch in full.
   *
   * When `fetchOwnChunk` is given, every distinct entry of the list's
   * `ownChunks` joins the same batch, requested through that callback by
   * location; own chunks are never admitted to the realm cache and never
   * counted in the returned bytes.
   *
   * Returns the UTF-8 bytes this call's batch actually transferred —
   * cache-joined items count nothing — for the per-load diagnostics
   * summary.
   */
  async loadList(
    ctx: SharedDepListContext,
    list: SharedDepFetchList,
    resolveAssetUrl: (location: string) => string,
    dynamicImports?: ListDynamicImportRewrites,
    fetchOwnChunk?: (location: string) => Promise<unknown>,
  ): Promise<number> {
    this.registerList(ctx, list);
    const bytesBefore = this.fetchedBytes;
    const missing: SharedDepUnit[] = [];
    const queuedHashes = new Set<string>();
    const keyOf = (unit: SharedDepUnit): string =>
      ctx.blobKeyOf.get(unit.location) ?? unit.contentHash;
    for (const hash of list.units) {
      // Every hash a list names is held by the table: the load checked it
      // before its first request.
      const item = ctx.itemByHash.get(hash);
      if (item === undefined) continue;
      const twins = ctx.twinsByHash.get(hash);
      if (
        twins !== undefined
          ? twins.every((twin) => ctx.itemBlobByHash.has(keyOf(twin)))
          : ctx.itemBlobByHash.has(item.contentHash)
      ) {
        continue;
      }
      // One fetch per content identity: the same contentHash emitted
      // under two locations is one payload. Every location stays
      // registered on `ctx`, so both still resolve and mint.
      if (queuedHashes.has(item.contentHash)) continue;
      queuedHashes.add(item.contentHash);
      missing.push(item);
    }
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-fetch-reachable-units
    // One flat batch, no concurrency limit: every missing list unit and
    // every own chunk the list names, all requested before any response
    // arrives. Own chunks go through the caller's handler source-text
    // fetch, by location, and never enter the realm cache; the chain build
    // later joins the same in-flight entry, so it issues no second request.
    const itemRequests = missing.map(
      async (item): Promise<SharedDepListRecord> => {
        // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-admit-under-declared-identity
        // @cpt-begin:cpt-frontx-algo-mfe-isolation-unit-memo-minting:p1:inst-umm-text-realm-blob-perload
        // The raw text is kept in the realm cache under the key its declared
        // identity derives; the blobs minted from it stay per load.
        const text = await this.admission.admit(
          SharedTextAdmission.chunkKey(item.contentHash),
          resolveAssetUrl(item.location),
          this.fetchText,
        );
        // @cpt-end:cpt-frontx-algo-mfe-isolation-unit-memo-minting:p1:inst-umm-text-realm-blob-perload
        // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-admit-under-declared-identity
        return { item, text };
      },
    );
    const ownChunks =
      fetchOwnChunk !== undefined && Array.isArray(list.ownChunks)
        ? [...new Set(list.ownChunks)]
        : [];
    // An async wrapper: the request is still issued synchronously, and a
    // synchronous throw becomes a rejection of its own promise, so every
    // promise of the batch exists before `allSettled` observes any.
    const ownRequests = fetchOwnChunk
      ? ownChunks.map(async (location) => fetchOwnChunk(location))
      : [];
    const all = await Promise.allSettled([...itemRequests, ...ownRequests]);
    const settled = all.slice(0, itemRequests.length);
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-fetch-reachable-units
    const failure = all.find(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    if (failure) throw failure.reason;
    // A concurrent batch of the same load may have minted an item while
    // this one fetched: an existing per-load map entry is never replaced.
    // A content identity that mints per directory yields one record per
    // twin from the one fetched text.
    const records = settled
      .map((r) => (r as PromiseFulfilledResult<SharedDepListRecord>).value)
      .flatMap((record): SharedDepListRecord[] => {
        const twins = ctx.twinsByHash.get(record.item.contentHash);
        return twins === undefined
          ? [record]
          : twins.map((twin) => ({ item: twin, text: record.text }));
      })
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-unit-memo-minting:p1:inst-umm-memo-extendable
      .filter((record) => !ctx.itemBlobByHash.has(keyOf(record.item)));
    // @cpt-end:cpt-frontx-algo-mfe-isolation-unit-memo-minting:p1:inst-umm-memo-extendable
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-mint-list-items
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-mint-serialised
    SharedDepListMinter.mint(
      records,
      new Map([...ctx.itemByUrl.values()].map((i) => [i.location, i])),
      {
        itemBlobByHash: ctx.itemBlobByHash,
        blobKeyOf: ctx.blobKeyOf,
        declaredSpecifiers: ctx.declaredSpecifiers,
        specifierToBlob: ctx.specifierToBlob,
      },
      this.entryId,
      resolveAssetUrl,
      dynamicImports,
    );
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-mint-serialised
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-mint-list-items
    return this.fetchedBytes - bytesBefore;
  }

  /**
   * Resolve a dependent-list key — a `lazy` or `patterns` record key, a
   * lazy target's chunk location relative to the base that chunk resolves
   * against — on first use: fetch in one flat batch the units
   * its list names that are missing and mint them inside the same
   * load. The round is issued in this call, never behind
   * another target's rounds, so distinct targets download in parallel; a
   * mint is one synchronous step, so minting never overlaps. Concurrent
   * resolutions of one key share one in-flight batch; a rejected batch is
   * evicted so a later call retries. `fetchOwnChunk` is forwarded to
   * {@link loadList} for the delta list's `ownChunks`.
   */
  resolveDependent(
    ctx: SharedDepListContext,
    key: string,
    resolveAssetUrl: (location: string) => string,
    dynamicImports?: ListDynamicImportRewrites,
    fetchOwnChunk?: (location: string) => Promise<unknown>,
  ): Promise<void> {
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-lazy-roots
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-parallel-targets
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-admit-fetched-units
    let pending = ctx.pending.get(key);
    if (pending === undefined) {
      const batch = async (): Promise<void> => {
        const list = ctx.dependentLists.get(key);
        if (list === undefined) return;
        // One round: the target's missing units and own chunks go out
        // together, then only what is still unminted mints.
        await this.loadList(
          ctx,
          list,
          resolveAssetUrl,
          dynamicImports,
          fetchOwnChunk,
        );
      };
      pending = batch();
      ctx.pending.set(key, pending);
      const tracked = pending;
      tracked.catch(() => {
        if (ctx.pending.get(key) === tracked) ctx.pending.delete(key);
      });
    }
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-admit-fetched-units
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-parallel-targets
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-lazy-roots
    return pending;
  }

  /**
   * The blob URL answering a dependent-list resolution: after
   * {@link resolveDependent} settles, the target chunk's item — the one
   * located at `key` — has been minted; its blob is the answer a
   * `__frontx_lazy` resolver returns.
   */
  blobForKey(ctx: SharedDepListContext, key: string): string | undefined {
    const item = ctx.itemByUrl.get(ctx.resolveUrl(key));
    return item === undefined
      ? undefined
      : ctx.itemBlobByHash.get(
          ctx.blobKeyOf.get(item.location) ?? item.contentHash,
        );
  }
}
