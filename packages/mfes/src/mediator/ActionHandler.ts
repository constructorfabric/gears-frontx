/**
 * Actions Chains Mediator Types
 *
 * Defines the abstract mediator interface for action chain execution.
 * This follows FrontX's SOLID OOP pattern: abstract class (exportable contract)
 * + concrete implementation (private).
 *
 * @packageDocumentation
 */

/**
 * Abstract base class for receiving a single action.
 *
 * Both domain-side lifecycle handlers and extension-side custom handlers extend this class.
 * Registered per (targetId, actionTypeId) pair via ActionsChainsMediator.registerHandler().
 *
 * Each handler is a small class that encapsulates one action type's behavior,
 * consistent with the project's class-based OOP contract.
 */
export abstract class ActionHandler {
  /**
   * Handle an action invocation.
   *
   * @param actionTypeId - The type ID of the action
   * @param payload - The action payload
   * @returns Promise that resolves when action is handled
   */
  abstract handleAction(

    actionTypeId: string,

    payload: Record<string, unknown> | undefined

  ): Promise<void>;

  /**
   * Create an `ActionHandler` instance from a plain async function.
   *
   * Convenience wrapper for one-off handlers — strategies use this inside
   * `ExtensionDomainImplementationFactory.build(ctx)` to push mount/unmount
   * handlers via `ctx.registerHandler` without writing a full subclass.
   *
   * @param fn - Async function `(actionTypeId, payload) => Promise<void>`.
   * @returns An `ActionHandler` instance that delegates to `fn`.
   *
   * @example
   * ```typescript
   * ctx.registerHandler(ctx.typeSystem.resolveMountExtActionId(),
   *   ActionHandler.fromFunction((_t, p) => strategy.mount(p as ActionPayload)));
   * ```
   */
  static fromFunction(
    fn: (actionTypeId: string, payload: Record<string, unknown> | undefined) => Promise<void>
  ): ActionHandler {
    return new FunctionActionHandler(fn);
  }
}

/**
 * Private concrete handler created by `ActionHandler.fromFunction`.
 * Not exported — consumers use the static helper method.
 *
 * @internal
 */
class FunctionActionHandler extends ActionHandler {
  constructor(
    private readonly fn: (
      actionTypeId: string,
      payload: Record<string, unknown> | undefined
    ) => Promise<void>
  ) {
    super();
  }

  handleAction(
    actionTypeId: string,
    payload: Record<string, unknown> | undefined
  ): Promise<void> {
    return this.fn(actionTypeId, payload);
  }
}
