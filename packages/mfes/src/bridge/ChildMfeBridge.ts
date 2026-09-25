// @cpt-flow:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1
/**
 * Child MFE Bridge Implementation
 *
 * Provides the bridge interface given TO child MFEs for communication with the host.
 * This is the MFE's primary interface for accessing shared properties and sending actions.
 *
 * @packageDocumentation
 */

import { ChildMfeBridge } from '../handler/types';
import type { ActionHandler } from '../mediator/types';
import type { CrossHopEnvelope } from '../mediator/cross-hop-route';
import type { SharedProperty, ActionsChain } from '../types';
import { NoActionsChainHandlerError, BridgeDisposedError, BridgeInactiveError } from './errors';

/**
 * Internal implementation of ChildMfeBridge.
 * This class is given to child MFEs for host communication.
 *
 * One instance is created per extension, at its first mount, and handed to
 * every subsequent mount of that extension as the same object
 * (`inst-bridge-lifetime`). Its active/inactive/destroyed state is private
 * implementation detail, visible on no public surface.
 *
 * @internal
 */
export class ChildMfeBridgeImpl extends ChildMfeBridge {
  readonly extDomainId: string;
  readonly extensionId: string;

  /**
   * Internal: property subscriptions.
   * Maps propertyTypeId to callbacks.
   */
  private readonly propertySubscribers = new Map<string, Set<(value: SharedProperty) => void>>();

  /**
   * Internal: current property values (populated from domain state).
   */
  private readonly properties = new Map<string, SharedProperty>();

  /**
   * Internal: handler receiving a versioned cross-hop envelope forwarded or
   * escalated down to this registry through the inbound-bridge link — the
   * transport every runtime-crossing hop resolves to, including a plain
   * parent-to-child action chain delivery. Wired by
   * `DefaultMfeRegistry.relinkInboundBridge` to
   * `DefaultMfeRegistry.receiveCrossHopNode`, duck-typed for cross-copy
   * safety. Synchronous and binary: throws to refuse the delivery, or
   * returns having accepted the node and reserved what it needs.
   */
  private crossHopEnvelopeHandler: ((envelope: CrossHopEnvelope) => void) | null = null;

  /**
   * Internal: callback for the public, acceptance-only dispatch of actions
   * chains via the registry — the registry's own `executeActionsChain`,
   * void and synchronously-refusing. Injected by the bridge factory during
   * wiring. This is the ONLY action-dispatch path this bridge carries:
   * fire-and-forget on acceptance, with no completion of any kind ever
   * crossing back over it (`cpt-frontx-adr-mfe-runtime-public-surface`).
   */
  private executeActionsChainCallback: ((chain: ActionsChain) => void) | null = null;

  /**
   * Internal: callback for registering child domains in the parent mediator.
   */
  private registerChildDomainCallback: ((domainId: string) => void) | null = null;

  /**
   * Internal: callback for unregistering child domains from the parent mediator.
   */
  private unregisterChildDomainCallback: ((domainId: string) => void) | null = null;

  /**
   * Internal: callback for registering this MFE's action handler in the parent mediator.
   * The callback receives the actionTypeId and handler class instance.
   */
  private registerActionHandlerCallback: ((actionTypeId: string, handler: ActionHandler) => void) | null = null;

  /**
   * Internal: set of child domain IDs registered via registerChildDomain().
   * Tracked for cleanup on bridge disposal.
   */
  private readonly childDomainIds: Set<string> = new Set();

  /**
   * Internal: whether this bridge is currently mounted. `false` between an
   * unmount (or failed mount) and the next reactivation.
   */
  private active = false;

  /**
   * Internal: whether this bridge has been permanently torn down (the
   * extension it belongs to was unregistered). Once `true`, stays `true`.
   */
  private destroyed = false;

  constructor(
    extDomainId: string,
    extensionId: string
  ) {
    super();
    this.extDomainId = extDomainId;
    this.extensionId = extensionId;
  }

  /**
   * INTERNAL: Reactivate this bridge for a fresh mount. Called by the
   * runtime bridge factory. Throws if the bridge has been permanently
   * disposed.
   *
   * @internal
   */
  activate(): void {
    if (this.destroyed) {
      throw new BridgeDisposedError(this.extensionId);
    }
    this.active = true;
  }

  /**
   * INTERNAL: Deactivate this bridge on unmount or mount failure. Handler
   * registrations and property subscriptions survive.
   *
   * @internal
   */
  deactivate(): void {
    this.active = false;
  }

  /**
   * INTERNAL: Whether this bridge is currently mounted and not destroyed.
   *
   * @internal
   */
  isActive(): boolean {
    return this.active && !this.destroyed;
  }

  /**
   * INTERNAL: Whether this bridge has been permanently disposed.
   *
   * @internal
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Accept (or synchronously refuse) an actions chain for execution via the
   * registry. This is a capability pass-through — it forwards directly to
   * the registry's own acceptance-only `executeActionsChain` callback,
   * adding no coordination logic of its own. This is the ONLY public API
   * for actions chain execution from child MFEs
   * (`cpt-frontx-adr-child-mfe-host-access`).
   *
   * Refuses synchronously, before anything is forwarded, when this bridge
   * is disposed, already inactive, or holds no wired dispatch callback —
   * each an unusable dispatch capability AT THE CALL. Yields nothing a
   * child can await for the chain's own execution.
   *
   * @param chain - Actions chain to accept.
   * @throws {BridgeDisposedError} If the bridge has been permanently disposed
   * @throws {BridgeInactiveError} If the extension is registered but not currently mounted
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-fwd-exec-chain
  executeActionsChain(chain: ActionsChain): void {
    if (this.destroyed) {
      throw new BridgeDisposedError(this.extensionId);
    }
    if (!this.active) {
      throw new BridgeInactiveError(this.extensionId);
    }
    if (!this.executeActionsChainCallback) {
      throw new Error(`Bridge not connected for extension '${this.extensionId}'`);
    }
    this.executeActionsChainCallback(chain);
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-fwd-exec-chain

  /**
   * Register the handler receiving a versioned cross-hop envelope forwarded
   * or escalated down through this bridge — the transport every runtime-
   * crossing hop resolves to (`cpt-frontx-adr-action-dispatch-and-chaining`).
   * Compare-and-clear unsubscribe: since this bridge object is the SAME one
   * handed to every mount of this extension (`inst-bridge-lifetime`), an
   * unsubscribe captured by an earlier registration must not clobber a
   * DIFFERENT handler installed after it replaced this one.
   *
   * @internal concrete-only; not part of the abstract `ChildMfeBridge` contract.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-relink-downward-delivery
  onCrossHopEnvelope(handler: (envelope: CrossHopEnvelope) => void): () => void {
    if (this.crossHopEnvelopeHandler !== null) {
      console.warn(`onCrossHopEnvelope: replacing existing handler for extension '${this.extensionId}'`);
    }
    this.crossHopEnvelopeHandler = handler;
    return () => {
      if (this.crossHopEnvelopeHandler === handler) {
        this.crossHopEnvelopeHandler = null;
      }
    };
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-relink-downward-delivery

  /**
   * Subscribe to a specific property's updates.
   *
   * @param propertyTypeId - Type ID of the property to subscribe to
   * @param callback - Callback to invoke when property updates
   * @returns Unsubscribe function
   */
  subscribeToProperty(
    propertyTypeId: string,
    callback: (value: SharedProperty) => void
  ): () => void {
    let subscribers = this.propertySubscribers.get(propertyTypeId);
    if (!subscribers) {
      subscribers = new Set();
      this.propertySubscribers.set(propertyTypeId, subscribers);
    }
    subscribers.add(callback);

    // Return unsubscribe function
    return () => {
      subscribers?.delete(callback);
      if (subscribers && subscribers.size === 0) {
        this.propertySubscribers.delete(propertyTypeId);
      }
    };
  }

  /**
   * Get a property's current value synchronously.
   *
   * @param propertyTypeId - Type ID of the property to get
   * @returns Current property value, or undefined if not set
   */
  getProperty(propertyTypeId: string): SharedProperty | undefined {
    return this.properties.get(propertyTypeId);
  }

  /**
   * INTERNAL: Called by ParentMfeBridge when domain property changes.
   * Always records the value. Subscribers are notified only while the
   * bridge is active; no replay happens on reactivation.
   *
   * @param propertyTypeId - Type ID of the property that changed
   * @param value - New property value
   */
  receivePropertyUpdate(propertyTypeId: string, value: SharedProperty): void {
    if (this.destroyed) {
      return; // Hard no-op after permanent teardown.
    }

    this.properties.set(propertyTypeId, value);

    if (!this.active) {
      return; // Recorded, but subscribers are not notified while inactive.
    }

    // Notify property-specific subscribers
    const propertySubscribers = this.propertySubscribers.get(propertyTypeId);
    if (propertySubscribers) {
      for (const callback of propertySubscribers) {
        try {
          callback(value);
        } catch (error) {
          // Swallow errors from subscribers - don't let them break the bridge
          console.error(`Error in property subscriber for '${propertyTypeId}':`, error);
        }
      }
    }
  }

  /**
   * INTERNAL: Set the callback for the public, acceptance-only dispatch of
   * actions chains via the registry. Called by the bridge factory during
   * wiring.
   *
   * @param callback - The registry's own void, synchronously-refusing
   *   `executeActionsChain` method.
   */
  setExecuteActionsChainCallback(
    callback: (chain: ActionsChain) => void
  ): void {
    this.executeActionsChainCallback = callback;
  }

  /**
   * INTERNAL: Set callbacks for child domain registration.
   * Called by bridge factory during wiring.
   *
   * @param register - Callback to register a child domain in the parent mediator
   * @param unregister - Callback to unregister a child domain from the parent mediator
   */
  setChildDomainCallbacks(
    register: (domainId: string) => void,
    unregister: (domainId: string) => void
  ): void {
    this.registerChildDomainCallback = register;
    this.unregisterChildDomainCallback = unregister;
  }

  /**
   * INTERNAL: Set callback for action handler registration.
   * Called by bridge factory during wiring.
   *
   * @param callback - Callback that registers the handler in the parent mediator
   */
  setRegisterActionHandlerCallback(callback: (actionTypeId: string, handler: ActionHandler) => void): void {
    this.registerActionHandlerCallback = callback;
  }

  /**
   * Register a handler for a specific action type on this MFE.
   * Delegates to the wired callback which calls mediator.registerHandler().
   * May be called multiple times — once per action type. The registration
   * survives this bridge's deactivation and is released only at the
   * extension's permanent unregistration.
   *
   * @param actionTypeId - The action type this handler handles
   * @param handler - The ActionHandler instance to invoke
   * @throws Error if the callback was not wired by the bridge factory (programming error)
   */
  registerActionHandler(actionTypeId: string, handler: ActionHandler): void {
    if (!this.registerActionHandlerCallback) {
      throw new Error('registerActionHandler callback not wired');
    }
    this.registerActionHandlerCallback(actionTypeId, handler);
  }

  /**
   * INTERNAL: Register a child domain for cross-runtime action forwarding.
   * This is a concrete-only method used by child MFEs that define their own domains.
   *
   * When a child MFE registers its own domains in a child MfeRegistry,
   * it should call this method to enable the parent's mediator to route actions
   * to those domains through the bridge transport.
   *
   * @param domainId - ID of the child domain to register
   * @throws Error if callbacks are not wired (programming error)
   */
  registerChildDomain(domainId: string): void {
    if (!this.registerChildDomainCallback) {
      throw new Error('registerChildDomain callback not wired');
    }
    this.registerChildDomainCallback(domainId);
    this.childDomainIds.add(domainId);
  }

  /**
   * INTERNAL: Unregister a child domain from cross-runtime action forwarding.
   * This is a concrete-only method used by child MFEs to clean up forwarding.
   *
   * @param domainId - ID of the child domain to unregister
   */
  unregisterChildDomain(domainId: string): void {
    if (this.unregisterChildDomainCallback) {
      this.unregisterChildDomainCallback(domainId);
    }
    this.childDomainIds.delete(domainId);
  }

  /**
   * INTERNAL: Handle a versioned cross-hop envelope sent from the parent —
   * a downward forwarding entry, the converted parent-to-child-domain
   * forwarding tier, or a plain parent-to-child action chain delivery.
   * Called by `ParentMfeBridgeImpl.sendCrossHopEnvelope()`. Throws the same
   * way for a disposed or inactive bridge, so that failure is a node
   * failure inside the sending hop's own boundary rather than a silent
   * success.
   *
   * Synchronous and binary: throws to refuse the delivery at the call, with
   * no side effect here, or returns having handed the envelope to the
   * registered receiver, which has already accepted and reserved what the
   * node needs before this call returns
   * (`cpt-frontx-adr-action-dispatch-and-chaining`).
   *
   * @throws {BridgeDisposedError} If the bridge has been permanently disposed
   * @throws {BridgeInactiveError} If the extension is registered but not currently mounted
   * @throws {NoActionsChainHandlerError} If no receiver is registered
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-child-invoke
  handleCrossHopEnvelope(envelope: CrossHopEnvelope): void {
    if (this.destroyed) {
      throw new BridgeDisposedError(this.extensionId);
    }
    if (!this.active) {
      throw new BridgeInactiveError(this.extensionId);
    }
    if (this.crossHopEnvelopeHandler === null) {
      throw new NoActionsChainHandlerError(this.extensionId);
    }
    this.crossHopEnvelopeHandler(envelope);
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-child-invoke

  /**
   * INTERNAL: Permanent teardown, called by the bridge factory only when the
   * extension this bridge belongs to is unregistered.
   *
   * CRITICAL ORDERING: Must unregister all child domains BEFORE nulling callbacks.
   * This ensures forwarding handlers are properly removed from the parent's mediator.
   */
  destroy(): void {
    // Step 1: Unregister all tracked child domains (callbacks MUST be wired at this point)
    for (const domainId of this.childDomainIds) {
      this.unregisterChildDomain(domainId);
    }

    // Step 2: Clear the set
    this.childDomainIds.clear();

    // Step 3: Now null the callbacks (after all unregistrations are complete)
    this.registerChildDomainCallback = null;
    this.unregisterChildDomainCallback = null;
    this.registerActionHandlerCallback = null;

    // Clean up the rest
    this.propertySubscribers.clear();
    this.properties.clear();
    this.crossHopEnvelopeHandler = null;
    this.executeActionsChainCallback = null;

    this.active = false;
    this.destroyed = true;
  }
}
