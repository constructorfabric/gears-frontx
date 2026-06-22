/**
 * FrontX MFE Type System Initialization
 *
 * This module exports GTS type ID constants for FrontX MFE core types.
 * These are exported for reference only - the GTS plugin has all first-class
 * citizen schemas built-in, so no registration is needed.
 *
 * @packageDocumentation
 */

/**
 * GTS Type IDs for FrontX MFE core types (8 types)
 *
 * These types define the core MFE contract model and are built into the GTS plugin.
 */
export const FRONTX_CORE_TYPE_IDS = {
  /** Pure contract type (abstract base) */
  mfeEntry: 'gts.frontx.mfes.mfe.entry.v1~',
  /** Extension point contract */
  extensionDomain: 'gts.frontx.mfes.ext.domain.v1~',
  /** Extension binding */
  extension: 'gts.frontx.mfes.ext.extension.v1~',
  /** Property definition */
  sharedProperty: 'gts.frontx.mfes.comm.shared_property.v1~',
  /** Action type with target and self-id */
  action: 'gts.frontx.mfes.comm.action.v1~',
  /** Action chain for mediation */
  actionsChain: 'gts.frontx.mfes.comm.actions_chain.v1~',
  /** Lifecycle event type */
  lifecycleStage: 'gts.frontx.mfes.lifecycle.stage.v1~',
  /** Lifecycle stage to actions chain binding */
  lifecycleHook: 'gts.frontx.mfes.lifecycle.hook.v1~',
} as const;

/**
 * GTS Type IDs for default lifecycle stages (4 stages)
 *
 * These are the default lifecycle stages that FrontX provides.
 * Domains and extensions can define additional custom lifecycle stages.
 */
export const FRONTX_LIFECYCLE_STAGE_IDS = {
  /** Triggered after extension registration */
  init: 'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
  /** Triggered after extension mount */
  activated: 'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1',
  /** Triggered after extension unmount */
  deactivated: 'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1',
  /** Triggered before extension unregistration */
  destroyed: 'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
} as const;

/**
 * GTS Type IDs for Module Federation types (2 types)
 *
 * These types are specific to Module Federation-based MFE loading.
 */
export const FRONTX_MF_TYPE_IDS = {
  /** Module Federation manifest (standalone) */
  mfManifest: 'gts.frontx.mfes.mfe.mf_manifest.v1~',
  /** Module Federation entry (derived from MfeEntry) */
  mfeEntryMf: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~',
} as const;

/**
 * NOTE: No registerHai3Types() function is needed.
 *
 * The GTS plugin registers all first-class citizen schemas during construction.
 * The gtsPlugin singleton has all FrontX core types immediately available.
 *
 * See packages/screensets/src/mfe/plugins/gts/index.ts for implementation.
 */
