/**
 * MFE Handler Types
 *
 * Defines the abstract handler interface and related types for loading MFEs.
 * Handlers are responsible for loading MFE bundles and creating bridges.
 *
 * @packageDocumentation
 */
// @cpt-dod:cpt-frontx-dod-mfe-registry-handler-injection:p1
// @cpt-dod:cpt-frontx-dod-mfe-registry-type-contracts:p1
// @cpt-dod:cpt-frontx-dod-mfe-isolation-child-bridge-contract:p1
// @cpt-algo:cpt-frontx-algo-mfe-registry-handler-resolution:p1

import type { MfeEntry, ActionsChain, SharedProperty } from '../types';
import { ActionHandler } from '../mediator/types';

/**
 * Parent MFE Bridge abstract class.
 * Used by the parent runtime to manage child MFE instances.
 */
export abstract class ParentMfeBridge {
  /**
   * Unique instance ID for the child MFE.
   */
  abstract readonly instanceId: string;

  /**
   * Dispose the bridge and clean up resources.
   */
  abstract dispose(): void;
}

/**
 * Child MFE Bridge abstract class.
 * Provided to child MFEs for communication with the host.
 */
export abstract class ChildMfeBridge {
  abstract readonly domainId: string;
  abstract readonly instanceId: string;

  /**
   * Execute an actions chain via the registry.
   * This is a capability pass-through -- the bridge delegates directly to
   * the registry's executeActionsChain(). This is the ONLY public API for
   * actions chain execution from child MFEs.
   *
   * Child MFEs should use this method to execute actions chains in the host
   * domain or target other domains.
   *
   * @param chain - Actions chain to execute
   * @returns Promise resolving when execution is complete
   */
  abstract executeActionsChain(chain: ActionsChain): Promise<void>;

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

/**
 * Runtime values supplied by the host at mount time.
 *
 * The runtime attaches identity metadata (`extensionId`, `domainId`) so child
 * lifecycles can understand their host context without learning runtime internals.
 */
export interface MfeMountContext {
  readonly extensionId?: string;
  readonly domainId?: string;
}

/**
 * MFE lifecycle interface.
 * All MFE entries must implement this interface.
 */
export interface MfeEntryLifecycle<TBridge = ChildMfeBridge> {
  /**
   * Mount the MFE to a DOM container.
   *
   * With the default handler (`MfeHandlerMF`), the `container` parameter will be
   * a `ShadowRoot` created by `DefaultMountManager`. With custom handlers, it may
   * be a plain `Element`. React's `createRoot()` accepts both types.
   *
   * @param container - DOM element or shadow root to mount into
   * @param bridge - Bridge instance for communication with host
   * @param mountContext - Host-provided runtime context for this mount
   */
  mount(
    container: Element | ShadowRoot,
    bridge: TBridge,
    mountContext?: MfeMountContext
  ): void | Promise<void>;

  /**
   * Unmount the MFE from its container.
   *
   * With the default handler (`MfeHandlerMF`), the `container` parameter will be
   * a `ShadowRoot`. With custom handlers, it may be a plain `Element`.
   *
   * @param container - DOM element or shadow root to unmount from
   */
  unmount(container: Element | ShadowRoot): void | Promise<void>;
}

/**
 * Abstract factory for creating bridge instances.
 * Different handlers can provide different bridge implementations.
 */
export abstract class MfeBridgeFactory<TBridge extends ChildMfeBridge = ChildMfeBridge> {
  /**
   * Create a bridge instance for an MFE.
   *
   * @param domainId - ID of the domain the MFE is mounted in
   * @param entryTypeId - Type ID of the MFE entry
   * @param instanceId - Unique instance ID for this MFE
   * @returns Bridge instance
   */
  abstract create(
    domainId: string,
    entryTypeId: string,
    instanceId: string
  ): TBridge;

  /**
   * Dispose a bridge and clean up resources.
   *
   * @param bridge - Bridge instance to dispose
   */
  abstract dispose(bridge: TBridge): void;
}

/**
 * Abstract MFE handler class.
 *
 * Handlers are responsible for:
 * - Loading MFE bundles
 * - Creating bridge instances
 *
 * Handler resolution (type hierarchy matching) is performed by the registry
 * using its own TypeSystemPlugin, not by the handler itself.
 */
export abstract class MfeHandler<TEntry extends MfeEntry = MfeEntry, TBridge extends ChildMfeBridge = ChildMfeBridge> {
  /**
   * Bridge factory for creating bridge instances.
   */
  abstract readonly bridgeFactory: MfeBridgeFactory<TBridge>;

  /**
   * Base type ID that this handler can handle.
   * The registry matches entries using typeSystem.isTypeOf(entryTypeId, handledBaseTypeId).
   */
  readonly handledBaseTypeId: string;

  /**
   * Priority for handler selection.
   * Higher priority handlers are tried first.
   * Default: 0
   */
  readonly priority: number;

  constructor(
    handledBaseTypeId: string,
    priority: number = 0
  ) {
    this.handledBaseTypeId = handledBaseTypeId;
    this.priority = priority;
  }

  /**
   * Load an MFE bundle for a specific extension instance.
   *
   * `extensionId` is the cache key. Two extensions registered against the
   * same `entry` definition (sibling extensions sharing an `entry.id`) MUST
   * receive distinct loads — distinct blob URL chains and distinct module
   * evaluations — per ADR-0004 + ADR-0020 isolation invariant. Re-mount of
   * the same extension instance (same `extensionId`) MUST reuse the cached
   * load. Sibling isolation is the handler's responsibility, not the MFE
   * author's.
   *
   * @param entry - The entry to load
   * @param extensionId - The extension instance ID; cache key for the load
   * @returns Promise resolving to MFE lifecycle interface with ChildMfeBridge
   */
  abstract load(
    entry: TEntry,
    extensionId: string
  ): Promise<MfeEntryLifecycle<ChildMfeBridge>>;
}
