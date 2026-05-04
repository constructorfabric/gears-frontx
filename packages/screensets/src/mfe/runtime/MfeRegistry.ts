/**
 * MfeRegistry - Abstract MFE Runtime Interface
 *
 * Abstract class defining the public API contract for the MFE runtime.
 * External consumers ALWAYS depend on this abstraction, never on concrete implementations.
 *
 * Obtain instances via mfeRegistryFactory.build(config).
 *
 * @packageDocumentation
 */
// Registry contract (DoD has unchecked tasks; begin/end blocks in DefaultMfeRegistry carry traceability)

import type { TypeSystemPlugin } from '../plugins/types';
import type { ParentMfeBridge } from '../handler/types';
import type {
  ExtensionDomain,
  Extension,
  ActionsChain,
} from '../types';
import type { ExtensionDomainImplementationFactory } from './ExtensionDomainImplementationFactory';
import type { ExtensionMounter } from './ExtensionMounter';

/**
 * Abstract MfeRegistry - public contract for the MFE runtime facade.
 *
 * This is the ONLY type external consumers should depend on.
 * Obtain instances via mfeRegistryFactory.build(config).
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
 * import { mfeRegistryFactory, gtsPlugin } from '@cyberfabric/screensets';
 *
 * const registry = mfeRegistryFactory.build({ typeSystem: gtsPlugin });
 * registry.registerDomain(myDomain, new MyDomainFactory());
 * await registry.registerExtension(myExtension);
 * ```
 */
export abstract class MfeRegistry {
  /**
   * Type System plugin instance.
   * All type validation and schema operations go through this plugin.
   */
  abstract readonly typeSystem: TypeSystemPlugin;

  // --- Registration ---

  /**
   * Register an extension domain.
   * Domains must be registered before extensions can mount into them.
   * `registerDomain` is synchronous; the `init` lifecycle is fired
   * fire-and-forget after handler registration completes.
   *
   * @param declaration - Domain to register (GTS-validated declaration).
   * @param factory - Concrete `ExtensionDomainImplementationFactory` subclass
   *   whose `build(ctx)` is called synchronously by the registry to construct
   *   the domain implementation and register per-action-type handlers.
   * @throws {Error} if GTS validation fails (from `typeSystem.register`)
   * @throws {UnsupportedLifecycleStageError} if lifecycle hooks reference unsupported stages
   * @throws {Error} on cross-validation failure (strategy/action matrix or handler coverage)
   */
  abstract registerDomain(
    declaration: ExtensionDomain,
    factory: ExtensionDomainImplementationFactory
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
   * @param extension - Extension to register
   * @returns Promise resolving when registration is complete
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
   * @param propertyId - Type ID of the shared property (e.g. HAI3_SHARED_PROPERTY_THEME)
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
   * Get the insertion-ordered list of currently-mounted extension IDs for a domain.
   * Returns an empty array for an unknown or empty domain — never throws.
   *
   * The registry is the canonical owner of mount-set state per
   * `cpt-frontx-dod-mfe-registry-mount-contracts`.
   *
   * @param domainId - ID of the domain
   * @returns Readonly insertion-ordered list of mounted extension IDs.
   */
  abstract getMountedExtensions(domainId: string): readonly string[];

  /**
   * Get the per-domain `ExtensionMounter` instance.
   * Called by the React `ExtensionDomainSlot` to call
   * `mounter.attach(element)` / `mounter.detach()`.
   *
   * @param domainId - ID of the domain
   * @returns The per-domain `ExtensionMounter`.
   * @throws {Error} if the domain is not registered.
   */
  abstract getMounter(domainId: string): ExtensionMounter;

  /**
   * Get all registered GTS packages.
   *
   * @returns Array of GTS package strings in discovery order.
   */
  abstract getRegisteredPackages(): string[];

  /**
   * Get all extensions registered for a specific GTS package.
   *
   * @param packageId - GTS package string (e.g., 'hai3.demo')
   * @returns Array of extensions in the package (empty if package not tracked)
   */
  abstract getExtensionsForPackage(packageId: string): Extension[];

  /**
   * Returns the ParentMfeBridge for the given extension, or null if the extension
   * is not mounted or does not exist.
   *
   * @param extensionId - ID of the extension
   * @returns ParentMfeBridge if extension is mounted, null otherwise
   */
  abstract getParentBridge(extensionId: string): ParentMfeBridge | null;

  // --- Theme ---

  /**
   * Apply theme CSS custom properties via the mount manager.
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
