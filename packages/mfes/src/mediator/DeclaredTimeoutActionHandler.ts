/**
 * Declared-Timeout Action Handler
 *
 * The registry's own internal channel for handing an action's declared
 * timeout to its own internal mount/unmount handlers, without adding a
 * parameter to the public `ActionHandler` signature
 * (`cpt-frontx-algo-extension-domain-governance-mount-execution`
 * `inst-me-queue-caller-timer`: "The registry hands the action's declared
 * timeout only to its own internal mount and unmount handlers; the public
 * `ActionHandler` signature carries no timeout parameter").
 *
 * Only the registry's own internal mount and unmount handlers
 * (`MountExtActionHandler`, `UnmountExtActionHandler`) subclass this — it is
 * not part of the public surface, is never exported from `src/index.ts`, and
 * a handler that does not need an action's declared timeout extends
 * `ActionHandler` directly instead.
 *
 * `DefaultActionsChainsMediator.invokeWithinTimeout` is the one call site that
 * distinguishes a `DeclaredTimeoutActionHandler` from an ordinary
 * `ActionHandler`: for the former it calls `handleActionWithDeclaredTimeout`
 * with the action's own `timeout`; for every other handler it calls the
 * ordinary `handleAction`.
 *
 * @packageDocumentation
 * @internal
 */

import { ActionHandler } from './ActionHandler';

/**
 * @internal
 */
export abstract class DeclaredTimeoutActionHandler extends ActionHandler {
  /**
   * @param actionTypeId - The type ID of the action.
   * @param payload - The action payload.
   * @param declaredTimeout - The action's own declared timeout, or
   *   `undefined` when it declared none — absent one, the domain's
   *   `defaultActionTimeout` is used by the shared timeout rule
   *   (`ActionTimeoutResolver`).
   */
  abstract handleActionWithDeclaredTimeout(
    actionTypeId: string,
    payload: Record<string, unknown> | undefined,
    declaredTimeout: number | undefined
  ): Promise<void>;

  /**
   * A direct call through the public `ActionHandler` surface carries no
   * declared timeout — resolved to the domain default by
   * `handleActionWithDeclaredTimeout`'s own timeout resolution.
   */
  async handleAction(
    actionTypeId: string,
    payload: Record<string, unknown> | undefined
  ): Promise<void> {
    return this.handleActionWithDeclaredTimeout(actionTypeId, payload, undefined);
  }
}
