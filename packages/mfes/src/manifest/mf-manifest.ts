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
   * with 'http://' or 'https://', fetched at its parsed form, or a path
   * relative to the MFE's publicPath (e.g. "shared/react.js"), resolved
   * against publicPath to form the fetch URL; a leading '/' is joined under
   * publicPath, not the origin root. The resolved URL must stay under
   * publicPath, and either way it must name a file, not a directory. Any
   * other value, such as a protocol-relative '//host/x.js', another URL
   * scheme (also behind a leading '/'), a path that climbs out of publicPath
   * with '..', a value containing a backslash, a space or a control
   * character, or a value that resolves to a directory ('/', '.', '?v=1'),
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
   * identity of the emitted build (see `cpt-frontx-adr-shared-dep-dedup-key`).
   * Absent for producing builds that have not adopted it.
   */
  contentHash?: string;
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
}

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
}
