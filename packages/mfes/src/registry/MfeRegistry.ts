/**
 * MfeRegistry - Abstract MFE Runtime Interface
 *
 * Abstract class defining the public API contract for the MFE runtime.
 * External consumers ALWAYS depend on this abstraction, never on concrete implementations.
 *
 * Obtain instances via createMfeRegistryFactory().build(config).
 *
 * @packageDocumentation
 */
// @cpt-FEATURE:cpt-frontx-feature-mfe-registry:p2
// @cpt-dod:cpt-frontx-dod-mfe-registry-registry-contract:p1
// @cpt-flow:cpt-frontx-flow-mfe-registry-register-validate-mount:p1
// @cpt-flow:cpt-frontx-flow-mfe-registry-factory-build:p2
// @cpt-algo:cpt-frontx-algo-mfe-registry-handler-resolution:p1
// @cpt-state:cpt-frontx-state-mfe-registry-entry-lifecycle:p2
// @cpt-algo:cpt-frontx-algo-mfe-host-communication-host-theme:p2
// @cpt-dod:cpt-frontx-dod-mfe-host-communication-host-theme:p1

import type { TypeSystemPlugin } from '../type-substrate';
import type {
  ExtensionDomain,
  Extension,
  ActionsChain,
} from '../types';
import type { ExtensionDomainImplementationFactory } from '../runtime/ExtensionDomainImplementationFactory';
import type { ExtensionMounter } from '../runtime/ExtensionMounter';
import type { ThemeAppearance } from '../runtime/MountManager';

/**
 * Abstract MfeRegistry - public contract for the MFE runtime facade.
 *
 * This is the ONLY type external consumers should depend on.
 * Obtain instances via createMfeRegistryFactory().build(config).
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
 * import { createMfeRegistryFactory } from '@gears-frontx/mfes';
 * import { gtsPlugin } from '@gears-frontx/gts-plugin';
 *
 * const registry = createMfeRegistryFactory().build({ typeSystem: gtsPlugin });
 * registry.registerDomain(myDomain, new MyDomainFactory());
 * await registry.registerExtension(myExtension);
 * ```
 */
// @cpt-begin:cpt-frontx-dod-mfe-registry-registry-contract:p1:inst-1
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
   * Started work is never interrupted: the unregistration waits for the
   * running occupancy-queue entry and for every in-flight Concurrent
   * `mount_ext` / `unmount_ext` execution, each settling with its own outcome.
   * Pending queue entries fail and take their own `fallback`. From the moment
   * the unregistration begins, a new `mount_ext` or `unmount_ext` request in
   * the domain is refused at once.
   * Then all extensions in the domain are cascade-unregistered, and the
   * domain is removed from the registry.
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
   * Execute an actions chain: the action, then `next` recursively on
   * success or `fallback` recursively on failure
   * (`cpt-frontx-adr-action-dispatch-and-chaining`). Takes only the chain
   * and returns nothing awaitable (`cpt-frontx-adr-mfe-runtime-public-surface`).
   *
   * @param chain - Actions chain to execute.
   */
  abstract executeActionsChain(chain: ActionsChain): void;

  // --- Query ---

  /**
   * Get a registered extension by its ID.
   * The registration is returned without its declared `route`; only the
   * injected router receives it.
   *
   * @param extensionId - ID of the extension to get
   * @returns Extension if registered, undefined otherwise
   */
  abstract getExtension(extensionId: string): Omit<Extension, 'route'> | undefined;

  /**
   * Get a registered domain by its ID.
   * The registration is returned without its declared `route`; only the
   * injected router receives it.
   *
   * @param domainId - ID of the domain to get
   * @returns ExtensionDomain if registered, undefined otherwise
   */
  abstract getDomain(domainId: string): Omit<ExtensionDomain, 'route'> | undefined;

  /**
   * Get all extensions registered for a specific domain.
   * The registration is returned without its declared `route`; only the
   * injected router receives it.
   *
   * @param domainId - ID of the domain
   * @returns Array of extensions in the domain (empty if domain not found or has no extensions)
   */
  abstract getExtensionsForDomain(domainId: string): Omit<Extension, 'route'>[];

  /**
   * Get the per-domain `ExtensionMounter` instance.
   * A domain's slot reaches it to call `mounter.attach(element)` /
   * `mounter.detach()`.
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
   * The registration is returned without its declared `route`; only the
   * injected router receives it.
   *
   * @param packageId - GTS package string (e.g., 'frontx.demo')
   * @returns Array of extensions in the package (empty if package not tracked)
   */
  abstract getExtensionsForPackage(packageId: string): Omit<Extension, 'route'>[];

  // --- Theme ---

  /**
   * Apply host CSS custom properties and optional appearance to every extension
   * shadow root, including roots created after this call.
   *
   * @param cssVars - CSS custom property name-to-value map
   * @param appearance - Optional host appearance
   */
  abstract setTheme(cssVars: Record<string, string>, appearance?: ThemeAppearance): void;

  // --- Lifecycle ---

  /**
   * Dispose the registry and clean up resources.
   * Cleans up all bridges, runtime connections, and internal state.
   *
   * Pending queued requests fail and take their fallback; work that has
   * started is never interrupted — the returned promise resolves once every
   * running or in-flight execution has settled with its own outcome and the
   * teardown has completed. From the moment disposal begins, a new
   * `mount_ext` or `unmount_ext` request in any domain is refused at once.
   */
  abstract dispose(): Promise<void>;
}
// @cpt-end:cpt-frontx-dod-mfe-registry-registry-contract:p1:inst-1
