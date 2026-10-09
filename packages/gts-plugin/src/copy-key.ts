/**
 * Key inputs of this evaluated copy: the store format, the GTS library version
 * and the hash of the built-in sets. The built-in sets are fixed for a copy's
 * lifetime, so the hash is computed once.
 *
 * @packageDocumentation
 */

import { createJsonEntity } from '@globaltypesystem/gts-ts';
import { GTS_LIBRARY_VERSION } from './library-version';
import { STORE_FORMAT, computeBuiltinHash, type KeyInputs } from './store-pair';

// @cpt-algo:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1

let builtinHash: string | undefined;

export function copyKeyInputs(builtins: ReadonlyArray<object>): KeyInputs {
  builtinHash ??= computeBuiltinHash(
    builtins.map((content) => ({ id: createJsonEntity(content).id, content }))
  );
  return { format: STORE_FORMAT, libraryVersion: GTS_LIBRARY_VERSION, builtinHash };
}
