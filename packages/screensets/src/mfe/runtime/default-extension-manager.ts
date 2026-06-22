/**
 * DefaultExtensionManager - Concrete Extension Manager Implementation
 *
 * Default implementation of ExtensionManager using Maps for storage.
 * Contains all business logic for registration, validation, and lifecycle triggering.
 *
 * @packageDocumentation
 * @internal
 */
// @cpt-algo:cpt-frontx-algo-mfe-registry-domain-validation:p1
// @cpt-algo:cpt-frontx-algo-mfe-registry-extension-validation:p1
// @cpt-algo:cpt-frontx-algo-mfe-registry-shared-property-broadcast:p1
// @cpt-dod:cpt-frontx-dod-mfe-registry-gts-validation:p1
// @cpt-dod:cpt-frontx-dod-mfe-registry-shared-property-broadcast:p1

import type {
  ExtensionDomain,
  Extension,
  MfeEntry,
} from '../types';
import type { TypeSystemPlugin } from '../plugins/types';
import {
  ExtensionManager,
  type ExtensionDomainState,
  type ExtensionState,
  type LifecycleTriggerCallback,
  type DomainLifecycleTriggerCallback,
} from './extension-manager';
import type { ExtensionMounter } from './ExtensionMounter';
import type { DomainLifecycleTrigger } from './DomainLifecycleTrigger';
import type { ExtensionDomainImplementation } from './ExtensionDomainImplementation';
import { validateDomainLifecycleHooks, validateExtensionLifecycleHooks } from '../validation/lifecycle';
import { validateContract } from '../validation/contract';
import { validateExtensionType } from '../validation/extension-type';
import { DomainValidationError, UnsupportedLifecycleStageError } from '../errors';

/**
 * Default extension manager implementation.
 *
 * Uses Maps to store domain and extension state.
 * Contains all business logic for registration, validation, and lifecycle triggering.
 *
 * @internal
 */
export class DefaultExtensionManager extends ExtensionManager {
  /**
   * Registered extension domains.
   */
  private readonly domains = new Map<string, ExtensionDomainState>();

  /**
   * Registered extensions.
   */
  private readonly extensions = new Map<string, ExtensionState>();

  /**
   * Type System plugin for validation.
   */
  private readonly typeSystem: TypeSystemPlugin;

  /**
   * Lifecycle trigger for extensions.
   */
  private readonly triggerLifecycle: LifecycleTriggerCallback;

  /**
   * Domain lifecycle trigger (domain itself).
   */
  private readonly triggerDomainOwnLifecycle: DomainLifecycleTriggerCallback;

  /**
   * Unmount extension callback.
   */
  private readonly unmountExtension: (extensionId: string) => Promise<void>;

  /**
   * Entry type validation callback.
   * Called during registerExtension() to verify that at least one registered handler
   * can handle the extension's entry type. If no handler matches and handlers exist,
   * throws EntryTypeNotHandledError.
   */
  private readonly validateEntryType: (entryTypeId: string) => void;

  constructor(config: {
    typeSystem: TypeSystemPlugin;
    triggerLifecycle: LifecycleTriggerCallback;
    triggerDomainOwnLifecycle: DomainLifecycleTriggerCallback;
    unmountExtension: (extensionId: string) => Promise<void>;
    validateEntryType: (entryTypeId: string) => void;
  }) {
    super();
    this.typeSystem = config.typeSystem;
    this.triggerLifecycle = config.triggerLifecycle;
    this.triggerDomainOwnLifecycle = config.triggerDomainOwnLifecycle;
    this.unmountExtension = config.unmountExtension;
    this.validateEntryType = config.validateEntryType;
  }

  /**
   * Register a domain.
   * Performs validation, stores state, and triggers init lifecycle.
   *
   * @param domain - Domain to register
   */
  // @cpt-begin:cpt-frontx-algo-mfe-registry-domain-validation:p1:inst-1
  registerDomain(domain: ExtensionDomain): void {
    // Step 1: GTS-native validation — register() validates and throws on failure
    try {
      this.typeSystem.register(domain);
    } catch (cause) {
      const err = cause instanceof Error ? cause : new Error(String(cause));
      throw new DomainValidationError(domain.id, err);
    }

    // Step 2: Validate lifecycle hooks reference supported stages
    const lifecycleValidation = validateDomainLifecycleHooks(domain);
    if (!lifecycleValidation.valid) {
      const firstError = lifecycleValidation.errors[0];
      const stageId = firstError?.stage ?? 'unknown';
      const message = firstError?.message ?? `Unsupported lifecycle stage '${stageId}'`;
      throw new UnsupportedLifecycleStageError(
        message,
        stageId,
        domain.id,
        domain.lifecycleStages
      );
    }

    // Step 3: Store domain state (mounter/lifecycleTrigger/implementation set later
    // by setDomainImplementation once the factory completes successfully)
    this.domains.set(domain.id, {
      domain,
      properties: new Map(),
      extensions: new Set(),
      propertySubscribers: new Map(),
      mountedExtensions: [],
      mounter: null,
      lifecycleTrigger: null,
      implementation: null,
    });

    // NOTE: The 'init' lifecycle stage is fired by DefaultMfeRegistry after
    // handler registration and cross-validation complete — not here.
  }
  // @cpt-end:cpt-frontx-algo-mfe-registry-domain-validation:p1:inst-1

  /**
   * Unregister a domain.
   * Cascade-unregisters all extensions and triggers destroyed lifecycle.
   *
   * @param domainId - ID of the domain to unregister
   * @returns Promise resolving when unregistration is complete
   */
  async unregisterDomain(domainId: string): Promise<void> {
    const domainState = this.domains.get(domainId);
    if (!domainState) {
      // Idempotent - no-op if already unregistered
      return;
    }

    // 1. Cascade unregister all extensions in domain
    const extensionIds = Array.from(domainState.extensions);
    for (const extensionId of extensionIds) {
      await this.unregisterExtension(extensionId);
    }

    // 2. Trigger 'destroyed' lifecycle stage for domain itself
    await this.triggerDomainOwnLifecycle(
      domainId,
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1'
    );

    // 3. Remove domain
    this.domains.delete(domainId);
  }

  /**
   * Register an extension.
   * Performs validation, stores state, and triggers init lifecycle.
   *
   * @param extension - Extension to register
   * @returns Promise resolving when registration is complete
   */
  // @cpt-begin:cpt-frontx-algo-mfe-registry-extension-validation:p1:inst-1
  async registerExtension(extension: Extension): Promise<void> {
    // 1. Validate extension against GTS schema — register() throws on failure
    this.typeSystem.register(extension);

    // 2. Check domain exists
    const domainState = this.domains.get(extension.domain);
    if (!domainState) {
      throw new Error(
        `Cannot register extension '${extension.id}': ` +
        `domain '${extension.domain}' is not registered. ` +
        `Register the domain first using registerDomain().`
      );
    }

    // 3. Validate contract (entry vs domain)
    const entry = this.resolveEntry(extension.entry);
    if (!entry) {
      throw new Error(
        `Entry '${extension.entry}' not found. ` +
        `Entries must be resolved before extension registration.`
      );
    }
    const contractResult = validateContract(entry, domainState.domain);
    if (!contractResult.valid) {
      const details = contractResult.errors
        .map((e) => `  - ${e.type}: ${e.details}`)
        .join('\n');
      throw new Error(
        `Contract validation failed for extension '${extension.entry}' in domain ` +
          `'${extension.domain}':\n${details}`
      );
    }

    // 4. Validate extension type (if domain specifies extensionsTypeId)
    // Throws on hierarchy mismatch; schema validation already ran via register().
    validateExtensionType(this.typeSystem, domainState.domain, extension);

    // 5. Validate extension lifecycle hooks
    const lifecycleValidation = validateExtensionLifecycleHooks(
      extension,
      domainState.domain
    );
    if (!lifecycleValidation.valid) {
      const firstError = lifecycleValidation.errors[0];
      throw new UnsupportedLifecycleStageError(
        firstError?.message ?? `Unsupported lifecycle stage`,
        firstError?.stage ?? 'unknown',
        extension.id,
        domainState.domain.extensionsLifecycleStages
      );
    }

    // 6. Validate entry type is handleable by at least one registered handler
    this.validateEntryType(entry.id);

    // 7. Register in internal state
    const extensionState: ExtensionState = {
      extension,
      entry,
      bridge: null,
      loadState: 'idle',
      mountState: 'unmounted',
      container: null,
      lifecycle: null,
      error: undefined,
    };
    this.extensions.set(extension.id, extensionState);

    // Add to domain's extensions set
    domainState.extensions.add(extension.id);

    // 8. Trigger 'init' lifecycle stage
    await this.triggerLifecycle(
      extension.id,
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1'
    );
  }
  // @cpt-end:cpt-frontx-algo-mfe-registry-extension-validation:p1:inst-1

  /**
   * Unregister an extension.
   * Auto-unmounts if mounted and triggers destroyed lifecycle.
   *
   * @param extensionId - ID of the extension to unregister
   * @returns Promise resolving when unregistration is complete
   */
  async unregisterExtension(extensionId: string): Promise<void> {
    const extensionState = this.extensions.get(extensionId);
    if (!extensionState) {
      // Idempotent - no-op if already unregistered
      return;
    }

    // 1. Auto-unmount if currently mounted
    if (extensionState.mountState === 'mounted') {
      await this.unmountExtension(extensionId);
    }

    // 2. Trigger 'destroyed' lifecycle stage
    await this.triggerLifecycle(
      extensionId,
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1'
    );

    // 3. Remove from registry
    // Remove from domain's extensions set
    const domainState = this.domains.get(extensionState.extension.domain);
    if (domainState) {
      domainState.extensions.delete(extensionId);
    }

    this.extensions.delete(extensionId);
  }

  /**
   * Get domain state by ID.
   *
   * @param domainId - Domain ID
   * @returns Domain state, or undefined if not found
   */
  getDomainState(domainId: string): ExtensionDomainState | undefined {
    return this.domains.get(domainId);
  }

  /**
   * Get extension state by ID.
   *
   * @param extensionId - Extension ID
   * @returns Extension state, or undefined if not found
   */
  getExtensionState(extensionId: string): ExtensionState | undefined {
    return this.extensions.get(extensionId);
  }

  /**
   * Get all extension states for a domain.
   *
   * @param domainId - Domain ID
   * @returns Array of extension states
   */
  getExtensionStatesForDomain(domainId: string): ExtensionState[] {
    const domainState = this.domains.get(domainId);
    if (!domainState) {
      return [];
    }

    const states: ExtensionState[] = [];
    for (const extensionId of domainState.extensions) {
      const extensionState = this.extensions.get(extensionId);
      if (extensionState) {
        states.push(extensionState);
      }
    }
    return states;
  }

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
  // @cpt-begin:cpt-frontx-algo-mfe-registry-shared-property-broadcast:p1:inst-1
  updateSharedProperty(propertyId: string, value: unknown): void {
    // Collect all domains that declare this property
    const matchingDomainStates: ExtensionDomainState[] = [];
    for (const domainState of this.domains.values()) {
      if (domainState.domain.sharedProperties.includes(propertyId)) {
        matchingDomainStates.push(domainState);
      }
    }

    // If no domains declare this property, silently succeed
    if (matchingDomainStates.length === 0) {
      return;
    }

    // GTS runtime validation: perform once for the property type since the schema
    // is derived from the property type ID, identical across all declaring domains.
    // The ephemeral ID is a valid chained GTS instance ID — gts-ts extracts the schema
    // from the chained ID automatically (same named instance pattern as actions chains).
    // The deterministic ephemeralId ensures each call overwrites the previous instance (no store growth).
    // No `type` field needed: the schema is resolved from the chained ID structure.
    const ephemeralId = `${propertyId}frontx.mfes.comm.runtime.v1`;
    // register() validates the ephemeral instance and throws on failure.
    this.typeSystem.register({ id: ephemeralId, value });

    // Propagate to all matching domains
    for (const domainState of matchingDomainStates) {
      // Store raw value in domain state
      domainState.properties.set(propertyId, value);

      // Notify property subscribers with (propertyId, value)
      const subscribers = domainState.propertySubscribers.get(propertyId);
      if (subscribers) {
        for (const callback of subscribers) {
          callback(propertyId, value);
        }
      }
    }
  }
  // @cpt-end:cpt-frontx-algo-mfe-registry-shared-property-broadcast:p1:inst-1

  /**
   * Get a domain property value.
   *
   * @param domainId - ID of the domain
   * @param propertyTypeId - Type ID of the property to get
   * @returns Property value, or undefined if not set
   */
  getDomainProperty(domainId: string, propertyTypeId: string): unknown {
    const domainState = this.domains.get(domainId);
    if (!domainState) {
      throw new Error(`Domain '${domainId}' not registered`);
    }

    return domainState.properties.get(propertyTypeId);
  }

  /**
   * Resolve an MfeEntry from its ID by looking up in extension states or the type system.
   *
   * @param entryId - Entry ID to resolve
   * @returns The MfeEntry, or undefined if not found
   * @private
   */
  private resolveEntry(entryId: string): MfeEntry | undefined {
    // First, check existing extension states
    for (const state of this.extensions.values()) {
      if (state.entry.id === entryId) {
        return state.entry;
      }
    }

    // If not found in extensions, try to resolve from type system
    // This allows newly registered entries (via gtsPlugin.register/typeSystem.register) to be used
    // getSchema() returns the entity's content, which for instances is the instance data itself
    const schema = this.typeSystem.getSchema(entryId);
    if (schema && this.isMfeEntry(schema)) {
      return schema;
    }

    return undefined;
  }

  /**
   * Runtime type guard for MfeEntry.
   * Validates that the value has the required structural shape.
   */
  private isMfeEntry(value: unknown): value is MfeEntry {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.id === 'string' &&
      Array.isArray(candidate.requiredProperties) &&
      Array.isArray(candidate.actions) &&
      Array.isArray(candidate.domainActions)
    );
  }

  /**
   * Clear all state.
   * Called during disposal to cleanup internal state.
   */
  clear(): void {
    this.domains.clear();
    this.extensions.clear();
  }


  /**
   * Get the insertion-ordered list of currently-mounted extension IDs for a domain.
   * Returns an empty array for an unknown or empty domain — never throws.
   *
   * @param domainId - ID of the domain
   * @returns Readonly insertion-ordered list of mounted extension IDs.
   */
  getMountedExtensions(domainId: string): readonly string[] {
    const domainState = this.domains.get(domainId);
    if (!domainState) {
      return [];
    }
    // Return a copy so callers cannot mutate the internal array.
    return domainState.mountedExtensions.slice();
  }

  /**
   * Append an extension to the domain's mount-set (append-if-absent semantics).
   * No-op if the extension is already in the mount-set.
   *
   * @param domainId - ID of the domain
   * @param extensionId - ID of the extension to add
   */
  addMountedExtension(domainId: string, extensionId: string): void {
    const domainState = this.domains.get(domainId);
    if (!domainState) {
      return;
    }
    if (!domainState.mountedExtensions.includes(extensionId)) {
      domainState.mountedExtensions.push(extensionId);
    }
  }

  /**
   * Remove an extension from the domain's mount-set (remove-if-present semantics).
   * No-op if the extension is not in the mount-set.
   *
   * @param domainId - ID of the domain
   * @param extensionId - ID of the extension to remove
   */
  removeMountedExtension(domainId: string, extensionId: string): void {
    const domainState = this.domains.get(domainId);
    if (!domainState) {
      return;
    }
    const idx = domainState.mountedExtensions.indexOf(extensionId);
    if (idx !== -1) {
      domainState.mountedExtensions.splice(idx, 1);
    }
  }

  /**
   * Wire the domain implementation, mounter, and lifecycle trigger into the
   * domain state after `registerDomain` completes successfully.
   *
   * @param domainId - ID of the domain
   * @param mounter - Per-domain `ExtensionMounter` instance
   * @param lifecycleTrigger - Per-domain `DomainLifecycleTrigger` instance
   * @param implementation - `ExtensionDomainImplementation` instance
   */
  setDomainImplementation(
    domainId: string,
    mounter: ExtensionMounter,
    lifecycleTrigger: DomainLifecycleTrigger,
    implementation: ExtensionDomainImplementation
  ): void {
    const domainState = this.domains.get(domainId);
    if (!domainState) {
      throw new Error(`Domain '${domainId}' not registered`);
    }
    domainState.mounter = mounter;
    domainState.lifecycleTrigger = lifecycleTrigger;
    domainState.implementation = implementation;
  }

}
