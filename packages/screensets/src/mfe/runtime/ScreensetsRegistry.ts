/**
 * ScreensetsRegistry - Abstract MFE Runtime Interface
 *
 * Abstract class defining the public API contract for the MFE runtime.
 * External consumers ALWAYS depend on this abstraction, never on concrete implementations.
 *
 * Obtain instances via screensetsRegistryFactory.build(config).
 *
 * @packageDocumentation
 */
// @cpt-dod:cpt-hai3-dod-screenset-registry-registry-contract:p1

import type { TypeSystemPlugin } from '../plugins/types';
import type { ParentMfeBridge } from '../handler/types';
import type {
  ExtensionDomain,
  Extension,
  ActionsChain,
} from '../types';
import type { ContainerProvider } from './container-provider';
import type { CustomActionHandler } from './extension-lifecycle-action-handler';

/**
 * Abstract ScreensetsRegistry - public contract for the MFE runtime facade.
 *
 * This is the ONLY type external consumers should depend on.
 * Obtain instances via screensetsRegistryFactory.build(config).
 *
 * Key Responsibilities:
 * - Type validation via TypeSystemPlugin
 * - Extension and domain registration
 * - Domain property management
 * - Runtime coordination (internal)
 * - Action chain mediation and execution
 *
 * @example
 * ```typescript
 * import { screensetsRegistryFactory, gtsPlugin } from '@gears-frontx/screensets';
 *
 * const registry = screensetsRegistryFactory.build({ typeSystem: gtsPlugin });
 * registry.registerDomain(myDomain, containerProvider);
 * await registry.registerExtension(myExtension);
 * ```
 */
export abstract class ScreensetsRegistry {
  /**
   * Type System plugin instance.
   * All type validation and schema operations go through this plugin.
   */
  abstract readonly typeSystem: TypeSystemPlugin;

  // --- Registration ---

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
  abstract registerDomain(
    domain: ExtensionDomain,
    containerProvider: ContainerProvider,
    onInitError?: (error: Error) => void,
    customActionHandler?: CustomActionHandler
  ): void;

  /**
   * Unregister a domain from the registry.
   * All extensions in the domain are cascade-unregistered first.
   * The domain is removed from the registry.
   *
   * @param domainId - ID of the domain to unregister
   * @returns Promise resolving when unregistration is complete
   */
  abstract unregisterDomain(domainId: string): Promise<void>;

  /**
   * Register an extension dynamically at runtime.
   * Extensions can be registered at ANY time during the application lifecycle.
   *
   * Validation steps:
   * 1. Validate extension against GTS schema
   * 2. Check domain exists
   * 3. Validate contract (entry vs domain)
   * 4. Validate extension type (if domain specifies extensionsTypeId)
   * 5. Register in internal state
   * 6. Trigger 'init' lifecycle stage
   *
   * @param extension - Extension to register
   * @returns Promise resolving when registration is complete
   * @throws {ExtensionValidationError} if GTS validation fails
   * @throws {Error} if domain not registered
   * @throws {ContractValidationError} if contract validation fails
   * @throws {ExtensionTypeError} if extension type validation fails
   */
  abstract registerExtension(extension: Extension): Promise<void>;

  /**
   * Unregister an extension from the registry.
   * If the extension is currently mounted, it will be unmounted first.
   * The extension is removed from the registry and its domain.
   *
   * @param extensionId - ID of the extension to unregister
   * @returns Promise resolving when unregistration is complete
   */
  abstract unregisterExtension(extensionId: string): Promise<void>;


  // --- Domain Properties ---

  /**
   * Broadcast a shared property value to all registered domains that declare the property.
   * The value is validated against the property's GTS-derived schema before propagation.
   * Domains that do not include propertyId in their sharedProperties array are not updated.
   * If no registered domains declare the property, this is a silent no-op.
   *
   * @param propertyId - Type ID of the shared property (e.g. FRONTX_SHARED_PROPERTY_THEME)
   * @param value - New property value
   * @throws if GTS validation fails — no domain receives the value in that case
   */
  abstract updateSharedProperty(propertyId: string, value: unknown): void;

  /**
   * Get a domain property value.
   *
   * @param domainId - ID of the domain
   * @param propertyTypeId - Type ID of the property to get
   * @returns Property value, or undefined if not set
   */
  abstract getDomainProperty(domainId: string, propertyTypeId: string): unknown;

  // --- Action Chains ---

  /**
   * Execute an actions chain.
   * Delegates to the ActionsChainsMediator for chain execution.
   *
   * @param chain - Actions chain to execute
   * @returns Promise resolving when execution is complete
   */
  abstract executeActionsChain(chain: ActionsChain): Promise<void>;

  // --- Lifecycle Triggering ---

  /**
   * Trigger a lifecycle stage for a specific extension.
   * Executes all lifecycle hooks registered for the given stage.
   *
   * @param extensionId - ID of the extension
   * @param stageId - ID of the lifecycle stage to trigger
   * @returns Promise resolving when all hooks have executed
   */
  abstract triggerLifecycleStage(extensionId: string, stageId: string): Promise<void>;

  /**
   * Trigger a lifecycle stage for all extensions in a domain.
   * Useful for custom stages like "refresh" that affect all widgets.
   *
   * @param domainId - ID of the domain
   * @param stageId - ID of the lifecycle stage to trigger
   * @returns Promise resolving when all hooks have executed
   */
  abstract triggerDomainLifecycleStage(domainId: string, stageId: string): Promise<void>;

  /**
   * Trigger a lifecycle stage for a domain itself.
   * Executes hooks registered on the domain entity.
   *
   * @param domainId - ID of the domain
   * @param stageId - ID of the lifecycle stage to trigger
   * @returns Promise resolving when all hooks have executed
   */
  abstract triggerDomainOwnLifecycleStage(domainId: string, stageId: string): Promise<void>;

  // --- Query ---

  /**
   * Get a registered extension by its ID.
   *
   * @param extensionId - ID of the extension to get
   * @returns Extension if registered, undefined otherwise
   */
  abstract getExtension(extensionId: string): Extension | undefined;

  /**
   * Get a registered domain by its ID.
   *
   * @param domainId - ID of the domain to get
   * @returns ExtensionDomain if registered, undefined otherwise
   */
  abstract getDomain(domainId: string): ExtensionDomain | undefined;

  /**
   * Get all extensions registered for a specific domain.
   *
   * @param domainId - ID of the domain
   * @returns Array of extensions in the domain (empty if domain not found or has no extensions)
   */
  abstract getExtensionsForDomain(domainId: string): Extension[];

  /**
   * Get the currently mounted extension in a domain.
   * Each domain supports at most one mounted extension at a time.
   *
   * @param domainId - ID of the domain
   * @returns Extension ID if mounted, undefined otherwise
   */
  abstract getMountedExtension(domainId: string): string | undefined;

  /**
   * Get all registered GTS packages.
   *
   * Returns an array of unique GTS package strings that have been discovered
   * from registered extensions. Packages are NOT explicitly registered -- they
   * are automatically tracked when extensions are registered. The GTS package
   * is extracted from each extension's ID.
   *
   * The returned array is in discovery order (order of first extension registration
   * for each package).
   *
   * @returns Array of GTS package strings (e.g., ['frontx.demo', 'frontx.other'])
   *
   * @example
   * ```typescript
   * // After registering extensions with IDs containing 'frontx.demo' package
   * const packages = registry.getRegisteredPackages();
   * // Returns: ['frontx.demo']
   * ```
   */
  abstract getRegisteredPackages(): string[];

  /**
   * Get all extensions registered for a specific GTS package.
   *
   * Returns all registered extensions whose GTS package matches the given
   * packageId. The GTS package groups extensions by their shared two-segment
   * prefix (e.g., 'frontx.demo').
   *
   * @param packageId - GTS package string (e.g., 'frontx.demo')
   * @returns Array of extensions in the package (empty if package not tracked)
   *
   * @example
   * ```typescript
   * // Get all extensions from the 'frontx.demo' package
   * const extensions = registry.getExtensionsForPackage('frontx.demo');
   * // Returns: [homeExtension, profileExtension, ...]
   * ```
   */
  abstract getExtensionsForPackage(packageId: string): Extension[];

  /**
   * Returns the ParentMfeBridge for the given extension, or null if the extension
   * is not mounted or does not exist. This is a query method (same category as
   * getMountedExtension) -- it reads from ExtensionState.bridge, which is set
   * by MountManager.mountExtension() during mount and cleared during unmount.
   *
   * Usage pattern: mount via executeActionsChain(), then query the bridge:
   *
   *   await registry.executeActionsChain({ action: { type: FRONTX_ACTION_MOUNT_EXT, ... } });
   *   const bridge = registry.getParentBridge(extensionId);
   *
   * @param extensionId - ID of the extension
   * @returns ParentMfeBridge if extension is mounted, null otherwise
   */
  abstract getParentBridge(extensionId: string): ParentMfeBridge | null;

  // --- Theme ---

  /**
   * Apply theme CSS custom properties via the mount manager.
   * The framework calls this on every theme change. The mount manager
   * handles delivery appropriate to its isolation context.
   *
   * @param cssVars - CSS custom property name→value map
   */
  abstract setTheme(cssVars: Record<string, string>): void;

  // --- Lifecycle ---

  /**
   * Dispose the registry and clean up resources.
   * Cleans up all bridges, runtime connections, and internal state.
   */
  abstract dispose(): void;
}
