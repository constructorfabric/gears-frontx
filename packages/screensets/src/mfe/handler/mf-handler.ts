/**
 * Module Federation MFE Handler Implementation
 *
 * Achieves per-runtime isolation by blob-URL'ing the entire module dependency
 * chain for each load() call. Each screen/extension load gets fresh evaluations
 * of the federation runtime (fresh moduleCache), code-split chunks, and shared
 * dependencies — no module instances are shared between runtimes.
 *
 * @packageDocumentation
 */
// @cpt-dod:cpt-hai3-dod-mfe-isolation-blob-core:p1

import type { MfeEntryMF, MfManifest } from '../types';
import {
  MfeHandler,
  ChildMfeBridge,
  MfeEntryLifecycle,
} from './types';
import { MfeLoadError } from '../errors';
import { RetryHandler } from '../errors/error-handler';
import { MfeBridgeFactoryDefault } from './mfe-bridge-factory-default';
import type {
  FederationPackageVersions,
} from './federation-types';

/**
 * A shareScope object written to globalThis.__federation_shared__.
 * Format: { [packageName]: { [version]: { get, loaded?, scope? } } }
 */
type ShareScope = Record<string, FederationPackageVersions>;

/**
 * Per-load shared state for blob URL chain creation.
 *
 * Shared across all blob URL chains within a single load() call so that
 * common transitive dependencies (e.g., the bundled React CJS module) are
 * blob-URL'd once and reused by all modules within the same load.
 */
// @cpt-state:cpt-hai3-state-mfe-isolation-load-blob-state:p1
interface LoadBlobState {
  readonly blobUrlMap: Map<string, string>;
  readonly inFlight: Map<string, Promise<void>>;
  readonly baseUrl: string;
  /** MFE entry ID for this load; used in error messages. */
  readonly entryId: string;
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
 *  1. Parses remoteEntry.js (fetched as text) to find the expose chunk
 *  2. Builds a shareScope with per-load blob URL get() functions
 *  3. Creates a blob URL chain for the expose chunk and all its static deps
 *     (fresh __federation_fn_import → fresh moduleCache)
 *  4. During evaluation, importShared() calls trigger the blob URL get()
 *     functions which also create blob URL chains for shared dep chunks
 *  5. All blob URLs share a per-load map so common deps are evaluated once
 */
class MfeHandlerMF extends MfeHandler<MfeEntryMF, ChildMfeBridge> {
  readonly bridgeFactory: MfeBridgeFactoryDefault;
  private readonly manifestCache: ManifestCache;
  private readonly config: MfeLoaderConfig;
  private readonly retryHandler: RetryHandler;
  // @cpt-state:cpt-hai3-state-mfe-isolation-source-cache:p1
  private readonly sourceTextCache = new Map<string, Promise<string>>();

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
   */
  // @cpt-flow:cpt-hai3-flow-mfe-isolation-load:p1
  async load(entry: MfeEntryMF): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return this.retryHandler.retry(
      () => this.loadInternal(entry),
      this.config.retries ?? 0,
      1000
    );
  }

  /**
   * Internal load implementation.
   * Each call creates a fully isolated module evaluation chain via blob URLs.
   */
  private async loadInternal(entry: MfeEntryMF): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    const manifest = await this.resolveManifest(entry.manifest);
    this.manifestCache.cacheManifest(manifest);

    const moduleFactory = await this.loadExposedModuleIsolated(
      manifest,
      entry.exposedModule,
      entry.id
    );

    const loadedModule = moduleFactory();

    if (!this.isValidLifecycleModule(loadedModule)) {
      throw new MfeLoadError(
        `Module '${entry.exposedModule}' must implement MfeEntryLifecycle interface (mount/unmount)`,
        entry.id
      );
    }

    return loadedModule;
  }

  /**
   * Load an exposed module with full per-runtime isolation.
   *
   * Creates a per-load blob URL chain:
   *  - The expose chunk and all its static deps are blob-URL'd (fresh
   *    __federation_fn_import → fresh moduleCache per load)
   *  - Shared dep chunks are also blob-URL'd via get() closures that share
   *    the same per-load blobUrlMap (so React and ReactDOM get the same React)
   *  - Blob URLs are NOT revoked — modules with top-level await continue
   *    evaluating after import() resolves, and revoking during async evaluation
   *    causes ERR_FILE_NOT_FOUND. Blob URLs are cleaned up by the browser on
   *    page unload.
   */
  private async loadExposedModuleIsolated(
    manifest: MfManifest,
    exposedModule: string,
    entryId: string
  ): Promise<() => unknown> {
    const remoteEntryUrl = manifest.remoteEntry;
    const baseUrl = remoteEntryUrl.substring(
      0,
      remoteEntryUrl.lastIndexOf('/') + 1
    );

    const loadState: LoadBlobState = {
      blobUrlMap: new Map(),
      inFlight: new Map(),
      baseUrl,
      entryId,
    };

    // Build shareScope with per-load isolated get() functions
    const shareScope = this.buildShareScope(manifest, loadState);
    this.writeShareScope(shareScope);

    // Parse remoteEntry to find the expose chunk filename
    const remoteEntrySource = await this.fetchSourceText(remoteEntryUrl);
    const exposeFilename = this.parseExposeChunkFilename(
      remoteEntrySource,
      exposedModule
    );
    if (!exposeFilename) {
      throw new MfeLoadError(
        `Cannot find expose chunk for '${exposedModule}' in remoteEntry`,
        entryId
      );
    }

    // Build blob URL chain for the expose chunk and all its static deps
    await this.createBlobUrlChain(loadState, exposeFilename);

    const exposeBlobUrl = loadState.blobUrlMap.get(exposeFilename);
    if (!exposeBlobUrl) {
      throw new MfeLoadError(
        `Failed to create blob URL for expose chunk '${exposeFilename}'`,
        entryId
      );
    }

    const exposeModule = await import(/* @vite-ignore */ exposeBlobUrl);

    // Extract module factory (replicates container's moduleMap handler)
    const exportSet = new Set([
      'Module', '__esModule', 'default', '_export_sfc',
    ]);
    const keys = Object.keys(exposeModule as object);
    return keys.every((k) => exportSet.has(k))
      ? () => (exposeModule as Record<string, unknown>).default
      : () => exposeModule;
  }

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

  /**
   * Resolve manifest from reference.
   */
  private async resolveManifest(manifestRef: string | MfManifest): Promise<MfManifest> {
    if (typeof manifestRef === 'object' && manifestRef !== null) {
      if (typeof manifestRef.id !== 'string') {
        throw new MfeLoadError(
          'Inline manifest must have a valid "id" field',
          'inline-manifest'
        );
      }
      if (typeof manifestRef.remoteEntry !== 'string') {
        throw new MfeLoadError(
          `Inline manifest '${manifestRef.id}' must have a valid "remoteEntry" field`,
          manifestRef.id
        );
      }
      if (typeof manifestRef.remoteName !== 'string') {
        throw new MfeLoadError(
          `Inline manifest '${manifestRef.id}' must have a valid "remoteName" field`,
          manifestRef.id
        );
      }
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

  // ---- Share scope construction ----

  /**
   * Build a shareScope for the given manifest.
   *
   * Every dependency with a chunkPath gets a fresh per-load blob URL get().
   * Dependencies without chunkPath are omitted — the MFE falls back to its
   * own bundled copy via the federation runtime's getSharedFromLocal().
   */
  // @cpt-algo:cpt-hai3-algo-mfe-isolation-build-share-scope:p1
  private buildShareScope(
    manifest: MfManifest,
    loadState: LoadBlobState
  ): ShareScope {
    const shareScope: ShareScope = {};

    const deps = manifest.sharedDependencies;
    if (!deps || deps.length === 0) {
      return shareScope;
    }

    for (const dep of deps) {
      if (dep.chunkPath) {
        const blobGet = this.createBlobUrlGet(dep.chunkPath, loadState);
        shareScope[dep.name] = {
          '*': { get: blobGet },
        };
      }
    }

    return shareScope;
  }

  /**
   * Write share scope entries to globalThis.__federation_shared__.
   * Replicates the behavior of container.init(shareScope).
   */
  // @cpt-algo:cpt-hai3-algo-mfe-isolation-write-share-scope:p1
  private writeShareScope(shareScope: ShareScope): void {
    const g = globalThis as Record<string, unknown>;
    const globalShared = (g.__federation_shared__ ?? {}) as Record<
      string,
      Record<string, FederationPackageVersions>
    >;
    g.__federation_shared__ = globalShared;

    for (const [packageName, versions] of Object.entries(shareScope)) {
      for (const [versionKey, versionValue] of Object.entries(versions)) {
        const scope = versionValue.scope || 'default';
        if (!globalShared[scope]) {
          globalShared[scope] = {};
        }
        if (!globalShared[scope][packageName]) {
          globalShared[scope][packageName] = {};
        }
        globalShared[scope][packageName][versionKey] = versionValue;
      }
    }
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
  // @cpt-algo:cpt-hai3-algo-mfe-isolation-blob-url-chain:p1
  private createBlobUrlChain(
    loadState: LoadBlobState,
    filename: string
  ): Promise<void> {
    if (loadState.blobUrlMap.has(filename)) {
      return Promise.resolve();
    }

    const existing = loadState.inFlight.get(filename);
    if (existing) {
      return existing;
    }

    const promise = this.createBlobUrlChainInternal(loadState, filename);
    loadState.inFlight.set(filename, promise);
    return promise;
  }

  private async createBlobUrlChainInternal(
    loadState: LoadBlobState,
    filename: string
  ): Promise<void> {
    const source = await this.fetchSourceText(loadState.baseUrl + filename);
    const deps = this.parseStaticImportFilenames(source, filename);

    for (const dep of deps) {
      await this.createBlobUrlChain(loadState, dep);
    }

    const rewritten = this.rewriteModuleImports(
      source,
      loadState.baseUrl,
      loadState.blobUrlMap,
      filename
    );
    const blob = new Blob([rewritten], { type: 'text/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    loadState.blobUrlMap.set(filename, blobUrl);
  }

  /**
   * Create a blob-URL get() for a shared dependency chunk.
   *
   * The closure captures the per-load shared state so that common transitive
   * dependencies are blob-URL'd once. Each call to get() within the same
   * load reuses existing blob URLs for already-processed modules.
   */
  // @cpt-algo:cpt-hai3-algo-mfe-isolation-blob-url-get:p1
  private createBlobUrlGet(
    chunkPath: string,
    loadState: LoadBlobState
  ): () => Promise<() => unknown> {
    return async (): Promise<() => unknown> => {
      await this.createBlobUrlChain(loadState, chunkPath);
      const blobUrl = loadState.blobUrlMap.get(chunkPath);
      if (!blobUrl) {
        const attemptedUrl = loadState.baseUrl + chunkPath;
        throw new MfeLoadError(
          `Failed to create blob URL for shared dependency '${chunkPath}' (tried: ${attemptedUrl}). ` +
            'Ensure the MFE dev server is running and serving shared chunks (e.g. run "npm run dev:all" or start the MFE separately).',
          loadState.entryId
        );
      }
      const module = await import(/* @vite-ignore */ blobUrl);
      return () => module;
    };
  }

  // ---- Source text fetching and parsing ----

  /**
   * Fetch the source text of a chunk. Uses an in-memory cache so each URL
   * is fetched at most once across all loads.
   */
  // @cpt-algo:cpt-hai3-algo-mfe-isolation-fetch-source:p1
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
        return response.text();
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
   * Parse the remoteEntry source to find the expose chunk filename.
   *
   * Matches the moduleMap entry pattern:
   *   "./lifecycle-helloworld":()=>{
   *     ...
   *     return __federation_import('./__federation_expose_Lifecycle-helloworld-CeX0Lwd2.js')...
   *   }
   */
  // @cpt-algo:cpt-hai3-algo-mfe-isolation-parse-expose-chunk:p1
  private parseExposeChunkFilename(
    remoteEntrySource: string,
    exposedModule: string
  ): string | null {
    const escaped = exposedModule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `"${escaped}"[^}]*__federation_import\\(['"]\\.\\/([^'"]+)['"]\\)`
    );
    const match = regex.exec(remoteEntrySource);
    return match ? match[1] : null;
  }

  /**
   * Extract resolved filenames from static import statements.
   *
   * Matches all relative imports (both './' and '../' prefixed) and resolves
   * them relative to the importing chunk's path. For example, a chunk at
   * '__federation_shared_@gears-frontx/react.js' importing '../runtime.js' resolves
   * to 'runtime.js' (relative to baseUrl).
   */
  // @cpt-algo:cpt-hai3-algo-mfe-isolation-parse-imports:p1
  private parseStaticImportFilenames(
    source: string,
    chunkFilename: string
  ): string[] {
    const filenames: string[] = [];

    // Named imports: import { x } from './dep.js'  /  export { x } from './dep.js'
    const namedRegex = /from\s+['"](\.\.?\/[^'"]+)['"]/g;
    let match;
    while ((match = namedRegex.exec(source)) !== null) {
      filenames.push(this.resolveRelativePath(chunkFilename, match[1]));
    }

    // Bare side-effect imports: import './dep.js'
    const bareRegex = /(?:^|;|\n)\s*import\s+['"](\.\.?\/[^'"]+)['"]\s*;/g;
    while ((match = bareRegex.exec(source)) !== null) {
      filenames.push(this.resolveRelativePath(chunkFilename, match[1]));
    }

    return [...new Set(filenames)];
  }

  /**
   * Rewrite all relative imports in a module's source text.
   *
   * Handles both './' and '../' relative imports. Each relative specifier
   * is resolved against the chunk's own path to produce a normalized key
   * for the blobUrlMap lookup. Unmatched imports fall back to absolute URLs.
   */
  // @cpt-algo:cpt-hai3-algo-mfe-isolation-rewrite-module-imports:p1
  private rewriteModuleImports(
    source: string,
    baseUrl: string,
    blobUrlMap: Map<string, string>,
    chunkFilename: string
  ): string {
    const resolve = (relPath: string): string => {
      const resolved = this.resolveRelativePath(chunkFilename, relPath);
      const blobUrl = blobUrlMap.get(resolved);
      return blobUrl ?? `${baseUrl}${resolved}`;
    };

    // Static imports: from './...' or from '../...'
    let result = source.replace(
      /from\s+'(\.\.?\/[^']+)'/g,
      (_match, relPath: string) => `from '${resolve(relPath)}'`
    );
    result = result.replace(
      /from\s+"(\.\.?\/[^"]+)"/g,
      (_match, relPath: string) => `from "${resolve(relPath)}"`
    );

    // Dynamic imports: import('./...') or import('../...')
    result = result.replace(
      /import\(\s*'(\.\.?\/[^']+)'\s*\)/g,
      (_match, relPath: string) => `import('${resolve(relPath)}')`
    );
    result = result.replace(
      /import\(\s*"(\.\.?\/[^"]+)"\s*\)/g,
      (_match, relPath: string) => `import("${resolve(relPath)}")`
    );

    // Bare side-effect imports: import './dep.js'
    result = result.replace(
      /import\s+'(\.\.?\/[^']+)'\s*;/g,
      (_match, relPath: string) => `import '${resolve(relPath)}';`
    );
    result = result.replace(
      /import\s+"(\.\.?\/[^"]+)"\s*;/g,
      (_match, relPath: string) => `import "${resolve(relPath)}";`
    );

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
    const syntheticBase = 'http://r/';
    const fromUrl = new URL(fromChunkFilename, syntheticBase);
    const resolved = new URL(relativeSpecifier, fromUrl);
    return resolved.pathname.slice(1); // strip leading '/'
  }
}

export { MfeHandlerMF };
