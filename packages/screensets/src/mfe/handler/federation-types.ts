/**
 * TypeScript type definitions and typed accessors for the
 * @originjs/vite-plugin-federation runtime globals.
 *
 * The federation runtime uses `globalThis.__federation_shared__` to store shared
 * module getters organised by scope name (default: 'default') and then by package
 * name and version.
 *
 * ShareScope entry format:
 *   { get: () => Promise<() => Module>, loaded?: 1, scope?: string }
 *
 * @packageDocumentation
 */

/**
 * A single shared module entry stored in the federation share scope.
 */
export interface FederationSharedEntry {
  /** Factory returning a promise that resolves to a module factory. */
  get: () => Promise<() => unknown>;
  /** Present and equal to 1 when the module has already been fetched. */
  loaded?: 1;
  /**
   * The scope name this entry belongs to.
   * Defaults to 'default' when omitted.
   */
  scope?: string;
}

/**
 * The per-version map for a single package within a scope.
 * Keys are concrete version strings (e.g. '19.2.4').
 */
export type FederationPackageVersions = Record<string, FederationSharedEntry>;

/**
 * The per-package map within a federation scope.
 * Keys are package names (e.g. 'react', '@gears-frontx/react').
 */
export type FederationScope = Record<string, FederationPackageVersions>;

/**
 * The top-level federation shared map stored on globalThis.
 * Keys are scope names — HAI3 always uses 'default'.
 */
export type FederationSharedMap = Record<string, FederationScope>;
