/**
 * Domain-Specific Extension Validation via Derived Types
 *
 * Validates that an Extension's type conforms to its domain's extensionsTypeId
 * requirement.
 *
 * @packageDocumentation
 */

import type { TypeSystemPlugin } from '../type-substrate';
import type { Extension } from '../types';
import type { ExtensionDomain } from '../types';
import { ExtensionTypeError } from '../errors';

// @cpt-algo:cpt-frontx-algo-type-substrate-port-type-of-resolution:p2
export function validateExtensionType(
  plugin: TypeSystemPlugin,
  domain: ExtensionDomain,
  extension: Extension
): void {
  if (!domain.extensionsTypeId) {
    return;
  }
  // @cpt-begin:cpt-frontx-algo-type-substrate-port-type-of-resolution:p2:inst-delegate-hierarchy
  // Delegate hierarchy resolution to the injected port — no identifier parsing
  // or type-format knowledge in the runtime; the boolean result is used as-is.
  if (!plugin.isTypeOf(extension.id, domain.extensionsTypeId)) {
    throw new ExtensionTypeError(extension.id, domain.extensionsTypeId);
  }
  // @cpt-end:cpt-frontx-algo-type-substrate-port-type-of-resolution:p2:inst-delegate-hierarchy
}
