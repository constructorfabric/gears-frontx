/**
 * Default Mount Manager Implementation
 *
 * Concrete mount manager that handles MFE loading, mounting, and unmounting
 * with full lifecycle support.
 *
 * @packageDocumentation
 * @internal
 */
// @cpt-state:cpt-hai3-state-screenset-registry-extension-load:p1
// @cpt-state:cpt-hai3-state-screenset-registry-extension-mount:p1

import type { MfeHandler, ParentMfeBridge } from '../handler/types';
import type { RuntimeCoordinator } from '../coordination/types';
import type { ActionHandler } from '../mediator/types';
import type { ActionsChain } from '../types';
import { DefaultExtensionManager } from './default-extension-manager';
import type { ScreensetsRegistry } from './ScreensetsRegistry';
import { MountManager } from './mount-manager';
import type { ActionChainExecutor, LifecycleTrigger } from './mount-manager';
import { RuntimeBridgeFactory } from './runtime-bridge-factory';
import { createShadowRoot } from '../shadow';

/**
 * Callback type for resolving the appropriate handler for an entry type.
 * The registry provides this callback, encapsulating typeSystem.isTypeOf() logic.
 */
// @cpt-algo:cpt-hai3-algo-screenset-registry-handler-resolution:p1
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
  private readonly hostRuntime: ScreensetsRegistry;

  /**
   * Callback for registering domain action handlers.
   */
  private readonly registerDomainActionHandler: (domainId: string, handler: ActionHandler) => void;

  /**
   * Callback for unregistering domain action handlers.
   */
  private readonly unregisterDomainActionHandler: (domainId: string) => void;

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
    hostRuntime: ScreensetsRegistry;
    registerDomainActionHandler: (domainId: string, handler: ActionHandler) => void;
    unregisterDomainActionHandler: (domainId: string) => void;
    bridgeFactory: RuntimeBridgeFactory;
  }) {
    super();
    this.extensionManager = config.extensionManager;
    this.resolveHandler = config.resolveHandler;
    this.coordinator = config.coordinator;
    this.triggerLifecycle = config.triggerLifecycle;
    this.executeActionsChain = config.executeActionsChain;
    this.hostRuntime = config.hostRuntime;
    this.registerDomainActionHandler = config.registerDomainActionHandler;
    this.unregisterDomainActionHandler = config.unregisterDomainActionHandler;
    this.bridgeFactory = config.bridgeFactory;
  }

  /**
   * Load an extension bundle.
   *
   * @param extensionId - ID of the extension to load
   * @returns Promise resolving when bundle is loaded
   */
  // @cpt-begin:cpt-hai3-state-screenset-registry-extension-load:p1:inst-1
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
          `Provide handlers via 'mfeHandlers' in ScreensetsRegistryConfig.`
        );
      }

      // Load bundle using handler
      const lifecycle = await handler.load(entry);

      // Cache loaded lifecycle for mounting
      extensionState.lifecycle = lifecycle;
      extensionState.loadState = 'loaded';
    } catch (error) {
      extensionState.loadState = 'error';
      extensionState.error = error instanceof Error ? error : new Error(String(error));
      throw error;
    }
  }
  // @cpt-end:cpt-hai3-state-screenset-registry-extension-load:p1:inst-1

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
  // @cpt-begin:cpt-hai3-state-screenset-registry-extension-mount:p1:inst-1
  async mountExtension(extensionId: string, container: Element): Promise<ParentMfeBridge> {
    // Verify extension is registered
    const extensionState = this.extensionManager.getExtensionState(extensionId);
    if (!extensionState) {
      throw new Error(
        `Cannot mount extension '${extensionId}': extension is not registered. ` +
        `Call registerExtension() first.`
      );
    }

    // Check if already mounted
    if (extensionState.mountState === 'mounted') {
      throw new Error(
        `Cannot mount extension '${extensionId}': extension is already mounted. ` +
        `Call unmountExtension() first before remounting.`
      );
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

      // Create bridge using bridge factory
      const { parentBridge, childBridge } = this.bridgeFactory.createBridge(
        domainState,
        extensionId,
        extensionState.entry.id,
        (chain: ActionsChain) => this.executeActionsChain(chain),
        (domainId, handler) => this.registerDomainActionHandler(domainId, handler),
        (domainId) => this.unregisterDomainActionHandler(domainId)
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

      // Call lifecycle.mount(shadowRoot, childBridge) - pass shadow root instead of container
      const lifecycle = extensionState.lifecycle;
      if (!lifecycle) {
        throw new Error(
          `Cannot mount extension '${extensionId}': lifecycle not loaded. ` +
          `This should not happen - loadExtension should have cached the lifecycle.`
        );
      }
      await lifecycle.mount(shadowRoot, childBridge);

      // Update state
      extensionState.bridge = parentBridge;
      extensionState.container = container;
      extensionState.mountState = 'mounted';

      // Track mounted extension in domain (single extension per domain invariant)
      this.extensionManager.setMountedExtension(extensionState.extension.domain, extensionId);

      // Trigger 'activated' lifecycle stage
      await this.triggerLifecycle(
        extensionId,
        'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1'
      );

      return parentBridge;
    } catch (error) {
      extensionState.mountState = 'error';
      extensionState.error = error instanceof Error ? error : new Error(String(error));
      throw error;
    }
  }
  // @cpt-end:cpt-hai3-state-screenset-registry-extension-mount:p1:inst-1

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
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1'
    );

    try {
      // Call lifecycle.unmount() with shadow root if available, otherwise container
      const lifecycle = extensionState.lifecycle;
      const container = extensionState.container;
      if (lifecycle && container) {
        const unmountTarget = extensionState.shadowRoot ?? container;
        await lifecycle.unmount(unmountTarget);
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

      // Clear mounted extension tracking in domain
      const domainState = this.extensionManager.getDomainState(extensionState.extension.domain);
      if (domainState && domainState.mountedExtension === extensionId) {
        this.extensionManager.setMountedExtension(extensionState.extension.domain, undefined);
      }
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
