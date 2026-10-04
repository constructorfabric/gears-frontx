import type { TypeSystemPlugin } from '../type-substrate';
import type { ActionsChain } from '../types';
import type { ActionHandler } from './ActionHandler';

/**
 * Abstract mediator for action chain execution.
 *
 * The exportable contract for action chain mediation. Concrete
 * implementations encapsulate execution, handler registration, and timeout
 * handling.
 *
 * Handlers are registered per (targetId, actionTypeId) pair using
 * registerHandler(). Domain-side lifecycle handlers and extension-side
 * custom handlers use the same registration path.
 */
export abstract class ActionsChainsMediator {
  /**
   * The Type System plugin used by this mediator.
   */
  abstract readonly typeSystem: TypeSystemPlugin;

  /**
   * Execute an actions chain: the action, then `next` recursively on
   * success or `fallback` recursively on failure. Takes only the chain and
   * returns nothing awaitable (`cpt-frontx-adr-action-dispatch-and-chaining`).
   *
   * @param chain - The actions chain to execute
   */
  abstract executeActionsChain(chain: ActionsChain): void;

  /**
   * Register a handler for a specific (targetId, actionTypeId) pair.
   *
   * Both domain-side and extension-side handlers use this method.
   * For extension targets, pass domainId so the mediator can resolve
   * the domain's defaultActionTimeout when the action has no explicit timeout.
   *
   * @param targetId - ID of the target (domain or extension)
   * @param actionTypeId - The action type this handler handles
   * @param handler - ActionHandler instance to invoke
   * @param domainId - Optional domain ID (required for extension targets)
   */
  abstract registerHandler(
    targetId: string,
    actionTypeId: string,
    handler: ActionHandler,
    domainId?: string
  ): void;

  /**
   * Unregister a handler for a specific (targetId, actionTypeId) pair.
   *
   * @param targetId - ID of the target
   * @param actionTypeId - The action type to unregister
   */
  abstract unregisterHandler(targetId: string, actionTypeId: string): void;

  /**
   * Unregister all handlers for a target.
   *
   * @param targetId - ID of the target
   */
  abstract unregisterAllHandlers(targetId: string): void;
}
