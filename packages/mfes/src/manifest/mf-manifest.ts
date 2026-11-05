/**
 * Module Federation Manifest Type Definitions
 *
 * MfManifest contains package-level Module Federation 2.0 metadata shared
 * across all entries from the same MFE package. Per-module data (expose chunk
 * paths) is carried by MfeEntryMF.exposeAssets, not here.
 *
 * @packageDocumentation
 */
// @cpt-dod:cpt-frontx-dod-mfe-loading-manifest-field-discovery:p1

/**
 * Asset file lists for a module or shared dependency.
 */
export interface MfManifestAssets {
  js: {
    /** Synchronous JS chunks loaded eagerly at module evaluation time. */
    sync: string[];
    /** Asynchronous (lazy) JS chunks. */
    async: string[];
  };
  css: {
    /** Synchronous CSS files injected at mount time. */
    sync: string[];
    /** Asynchronous CSS files. */
    async: string[];
  };
}

/**
 * A reference to a shared package's graph file, by location and content
 * identity.
 *
 * There is one content-addressed graph file per package version. It
 * expresses the package's units; each unit's content identity; each
 * unit's bare imports and relative imports; which module paths belong
 * to which unit; whether the package is split into units or delivered as
 * a single unit, and why; the producer and its version; and, optionally,
 * a whole-package pack with its own content identity
 * (see `cpt-frontx-adr-shared-dep-reuse`).
 *
 * The manifest references each shared package's graph file so the runtime
 * can close the manifest-declared roots over the graph file to determine
 * the reachable unit set before fetching (see
 * `cpt-frontx-adr-mfe-asset-discovery`).
 */
export interface MfManifestGraphFileRef {
  /**
   * Location of the graph file: an absolute URL starting with `http://` or
   * `https://` (in any case), fetched at its parsed form, or a path
   * relative to the manifest's shared base location when one is given
   * (`metaData.sharedBase`), and otherwise relative to the asset base
   * location (`metaData.publicPath`). Resolved by the same rules as a
   * shared-dependency `chunkPath`
   * (`cpt-frontx-algo-mfe-loading-manifest-discovery`,
   * `inst-md-resolve-chunk-path`).
   */
  location: string;
  /**
   * Expected SHA-256 hex digest (64 lowercase hex characters) of the
   * graph file `location` points at. The runtime verifies every fetched
   * graph file against this declared content identity before it is used
   * or cached; a mismatch fails the load, is reported through the
   * runtime's diagnostics, and the mismatching text is never cached.
   * The graph file in turn lists each unit's content hash
   * (see `cpt-frontx-adr-mfe-asset-discovery`).
   */
  contentHash: string;
}

/**
 * A single shared dependency entry from `MfManifest.shared[]`.
 * Declares a standalone ESM dependency with a resolved version and an
 * MFE-relative chunkPath to its standalone bundle.
 */
export interface MfManifestShared {
  /** npm package name (e.g. 'react', '@gears-frontx/mfes'). */
  name: string;
  /** Concrete resolved version (e.g. '19.2.4'). */
  version: string;
  /**
   * The standalone ESM file for this dependency: an absolute URL starting
   * with 'http://' or 'https://' (in any case), fetched at its parsed form,
   * or a path
   * relative to the MFE's publicPath (e.g. "shared/react.js"), resolved
   * against publicPath to form the fetch URL; a leading '/' is joined under
   * publicPath, not the origin root. The resolved URL must stay under
   * publicPath, and either way it must name a file: the resolved path must
   * not end with '/'. Any
   * other value, such as a protocol-relative '//host/x.js', another URL
   * scheme (also behind a leading '/'), a path that climbs out of publicPath
   * with '..', a value containing a backslash, a space or a control
   * character, or a value that resolves to a directory ('/', '.', '?v=1',
   * '#x'),
   * fails the load.
   * This is the contract of the mfe-loading FEATURE
   * (`cpt-frontx-algo-mfe-loading-manifest-discovery`,
   * `inst-md-resolve-chunk-path`), which binds every manifest producer.
   */
  chunkPath: string;
  /**
   * Named export key to unwrap the module from the chunk.
   * Null when the chunk exports the module directly (no unwrap needed).
   */
  unwrapKey: string | null;
  /**
   * Optional content hash of this entry's emitted chunk, published by the
   * producing build. When present, the runtime's cross-MFE shared-dep
   * source-text cache keys reuse on this hash rather than on name@version
   * alone, so reuse only ever happens between loads that agree on the
   * identity of the emitted build (see `cpt-frontx-adr-shared-dep-reuse`).
   * Absent for producing builds that have not adopted it.
   */
  contentHash?: string;
  /**
   * Optional reference to this package's graph file, by location and
   * content identity. When present, the runtime fetches and verifies the
   * graph file, then closes the manifest-declared roots over it to
   * determine the reachable units before fetching — so a load fetches
   * only the units its entry reaches rather than every declared shared
   * entry (see `cpt-frontx-adr-mfe-asset-discovery`). Absent for producing
   * builds that have not adopted graph files; in that case the runtime
   * falls back to fetching the whole-package entry at `chunkPath`.
   */
  graphFile?: MfManifestGraphFileRef;
  /**
   * Optional package-level bare requirements for this shared dependency:
   * every external package the package's units need, declared as bare
   * package names. When present, the runtime checks the union of every
   * entry's `requires` against the manifest's `shared[]` set before any
   * shared-dependency fetch, failing with an error naming any missing
   * package
   * (`cpt-frontx-algo-mfe-loading-manifest-discovery`,
   * `inst-md-requires-closure`).
   * Absent for producing builds that have not adopted it; the runtime
   * then falls back to the heuristic undeclared-specifier diagnostic.
   * Entries MUST be bare package names (e.g. `'react'`, `'@scope/pkg'`),
   * not version specifiers, subpath specifiers (e.g.
   * `'react/jsx-runtime'`), or paths.
   */
  requires?: string[];
  /**
   * Optional identifier of the production rule that produced this shared
   * entry (which fixes, among other things, its chunk naming), recorded
   * for rollout compatibility (see `cpt-frontx-adr-shared-dep-reuse`).
   * When present, mismatch warnings compare only same-rule entries, and
   * old-vs-new mismatches are summarized once per page. Absent for
   * producing builds that have not adopted it; the runtime treats an
   * absent value as the default/legacy rule.
   */
  sharedChunkRule?: string;
}

/**
 * RemoteEntry descriptor from `MfManifestMetaData.remoteEntry`.
 */
export interface MfManifestRemoteEntry {
  /** Filename of the remote entry (e.g. 'remoteEntry.js'). */
  name: string;
  /** Path prefix relative to publicPath. Empty string means publicPath root. */
  path: string;
  /** Module type: 'module' (ESM) or 'global' (IIFE/UMD). */
  type: string;
}

/**
 * Build information from `MfManifestMetaData.buildInfo`.
 */
export interface MfManifestBuildInfo {
  buildVersion: string;
  buildName: string;
}

/**
 * Package-level metadata from `MfManifest.metaData`.
 * Contains everything needed to locate and load remote chunks.
 */
export interface MfManifestMetaData {
  /** MFE application/library name. */
  name: string;
  /** Application type (e.g. 'app', 'lib'). */
  type: string;
  /** Build metadata. */
  buildInfo: MfManifestBuildInfo;
  /** Remote entry file descriptor. */
  remoteEntry: MfManifestRemoteEntry;
  /**
   * Global variable name used by the MF 2.0 runtime, when emitted.
   * Optional to match the `mf_manifest.v1` GTS schema, which does not
   * require this field.
   */
  globalName?: string;
  /**
   * Public URL base path for all chunk assets.
   * All relative chunk paths in shared[].assets and expose assets are
   * resolved against this value (e.g. 'http://localhost:3001/' or '/').
   * A relative value ('/' or a document-relative path) is resolved against
   * the host document's base URL (`document.baseURI`) when the MFE is
   * loaded, and every relative chunk, shared-dependency and stylesheet path
   * resolves against that absolute base. The base always ends with '/': a value without
   * a trailing '/' names a directory ('https://cdn/mfe/x' is
   * 'https://cdn/mfe/x/'), and a query or hash is dropped. The empty string
   * names the document's own directory, like './'. A relative value needs a
   * host document; outside one, publicPath must be absolute. The resolved
   * URL must be http(s); any other scheme, such as data:, blob:, javascript:
   * or file:, fails the load. This is the contract of the mfe-loading
   * FEATURE (`cpt-frontx-algo-mfe-loading-manifest-discovery`,
   * `inst-md-read-public-path`), which binds every manifest producer.
   */
  publicPath: string;
  /**
   * Optional shared-file base location for resolving shared-file
   * locations — graph-file locations, unit, pack and whole-package
   * `chunkPath` locations — separate from the asset base location
   * (`publicPath`). When present, every shared-file location the manifest
   * carries resolves against this value by the same rules as
   * `chunkPath` resolves against `publicPath`
   * (`cpt-frontx-algo-mfe-loading-manifest-discovery`,
   * `inst-md-resolve-chunk-path`). When absent, shared-file locations
   * resolve relative to the asset base location (`publicPath`) instead.
   * An absolute value (http(s) URL) resolves to itself; a relative value
   * resolves against the host document's base URL, and every shared-file
   * path resolves against that absolute base. The resolved URL must be
   * http(s); any other scheme fails the load. This is the contract of the
   * mfe-loading FEATURE, which binds every manifest producer
   * (see `cpt-frontx-adr-mfe-asset-discovery`).
   */
  sharedBase?: string;
}

/**
 * A unit identifier within a shared package, identifying one strongly
 * connected component of the package's own module graph (usually a single
 * module, or the whole cycle when the module is part of an import cycle).
 *
 * Identity: package name, package version, and the module path or paths
 * the unit contains (see `cpt-frontx-adr-shared-dep-reuse`).
 */
export interface MfManifestUnitId {
  /** Package name as declared in the manifest's `shared[]`. */
  name: string;
  /** Package version as declared in the manifest's `shared[]`. */
  version: string;
  /** Module path or paths belonging to this unit within the package. */
  modulePaths: string[];
}

/**
 * A reachability root: the shared code an exposed entry or a lazily
 * loaded chunk reaches directly.
 *
 * Either a package reference — the package name as a string, resolved
 * against the manifest's `shared[]` entries — or a unit identifier
 * (package name, version, and module paths, as the graph file's format
 * contract provides). The runtime closes the roots over the packages'
 * graph files to determine the reachable unit set before fetching
 * (see `cpt-frontx-adr-mfe-asset-discovery`).
 */
export type MfManifestRoot = string | MfManifestUnitId;

/**
 * MFE manifest — package-level metadata for an MFE package.
 *
 * Contains metaData (publicPath, remoteEntry descriptor) and shared[]
 * (standalone ESM deps with resolved versions and chunkPaths).
 *
 * Per-module expose chunk paths are stored separately on MfeEntryMF.exposeAssets.
 *
 * GTS Type: gts.frontx.mfes.mfe.mf_manifest.v1~
 */
export interface MfManifest {
  /** The GTS type ID for this manifest. */
  id: string;
  /** Human-readable MFE name, matches metaData.name. */
  name: string;
  /** Package-level metadata: publicPath, remoteEntry descriptor, etc. */
  metaData: MfManifestMetaData;
  /** Shared dependency declarations with chunk paths and unwrap keys. */
  shared: MfManifestShared[];
  /**
   * Roots per exposed entry: which shared code each exposed entry reaches
   * directly — the entry's roots. Keyed by the exposed module name (e.g.
   * `'./lifecycle'`), matching the `exposedModule` on the MFE entry that
   * references this manifest. The runtime closes these roots over the
   * packages' graph files to determine the reachable unit set before
   * fetching, so a load fetches only the units its entry reaches rather
   * than every declared shared entry. Absent when the producing build
   * has not adopted roots — the runtime then falls back to fetching every
   * declared shared entry and reports that through diagnostics
   * (see `cpt-frontx-adr-mfe-asset-discovery`,
   * `cpt-frontx-algo-mfe-loading-manifest-discovery`).
   */
  entryRoots?: Record<string, MfManifestRoot[]>;
  /**
   * Roots per lazily loaded chunk: which shared code each lazily loaded
   * chunk reaches directly. Keyed by the chunk path relative to the asset
   * base URL. The runtime determines and fetches the units a lazy chunk
   * reaches — its manifest-declared roots, closed over the packages'
   * graph files — when that chunk loads, adding them to the parent load's
   * per-load unit map. Units already in the map are reused as they are and
   * an existing entry is never replaced
   * (`cpt-frontx-algo-mfe-loading-lazy-import-abi`, `inst-lai-lazy-roots`).
   * Absent when the producing build has not adopted lazy-chunk roots
   * (see `cpt-frontx-adr-mfe-asset-discovery`).
   */
  lazyChunkRoots?: Record<string, MfManifestRoot[]>;
}
