/**
 * Module Federation MFE Handler Implementation
 *
 * Achieves per-runtime isolation by blob-URL'ing the entire module dependency
 * chain for each load() call. Each screen/extension load gets fresh evaluations
 * of all code-split chunks and shared dependencies — no module instances are
 * shared between runtimes, with no exception. A dependency cycle admits no
 * order in which blob URLs could be minted (a blob URL is produced BY its
 * content, so a module's URL cannot exist before every dependency's URL
 * does), so a cyclic graph fails the load with a diagnostic naming the
 * chunks on the cycle rather than resolving any module from its origin URL.
 *
 * Manifest-based loading:
 * - baseUrl is manifest.metaData.publicPath resolved against document.baseURI
 * - expose chunk filename comes from entry.exposeAssets.js.sync[0]
 * - CSS paths come from entry.exposeAssets.css.sync/async
 * - shared dep standalone ESM files are resolved from manifest.shared[].chunkPath (relative to publicPath)
 * No remoteEntry.js parsing is required.
 *
 * Bare specifier rewriting for shared deps:
 * - Shared deps are fetched as standalone ESM files from each MFE's server (chunkPath relative to publicPath).
 * - Dependency order is derived from the fetched sources themselves, not from
 *   manifest.shared[]'s enumeration order; shared deps that import one another
 *   circularly admit no such order and fail the load with a diagnostic.
 * - Within expose chunks and their dependency chains, bare specifiers (e.g. from "react")
 *   are rewritten to the pre-built blob URLs for the corresponding shared dep.
 * - This gives per-load isolation without any MF 2.0 runtime involvement.
 *
 * @packageDocumentation
 */
// @cpt-dod:cpt-frontx-dod-mfe-loading-attempt-timeout:p1
// @cpt-dod:cpt-frontx-dod-mfe-loading-one-round-load:p1
// @cpt-dod:cpt-frontx-dod-mfe-loading-lazy-abi-isolation:p1
// @cpt-dod:cpt-frontx-dod-mfe-loading-content-identity:p1
// @cpt-dod:cpt-frontx-dod-mfe-isolation-unit-memo:p1
// @cpt-dod:cpt-frontx-dod-mfe-isolation-shared-dep-diagnostics:p1
// @cpt-dod:cpt-frontx-dod-mfe-isolation-handler-source-text-cache:p1
// @cpt-dod:cpt-frontx-dod-mfe-isolation-blob-core:p1
// @cpt-dod:cpt-frontx-dod-mfe-isolation-manifest-reference-resolution:p1
// @cpt-state:cpt-frontx-state-mfe-isolation-module-lifecycle:p1
// @cpt-state:cpt-frontx-state-mfe-loading-load-lifecycle:p1

import type { MfeEntryMF } from '../../types/mfe-entry-mf';
import type { MfManifest } from '../../manifest/mf-manifest';
import { LazyLoaderRegistry } from '../../lazy-loader/LazyLoaderRegistry';
import { MfeHandler, MfeEntryLifecycle } from '../MfeHandler';
import { ChildMfeBridge } from '../ChildMfeBridge';
import { MfeLoadError } from '../../errors';
import { RetryHandler, INITIAL_RETRY_DELAY_MS } from './RetryHandler';
import { RetryableLoadError } from './RetryableLoadError';
import { MfeBridgeFactoryDefault } from '../../bridge/MfeBridgeFactoryDefault';
import { DynamicModuleOps } from './mf-dynamic-module-ops';
import { SharedDepSpecifierScan } from './mf-shared-dep-specifier-scan';
import { LruCache, SHARED_DEP_ADOPTION_NOTICE_CACHE_CAPACITY } from './LruCache';
import { RealmSharedDepTextCacheProvider, DEFAULT_SHARED_DEP_TEXT_CACHE_MAX_BYTES, type SharedDepTextCache } from './RealmSharedDepTextCacheProvider';
import { AttemptSourceTextLedger } from './AttemptSourceTextLedger';
import { SharedAssetUrlResolver } from './SharedAssetUrlResolver';
import { AssetBaseUrl } from './AssetBaseUrl';
import { ImportMetaUrlRewriter } from './ImportMetaUrlRewriter';
import { SourceSplice } from './SourceSplice';
import { DynamicImportScan, type StaticImportRecord } from '../../unit-format/dynamic-import-scan';
import { WholePackageLoader } from './WholePackageLoader';
import { FetchBudget, MAX_CONCURRENT_FETCHES } from './FetchBudget';
import { ManifestCache } from './ManifestCache';
import { SharedDepListLoader, type SharedDepListContext } from './SharedDepListLoader';
import type { SharedDepFetchList } from '../../unit-format/fetch-list';
import { SharedDepListMinter, type ListDynamicImportRewrites } from './SharedDepListMinter';
import { UnitDynamicImportRewriter } from './UnitDynamicImportRewriter';
import { LoadDiagnosticsAccumulator } from './LoadDiagnosticsAccumulator';

const RUNTIME_STYLE_ID_PREFIX = '__frontx-mfe-runtime-style-';

/**
 * An in-progress {@link MfeHandlerMF.createBlobUrlChain} construction.
 *
 * `lineage` is the set of ancestor filenames whose construction this entry
 * is nested under. It starts as a copy of the constructing call's own
 * ancestor set and grows afterward: any other branch that joins this entry
 * instead of constructing it contributes its own lineage in, so a cycle
 * that only becomes visible once two independently-fanned-out branches
 * meet can still be detected from either side (see the doc comment on
 * {@link MfeHandlerMF.createBlobUrlChain}).
 *
 * A branch that detects a cycle rejects rather than returning (see
 * {@link MfeHandlerMF.onDependencyCycleDetected}), and the rejection fails
 * the whole chain build, so no branch ever stops awaiting this entry while
 * leaving its contribution behind. The lineage therefore never outlives the
 * build whose branches wrote it, and it names exactly the branches waiting
 * on this construction rather than an over-approximation of them.
 */
interface InFlightChainEntry {
  readonly promise: Promise<void>;
  readonly lineage: Set<string>;
}

/**
 * Per-load shared state for blob URL chain creation.
 *
 * Shared across all blob URL chains within a single load() call so that
 * common transitive dependencies (e.g., the bundled React CJS module) are
 * blob-URL'd once and reused by all modules within the same load.
 */
// @cpt-state:cpt-frontx-state-mfe-isolation-load-blob-state:p1
interface LoadBlobState {
  readonly blobUrlMap: Map<string, string>;
  /**
   * Stores the in-flight promise for each filename currently being
   * constructed, rather than its resolved value, precisely so that
   * concurrent callers for the same filename can share one construction
   * instead of each starting (and blob-URL'ing) their own — the value only
   * ever settles to a resolved blob URL through `blobUrlMap`, checked
   * before this map, once the construction completes.
   */
  readonly inFlight: Map<string, InFlightChainEntry>;
  readonly baseUrl: string;
  /** MFE entry ID for this load; used in error messages. */
  readonly entryId: string;
  /** Shared dep blob URLs: package name → blob URL. Built before the expose chain. */
  readonly sharedDepBlobUrls: Map<string, string>;
  /**
   * The specifiers the load declares: the manifest's unit `answers` on the
   * fetch-list path, the declared `shared[]` names on the whole-package
   * path. One that survives an own chunk's rewrite as a bare specifier
   * fails the chain build; a well-formed package specifier outside the set
   * is warned about.
   */
  readonly declaredSpecifiers: ReadonlySet<string>;
  /**
   * Entry-chunk path (relative to `baseUrl`) for this load. Used as the
   * resolution base when `__frontx_lazy('<rel>')` is invoked at runtime:
   * Rollup emits dynamic-import paths relative to the importing chunk's
   * directory, and every MFE chunk in a Vite build lives in the same
   * output directory as the entry chunk, so the entry chunk's path is
   * the correct resolution base for any lazy chunk in the load.
   */
  readonly entryChunkFilename: string;
  /**
   * Blob URL of the per-load `__frontx_lazy` loader stub module. Lazily
   * minted on the first chunk that contains a `__frontx_lazy(` call and
   * reused for every subsequent chunk in the same load. Closed over this
   * load's resolver in the host-side global registry — sibling loads get
   * distinct stub URLs so a chunk's `__frontx_lazy(./X)` call routes back
   * to the parent load that owns it.
   *
   * Mutable: this is the single field in `LoadBlobState` that the chain
   * code mutates after construction. Kept on `LoadBlobState` rather than
   * a side-map so that the per-load lifetime tracking is co-located with
   * the rest of the load's blob URLs (per ADR-0004 + ADR-0022, the stub
   * URL is owned by the same load and shares its never-revoke invariant).
   */
  lazyLoaderUrl?: string;
  /**
   * The ledger of the load ATTEMPT that built this state, if the attempt is
   * raced against a timeout budget. Threaded here rather than passed down
   * every chain-build signature because `loadState` already reaches every
   * source-text fetch in the load. Absent for a state built outside an
   * attempt (a hand-built one in tests, for instance).
   *
   * The ledger is settled when its attempt settles, so a lazy chunk
   * resolved through this state afterwards records into nothing and this
   * reference retains no source text.
   */
  readonly attemptLedger?: AttemptSourceTextLedger;
  /**
   * Shared-dep list context for lazy-target lists
   * (`inst-lai-lazy-roots`): present only when the load took the
   * fetch-list path, so a lazy chunk resolving through this state can
   * fetch and mint the items its dependent list carries and extend
   * `sharedDepBlobUrls`.
   */
  readonly sharedDepLists?: SharedDepListLoadContext;
  /**
   * This load's own request for the entry chunk's source text, issued in
   * the round of the list's units and own chunks on the fetch-list path
   * (`inst-md-fetch-entry-concurrent`). The build of the entry chunk takes
   * its text from this promise, so the entry is downloaded once however many
   * other texts the handler's source-text handling admits meanwhile. A
   * one-shot hand-off: the build of the entry chunk takes the promise and
   * clears the field, so the per-load state — which the lazy-import registry
   * keeps for the page's lifetime when the load has lazy chunks — does not
   * keep the entry text reachable.
   */
  entrySource?: Promise<string>;
  /**
   * The lazy resolutions in flight, by target location: concurrent
   * resolutions of one target share one, and a settled one leaves the map.
   */
  lazyResolutions?: Map<string, Promise<string>>;
}

/**
 * What a lazy chunk (or a literal `import()` inside a minted shared
 * item) needs to fetch and mint the items its dependent list carries:
 * the list loader, the per-load list context, the shared-file URL
 * resolution the initial batch used, and the mint-time dynamic-import
 * rewrites — so a dependent list's items join the same load and the
 * per-load maps are only ever extended, never replaced
 * (`inst-lai-lazy-roots`).
 */
interface SharedDepListLoadContext {
  readonly loader: SharedDepListLoader;
  readonly ctx: SharedDepListContext;
  readonly entryId: string;
  /**
   * The shared asset base (`metaData.sharedBase` resolved, or the load's
   * own base URL when absent): the base list
   * units resolve against, and the base the `lazy`/`patterns` record keys
   * of a shared unit are expressed against — an own chunk's key is
   * relative to the asset base instead.
   */
  readonly assetBase: string;
  readonly resolveAssetUrl: (location: string) => string;
  readonly dynamicImports: ListDynamicImportRewrites;
  /**
   * Requests one own chunk named by a list's `ownChunks` through the
   * handler source-text cache, by location against the asset base; the
   * text never enters the realm cache.
   */
  readonly fetchOwnChunk: (location: string) => Promise<unknown>;
  /**
   * The load's prefetched own-chunk text promises by absolute URL, held
   * until the chain build takes each one (so the shared handler cache's
   * eviction cannot cost a second request) and then dropped.
   */
  readonly ownChunkTexts: Map<string, Promise<string>>;
  /**
   * Whether the load has minted the own chunk at a location; bound once
   * the load's state exists, so a later list naming a minted chunk issues
   * no request for it.
   */
  readonly ownChunkMinted: { has: (location: string) => boolean };
}

/**
 * Per-chain-build state: the build's failure signal, its fetch-concurrency
 * budget, and the set of chunks it has already diagnosed a dependency cycle
 * for.
 *
 * A single call into {@link MfeHandlerMF.createBlobUrlChain} — the initial
 * expose-chunk build for a load, or one later {@link
 * MfeHandlerMF.resolveLazyChunk} call reached through the lazy-import ABI —
 * is one "chain build". Every recursive fan-out inside that one build
 * shares one `ChainBuildState` instance, created fresh by whichever
 * method starts the build.
 *
 * This is deliberately NOT part of {@link LoadBlobState}: `LoadBlobState`
 * lives for the whole load (page lifetime, per the never-revoke invariant)
 * and is shared by every lazy chunk resolved through it, but "a fetch
 * failed somewhere in this build" must not survive past the build it
 * happened in. A `LoadBlobState`-scoped flag would latch permanently after
 * the first failed lazy import — poisoning every later, otherwise
 * independent, lazy import on the same already-mounted MFE, with no retry
 * path short of a full page reload. Scoping the flag to one build instead
 * means a failed lazy import fails only its own `resolveLazyChunk` call;
 * the next lazy import starts its own fresh `ChainBuildState` and is
 * unaffected.
 *
 * Sibling continuations belonging to the SAME build still check `inFlight`
 * (on `LoadBlobState`) to join or await one another's construction — this
 * token governs only "stop starting new work because a
 * sibling in my own build already failed", never cross-build promise
 * rejection, which continues to propagate through the shared `inFlight`
 * promise itself (a build awaiting a promise another build created still
 * sees that promise reject on its own terms).
 */
class ChainBuildState {
  private broken = false;

  constructor(
    /**
     * Single concurrency budget for every chunk-source fetch this build
     * issues — see {@link FetchBudget} for why the bound has to be build-wide
     * rather than per fan-out batch. Present only on the whole-package path;
     * a fetch-list load's chain build is unbounded.
     */
    readonly fetchBudget: FetchBudget | undefined,
    /**
     * Whether the chunks this build reaches carry native literal or pattern
     * dynamic imports that must reach the load's lazy-import ABI: set for a
     * walk started by a whole-package entry's call, whose chunks are shared
     * text the build emitted no ABI calls into.
     */
    readonly rewriteNativeDynamicImports: boolean,
    /**
     * The ledger of the attempt this build runs in. Once that attempt has
     * failed or been released on timeout, the build is failed too, so the
     * abandoned work starts no further fetch.
     */
    private readonly ledger?: AttemptSourceTextLedger
  ) {}

  /**
   * Filenames this build has already raised a dependency-cycle diagnostic
   * for, so the same cycle is reported once per build however many branches
   * run into it (see {@link MfeHandlerMF.onDependencyCycleDetected}).
   *
   * Build-scoped for the same reason `failed` is: a detected cycle is a
   * fact about one build's traversal, not about the load.
   */
  readonly reportedCycles = new Set<string>();

  /** Whether this build, or the attempt it runs in, has failed. */
  get failed(): boolean {
    return this.broken || this.ledger?.hasFailed === true;
  }

  set failed(value: boolean) {
    this.broken = value;
  }
}

/** Start a fresh chain build (see {@link ChainBuildState}). */
// @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-build-failure-scope
function createChainBuildState(
  bounded: boolean,
  rewriteNativeDynamicImports = false,
  ledger?: AttemptSourceTextLedger
): ChainBuildState {
  return new ChainBuildState(
    bounded ? new FetchBudget(MAX_CONCURRENT_FETCHES) : undefined,
    rewriteNativeDynamicImports,
    ledger
  );
}
// @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-build-failure-scope

/**
 * Max source-text entries retained. Expose-chunk entries evict oldest-first.
 *
 * Concurrent fan-out (see {@link MAX_CONCURRENT_FETCHES}) can insert several
 * entries from a single burst instead of one at a time, which raises eviction
 * odds under this capacity versus a strictly-sequential insertion pattern.
 * This is not a correctness break — `LruCache.delete` only removes the map
 * entry; a caller already holding the evicted entry's promise still resolves
 * it (see {@link LruCache}) — but a too-small capacity can reduce the
 * cross-MFE cache hit rate for large expose chains. The capacity covers
 * realistic per-load chunk counts (an expose chain rarely exceeds a few
 * dozen static-import chunks) with headroom for several concurrent loads'
 * worth of burst insertions; raise it if a real MFE's static import graph
 * approaches this width.
 */
export const SOURCE_TEXT_CACHE_CAPACITY = 256;

/** The per-attempt budget when the handler option `timeout` is absent. */
const DEFAULT_TIMEOUT_MS = 30000;

/** The retries after a failed attempt when the handler option `retries` is absent. */
const DEFAULT_RETRIES = 2;

/**
 * Configuration for MFE loading behavior.
 */
interface MfeLoaderConfig {
  timeout?: number;
  retries?: number;
  /**
   * Byte budget for the realm shared-dep text cache (ADR-0035). The FIRST
   * handler to publish the realm entry sets it; later handlers adopt the
   * published cache unchanged.
   */
  sharedDepTextCacheMaxBytes?: number;
}

/**
 * Module Federation handler for loading MFE bundles.
 *
 * For each load() call:
 *  1. Resolves the MfManifest (validates metaData.publicPath and shared[])
 *  2. Derives the absolute baseUrl from manifest.metaData.publicPath
 *  3. Reads the expose chunk filename from entry.exposeAssets.js.sync[0]
 *  4. Builds blob URLs for shared deps from standalone ESM files (leaves first)
 *  5. Creates a blob URL chain for the expose chunk and all its static deps,
 *     rewriting bare specifiers to the pre-built shared dep blob URLs
 *  6. All blob URLs share a per-load map so common transitive deps are
 *     evaluated once within the same load
 */
class MfeHandlerMF extends MfeHandler<MfeEntryMF, ChildMfeBridge> {
  /**
   * Process-wide load cache.
   *
   * Keyed by the EXTENSION INSTANCE ID — the `id` field of the registered
   * `MfeExtension` whose entry is being loaded. Two extensions registered
   * against the same `MfeEntry` definition (sibling extensions sharing an
   * `entry.id`) populate DISTINCT cache entries — distinct blob URL chains,
   * distinct module evaluations, distinct module-scope state — per ADR-0004
   * (`cpt-frontx-adr-mfe-load-isolation`) + ADR-0020
   * (`cpt-frontx-adr-mfe-state-lifecycle-boundary`) isolation invariant.
   * Sibling isolation is the handler's responsibility, not the MFE author's.
   *
   * Re-mount of the SAME extension instance (same `extensionId`) reuses the
   * cached load — same blob URLs, same module instance, same
   * `MfeEntryLifecycle` reference, satisfying the never-revoke invariant.
   *
   * Cache lifetime = page lifetime. No eviction except on load failure
   * (a rejected promise is removed so a subsequent load can retry from
   * scratch). Memory bound = catalog-bounded by unique extension instance
   * IDs ever loaded.
   */
  // @cpt-dod:cpt-frontx-dod-mfe-isolation-handler-load-cache:p1
  private static loadCache = new Map<string, Promise<MfeEntryLifecycle<ChildMfeBridge>>>();

  readonly bridgeFactory: MfeBridgeFactoryDefault;
  private readonly manifestCache: ManifestCache;
  private readonly config: Required<MfeLoaderConfig>;
  private readonly retryHandler: RetryHandler;
  // LRU-bounded so a long-running host that loads many distinct MFEs cannot
  // grow the cache without limit. Expose-chunk source text has no reuse
  // value after its load settles, so oldest-first eviction is acceptable.
  private readonly sourceTextCache = new LruCache<string, Promise<string>>(
    SOURCE_TEXT_CACHE_CAPACITY,
    (text) => this.settledSourceTexts.has(text),
  );
  /** The requests of `sourceTextCache` that have settled; only those may be evicted. */
  private readonly settledSourceTexts = new WeakSet<Promise<string>>();

  /**
   * Reference to the realm-wide shared-dependency source-text cache,
   * obtained through the internal rendezvous accessor
   * {@link RealmSharedDepTextCacheProvider.getCache} rather than constructed here. The
   * FIELD is instance-held — every `MfeHandlerMF` instance calls the
   * accessor once, at construction — but the CACHE it names is shared
   * realm-wide across every compatible, independently loaded copy of this
   * package: two loads whose deduplication key already agrees that they
   * reuse the same emitted build (`cpt-frontx-adr-shared-dep-reuse`)
   * fetch that build's source text once for the whole realm, not once per
   * handler and not once per copy — including a nested extension host
   * that constructs its own `MfeHandlerMF` from its own independently
   * loaded copy of this package.
   *
   * Keyed on a two-tier scheme: when a shared-dep entry declares a
   * `contentHash`, the key is `name@version@contentHash`; when no
   * `contentHash` is declared, the key falls back to
   * `name@version@<resolved chunk URL>`, so reuse is scoped to that one
   * manifest's own resolved URL rather than shared cross-MFE
   * (`cpt-frontx-adr-shared-dep-reuse`).
   *
   * The realm-wide bound is a byte budget on the retained text, not per
   * handler and not per copy — see `ByteBudgetLruCache` and
   * `RealmSharedDepTextCacheProvider.ts`. Its lifetime is the realm's page
   * lifetime: a resident fulfilled value stays strongly reachable for as long
   * as it survives eviction, and no handler discard, registry disposal,
   * extension unmount, or extension unregistration clears or releases it —
   * there is no retainer count.
   *
   * The rendezvous this cache is reached through is TRUSTED same-realm
   * coordination state, not an authenticity or confidentiality boundary: a
   * structurally conforming entry is adopted whichever same-realm code
   * published it (`cpt-frontx-adr-shared-dep-cache-reach`
   * records this as an accepted consequence, not a gap to close).
   */
  // @cpt-begin:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-hold-reference
  private readonly sharedDepTextCache: SharedDepTextCache;
  // @cpt-end:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-hold-reference

  /**
   * The whole-package half of a load: fetches and mints the shared entries of
   * a manifest that holds neither `units` nor `lists`. Scoped to the handler
   * instance, so the adoption notice it emits for an entry without a
   * `contentHash` fires at most once per pair across every load this handler
   * serves.
   */
  private readonly wholePackageLoader: WholePackageLoader;

  /**
   * Per-handler diagnostics accumulator: warnings deduplicated once per page
   * and the per-load bytes and realm cache totals. Instance-held; assigned in
   * the constructor.
   */
  private readonly loadDiagnostics: LoadDiagnosticsAccumulator;

  constructor(
    handledBaseTypeId: string,
    config: MfeLoaderConfig = {}
  ) {
    super(handledBaseTypeId, 0);
    this.bridgeFactory = new MfeBridgeFactoryDefault();
    this.manifestCache = new ManifestCache();
    this.retryHandler = new RetryHandler();
    this.config = {
      timeout: config.timeout ?? DEFAULT_TIMEOUT_MS,
      retries: config.retries ?? DEFAULT_RETRIES,
      sharedDepTextCacheMaxBytes:
        config.sharedDepTextCacheMaxBytes ??
        DEFAULT_SHARED_DEP_TEXT_CACHE_MAX_BYTES,
    };
    // The realm byte budget comes from this handler's config only when
    // this copy publishes the realm entry first; later handlers adopt the
    // published cache unchanged (ADR-0035).
    this.sharedDepTextCache = RealmSharedDepTextCacheProvider.getCache(
      this.config.sharedDepTextCacheMaxBytes
    );
    this.wholePackageLoader = new WholePackageLoader(
      this.sharedDepTextCache,
      (url, ledger) => this.fetchSharedText(url, ledger),
      new LruCache<string, true>(SHARED_DEP_ADOPTION_NOTICE_CACHE_CAPACITY)
    );
    this.loadDiagnostics = new LoadDiagnosticsAccumulator();
  }

  /**
   * Load an MFE bundle using Module Federation.
   *
   * Cache is keyed by `extensionId` (the extension instance ID), not by
   * `entry.id`. Two extensions sharing the same `entry` definition get
   * distinct cache entries and distinct module evaluations.
   */
  // @cpt-flow:cpt-frontx-flow-mfe-isolation-load:p1
  // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-register
  // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-trigger-load
  async load(
    entry: MfeEntryMF,
    extensionId: string
  ): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-trigger-load
    // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-register
    // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-check-cache
    const cached = MfeHandlerMF.loadCache.get(extensionId);
    // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-check-cache
    // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-if-cached
    if (cached !== undefined) {
      // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-return-cached
      // @cpt-begin:cpt-frontx-state-mfe-isolation-module-lifecycle:p1:inst-remount
      // The same extension instance reuses its load-cache entry: no module
      // is re-evaluated and no blob URL is minted.
      return cached;
      // @cpt-end:cpt-frontx-state-mfe-isolation-module-lifecycle:p1:inst-remount
      // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-return-cached
    }
    // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-if-cached
    // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-else-new-load
    // The timeout wraps the ATTEMPT, inside the retry loop — every retry of
    // a failed attempt is raced against its own fresh budget rather than
    // sharing the first attempt's, so a load's worst-case wall clock is the
    // budget times the attempt count plus `RetryHandler`'s backoff.
    // Each attempt gets its own ledger of the source-text cache entries it
    // waits on, so a timeout releases exactly that attempt's entries and
    // the retry issues its own fetch (see `AttemptSourceTextLedger`).
    // Only a network failure or an expired budget is retried: every other
    // failure is decided by data a repeat attempt cannot change and fails
    // the load at once, without a backoff.
    // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-per-attempt-budget
    const promise = this.retryHandler.retry(
      async () => {
        const ledger = new AttemptSourceTextLedger();
        try {
          return await this.withLoadTimeout(
            this.loadInternal(entry, extensionId, ledger),
            entry.id,
            ledger
          );
        } catch (error) {
          ledger.fail();
          throw error;
        } finally {
          // The attempt has settled: its record of waited-on entries is
          // dropped, so the per-load state's reference to it retains no
          // fetched text (`inst-lto-drop-record-on-settle`).
          ledger.settle();
        }
      },
      this.config.retries,
      INITIAL_RETRY_DELAY_MS,
      (error) => RetryableLoadError.isBranded(error)
    );
    // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-per-attempt-budget
    // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-else-new-load
    // @cpt-begin:cpt-frontx-state-mfe-isolation-module-lifecycle:p1:inst-to-isolated
    MfeHandlerMF.loadCache.set(extensionId, promise);
    // @cpt-end:cpt-frontx-state-mfe-isolation-module-lifecycle:p1:inst-to-isolated
    // On failure, evict so future calls can retry from scratch.
    // Identity check guards against racing with a newer successful load.
    // @cpt-begin:cpt-frontx-state-mfe-isolation-module-lifecycle:p1:inst-load-failed-retry
    // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-evict-raise
    promise.catch(() => {
      if (MfeHandlerMF.loadCache.get(extensionId) === promise) {
        MfeHandlerMF.loadCache.delete(extensionId);
      }
    });
    // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-evict-raise
    // @cpt-end:cpt-frontx-state-mfe-isolation-module-lifecycle:p1:inst-load-failed-retry
    // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-return-lifecycle
    return promise;
    // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-return-lifecycle
  }

  /**
   * Race a single load attempt against `this.config.timeout`.
   *
   * Without a race against a timer, `RetryHandler.retry` only retries on a
   * thrown error, so a load that hangs (network never resolves, a dependency
   * cycle, etc.) leaves the returned promise pending forever. Racing the
   * attempt against a timer converts that into BOUNDED FAILURE: after a
   * known wall-clock budget the caller gets a diagnostic `RetryableLoadError`
   * (an `MfeLoadError`) instead of a promise that never settles; an expired
   * budget is one of the two failures that are retried.
   *
   * The race is also a recovery path, not only a bound.
   * {@link fetchSourceText} stores the in-flight fetch promise in the
   * handler-level, URL-keyed `sourceTextCache` (and the whole-package and
   * list paths do the same in the realm `sharedDepTextCache`) and evicts it
   * only when that promise REJECTS, so a fetch that never settles would never
   * be evicted and every retry would rejoin the same hung promise and expire
   * against its own budget in turn. On expiry this method therefore releases
   * the entries the abandoned attempt was waiting on, through that attempt's
   * {@link AttemptSourceTextLedger} and under the same identity check the
   * eviction-on-rejection uses, so the next attempt issues its own fetch and
   * can actually succeed. The release also marks the attempt failed, so the
   * abandoned chain build starts no further fetch and publishes nothing.
   *
   * Releasing those cache entries is not cancellation: nothing is aborted —
   * no `AbortController` is plumbed through this file — so a timed-out
   * attempt's in-flight work runs to completion and its results are simply
   * never observed by this call.
   *
   * A timeout of `0` is the conventional "disable the timeout" idiom, so it —
   * and any other non-positive value — is treated as "no timeout" below
   * rather than as a zero-delay timer that would fail every attempt
   * immediately.
   *
   * This method races ONE attempt, not one `load()` call: `RetryHandler`
   * wraps every retry of a failed attempt in its own call to this method, so
   * a single `load()` call's worst-case wall clock is roughly
   * `timeout × (retries + 1)` plus the backoff between attempts.
   */
  private withLoadTimeout<T>(
    attempt: Promise<T>,
    entryId: string,
    ledger?: AttemptSourceTextLedger
  ): Promise<T> {
    // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-read-budget
    const timeoutMs = this.config.timeout;
    // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-read-budget
    // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-if-disabled
    if (timeoutMs <= 0) {
      // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-return-unraced
      return attempt;
      // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-return-unraced
    }
    // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-if-disabled

    let timer: ReturnType<typeof setTimeout>;
    // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-if-elapsed
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-raise-timeout
        reject(
          new RetryableLoadError(
            `MFE load for '${entryId}' timed out after ${timeoutMs}ms`,
            entryId
          )
        );
        // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-raise-timeout
        // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-release-abandoned-source-text
        // What IS given up is this attempt's claim on the source-text
        // cache entries it was waiting on: released (identity-checked,
        // never cancelled) so the retry issues its own fetch instead of
        // rejoining the abandoned attempt's hung one.
        ledger?.release();
        // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-release-abandoned-source-text
      }, timeoutMs);
    });
    // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-if-elapsed

    // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-race-attempt
    // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-return-attempt
    // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-no-cancel
    // The race abandons the losing attempt's result and aborts nothing: its
    // fetches and blob URL construction keep running to completion, their
    // results simply never observed by this call (the retention invariant
    // of ADR-0004).
    return Promise.race([attempt, timeout]).finally(() => clearTimeout(timer));
    // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-no-cancel
    // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-return-attempt
    // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-race-attempt
  }

  /**
   * Internal load implementation.
   * Each call creates a fully isolated module evaluation chain via blob URLs.
   */
  private async loadInternal(
    entry: MfeEntryMF,
    extensionId: string,
    ledger?: AttemptSourceTextLedger
  ): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-resolve-registered-manifest
    // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-resolve-manifest
    const manifest = await this.resolveManifest(entry.manifest);
    // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-resolve-manifest
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-resolve-registered-manifest

    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-trigger-load
    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-read-contract-fields
    const { moduleFactory, stylesheetPaths, baseUrl } = await this.loadExposedModuleIsolated(
      manifest,
      entry.exposedModule,
      entry.exposeAssets,
      entry.id,
      extensionId,
      ledger
    );
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-read-contract-fields
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-trigger-load

    const loadedModule = moduleFactory();

    // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-if-bad-lifecycle
    if (!this.isValidLifecycleModule(loadedModule)) {
      throw new MfeLoadError(
        `Module '${entry.exposedModule}' must implement MfeEntryLifecycle interface (mount/unmount)`,
        entry.id
      );
    }
    // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-if-bad-lifecycle

    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-return-lifecycle
    return this.wrapLifecycleWithStylesheets(
      loadedModule,
      stylesheetPaths,
      baseUrl
    );
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-return-lifecycle
  }

  /**
   * Load an exposed module with full per-runtime isolation.
   *
   * Creates a per-load blob URL chain:
   *  1. Shared dep standalone ESM files are blob-URL'd first (leaves first, dependency order)
   *  2. The expose chunk and all its static deps are blob-URL'd with bare specifiers
   *     rewritten to shared dep blob URLs
   *
   * baseUrl is derived from manifest.metaData.publicPath rather than parsing
   * remoteEntry.js — the publicPath field gives the exact chunk base URL.
   *
   * Blob URLs are NOT revoked — modules with top-level await continue
   * evaluating after import() resolves, and revoking during async evaluation
   * causes ERR_FILE_NOT_FOUND. Blob URLs are cleaned up by the browser on
   * page unload.
   */
  private async loadExposedModuleIsolated(
    manifest: MfManifest,
    exposedModule: string,
    exposeAssets: MfeEntryMF['exposeAssets'],
    entryId: string,
    extensionId: string,
    ledger?: AttemptSourceTextLedger
  ): Promise<{
    moduleFactory: () => unknown;
    stylesheetPaths: string[];
    baseUrl: string;
  }> {
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-read-public-path
    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-derive-base-url
    // publicPath, resolved once to an absolute directory URL, is the
    // authoritative base URL for all chunks in this MFE.
    this.assertResolvedPublicPath(manifest.metaData.publicPath, entryId);
    const baseUrl = this.resolvePublicPath(manifest.metaData.publicPath, entryId);
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-derive-base-url
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-read-public-path

    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-read-expose-chunk
    // The entry module is the first element of the entry's own list.
    // Refused before any fetch: the refusal depends only on the manifest, so
    // it is not retried.
    const exposeChunkFilename = exposeAssets.js.sync[0];
    if (!exposeChunkFilename) {
      throw MfeHandlerMF.manifestDataRejection(
        `Cannot resolve expose chunk for '${exposedModule}': exposeAssets.js.sync is empty`,
        entryId
      );
    }
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-read-expose-chunk

    // The entry module's identity is its resolved URL, as for every chunk of
    // the load, however `exposeAssets` spells it.
    const entryKey = MfeHandlerMF.chunkKey(baseUrl, exposeChunkFilename);

    // Build shared dep blob URLs first (leaves first, dependency order).
    // Each dep's standalone ESM may import other shared deps as bare specifiers;
    // those are rewritten to already-resolved blob URLs before creating the blob.
    // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-build-shared-blobs
    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-run-manifest-discovery
    // @cpt-begin:cpt-frontx-state-mfe-isolation-load-blob-state:p1:inst-blob-shared-failed
    const {
      urls: sharedDepBlobUrls,
      sharedDepLists,
      entrySource,
      bindWholePackageLoad,
    } = await this.buildSharedDepBlobUrls(
      manifest,
      baseUrl,
      entryId,
      extensionId,
      exposedModule,
      exposeChunkFilename,
      ledger
    );
    // @cpt-end:cpt-frontx-state-mfe-isolation-load-blob-state:p1:inst-blob-shared-failed
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-run-manifest-discovery
    // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-build-shared-blobs

    // @cpt-begin:cpt-frontx-state-mfe-isolation-load-blob-state:p1:inst-blob-building
    const loadState: LoadBlobState = {
      blobUrlMap: new Map(),
      inFlight: new Map(),
      baseUrl,
      entryId,
      sharedDepBlobUrls,
      declaredSpecifiers:
        sharedDepLists !== undefined
          ? sharedDepLists.ctx.declaredSpecifiers
          : new Set((manifest.shared ?? []).map((d) => d.name)),
      entryChunkFilename: entryKey,
      attemptLedger: ledger,
      sharedDepLists,
      entrySource,
    };
    // @cpt-end:cpt-frontx-state-mfe-isolation-load-blob-state:p1:inst-blob-building
    bindWholePackageLoad?.(loadState);
    if (sharedDepLists !== undefined) {
      sharedDepLists.ownChunkMinted.has = (location) =>
        loadState.blobUrlMap.has(MfeHandlerMF.chunkKey(baseUrl, location));
    }

    // Fresh per-build failure token for this chain build (see
    // `ChainBuildState`) — scoped to this one expose-chunk build, not to
    // `loadState`, which lives for the whole page-lifetime load.
    const build = createChainBuildState(sharedDepLists === undefined, false, ledger);

    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-read-css
    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-collect-css
    // Collect CSS paths from exposeAssets (sync injected at mount; async lazy).
    const stylesheetPaths = [
      ...exposeAssets.css.sync,
      ...exposeAssets.css.async,
    ];
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-collect-css
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-read-css

    // Build blob URL chain for the expose chunk and all its static deps.
    // Bare specifiers within those chunks are rewritten to shared dep blob URLs.
    // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-build-expose-chain
    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-rewrite-expose-chunk
    // @cpt-begin:cpt-frontx-state-mfe-isolation-load-blob-state:p1:inst-blob-failed
    await this.createBlobUrlChain(loadState, entryKey, build);
    // @cpt-end:cpt-frontx-state-mfe-isolation-load-blob-state:p1:inst-blob-failed
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-rewrite-expose-chunk
    // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-build-expose-chain

    const exposeBlobUrl = loadState.blobUrlMap.get(entryKey);
    if (!exposeBlobUrl) {
      throw new MfeLoadError(
        `Failed to create blob URL for expose chunk '${entryKey}'`,
        entryId
      );
    }

    // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-import-expose
    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-import-expose-chunk
    const exposeModule = await DynamicModuleOps.importBlobModule(exposeBlobUrl);
    // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-import-expose

    // @cpt-begin:cpt-frontx-state-mfe-isolation-load-blob-state:p1:inst-blob-complete
    // The expose chunk exports the lifecycle object as `default`. Fall back to
    // the full module if default is absent (non-MF ESM expose pattern).
    const moduleRecord = exposeModule as Record<string, unknown>;
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-import-expose-chunk
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-return
    return {
      moduleFactory: () => moduleRecord['default'] ?? exposeModule,
      stylesheetPaths,
      baseUrl,
    };
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-return
    // @cpt-end:cpt-frontx-state-mfe-isolation-load-blob-state:p1:inst-blob-complete
  }

  /**
   * Resolve `manifest.metaData.publicPath` to an absolute base URL, once per
   * load. A relative value ('/' or a document-relative path) is valid
   * manifest data and resolves against the host document's base URL;
   * resolving it here makes every URL derived from it (chunk chain, shared
   * deps, the `import.meta.url` rewrite, stylesheets) absolute, so it no
   * longer depends on the document URL at fetch or mount time. An absolute
   * publicPath resolves without reading the document, so a realm without one
   * can still load it. The empty string names the document's directory, so
   * it resolves as `'./'` rather than to the document URL. The resolved URL
   * must be http(s): an opaque URL such as data:, blob: or javascript: has no
   * directory to join chunk paths under, and no other scheme serves the
   * chunks. The returned base always ends with '/' and carries no query or
   * hash.
   */
  private resolvePublicPath(publicPath: string, entryId: string): string {
    const resolved = this.resolvePublicPathUrl(publicPath, entryId);
    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-if-manifest-invalid
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      throw MfeHandlerMF.manifestDataRejection(
        `manifest.metaData.publicPath "${publicPath}" is not an http(s) URL.`,
        entryId
      );
    }
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-if-manifest-invalid
    return AssetBaseUrl.directory(resolved);
  }

  /** `publicPath` resolved to an absolute URL, against the document if relative. */
  private resolvePublicPathUrl(publicPath: string, entryId: string): URL {
    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-if-manifest-invalid
    // The handler trusts registered manifests (see {@link resolveManifest});
    // a non-string here would be resolved by `new URL(undefined, base)`.
    if (typeof (publicPath as unknown) !== 'string') {
      throw MfeHandlerMF.manifestDataRejection(
        `manifest.metaData.publicPath ${String(publicPath)} is not a string.`,
        entryId
      );
    }
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-if-manifest-invalid
    const value = publicPath === '' ? './' : publicPath;
    const absolute = AssetBaseUrl.parse(value);
    if (absolute) {
      return absolute;
    }
    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-if-manifest-invalid
    if (AssetBaseUrl.hasScheme(value)) {
      throw MfeHandlerMF.manifestDataRejection(
        `manifest.metaData.publicPath "${publicPath}" is not a valid URL.`,
        entryId
      );
    }
    // `typeof` keeps a realm without `document` from throwing a ReferenceError.
    if (typeof document === 'undefined' || !document) {
      throw MfeHandlerMF.manifestDataRejection(
        `manifest.metaData.publicPath "${publicPath}" is relative and there is ` +
          `no document to resolve it against; use an absolute URL.`,
        entryId
      );
    }
    const resolved = AssetBaseUrl.parse(value, document.baseURI);
    if (!resolved) {
      throw MfeHandlerMF.manifestDataRejection(
        `manifest.metaData.publicPath "${publicPath}" is not a valid URL.`,
        entryId
      );
    }
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-if-manifest-invalid
    return resolved;
  }

  /**
   * A load error for manifest data the handler refuses: an unresolvable or
   * non-http(s) `publicPath`, the unresolved `"auto"` placeholder, a
   * `sharedBase` or location outside its rules, or an empty
   * `exposeAssets.js.sync`. The refusal depends only on the manifest, so it
   * is not a network failure and the load is not retried.
   */
  private static manifestDataRejection(message: string, entryId: string): MfeLoadError {
    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-manifest-invalid-fail
    return new MfeLoadError(message, entryId);
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-manifest-invalid-fail
  }

  /**
   * Guard against Module Federation's unresolved `"auto"` publicPath
   * placeholder reaching the fetch layer.
   *
   * `MfManifestMetaData.publicPath` is documented (and by the handler's own
   * contract, at {@link loadExposedModuleIsolated}) as an already-resolved
   * absolute URL or `'/'` — never the literal string MF 2.0 emits when a
   * remote's `vite.config.ts` does not set an explicit `publicPath` (MF's
   * own runtime resolves `"auto"` from the script tag that loaded
   * `remoteEntry.js`; this handler never loads `remoteEntry.js` at all, so
   * that resolution point does not exist here — see the file header comment).
   *
   * The handler has no channel to recover the real origin at this point:
   * `manifest` is looked up by the ID the `MfeEntryMF` carries, from an
   * in-process cache or the registry (see {@link resolveManifest}), with no fetch
   * response / page-relative context carried alongside it. Resolving
   * `"auto"` to a concrete origin is therefore the responsibility of
   * whatever produces the `MfManifest` (e.g. a build-time manifest
   * aggregator) — NOT this handler.
   *
   * Without this guard, `"auto"`/`"auto/"` gets silently concatenated into
   * every chunk fetch URL, producing a same-origin relative request that a
   * Vite dev server's SPA fallback answers with a 200 index.html — a load
   * failure that looks like a `SyntaxError` deep in module evaluation
   * instead of a clear, fail-fast diagnostic at the point of the actual
   * misconfiguration.
   */
  private assertResolvedPublicPath(publicPath: string, entryId: string): void {
    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-if-manifest-invalid
    if (publicPath === 'auto' || publicPath === 'auto/') {
      throw MfeHandlerMF.manifestDataRejection(
        `manifest.metaData.publicPath is the unresolved Module Federation ` +
          `placeholder "${publicPath}". This handler requires an already-` +
          `resolved absolute URL (or '/') — resolve "auto" to the MFE's real ` +
          `serving origin when producing the MfManifest (e.g. in the build-time ` +
          `manifest generator), not at handler load time.`,
        entryId
      );
    }
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-if-manifest-invalid
  }

  // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-validate-lifecycle
  private isValidLifecycleModule(
    module: unknown
  ): module is MfeEntryLifecycle<ChildMfeBridge> {
    if (typeof module !== 'object' || module === null) {
      return false;
    }
    const candidate = module as Record<string, unknown>;
    return (
      typeof candidate.mount === 'function' &&
      typeof candidate.unmount === 'function'
    );
  }
  // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-validate-lifecycle

  // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-cache-promise
  private wrapLifecycleWithStylesheets(
    lifecycle: MfeEntryLifecycle<ChildMfeBridge>,
    stylesheetPaths: string[],
    baseUrl: string
  ): MfeEntryLifecycle<ChildMfeBridge> {
    if (stylesheetPaths.length === 0) {
      return lifecycle;
    }

    return {
      // @cpt-begin:cpt-frontx-state-mfe-isolation-module-lifecycle:p1:inst-to-active
      // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-wrap-mount-synchronous
      // Synchronous on purpose: the mount manager's rendezvous window covers
      // only the synchronous part of this call, so any await before the MFE's
      // own mount would close it and a registry built there would come up as
      // a root. The link elements are appended before the MFE renders and
      // their loading is not awaited, so first paint does not wait on it.
      // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-actor-mount
      mount: (container, bridge, mountContext) => {
        this.injectRemoteStylesheets(container, stylesheetPaths, baseUrl);
        return lifecycle.mount(container, bridge, mountContext);
      },
      // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-actor-mount
      // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-wrap-mount-synchronous
      // @cpt-end:cpt-frontx-state-mfe-isolation-module-lifecycle:p1:inst-to-active
      // @cpt-begin:cpt-frontx-state-mfe-isolation-module-lifecycle:p1:inst-to-disposed
      // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-wrap-unmount-styles-last
      // The host keeps the container attached while an asynchronous unmount
      // is pending, so the stylesheets must outlive the MFE's own unmount or
      // the MFE stays on screen unstyled until it is gone. The `finally`
      // removes them even when that unmount throws.
      unmount: async (container) => {
        try {
          await lifecycle.unmount(container);
        } finally {
          this.removeInjectedStylesheets(container);
        }
      },
      // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-wrap-unmount-styles-last
      // @cpt-end:cpt-frontx-state-mfe-isolation-module-lifecycle:p1:inst-to-disposed
    };
  }
  // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-cache-promise

  private injectRemoteStylesheets(
    container: Element | ShadowRoot,
    stylesheetPaths: string[],
    baseUrl: string
  ): void {
    // `baseUrl` is already absolute: `resolvePublicPath` resolved a relative
    // publicPath against `document.baseURI` once, at load time, so the
    // stylesheets name the same directory as the chunk fetches. Resolving it
    // against `document.baseURI` again returns it unchanged.
    const base = new URL(baseUrl, document.baseURI);
    stylesheetPaths.forEach((path, index) => {
      const targetId = `${RUNTIME_STYLE_ID_PREFIX}${index}`;
      this.upsertStyleElement(
        container,
        { href: new URL(path, base).href },
        targetId
      );
    });
  }

  private removeInjectedStylesheets(container: Element | ShadowRoot): void {
    const injectedStyles = container.querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
      `link[id^="${RUNTIME_STYLE_ID_PREFIX}"], style[id^="${RUNTIME_STYLE_ID_PREFIX}"]`
    );
    injectedStyles.forEach((styleElement) => styleElement.remove());
  }

  private upsertStyleElement(
    container: Element | ShadowRoot,
    stylesheet: { css?: string; href?: string },
    id: string
  ): void {
    let styleElement: HTMLLinkElement | HTMLStyleElement | null = null;
    if ('getElementById' in container && typeof container.getElementById === 'function') {
      styleElement = container.getElementById(id) as HTMLLinkElement | HTMLStyleElement | null;
    } else if (container instanceof Element) {
      styleElement = container.querySelector(`[id="${id}"]`);
    }

    if (stylesheet.href) {
      if (!styleElement || styleElement.tagName !== 'LINK') {
        styleElement?.remove();
        const linkElement = document.createElement('link');
        linkElement.id = id;
        linkElement.rel = 'stylesheet';
        container.appendChild(linkElement);
        styleElement = linkElement;
      }

      const linkElement = styleElement as HTMLLinkElement;
      linkElement.href = stylesheet.href;
      return;
    }

    if (!styleElement || styleElement.tagName !== 'STYLE') {
      styleElement?.remove();
      const inlineStyleElement = document.createElement('style');
      inlineStyleElement.id = id;
      container.appendChild(inlineStyleElement);
      styleElement = inlineStyleElement;
    }

    styleElement.textContent = stylesheet.css ?? '';
  }

  /**
   * Resolve the registered manifest an entry references by its identifier
   * (looks up from cache, then from the registry-supplied type system).
   * Schema validation is the type system plugin's responsibility — the
   * handler trusts registered manifests are valid.
   */
  private async resolveManifest(manifestRef: string): Promise<MfManifest> {
    // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-manifest-by-id
    const cached = this.manifestCache.getManifest(manifestRef);
    if (cached) {
      return cached;
    }

    // The entry carries the manifest's id, not the document — so the cache
    // only answers for remotes some earlier load already pulled in. The
    // plugin arrives at registration, so an unregistered handler has none and
    // stops here.
    const fromTypeSystem = this.typeSystem?.getSchema(manifestRef);
    if (isMfManifest(fromTypeSystem)) {
      this.manifestCache.cacheManifest(fromTypeSystem);
      return fromTypeSystem;
    }
    // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-manifest-by-id

    // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-manifest-unresolved-raise
    // The registry answers the same on every attempt, so the failure is not
    // retried.
    throw new MfeLoadError(
      `Manifest '${manifestRef}' not found: it is not registered with the type ` +
        'system of the registry this handler is registered into.',
      manifestRef
    );
    // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-manifest-unresolved-raise
  }

  // ---- Shared dep blob URL construction ----

  // @cpt-algo:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1
  /**
   * Build the load's shared-dependency blob URLs. A manifest that holds
   * `units` or `lists` takes the fetch-list path, one round for the exposed
   * module's list; a manifest that holds neither takes the whole-package
   * path ({@link WholePackageLoader}), one standalone file per declared
   * `shared[]` entry.
   *
   * On the fetch-list path the entry chunk's source request is started here,
   * in the round of the list's units and own chunks, and its promise is
   * returned as `entrySource` for the load to hand to the entry chunk's
   * build; the whole-package path starts no entry request and returns none.
   */
  private async buildSharedDepBlobUrls(
    manifest: MfManifest,
    baseUrl: string,
    entryId: string,
    extensionId: string,
    exposedModule: string,
    exposeChunkFilename: string,
    ledger?: AttemptSourceTextLedger
  ): Promise<{
    urls: Map<string, string>;
    sharedDepLists?: SharedDepListLoadContext;
    entrySource?: Promise<string>;
    bindWholePackageLoad?: (loadState: LoadBlobState) => void;
  }> {
    // `sources`/`sharedDepBlobUrls` are keyed by bare `dep.name`. Two shared
    // entries with the same name but different versions would silently
    // overwrite one another in the name-keyed maps, and re-keying every map
    // to `name@version` would ripple through the bare-specifier rewrite,
    // which needs the bare name. Failing fast on a same-name collision is
    // the smaller, targeted fix.
    this.assertUniqueSharedDepNames(manifest, entryId);
    // @cpt-begin:cpt-frontx-algo-unit-format-contract-fetch-list-schema:p1:inst-return-contract-output
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-read-unit-fields
    const entryList = manifest.lists?.[exposedModule];
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-read-unit-fields
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-if-fetch-list
    if (entryList !== undefined) {
      return this.buildListSharedDepBlobUrls(
        manifest,
        baseUrl,
        entryId,
        entryList,
        exposeChunkFilename,
        ledger
      );
    }
    // A manifest that holds units or lists names every list its entries
    // load: an exposed module without one is manifest data the handler
    // refuses, naming the missing key, and never a whole-package load.
    if (manifest.units !== undefined || manifest.lists !== undefined) {
      throw MfeHandlerMF.manifestDataRejection(
        `manifest "${manifest.id}" holds units or lists but no list for ` +
          `exposed module "${exposedModule}" (lists["${exposedModule}"] is missing).`,
        entryId
      );
    }
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-if-fetch-list
    // @cpt-end:cpt-frontx-algo-unit-format-contract-fetch-list-schema:p1:inst-return-contract-output
    const wholePackage = await this.wholePackageLoader.load(
      manifest,
      baseUrl,
      entryId,
      extensionId,
      ledger
    );
    return {
      urls: wholePackage.urls,
      bindWholePackageLoad: (loadState) =>
        wholePackage.bindLazyTarget((filename) =>
          this.resolveLazyTarget(filename, loadState, true)
        ),
    };
  }

  /**
   * The fetch-list path: the exposed module's list is read from the
   * registered manifest, and in one round the entry chunk's source, every
   * list unit missing from the realm text cache and the list's own chunks
   * are requested together; the units mint per load in dependency order
   * (`cpt-frontx-adr-shared-dep-reuse`). No graph discovery. The entry
   * chunk's source is returned as `entrySource`; once any request of the
   * round fails, the load issues no further request.
   */
  private async buildListSharedDepBlobUrls(
    manifest: MfManifest,
    baseUrl: string,
    entryId: string,
    entryList: SharedDepFetchList,
    exposeChunkFilename: string,
    ledger?: AttemptSourceTextLedger
  ): Promise<{
    urls: Map<string, string>;
    sharedDepLists?: SharedDepListLoadContext;
    entrySource?: Promise<string>;
  }> {
    let assetBase = baseUrl;
    const sharedBase = manifest.metaData.sharedBase;
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-resolve-shared-base
    if (sharedBase !== undefined) {
      const resolvedBase =
        typeof sharedBase === 'string' &&
        !sharedBase.startsWith('//') &&
        !AssetBaseUrl.hasUnsafeCharacter(sharedBase)
          ? AssetBaseUrl.parse(sharedBase, baseUrl)
          : undefined;
      if (resolvedBase === undefined || !/^https?:$/i.test(resolvedBase.protocol)) {
        throw MfeHandlerMF.manifestDataRejection(
          `manifest.metaData.sharedBase "${String(sharedBase)}" does not ` +
            'resolve to an http(s) URL — shared-file locations cannot be ' +
            'resolved against it.',
          entryId
        );
      }
      assetBase = AssetBaseUrl.directory(resolvedBase);
    }
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-resolve-shared-base
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-resolve-location
    const resolveAssetUrl = (location: string): string =>
      SharedAssetUrlResolver.resolve(location, assetBase, entryId);
    // Every unit location is a manifest field: a refused one fails the load
    // before any request of it.
    for (const unit of manifest.units ?? []) resolveAssetUrl(unit.location);
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-resolve-location
    // Every content identity the exposed module's list names, and those of
    // every lazy and pattern list it reaches, is held by the unit table: a
    // list naming one the table lacks is refused before any request of the
    // load.
    MfeHandlerMF.assertListUnitsHeld(manifest, entryList, entryId);
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-fetch-entry-concurrent
    // The entry module's source is requested in the same round as the
    // list's units and own chunks: every location is known from the
    // manifest alone, so the entry request waits for neither the unit batch
    // nor any minting. It is the last file the mount waits on, hence high
    // priority.
    const entrySource = this.fetchSourceText(
      MfeHandlerMF.resolveChunkUrl(baseUrl, exposeChunkFilename),
      ledger,
      'high'
    );
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-fetch-entry-concurrent
    // The guard watches the entry request's outcome only, never its text, so
    // the closures the lazy-loader registry keeps alive hold no entry text.
    const requests = MfeHandlerMF.concurrentRequestGuard(
      entrySource.then(() => undefined)
    );
    // A failed load's gated request must not be published to the realm cache
    // either: a load joining it there would see this load's error.
    const loadCache: SharedDepTextCache = {
      get: (key) => this.sharedDepTextCache.get(key),
      set: (key, value) => {
        if (requests.failure() === undefined) {
          this.sharedDepTextCache.set(key, value);
        }
      },
      delete: (key) => this.sharedDepTextCache.delete(key),
    };
    const loader = new SharedDepListLoader(
      (url: string) => {
        // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-concurrent-failure
        // Once the load has failed, no request is issued for it — not even
        // the retry of a joined fetch another load's rejection triggers.
        const failed = requests.failure();
        if (failed !== undefined) return Promise.reject(failed.error);
        // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-concurrent-failure
        return this.fetchSharedText(url, ledger);
      },
      entryId,
      loadCache,
      ledger
    );
    // An own chunk of the list's `ownChunks` is requested by location
    // against the asset base through the handler source-text cache, never
    // the realm cache; the chain build joins this entry. Once the load
    // has failed no request is issued for it.
    const ownChunkTexts = new Map<string, Promise<string>>();
    // Bound to the load's minted chunks once its state exists.
    const ownChunkMinted: { has: (location: string) => boolean } = {
      has: () => false,
    };
    const fetchOwnChunk = (location: string): Promise<unknown> => {
      if (typeof location !== 'string') {
        return Promise.reject(
          new MfeLoadError(
            `fetch-list ownChunks entry ${JSON.stringify(location)} is not a string.`,
            entryId
          )
        );
      }
      const failed = requests.failure();
      if (failed !== undefined) return Promise.reject(failed.error);
      // An attempt that was released or failed issues no request of its own
      // and publishes nothing: a fetch it started could never be recorded
      // for release.
      if (ledger?.hasFailed === true) {
        return Promise.reject(MfeHandlerMF.endedAttempt(location, entryId));
      }
      // A chunk the load already minted needs no text, and one already
      // requested for it is joined rather than requested again; the two
      // spellings of one URL name one chunk.
      if (ownChunkMinted.has(location)) return Promise.resolve(undefined);
      const url = MfeHandlerMF.resolveChunkUrl(baseUrl, location);
      const inFlight = ownChunkTexts.get(url);
      if (inFlight !== undefined) return inFlight;
      const text = this.fetchSourceText(url, ledger);
      ownChunkTexts.set(url, text);
      // A failed request leaves no hand-off behind, so a later lazy import
      // of the same chunk requests it afresh instead of re-awaiting the
      // rejected promise.
      text.catch(() => {
        if (ownChunkTexts.get(url) === text) ownChunkTexts.delete(url);
      });
      return text;
    };
    const ctx = loader.createContext(
      manifest.units ?? [],
      manifest.lists ?? {},
      resolveAssetUrl
    );
    // The dynamic-import machinery closes over `sharedDepLists`: the
    // resolver mints dependent lists on demand through the same load's
    // context; the stub URL mints on first rewritten call.
    let unitLoaderUrl: string | undefined;
    const sharedDepLists: SharedDepListLoadContext = {
      loader,
      ctx,
      entryId,
      assetBase,
      resolveAssetUrl,
      fetchOwnChunk,
      ownChunkTexts,
      ownChunkMinted,
      dynamicImports: {
        loaderUrl: () => {
          if (unitLoaderUrl === undefined) {
            const registry = LazyLoaderRegistry.ensureExposed();
            const loaderId = registry.register((argument) =>
              this.resolveListImport(argument, sharedDepLists)
            );
            unitLoaderUrl = URL.createObjectURL(
              new Blob([DynamicModuleOps.buildLazyLoaderStubSource(loaderId)], {
                type: 'text/javascript',
              })
            );
          }
          return unitLoaderUrl;
        },
      },
    };
    const itemBytes = await requests.guard(
      loader.loadList(
        ctx,
        entryList,
        resolveAssetUrl,
        sharedDepLists.dynamicImports,
        fetchOwnChunk
      )
    );
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-load-diagnostic
    this.loadDiagnostics.summarize(
      manifest.id,
      itemBytes,
      this.sharedDepTextCache
    );
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-load-diagnostic
    return { urls: ctx.specifierToBlob, sharedDepLists, entrySource };
  }

  /**
   * Refuse, before any request of the load, a fetch list reachable from
   * `entryList` — through the keys of its `lazy` and `patterns` arrays —
   * that names a content identity the manifest's unit table does not hold,
   * an own-chunk location that is not a non-empty string, or a list key that
   * is not a non-empty string
   * (`cpt-frontx-flow-mfe-loading-on-demand-load`, `inst-if-manifest-invalid`).
   */
  private static assertListUnitsHeld(
    manifest: MfManifest,
    entryList: SharedDepFetchList,
    entryId: string
  ): void {
    const held = new Set((manifest.units ?? []).map((unit) => unit.contentHash));
    const lists = manifest.lists ?? {};
    const visited = new Set<SharedDepFetchList>();
    const pending = [entryList];
    for (let list = pending.pop(); list !== undefined; list = pending.pop()) {
      if (visited.has(list)) continue;
      visited.add(list);
      // @cpt-begin:cpt-frontx-algo-unit-format-contract-fetch-list-schema:p1:inst-emit-items
      for (const hash of list.units) {
        if (!held.has(hash)) {
          throw MfeHandlerMF.manifestDataRejection(
            `a fetch list of manifest "${manifest.id}" names content identity ` +
              `${hash}, which the manifest's unit table does not hold.`,
            entryId
          );
        }
      }
      // @cpt-end:cpt-frontx-algo-unit-format-contract-fetch-list-schema:p1:inst-emit-items
      // Own-chunk locations resolve like an `exposeAssets` entry: a
      // non-empty string, a path against `publicPath` or an absolute
      // http(s) URL. A refused one fails the load before any request.
      // @cpt-begin:cpt-frontx-algo-unit-format-contract-fetch-list-schema:p1:inst-emit-own-chunks
      for (const location of list.ownChunks) {
        if (typeof location !== 'string' || location === '') {
          throw MfeHandlerMF.manifestDataRejection(
            `a fetch list of manifest "${manifest.id}" has ownChunks entry ` +
              `${JSON.stringify(location)}, which is not a non-empty string.`,
            entryId
          );
        }
      }
      // @cpt-end:cpt-frontx-algo-unit-format-contract-fetch-list-schema:p1:inst-emit-own-chunks
      // @cpt-begin:cpt-frontx-algo-unit-format-contract-fetch-list-schema:p1:inst-emit-lazy-lists
      for (const key of [...(list.lazy ?? []), ...(list.patterns ?? [])]) {
        // @cpt-begin:cpt-frontx-algo-unit-format-contract-fetch-list-schema:p1:inst-emit-lazy-key-validation
        if (typeof key !== 'string' || key === '') {
          throw MfeHandlerMF.manifestDataRejection(
            `a fetch list of manifest "${manifest.id}" names list key ` +
              `${JSON.stringify(key)}, which is not a non-empty string.`,
            entryId
          );
        }
        // @cpt-end:cpt-frontx-algo-unit-format-contract-fetch-list-schema:p1:inst-emit-lazy-key-validation
        // A list is held under its key whatever the key's form: a chunk
        // location or a bare specifier.
        // @cpt-begin:cpt-frontx-algo-unit-format-contract-fetch-list-schema:p1:inst-emit-lazy-chunk-keys
        // @cpt-begin:cpt-frontx-algo-unit-format-contract-fetch-list-schema:p1:inst-emit-bare-lazy-keys
        // @cpt-begin:cpt-frontx-algo-unit-format-contract-fetch-list-schema:p1:inst-emit-pattern-lists
        const nested = lists[key];
        if (nested !== undefined) pending.push(nested);
        // @cpt-end:cpt-frontx-algo-unit-format-contract-fetch-list-schema:p1:inst-emit-pattern-lists
        // @cpt-end:cpt-frontx-algo-unit-format-contract-fetch-list-schema:p1:inst-emit-bare-lazy-keys
        // @cpt-end:cpt-frontx-algo-unit-format-contract-fetch-list-schema:p1:inst-emit-lazy-chunk-keys
      }
      // @cpt-end:cpt-frontx-algo-unit-format-contract-fetch-list-schema:p1:inst-emit-lazy-lists
    }
  }

  /**
   * The resolver behind every `__frontx_lazy(...)` call minted into a
   * list item of this load: the argument names the calling item's
   * location and the requested path, which resolve against the shared
   * base to the target's location, the key the load's `lazy`/`patterns`
   * records carry (`inst-lai-resolve-relative-path`).
   */
  // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-when-exercised
  // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-resolve-relative-path
  private resolveListImport(
    argument: string,
    sharedDepLists: SharedDepListLoadContext
  ): Promise<string> {
    const { loader, ctx, entryId } = sharedDepLists;
    const fail = (detail: string): Promise<string> =>
      Promise.reject(new MfeLoadError(detail, entryId));
    const split = UnitDynamicImportRewriter.splitCallerArgument(argument);
    if (split === undefined) {
      return fail(`__frontx_lazy: unresolvable argument '${argument}'`);
    }
    const { caller, path } = split;
    const bare = MfeHandlerMF.isBareSpecifier(path);
    // A bare specifier is its own key: a unit already answering it is the
    // target, and no other base applies to it. A relative path resolves
    // against the caller; any other path (an absolute URL, a rooted path)
    // is already a location and is its own key.
    const key =
      !bare && (path.startsWith('./') || path.startsWith('../'))
        ? SharedDepListMinter.resolveLocation(caller, path)
        : path;
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-resolve-relative-path
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-if-cached
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-return-cached
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-bare-cached
    const minted = bare
      ? ctx.specifierToBlob.get(key)
      : loader.blobForKey(ctx, key);
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-bare-cached
    if (minted !== undefined) return Promise.resolve(minted);
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-return-cached
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-if-cached
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-find-target-list
    const hasList = ctx.dependentLists.has(key);
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-find-target-list
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-if-no-list
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-if-shared-caller
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-shared-no-list-fail
    if (!hasList) {
      return fail(
        `__frontx_lazy: '${key}', imported by shared unit '${caller}', ` +
          `matches no lazy-target fetch list of the load for '${entryId}'; ` +
          'a shared unit cannot load a target it has no list for.'
      );
    }
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-shared-no-list-fail
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-if-shared-caller
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-if-no-list
    // A shared-unit target requests no own chunk: its unit joins the
    // list's round.
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-resolve-bare-specifier
    return MfeHandlerMF.resolveListedTarget(sharedDepLists, key, bare);
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-resolve-bare-specifier
  }
  // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-when-exercised

  /**
   * Resolve a target through the lazy list held under `key`: the list's
   * round runs, then the blob answering the target is read — the target
   * chunk's item for a location key (relative or absolute), the unit
   * answering the specifier for a bare key.
   */
  private static resolveListedTarget(
    sharedDepLists: SharedDepListLoadContext,
    key: string,
    bare: boolean
  ): Promise<string> {
    const { loader, ctx, resolveAssetUrl, entryId } = sharedDepLists;
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-resolve-bare-specifier
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-fetch-lazy-chunk
    return loader
      .resolveDependent(
        ctx,
        key,
        resolveAssetUrl,
        sharedDepLists.dynamicImports,
        sharedDepLists.fetchOwnChunk
      )
      // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-fetch-lazy-chunk
      .then(() => {
        const blob = bare
          ? ctx.specifierToBlob.get(key)
          : loader.blobForKey(ctx, key);
        if (blob === undefined) {
          throw new MfeLoadError(
            `__frontx_lazy: the list of '${key}' minted no blob for the ` +
              'import target.',
            entryId
          );
        }
        return blob;
      });
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-resolve-bare-specifier
  }

  /**
   * Fail fast with a diagnostic when `manifest.shared` declares the same
   * package name more than once (regardless of version) — see the comment
   * on {@link buildSharedDepBlobUrls} for why this is preferred over
   * re-keying `sources`/`sharedDepBlobUrls` to `name@version`.
   */
  // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-assert-unique-names
  private assertUniqueSharedDepNames(
    manifest: MfManifest,
    entryId: string
  ): void {
    const seen = new Set<string>();
    for (const dep of manifest.shared ?? []) {
      // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-if-duplicate-name
      if (seen.has(dep.name)) {
        // The second argument is `MfeLoadError.entryTypeId` — the entry
        // being loaded, as at every other throw site in this file — while
        // the manifest is named in the message text.
        // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-raise-duplicate-name
        throw new MfeLoadError(
          `manifest.shared of '${manifest.id}' declares ` +
            `'${dep.name}' more than once. Shared dependency names must be ` +
            'unique within a manifest — blob URL construction keys sources ' +
            'and rewrite maps by bare package name, so a duplicate silently ' +
            'overwrites the earlier entry.',
          entryId
        );
        // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-raise-duplicate-name
      }
      // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-if-duplicate-name
      seen.add(dep.name);
    }
  }
  // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-assert-unique-names

  // ---- Blob URL chain creation ----

  /**
   * Recursively create blob URLs for a module and all its static dependencies.
   *
   * Processes dependencies depth-first so that when a module's imports are
   * rewritten, all its dependencies already have blob URLs in the shared map.
   * Common dependencies are processed once per load (shared blobUrlMap).
   *
   * Concurrent calls for the same filename are deduplicated via the inFlight
   * map — callers await the same promise rather than returning early with no
   * result. This prevents a race where sibling ESM modules with top-level
   * await, and the sibling fan-out in {@link createBlobUrlChainInternal},
   * trigger overlapping resolution for the same dependency;
   * {@link resolveLazyChunk} is the current beneficiary that actually calls
   * back into this method from outside the static-import recursion.
   *
   * Cycle detection is tracked on the shared `inFlight` entry rather than on
   * any single call's recursion path, because the path a cycle is *detected*
   * on is not necessarily the path it was *created* on. A linear cycle
   * (chunk A imports B, B imports A) is visible on one call stack and a
   * simple "have I already seen this filename on my own way down" check
   * catches it. A cycle that closes across two independent branches does
   * not stay on one call stack: if a diamond (E imports A and B; A imports
   * C; B imports C; C imports back to B) fans A and B out concurrently, C is
   * reached only via A's path, so a plain per-call ancestor set never
   * contains "B" when C statically imports it — B was never on that
   * particular branch. Meanwhile B is independently blocked joining C's
   * `inFlight` promise (ordinary, legitimate dedup, not yet a cycle), so B
   * and C now await each other with no rejection, no timeout, and no retry
   * path (the `loadCache` entry never settles).
   *
   * `ancestors` is therefore not a per-call snapshot: it *is* the mutable
   * lineage stored on the filename's own `inFlight` entry (see
   * `LoadBlobState.inFlight`), threaded live through the recursion that
   * builds that filename's dependencies. When a second branch joins an
   * already in-flight filename instead of constructing it, that branch
   * contributes its own lineage into the joined entry's lineage before
   * awaiting it (synchronously, with no `await` between the check and the
   * contribution — the same discipline the `blobUrlMap`/`inFlight`
   * check-then-set already relies on, which is also why this method stays
   * non-`async`). Because the lineage object is shared by reference, that
   * contribution is visible the moment the joined filename's own
   * construction next reads it — including when it later closes the cycle
   * by requesting a dependency that is now present in its own (grown)
   * lineage. In the diamond above: B joining C's promise contributes B's
   * lineage into C's entry; when C's construction goes on to request B, its
   * own lineage now contains "B", the ordinary ancestor check fires, and C
   * fails the chain build instead of joining B's promise. A detected cycle
   * is fatal here, exactly as it is for circular shared deps in
   * the whole-package mint (`WholePackageLoader`): there is no order in which the
   * blob URLs on a cycle could be minted, and the alternative — leaving the
   * cycle-closing specifier pointing at a plain chunk URL — would evaluate
   * that module, and its whole origin-resolved subgraph, outside the load's
   * isolated graph.
   */
  // @cpt-algo:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1
  private createBlobUrlChain(
    loadState: LoadBlobState,
    filename: string,
    build: ChainBuildState,
    ancestors: ReadonlySet<string> = new Set()
  ): Promise<void> {
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-check-map
    if (loadState.blobUrlMap.has(filename)) {
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-mapped
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-return-mapped
      return Promise.resolve();
      // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-return-mapped
      // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-mapped
    }
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-check-map

    // Check for a cycle on this call's own recursion path BEFORE consulting
    // `inFlight` — `filename` being an ancestor here means its `inFlight`
    // entry (if any) is the very promise this call would otherwise block
    // on, which is the deadlock this guard exists to avoid. This alone only
    // catches a cycle that stays on one call stack; the `inFlight`-join
    // branch below (see the class-level doc comment) covers a cycle that
    // closes across two branches that fanned out independently.
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-check-ancestor-cycle
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-ancestor-cycle
    if (ancestors.has(filename)) {
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-raise-ancestor-cycle
      // Reject rather than await: returning the rejection (instead of
      // awaiting anything) is what keeps liveness — no circular wait is
      // created, and the rejection propagates through the sibling
      // `Promise.allSettled` scan into `build.failed`.
      return Promise.reject(
        this.onDependencyCycleDetected(
          loadState,
          build,
          filename,
          ancestors,
          'own lineage'
        )
      );
      // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-raise-ancestor-cycle
    }
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-ancestor-cycle
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-check-ancestor-cycle

    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-check-inflight
    const existing = loadState.inFlight.get(filename);
    if (existing) {
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-inflight
      // A join, not a fresh construction: `filename` is already being built
      // by another branch. Check membership against the union of our own
      // lineage and the entry's recorded lineage before committing to await
      // it — if either already names `filename`, awaiting it would close a
      // cycle back onto ourselves. This is a defensive companion to the
      // ancestor check above, which only sees `filename` if it was
      // literally on the caller's own path; here `filename` could instead
      // have arrived via a contribution from some third branch.
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-join-lineage-union
      const union = new Set(ancestors);
      for (const inherited of existing.lineage) union.add(inherited);
      // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-join-lineage-union
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-join-cycle
      if (union.has(filename)) {
        // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-raise-join-cycle
        // Same treatment as the own-lineage case, and for the same reason:
        // reject without awaiting the joined entry, so the cross-branch
        // circular wait is never entered.
        return Promise.reject(
          this.onDependencyCycleDetected(
            loadState,
            build,
            filename,
            union,
            'joined lineage'
          )
        );
        // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-raise-join-cycle
      }
      // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-join-cycle
      // Contribute our own lineage into the joined entry before awaiting it
      // (synchronously — no `await` between the check above and this), so
      // that if the joined filename's own construction later requests
      // something in our lineage, it can detect that as the cycle it is.
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-contribute-lineage
      for (const inherited of ancestors) existing.lineage.add(inherited);
      // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-contribute-lineage
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-return-inflight
      return this.joinInFlightConstruction(
        loadState,
        filename,
        build,
        ancestors,
        existing
      );
      // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-return-inflight
      // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-inflight
    }
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-check-inflight

    // This filename's own lineage starts as a copy of the caller's — it is
    // then threaded (by reference, mutably) through the construction below
    // and into every dependency it recurses into, so a later join can
    // contribute into it and this construction will see that contribution
    // the next time it reads its own lineage (see the class-level doc
    // comment for why that liveness is what makes cross-branch cycles
    // detectable).
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-register-inflight
    const lineage = new Set(ancestors);
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-register-inflight

    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-settle-drop-inflight
    // The `inFlight` entry is a join point for a construction still in
    // progress, not a record that one happened — `blobUrlMap` is the only
    // durable record. Three paths inside `createBlobUrlChainInternal`
    // resolve WITHOUT minting a blob URL (the build already failed on
    // entry, it failed while this fetch was in flight, or it failed in a
    // sibling subtree), and a rejection leaves nothing behind either. An
    // entry left in `inFlight` after any of those settles is a settled
    // promise that produced nothing: every later request for the filename
    // joins it, resolves immediately, never re-fetches, and then finds no
    // `blobUrlMap` entry. Dropping the entry on settle-without-a-blob-URL
    // is what lets a later build re-attempt the construction. It does
    // nothing for a caller that had ALREADY joined the promise before it
    // settled — that case is handled on the join side, by
    // {@link joinInFlightConstruction}.
    // Identity-checked against the wrapped promise below, so a construction
    // that settles late cannot delete an entry a NEWER request already
    // registered for the same filename.
    const dropIfUnproductive = (): void => {
      if (loadState.blobUrlMap.has(filename)) return;
      if (loadState.inFlight.get(filename)?.promise === promise) {
        loadState.inFlight.delete(filename);
      }
    };
    // The wrapped promise — not the raw construction — is what goes into
    // `inFlight`, so a joining caller cannot observe the construction as
    // settled before the entry has been pruned.
    const promise = this.createBlobUrlChainInternal(
      loadState,
      filename,
      build,
      lineage
    ).then(
      () => {
        dropIfUnproductive();
      },
      (error: unknown) => {
        dropIfUnproductive();
        throw error;
      }
    );
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-register-inflight
    loadState.inFlight.set(filename, { promise, lineage });
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-register-inflight
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-settle-drop-inflight
    return promise;
  }

  /**
   * Await a construction another branch already had in flight, then verify
   * it actually produced something — and construct it ourselves if it did
   * not.
   *
   * An `inFlight` entry is a join point for a construction in progress, not
   * a record that one succeeded: the entry's construction can settle
   * cleanly without minting a blob URL (a sibling of ITS build failed and it
   * abandoned the chunk — see `inst-settle-drop-inflight`). Dropping the unproductive entry helps the
   * NEXT requester, but not one that already joined the promise: that
   * joiner would resume, find no `blobUrlMap` entry for the filename, and
   * fail its own load at {@link relativeImportBlob} for a chunk nothing
   * ever tried to build on its behalf.
   *
   * So the joiner re-attempts the construction inside its OWN build. By the
   * time this resumes, the entry it joined has already been pruned —
   * `dropIfUnproductive` runs inside the `.then` of the very promise
   * awaited here, so it cannot race the re-attempt — and the recursive call
   * re-enters {@link createBlobUrlChain} with this requester's own
   * `ancestors`, so the re-attempt is subject to the same lineage cycle
   * checks as any other request and cannot reintroduce a circular wait.
   *
   * The re-attempt is skipped when this build has itself failed: the absence
   * from `blobUrlMap` is then this build's own outcome, not a hole left by
   * someone else's.
   */
  private async joinInFlightConstruction(
    loadState: LoadBlobState,
    filename: string,
    build: ChainBuildState,
    ancestors: ReadonlySet<string>,
    joined: InFlightChainEntry
  ): Promise<void> {
    await joined.promise;
    if (loadState.blobUrlMap.has(filename)) return;
    if (build.failed) return;
    return this.createBlobUrlChain(loadState, filename, build, ancestors);
  }

  /**
   * The single point at which a detected dependency cycle becomes a
   * failure — both detection sites in {@link createBlobUrlChain} route
   * through here, and a future mechanism that could actually LOAD a cyclic
   * graph (a per-load naming layer) substitutes here rather than reopening
   * either site's check-then-set region.
   *
   * Returns the error rather than throwing it, so the callers can reject
   * without awaiting anything and without becoming `async` — the
   * `blobUrlMap`/`inFlight` check-then-set in {@link createBlobUrlChain}
   * must stay synchronous.
   *
   * The diagnostic IS the report: the condition is fatal, so a console
   * warning alongside it would be noise. It is raised once per chunk per
   * chain build, since several branches can reach the same cycle before
   * `build.failed` is observed by all of them.
   */
  private onDependencyCycleDetected(
    loadState: LoadBlobState,
    build: ChainBuildState,
    filename: string,
    lineage: ReadonlySet<string>,
    detectedVia: string
  ): MfeLoadError {
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-diagnose-cycle
    const alreadyReported = build.reportedCycles.has(filename);
    build.reportedCycles.add(filename);
    const message = alreadyReported
      ? `dependency cycle: chunk '${filename}' — already diagnosed for this ` +
        'chain build by the branch that reached the cycle first.'
      : `dependency cycle: chunk '${filename}' is already in the ` +
        `${detectedVia} of the branch requesting it (${[...lineage].join(' → ')}). ` +
        'A cyclic chunk graph has no order in which per-load blob URLs ' +
        'could be minted, and resolving the cycle-closing import from its ' +
        "origin URL would evaluate that module outside this load's " +
        'isolated graph. Rebuild the microfrontend so that its chunk graph ' +
        'is acyclic.';
    return new MfeLoadError(message, loadState.entryId);
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-diagnose-cycle
  }

  private async createBlobUrlChainInternal(
    loadState: LoadBlobState,
    filename: string,
    build: ChainBuildState,
    ancestors: ReadonlySet<string>
  ): Promise<void> {
    // A sibling elsewhere in THIS build already failed — stop before issuing
    // further fetches for work this build will never use. Scoped to
    // `build` (this one chain-build), not `loadState` (the whole
    // load) — see `ChainBuildState`.
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-failed-at-entry
    if (build.failed) {
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-return-failed-at-entry
      return;
      // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-return-failed-at-entry
    }
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-failed-at-entry

    // Portable shared dep chunks use absolute URLs (resolved at generation time
    // to a canonical shared base). Use as-is to ensure sourceTextCache dedup.
    const chunkUrl = MfeHandlerMF.resolveChunkUrl(loadState.baseUrl, filename);
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-fanout-bounded
    // Admission to the build's single fetch budget — present only on the
    // whole-package path; a fetch-list load's build is unbounded. The slot
    // is held across
    // this one fetch and released the moment it settles — never across the
    // dependency recursion below, which would deadlock any graph deeper
    // than the budget's width.
    await build.fetchBudget?.acquire();
    let source: string;
    try {
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-failed-after-fetch
      if (build.failed) {
        // Another branch failed while this call waited for a slot: give the
        // slot back without spending it on work this build will never use.
        // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-return-failed-after-fetch
        return;
        // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-return-failed-after-fetch
      }
      // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-failed-after-fetch
      // The entry chunk's text is this load's own early request, taken
      // directly rather than looked up by URL (`inst-md-fetch-entry-concurrent`).
      const seeded =
        filename === loadState.entryChunkFilename
          ? loadState.entrySource
          : undefined;
      if (seeded !== undefined) loadState.entrySource = undefined;
      // An own chunk the list's `ownChunks` prefetched is taken from the
      // load's own map, not looked up in the shared handler cache.
      const prefetchedTexts = loadState.sharedDepLists?.ownChunkTexts;
      const prefetched = prefetchedTexts?.get(chunkUrl);
      if (prefetched !== undefined) prefetchedTexts?.delete(chunkUrl);
      const taken = seeded ?? prefetched;
      source =
        taken !== undefined
          ? await taken
          : await this.fetchSourceText(chunkUrl, loadState.attemptLedger);
    } finally {
      build.fetchBudget?.release();
    }
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-fanout-bounded

    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-failed-after-fetch
    if (build.failed) {
      // Re-check after the `await` above: another branch of THIS build may
      // have failed while this fetch was in flight.
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-return-failed-after-fetch
      return;
      // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-return-failed-after-fetch
    }
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-failed-after-fetch

    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-parse-static-imports
    // The chunk is read once: the dependencies, every rewrite and every
    // survivor check below work from this scan's records.
    const scan = DynamicImportScan.scan(source);
    const deps = this.staticImportFilenames(scan.imports, filename, loadState.baseUrl);
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-parse-static-imports

    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-for-each-dep
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-recurse-dep
    // Siblings are fanned out concurrently instead of being awaited
    // serially one at a time — a sibling's entire recursive subtree does
    // not block the next sibling from starting. The fan-out itself is
    // deliberately unbounded: what must be bounded is the number of
    // FETCHES in flight for this build, and where it applies (the
    // whole-package path only) it lives on the build's own `fetchBudget`
    // (see {@link FetchBudget}) rather than on a
    // pool opened per sibling group, which would multiply the width by the
    // graph's bushiness. Cross-sibling / cross-load dedup for a shared
    // filename still holds because `createBlobUrlChain`'s check-then-set
    // against `blobUrlMap`/`inFlight` is synchronous (the method itself is
    // not `async`, so no other call can interleave between the check and
    // the `inFlight.set`); two siblings requesting the same filename settle
    // on one underlying fetch/chain. Dispatching with `map` keeps those
    // check-then-sets in declaration order.
    //
    // `ancestors` here is `loadState.inFlight.get(filename)!.lineage` — the
    // same mutable object passed down from `createBlobUrlChain` — so any
    // contribution another branch made into it while this fetch was
    // in-flight (see that method's join branch) is already visible.
    // `childAncestors` copies it and adds `filename` itself so a dependency
    // that cycles back here is detected by the plain ancestor check.
    const childAncestors = new Set(ancestors);
    childAncestors.add(filename);
    const settled = await Promise.allSettled(
      deps.map((dep) =>
        this.createBlobUrlChain(loadState, dep, build, childAncestors)
      )
    );
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-recurse-dep
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-for-each-dep

    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-first-failure-declaration-order
    // Deterministic error surfacing: report the first failing dependency in
    // its declaration order, matching the pre-concurrency sequential loop's
    // error semantics rather than whichever sibling lost the race in
    // wall-clock time. `Promise.allSettled` preserves input order, so this
    // scan is unaffected by which sibling settled first.
    const failure = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-first-failure-declaration-order
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-sibling-failed
    if (failure) {
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-raise-build-failure
      build.failed = true;
      throw failure.reason;
      // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-raise-build-failure
    }
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-sibling-failed
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-failed-elsewhere
    if (build.failed) {
      // A sibling outside this call's own subtree, but within THIS build,
      // already failed: stop here rather than minting a blob URL this
      // build will never use.
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-return-failed-elsewhere
      return;
      // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-return-failed-elsewhere
    }
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-failed-elsewhere

    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-rewrite-static
    // Each static relative specifier binds to the blob of the chunk it
    // names; a bare specifier binds to the pre-built shared dep blob URL
    // map (from "react" → from "blob:xxx").
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-rewrite-lazy-specifiers
    // A lazy target's chunks take the references the parent load's
    // per-load map holds, the same map the entry chunk took.
    const replacements = new Map<string, string>();
    for (const { specifier } of scan.imports) {
      const blob = MfeHandlerMF.isRelativeSpecifier(specifier)
        ? this.relativeImportBlob(specifier, loadState, filename)
        : loadState.sharedDepBlobUrls.get(specifier);
      if (blob !== undefined) replacements.set(specifier, blob);
    }
    const edits = DynamicModuleOps.specifierEdits(source, scan.imports, replacements);
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-rewrite-lazy-specifiers
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-rewrite-static

    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-rewrite-meta-url
    // A blob-evaluated chunk's `import.meta.url` is a `blob:` URL, which breaks
    // relative URL resolution; the chunk's resolved HTTP location restores it.
    edits.push(...ImportMetaUrlRewriter.edits(scan.metaUrls, chunkUrl));
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-rewrite-meta-url

    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-rewrite-shared
    // The records no replacement names are what the rewrite left unbound.
    const surviving = scan.imports.filter(
      (record) => !replacements.has(record.specifier)
    );
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-rewrite-shared

    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-assert-own-no-bare-specifier
    const ownSurvivor = SharedDepSpecifierScan.findSurvivingDeclared(
      surviving,
      loadState.declaredSpecifiers
    );
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-assert-own-no-bare-specifier
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-own-bare-specifier
    if (ownSurvivor !== undefined) {
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-raise-own-bare-specifier
      build.failed = true;
      throw new MfeLoadError(
        `own chunk '${filename}' still imports the bare specifier ` +
          `'${ownSurvivor}' after rewriting, for microfrontend ` +
          `'${loadState.entryId}'. Every declared specifier must resolve ` +
          'to a blob URL; no unit of the load answers it.',
        loadState.entryId
      );
      // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-raise-own-bare-specifier
    }
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-own-bare-specifier
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-warn-own-undeclared-specifier
    for (const specifier of SharedDepSpecifierScan.findUndeclaredWellFormedSpecifiers(
      surviving,
      loadState.declaredSpecifiers
    )) {
      console.warn(
        `own chunk '${filename}' imports '${specifier}', which the ` +
          `manifest does not declare, for microfrontend ` +
          `'${loadState.entryId}'. This specifier cannot resolve inside an ` +
          'isolated module. The load proceeds — this is a diagnostic only.'
      );
    }
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-warn-own-undeclared-specifier

    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-lazy-ref
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-inject-lazy-stub
    // Inject the per-load `__frontx_lazy` loader stub at the top of the chunk
    // when the chunk references it. The stub is the runtime half of ADR-0022:
    // a build-time AST transform rewrote every dynamic `import('./X')` to
    // `__frontx_lazy('./X')`; the loader stub closes over this load's resolver
    // and routes those calls through the parent load's blob URL chain so
    // lazy chunks inherit the same `sharedDepBlobUrls` as the entry chunk.
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-inject-stub
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-rewrite-nested-lazy
    // A chunk a whole-package entry's call reached is shared text: its
    // native literal and pattern imports reach the ABI here, as they do in
    // a minted shared unit, so they stay inside the load's graph.
    if (build.rewriteNativeDynamicImports) {
      edits.push(
        ...UnitDynamicImportRewriter.callEdits(scan.calls, '__frontx_lazy')
      );
    }
    let rewritten = SourceSplice.apply(source, edits);
    // Every chunk of the load that references the ABI — a lazy target's
    // nested calls included — takes a `__frontx_lazy` that imports the same
    // per-load loader stub and tags each call with this chunk's own
    // location, so the path resolves against the chunk that makes the call.
    if (rewritten.includes('__frontx_lazy(')) {
      const loaderUrl = this.ensureLazyLoaderUrl(loadState);
      rewritten =
        UnitDynamicImportRewriter.callerBinding(rewritten, loaderUrl, filename) +
        rewritten;
    }
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-rewrite-nested-lazy
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-inject-stub
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-inject-lazy-stub
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-lazy-ref

    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-create-blob
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-return-complete
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-mint-lazy-blob
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-mint-serialised
    // A mint is one synchronous step — the dependencies this chunk imports
    // are minted before it, and nothing interleaves between creating the
    // reference and recording it — so one load's mints never overlap while
    // its fetches stay concurrent.
    const blob = new Blob([rewritten], { type: 'text/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    loadState.blobUrlMap.set(filename, blobUrl);
    // The minted chunk's prefetched text has no further reader.
    loadState.sharedDepLists?.ownChunkTexts.delete(chunkUrl);
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-mint-serialised
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-mint-lazy-blob
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-return-complete
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-create-blob
  }

  // ---- Lazy-import ABI runtime resolver (ADR-0022) ----

  /**
   * Mint (lazily) and return this load's `__frontx_lazy` loader stub blob URL.
   *
   * The stub is a tiny ESM module that re-exports a `__frontx_lazy` function
   * closed over this load's resolver id. Vendor MFE chunks transformed by
   * the build plugin reference `__frontx_lazy` as an imported binding from
   * this stub URL — that import is injected at the top of every chunk that
   * uses the identifier (see {@link createBlobUrlChainInternal}).
   *
   * Stub URL is per-load (sibling loads get distinct stubs) and never
   * revoked — per ADR-0004 + ADR-0022 the stub joins the parent load's
   * blob URL chain and shares its page-lifetime invariant.
   */
  // @cpt-algo:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1
  private ensureLazyLoaderUrl(loadState: LoadBlobState): string {
    if (loadState.lazyLoaderUrl !== undefined) return loadState.lazyLoaderUrl;

    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-mint-stub
    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-mint-lazy-stub
    const registry = LazyLoaderRegistry.ensureExposed();
    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-if-lazy-exercised
    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-resolve-lazy-chunks
    // Each call exercised in a loaded chunk reaches this load's resolver,
    // so the lazy target joins this load's isolated graph.
    const loaderId = registry.register((path) => this.resolveLazyChunk(path, loadState));
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-resolve-lazy-chunks
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-if-lazy-exercised

    // The stub uses the `resolve` this copy publishes ({@link LazyLoaderRegistry})
    // to reach the host-side resolver. Returning
    // a `Promise<Module>` mirrors the original `import()` semantic so the
    // caller's transformed code (`__frontx_lazy('./X').then(m => m.X)`) keeps
    // working unchanged. The source text is built in the audited trust
    // kernel (`buildLazyLoaderStubSource` in `mf-dynamic-module-ops.ts`)
    // rather than here, so it stays the sole site that writes dynamic-import
    // text — see that function's doc comment for why.
    const stubSource = DynamicModuleOps.buildLazyLoaderStubSource(loaderId);

    const blob = new Blob([stubSource], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    loadState.lazyLoaderUrl = url;
    return url;
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-mint-lazy-stub
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-mint-stub
  }

  /**
   * Resolve a vendor-relative lazy-import path to a per-load blob URL.
   *
   * The vendor's compiled chunk emits `__frontx_lazy('./LayoutElements-X.js')`
   * (sibling chunk reference — Rollup constant-folds the path to a hashed
   * filename relative to the importing chunk's directory). All MFE chunks
   * share a single output directory, so the path resolves to a filename
   * under `loadState.baseUrl`.
   *
   * The chunk is then funneled through {@link createBlobUrlChain}, which
   * fetches its source (via the URL-keyed `sourceTextCache`), recursively
   * rewrites bare specifiers + nested `__frontx_lazy()` calls (the static-
   * chain path takes care of both), mints a blob URL in this load's
   * `blobUrlMap`, and returns. Subsequent `__frontx_lazy(...)` calls for the
   * same path within the same load reuse the cached blob URL.
   *
   * This call site runs after `load()` has already resolved (the caller is
   * runtime code inside an already-mounted MFE, not the initial load
   * chain), so it has no static-import ancestor path to seed
   * `createBlobUrlChain`'s lineage with — the host-side registry this stub
   * calls through (see {@link ensureLazyLoaderUrl}) does not thread the
   * calling chunk's own filename back to us, so it genuinely cannot be
   * determined here. Seeding with the entry chunk instead still gives
   * `createBlobUrlChain` a non-empty starting lineage to grow from, which is
   * what the cross-branch join/contribute mechanism it implements needs to
   * detect a cycle between two lazy chunks triggered concurrently and
   * cross-referencing each other — the same shape of deadlock the
   * class-level doc comment on {@link createBlobUrlChain} describes for the
   * static-import case, reachable here too because this does not start a
   * disconnected, empty lineage against the load's shared `inFlight` map.
   */
  private async resolveLazyChunk(
    argument: string,
    loadState: LoadBlobState
  ): Promise<string> {
    // A call made by a compiled chunk of this load names that chunk
    // (`UnitDynamicImportRewriter.callerBinding`), and its path resolves
    // against the base the chunk resolves against — `publicPath` for the
    // microfrontend's own code — whatever directory the chunk sits in
    // (`inst-lai-resolve-relative-path`). A bare path names no caller and
    // is the entry chunk's.
    const split = UnitDynamicImportRewriter.splitCallerArgument(argument);
    const caller = split?.caller ?? loadState.entryChunkFilename;
    const path = split?.path ?? argument;
    // A bare argument that a unit answers resolves through the list held
    // under that specifier, when one is held, and never as an own chunk;
    // any other bare argument loads as an own chunk.
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-resolve-bare-specifier
    const shared = loadState.sharedDepLists;
    if (
      shared !== undefined &&
      MfeHandlerMF.isBareSpecifier(path) &&
      shared.ctx.declaredSpecifiers.has(path)
    ) {
      // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-bare-cached
      const minted = shared.ctx.specifierToBlob.get(path);
      if (minted !== undefined) return minted;
      // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-bare-cached
      if (shared.ctx.dependentLists.has(path)) {
        return MfeHandlerMF.resolveListedTarget(shared, path, true);
      }
    }
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-resolve-bare-specifier
    return this.resolveLazyTarget(
      MfeHandlerMF.chunkKey(loadState.baseUrl, path, caller),
      loadState
    );
  }

  /** A path that is neither relative, rooted nor an absolute URL. */
  private static isBareSpecifier(path: string): boolean {
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-resolve-relative-path
    return !/^(\.\.?\/|\/|[a-zA-Z][a-zA-Z\d+.-]*:)/.test(path);
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-resolve-relative-path
  }

  /**
   * Resolve a lazy target named by its location relative to the asset
   * base — or an absolute URL — into this load's isolated graph.
   * Concurrent resolutions of one target share one resolution; the entry
   * is dropped once it settles so a failed import can be retried and a
   * settled one answers from the per-load map.
   */
  private resolveLazyTarget(
    filename: string,
    loadState: LoadBlobState,
    rewriteNativeDynamicImports = false
  ): Promise<string> {
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-if-cached
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-return-cached
    const existing = loadState.blobUrlMap.get(filename);
    if (existing !== undefined) return Promise.resolve(existing);
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-return-cached
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-if-cached
    const resolutions = (loadState.lazyResolutions ??= new Map());
    const joined = resolutions.get(filename);
    if (joined !== undefined) return joined;
    const resolution = this.runLazyResolution(
      filename,
      loadState,
      rewriteNativeDynamicImports
    );
    resolutions.set(filename, resolution);
    const release = (): void => {
      if (resolutions.get(filename) === resolution) resolutions.delete(filename);
    };
    resolution.then(release, release);
    return resolution;
  }

  private async runLazyResolution(
    filename: string,
    loadState: LoadBlobState,
    rewriteNativeDynamicImports: boolean
  ): Promise<string> {
    const shared = loadState.sharedDepLists;
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-if-whole-package
    // A load whose exposed module has no fetch list has no lists to find:
    // its target is found by walking the chunk graph below.
    const wholePackage = shared === undefined;
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-if-whole-package
    if (shared !== undefined) {
      await this.fetchLazyTargetLists(filename, loadState, shared);
    }

    // Fresh per-build failure token (see `ChainBuildState`) for THIS
    // lazy resolution, scoped to `loadState`. A network blip on one
    // lazy import must not latch a load-wide flag that then blocks every
    // later, otherwise-independent, lazy import on the same already-mounted
    // MFE — each call here gets its own token instead of sharing one on
    // `loadState`.
    // @cpt-begin:cpt-frontx-state-mfe-isolation-load-blob-state:p1:inst-blob-lazy-failed
    const build = createChainBuildState(wholePackage, rewriteNativeDynamicImports);
    // @cpt-end:cpt-frontx-state-mfe-isolation-load-blob-state:p1:inst-blob-lazy-failed

    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-walk-chunk-graph
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-return-whole-package
    // On a whole-package load the chunk graph is walked from the target
    // under the build's fixed fetch budget, its bare specifiers binding to
    // the whole-package units the per-load map already holds.
    // @cpt-begin:cpt-frontx-state-mfe-isolation-load-blob-state:p1:inst-blob-lazy-extend
    await this.createBlobUrlChain(
      loadState,
      filename,
      build,
      new Set([loadState.entryChunkFilename])
    );
    // @cpt-end:cpt-frontx-state-mfe-isolation-load-blob-state:p1:inst-blob-lazy-extend
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-return-whole-package
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-walk-chunk-graph

    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-return-lazy-blob
    const blobUrl = loadState.blobUrlMap.get(filename);
    if (blobUrl === undefined) {
      throw new MfeLoadError(
        `__frontx_lazy: failed to mint blob URL for lazy chunk '${filename}'`,
        loadState.entryId
      );
    }
    return blobUrl;
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-return-lazy-blob
  }

  /**
   * The one round of a lazy target of the microfrontend's own code: the
   * target's own chunk, the units its list names that are missing and the
   * list's own chunks are all requested together, before any response
   * arrives. A target matching no list loads with the units the per-load
   * map already holds, after one warning per handler.
   */
  private async fetchLazyTargetLists(
    filename: string,
    loadState: LoadBlobState,
    shared: SharedDepListLoadContext
  ): Promise<void> {
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-find-target-list
    // An own chunk's list is keyed by its location relative to the asset
    // base, the base an own chunk resolves against.
    const key = filename;
    const hasList = shared.ctx.dependentLists.has(key);
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-find-target-list
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-if-no-list
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-else-own-caller
    if (!hasList) {
      // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-no-list-warning
      this.loadDiagnostics.warnOnce(
        `lazy-no-list:${loadState.entryId}:${filename}`,
        `[MfeHandlerMF] lazy chunk '${filename}' of '${loadState.entryId}' ` +
          'matches no lazy-target fetch list of the load; it loads with ' +
          'the shared units the load already holds, and any shared unit ' +
          'it needs beyond them is not fetched.'
      );
      // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-no-list-warning
      // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-return-no-list
      return;
      // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-return-no-list
    }
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-else-own-caller
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-if-no-list
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-fetch-lazy-chunk
    // One round: the own chunk, the list's missing shared units and its
    // `ownChunks` go out in one step, none waiting for another.
    const lists = shared.loader.resolveDependent(
      shared.ctx,
      key,
      shared.resolveAssetUrl,
      shared.dynamicImports,
      shared.fetchOwnChunk
    );
    const ownChunk = shared.fetchOwnChunk(filename);
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-fetch-lazy-chunk
    const settled = await Promise.allSettled([lists, ownChunk]);
    const failure = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    if (failure) {
      // The chunk is not built after a failed round: nothing reads its
      // prefetched text, so the hand-off is not kept.
      shared.ownChunkTexts.delete(MfeHandlerMF.resolveChunkUrl(loadState.baseUrl, filename));
      throw failure.reason;
    }
  }

  /**
   * The identity of a chunk within a load: its resolved URL — what a fetch
   * of it requests, however its location is spelled — written relative to
   * `baseUrl` when it lies under it. `importer` is the key of the chunk
   * whose import names `location`; without one, `location` resolves against
   * `baseUrl` itself. Two spellings of one URL (`./a.js` and `a.js`, an
   * explicit default port) are one chunk, on the request side and the lookup
   * side alike (`cpt-frontx-algo-unit-format-contract-fetch-list-schema`,
   * `inst-location-identity`).
   */
  private static chunkKey(
    baseUrl: string,
    location: string,
    importer?: string
  ): string {
    // @cpt-begin:cpt-frontx-algo-unit-format-contract-fetch-list-schema:p1:inst-location-identity
    const from =
      importer === undefined ? baseUrl : MfeHandlerMF.resolveChunkUrl(baseUrl, importer);
    const href = new URL(location, from).href;
    return href.startsWith(baseUrl) ? href.slice(baseUrl.length) : href;
    // @cpt-end:cpt-frontx-algo-unit-format-contract-fetch-list-schema:p1:inst-location-identity
  }

  /** Absolute URL of the chunk a key or location names, as a fetch requests it. */
  private static resolveChunkUrl(baseUrl: string, location: string): string {
    return new URL(location, baseUrl).href;
  }

  /**
   * The failure of a fetch asked for after its load attempt was released or
   * failed: the attempt issues no request and publishes nothing.
   */
  private static endedAttempt(url: string, entryId: string): MfeLoadError {
    return new MfeLoadError(
      `the load attempt ended before '${url}' was requested`,
      entryId
    );
  }

  /**
   * The failure state of the load's concurrent requests: the entry
   * module's request outcome and whichever list/item work {@link guard} wraps. The
   * first of them to fail names the load's error and the others' outcomes
   * are discarded; every promise the guard stops listening to gets a no-op
   * handler, so a discarded rejection never surfaces as unhandled.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-concurrent-failure
  private static concurrentRequestGuard(entryOutcome: Promise<void>): {
    guard<T>(work: Promise<T>): Promise<T>;
    failure(): { readonly error: unknown } | undefined;
  } {
    let failed: { readonly error: unknown } | undefined;
    const markFailed = (error: unknown): void => {
      failed ??= { error };
    };
    const entryFailure = new Promise<never>((_resolve, reject) => {
      entryOutcome.catch((error: unknown) => {
        markFailed(error);
        reject(error);
      });
    });
    entryFailure.catch(() => undefined);
    return {
      guard: <T>(work: Promise<T>): Promise<T> => {
        work.catch(markFailed);
        // One source of truth names the error: the recorded first failure,
        // even when both rejections settle in the same drain.
        return Promise.race([work, entryFailure]).catch((error: unknown) => {
          throw failed === undefined ? error : failed.error;
        });
      },
      failure: () => failed,
    };
  }
  // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-concurrent-failure

  // ---- Source text fetching and parsing ----

  /**
   * Fetch the source text of one of the microfrontend's own chunks — its
   * entry module, its further and lazy chunks and the own chunks a fetch
   * list names. The handler's source-text cache holds only that own code,
   * so each URL is fetched at most once across all loads. `priority` is the
   * request's fetch priority; absent leaves the browser's default.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-fetch-source
  private fetchSourceText(
    absoluteChunkUrl: string,
    ledger?: AttemptSourceTextLedger,
    priority?: 'high'
  ): Promise<string> {
    const cached = this.sourceTextCache.get(absoluteChunkUrl);
    if (cached !== undefined) {
      // Joining an entry another load registered still makes this attempt a
      // waiter on it, so it belongs in the attempt's ledger.
      ledger?.record(this.sourceTextCache, absoluteChunkUrl, cached);
      return cached;
    }
    // An attempt that was released or failed issues no request and publishes
    // nothing: a fetch it started could never be recorded for release, and a
    // retry would rejoin it.
    if (ledger?.hasFailed === true) {
      return Promise.reject(MfeHandlerMF.endedAttempt(absoluteChunkUrl, absoluteChunkUrl));
    }

    const fetchPromise: Promise<string> = this.requestSourceText(
      absoluteChunkUrl,
      priority
    ).catch((error: unknown) => {
      // Only while the cache still holds THIS promise: a late rejection
      // of an abandoned attempt must not evict a retry's newer one.
      // @cpt-begin:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-release-generation-identity
      if (this.sourceTextCache.get(absoluteChunkUrl) === fetchPromise) {
        this.sourceTextCache.delete(absoluteChunkUrl);
      }
      // @cpt-end:cpt-frontx-algo-mfe-loading-attempt-timeout:p1:inst-lto-release-generation-identity
      throw error;
    });
    // The entry stays in flight until it settles: a full cache never evicts
    // a request someone is still waiting on.
    const settled = (): void => {
      this.settledSourceTexts.add(fetchPromise);
    };
    fetchPromise.then(settled, settled);

    this.sourceTextCache.set(absoluteChunkUrl, fetchPromise);
    ledger?.record(this.sourceTextCache, absoluteChunkUrl, fetchPromise);
    return fetchPromise;
  }
  // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-fetch-source

  /**
   * Fetch the source text of a shared unit or a whole-package entry. The
   * request neither reads nor populates the handler source-text cache: the
   * realm cache alone holds shared text, so the realm byte budget bounds all
   * of it. An attempt that was released or failed issues no request.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-whole-package-bypass-handler-cache
  private fetchSharedText(
    absoluteUrl: string,
    ledger?: AttemptSourceTextLedger
  ): Promise<string> {
    if (ledger?.hasFailed === true) {
      return Promise.reject(MfeHandlerMF.endedAttempt(absoluteUrl, absoluteUrl));
    }
    return this.requestSourceText(absoluteUrl);
  }
  // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-whole-package-bypass-handler-cache

  /**
   * One request for the text of `absoluteUrl`: a request that fails or a
   * non-success status is a retryable failure; an HTML answer (an SPA dev
   * server's fallback for an unknown path) is not a module and is refused.
   */
  private requestSourceText(
    absoluteUrl: string,
    priority?: 'high'
  ): Promise<string> {
    // The request starts inside a promise executor, so a `fetch` that throws
    // synchronously (an invalid URL, a patched implementation) rejects the
    // chain below instead of escaping it.
    return new Promise<Response>((resolve) => {
      resolve(
        priority === undefined
          ? fetch(absoluteUrl)
          : fetch(absoluteUrl, { priority })
      );
    })
      .then((response) => {
        if (!response.ok) {
          throw new RetryableLoadError(
            `HTTP ${response.status} fetching chunk source: ${absoluteUrl}`,
            absoluteUrl
          );
        }
        // SPA dev servers (e.g. Vite) return a 200 HTML document for unknown
        // paths. Detecting this early gives a clear error instead of a cryptic
        // SyntaxError when the HTML is imported as JavaScript.
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('text/html')) {
          throw new MfeLoadError(
            `Server returned HTML for chunk URL (Content-Type: ${contentType}). ` +
              `The chunk does not exist at the expected path: ${absoluteUrl}. ` +
              'Run "npm run generate:mfe-manifests" to synchronize chunk paths with the current MFE build.',
            absoluteUrl
          );
        }
        return response.text();
      })
      .then((text) => {
        // Belt-and-suspenders: reject any response that looks like HTML regardless
        // of the Content-Type header (some servers omit or misreport it).
        if (text.trimStart().startsWith('<')) {
          throw new MfeLoadError(
            `Chunk response starts with "<" — server returned HTML instead of JavaScript: ${absoluteUrl}. ` +
              'Run "npm run generate:mfe-manifests" to synchronize chunk paths with the current MFE build.',
            absoluteUrl
          );
        }
        return text;
      })
      .catch((error: unknown) => {
        if (error instanceof MfeLoadError) {
          throw error;
        }
        throw new RetryableLoadError(
          `Network error fetching chunk source: ${absoluteUrl}: ${error instanceof Error ? error.message : String(error)}`,
          absoluteUrl,
          error instanceof Error ? error : undefined
        );
      });
  }

  /**
   * The resolved filenames of the relative static imports in `records`.
   *
   * Every relative specifier (both './' and '../' prefixed) resolves
   * relative to the importing chunk's path. For example, a chunk at
   * '__federation_shared_@gears-frontx/react.js' importing '../runtime.js'
   * resolves to 'runtime.js' (relative to baseUrl). A specifier inside a
   * string or comment is never a record, so never a dependency.
   */
  private staticImportFilenames(
    records: readonly StaticImportRecord[],
    chunkFilename: string,
    baseUrl: string
  ): string[] {
    const filenames = new Set<string>();
    for (const { specifier } of records) {
      if (MfeHandlerMF.isRelativeSpecifier(specifier)) {
        filenames.add(MfeHandlerMF.chunkKey(baseUrl, specifier, chunkFilename));
      }
    }
    return [...filenames];
  }

  private static isRelativeSpecifier(specifier: string): boolean {
    return specifier.startsWith('./') || specifier.startsWith('../');
  }

  /**
   * The blob URL a relative import specifier of a chunk binds to.
   *
   * Each relative specifier is resolved against the chunk's own path to
   * produce a normalized key for the blobUrlMap lookup.
   *
   * A dependency missing from `blobUrlMap` has no sanctioned reading: it is
   * a chunk that was never built, and no case exists in which an absence is
   * deliberate, because a detected dependency cycle fails the build where
   * it is detected.
   * Emitting an origin URL for an absent dependency would silently hand
   * back a module that evaluates outside the load's isolated graph with its
   * own bare specifiers unrewritten — a far worse outcome than a
   * diagnostic, so it fails the load instead.
   *
   * Dynamic `import('<rel>')` calls are NOT bound here. A build-time AST
   * transform converts every dynamic import to `__frontx_lazy('<rel>')`
   * (ADR-0022); the loader stub injected by `createBlobUrlChainInternal`
   * routes those calls through `resolveLazyChunk`, which mints per-load
   * blob URLs that inherit the parent load's `sharedDepBlobUrls`. Eagerly
   * binding `import(...)` here would either bypass that path (loading lazy
   * chunks from origin with unrewritten bare specifiers — the failure mode
   * ADR-0022 prevents) or eagerly resolve every lazy chunk into the static
   * chain (defeating lazy semantics).
   */
  private relativeImportBlob(
    relPath: string,
    loadState: LoadBlobState,
    chunkFilename: string
  ): string {
    const resolved = MfeHandlerMF.chunkKey(loadState.baseUrl, relPath, chunkFilename);
    const blobUrl = loadState.blobUrlMap.get(resolved);
    if (blobUrl) return blobUrl;
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-raise-unbuilt-dep
    throw new MfeLoadError(
      `Chunk '${chunkFilename}' imports '${relPath}' (resolved to ` +
        `'${resolved}'), which has no blob URL in this load — its ` +
        'construction never completed. There is no sanctioned reason for ' +
        'the absence: a detected dependency cycle fails the build where ' +
        'it is detected. Refusing to rewrite the import to its origin ' +
        "URL, which would evaluate that module outside the load's " +
        'isolated module graph.',
      loadState.entryId
    );
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-raise-unbuilt-dep
  }
}

/**
 * Confirm that a value the type system returned for a manifest id is shaped
 * like an `MfManifest`.
 *
 * The plugin's registry is keyed by opaque ids and holds every kind of schema
 * a consumer registered, so a lookup can legitimately answer with something
 * that is not a manifest at all; the load must fail on that as it would on a
 * miss rather than cache the value and fail deeper in the chain. Whether the
 * manifest's contents are themselves valid stays the plugin's responsibility.
 */
function isMfManifest(value: unknown): value is MfManifest {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'id' in value && typeof value.id === 'string' &&
    'metaData' in value && typeof value.metaData === 'object' && value.metaData !== null &&
    (!('shared' in value) || value.shared === undefined || Array.isArray(value.shared))
  );
}

export { MfeHandlerMF };
