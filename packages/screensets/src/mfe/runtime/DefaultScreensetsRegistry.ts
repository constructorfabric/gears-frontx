/**
 * DefaultScreensetsRegistry - Concrete MFE Runtime Implementation
 *
 * This is the DEFAULT concrete implementation of ScreensetsRegistry.
 * It wires all collaborators together and implements the facade API.
 *
 * INTERNAL: This class is NOT exported from the public barrel.
 * External consumers obtain instances via screensetsRegistryFactory.build(config).
 *
 * @packageDocumentation
 * @internal
 */
// @cpt-flow:cpt-hai3-flow-screenset-registry-register-domain:p1
// @cpt-flow:cpt-hai3-flow-screenset-registry-register-extension:p1
// @cpt-flow:cpt-hai3-flow-screenset-registry-unregister-extension:p1
// @cpt-flow:cpt-hai3-flow-screenset-registry-unregister-domain:p1
// @cpt-flow:cpt-hai3-flow-screenset-registry-execute-chain:p1
// @cpt-flow:cpt-hai3-flow-screenset-registry-update-shared-property:p1
// @cpt-flow:cpt-hai3-flow-screenset-registry-query:p2
// @cpt-algo:cpt-hai3-algo-screenset-registry-gts-package-discovery:p1
// @cpt-algo:cpt-hai3-algo-screenset-registry-handler-resolution:p1
// @cpt-algo:cpt-hai3-algo-screenset-registry-domain-semantics:p1
// @cpt-dod:cpt-hai3-dod-screenset-registry-handler-injection:p1

import type { TypeSystemPlugin } from '../plugins/types';
import type { ScreensetsRegistryConfig } from './config';
import type { MfeHandler, ParentMfeBridge } from '../handler/types';
import type {
  ExtensionDomain,
  Extension,
  ActionsChain,
} from '../types';
import { ScreensetsRegistry } from './ScreensetsRegistry';
import { WeakMapRuntimeCoordinator } from '../coordination/weak-map-runtime-coordinator';
import { RuntimeCoordinator } from '../coordination/types';
import { ActionsChainsMediator } from '../mediator';
import { DefaultActionsChainsMediator } from '../mediator/actions-chains-mediator';
import { type ExtensionDomainState } from './extension-manager';
import { DefaultExtensionManager } from './default-extension-manager';
import { DefaultLifecycleManager } from './default-lifecycle-manager';
import { MountManager } from './mount-manager';
import { DefaultMountManager } from './default-mount-manager';
import { OperationSerializer } from './operation-serializer';
import { RuntimeBridgeFactory } from './runtime-bridge-factory';
import { DefaultRuntimeBridgeFactory } from './default-runtime-bridge-factory';
import { ExtensionLifecycleActionHandler, type ExtensionLifecycleCallbacks, type CustomActionHandler } from './extension-lifecycle-action-handler';
import type { ContainerProvider } from './container-provider';
import { FRONTX_ACTION_UNMOUNT_EXT } from '../constants';
import { EntryTypeNotHandledError } from '../errors';
import { extractGtsPackage } from '../gts/extract-package';

/**
 * Default concrete implementation of ScreensetsRegistry.
 *
 * This class extends the abstract ScreensetsRegistry and provides the full
 * implementation by wiring together all collaborator classes.
 *
 * Key Responsibilities:
 * - Collaborator initialization and wiring
 * - Delegation to collaborators for specialized logic
 * - Concurrency control via OperationSerializer
 * - Error handling and logging
 *
 * @internal
 */
export class DefaultScreensetsRegistry extends ScreensetsRegistry {
  /**
   * Type System plugin instance.
   * All type validation and schema operations go through this plugin.
   */
  public readonly typeSystem: TypeSystemPlugin;


  /**
   * Extension manager for managing extension and domain state.
   * INTERNAL: Delegates extension/domain registration and query operations.
   */
  private readonly extensionManager: DefaultExtensionManager;

  /**
   * Lifecycle manager for triggering lifecycle stages.
   * INTERNAL: Delegates lifecycle hook execution.
   */
  private readonly lifecycleManager: DefaultLifecycleManager;

  /**
   * Mount manager for loading and mounting MFEs.
   * INTERNAL: Delegates loading and mounting operations.
   */
  private readonly mountManager: MountManager;

  /**
   * Runtime bridge factory for creating bridge connections.
   * INTERNAL: Always constructed internally.
   */
  private readonly bridgeFactory: RuntimeBridgeFactory;

  /**
   * Runtime coordinator for managing runtime connections.
   * INTERNAL: Always constructed internally.
   */
  private readonly coordinator: RuntimeCoordinator;

  /**
   * Actions chains mediator for action chain execution.
   * INTERNAL: Always constructed internally.
   */
  private readonly mediator: ActionsChainsMediator;

  /**
   * Operation serializer for per-entity concurrency control.
   * INTERNAL: Ensures operations on the same entity are serialized.
   */
  private readonly operationSerializer: OperationSerializer;

  /**
   * Registered MFE handlers.
   */
  private readonly handlers: MfeHandler[] = [];

  /**
   * Child MFE bridges (parent -> child communication).
   * INTERNAL: Bridge lifecycle is managed by the registry.
   */
  private readonly childBridges = new Map<string, ParentMfeBridge>();

  /**
   * Parent MFE bridge (child -> parent communication).
   * INTERNAL: Set when this registry is mounted as a child MFE.
   */
  private parentBridge: ParentMfeBridge | null = null;

  /**
   * GTS package to extension ID mappings.
   * Key: GTS package string (e.g., 'frontx.demo')
   * Value: Set of extension IDs belonging to that package
   * INTERNAL: Packages are auto-discovered during extension registration.
   */
  private readonly packages = new Map<string, Set<string>>();

  constructor(config: ScreensetsRegistryConfig) {
    super();

    // Validate required plugin
    if (!config.typeSystem) {
      throw new Error(
        'ScreensetsRegistry requires a TypeSystemPlugin. ' +
        'Provide it via config.typeSystem parameter. ' +
        'Use screensetsRegistryFactory.build({ typeSystem: gtsPlugin }) to create an instance.'
      );
    }

    this.typeSystem = config.typeSystem;

    // Initialize operation serializer
    this.operationSerializer = new OperationSerializer();

    // Initialize coordinator (always construct internally)
    this.coordinator = new WeakMapRuntimeCoordinator();

    // Initialize runtime bridge factory
    this.bridgeFactory = new DefaultRuntimeBridgeFactory();

    // Initialize mediator (always construct internally)
    // Note: mediator needs getDomainState callback, which delegates to extensionManager
    // that is initialized later, but this callback is only invoked after construction
    this.mediator = new DefaultActionsChainsMediator({
      typeSystem: this.typeSystem,
      getDomainState: (domainId) => this.extensionManager.getDomainState(domainId),
    });

    // Initialize extension manager (needs dependencies for business logic)
    this.extensionManager = new DefaultExtensionManager({
      typeSystem: this.typeSystem,
      triggerLifecycle: (extensionId, stageId) => this.triggerLifecycleStage(extensionId, stageId),
      triggerDomainOwnLifecycle: (domainId, stageId) => this.triggerDomainOwnLifecycleStage(domainId, stageId),
      // Bypass OperationSerializer: the parent operation (unregisterExtension)
      // already holds the serializer lock for this entity ID, so calling
      // registry.unmountExtension would deadlock. Go directly to MountManager.
      unmountExtension: (extensionId) => this.mountManager.unmountExtension(extensionId),
      validateEntryType: (entryTypeId) => this.validateEntryType(entryTypeId),
    });

    // Initialize lifecycle manager (needs extension manager)
    this.lifecycleManager = new DefaultLifecycleManager(
      this.extensionManager,
      async (chain) => { await this.executeActionsChain(chain); }
    );

    // Initialize mount manager (needs all collaborators)
    this.mountManager = new DefaultMountManager({
      extensionManager: this.extensionManager,
      resolveHandler: (entryTypeId) => this.resolveHandler(entryTypeId),
      coordinator: this.coordinator,
      triggerLifecycle: (extensionId, stageId) => this.triggerLifecycleStage(extensionId, stageId),
      executeActionsChain: (chain) => this.executeActionsChain(chain),
      hostRuntime: this,
      registerDomainActionHandler: (domainId, handler) => this.registerDomainActionHandler(domainId, handler),
      unregisterDomainActionHandler: (domainId) => this.unregisterDomainActionHandler(domainId),
      bridgeFactory: this.bridgeFactory,
    });

    // Register custom handlers if provided
    if (config.mfeHandlers) {
      for (const handler of config.mfeHandlers) {
        this.handlers.push(handler);
      }
      this.handlers.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    }
  }

  /**
   * Validate that at least one registered handler can handle the given entry type.
   * If no handler matches and handlers are registered, throws EntryTypeNotHandledError.
   * If no handlers are registered, validation is skipped (early registration scenario).
   *
   * @param entryTypeId - Type ID of the entry to validate
   * @throws {EntryTypeNotHandledError} if handlers are registered but none can handle the entry type
   */
  // @cpt-begin:cpt-hai3-algo-screenset-registry-handler-resolution:p1:inst-1
  private validateEntryType(entryTypeId: string): void {
    if (this.handlers.length === 0) {
      // No handlers registered -- skip validation.
      // Loading will fail later when the extension is loaded,
      // but registration is allowed during early setup.
      return;
    }

    const canHandle = this.handlers.some(handler =>
      this.typeSystem.isTypeOf(entryTypeId, handler.handledBaseTypeId)
    );
    if (!canHandle) {
      throw new EntryTypeNotHandledError(
        entryTypeId,
        this.handlers.map(h => h.handledBaseTypeId)
      );
    }
  }
  // @cpt-end:cpt-hai3-algo-screenset-registry-handler-resolution:p1:inst-1

  /**
   * Resolve the appropriate handler for a given entry type ID.
   * Handlers are sorted by priority (highest first). The first handler whose
   * handledBaseTypeId matches via typeSystem.isTypeOf() is returned.
   *
   * @param entryTypeId - Type ID of the entry to resolve a handler for
   * @returns The matching handler, or undefined if none match
   */
  private resolveHandler(entryTypeId: string): MfeHandler | undefined {
    return this.handlers.find(handler =>
      this.typeSystem.isTypeOf(entryTypeId, handler.handledBaseTypeId)
    );
  }

  /**
   * Register an extension domain.
   * Domains must be registered before extensions can mount into them.
   * NOTE: registerDomain is synchronous, but lifecycle triggering happens fire-and-forget.
   *
   * @param domain - Domain to register
   * @param containerProvider - Container provider for the domain
   * @param onInitError - Optional callback for handling fire-and-forget init lifecycle errors
   * @param customActionHandler - Optional handler for non-lifecycle domain actions
   * @throws {DomainValidationError} if GTS validation fails
   * @throws {UnsupportedLifecycleStageError} if lifecycle hooks reference unsupported stages
   */
  // @cpt-begin:cpt-hai3-flow-screenset-registry-register-domain:p1:inst-1
  // @cpt-begin:cpt-hai3-algo-screenset-registry-domain-semantics:p1:inst-1
  registerDomain(
    domain: ExtensionDomain,
    containerProvider: ContainerProvider,
    onInitError?: (error: Error) => void,
    customActionHandler?: CustomActionHandler
  ): void {
    // Step 1: Register domain state (with onInitError callback)
    this.extensionManager.registerDomain(domain, onInitError);

    // Step 2: Determine domain semantics based on actions array
    // If unmount_ext is NOT supported, use 'swap' semantics (screen domain)
    // If unmount_ext IS supported, use 'toggle' semantics (sidebar/popup/overlay)
    const supportsUnmount = domain.actions.includes(FRONTX_ACTION_UNMOUNT_EXT);
    const domainSemantics = supportsUnmount ? 'toggle' : 'swap';

    // Step 3: Create lifecycle callbacks that route through OperationSerializer to MountManager
    const lifecycleCallbacks: ExtensionLifecycleCallbacks = {
      loadExtension: (id) =>
        this.operationSerializer.serializeOperation(id, () => this.mountManager.loadExtension(id)),
      mountExtension: (id, container) =>
        this.operationSerializer.serializeOperation(id, () => this.mountManager.mountExtension(id, container)),
      unmountExtension: (id) =>
        this.operationSerializer.serializeOperation(id, () => this.mountManager.unmountExtension(id)),
      getMountedExtension: (domainId) =>
        this.extensionManager.getMountedExtension(domainId),
      serializeOnDomain: (domainId, operation) =>
        this.operationSerializer.serializeOperation(domainId, operation),
    };

    // Step 4: Create and register extension lifecycle action handler for this domain
    const actionHandler = new ExtensionLifecycleActionHandler(
      domain.id,
      lifecycleCallbacks,
      domainSemantics,
      containerProvider,
      customActionHandler
    );
    this.registerDomainActionHandler(domain.id, actionHandler);
  }
  // @cpt-end:cpt-hai3-flow-screenset-registry-register-domain:p1:inst-1
  // @cpt-end:cpt-hai3-algo-screenset-registry-domain-semantics:p1:inst-1

  /**
   * Execute an actions chain.
   * Delegates to the ActionsChainsMediator for chain execution.
   *
   * @param chain - Actions chain to execute
   * @returns Promise resolving when execution is complete
   */
  // @cpt-begin:cpt-hai3-flow-screenset-registry-execute-chain:p1:inst-1
  async executeActionsChain(chain: ActionsChain): Promise<void> {
    const result = await this.mediator.executeActionsChain(chain);
    if (!result.completed) {
      console.error(
        `[ScreensetsRegistry] Actions chain failed:`,
        result.error ?? 'unknown error',
        `| path: [${result.path.join(' -> ')}]`
      );
    }
  }
  // @cpt-end:cpt-hai3-flow-screenset-registry-execute-chain:p1:inst-1

  /**
   * INTERNAL: Register a domain's action handler.
   *
   * @param domainId - ID of the domain
   * @param handler - The action handler
   */
  private registerDomainActionHandler(
    domainId: string,
    handler: import('../mediator').ActionHandler
  ): void {
    this.mediator.registerDomainHandler(domainId, handler);
  }

  /**
   * INTERNAL: Unregister a domain's action handler.
   *
   * @param domainId - ID of the domain
   */
  private unregisterDomainActionHandler(domainId: string): void {
    this.mediator.unregisterDomainHandler(domainId);
  }

  /**
   * Broadcast a shared property value to all registered domains that declare the property.
   * Delegates to ExtensionManager.
   *
   * @param propertyId - Type ID of the shared property
   * @param value - New property value
   * @throws if GTS validation fails
   */
  // @cpt-begin:cpt-hai3-flow-screenset-registry-update-shared-property:p1:inst-1
  updateSharedProperty(propertyId: string, value: unknown): void {
    this.extensionManager.updateSharedProperty(propertyId, value);
  }
  // @cpt-end:cpt-hai3-flow-screenset-registry-update-shared-property:p1:inst-1

  /**
   * Get a domain property value.
   * Delegates to ExtensionManager.
   *
   * @param domainId - ID of the domain
   * @param propertyTypeId - Type ID of the property to get
   * @returns Property value, or undefined if not set
   */
  getDomainProperty(domainId: string, propertyTypeId: string): unknown {
    return this.extensionManager.getDomainProperty(domainId, propertyTypeId);
  }

  /**
   * Get the currently mounted extension in a domain.
   * Delegates to ExtensionManager.
   *
   * @param domainId - ID of the domain
   * @returns Extension ID if mounted, undefined otherwise
   */
  getMountedExtension(domainId: string): string | undefined {
    return this.extensionManager.getMountedExtension(domainId);
  }

  /**
   * Returns the ParentMfeBridge for the given extension, or null if the extension
   * is not mounted or does not exist. This is a query method -- it reads from
   * ExtensionState.bridge, which is set by MountManager.mountExtension() during
   * mount and cleared during unmount.
   *
   * @param extensionId - ID of the extension
   * @returns ParentMfeBridge if extension is mounted, null otherwise
   */
  getParentBridge(extensionId: string): ParentMfeBridge | null {
    return this.extensionManager.getExtensionState(extensionId)?.bridge ?? null;
  }

  /**
   * Register an extension dynamically at runtime.
   * Extensions can be registered at ANY time during the application lifecycle.
   *
   * Validation steps:
   * 1. Validate extension against GTS schema
   * 2. Check domain exists
   * 3. Validate contract (entry vs domain)
   * 4. Validate extension type (if domain specifies extensionsTypeId)
   * 5. Validate lifecycle hooks
   * 6. Validate entry type is handleable by registered handlers
   * 7. Register in internal state
   * 8. Trigger 'init' lifecycle stage
   *
   * @param extension - Extension to register
   * @returns Promise resolving when registration is complete
   * @throws {ExtensionValidationError} if GTS validation fails
   * @throws {Error} if domain not registered
   * @throws {ContractValidationError} if contract validation fails
   * @throws {ExtensionTypeError} if extension type validation fails
   * @throws {EntryTypeNotHandledError} if no registered handler can handle the entry type
   */
  // @cpt-begin:cpt-hai3-flow-screenset-registry-register-extension:p1:inst-1
  // @cpt-begin:cpt-hai3-algo-screenset-registry-gts-package-discovery:p1:inst-1
  async registerExtension(extension: Extension): Promise<void> {
    return this.operationSerializer.serializeOperation(extension.id, async () => {
      // Step 1: Register the extension
      await this.extensionManager.registerExtension(extension);

      // Step 2: Track GTS package (auto-discovery, graceful — extension may not have a valid GTS ID)
      try {
        const packageId = extractGtsPackage(extension.id);
        if (!this.packages.has(packageId)) {
          this.packages.set(packageId, new Set<string>());
        }
        this.packages.get(packageId)!.add(extension.id);
      } catch {
        // Extension ID is not a valid GTS ID — skip package tracking
      }
    });
  }
  // @cpt-end:cpt-hai3-flow-screenset-registry-register-extension:p1:inst-1
  // @cpt-end:cpt-hai3-algo-screenset-registry-gts-package-discovery:p1:inst-1

  /**
   * Unregister an extension from the registry.
   * If the extension is currently mounted, it will be unmounted first.
   * The extension is removed from the registry and its domain.
   *
   * @param extensionId - ID of the extension to unregister
   * @returns Promise resolving when unregistration is complete
   */
  // @cpt-begin:cpt-hai3-flow-screenset-registry-unregister-extension:p1:inst-1
  async unregisterExtension(extensionId: string): Promise<void> {
    return this.operationSerializer.serializeOperation(extensionId, async () => {
      // Step 1: Unregister the extension
      await this.extensionManager.unregisterExtension(extensionId);

      // Step 2: Clean up GTS package tracking (graceful — extension may not have a valid GTS ID)
      try {
        const packageId = extractGtsPackage(extensionId);
        const extensionSet = this.packages.get(packageId);
        if (extensionSet) {
          extensionSet.delete(extensionId);
          if (extensionSet.size === 0) {
            this.packages.delete(packageId);
          }
        }
      } catch {
        // Extension ID is not a valid GTS ID — no package tracking to clean up
      }
    });
  }
  // @cpt-end:cpt-hai3-flow-screenset-registry-unregister-extension:p1:inst-1

  /**
   * Unregister a domain from the registry.
   * All extensions in the domain are cascade-unregistered first.
   * The domain is removed from the registry.
   *
   * @param domainId - ID of the domain to unregister
   * @returns Promise resolving when unregistration is complete
   */
  // @cpt-begin:cpt-hai3-flow-screenset-registry-unregister-domain:p1:inst-1
  async unregisterDomain(domainId: string): Promise<void> {
    return this.operationSerializer.serializeOperation(domainId, async () => {
      // Step 1: Unregister domain action handler
      this.unregisterDomainActionHandler(domainId);

      // Step 2: Unregister domain from extension manager (cascade-unregisters extensions)
      return this.extensionManager.unregisterDomain(domainId);
    });
  }
  // @cpt-end:cpt-hai3-flow-screenset-registry-unregister-domain:p1:inst-1

  /**
   * Get a registered extension by its ID.
   * Delegates to ExtensionManager.
   *
   * @param extensionId - ID of the extension to get
   * @returns Extension if registered, undefined otherwise
   */
  // @cpt-begin:cpt-hai3-flow-screenset-registry-query:p2:inst-1
  getExtension(extensionId: string): Extension | undefined {
    return this.extensionManager.getExtensionState(extensionId)?.extension;
  }

  /**
   * Get a registered domain by its ID.
   * Delegates to ExtensionManager.
   *
   * @param domainId - ID of the domain to get
   * @returns ExtensionDomain if registered, undefined otherwise
   */
  getDomain(domainId: string): ExtensionDomain | undefined {
    return this.extensionManager.getDomainState(domainId)?.domain;
  }

  /**
   * Get all extensions registered for a specific domain.
   * Delegates to ExtensionManager.
   *
   * @param domainId - ID of the domain
   * @returns Array of extensions in the domain (empty if domain not found or has no extensions)
   */
  getExtensionsForDomain(domainId: string): Extension[] {
    const extensionStates = this.extensionManager.getExtensionStatesForDomain(domainId);
    return extensionStates.map(state => state.extension);
  }

  /**
   * Trigger a lifecycle stage for a specific extension.
   * Delegates to LifecycleManager.
   *
   * @param extensionId - ID of the extension
   * @param stageId - ID of the lifecycle stage to trigger
   * @returns Promise resolving when all hooks have executed
   */
  async triggerLifecycleStage(extensionId: string, stageId: string): Promise<void> {
    return this.lifecycleManager.triggerLifecycleStage(extensionId, stageId);
  }

  /**
   * Trigger a lifecycle stage for all extensions in a domain.
   * Delegates to LifecycleManager.
   *
   * @param domainId - ID of the domain
   * @param stageId - ID of the lifecycle stage to trigger
   * @returns Promise resolving when all hooks have executed
   */
  async triggerDomainLifecycleStage(domainId: string, stageId: string): Promise<void> {
    return this.lifecycleManager.triggerDomainLifecycleStage(domainId, stageId);
  }

  /**
   * Trigger a lifecycle stage for a domain itself.
   * Delegates to LifecycleManager.
   *
   * @param domainId - ID of the domain
   * @param stageId - ID of the lifecycle stage to trigger
   * @returns Promise resolving when all hooks have executed
   */
  async triggerDomainOwnLifecycleStage(domainId: string, stageId: string): Promise<void> {
    return this.lifecycleManager.triggerDomainOwnLifecycleStage(domainId, stageId);
  }

  /**
   * Get domain state for a registered domain.
   * INTERNAL: Used by ActionsChainsMediator for domain resolution.
   * Delegates to ExtensionManager.
   *
   * @param domainId - ID of the domain
   * @returns Domain state, or undefined if not found
   */
  getDomainState(domainId: string): ExtensionDomainState | undefined {
    return this.extensionManager.getDomainState(domainId);
  }

  /**
   * Get all registered GTS packages.
   * Returns packages in discovery order (order of first extension registration).
   *
   * @returns Array of GTS package strings
   */
  getRegisteredPackages(): string[] {
    return Array.from(this.packages.keys());
  }

  /**
   * Get all extensions registered for a specific GTS package.
   * Returns empty array if the package is not tracked.
   *
   * @param packageId - GTS package string (e.g., 'frontx.demo')
   * @returns Array of extensions in the package
   */
  getExtensionsForPackage(packageId: string): Extension[] {
    const extensionIdSet = this.packages.get(packageId);
    if (!extensionIdSet) {
      return [];
    }

    const extensions: Extension[] = [];
    for (const extensionId of extensionIdSet) {
      const extension = this.getExtension(extensionId);
      if (extension) {
        extensions.push(extension);
      }
    }
    return extensions;
  }
  // @cpt-end:cpt-hai3-flow-screenset-registry-query:p2:inst-1

  /**
   * Delegate theme CSS variable delivery to the mount manager.
   */
  setTheme(cssVars: Record<string, string>): void {
    this.mountManager.setTheme(cssVars);
  }

  /**
   * Dispose the registry and clean up resources.
   * Cleans up all bridges, runtime connections, and internal state.
   */
  dispose(): void {
    // Dispose parent bridge if present
    if (this.parentBridge) {
      this.parentBridge.dispose();
      this.parentBridge = null;
    }

    // Dispose all child bridges
    for (const bridge of this.childBridges.values()) {
      bridge.dispose();
    }
    this.childBridges.clear();

    // Clear collaborator state
    this.extensionManager.clear();
    this.operationSerializer.clear();

    // Clear GTS package tracking
    this.packages.clear();

    // Clear handlers
    this.handlers.length = 0;

    // Note: RuntimeCoordinator (using internal WeakMap) will be garbage collected automatically.
    // No need to manually clear it. The coordinator is used for bridge coordination.
    // Reference here to avoid TypeScript unused warning:
    void this.coordinator;
  }
}
