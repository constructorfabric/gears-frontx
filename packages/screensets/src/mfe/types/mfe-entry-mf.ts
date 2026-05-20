/**
 * MFE Entry Module Federation Type Definitions
 *
 * MfeEntryMF extends MfeEntry with Module Federation 2.0 loading configuration.
 *
 * @packageDocumentation
 */

import type { MfeEntry } from './mfe-entry';
import type { MfManifest, MfManifestAssets } from './mf-manifest';

/**
 * Module Federation 2.0 implementation of MfeEntry
 * GTS Type: gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~
 */
export interface MfeEntryMF extends MfeEntry {
  /**
   * Module Federation manifest configuration.
   * Can be either:
   * - A type ID reference (string) to a cached manifest
   * - An inline MfManifest object
   */
  manifest: string | MfManifest;
  /** Module Federation exposed module name (e.g., './lifecycle'). */
  exposedModule: string;
  /**
   * Per-module chunk assets for this specific exposed module.
   *
   * Populated at registration time by the host manifest pipeline.
   * exposeAssets.js.sync[0] is the primary JS chunk filename to load.
   * exposeAssets.css.sync/async contains CSS paths to inject at mount time.
   */
  exposeAssets: MfManifestAssets;
}
