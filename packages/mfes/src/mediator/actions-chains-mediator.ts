// @cpt-flow:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1
// @cpt-algo:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p2
// @cpt-state:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2
/**
 * Default Actions Chains Mediator Implementation
 *
 * Concrete implementation of ActionsChainsMediator.
 * This is an INTERNAL implementation detail and is NOT exported from the package.
 *
 * @packageDocumentation
 */

import type { TypeSystemPlugin } from '../type-substrate';
import type { ActionsChain, ExtensionDomain, MfeEntry } from '../types';
import type { ExtensionDomainState } from '../runtime/extension-manager';
import {
  ActionsChainsMediator,
  ActionHandler,
  type ChainResult,
  type ChainExecutionOptions,
} from './types';


/**
 * Default chain timeout: 2 minutes (120000ms)
 */
const DEFAULT_CHAIN_TIMEOUT = 120000;

/**
 * Thrown by the mediator's primary-step execution when neither a
 * `(target, actionType)` handler nor a catch-all handler is registered
 * for the resolved target. Caught by `executeChainRecursive`'s try/catch,
 * which triggers `chain.fallback` if defined; with no fallback, the error
 * propagates to `executeActionsChain`'s outer try/catch and the chain
 * promise resolves with `{ completed: false, error: '...' }` — the
 * mediator does not throw to the caller.
 *
 * Error message format matches the spec contract verbatim:
 * `No handler found for target '{target}' and action type '{actionType}'`.
 *
 * @internal
 */
export class NoHandlerForActionTargetError extends Error {
  constructor(
    public readonly target: string,
    public readonly actionType: string
  ) {
    super(
      `No handler found for target '${target}' and action type '${actionType}'`
    );
    this.name = 'NoHandlerForActionTargetError';
  }
}

/**
 * Concrete implementation of ActionsChainsMediator.
 *
 * Handles action chain execution with success/failure branching, timeout management,
 * and per-(targetId, actionTypeId) handler registration.
 *
 * This is the default mediator implementation used by MfeRegistry.
 * It is NOT exported from the package - only the abstract ActionsChainsMediator is exported.
 *
 * @internal
 */
export class DefaultActionsChainsMediator extends ActionsChainsMediator {
  /**
   * The Type System plugin instance.
   */
  public readonly typeSystem: TypeSystemPlugin;

  /**
   * Callback to get domain state for target resolution.
   * Injected during construction to avoid dependency on full MfeRegistry.
   */
  private readonly getDomainState: (domainId: string) => ExtensionDomainState | undefined;

  /**
   * Callback to look up the MfeEntry of a registered extension by its ID.
   * Injected during construction; used by runtime action declaration validation
   * to verify that a dispatched action.type is declared in the target entry's
   * `actions` (the action types the entry can receive and execute).
   */
  private readonly getExtensionEntry: (extensionId: string) => MfeEntry | undefined;

  /**
   * Unified handler map: targetId → (actionTypeId → handler).
   * Used for both domain-side and extension-side handlers.
   */
  private readonly actionHandlers = new Map<string, Map<string, ActionHandler>>();

  /**
   * Maps extension target IDs to their domain IDs.
   * Populated when registerHandler() is called with a domainId.
   * Used by resolveDomain() to find the domain for extension-targeted actions
   * when resolving defaultActionTimeout.
   */
  private readonly targetDomainMap = new Map<string, string>();

  /**
   * Catch-all handlers registered for a target regardless of action type.
   * Used by child domain forwarding, which must forward any action type
   * via bridge transport without knowing the set of action types upfront.
   * Keyed by targetId.
   */
  private readonly catchAllHandlers = new Map<string, ActionHandler>();

  /**
   * Map of target IDs to their pending action promises.
   * Used to track in-flight actions during unregistration.
   */
  private readonly pendingActions = new Map<string, Set<Promise<void>>>();

  /**
   * Action types exempt from declaration validation (e.g. infrastructure lifecycle actions).
   * Injected by the host registry to keep the mediator format-agnostic (MFES-1).
   */
  private readonly infrastructureActionTypes: ReadonlySet<string>;

  constructor(config: {
    typeSystem: TypeSystemPlugin;
    getDomainState: (domainId: string) => ExtensionDomainState | undefined;
    getExtensionEntry: (extensionId: string) => MfeEntry | undefined;
    /** Action types exempt from entry declaration validation (e.g. load/mount/unmount). */
    infrastructureActionTypes?: ReadonlySet<string>;
  }) {
    super();
    this.typeSystem = config.typeSystem;
    this.getDomainState = config.getDomainState;
    this.getExtensionEntry = config.getExtensionEntry;
    this.infrastructureActionTypes = config.infrastructureActionTypes ?? new Set();
  }

  /**
   * Execute an action chain, routing to targets and handling success/failure branching.
   *
   * @param chain - The actions chain to execute
   * @param options - Optional per-request execution options
   * @returns Promise resolving to chain result
   */
  // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-invoke-execute
  async executeActionsChain(
    chain: ActionsChain,
    options?: ChainExecutionOptions
  ): Promise<ChainResult> {
    const startTime = Date.now();
    const chainTimeout = options?.chainTimeout ?? DEFAULT_CHAIN_TIMEOUT;
    const path: string[] = [];

    try {
      // Execute with chain timeout
      const result = await this.executeWithTimeout(
        async () => await this.executeChainRecursive(chain, path, startTime, chainTimeout),
        chainTimeout
      );

      return {
        ...result,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const isTimeout =
        error instanceof Error &&
        (error.message.includes('Chain timeout') ||
          error.message.includes('Operation timeout'));

      return {
        completed: false,
        path,
        error: error instanceof Error ? error.message : String(error),
        timedOut: isTimeout,
        executionTime: Date.now() - startTime,
      };
    }
  }
  // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-invoke-execute

  /**
   * Execute a chain recursively with success/failure branching.
   *
   * @param chain - The chain to execute
   * @param path - Accumulated path of executed actions
   * @param startTime - Start time of the entire chain execution
   * @param chainTimeout - Total chain timeout
   * @returns Promise resolving to chain result
   */
  // @cpt-algo:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1
  private async executeChainRecursive(
    chain: ActionsChain,
    path: string[],
    startTime: number,
    chainTimeout: number
  ): Promise<ChainResult> {
    const { action } = chain;

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-check-chain-timeout
    if (Date.now() - startTime > chainTimeout) {
      throw new Error('Chain timeout exceeded');
    }
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-check-chain-timeout

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-delegate-admit
    // Register the action using the GTS anonymous instance pattern.
    // Actions have a `type` field but no `id` field — gts-ts resolves the
    // schema from the `type` field and validates against it inside register().
    // Invalid actions throw directly from register().
    this.typeSystem.register(action);
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-delegate-admit

    // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-decl-check
    // Runtime entry declaration validation (second layer, after GTS schema validation).
    // GTS alone enforces schema/target shape; this layer enforces per-entry opt-in:
    // the target entry must declare the action.type in its `actions` — the set of
    // action types the entry is capable of receiving and executing. `entry.domainActions`
    // is a different contract (it names domain actions the entry REQUIRES from its
    // parent domain, not actions the entry can receive) and is NOT consulted here.
    // Infrastructure lifecycle actions target domains (not extensions) and are exempt.
    // If the target has no registered entry (domain target, or unregistered extension
    // in bypassed-registration test setups) the check is a no-op — domain targets are
    // validated by GTS `x-gts-ref`, and unregistered targets surface via handler
    // resolution later in executeAction.
    if (!this.infrastructureActionTypes.has(action.type)) {
      const entry = this.getExtensionEntry(action.target);
      if (entry) {
        if (!entry.actions.includes(action.type)) {
          throw new Error(
            `Action type '${action.type}' is not declared by target entry '${entry.id}'`
          );
        }
      }
    }
    // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-decl-check

    try {
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-invoke-within-timeout
      await this.executeAction(action);
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-invoke-within-timeout

      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-success
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-append-path-success
      path.push(action.type);
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-append-path-success

      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-has-next
      if (chain.next) {
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-recurse-success
        return await this.executeChainRecursive(chain.next, path, startTime, chainTimeout);
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-recurse-success
      }
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-has-next

      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-chain-done
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-return-done
      return {
        completed: true,
        path: [...path],
      };
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-return-done
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-chain-done
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-success
    } catch (error) {
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-failure
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-append-path-failure
      path.push(action.type);
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-append-path-failure

      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-has-fallback
      if (chain.fallback) {
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-recurse-fallback-algo
        return await this.executeChainRecursive(
          chain.fallback,
          path,
          startTime,
          chainTimeout
        );
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-recurse-fallback-algo
      }
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-has-fallback

      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-no-fallback-algo
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-rethrow
      throw error;
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-rethrow
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-no-fallback-algo
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-failure
    }
  }

  /**
   * Execute a single action with timeout.
   *
   * If neither a `(target, actionType)` handler nor a catch-all handler is
   * registered, this method throws `NoHandlerForActionTargetError`. The
   * thrown error is caught by `executeChainRecursive`'s try/catch around
   * the primary step, which triggers the chain's `fallback` (if defined);
   * with no fallback, the error propagates to `executeActionsChain`'s
   * outer try/catch and the chain resolves with `completed: false`. The
   * mediator never throws to the public caller.
   *
   * @param action - The action to execute
   * @returns Promise that resolves when action completes
   */
  private async executeAction(
    action: ActionsChain['action']
  ): Promise<void> {
    const handler = this.resolveHandler(action.target, action.type);

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-no-handler
    if (!handler) {
      console.debug(
        '[ActionsChainsMediator] No handler registered for action target',
        { target: action.target, actionType: action.type }
      );
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-throw-no-handler
      throw new NoHandlerForActionTargetError(action.target, action.type);
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-throw-no-handler
    }
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-no-handler

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-resolve-timeout
    const timeout = await this.resolveTimeout(action);
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-resolve-timeout

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-add-inflight
    const actionPromise = this.executeWithTimeout(
      async () => await handler.handleAction(action.type, action.payload),
      timeout
    );
    this.trackPendingAction(action.target, actionPromise);
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-add-inflight

    try {
      await actionPromise;
    } finally {
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-remove-inflight
      this.untrackPendingAction(action.target, actionPromise);
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-remove-inflight
    }
  }

  /**
   * Track a pending action for a target.
   *
   * @param targetId - The target ID (domain or extension)
   * @param actionPromise - The action promise to track
   */
  private trackPendingAction(targetId: string, actionPromise: Promise<void>): void {
    let pending = this.pendingActions.get(targetId);
    if (!pending) {
      pending = new Set();
      this.pendingActions.set(targetId, pending);
    }
    pending.add(actionPromise);
  }

  /**
   * Untrack a completed action for a target.
   *
   * @param targetId - The target ID (domain or extension)
   * @param actionPromise - The action promise to untrack
   */
  private untrackPendingAction(targetId: string, actionPromise: Promise<void>): void {
    const pending = this.pendingActions.get(targetId);
    if (pending) {
      pending.delete(actionPromise);
      if (pending.size === 0) {
        this.pendingActions.delete(targetId);
      }
    }
  }

  /**
   * Resolve the handler for a (targetId, actionTypeId) pair.
   *
   * Resolution order:
   * 1. Check actionHandlers[targetId][actionTypeId] (specific handler)
   * 2. Check catchAllHandlers[targetId] (bridge forwarding fallback)
   *
   * @param targetId - The target type ID (domain or extension)
   * @param actionTypeId - The action type ID
   * @returns The action handler function, or undefined if not found
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-keyed-lookup
  private resolveHandler(targetId: string, actionTypeId: string): ActionHandler | undefined {
    // Check per-(target, actionType) handler first
    const targetHandlers = this.actionHandlers.get(targetId);
    if (targetHandlers) {
      const handler = targetHandlers.get(actionTypeId);
      if (handler) {
        return handler;
      }
    }

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-catchall-lookup
    // Fall back to catch-all handler (used for child domain forwarding via bridge transport)
    return this.catchAllHandlers.get(targetId);
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-catchall-lookup
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-keyed-lookup

  /**
   * Resolve the timeout for an action.
   *
   * Timeout resolution:
   * 1. Use action.timeout if specified
   * 2. Otherwise use domain.defaultActionTimeout
   *
   * @param action - The action
   * @returns The timeout in milliseconds
   */
  private async resolveTimeout(action: ActionsChain['action']): Promise<number> {
    // If action has timeout, use it
    if (action.timeout !== undefined) {
      return action.timeout;
    }

    // Otherwise, resolve from domain
    const domain = await this.resolveDomain(action.target);
    if (domain) {
      return domain.defaultActionTimeout;
    }

    // No domain found - this indicates a system error
    throw new Error('Cannot resolve timeout: no domain found for target "' + action.target + '"');
  }

  /**
   * Resolve the domain for a target.
   *
   * Resolution order:
   * 1. Direct domain lookup (target is a domain ID)
   * 2. Extension→domain lookup via targetDomainMap
   *
   * @param targetId - The target type ID
   * @returns The domain, or undefined if not found
   */
  private async resolveDomain(targetId: string): Promise<ExtensionDomain | undefined> {
    // Check if target is a domain directly
    const domainState = this.getDomainState(targetId);
    if (domainState) {
      return domainState.domain;
    }

    // Check targetDomainMap: extension targets registered with a domainId
    const domainId = this.targetDomainMap.get(targetId);
    if (domainId) {
      const extensionDomainState = this.getDomainState(domainId);
      if (extensionDomainState) {
        return extensionDomainState.domain;
      }
    }

    return undefined;
  }

  /**
   * Execute a promise with timeout.
   *
   * @param fn - The async function to execute
   * @param timeout - Timeout in milliseconds
   * @returns Promise that resolves with the function result or rejects on timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timeout after ${timeout}ms`));
      }, timeout);

      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Register a handler for a specific (targetId, actionTypeId) pair.
   *
   * @param targetId - ID of the target (domain or extension)
   * @param actionTypeId - The action type this handler handles
   * @param handler - Handler function to invoke
   * @param domainId - Optional domain ID for extension targets (enables timeout resolution)
   */
  registerHandler(
    targetId: string,
    actionTypeId: string,
    handler: ActionHandler,
    domainId?: string
  ): void {
    let targetHandlers = this.actionHandlers.get(targetId);
    if (!targetHandlers) {
      targetHandlers = new Map();
      this.actionHandlers.set(targetId, targetHandlers);
    }
    targetHandlers.set(actionTypeId, handler);

    // Track extension→domain mapping for timeout resolution
    if (domainId !== undefined) {
      this.targetDomainMap.set(targetId, domainId);
    }
  }

  /**
   * Unregister a handler for a specific (targetId, actionTypeId) pair.
   *
   * @param targetId - ID of the target
   * @param actionTypeId - The action type to unregister
   */
  unregisterHandler(targetId: string, actionTypeId: string): void {
    const targetHandlers = this.actionHandlers.get(targetId);
    if (targetHandlers) {
      targetHandlers.delete(actionTypeId);
      if (targetHandlers.size === 0) {
        this.actionHandlers.delete(targetId);
        this.targetDomainMap.delete(targetId);
      }
    }
  }

  /**
   * Unregister all handlers for a target.
   * Used during dispose (e.g., when an extension is unmounted or a domain is unregistered).
   *
   * @param targetId - ID of the target
   */
  unregisterAllHandlers(targetId: string): void {
    // Check for pending actions before removing
    const pending = this.pendingActions.get(targetId);
    if (pending && pending.size > 0) {
      throw new Error(
        `Cannot unregister handlers for "${targetId}": ${pending.size} action(s) still pending. ` +
        `Wait for actions to complete before unregistering.`
      );
    }

    this.actionHandlers.delete(targetId);
    this.targetDomainMap.delete(targetId);
    this.catchAllHandlers.delete(targetId);
    this.pendingActions.delete(targetId);
  }

  /**
   * Register a catch-all handler for a target.
   * The catch-all handler is invoked for any action type when no specific handler
   * is registered for the (targetId, actionTypeId) pair.
   *
   * This is an INTERNAL method used exclusively for child domain forwarding via
   * bridge transport — the parent mediator cannot know the child's action types
   * at registration time, so the forwarding handler must intercept any action type.
   *
   * @param targetId - ID of the target
   * @param handler - Handler to invoke for any unmatched action type
   */
  registerCatchAllHandler(targetId: string, handler: ActionHandler): void {
    this.catchAllHandlers.set(targetId, handler);
  }

  /**
   * Unregister a catch-all handler for a target.
   *
   * @param targetId - ID of the target
   */
  unregisterCatchAllHandler(targetId: string): void {
    this.catchAllHandlers.delete(targetId);
  }
}
