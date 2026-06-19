/**
 * Action Type Definitions
 *
 * Action represents a typed message with a target, self-identifying type ID, and optional payload.
 *
 * @packageDocumentation
 */

/**
 * An action with target, self-identifying type, and optional payload
 * GTS Type: gts.frontx.mfes.comm.action.v1~
 */
export interface Action {
  /** Self-reference to this action's type ID */
  type: string;
  /** Target type ID (ExtensionDomain or Extension) */
  target: string;
  /** Optional action payload */
  payload?: Record<string, unknown>;
  /** Optional timeout override in milliseconds (overrides domain's defaultActionTimeout) */
  timeout?: number;
}
