/**
 * MFE Entry Module Federation Type Definitions
 *
 * MfeEntryMF extends MfeEntry with Module Federation 2.0 loading configuration.
 *
 * @packageDocumentation
 */

import type { MfeEntry } from './index';
import type { MfManifestAssets } from '../manifest/mf-manifest';

/**
 * Module Federation 2.0 implementation of MfeEntry
 * GTS Type: gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~
 */
export interface MfeEntryMF extends MfeEntry {
  /**
   * The identifier of the registered manifest this entry references.
   */
  manifest: string;
  /** Module Federation exposed module name (e.g., './lifecycle'). */
  exposedModule: string;
  /**
   * Asset locations of this exposed module. `js.sync[0]` is the entry
   * module; `css.sync` and `css.async` are its stylesheets.
   */
  exposeAssets: MfManifestAssets;
}
