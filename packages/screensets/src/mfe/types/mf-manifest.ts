/**
 * Module Federation Manifest Type Definitions
 *
 * MfManifest contains Module Federation 2.0 configuration for loading MFE bundles.
 *
 * @packageDocumentation
 */
// @cpt-dod:cpt-hai3-dod-mfe-isolation-chunk-path-type:p1

/**
 * Configuration for a shared dependency in Module Federation.
 *
 * Shared dependency chunks are downloaded once (HTTP cache) and their source
 * text is cached in memory. For `MfeHandlerMF`, every dependency that declares
 * a `chunkPath` receives blob URL isolation: a unique Blob URL is created per
 * MFE load, triggering a fresh module evaluation so each MFE gets independent
 * instance state (React fiber tree, hooks, etc.).
 */
export interface SharedDependencyConfig {
  /** Package name (e.g., 'react', 'lodash', '@gears-frontx/screensets') */
  name: string;
  /**
   * Semver range (e.g., '^18.0.0', '^4.17.0').
   * When omitted, any available version in the global scope is accepted.
   */
  requiredVersion?: string;
  /**
   * Relative path of the built shared dependency chunk within the MFE's assets
   * directory (e.g., `__federation_shared_react.js`). When present, the handler
   * derives the absolute chunk URL from the `remoteEntry` base URL and fetches
   * the source text for blob URL isolation. When omitted, the dependency falls
   * back to the default federation behavior (shared instance, no isolation).
   */
  chunkPath?: string;
}

/**
 * Module Federation manifest containing shared configuration
 * GTS Type: gts.frontx.mfes.mfe.mf_manifest.v1~
 */
export interface MfManifest {
  /** The GTS type ID for this manifest */
  id: string;
  /** URL to the remoteEntry.js file */
  remoteEntry: string;
  /** Module Federation container name */
  remoteName: string;
  /** Optional override for shared dependency configuration */
  sharedDependencies?: SharedDependencyConfig[];
}
