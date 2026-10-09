/**
 * The GTS library version this copy was built against, part of the store key.
 *
 * Read from the library's own manifest so the key and the dependency pin
 * cannot drift apart. The build inlines the manifest (tsup `noExternal`):
 * leaving a JSON import in the output would be rejected by Node's ESM loader,
 * which wants an import attribute. A consumer that overrides this package's
 * exact pin on the library runs a version the key does not name; that is
 * unsupported and is not detected.
 *
 * @packageDocumentation
 */

// A named import, so the bundler keeps the version string and drops the rest of the manifest.
import { version } from '@globaltypesystem/gts-ts/package.json';

// @cpt-begin:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-library-version
export const GTS_LIBRARY_VERSION: string = version;
// @cpt-end:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1:inst-rs-library-version
