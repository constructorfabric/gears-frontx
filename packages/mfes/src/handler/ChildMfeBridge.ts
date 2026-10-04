import type { ActionsChain, SharedProperty } from '../types';
import { ActionHandler } from '../mediator/ActionHandler';

/**
 * Child MFE Bridge abstract class.
 * Provided to child MFEs for communication with the host.
 */
// @cpt-begin:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-inbound-bridge-internal
export abstract class ChildMfeBridge {
  /** The GTS id of the domain the extension is mounted into. */
  abstract readonly extDomainId: string;
  /** The extension's own GTS id. */
  abstract readonly extensionId: string;

  /**
   * Hand an actions chain to the host registry's `executeActionsChain`,
   * adding no coordination logic, and return nothing awaitable. The only
   * public API for actions chain execution from child MFEs
   * (`cpt-frontx-adr-child-mfe-host-access`). While the bridge is inactive,
   * disposed, or not wired to a dispatch callback, it hands nothing over.
   *
   * @param chain - Actions chain to execute.
   */
  abstract executeActionsChain(chain: ActionsChain): void;

  /**
   * Subscribe to a specific property's updates.
   *
   * @param propertyTypeId - Type ID of the property to subscribe to
   * @param callback - Callback invoked when property updates
   * @returns Unsubscribe function
   */
  abstract subscribeToProperty(propertyTypeId: string, callback: (value: SharedProperty) => void): () => void;

  /**
   * Get a property's current value synchronously.
   *
   * @param propertyTypeId - Type ID of the property to get
   * @returns Current property value, or undefined if not set
   */
  abstract getProperty(propertyTypeId: string): SharedProperty | undefined;

  /**
   * Register a handler for a specific action type on this MFE.
   * The MFE may call this once per action type it wants to handle.
   * The mediator routes extension-targeted actions by (extensionId, actionTypeId) pair.
   *
   * @param actionTypeId - The action type this handler handles
   * @param handler - The ActionHandler instance to invoke
   */
  abstract registerActionHandler(actionTypeId: string, handler: ActionHandler): void;
}
// @cpt-end:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-inbound-bridge-internal
