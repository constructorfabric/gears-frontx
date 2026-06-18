/**
 * MFE Entry Module Federation Type Definitions
 *
 * MfeEntryMF extends MfeEntry with Module Federation 2.0 loading configuration.
 *
 * @packageDocumentation
 */

import type { MfeEntry } from './mfe-entry';
import type { MfManifest } from './mf-manifest';

/**
 * Module Federation 2.0 implementation of MfeEntry
 * GTS Type: gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~
 */
export interface MfeEntryMF extends MfeEntry {
  /**
   * Module Federation manifest configuration.
   * Can be either:
   * - A type ID reference (string) to a cached manifest
   * - An inline MfManifest object
   */
  manifest: string | MfManifest;
  /** Module Federation exposed module name (e.g., './ChartWidget') */
  exposedModule: string;
}
