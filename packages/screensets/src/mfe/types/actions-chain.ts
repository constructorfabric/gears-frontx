/**
 * Actions Chain Type Definitions
 *
 * ActionsChain defines a linked structure of actions with success/failure branches.
 *
 * @packageDocumentation
 */

import type { Action } from './action';

/**
 * Defines a mediated chain of actions with success/failure branches
 * GTS Type: gts.frontx.mfes.comm.actions_chain.v1~
 *
 * Contains actual Action INSTANCES (embedded objects).
 * ActionsChain is NOT referenced by other types, so it has NO id field.
 */
export interface ActionsChain {
  /** Action instance (embedded object) */
  action: Action;
  /** Next chain to execute on success */
  next?: ActionsChain;
  /** Fallback chain to execute on failure */
  fallback?: ActionsChain;
}
