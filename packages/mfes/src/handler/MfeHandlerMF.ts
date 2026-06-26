/**
 * Module Federation MFE Handler Implementation
 *
 * Achieves per-runtime isolation by blob-URL'ing the entire module dependency
 * chain for each load() call. Each screen/extension load gets fresh evaluations
 * of all code-split chunks and shared dependencies — no module instances are
 * shared between runtimes.
 *
 * Manifest-based loading:
 * - baseUrl is derived from manifest.metaData.publicPath
 * - expose chunk filename comes from entry.exposeAssets.js.sync[0]
 * - CSS paths come from entry.exposeAssets.css.sync/async
 * - shared dep standalone ESM files are resolved from manifest.shared[].chunkPath (relative to publicPath)
 * No remoteEntry.js parsing is required.
 *
 * Bare specifier rewriting for shared deps:
 * - Shared deps are fetched as standalone ESM files from each MFE's server (chunkPath relative to publicPath).
 * - manifest.shared[] must be in dependency order (leaves first) so that each dep's
 *   blob URL is ready before any dep that imports it is processed.
 * - Within expose chunks and their dependency chains, bare specifiers (e.g. from "react")
 *   are rewritten to the pre-built blob URLs for the corresponding shared dep.
 * - This gives per-load isolation without any MF 2.0 runtime involvement.
 *
 * @packageDocumentation
 */
// @cpt-dod:cpt-frontx-dod-mfe-isolation-blob-core:p1
// @cpt-state:cpt-frontx-state-mfe-isolation-module-lifecycle:p1

import type { MfeEntryMF } from '../types/mfe-entry-mf';
import type { MfManifest } from '../manifest/mf-manifest';
import { LazyLoaderRegistry } from '../lazy-loader/lazy-loader-registry';
import {
  MfeHandler,
  ChildMfeBridge,
  MfeEntryLifecycle,
} from './types';
import { MfeLoadError } from '../errors';
import { RetryHandler } from './retry-handler';
import { MfeBridgeFactoryDefault } from './mfe-bridge-factory-default';
import {
  sourceImports,
  rewriteBareSpecifier,
  importBlobModule,
} from './mf-dynamic-module-ops';

const RUNTIME_STYLE_ID_PREFIX = '__frontx-mfe-runtime-style-';

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
  readonly inFlight: Map<string, Promise<void>>;
  readonly baseUrl: string;
  /** MFE entry ID for this load; used in error messages. */
  readonly entryId: string;
  /** Shared dep blob URLs: package name → blob URL. Built before the expose chain. */
  readonly sharedDepBlobUrls: Map<string, string>;
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
}

/**
 * Internal cache for Module Federation manifests.
 */
class ManifestCache {
  private readonly manifests = new Map<string, MfManifest>();

  cacheManifest(manifest: MfManifest): void {
    this.manifests.set(manifest.id, manifest);
  }

  getManifest(manifestId: string): MfManifest | undefined {
    return this.manifests.get(manifestId);
  }
}

/**
 * Minimal LRU cache with fixed capacity. Leverages insertion-order semantics
 * of `Map`: each `get` re-inserts the key (moving it to the end, i.e. "most
 * recent"), and `set` evicts the oldest key when capacity would be exceeded.
 *
 * We use this for source-text caches to prevent unbounded growth on
 * long-running hosts that accumulate many distinct chunk URLs over time
 * (a partial miss on issue #253).
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

/** Max source-text entries retained. Expose-chunk entries evict oldest-first. */
const SOURCE_TEXT_CACHE_CAPACITY = 256;
/** Max shared-dep text entries retained (keyed by name@version, cross-MFE). */
const SHARED_DEP_TEXT_CACHE_CAPACITY = 128;

/**
 * Configuration for MFE loading behavior.
 */
interface MfeLoaderConfig {
  timeout?: number;
  retries?: number;
}

/**
 * Module Federation handler for loading MFE bundles.
 *
 * For each load() call:
 *  1. Resolves the MfManifest (validates metaData.publicPath and shared[])
 *  2. Derives baseUrl from manifest.metaData.publicPath
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
   * (`cpt-frontx-adr-blob-url-mfe-isolation`) + ADR-0020
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
  private readonly config: MfeLoaderConfig;
  private readonly retryHandler: RetryHandler;
  // @cpt-state:cpt-frontx-state-mfe-isolation-source-cache:p1
  // LRU-bounded so a long-running host that loads many distinct MFEs cannot
  // grow the cache without limit. Expose-chunk source text has no reuse
  // value after its load settles, so oldest-first eviction is acceptable.
  private readonly sourceTextCache = new LruCache<string, Promise<string>>(
    SOURCE_TEXT_CACHE_CAPACITY,
  );

  // @cpt-state:cpt-frontx-state-mfe-isolation-shared-dep-cache:p1
  /**
   * Cross-runtime shared dep source text deduplication.
   * Keyed by `name@version`. The first MFE to load a given shared dep
   * caches its source text here. Subsequent MFEs declaring the same
   * name@version get a cache hit — zero network fetch, regardless of
   * which server hosts the MFE.
   *
   * LRU-bounded for the same reason as `sourceTextCache`. Shared deps are
   * naturally fewer (only npm-published packages declared in `rollupOptions.external`),
   * but the cap defends against a pathological host that keeps adding new
   * versions over time.
   */
  private readonly sharedDepTextCache = new LruCache<string, Promise<string>>(
    SHARED_DEP_TEXT_CACHE_CAPACITY,
  );


  constructor(
    handledBaseTypeId: string,
    config: MfeLoaderConfig = {}
  ) {
    super(handledBaseTypeId, 0);
    this.bridgeFactory = new MfeBridgeFactoryDefault();
    this.manifestCache = new ManifestCache();
    this.retryHandler = new RetryHandler();
    this.config = {
      timeout: config.timeout ?? 30000,
      retries: config.retries ?? 2,
    };
  }

  /**
   * Load an MFE bundle using Module Federation.
   *
   * Cache is keyed by `extensionId` (the extension instance ID), not by
   * `entry.id`. Two extensions sharing the same `entry` definition get
   * distinct cache entries and distinct module evaluations.
   */
  // @cpt-flow:cpt-frontx-flow-mfe-isolation-load:p1
  async load(
    entry: MfeEntryMF,
    extensionId: string
  ): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    // @cpt-begin:cpt-frontx-state-mfe-isolation-module-lifecycle:p1:inst-check-cache
    const cached = MfeHandlerMF.loadCache.get(extensionId);
    if (cached !== undefined) {
      // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-if-cached
      // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-return-cached
      return cached;
      // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-return-cached
      // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-if-cached
    }
    // @cpt-end:cpt-frontx-state-mfe-isolation-module-lifecycle:p1:inst-check-cache
    // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-else-new-load
    const promise = this.retryHandler.retry(
      () => this.loadInternal(entry),
      this.config.retries ?? 0,
      1000
    );
    // @cpt-begin:cpt-frontx-state-mfe-isolation-module-lifecycle:p1:inst-to-isolated
    MfeHandlerMF.loadCache.set(extensionId, promise);
    // @cpt-end:cpt-frontx-state-mfe-isolation-module-lifecycle:p1:inst-to-isolated
    // On failure, evict so future calls can retry from scratch.
    // Identity check guards against racing with a newer successful load.
    // @cpt-begin:cpt-frontx-state-mfe-isolation-module-lifecycle:p1:inst-load-failed-retry
    promise.catch(() => {
      if (MfeHandlerMF.loadCache.get(extensionId) === promise) {
        MfeHandlerMF.loadCache.delete(extensionId);
      }
    });
    // @cpt-end:cpt-frontx-state-mfe-isolation-module-lifecycle:p1:inst-load-failed-retry
    // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-else-new-load
    // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-return-lifecycle
    return promise;
    // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-return-lifecycle
  }

  /**
   * Internal load implementation.
   * Each call creates a fully isolated module evaluation chain via blob URLs.
   */
  private async loadInternal(entry: MfeEntryMF): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-register-entry
    const manifest = await this.resolveManifest(entry.manifest);
    this.manifestCache.cacheManifest(manifest);
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-register-entry

    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-trigger-load
    const { moduleFactory, stylesheetPaths, baseUrl } = await this.loadExposedModuleIsolated(
      manifest,
      entry.exposedModule,
      entry.exposeAssets,
      entry.id
    );
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-trigger-load

    const loadedModule = moduleFactory();

    if (!this.isValidLifecycleModule(loadedModule)) {
      throw new MfeLoadError(
        `Module '${entry.exposedModule}' must implement MfeEntryLifecycle interface (mount/unmount)`,
        entry.id
      );
    }

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
    entryId: string
  ): Promise<{
    moduleFactory: () => unknown;
    stylesheetPaths: string[];
    baseUrl: string;
  }> {
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-read-public-path
    // publicPath is the authoritative base URL for all chunks in this MFE.
    const baseUrl = manifest.metaData.publicPath;
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-read-public-path

    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-run-manifest-discovery
    // Build shared dep blob URLs first (leaves first, dependency order).
    // Each dep's standalone ESM may import other shared deps as bare specifiers;
    // those are rewritten to already-resolved blob URLs before creating the blob.
    const sharedDepBlobUrls = await this.buildSharedDepBlobUrls(manifest);
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-run-manifest-discovery

    // @cpt-begin:cpt-frontx-algo-mfe-isolation-parse-manifest-expose-metadata:p1:inst-1
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-read-expose-chunk
    // Derive expose chunk filename directly from entry metadata — no regex needed.
    const exposeChunkFilename = exposeAssets.js.sync[0];
    if (!exposeChunkFilename) {
      throw new MfeLoadError(
        `Cannot resolve expose chunk for '${exposedModule}': exposeAssets.js.sync is empty`,
        entryId
      );
    }
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-read-expose-chunk

    // @cpt-begin:cpt-frontx-state-mfe-isolation-load-blob-state:p1:inst-blob-building
    const loadState: LoadBlobState = {
      blobUrlMap: new Map(),
      inFlight: new Map(),
      baseUrl,
      entryId,
      sharedDepBlobUrls,
      entryChunkFilename: exposeChunkFilename,
    };
    // @cpt-end:cpt-frontx-state-mfe-isolation-load-blob-state:p1:inst-blob-building

    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-read-css
    // Collect CSS paths from exposeAssets (sync injected at mount; async lazy).
    const stylesheetPaths = [
      ...exposeAssets.css.sync,
      ...exposeAssets.css.async,
    ];
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-read-css
    // @cpt-end:cpt-frontx-algo-mfe-isolation-parse-manifest-expose-metadata:p1:inst-1

    // Build blob URL chain for the expose chunk and all its static deps.
    // Bare specifiers within those chunks are rewritten to shared dep blob URLs.
    await this.createBlobUrlChain(loadState, exposeChunkFilename);

    const exposeBlobUrl = loadState.blobUrlMap.get(exposeChunkFilename);
    if (!exposeBlobUrl) {
      throw new MfeLoadError(
        `Failed to create blob URL for expose chunk '${exposeChunkFilename}'`,
        entryId
      );
    }

    // @cpt-begin:cpt-frontx-flow-mfe-isolation-load:p1:inst-import-expose
    const exposeModule = await importBlobModule(exposeBlobUrl);
    // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-import-expose

    // @cpt-begin:cpt-frontx-state-mfe-isolation-load-blob-state:p1:inst-blob-complete
    // The expose chunk exports the lifecycle object as `default`. Fall back to
    // the full module if default is absent (non-MF ESM expose pattern).
    const moduleRecord = exposeModule as Record<string, unknown>;
    return {
      moduleFactory: () => moduleRecord['default'] ?? exposeModule,
      stylesheetPaths,
      baseUrl,
    };
    // @cpt-end:cpt-frontx-state-mfe-isolation-load-blob-state:p1:inst-blob-complete
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
  // @cpt-algo:cpt-frontx-algo-mfe-isolation-wrap-lifecycle-stylesheets:p1
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
      mount: async (container, bridge) => {
        await this.injectRemoteStylesheets(container, stylesheetPaths, baseUrl);
        await lifecycle.mount(container, bridge);
      },
      // @cpt-end:cpt-frontx-state-mfe-isolation-module-lifecycle:p1:inst-to-active
      // @cpt-begin:cpt-frontx-state-mfe-isolation-module-lifecycle:p1:inst-to-disposed
      unmount: async (container) => {
        this.removeInjectedStylesheets(container);
        await lifecycle.unmount(container);
      },
      // @cpt-end:cpt-frontx-state-mfe-isolation-module-lifecycle:p1:inst-to-disposed
    };
  }
  // @cpt-end:cpt-frontx-flow-mfe-isolation-load:p1:inst-cache-promise

  // @cpt-algo:cpt-frontx-algo-mfe-isolation-inject-remote-stylesheets:p1
  private async injectRemoteStylesheets(
    container: Element | ShadowRoot,
    stylesheetPaths: string[],
    baseUrl: string
  ): Promise<void> {
    stylesheetPaths.forEach((path, index) => {
      const targetId = `${RUNTIME_STYLE_ID_PREFIX}${index}`;
      this.upsertStyleElement(
        container,
        { href: new URL(path, baseUrl).href },
        targetId
      );
    });
  }

  // @cpt-algo:cpt-frontx-algo-mfe-isolation-remove-injected-stylesheets:p1
  private removeInjectedStylesheets(container: Element | ShadowRoot): void {
    const injectedStyles = container.querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
      `link[id^="${RUNTIME_STYLE_ID_PREFIX}"], style[id^="${RUNTIME_STYLE_ID_PREFIX}"]`
    );
    injectedStyles.forEach((styleElement) => styleElement.remove());
  }

  // @cpt-algo:cpt-frontx-algo-mfe-isolation-upsert-mount-style-element:p1
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
   * Resolve manifest from reference.
   *
   * Accepts an inline MfManifest object (caches it) or a string type ID
   * (looks up from cache). Schema validation is the type system plugin's
   * responsibility — the handler trusts registered manifests are valid.
   */
  private async resolveManifest(manifestRef: string | MfManifest): Promise<MfManifest> {
    if (typeof manifestRef === 'object' && manifestRef !== null) {
      this.manifestCache.cacheManifest(manifestRef);
      return manifestRef;
    }

    if (typeof manifestRef === 'string') {
      const cached = this.manifestCache.getManifest(manifestRef);
      if (cached) {
        return cached;
      }
      throw new MfeLoadError(
        `Manifest '${manifestRef}' not found. Provide manifest inline in MfeEntryMF or ensure another entry from the same remote was loaded first.`,
        manifestRef
      );
    }

    throw new MfeLoadError(
      'Manifest reference must be a string (type ID) or MfManifest object',
      'invalid-manifest-ref'
    );
  }

  // ---- Shared dep blob URL construction ----

  // @cpt-algo:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1
  /**
   * Build blob URLs for all shared dependencies from standalone ESM files.
   *
   * Processes shared deps in manifest order (must be dependency-ordered: leaves first).
   * Each dep's standalone ESM may import other shared deps as bare specifiers —
   * those are rewritten to already-resolved blob URLs before creating the blob.
   * Per-load fresh blob URLs ensure isolated module instances.
   */
  private async buildSharedDepBlobUrls(
    manifest: MfManifest
  ): Promise<Map<string, string>> {
    const sources = await this.fetchSharedDepSources(manifest);
    const sharedNames = new Set(manifest.shared.map((d) => d.name));
    return this.createBlobUrlsInDependencyOrder(sources, sharedNames);
  }

  /**
   * Fetch standalone ESM source text for each shared dep.
   * sharedDepTextCache deduplicates by name@version across ALL MFEs — the
   * first MFE to load react@19.2.4 fetches it from its server; subsequent MFEs
   * get a cache hit regardless of their server URL.
   */
  private async fetchSharedDepSources(
    manifest: MfManifest
  ): Promise<Map<string, string>> {
    const sources = new Map<string, string>();
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-for-each-shared
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-for-each-dep
    for (const dep of manifest.shared) {
      const cacheKey = `${dep.name}@${dep.version}`;
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-compute-key
      let textPromise = this.sharedDepTextCache.get(cacheKey);
      // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-compute-key
      if (textPromise === undefined) {
        // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-resolve-chunk-path
        // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-derive-url
        const absoluteUrl = dep.chunkPath.startsWith('http')
          ? dep.chunkPath
          : manifest.metaData.publicPath + dep.chunkPath;
        // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-derive-url
        // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-resolve-chunk-path
        // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-fetch-shared-dep
        // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-fetch-and-cache
        textPromise = this.fetchSourceText(absoluteUrl);
        // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-fetch-and-cache
        // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-fetch-shared-dep
        // Evict on rejection so a transient failure doesn't poison every
        // future load that shares this name@version. Identity check prevents
        // clobbering a later retry promise under the same key.
        textPromise.catch(() => {
          if (this.sharedDepTextCache.get(cacheKey) === textPromise) {
            this.sharedDepTextCache.delete(cacheKey);
          }
        });
        this.sharedDepTextCache.set(cacheKey, textPromise);
      }
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-if-cache-hit
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-retrieve-cached
      sources.set(dep.name, await textPromise);
      // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-retrieve-cached
      // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-if-cache-hit
    }
    // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-for-each-dep
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-for-each-shared
    return sources;
  }

  /**
   * Create blob URLs in dependency order: leaves first, dependents follow.
   * Circular dependencies fall back to partial rewrites for the remaining set.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-resolve-order
  private createBlobUrlsInDependencyOrder(
    sources: Map<string, string>,
    sharedNames: Set<string>
  ): Map<string, string> {
    const blobUrls = new Map<string, string>();
    const pending = new Map(sources);

    while (pending.size > 0) {
      const before = pending.size;
      for (const [name, source] of pending) {
        if (this.isDepReadyToResolve(name, source, sharedNames, blobUrls)) {
          blobUrls.set(name, this.createRewrittenBlobUrl(source, blobUrls));
          pending.delete(name);
        }
      }
      if (pending.size === before) {
        // Circular dependency: process remaining with partial rewrites.
        for (const [name, source] of pending) {
          blobUrls.set(name, this.createRewrittenBlobUrl(source, blobUrls));
        }
        break;
      }
    }
    return blobUrls;
  }
  // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-resolve-order

  private isDepReadyToResolve(
    name: string,
    source: string,
    sharedNames: Set<string>,
    blobUrls: Map<string, string>
  ): boolean {
    return [...sharedNames].every(
      (other) =>
        other === name ||
        blobUrls.has(other) ||
        !sourceImports(source, other)
    );
  }

  private createRewrittenBlobUrl(
    source: string,
    blobUrls: Map<string, string>
  ): string {
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-rewrite-specifiers
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-rewrite-specifiers
    const rewritten = this.rewriteBareSpecifiers(source, blobUrls);
    // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-rewrite-specifiers
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-rewrite-specifiers
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-mint-shared-blob
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-create-dep-blob
    const blob = new Blob([rewritten], { type: 'text/javascript' });
    return URL.createObjectURL(blob);
    // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-create-dep-blob
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-mint-shared-blob
  }

  // @cpt-algo:cpt-frontx-algo-mfe-isolation-rewrite-bare-specifiers:p1
  /**
   * Apply all shared dep bare specifier rewrites to a source text.
   */
  private rewriteBareSpecifiers(
    source: string,
    sharedDepBlobUrls: Map<string, string>
  ): string {
    let rewritten = source;
    for (const [name, blobUrl] of sharedDepBlobUrls) {
      rewritten = rewriteBareSpecifier(rewritten, name, blobUrl);
    }
    return rewritten;
  }

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
   * await trigger overlapping importShared() calls for the same dependency.
   */
  // @cpt-algo:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1
  private createBlobUrlChain(
    loadState: LoadBlobState,
    filename: string
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

    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-check-inflight
    const existing = loadState.inFlight.get(filename);
    if (existing) {
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-inflight
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-return-inflight
      return existing;
      // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-return-inflight
      // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-inflight
    }
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-check-inflight

    const promise = this.createBlobUrlChainInternal(loadState, filename);
    loadState.inFlight.set(filename, promise);
    return promise;
  }

  private async createBlobUrlChainInternal(
    loadState: LoadBlobState,
    filename: string
  ): Promise<void> {
    // Portable shared dep chunks use absolute URLs (resolved at generation time
    // to a canonical shared base). Use as-is to ensure sourceTextCache dedup.
    const chunkUrl = filename.startsWith('http://') || filename.startsWith('https://')
      ? filename
      : loadState.baseUrl + filename;
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-fetch-source
    const source = await this.fetchSourceText(chunkUrl);
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-fetch-source
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-parse-static-imports
    const deps = this.parseStaticImportFilenames(source, filename);
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-parse-static-imports

    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-for-each-dep
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-recurse-dep
    for (const dep of deps) {
      await this.createBlobUrlChain(loadState, dep);
    }
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-recurse-dep
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-for-each-dep

    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-rewrite-static
    let rewritten = this.rewriteModuleImports(
      source,
      loadState.baseUrl,
      loadState.blobUrlMap,
      filename
    );
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-rewrite-static

    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-rewrite-meta-url
    // Phase 19: Replace import.meta.url with the real chunk base URL string.
    // When a chunk is blob-URL'd, import.meta.url becomes a blob: URL, which
    // breaks new URL("../path", import.meta.url) — blob: URLs have no directory
    // component. Replacing with the HTTP base URL (directory of the chunk)
    // restores correct relative URL resolution (e.g. in preload-helper.js).
    // We target 'import.meta.url' specifically to leave import.meta.env intact.
    rewritten = this.rewriteImportMetaUrl(rewritten, chunkUrl);
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-rewrite-meta-url

    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-rewrite-shared
    // Rewrite bare specifiers (from "react" → from "blob:xxx") using
    // the pre-built shared dep blob URL map.
    rewritten = this.rewriteBareSpecifiers(rewritten, loadState.sharedDepBlobUrls);
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-rewrite-shared

    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-lazy-ref
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-inject-lazy-stub
    // Inject the per-load `__frontx_lazy` loader stub at the top of the chunk
    // when the chunk references it. The stub is the runtime half of ADR-0022:
    // a build-time AST transform rewrote every dynamic `import('./X')` to
    // `__frontx_lazy('./X')`; the loader stub closes over this load's resolver
    // and routes those calls through the parent load's blob URL chain so
    // lazy chunks inherit the same `sharedDepBlobUrls` as the entry chunk.
    if (rewritten.includes('__frontx_lazy(')) {
      const loaderUrl = this.ensureLazyLoaderUrl(loadState);
      rewritten = `import{__frontx_lazy}from${JSON.stringify(loaderUrl)};\n${rewritten}`;
    }
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-inject-lazy-stub
    // @cpt-end:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-if-lazy-ref

    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-create-blob
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-blob-url-chain:p1:inst-return-complete
    const blob = new Blob([rewritten], { type: 'text/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    loadState.blobUrlMap.set(filename, blobUrl);
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
    const registry = LazyLoaderRegistry.ensureExposed();
    const loaderId = registry.register((path) => this.resolveLazyChunk(path, loadState));

    // The stub uses `globalThis.__FRONTX_LAZY__.resolve` (exposed by
    // {@link LazyLoaderRegistry}) to reach the host-side resolver. Returning
    // a `Promise<Module>` mirrors the original `import()` semantic so the
    // caller's transformed code (`__frontx_lazy('./X').then(m => m.X)`) keeps
    // working unchanged.
    const stubSource =
      `const __id=${JSON.stringify(loaderId)};\n` +
      `export const __frontx_lazy=async(p)=>{` +
      `const u=await globalThis.__FRONTX_LAZY__.resolve(__id,p);` +
      `return import(u);` +
      `};\n`;

    const blob = new Blob([stubSource], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    loadState.lazyLoaderUrl = url;
    return url;
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
   */
  private async resolveLazyChunk(
    relPath: string,
    loadState: LoadBlobState
  ): Promise<string> {
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-resolve-relative-path
    // Compiled-chunk dynamic imports are sibling-relative: Rollup emits
    // paths like `./LayoutElements-hash.js` against the importing chunk's
    // directory. The entry chunk lives in `loadState.entryChunkFilename`
    // (e.g., `assets/lifecycle-uikit-X.js`); every other chunk in a Vite
    // build shares that directory, so resolving `./<file>` against the
    // entry chunk's path produces the correct filename relative to
    // `loadState.baseUrl` for both the entry chunk and its lazy siblings.
    const filename = this.resolveRelativePath(
      loadState.entryChunkFilename,
      relPath
    );
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-resolve-relative-path

    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-fetch-lazy-chunk
    await this.createBlobUrlChain(loadState, filename);
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-fetch-lazy-chunk

    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-return-lazy-blob
    const blobUrl = loadState.blobUrlMap.get(filename);
    if (blobUrl === undefined) {
      throw new MfeLoadError(
        `__frontx_lazy: failed to mint blob URL for lazy chunk '${relPath}'`,
        loadState.entryId
      );
    }
    return blobUrl;
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-return-lazy-blob
  }

  /**
   * Replace all `import.meta.url` references with the chunk's real base URL.
   *
   * The base URL is the directory containing the chunk (trailing slash included),
   * derived by stripping the filename from the full chunk URL. This is the URL
   * that relative `new URL("../x", import.meta.url)` calls should resolve against.
   */
  // @cpt-algo:cpt-frontx-algo-mfe-isolation-rewrite-module-imports:p2
  private rewriteImportMetaUrl(source: string, chunkAbsoluteUrl: string): string {
    // Derive the directory containing this chunk by stripping the filename.
    // e.g. "http://localhost:3001/assets/preload-helper.js" → "http://localhost:3001/assets/"
    const lastSlash = chunkAbsoluteUrl.lastIndexOf('/');
    const chunkBaseUrl = lastSlash >= 0
      ? chunkAbsoluteUrl.slice(0, lastSlash + 1)
      : chunkAbsoluteUrl;

    // Use a regex replacement targeting the exact token 'import.meta.url'
    // (word-boundary anchored to avoid matching 'import.meta.url.something').
    // JSON.stringify ensures the URL is properly quoted and special chars escaped.
    return source.replace(/import\.meta\.url/g, JSON.stringify(chunkBaseUrl));
  }

  // ---- Source text fetching and parsing ----

  /**
   * Fetch the source text of a chunk. Uses an in-memory cache so each URL
   * is fetched at most once across all loads.
   */
  // @cpt-algo:cpt-frontx-algo-mfe-isolation-fetch-source:p1
  private fetchSourceText(absoluteChunkUrl: string): Promise<string> {
    const cached = this.sourceTextCache.get(absoluteChunkUrl);
    if (cached !== undefined) {
      return cached;
    }

    const fetchPromise = fetch(absoluteChunkUrl)
      .then((response) => {
        if (!response.ok) {
          throw new MfeLoadError(
            `HTTP ${response.status} fetching chunk source: ${absoluteChunkUrl}`,
            absoluteChunkUrl
          );
        }
        // SPA dev servers (e.g. Vite) return a 200 HTML document for unknown
        // paths. Detecting this early gives a clear error instead of a cryptic
        // SyntaxError when the HTML is imported as JavaScript.
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('text/html')) {
          throw new MfeLoadError(
            `Server returned HTML for chunk URL (Content-Type: ${contentType}). ` +
              `The chunk does not exist at the expected path: ${absoluteChunkUrl}. ` +
              'Run "npm run generate:mfe-manifests" to synchronize chunk paths with the current MFE build.',
            absoluteChunkUrl
          );
        }
        return response.text();
      })
      .then((text) => {
        // Belt-and-suspenders: reject any response that looks like HTML regardless
        // of the Content-Type header (some servers omit or misreport it).
        if (text.trimStart().startsWith('<')) {
          throw new MfeLoadError(
            `Chunk response starts with "<" — server returned HTML instead of JavaScript: ${absoluteChunkUrl}. ` +
              'Run "npm run generate:mfe-manifests" to synchronize chunk paths with the current MFE build.',
            absoluteChunkUrl
          );
        }
        return text;
      })
      .catch((error) => {
        this.sourceTextCache.delete(absoluteChunkUrl);
        if (error instanceof MfeLoadError) {
          throw error;
        }
        throw new MfeLoadError(
          `Network error fetching chunk source: ${absoluteChunkUrl}: ${error instanceof Error ? error.message : String(error)}`,
          absoluteChunkUrl,
          error instanceof Error ? error : undefined
        );
      });

    this.sourceTextCache.set(absoluteChunkUrl, fetchPromise);
    return fetchPromise;
  }

  /**
   * Extract resolved filenames from static import statements.
   *
   * Matches all relative imports (both './' and '../' prefixed) and resolves
   * them relative to the importing chunk's path. For example, a chunk at
   * '__federation_shared_@gears-frontx/react.js' importing '../runtime.js' resolves
   * to 'runtime.js' (relative to baseUrl).
   */
  // @cpt-algo:cpt-frontx-algo-mfe-isolation-parse-imports:p1
  private parseStaticImportFilenames(
    source: string,
    chunkFilename: string
  ): string[] {
    const filenames: string[] = [];

    // Named imports: import { x } from './dep.js'  /  export { x } from './dep.js'
    const namedRegex = /from\s*['"](\.\.?\/[^'"]+)['"]/g;
    let match;
    while ((match = namedRegex.exec(source)) !== null) {
      filenames.push(this.resolveRelativePath(chunkFilename, match[1]));
    }

    filenames.push(
      ...this.parseBareSideEffectImportFilenames(source, chunkFilename)
    );

    return [...new Set(filenames)];
  }

  private parseBareSideEffectImportFilenames(
    source: string,
    chunkFilename: string
  ): string[] {
    const filenames: string[] = [];
    let cursor = 0;

    while (cursor < source.length) {
      const importIndex = source.indexOf('import', cursor);
      if (importIndex === -1) {
        break;
      }

      if (!this.hasBareImportBoundary(source, importIndex)) {
        cursor = importIndex + 'import'.length;
        continue;
      }

      let specifierIndex = this.skipImportWhitespace(
        source,
        importIndex + 'import'.length
      );
      const quote = source[specifierIndex];
      if (quote !== '"' && quote !== '\'') {
        cursor = importIndex + 'import'.length;
        continue;
      }

      specifierIndex += 1;
      if (!this.isRelativeImportSpecifier(source, specifierIndex)) {
        cursor = specifierIndex;
        continue;
      }

      let specifierEnd = specifierIndex;
      while (
        specifierEnd < source.length &&
        source[specifierEnd] !== quote
      ) {
        specifierEnd += 1;
      }

      if (specifierEnd >= source.length) {
        break;
      }

      filenames.push(
        this.resolveRelativePath(
          chunkFilename,
          source.slice(specifierIndex, specifierEnd)
        )
      );
      cursor = specifierEnd + 1;
    }

    return filenames;
  }

  private hasBareImportBoundary(source: string, importIndex: number): boolean {
    let boundaryIndex = importIndex - 1;
    while (
      boundaryIndex >= 0 &&
      this.isBareImportWhitespace(source[boundaryIndex])
    ) {
      boundaryIndex -= 1;
    }

    return (
      boundaryIndex < 0 ||
      source[boundaryIndex] === ';' ||
      source[boundaryIndex] === '\n'
    );
  }

  private skipImportWhitespace(source: string, index: number): number {
    let cursor = index;
    while (
      cursor < source.length &&
      this.isImportWhitespace(source[cursor])
    ) {
      cursor += 1;
    }
    return cursor;
  }

  private isRelativeImportSpecifier(source: string, index: number): boolean {
    return (
      source[index] === '.' &&
      (
        source[index + 1] === '/' ||
        (source[index + 1] === '.' && source[index + 2] === '/')
      )
    );
  }

  private isBareImportWhitespace(char: string): boolean {
    return char === ' ' || char === '\t' || char === '\r';
  }

  private isImportWhitespace(char: string): boolean {
    return this.isBareImportWhitespace(char) || char === '\n';
  }

  /**
   * Rewrite all relative imports in a module's source text.
   *
   * Handles both './' and '../' relative imports. Each relative specifier
   * is resolved against the chunk's own path to produce a normalized key
   * for the blobUrlMap lookup. Unmatched imports fall back to absolute URLs.
   */
  // @cpt-algo:cpt-frontx-algo-mfe-isolation-rewrite-module-imports:p1
  private rewriteModuleImports(
    source: string,
    baseUrl: string,
    blobUrlMap: Map<string, string>,
    chunkFilename: string
  ): string {
    const resolve = (relPath: string): string => {
      const resolved = this.resolveRelativePath(chunkFilename, relPath);
      const blobUrl = blobUrlMap.get(resolved);
      if (blobUrl) return blobUrl;
      // If resolved is already absolute (dep of a cross-origin portable chunk),
      // use the URL as-is instead of prepending baseUrl.
      if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
        return resolved;
      }
      return `${baseUrl}${resolved}`;
    };

    // Static imports: from './...' or from '../..'
    let result = source.replace(
      /from\s*'(\.\.?\/[^']+)'/g,
      (_match, relPath: string) => `from '${resolve(relPath)}'`
    );
    result = result.replace(
      /from\s*"(\.\.?\/[^"]+)"/g,
      (_match, relPath: string) => `from "${resolve(relPath)}"`
    );

    // Bare side-effect imports: import './dep.js'
    result = result.replace(
      /import\s*'(\.\.?\/[^']+)'\s*;?/g,
      (_match, relPath: string) => `import '${resolve(relPath)}';`
    );
    result = result.replace(
      /import\s*"(\.\.?\/[^"]+)"\s*;?/g,
      (_match, relPath: string) => `import "${resolve(relPath)}";`
    );

    // Dynamic `import('<rel>')` calls are NOT rewritten here. A build-time
    // AST transform converts every dynamic import to `__frontx_lazy('<rel>')`
    // (ADR-0022);
    // the loader stub injected by `createBlobUrlChainInternal` routes those
    // calls through `resolveLazyChunk`, which mints per-load blob URLs that
    // inherit the parent load's `sharedDepBlobUrls`. Eagerly rewriting
    // `import(...)` here would either bypass that path (loading lazy chunks
    // from origin with unrewritten bare specifiers — the bug ADR-0022
    // fixes) or eagerly resolve every lazy chunk into the static chain
    // (defeating lazy semantics).

    return result;
  }

  /**
   * Resolve a relative import path against the importing chunk's filename.
   *
   * Uses URL resolution to correctly handle '../' traversals. For example:
   *  - resolveRelativePath('__federation_shared_@gears-frontx/react.js', '../runtime.js')
   *    → 'runtime.js'
   *  - resolveRelativePath('expose-Widget1.js', './dep.js')
   *    → 'dep.js'
   */
  private resolveRelativePath(
    fromChunkFilename: string,
    relativeSpecifier: string
  ): string {
    // When the importing chunk has an absolute URL (portable shared dep served
    // from a canonical origin), resolve imports against that origin and return
    // the full URL. This ensures deps of cross-origin portable chunks are
    // fetched from the correct server, not the current MFE's baseUrl.
    if (fromChunkFilename.startsWith('http://') || fromChunkFilename.startsWith('https://')) {
      return new URL(relativeSpecifier, fromChunkFilename).href;
    }
    const syntheticBase = 'http://r/';
    const fromUrl = new URL(fromChunkFilename, syntheticBase);
    const resolved = new URL(relativeSpecifier, fromUrl);
    return resolved.pathname.slice(1); // strip leading '/'
  }
}

export { MfeHandlerMF };
