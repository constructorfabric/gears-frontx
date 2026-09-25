/**
 * Lifecycle Manager - Abstract Interface
 *
 * Abstract lifecycle manager interface defining the contract for lifecycle
 * stage triggering.
 *
 * @packageDocumentation
 * @internal
 */

import type { ActionsChain } from '../types';

/**
 * Acceptance-only chain dispatcher callback that a lifecycle stage uses to
 * dispatch an actions chain. The callback is void and synchronously-refusing
 * — never awaitable for the chain's own execution
 * (`cpt-frontx-constraint-mfes-origin-invariant-chain-execution`,
 * `cpt-frontx-adr-action-dispatch-and-chaining`). This type is exported under
 * the alias `LifecycleActionChainExecutor`.
 */
export type ActionChainExecutor = (chain: ActionsChain) => void;


/**
 * Abstract lifecycle manager for lifecycle stage triggering.
 *
 * This is the exportable abstraction that defines the contract for
 * lifecycle management. Concrete implementations encapsulate the
 * execution logic for lifecycle hooks.
 *
 * Key Responsibilities:
 * - Trigger lifecycle stages for extensions
 * - Trigger lifecycle stages for domains (all extensions)
 * - Trigger lifecycle stages for domains themselves
 * - Execute lifecycle hook action chains
 *
 * Key Benefits:
 * - Dependency Inversion: MfeRegistry depends on abstraction
 * - Testability: Can inject mock managers for testing
 * - Encapsulation: Execution logic is hidden in concrete class
 */
export abstract class LifecycleManager {
  /**
   * Trigger a lifecycle stage for a specific extension.
   * Dispatches every matching hook's actions chain in declaration order
   * without awaiting any of their settlement, and returns once every hook
   * has been dispatched or its synchronous refusal contained
   * (`cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering`).
   *
   * @param extensionId - ID of the extension
   * @param stageId - ID of the lifecycle stage to trigger
   * @throws {Error} synchronously if `extensionId` is not registered.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-non-awaitable
  abstract triggerLifecycleStage(extensionId: string, stageId: string): void;
  // @cpt-end:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-non-awaitable

  /**
   * Trigger a lifecycle stage for all extensions in a domain.
   * Useful for custom stages like "refresh" that affect all widgets.
   * Non-blocking, per `triggerLifecycleStage` above.
   *
   * @param domainId - ID of the domain
   * @param stageId - ID of the lifecycle stage to trigger
   * @throws {Error} synchronously if `domainId` is not registered.
   */
  abstract triggerDomainLifecycleStage(domainId: string, stageId: string): void;

  /**
   * Trigger a lifecycle stage for a domain itself.
   * Executes hooks registered on the domain entity. Non-blocking, per
   * `triggerLifecycleStage` above.
   *
   * @param domainId - ID of the domain
   * @param stageId - ID of the lifecycle stage to trigger
   * @throws {Error} synchronously if `domainId` is not registered.
   */
  abstract triggerDomainOwnLifecycleStage(domainId: string, stageId: string): void;
}
