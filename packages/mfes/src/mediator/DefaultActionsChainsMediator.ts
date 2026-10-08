// @cpt-flow:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1
// @cpt-algo:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p2
// @cpt-state:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2
// @cpt-flow:cpt-frontx-flow-extension-domain-governance-admission:p1
/**
 * Default Actions Chains Mediator Implementation
 *
 * Concrete implementation of ActionsChainsMediator.
 * This is an INTERNAL implementation detail and is NOT exported from the package.
 *
 * @packageDocumentation
 */

import { isInfrastructureLifecycleAction, type TypeSystemPlugin } from '../type-substrate';
import type { Action, ActionsChain, ExtensionDomain, MfeEntry } from '../types';
import type { ExtensionDomainState } from '../runtime/ExtensionManager';
import { getArrivalEdge } from '../runtime/inbound-bridge-link';
import { CROSS_HOP_PROTOCOL_VERSION, CrossHopRoute } from './CrossHopRoute';
import { ActionsChainsMediator } from './ActionsChainsMediator';
import type { ActionHandler } from './ActionHandler';
import { NoHandlerForActionTargetError } from './NoHandlerForActionTargetError';
import { ActionTimeoutResolver } from './ActionTimeoutResolver';
import { DeclaredTimeoutActionHandler } from './DeclaredTimeoutActionHandler';

/** Narrows a resolved handler to the cross-hop route shape. */
function isCrossHopRoute(resolved: ActionHandler | CrossHopRoute): resolved is CrossHopRoute {
  return resolved instanceof CrossHopRoute;
}

/**
 * Concrete implementation of ActionsChainsMediator.
 *
 * Executes an actions chain recursively: the action, then `next` on success
 * or `fallback` on failure. Handlers are registered per
 * (targetId, actionTypeId) pair.
 *
 * @internal
 */
export class DefaultActionsChainsMediator extends ActionsChainsMediator {
  /**
   * The Type System plugin instance.
   */
  public readonly typeSystem: TypeSystemPlugin;

  /**
   * Domain state lookup for per-action timeout resolution.
   */
  private readonly getDomainState: (domainId: string) => ExtensionDomainState | undefined;

  /**
   * Registered-extension entry lookup for the declaration check.
   */
  private readonly getExtensionEntry: (extensionId: string) => MfeEntry | undefined;

  /**
   * Resolves a downward forwarding entry for a target, excluding an entry
   * whose bridge equals the action's arrival edge.
   */
  private readonly resolveForwardingEntry?: (
    targetId: string,
    arrivalEdge: unknown
  ) => CrossHopRoute | undefined;

  /**
   * Resolves the escalation route through this registry's inbound bridge;
   * `undefined` at the shell.
   */
  private readonly resolveEscalation?: () => CrossHopRoute | undefined;

  /**
   * Keyed handler registry: targetId → (actionTypeId → handler).
   */
  private readonly actionHandlers = new Map<string, Map<string, ActionHandler>>();

  /**
   * Extension target → domain id, for resolving the domain default timeout
   * of an extension-targeted action.
   */
  private readonly targetDomainMap = new Map<string, string>();

  /**
   * The shared per-action timeout rule, also used by the occupancy queue.
   */
  private readonly actionTimeoutResolver: ActionTimeoutResolver;

  constructor(config: {
    typeSystem: TypeSystemPlugin;
    getDomainState: (domainId: string) => ExtensionDomainState | undefined;
    getExtensionEntry: (extensionId: string) => MfeEntry | undefined;
    resolveForwardingEntry?: (targetId: string, arrivalEdge: unknown) => CrossHopRoute | undefined;
    resolveEscalation?: () => CrossHopRoute | undefined;
    actionTimeoutResolver?: ActionTimeoutResolver;
  }) {
    super();
    this.typeSystem = config.typeSystem;
    this.getDomainState = config.getDomainState;
    this.getExtensionEntry = config.getExtensionEntry;
    this.resolveForwardingEntry = config.resolveForwardingEntry;
    this.resolveEscalation = config.resolveEscalation;
    this.actionTimeoutResolver = config.actionTimeoutResolver ?? new ActionTimeoutResolver();
  }

  /**
   * Execute an actions chain. Returns nothing awaitable.
   *
   * @param chain - The actions chain to execute.
   */
  // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-invoke-execute
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-accept-yields-nothing
  executeActionsChain(chain: ActionsChain): void {
    void this.executeChain(chain);
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-accept-yields-nothing
  // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-invoke-execute

  /**
   * Accept a sub-chain handed over across a hop and execute it after this
   * call returns. The caller has already checked the envelope version and
   * this registry's disposal. A chain handed down from the parent has its
   * action resolved by this runtime's own handlers only, never escalated.
   *
   * @internal
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-receive-transfer
  // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-accepted-continues
  receiveHandedOverChain(chain: ActionsChain, fromParent = false): void {
    void Promise.resolve().then(() => this.executeChain(chain, !fromParent));
  }
  // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-accepted-continues
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-receive-transfer

  /**
   * Execute `chain.action`, then `chain.next` recursively on success or
   * `chain.fallback` recursively on failure. An absent branch ends the
   * chain. A sub-chain handed over across a hop ends here. Never rejects.
   */
  // @cpt-algo:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1
  private async executeChain(chain: ActionsChain, escalate = true): Promise<void> {
    try {
      const { action } = chain;
      // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-resolve-handler
      const resolved = this.resolveHandler(action.target, action.type, getArrivalEdge(action), escalate);
      // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-resolve-handler

      // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-no-handler-check
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-no-handler
      // @cpt-begin:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-t-pending-failed-refused
      if (!resolved) {
        const error = new NoHandlerForActionTargetError(action.target, action.type);
        // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-no-handler-log
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-log-no-handler
        console.warn(`[ActionsChainsMediator] ${error.message}; payload:`, action.payload);
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-log-no-handler
        // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-no-handler-log
        // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-no-handler-fallback
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-throw-no-handler
        throw error;
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-throw-no-handler
        // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-no-handler-fallback
      }
      // @cpt-end:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-t-pending-failed-refused
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-no-handler
      // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-no-handler-check

      // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-cross-hop-check
      if (isCrossHopRoute(resolved)) {
        // Hands the sub-chain — the action with its `next` and `fallback` —
        // over in the versioned envelope. A refusal throws, so the catch
        // below executes `fallback`; the refusal has no side effect at the
        // far side.
        // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-hand-over
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-hand-over-node
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-delivery-binary
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-delivery-refused
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-refused-delivery-fallback
        // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-delivery-refused
        // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-refused-fallback
        // @cpt-begin:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-t-pending-failed-refused
        resolved.send({ version: CROSS_HOP_PROTOCOL_VERSION, chain });
        // @cpt-end:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-t-pending-failed-refused
        // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-refused-fallback
        // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-delivery-refused
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-refused-delivery-fallback
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-delivery-refused
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-delivery-binary
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-hand-over-node
        // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-hand-over
        // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-delivery-accepted
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-delivery-accepted
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-hand-over-done
        return;
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-hand-over-done
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-delivery-accepted
        // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-delivery-accepted
      }
      // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-cross-hop-check

      // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-admit-action
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-delegate-admit
      this.typeSystem.register(action);
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-delegate-admit
      // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-admit-action

      // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-decl-check
      this.checkDeclaration(action);
      // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-decl-check

      // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-invoke-handler
      // @cpt-begin:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-t-pending-dispatched
      // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-admitted-mount
      await this.invokeWithinTimeout(action, resolved);
      // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-admitted-mount
      // @cpt-end:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-t-pending-dispatched
      // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-invoke-handler
    } catch {
      // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-fail-check
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-failure
      // @cpt-begin:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-t-dispatched-failed
      // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-check-fallback
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-has-fallback
      // @cpt-begin:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-failed-check-fallback
      if (chain?.fallback) {
        // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-recurse-fallback
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-recurse-fallback-algo
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-dispatch-continuation
        // @cpt-begin:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-failed-to-fallback
        // @cpt-begin:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-t-failed-fallback
        return this.executeChain(chain.fallback);
        // @cpt-end:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-t-failed-fallback
        // @cpt-end:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-failed-to-fallback
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-dispatch-continuation
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-recurse-fallback-algo
        // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-recurse-fallback
      }
      // @cpt-end:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-failed-check-fallback
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-has-fallback
      // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-check-fallback
      // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-no-fallback
      // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-return-failed
      // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-no-handler-no-fallback
      // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-no-handler-return
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-no-fallback-algo
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-end-at-node
      // @cpt-begin:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-failed-no-fallback
      // @cpt-begin:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-failed-end-at-node
      return;
      // @cpt-end:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-failed-end-at-node
      // @cpt-end:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-failed-no-fallback
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-end-at-node
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-no-fallback-algo
      // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-no-handler-return
      // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-no-handler-no-fallback
      // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-return-failed
      // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-no-fallback
      // @cpt-end:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-t-dispatched-failed
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-failure
      // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-fail-check
    }

    // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-success-check
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-success
    // @cpt-begin:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-t-dispatched-succeeded
    // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-check-next
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-has-next
    if (chain.next) {
      // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-recurse-next
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-recurse-success
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-dispatch-continuation
      // @cpt-begin:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-t-succeeded-dispatched
      return this.executeChain(chain.next);
      // @cpt-end:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-t-succeeded-dispatched
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-dispatch-continuation
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-recurse-success
      // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-recurse-next
    }
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-has-next
    // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-check-next
    // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-no-next
    // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-return-completed
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-chain-done
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-return-done
    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-mount-success
    return;
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-mount-success
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-return-done
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-chain-done
    // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-return-completed
    // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-no-next
    // @cpt-end:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-t-dispatched-succeeded
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-success
    // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-success-check
  }

  /**
   * Declaration check: the target entry must declare the action type in its
   * receivable `actions`. Infrastructure lifecycle actions are exempt; a
   * target with no registered entry is not checked.
   */
  private checkDeclaration(action: Action): void {
    if (isInfrastructureLifecycleAction(action.type, this.typeSystem)) {
      return;
    }
    const entry = this.getExtensionEntry(action.target);
    // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-decl-fail-check
    if (entry && !entry.actions.includes(action.type)) {
      // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-decl-fail-return
      throw new Error(
        `Action type '${action.type}' is not declared by target entry '${entry.id}'`
      );
      // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-decl-fail-return
    }
    // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-decl-fail-check
  }

  /**
   * Invoke the handler within the per-action timeout: the action's declared
   * timeout, otherwise the domain default. Rejects on handler failure or
   * timeout expiry.
   */
  private invokeWithinTimeout(action: Action, handler: ActionHandler): Promise<void> {
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-resolve-timeout
    const timeout = this.actionTimeoutResolver.resolve(
      action.timeout,
      this.resolveDomain(action.target),
      action.target
    );
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-resolve-timeout

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-invoke-within-timeout
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Action timeout after ${timeout}ms`));
      }, timeout);
      const settle = (outcome: () => void): void => {
        clearTimeout(timer);
        outcome();
      };
      try {
        const invocation = handler instanceof DeclaredTimeoutActionHandler
          ? handler.handleActionWithDeclaredTimeout(action.type, action.payload, action.timeout)
          : handler.handleAction(action.type, action.payload);
        invocation.then(
          () => settle(resolve),
          (error: unknown) => settle(() => reject(error))
        );
      } catch (error) {
        settle(() => reject(error));
      }
    });
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-invoke-within-timeout
  }

  /**
   * Resolve the handler for a (targetId, actionTypeId) pair: exact
   * (target, action type) keyed handler, then a downward forwarding entry (excluding one whose
   * bridge equals the arrival edge), then escalation unless `escalate` is
   * false.
   *
   * @returns The handler or cross-hop route, or undefined if none resolves.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-keyed-lookup
  private resolveHandler(
    targetId: string,
    actionTypeId: string,
    arrivalEdge: unknown,
    escalate: boolean
  ): ActionHandler | CrossHopRoute | undefined {
    const targetHandlers = this.actionHandlers.get(targetId);
    if (targetHandlers) {
      const handler = targetHandlers.get(actionTypeId);
      if (handler) {
        return handler;
      }
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-keyed-lookup
    }

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-no-keyed

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-forwarding-entry-lookup
    const forwardingRoute = this.resolveForwardingEntry?.(targetId, arrivalEdge);
    if (forwardingRoute) {
      return forwardingRoute;
    }
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-forwarding-entry-lookup

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-escalation-lookup
    return escalate ? this.resolveEscalation?.() : undefined;
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-escalation-lookup
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-no-keyed
  }

  /**
   * Resolve the domain of a target: the target itself when it is a domain,
   * otherwise the domain an extension target was registered under.
   */
  private resolveDomain(targetId: string): ExtensionDomain | undefined {
    const domainState = this.getDomainState(targetId);
    if (domainState) {
      return domainState.domain;
    }
    const domainId = this.targetDomainMap.get(targetId);
    return domainId ? this.getDomainState(domainId)?.domain : undefined;
  }

  /**
   * Register a handler for a specific (targetId, actionTypeId) pair.
   *
   * @param targetId - ID of the target (domain or extension)
   * @param actionTypeId - The action type this handler handles
   * @param handler - Handler to invoke
   * @param domainId - Domain ID for extension targets (default timeout resolution)
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
    if (domainId !== undefined) {
      this.targetDomainMap.set(targetId, domainId);
    }
  }

  /**
   * Unregister a handler for a specific (targetId, actionTypeId) pair.
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
   * Unregister every handler for a target.
   */
  unregisterAllHandlers(targetId: string): void {
    this.actionHandlers.delete(targetId);
    this.targetDomainMap.delete(targetId);
  }
}
