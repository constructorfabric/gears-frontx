/**
 * Lifecycle Type Definitions
 *
 * LifecycleStage and LifecycleHook types for extension lifecycle management.
 *
 * @packageDocumentation
 */

import type { ActionsChain } from './actions-chain';

/**
 * Represents a lifecycle event that can trigger actions chains
 * GTS Type: gts.frontx.mfes.lifecycle.stage.v1~
 */
export interface LifecycleStage {
  /** The GTS type ID for this lifecycle stage */
  id: string;
  /** Human-readable description of when this stage triggers */
  description?: string;
}

/**
 * Binds a lifecycle stage to an actions chain
 * GTS Type: gts.frontx.mfes.lifecycle.hook.v1~
 */
export interface LifecycleHook {
  /** The lifecycle stage that triggers this hook */
  stage: string;
  /** The actions chain to execute when the stage triggers */
  actions_chain: ActionsChain;
}
