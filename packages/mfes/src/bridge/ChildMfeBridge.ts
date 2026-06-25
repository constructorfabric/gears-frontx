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
import type { SharedProperty, ActionsChain } from '../types';
import { NoActionsChainHandlerError } from './errors';

/**
 * Internal implementation of ChildMfeBridge.
 * This class is given to child MFEs for host communication.
 *
 * @internal
 */
export class ChildMfeBridgeImpl extends ChildMfeBridge {
  readonly domainId: string;
  readonly instanceId: string;

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
   * Internal: reference to parent bridge for action chain forwarding.
   */
  private parentBridge: import('./ParentMfeBridge').ParentMfeBridgeImpl | null = null;

  /**
   * Internal: handler for actions chains sent from parent to child.
   */
  private actionsChainHandler: ((chain: ActionsChain) => Promise<void>) | null = null;

  /**
   * Internal: callback for executing actions chains via the registry.
   * Injected by bridge factory during wiring.
   */
  private executeActionsChainCallback: ((chain: ActionsChain) => Promise<void>) | null = null;

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

  constructor(
    domainId: string,
    instanceId: string
  ) {
    super();
    this.domainId = domainId;
    this.instanceId = instanceId;
  }

  /**
   * Execute an actions chain via the registry.
   * This is a capability pass-through -- the bridge delegates directly to
   * the registry's executeActionsChain(). This is the ONLY public API for
   * actions chain execution from child MFEs.
   *
   * @param chain - Actions chain to execute
   * @returns Promise resolving when execution is complete
   */
  async executeActionsChain(chain: ActionsChain): Promise<void> {
    if (!this.executeActionsChainCallback) {
      throw new Error(`Bridge not connected for instance '${this.instanceId}'`);
    }
    return this.executeActionsChainCallback(chain);
  }

  /**
   * INTERNAL: Send an actions chain to the host domain.
   * Forwards to parent bridge's child action handler.
   * This is a concrete-only method for internal child-to-parent transport.
   *
   * @param chain - Actions chain to send
   * @returns Promise resolving when execution is complete
   */
  async sendActionsChain(chain: ActionsChain): Promise<void> {
    if (!this.parentBridge) {
      throw new Error(`Bridge not connected for instance '${this.instanceId}'`);
    }
    return this.parentBridge.handleChildAction(chain);
  }

  /**
   * Register a handler for actions chains sent from the parent domain.
   * Child MFEs that define their own domains should register a handler
   * to enable parent-to-child action chain delivery.
   *
   * @param handler - Handler for parent actions chains
   * @returns Unsubscribe function
   */
  onActionsChain(handler: (chain: ActionsChain) => Promise<void>): () => void {
    if (this.actionsChainHandler !== null) {
      console.warn(`onActionsChain: replacing existing handler for instance '${this.instanceId}'`);
    }
    this.actionsChainHandler = handler;
    return () => {
      this.actionsChainHandler = null;
    };
  }

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
   *
   * @param propertyTypeId - Type ID of the property that changed
   * @param value - New property value
   */
  receivePropertyUpdate(propertyTypeId: string, value: SharedProperty): void {
    this.properties.set(propertyTypeId, value);

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
   * INTERNAL: Connect this child bridge to its parent bridge.
   *
   * @param parent - Parent bridge instance
   */
  setParentBridge(parent: import('./ParentMfeBridge').ParentMfeBridgeImpl): void {
    this.parentBridge = parent;
  }

  /**
   * INTERNAL: Set the callback for executing actions chains via the registry.
   * Called by bridge factory during wiring.
   *
   * @param callback - Registry's executeActionsChain method
   */
  setExecuteActionsChainCallback(
    callback: (chain: ActionsChain) => Promise<void>
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
   * May be called multiple times — once per action type.
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
   * INTERNAL: Handle actions chain sent from parent to child.
   * Called by ParentMfeBridgeImpl.sendActionsChain().
   *
   * @param chain - Actions chain from parent
   * @returns Promise resolving when execution is complete
   * @throws {NoActionsChainHandlerError} If no handler is registered
   */
  handleParentActionsChain(chain: ActionsChain): Promise<void> {
    if (this.actionsChainHandler === null) {
      throw new NoActionsChainHandlerError(this.instanceId);
    }
    return this.actionsChainHandler(chain);
  }

  /**
   * INTERNAL: Cleanup method called by bridge factory.
   *
   * CRITICAL ORDERING: Must unregister all child domains BEFORE nulling callbacks.
   * This ensures forwarding handlers are properly removed from the parent's mediator.
   */
  cleanup(): void {
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
    this.parentBridge = null;
    this.actionsChainHandler = null;
    this.executeActionsChainCallback = null;
  }
}
