/**
 * Whole-package loader: the shared-dependency half of a load whose
 * manifest holds neither `units` nor `lists`. It fetches the standalone ESM
 * file of every `manifest.shared[]` entry, admits each under its
 * `name@version@…` key to the realm cache, and mints per load in the
 * dependency order the fetched sources themselves give — leaves first,
 * every entry's bare specifiers rewritten to the blob URLs of the entries
 * it imports (`cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls`).
 * The fetch-list path is `SharedDepListLoader`; `MfeHandlerMF` chooses
 * between them from the manifest alone.
 *
 * One class per file (`runtime_style`).
 *
 * @packageDocumentation
 * @internal
 */

import { MfeLoadError } from '../../errors';
import { DynamicImportScan, type UnitScan } from '../../unit-format/dynamic-import-scan';
import type { MfManifest, MfManifestShared } from '../../manifest/mf-manifest';
import { LazyLoaderRegistry } from '../../lazy-loader/LazyLoaderRegistry';
import type { AttemptSourceTextLedger } from './AttemptSourceTextLedger';
import { MAX_CONCURRENT_FETCHES } from './FetchBudget';
import { ImportMetaUrlRewriter } from './ImportMetaUrlRewriter';
import { SourceSplice } from './SourceSplice';
import type { LruCache } from './LruCache';
import { DynamicModuleOps } from './mf-dynamic-module-ops';
import { SharedDepSpecifierScan } from './mf-shared-dep-specifier-scan';
import type { SharedDepTextCache } from './RealmSharedDepTextCacheProvider';
import { SharedAssetUrlResolver } from './SharedAssetUrlResolver';
import { SharedTextAdmission } from './SharedTextAdmission';
import { UnitDynamicImportRewriter } from './UnitDynamicImportRewriter';

/** What a whole-package load hands back to the load that built it. */
export interface WholePackageLoad {
  /** Package name → the blob URL minted for its entry. */
  readonly urls: Map<string, string>;
  /**
   * Binds the lazy-target resolution of the load once its per-load state
   * exists: the whole-package entries mint before that state, yet their
   * `__frontx_lazy` calls resolve through it. A call made before this is
   * bound fails naming the load.
   */
  readonly bindLazyTarget: (
    resolve: (filename: string) => Promise<string>
  ) => void;
}

/** What the mint of one entry needs to route its dynamic imports to the ABI. */
interface EntryLazy {
  readonly chunkPaths: ReadonlyMap<string, string>;
  readonly loaderUrl: () => string;
}

/**
 * Run `task` over `items` with at most {@link MAX_CONCURRENT_FETCHES}
 * concurrent in-flight invocations. Returns one settled result per item, in
 * the SAME order as `items` (not completion order), so a caller that needs
 * declaration-order error reporting scans the returned array in order for
 * the first `rejected` entry.
 *
 * Each `task` invocation runs synchronously up to its first `await` before
 * the pool moves on to start the next one, so a synchronous check-then-set
 * a caller performs before its own first `await` (a cache lookup followed by
 * issuing a fetch) is preserved relative to that item's own fetch.
 */
async function boundedMap<T, R>(
  items: readonly T[],
  task: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: 'fulfilled', value: await task(items[index]) };
      } catch (error) {
        results[index] = { status: 'rejected', reason: error };
      }
    }
  };
  const workerCount = Math.min(MAX_CONCURRENT_FETCHES, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * Name the shared dependencies left unresolved by a stalled dependency-order
 * pass, together with the imports among them that close the cycle.
 */
function describeSharedDepCycle(
  pending: ReadonlyMap<string, ReadonlySet<string>>
): string {
  const names = [...pending.keys()];
  return names
    .map((name) => {
      const importsOthers = names.filter(
        (other) => other !== name && pending.get(name)?.has(other) === true
      );
      return importsOthers.length > 0
        ? `'${name}' (imports ${importsOthers.map((o) => `'${o}'`).join(', ')})`
        : `'${name}'`;
    })
    .join(', ');
}

export class WholePackageLoader {
  constructor(
    private readonly cache: SharedDepTextCache,
    /** Fetches one URL's source text through the handler source-text cache. */
    private readonly fetchText: (
      url: string,
      ledger?: AttemptSourceTextLedger
    ) => Promise<string>,
    /**
     * Pairs that already received the adoption notice, so it fires at most
     * once per pair across every load of the handler.
     */
    private readonly adoptionNotices: LruCache<string, true>
  ) {}

  /**
   * Fetch every shared entry the manifest declares and mint them leaves
   * first. The names are already known to be unique within the manifest.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-whole-package-path
  async load(
    manifest: MfManifest,
    baseUrl: string,
    entryId: string,
    extensionId: string,
    ledger?: AttemptSourceTextLedger
  ): Promise<WholePackageLoad> {
    const locations = this.resolveLocations(manifest, baseUrl, entryId);
    const sources = await this.fetchSources(manifest, locations, ledger);
    const sharedNames = new Set(locations.keys());
    const urls = new Map<string, string>();
    let bound: ((filename: string) => Promise<string>) | undefined;
    let unitLoaderUrl: string | undefined;
    const lazy: EntryLazy = {
      // The resolved fetch location, so the caller a call names and the
      // base it resolves against agree with the URL the entry came from.
      chunkPaths: locations,
      loaderUrl: () => {
        if (unitLoaderUrl === undefined) {
          const registry = LazyLoaderRegistry.ensureExposed();
          const loaderId = registry.register((argument) =>
            this.resolveImport(argument, bound, baseUrl, entryId, urls)
          );
          unitLoaderUrl = URL.createObjectURL(
            new Blob([DynamicModuleOps.buildLazyLoaderStubSource(loaderId)], {
              type: 'text/javascript',
            })
          );
        }
        return unitLoaderUrl;
      },
    };
    const minted = this.mintInDependencyOrder(sources, sharedNames, entryId, extensionId, lazy);
    for (const [name, blob] of minted) urls.set(name, blob);
    return {
      urls,
      bindLazyTarget: (resolve) => {
        bound = resolve;
      },
    };
  }
  // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-whole-package-path

  /**
   * The absolute fetch URL of every declared shared entry, by package name.
   * Every URL is derived before the first fetch, so a refused `chunkPath`
   * fails the load with nothing fetched.
   */
  resolveLocations(
    manifest: MfManifest,
    baseUrl: string,
    entryId: string
  ): Map<string, string> {
    return new Map(
      (manifest.shared ?? []).map((dep) => [
        dep.name,
        WholePackageLoader.resolveChunkPath(dep, baseUrl, entryId),
      ])
    );
  }

  /**
   * The absolute fetch URL of a shared dependency's `chunkPath`, by the
   * shared-file location rule (`SharedAssetUrlResolver`), the refusal naming
   * the dependency. The refusal depends only on the manifest.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-resolve-chunk-path
  // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-derive-url
  private static resolveChunkPath(
    dep: MfManifestShared,
    baseUrl: string,
    entryId: string
  ): string {
    // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-if-manifest-invalid
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-resolve-location
    try {
      return SharedAssetUrlResolver.resolve(dep.chunkPath, baseUrl, entryId);
      // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-resolve-location
    } catch (error) {
      // @cpt-begin:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-manifest-invalid-fail
      throw new MfeLoadError(
        `manifest.shared "${dep.name}" chunkPath "${String(dep.chunkPath)}" is neither ` +
          'an http(s) URL of a file nor a file path that stays under ' +
          'manifest.metaData.publicPath.',
        entryId,
        error instanceof Error ? error : undefined
      );
      // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-manifest-invalid-fail
    }
    // @cpt-end:cpt-frontx-flow-mfe-loading-on-demand-load:p1:inst-if-manifest-invalid
  }
  // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-derive-url
  // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-resolve-chunk-path

  /**
   * Fetch standalone ESM source text for each shared dep. The realm cache
   * dedups on a two-tier key: when a `contentHash` is declared, the key is
   * `name@version@contentHash` and reuse spans ALL MFEs; without one, the key
   * falls back to `name@version@<resolved chunk URL>`, so reuse is scoped to
   * that one manifest's own URL.
   *
   * A rejected fetch surfaces only once every sibling in the batch has
   * settled, and the failure reported is the first in the manifest's
   * declaration order, not whichever fetch lost the wall-clock race.
   */
  async fetchSources(
    manifest: MfManifest,
    locations: ReadonlyMap<string, string>,
    ledger?: AttemptSourceTextLedger
  ): Promise<Map<string, string>> {
    const resolved = (manifest.shared ?? []).flatMap((dep) => {
      const absoluteUrl = locations.get(dep.name);
      return absoluteUrl === undefined ? [] : [{ dep, absoluteUrl }];
    });
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-for-each-shared
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-for-each-shared-dep
    // Enumeration order governs cache-key precedence only, not fetch
    // issuance order. Each dep's cache-get → fetch → eviction-on-rejection →
    // cache-set sequence runs synchronously relative to that dep's own
    // fetch, which keeps the cross-MFE dedup race-free however the fetches
    // interleave.
    const settled = await boundedMap(resolved, async ({ dep, absoluteUrl }) => {
      let cacheKey: string;
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-if-hash-declared
      if (dep.contentHash !== undefined) {
        // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-compute-key-hash
        cacheKey = SharedTextAdmission.wholePackageKey(dep.name, dep.version, dep.contentHash);
        // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-compute-key-hash
      } else {
        // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-else-no-hash
        // @cpt-begin:cpt-frontx-algo-unit-format-contract-shared-text-admission:p1:inst-if-no-identity
        // @cpt-begin:cpt-frontx-algo-unit-format-contract-shared-text-admission:p1:inst-admit-whole-package-by-location
        // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-compute-key-fallback
        cacheKey = SharedTextAdmission.wholePackageKey(dep.name, dep.version, absoluteUrl);
        // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-compute-key-fallback
        // @cpt-end:cpt-frontx-algo-unit-format-contract-shared-text-admission:p1:inst-admit-whole-package-by-location
        // @cpt-end:cpt-frontx-algo-unit-format-contract-shared-text-admission:p1:inst-if-no-identity
        // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-emit-adoption-notice
        const noticeKey = `${dep.name}@${dep.version}@${manifest.id}`;
        if (!this.adoptionNotices.has(noticeKey)) {
          this.adoptionNotices.set(noticeKey, true);
          console.warn(
            `Shared dependency '${dep.name}@${dep.version}' declared by ` +
              `manifest '${manifest.id}' carries no contentHash. ` +
              'Cross-MFE reuse is disabled for this dependency; its source ' +
              "text will be keyed on this manifest's own resolved chunk " +
              'URL rather than shared with other microfrontends declaring ' +
              'the same name@version.'
          );
        }
        // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-emit-adoption-notice
        // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-else-no-hash
      }
      // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-if-hash-declared

      // The realm cache this copy resolved at construction — the
      // realm-shared cache every compatible independently loaded copy
      // converges on, or this copy's own local fallback
      // (`cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous`).
      // `SharedTextAdmission` answers from a resident or in-flight entry
      // under `cacheKey`, otherwise publishes this fetch's in-flight promise
      // before awaiting it, evicts it on rejection under the identity
      // check, and records the entry on the attempt's ledger so a timeout
      // releases it. The text is admitted as fetched; the declared hash is
      // only the sharing key.
      // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-fetch-shared-dep
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-else-fetch
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-fetch-and-cache
      // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-admit-under-declared-identity
      const textPromise = new SharedTextAdmission(this.cache, ledger).admit(
        cacheKey,
        absoluteUrl,
        (url) => this.fetchText(url, ledger)
      );
      // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-admit-under-declared-identity
      // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-fetch-and-cache
      // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-else-fetch
      // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-fetch-shared-dep
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-if-cache-hit
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-retrieve-cached
      // Whether `textPromise` was just published or was already resident,
      // this `await` is the sole retrieval step either way.
      const text = await textPromise;
      // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-retrieve-cached
      // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-if-cache-hit
      return { name: dep.name, text };
    });
    // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-for-each-shared-dep
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-for-each-shared

    const failure = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    if (failure) {
      throw failure.reason;
    }
    const sources = new Map<string, string>();
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        sources.set(result.value.name, result.value.text);
      }
    }
    return sources;
  }

  /**
   * Create blob URLs in dependency order: leaves first, dependents follow.
   *
   * The order is derived from the fetched sources themselves rather than
   * from `manifest.shared[]`'s enumeration order. Shared dependencies that
   * import one another circularly admit no such order, and minting them
   * anyway would leave their bare specifiers unrewritten inside a blob that
   * therefore cannot be instantiated at all — so that case fails the load
   * with a diagnostic naming them.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-resolve-order
  private mintInDependencyOrder(
    sources: ReadonlyMap<string, string>,
    sharedNames: ReadonlySet<string>,
    entryId: string,
    extensionId: string,
    lazy: EntryLazy
  ): Map<string, string> {
    const blobUrls = new Map<string, string>();
    // What each entry still has to wait for: the declared names its text
    // imports through a real static import or re-export. Each text is read
    // once; the scan is kept for its mint.
    const pending = new Map<string, Set<string>>();
    const scans = new Map<string, UnitScan>();
    for (const [name, source] of sources) {
      const scan = DynamicImportScan.scan(source);
      scans.set(name, scan);
      const imported = new Set(scan.imports.map((record) => record.specifier));
      pending.set(
        name,
        new Set([...sharedNames].filter((other) => other !== name && imported.has(other)))
      );
    }

    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-mint-serialised
    // The whole-package entries mint leaves-first in this one synchronous
    // call, so no other mint of the load interleaves with them.
    while (pending.size > 0) {
      const before = pending.size;
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-for-each-resolved
      for (const [name, waitsFor] of pending) {
        if ([...waitsFor].every((other) => blobUrls.has(other))) {
          blobUrls.set(
            name,
            this.mintEntry(
              sources.get(name) ?? '',
              scans.get(name) ?? DynamicImportScan.scan(''),
              blobUrls,
              sharedNames,
              name,
              entryId,
              extensionId,
              lazy
            )
          );
          pending.delete(name);
        }
      }
      // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-for-each-resolved
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-if-shared-cycle
      if (pending.size === before) {
        // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-raise-shared-cycle
        throw new MfeLoadError(
          'circular shared dependencies: no dependency order exists over ' +
            `${describeSharedDepCycle(pending)}. ` +
            'Minting them anyway would leave those bare specifiers ' +
            'unrewritten inside blobs that cannot be instantiated. ' +
            'Rebuild the microfrontend so that its shared dependencies ' +
            'do not import one another circularly.',
          entryId
        );
        // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-raise-shared-cycle
      }
      // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-if-shared-cycle
    }
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-mint-serialised
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-return-map
    return blobUrls;
    // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-return-map
  }
  // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-resolve-order

  private mintEntry(
    source: string,
    scan: UnitScan,
    blobUrls: ReadonlyMap<string, string>,
    sharedNames: ReadonlySet<string>,
    depName: string,
    entryId: string,
    extensionId: string,
    lazy: EntryLazy
  ): string {
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-rewrite-specifiers
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-rewrite-specifiers
    const edits = DynamicModuleOps.specifierEdits(source, scan.imports, blobUrls);
    // What the rewrite left unbound: the records no blob replaced.
    const surviving = scan.imports.filter(
      (record) => !blobUrls.has(record.specifier)
    );
    // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-rewrite-specifiers
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-rewrite-specifiers
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-assert-shared-dep-no-bare-specifier
    const survivor = DynamicModuleOps.findSurvivingDeclaredSharedDepSpecifier(
      surviving,
      sharedNames
    );
    // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-assert-shared-dep-no-bare-specifier
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-if-shared-dep-bare-specifier
    if (survivor !== undefined) {
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-raise-shared-dep-bare-specifier
      throw new MfeLoadError(
        `shared-dep chunk '${depName}' still imports the bare specifier ` +
          `'${survivor}' after rewriting its declared shared ` +
          `dependencies, for microfrontend '${extensionId}'. Every ` +
          'declared shared-dependency name that survives rewriting must ' +
          'resolve to a blob URL; this indicates a rewrite defect, UNLESS ' +
          `'${survivor}' names '${depName}' itself — a chunk cannot ` +
          "import its own not-yet-minted blob URL, so a shared dep that " +
          'bare-imports its own package name is a build problem of that package, ' +
          'not a rewrite defect in this handler.',
        entryId
      );
      // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-raise-shared-dep-bare-specifier
    }
    // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-if-shared-dep-bare-specifier
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-if-undeclared-specifier
    for (const specifier of SharedDepSpecifierScan.findUndeclaredWellFormedSpecifiers(
      surviving,
      sharedNames
    )) {
      // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-warn-undeclared-specifier
      console.warn(
        `shared-dep chunk '${depName}' imports '${specifier}', which is ` +
          `not declared by the manifest, for microfrontend ` +
          `'${extensionId}'. This specifier cannot resolve inside an ` +
          'isolated module; have the manifest declare it if it should ' +
          'be shared, or remove the import if it is unused. The load ' +
          'proceeds — this is a diagnostic only.'
      );
      // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-warn-undeclared-specifier
    }
    // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-if-undeclared-specifier
    // @cpt-begin:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-mint-shared-blob
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-create-dep-blob
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-whole-package-meta-url
    // Only the text that becomes the blob changes: the entry's cached
    // bytes stay as fetched. A declared entry always has its resolved
    // location, so relative URL resolution survives blob evaluation.
    const location = lazy.chunkPaths.get(depName);
    if (location !== undefined) {
      edits.push(...ImportMetaUrlRewriter.edits(scan.metaUrls, location));
    }
    // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-whole-package-meta-url
    // @cpt-begin:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-rewrite-shared-dynamic-imports
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-rewrite-whole-package-dynamic-imports
    // Every literal and bounded-pattern dynamic import of the entry reaches
    // the load's lazy-import ABI; the fetched bytes stay as they are.
    const minted =
      location === undefined
        ? SourceSplice.apply(source, edits)
        : UnitDynamicImportRewriter.rewrite(
            source,
            scan.calls,
            lazy.loaderUrl,
            location,
            edits
          );
    // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-rewrite-whole-package-dynamic-imports
    // @cpt-end:cpt-frontx-algo-mfe-loading-lazy-import-abi:p1:inst-lai-rewrite-shared-dynamic-imports
    return URL.createObjectURL(new Blob([minted], { type: 'text/javascript' }));
    // @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-create-dep-blob
    // @cpt-end:cpt-frontx-algo-mfe-loading-manifest-discovery:p1:inst-md-mint-shared-blob
  }

  /**
   * The resolver behind every `__frontx_lazy(...)` call minted into a
   * whole-package entry: the path resolves against the entry's resolved
   * location, and the target and the own chunks it reaches are found by
   * walking the chunk graph from it (`inst-lai-walk-chunk-graph`). A bare
   * specifier is the whole-package unit of that name in the per-load map.
   */
  private resolveImport(
    argument: string,
    resolveTarget: ((filename: string) => Promise<string>) | undefined,
    baseUrl: string,
    entryId: string,
    urls: ReadonlyMap<string, string>
  ): Promise<string> {
    const fail = (detail: string): Promise<string> =>
      Promise.reject(new MfeLoadError(detail, entryId));
    const split = UnitDynamicImportRewriter.splitCallerArgument(argument);
    if (split === undefined) {
      return fail(`__frontx_lazy: unresolvable argument '${argument}'`);
    }
    const { caller, path } = split;
    if (!(path.startsWith('./') || path.startsWith('../'))) {
      const unit = urls.get(path);
      return unit === undefined
        ? fail(
            `__frontx_lazy: whole-package entry '${caller}' imports ` +
              `'${path}', which names no whole-package unit of the load.`
          )
        : Promise.resolve(unit);
    }
    if (resolveTarget === undefined) {
      return fail(
        `__frontx_lazy: '${path}' was requested before the load of ` +
          `'${entryId}' completed.`
      );
    }
    const target = new URL(path, new URL(caller, baseUrl)).href;
    return resolveTarget(
      target.startsWith(baseUrl) ? target.slice(baseUrl.length) : target
    );
  }
}
