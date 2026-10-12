/**
 * The compatible line of the GTS library this copy was built against, part of
 * the store key.
 *
 * Read from the library's own manifest so the key and the dependency pin
 * cannot drift apart. The build inlines the manifest (tsup `noExternal`):
 * leaving a JSON import in the output would be rejected by Node's ESM loader,
 * which wants an import attribute. A consumer that overrides this package's
 * exact pin on the library runs a version outside the line the key names;
 * that is unsupported and is not detected.
 *
 * @packageDocumentation
 */

// A named import, so the bundler keeps the version string and drops the rest of the manifest.
import { version } from '@globaltypesystem/gts-ts/package.json';

/**
 * The semver-compatible line of a version: `0.<minor>` while the library is in
 * 0.x, where a minor release may break, and the major from 1.0 on. Copies on
 * one line share a store, since the library keeps `GtsStore` and `JsonEntity`
 * stable within it.
 */
export function compatibleLine(libraryVersion: string): string {
  const match = /^(\d+)\.(\d+)/.exec(libraryVersion);
  if (!match) return libraryVersion;
  return match[1] === '0' ? `0.${match[2]}` : match[1]!;
}

// @cpt-begin:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-library-version
export const GTS_LIBRARY_LINE: string = compatibleLine(version);
// @cpt-end:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-library-version
