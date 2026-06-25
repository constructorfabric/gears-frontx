/**
 * Extension Manager State Types
 *
 * State interfaces used by ActionsChainsMediator for domain resolution.
 *
 * @packageDocumentation
 * @internal
 */

import type { ExtensionDomain } from '../types';
import type { ExtensionMounter } from './ExtensionMounter';
import type { DomainLifecycleTrigger } from './DomainLifecycleTrigger';
import type { ExtensionDomainImplementation } from './ExtensionDomainImplementation';

/**
 * State for a registered extension domain.
 * INTERNAL: Used by ActionsChainsMediator for domain resolution.
 */
export interface ExtensionDomainState {
  domain: ExtensionDomain;
  properties: Map<string, unknown>;
  extensions: Set<string>;
  propertySubscribers: Map<string, Set<(propertyTypeId: string, value: unknown) => void>>;
  /** Insertion-ordered list of currently-mounted extension IDs for this domain. */
  mountedExtensions: string[];
  /** Per-domain mount facade; null until set by setDomainImplementation. */
  mounter: ExtensionMounter | null;
  /** Per-domain lifecycle trigger; null until set by setDomainImplementation. */
  lifecycleTrigger: DomainLifecycleTrigger | null;
  /** Domain implementation instance; null until set by setDomainImplementation. */
  implementation: ExtensionDomainImplementation | null;
}
