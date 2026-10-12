/**
 * Key inputs of this evaluated copy: the store format, the compatible line of
 * the GTS library and the hash of the built-in sets. The built-in sets are fixed for a copy's
 * lifetime, so the hash is computed once.
 *
 * @packageDocumentation
 */

import { createJsonEntity } from '@globaltypesystem/gts-ts';
import { GTS_LIBRARY_LINE } from './library-version';
import { loadLifecycleStages, loadSchemas } from './loader';
import { STORE_FORMAT, computeBuiltinHash, type KeyInputs } from './store-pair';

// @cpt-algo:cpt-frontx-algo-gts-type-provider-realm-store-rendezvous:p1

let builtinHash: string | undefined;

export function copyKeyInputs(): KeyInputs {
  builtinHash ??= computeBuiltinHash(
    [...loadSchemas(), ...loadLifecycleStages()].map((content) => ({ id: createJsonEntity(content).id, content }))
  );
  return { format: STORE_FORMAT, libraryLine: GTS_LIBRARY_LINE, builtinHash };
}
