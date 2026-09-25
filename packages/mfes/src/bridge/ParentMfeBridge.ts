// @cpt-flow:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1
/**
 * Parent MFE Bridge Implementation
 *
 * Used by the parent runtime to manage child MFE instances.
 * Connects to ChildMfeBridge for bidirectional communication.
 *
 * @packageDocumentation
 */

import { ParentMfeBridge } from '../handler/types';
import type { CrossHopEnvelope } from '../mediator/cross-hop-route';
import type { SharedProperty } from '../types';
import type { ChildMfeBridgeImpl } from './ChildMfeBridge';
import { BridgeDisposedError, BridgeInactiveError } from './errors';

type PropertySubscriber = (propertyTypeId: string, value: unknown) => void;

/**
 * Internal implementation of ParentMfeBridge.
 * Used by the host to manage a child MFE instance.
 *
 * @internal
 */
export class ParentMfeBridgeImpl extends ParentMfeBridge {
  /**
   * Reference to the child bridge.
   */
  private readonly childBridge: ChildMfeBridgeImpl;

  /**
   * Permanent-disposal state, delegated to the child bridge — the single
   * source of truth for both active/inactive and destroyed state
   * (`inst-bridge-lifetime`).
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-bridge-lifetime
  private get destroyed(): boolean {
    return this.childBridge.isDestroyed();
  }

  private get active(): boolean {
    return this.childBridge.isActive();
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-bridge-lifetime

  /**
   * Property update subscribers - tracks callbacks registered in domain.propertySubscribers.
   * Maps propertyTypeId to the subscriber callback, so we can remove them on disposal.
   * INTERNAL: Set by bridge factory during creation.
   */
  private readonly propertySubscribers = new Map<string, PropertySubscriber>();

  /**
   * The GTS id of the extension this bridge belongs to; stable across every
   * mount of that extension.
   */
  readonly instanceId: string;

  constructor(childBridge: ChildMfeBridgeImpl) {
    super();
    this.childBridge = childBridge;
    this.instanceId = childBridge.extensionId;
  }

  /**
   * INTERNAL: Access the child bridge this parent bridge wraps.
   */
  getChildBridge(): ChildMfeBridgeImpl {
    return this.childBridge;
  }

  /**
   * Hand a versioned cross-hop envelope to the child MFE — the transport
   * every runtime-crossing hop resolves to
   * (`cpt-frontx-adr-action-dispatch-and-chaining`), used by a downward
   * forwarding entry and by the converted parent-to-child-domain forwarding
   * tier, and by the parent runtime sending an action chain directly to a
   * child's domain.
   *
   * Synchronous and binary: throws to refuse the delivery at the call, with
   * no side effect in the child runtime, or returns having handed the node
   * to the child's registry, which has already accepted and reserved what
   * it needs before this call returns — this runtime is then done with the
   * node and holds nothing for it (`cpt-frontx-adr-action-dispatch-and-chaining`).
   * Nothing awaitable ever crosses this bridge: completion observation
   * stays strictly inside the executor that accepts the envelope.
   *
   * @internal concrete-only; not part of the abstract `ParentMfeBridge` contract.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-parent-send-chain
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-deliver-to-child
  sendCrossHopEnvelope(envelope: CrossHopEnvelope): void {
    if (this.destroyed) {
      throw new BridgeDisposedError(this.instanceId);
    }
    if (!this.active) {
      throw new BridgeInactiveError(this.instanceId);
    }
    this.childBridge.handleCrossHopEnvelope(envelope);
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-deliver-to-child
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-parent-send-chain

  /**
   * Called by MfeRegistry when a domain property is updated.
   * Forwards the update to the child bridge. Recorded on the child bridge
   * even while inactive, but its subscribers are only notified while active
   * (`ChildMfeBridgeImpl.receivePropertyUpdate`).
   *
   * @param propertyTypeId - Type ID of the property
   * @param value - New property value
   */
  receivePropertyUpdate(propertyTypeId: string, value: unknown): void {
    if (this.destroyed) {
      return; // Silently ignore updates after permanent disposal.
    }
    const sharedProperty: SharedProperty = { id: propertyTypeId, value };
    this.childBridge.receivePropertyUpdate(propertyTypeId, sharedProperty);
  }

  /**
   * Register a property subscriber that was added to domain.propertySubscribers.
   * INTERNAL: Called by bridge factory during setup.
   * Tracked so we can remove it from domain.propertySubscribers on disposal.
   *
   * @param propertyTypeId - Property type ID
   * @param subscriber - Subscriber callback
   */
  registerPropertySubscriber(
    propertyTypeId: string,
    subscriber: PropertySubscriber
  ): void {
    this.propertySubscribers.set(propertyTypeId, subscriber);
  }

  /**
   * Get all registered property subscribers for cleanup.
   * INTERNAL: Called by bridge factory during disposal to remove subscribers from domain.
   *
   * @returns Map of propertyTypeId to subscriber callbacks
   */
  getPropertySubscribers(): Map<string, PropertySubscriber> {
    return this.propertySubscribers;
  }

  /**
   * Permanent teardown, performed only when the extension this bridge
   * belongs to is unregistered — never on an ordinary unmount, which instead
   * goes through the runtime bridge factory's `deactivateBridge`.
   *
   * NOTE: This does NOT remove property subscribers from domain.propertySubscribers.
   * The bridge factory must handle that cleanup using getPropertySubscribers().
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-parent-handle
  dispose(): void {
    if (this.destroyed) {
      return; // Idempotent
    }
    this.propertySubscribers.clear();
    this.childBridge.destroy();
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-parent-handle
}
