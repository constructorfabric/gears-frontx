/**
 * List-driven shared-dependency loader: the runtime half of the
 * per-entry flat fetch-list model
 * (`cpt-frontx-adr-shared-dep-reuse`). Reads an entry's
 * {@link SharedDepFetchList} — from a fetched list document —
 * fetches every item missing from the realm text cache in
 * one parallel batch through `SharedTextAdmission` +
 * `SharedAssetUrlResolver`, and mints per load in dependency order
 * through `SharedDepListMinter`. There is no runtime graph discovery.
 *
 * Lazy-target and pattern lists load on first use: the target's delta
 * list is fetched, its items missing
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

import { MfeLoadError } from '../../errors';
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
  SharedDepFileRef,
  SharedDepListItem,
} from '../../unit-format/fetch-list';

/**
 * Per-load shared-list state: every item the load's lists carry (entry
 * list plus every lazy/pattern delta fetched since), the per-load
 * content-identity and specifier blob maps, the dependent-list lookup,
 * and the dedupe/serialization machinery lazy resolutions share.
 */
export interface SharedDepListContext {
  /** specifier → blob URL — the map the expose chain rewrites against. */
  readonly specifierToBlob: Map<string, string>;
  /** contentHash → blob URL, every item minted for the load. */
  readonly itemBlobByHash: Map<string, string>;
  /** contentHash → list item, the load's combined item set. */
  readonly itemByHash: Map<string, SharedDepListItem>;
  /** shared-base-relative location → list item. */
  readonly itemByLocation: Map<string, SharedDepListItem>;
  /**
   * Dependent-list lookup keyed by the `lazy`/`patterns` record key —
   * the `SharedDepFileRef` of the list document to fetch.
   */
  readonly dependentLists: Map<string, SharedDepFileRef>;
  /** One in-flight resolution per dependent-list key. */
  readonly pending: Map<string, Promise<void>>;
  /** Tail of the load's mint-batch chain: batches never interleave. */
  readonly mintQueue: { tail: Promise<void> };
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
   * realm cache joins and deduplicated repeats count nothing (F-011).
   */
  get bytesFetched(): number {
    return this.fetchedBytes;
  }

  /** Fresh per-load context. */
  createContext(): SharedDepListContext {
    return {
      specifierToBlob: new Map(),
      itemBlobByHash: new Map(),
      itemByHash: new Map(),
      itemByLocation: new Map(),
      dependentLists: new Map(),
      pending: new Map(),
      mintQueue: { tail: Promise.resolve() },
    };
  }

  /**
   * Fetch a list document, admit it to the realm cache as fetched under
   * its declared identity, then JSON-parse it. The runtime performs no
   * structural validation — correctness rests on the producer's
   * conformance (`inst-read-point-of-use`); a document that is not an object with an
   * `items` array fails the load naming the producer it records.
   */
  async fetchListDocument(
    ref: SharedDepFileRef,
    resolveAssetUrl: (location: string) => string,
  ): Promise<SharedDepFetchList> {
    const url = resolveAssetUrl(ref.location);
    const text = await this.admission.admit(
      SharedTextAdmission.listKey(ref.contentHash),
      url,
      this.fetchText,
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new MfeLoadError(
        `fetch-list document '${ref.location}' is not JSON.`,
        this.entryId,
      );
    }
    const list = parsed as SharedDepFetchList;
    if (
      typeof list !== 'object' ||
      list === null ||
      !Array.isArray(list.items)
    ) {
      const producer = (list as SharedDepFetchList)?.producer;
      const label =
        producer !== undefined
          ? `${producer.name}@${producer.version}`
          : 'unknown producer';
      throw new MfeLoadError(
        `fetch-list document '${ref.location}' carries no 'items' array ` +
          `(producer ${label}).`,
        this.entryId,
      );
    }
    return list;
  }

  /** Register a list's items and dependent-list records on `ctx`. */
  registerList(ctx: SharedDepListContext, list: SharedDepFetchList): void {
    for (const item of list.items) {
      if (!ctx.itemByHash.has(item.contentHash)) {
        ctx.itemByHash.set(item.contentHash, item);
      }
      // Every location registers: the same content identity emitted
      // under another package's directory is a distinct location —
      // a minted item's relative specifier resolves against its own
      // item's location and must find the twin's location too.
      ctx.itemByLocation.set(item.location, item);
    }
    for (const record of [list.lazy, list.patterns]) {
      if (record === undefined) continue;
      for (const [key, ref] of Object.entries(record)) {
        if (!ctx.dependentLists.has(key)) ctx.dependentLists.set(key, ref);
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
   * summary (F-011).
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
    const missing: SharedDepListItem[] = [];
    const queuedHashes = new Set<string>();
    for (const item of list.items) {
      if (ctx.itemBlobByHash.has(item.contentHash)) continue;
      // One fetch per content identity: the same contentHash emitted
      // under two locations is one payload. Every location stays
      // registered on `ctx` (registerList ran above), so both still
      // resolve and mint.
      if (queuedHashes.has(item.contentHash)) continue;
      queuedHashes.add(item.contentHash);
      missing.push(item);
    }
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-fetch-reachable-units
    // One flat batch, no concurrency limit: every missing list item and
    // every own chunk the list names, all requested before any response
    // arrives. Own chunks go through the caller's handler source-text
    // fetch, by location, and never enter the realm cache; the chain build
    // later joins the same in-flight entry, so it issues no second request.
    const itemRequests = missing.map(
      async (item): Promise<SharedDepListRecord> => {
        const text = await this.admission.admit(
          SharedTextAdmission.chunkKey(item.contentHash),
          resolveAssetUrl(item.location),
          this.fetchText,
        );
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
    const records = settled.map(
      (r) => (r as PromiseFulfilledResult<SharedDepListRecord>).value,
    );
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-mint-list-items
    SharedDepListMinter.mint(
      records,
      new Map([...ctx.itemByLocation.values()].map((i) => [i.location, i])),
      {
        itemBlobByHash: ctx.itemBlobByHash,
        specifierToBlob: ctx.specifierToBlob,
      },
      this.entryId,
      dynamicImports,
    );
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-mint-list-items
    return this.fetchedBytes - bytesBefore;
  }

  /**
   * Resolve a dependent-list key — a `lazy` or `patterns` record key, a
   * lazy chunk's shared-base-relative location — on first use: fetch
   * the target's delta list document, then fetch and mint
   * its missing items in one parallel batch inside the same load.
   * Concurrent resolutions of one key share one in-flight batch; a
   * rejected batch is evicted so a later call retries. `fetchOwnChunk` is
   * forwarded to {@link loadList} for the delta list's `ownChunks`.
   */
  resolveDependent(
    ctx: SharedDepListContext,
    key: string,
    resolveAssetUrl: (location: string) => string,
    dynamicImports?: ListDynamicImportRewrites,
    fetchOwnChunk?: (location: string) => Promise<unknown>,
  ): Promise<void> {
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-lazy-roots
    let pending = ctx.pending.get(key);
    if (pending === undefined) {
      const batch = async (): Promise<void> => {
        const target = ctx.dependentLists.get(key);
        if (target === undefined) return;
        const list = await this.fetchListDocument(target, resolveAssetUrl);
        // Register BEFORE minting so edges into the delta's own items
        // resolve, then mint only what is still unminted.
        await this.loadList(
          ctx,
          list,
          resolveAssetUrl,
          dynamicImports,
          fetchOwnChunk,
        );
      };
      pending = ctx.mintQueue.tail.then(batch);
      ctx.mintQueue.tail = pending.then(
        () => undefined,
        () => undefined,
      );
      ctx.pending.set(key, pending);
      const tracked = pending;
      tracked.catch(() => {
        if (ctx.pending.get(key) === tracked) ctx.pending.delete(key);
      });
    }
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-lazy-roots
    return pending;
  }

  /**
   * Candidate `lazy`/`patterns` record keys for a lazy chunk known only
   * by its asset-base-relative `filename` (the `__frontx_lazy` path
   * resolved against the entry chunk's directory). Record keys are
   * shared-base-relative locations, so when `metaData.sharedBase` and
   * `publicPath` differ the bare filename never matches: the candidates
   * are the filename itself (bases equal, or producer recorded the
   * asset-base-relative path), the chunk's absolute URL (absolute keys),
   * and its location relative to the shared asset base — a `…/` climb
   * when the chunk lives outside it.
   */
  static dependentListKeyCandidates(
    filename: string,
    baseUrl: string,
    assetBase: string,
  ): string[] {
    const candidates = new Set<string>([filename]);
    try {
      const target = new URL(filename, baseUrl);
      candidates.add(target.href);
      const base = new URL(assetBase);
      if (target.origin === base.origin) {
        if (target.href.startsWith(base.href)) {
          candidates.add(target.href.slice(base.href.length));
        } else {
          const baseDirs = base.pathname.split('/').filter(Boolean);
          const targetSegments = target.pathname
            .split('/')
            .filter(Boolean);
          let common = 0;
          while (
            common < baseDirs.length &&
            common < targetSegments.length - 1 &&
            baseDirs[common] === targetSegments[common]
          ) {
            common += 1;
          }
          candidates.add(
            '../'.repeat(baseDirs.length - common) +
              targetSegments.slice(common).join('/'),
          );
        }
      }
    } catch {
      // An unparseable URL leaves the filename candidate only.
    }
    return [...candidates];
  }

  /**
   * The blob URL answering a dependent-list resolution: after
   * {@link resolveDependent} settles, the target chunk's item — the one
   * located at `key` — has been minted; its blob is the answer a
   * `__frontx_lazy` resolver returns.
   */
  blobForKey(ctx: SharedDepListContext, key: string): string | undefined {
    const item = ctx.itemByLocation.get(key);
    return item === undefined
      ? undefined
      : ctx.itemBlobByHash.get(item.contentHash);
  }
}
