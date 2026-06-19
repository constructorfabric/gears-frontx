/**
 * Extension Domain Type Definitions
 *
 * ExtensionDomain defines an extension point where MFEs can be mounted.
 *
 * @packageDocumentation
 */
// @cpt-dod:cpt-hai3-dod-screenset-registry-type-contracts:p1

import type { LifecycleHook } from './lifecycle';

/**
 * Defines an extension point (domain) where MFEs can be mounted
 * GTS Type: gts.frontx.mfes.ext.domain.v1~
 */
export interface ExtensionDomain {
  /** The GTS type ID for this domain */
  id: string;
  /** SharedProperty type IDs provided to MFEs in this domain */
  sharedProperties: string[];
  /** Action type IDs that can target extensions in this domain */
  actions: string[];
  /** Action type IDs extensions can send when targeting this domain */
  extensionsActions: string[];
  /**
   * Optional reference to a derived Extension type ID.
   * If specified, extensions must use types that derive from this type.
   */
  extensionsTypeId?: string;
  /** Default timeout for actions targeting this domain (milliseconds, REQUIRED) */
  defaultActionTimeout: number;
  /** Lifecycle stage type IDs supported for the domain itself */
  lifecycleStages: string[];
  /** Lifecycle stage type IDs supported for extensions in this domain */
  extensionsLifecycleStages: string[];
  /** Optional lifecycle hooks - explicitly declared actions for each stage */
  lifecycle?: LifecycleHook[];
}
