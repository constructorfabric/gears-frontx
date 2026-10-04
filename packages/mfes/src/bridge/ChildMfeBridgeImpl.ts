// @cpt-flow:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1
/**
 * Child MFE Bridge Implementation
 *
 * Provides the bridge interface given TO child MFEs for communication with the host.
 * This is the MFE's primary interface for accessing shared properties and sending actions.
 *
 * @packageDocumentation
 */

import { ChildMfeBridge } from '../handler/ChildMfeBridge';
import type { ActionHandler } from '../mediator/ActionHandler';
import type { CrossHopEnvelope } from '../mediator/CrossHopRoute';
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
   * Internal: receiver of a hand-over through this bridge. Wired by
   * `DefaultMfeRegistry.relinkInboundBridge` to
   * `DefaultMfeRegistry.receiveCrossHopNode`, duck-typed for cross-copy
   * safety. Throws to refuse the hand-over, or returns having accepted it.
   */
  private crossHopEnvelopeHandler: ((envelope: CrossHopEnvelope) => void) | null = null;

  /**
   * Internal: the registry's own `executeActionsChain`, injected by the
   * bridge factory during wiring (`cpt-frontx-adr-mfe-runtime-public-surface`).
   */
  private executeActionsChainCallback: ((chain: ActionsChain) => void) | null = null;

  /**
   * Internal: callback for registering this MFE's action handler in the parent mediator.
   * The callback receives the actionTypeId and handler class instance.
   */
  private registerActionHandlerCallback: ((actionTypeId: string, handler: ActionHandler) => void) | null = null;

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
   * Hand an actions chain to the registry's `executeActionsChain`, adding
   * no coordination logic, and return nothing. The only public API for
   * actions chain execution from child MFEs
   * (`cpt-frontx-adr-child-mfe-host-access`). While this bridge is disposed,
   * inactive, or not wired to a dispatch callback, it hands nothing over.
   *
   * @param chain - Actions chain to execute.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-fwd-exec-chain
  executeActionsChain(chain: ActionsChain): void {
    if (this.destroyed || !this.active || !this.executeActionsChainCallback) {
      return;
    }
    this.executeActionsChainCallback(chain);
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-fwd-exec-chain

  /**
   * Register the receiver of a hand-over through this bridge
   * (`cpt-frontx-adr-action-dispatch-and-chaining`).
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
   * INTERNAL: Set the registry's `executeActionsChain` callback. Called by
   * the bridge factory during wiring.
   *
   * @param callback - The registry's own `executeActionsChain` method.
   */
  setExecuteActionsChainCallback(
    callback: (chain: ActionsChain) => void
  ): void {
    this.executeActionsChainCallback = callback;
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
   * INTERNAL: Pass a hand-over from the parent — a downward forwarding
   * entry — to the registered receiver,
   * which accepts or refuses it. Called by
   * `ParentMfeBridgeImpl.sendCrossHopEnvelope()`. With the bridge disposed or
   * inactive, or no receiver registered, refuses without invoking the
   * receiver, leaving no side effect here, so the delivering runtime
   * executes the `fallback`.
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
   */
  destroy(): void {
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
