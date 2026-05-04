/**
 * Extension Manager - Abstract Interface
 *
 * Abstract extension manager interface defining the contract for extension
 * and domain state management.
 *
 * @packageDocumentation
 * @internal
 */

import type {
  ExtensionDomain,
  Extension,
  MfeEntry,
} from '../types';
import type { ParentMfeBridge } from '../handler/types';
import type { ExtensionMounter } from './ExtensionMounter';
import type { DomainLifecycleTrigger } from './DomainLifecycleTrigger';
import type { ExtensionDomainImplementation } from './ExtensionDomainImplementation';

/**
 * State for a registered extension domain.
 * INTERNAL: Used by ActionsChainsMediator for domain resolution.
 */
export interface ExtensionDomainState {
  domain: ExtensionDomain;
  properties: Map<string, unknown>;
  extensions: Set<string>;
  propertySubscribers: Map<string, Set<(propertyTypeId: string, value: unknown) => void>>;
  /** Insertion-ordered list of currently-mounted extension IDs for this domain. */
  mountedExtensions: string[];
  /** Per-domain mount facade; null until set by setDomainImplementation. */
  mounter: ExtensionMounter | null;
  /** Per-domain lifecycle trigger; null until set by setDomainImplementation. */
  lifecycleTrigger: DomainLifecycleTrigger | null;
  /** Domain implementation instance; null until set by setDomainImplementation. */
  implementation: ExtensionDomainImplementation | null;
}

/**
 * State for a registered extension.
 */
export interface ExtensionState {
  extension: Extension;
  entry: MfeEntry;
  bridge: ParentMfeBridge | null;
  loadState: 'idle' | 'loading' | 'loaded' | 'error';
  mountState: 'unmounted' | 'mounting' | 'mounted' | 'error';
  container: Element | null;
  lifecycle: import('../handler/types').MfeEntryLifecycle<import('../handler/types').ChildMfeBridge> | null;
  error?: Error;
  /** Shadow root created during mount (default handler flow) */
  shadowRoot?: ShadowRoot;
}

/**
 * Lifecycle trigger callback type.
 */
export type LifecycleTriggerCallback = (extensionId: string, stageId: string) => Promise<void>;

/**
 * Domain lifecycle trigger callback type.
 */
export type DomainLifecycleTriggerCallback = (domainId: string, stageId: string) => Promise<void>;

/**
 * Abstract extension manager for extension and domain state management.
 *
 * This is the exportable abstraction that defines the contract for
 * extension and domain registration and storage. Concrete implementations
 * encapsulate the actual storage mechanism.
 *
 * Key Responsibilities:
 * - Register and unregister domains (with full validation and lifecycle)
 * - Register and unregister extensions (with full validation and lifecycle)
 * - Domain property management
 * - Query methods for domains and extensions
 *
 * Key Benefits:
 * - Dependency Inversion: MfeRegistry depends on abstraction
 * - Testability: Can inject mock managers for testing
 * - Encapsulation: Storage mechanism is hidden in concrete class
 */
export abstract class ExtensionManager {
  /**
   * Register a domain.
   * Performs GTS validation and stores initial domain state.
   * Does NOT trigger the init lifecycle — that is done by the registry after
   * handler registration completes.
   *
   * @param domain - Domain to register
   */
  abstract registerDomain(domain: ExtensionDomain): void;

  /**
   * Unregister a domain.
   * Cascade-unregisters all extensions and triggers destroyed lifecycle.
   *
   * @param domainId - ID of the domain to unregister
   * @returns Promise resolving when unregistration is complete
   */
  abstract unregisterDomain(domainId: string): Promise<void>;

  /**
   * Register an extension.
   * Performs validation, stores state, and triggers init lifecycle.
   *
   * @param extension - Extension to register
   * @returns Promise resolving when registration is complete
   */
  abstract registerExtension(extension: Extension): Promise<void>;

  /**
   * Unregister an extension.
   * Auto-unmounts if mounted and triggers destroyed lifecycle.
   *
   * @param extensionId - ID of the extension to unregister
   * @returns Promise resolving when unregistration is complete
   */
  abstract unregisterExtension(extensionId: string): Promise<void>;

  /**
   * Broadcast a shared property value to all registered domains that declare the property.
   * Performs GTS validation once before propagating to any matching domain.
   * Domains that do not include propertyId in their sharedProperties array are skipped.
   * If no registered domains declare the property, this is a silent no-op.
   *
   * @param propertyId - Type ID of the shared property
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

  /**
   * Get the insertion-ordered list of currently-mounted extension IDs for a domain.
   * Returns an empty array for an unknown or empty domain — never throws.
   *
   * @param domainId - ID of the domain
   * @returns Readonly insertion-ordered list of mounted extension IDs.
   */
  abstract getMountedExtensions(domainId: string): readonly string[];

  /**
   * Append an extension to the domain's mount-set (append-if-absent semantics).
   * No-op if the extension is already in the mount-set.
   *
   * @param domainId - ID of the domain
   * @param extensionId - ID of the extension to add
   */
  abstract addMountedExtension(domainId: string, extensionId: string): void;

  /**
   * Remove an extension from the domain's mount-set (remove-if-present semantics).
   * No-op if the extension is not in the mount-set.
   *
   * @param domainId - ID of the domain
   * @param extensionId - ID of the extension to remove
   */
  abstract removeMountedExtension(domainId: string, extensionId: string): void;

  /**
   * Wire the domain implementation, mounter, and lifecycle trigger into the
   * domain state after `registerDomain` completes successfully.
   *
   * @param domainId - ID of the domain
   * @param mounter - Per-domain `ExtensionMounter` instance
   * @param lifecycleTrigger - Per-domain `DomainLifecycleTrigger` instance
   * @param implementation - `ExtensionDomainImplementation` instance
   */
  abstract setDomainImplementation(
    domainId: string,
    mounter: ExtensionMounter,
    lifecycleTrigger: DomainLifecycleTrigger,
    implementation: ExtensionDomainImplementation
  ): void;
}
