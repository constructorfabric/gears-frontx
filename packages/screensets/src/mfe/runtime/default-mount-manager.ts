/**
 * Default Mount Manager Implementation
 *
 * Concrete mount manager that handles MFE loading, mounting, and unmounting
 * with full lifecycle support.
 *
 * @packageDocumentation
 * @internal
 */
// @cpt-state:cpt-frontx-state-mfe-registry-extension-load:p1
// @cpt-state:cpt-frontx-state-mfe-registry-extension-mount:p1

import type { MfeHandler, MfeMountContext, ParentMfeBridge } from '../handler/types';
import type { RuntimeCoordinator } from '../coordination/types';
import type { ActionHandler } from '../mediator/types';
import type { ActionsChain } from '../types';
import { DefaultExtensionManager } from './default-extension-manager';
import type { MfeRegistry } from './MfeRegistry';
import { MountManager } from './mount-manager';
import type { ActionChainExecutor, LifecycleTrigger } from './mount-manager';
import { RuntimeBridgeFactory } from './runtime-bridge-factory';
import { createShadowRoot } from '../shadow';

/**
 * Callback type for resolving the appropriate handler for an entry type.
 * The registry provides this callback, encapsulating typeSystem.isTypeOf() logic.
 */
// @cpt-algo:cpt-frontx-algo-mfe-registry-handler-resolution:p1
export type HandlerResolver = (entryTypeId: string) => MfeHandler | undefined;

/**
 * Default mount manager implementation.
 *
 * Handles MFE loading, mounting, and unmounting with full lifecycle support.
 *
 * @internal
 */
export class DefaultMountManager extends MountManager {
  /**
   * Extension manager for accessing extension and domain state.
   */
  private readonly extensionManager: DefaultExtensionManager;

  /**
   * Resolves the appropriate handler for a given entry type ID.
   */
  private readonly resolveHandler: HandlerResolver;

  /**
   * Runtime coordinator for managing runtime connections.
   */
  private readonly coordinator: RuntimeCoordinator;

  /**
   * Lifecycle trigger callback for triggering lifecycle stages.
   */
  private readonly triggerLifecycle: LifecycleTrigger;

  /**
   * Action chain executor for connecting parent bridge.
   */
  private readonly executeActionsChain: ActionChainExecutor;

  /**
   * Host runtime for RuntimeConnection registration.
   */
  private readonly hostRuntime: MfeRegistry;

  /**
   * Callback for registering catch-all action handlers (child domain forwarding).
   */
  private readonly registerCatchAllActionHandler: (domainId: string, handler: ActionHandler) => void;

  /**
   * Callback for unregistering catch-all action handlers.
   */
  private readonly unregisterCatchAllActionHandler: (domainId: string) => void;

  /**
   * Callback for registering per-(extensionId, actionTypeId) handlers in the parent mediator.
   * domainId is forwarded so the mediator can populate targetDomainMap for timeout resolution.
   */
  private readonly registerExtensionActionHandler: (extensionId: string, actionTypeId: string, handler: ActionHandler, domainId: string) => void;

  /**
   * Callback for unregistering all extension handlers from the parent mediator.
   */
  private readonly unregisterExtensionActionHandler: (extensionId: string) => void;

  /**
   * Runtime bridge factory for creating bridge connections.
   */
  private readonly bridgeFactory: RuntimeBridgeFactory;

  constructor(config: {
    extensionManager: DefaultExtensionManager;
    resolveHandler: HandlerResolver;
    coordinator: RuntimeCoordinator;
    triggerLifecycle: LifecycleTrigger;
    executeActionsChain: ActionChainExecutor;
    hostRuntime: MfeRegistry;
    registerCatchAllActionHandler: (domainId: string, handler: ActionHandler) => void;
    unregisterCatchAllActionHandler: (domainId: string) => void;
    registerExtensionActionHandler: (extensionId: string, actionTypeId: string, handler: ActionHandler, domainId: string) => void;
    unregisterExtensionActionHandler: (extensionId: string) => void;
    bridgeFactory: RuntimeBridgeFactory;
  }) {
    super();
    this.extensionManager = config.extensionManager;
    this.resolveHandler = config.resolveHandler;
    this.coordinator = config.coordinator;
    this.triggerLifecycle = config.triggerLifecycle;
    this.executeActionsChain = config.executeActionsChain;
    this.hostRuntime = config.hostRuntime;
    this.registerCatchAllActionHandler = config.registerCatchAllActionHandler;
    this.unregisterCatchAllActionHandler = config.unregisterCatchAllActionHandler;
    this.registerExtensionActionHandler = config.registerExtensionActionHandler;
    this.unregisterExtensionActionHandler = config.unregisterExtensionActionHandler;
    this.bridgeFactory = config.bridgeFactory;
  }

  /**
   * Load an extension bundle.
   *
   * @param extensionId - ID of the extension to load
   * @returns Promise resolving when bundle is loaded
   */
  // @cpt-begin:cpt-frontx-state-mfe-registry-extension-load:p1:inst-1
  async loadExtension(extensionId: string): Promise<void> {
    // Verify extension is registered
    const extensionState = this.extensionManager.getExtensionState(extensionId);
    if (!extensionState) {
      throw new Error(
        `Cannot load extension '${extensionId}': extension is not registered. ` +
        `Call registerExtension() first.`
      );
    }

    // Skip if already loaded or loading
    if (extensionState.loadState === 'loaded') {
      return;
    }
    if (extensionState.loadState === 'loading') {
      return;
    }

    // Mark as loading
    extensionState.loadState = 'loading';
    extensionState.error = undefined;

    try {
      // Resolve entry and find handler
      const entry = extensionState.entry;
      const handler = this.resolveHandler(entry.id);
      if (!handler) {
        throw new Error(
          `No MFE handler registered that can handle entry type '${entry.id}'. ` +
          `Provide handlers via 'mfeHandlers' in MfeRegistryConfig.`
        );
      }

      // Load bundle using handler. The extension instance ID is the cache
      // key — sibling extensions sharing this entry definition each get a
      // distinct load (distinct blob URL chain, distinct module evaluation)
      // per ADR-0004 + ADR-0020 isolation.
      const lifecycle = await handler.load(entry, extensionState.extension.id);

      // Cache loaded lifecycle for mounting
      extensionState.lifecycle = lifecycle;
      extensionState.loadState = 'loaded';
    } catch (error) {
      extensionState.loadState = 'error';
      extensionState.error = error instanceof Error ? error : new Error(String(error));
      throw error;
    }
  }
  // @cpt-end:cpt-frontx-state-mfe-registry-extension-load:p1:inst-1

  /**
   * Preload an extension bundle without mounting.
   *
   * @param extensionId - ID of the extension to preload
   * @returns Promise resolving when bundle is preloaded
   */
  async preloadExtension(extensionId: string): Promise<void> {
    return this.loadExtension(extensionId);
  }

  /**
   * Mount an extension into a container element.
   *
   * @param extensionId - ID of the extension to mount
   * @param container - DOM element to mount into
   * @returns Promise resolving to the parent bridge
   */
  // @cpt-begin:cpt-frontx-state-mfe-registry-extension-mount:p1:inst-1
  async mountExtension(
    extensionId: string,
    container: Element
  ): Promise<ParentMfeBridge> {
    // Verify extension is registered
    const extensionState = this.extensionManager.getExtensionState(extensionId);
    if (!extensionState) {
      throw new Error(
        `Cannot mount extension '${extensionId}': extension is not registered. ` +
        `Call registerExtension() first.`
      );
    }

    // If already mounted, return idempotently — the strategy layer gates re-mount.
    if (extensionState.mountState === 'mounted') {
      return extensionState.bridge!;
    }

    // Auto-load if not loaded
    if (extensionState.loadState !== 'loaded') {
      await this.loadExtension(extensionId);
    }

    // Mark as mounting
    extensionState.mountState = 'mounting';
    extensionState.error = undefined;

    try {
      // Get domain state
      const domainState = this.extensionManager.getDomainState(extensionState.extension.domain);
      if (!domainState) {
        throw new Error(
          `Cannot mount extension '${extensionId}': ` +
          `domain '${extensionState.extension.domain}' is not registered.`
        );
      }

      // Create bridge using bridge factory.
      // domainActions is passed for API compatibility but is no longer used
      // for contract enforcement — GTS schema validation handles that.
      const entryDomainActions = extensionState.entry.domainActions;
      const { parentBridge, childBridge } = this.bridgeFactory.createBridge(
        domainState,
        extensionId,
        extensionState.entry.id,
        entryDomainActions,
        (chain: ActionsChain) => this.executeActionsChain(chain),
        (domainId, handler) => this.registerCatchAllActionHandler(domainId, handler),
        (domainId) => this.unregisterCatchAllActionHandler(domainId),
        (extId, actionTypeId, handler, domainId) => this.registerExtensionActionHandler(extId, actionTypeId, handler, domainId),
        (extId) => this.unregisterExtensionActionHandler(extId)
      );

      // Register with RuntimeCoordinator
      const existingConnection = this.coordinator.get(container);
      if (existingConnection) {
        // Add to existing connection
        existingConnection.bridges.set(extensionId, parentBridge);
      } else {
        // Create new connection with proper hostRuntime reference
        this.coordinator.register(container, {
          hostRuntime: this.hostRuntime,
          bridges: new Map([[extensionId, parentBridge]]),
        });
      }

      // Create Shadow DOM boundary on container
      const hostElement = container as HTMLElement;
      const shadowRoot = createShadowRoot(hostElement);

      // Store shadow root on extension state for unmount
      extensionState.shadowRoot = shadowRoot;

      // Call lifecycle.mount(shadowRoot, childBridge, mountContext).
      const lifecycle = extensionState.lifecycle;
      if (!lifecycle) {
        throw new Error(
          `Cannot mount extension '${extensionId}': lifecycle not loaded. ` +
          `This should not happen - loadExtension should have cached the lifecycle.`
        );
      }
      const mountContext: MfeMountContext = {
        extensionId,
        domainId: extensionState.extension.domain,
      };
      await lifecycle.mount(shadowRoot, childBridge, mountContext);

      // Update state
      extensionState.bridge = parentBridge;
      extensionState.container = container;
      extensionState.mountState = 'mounted';

      // Mount-set state is now owned by ExtensionMounter (called from strategy).
      // MountManager does not track it directly — this line is a no-op placeholder
      // to maintain the call site in case extensionManager API changes are needed.

      // Trigger 'activated' lifecycle stage
      await this.triggerLifecycle(
        extensionId,
        'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.activated.v1'
      );

      return parentBridge;
    } catch (error) {
      extensionState.mountState = 'error';
      extensionState.error = error instanceof Error ? error : new Error(String(error));
      throw error;
    }
  }
  // @cpt-end:cpt-frontx-state-mfe-registry-extension-mount:p1:inst-1

  /**
   * Unmount an extension from its container.
   *
   * @param extensionId - ID of the extension to unmount
   * @returns Promise resolving when unmount is complete
   */
  async unmountExtension(extensionId: string): Promise<void> {
    // Verify extension is registered
    const extensionState = this.extensionManager.getExtensionState(extensionId);
    if (!extensionState) {
      // Idempotent - no-op if extension not registered
      return;
    }

    // Check if mounted
    if (extensionState.mountState !== 'mounted') {
      // Idempotent - no-op if not mounted
      return;
    }

    // Trigger 'deactivated' lifecycle stage
    await this.triggerLifecycle(
      extensionId,
      'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.deactivated.v1'
    );

    try {
      // Call lifecycle.unmount() with shadow root if available, otherwise container
      const lifecycle = extensionState.lifecycle;
      const container = extensionState.container;
      if (lifecycle && container) {
        const unmountTarget = extensionState.shadowRoot ?? container;
        await lifecycle.unmount(unmountTarget);
      }

      // Unregister extension action handler from mediator before disposing bridge.
      // Wrapped in try/catch so a failure (e.g., pending actions) does not strand
      // the rest of the unmount cleanup (bridge dispose, coordinator, state reset).
      try {
        this.unregisterExtensionActionHandler(extensionId);
      } catch (unregisterError) {
        console.error(
          `[MountManager] Failed to unregister extension action handler for '${extensionId}':`,
          unregisterError
        );
      }

      // Dispose bridge
      if (extensionState.bridge) {
        const domainState = this.extensionManager.getDomainState(extensionState.extension.domain);
        if (domainState) {
          this.bridgeFactory.disposeBridge(domainState, extensionState.bridge);
        }
      }

      // Unregister from coordinator
      if (container) {
        const connection = this.coordinator.get(container);
        if (connection) {
          connection.bridges.delete(extensionId);
          // If no more bridges, unregister the container
          if (connection.bridges.size === 0) {
            this.coordinator.unregister(container);
          }
        }
      }

      // Update state (keep extension registered and bundle loaded)
      extensionState.bridge = null;
      extensionState.container = null;
      extensionState.mountState = 'unmounted';
      extensionState.error = undefined;
      extensionState.shadowRoot = undefined;

      // Mount-set state is owned by ExtensionMounter (called from strategy).
      // MountManager does not clear it directly.
    } catch (error) {
      extensionState.mountState = 'error';
      extensionState.error = error instanceof Error ? error : new Error(String(error));
      throw error;
    }
  }

  /**
   * Apply theme CSS variables to the isolation context.
   * Shadow DOM inherits CSS custom properties from :root, so this is a no-op.
   */
  setTheme(_cssVars: Record<string, string>): void {
    // No-op: CSS custom properties inherit across Shadow DOM boundaries
  }
}
