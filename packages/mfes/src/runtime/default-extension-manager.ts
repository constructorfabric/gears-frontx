/**
 * DefaultExtensionManager - Concrete Extension Manager Implementation
 *
 * Default implementation of ExtensionManager using Maps for storage.
 * Contains all business logic for registration, validation, and lifecycle triggering.
 * Extracted from the legacy screensets package in Phase 7 (extension-domain governance).
 *
 * @packageDocumentation
 * @internal
 */
// @cpt-flow:cpt-frontx-flow-extension-domain-governance-admission:p1
// @cpt-state:cpt-frontx-state-extension-domain-governance-admission:p1
// @cpt-dod:cpt-frontx-dod-extension-domain-governance-contract-enforcement:p1
// @cpt-dod:cpt-frontx-dod-extension-domain-governance-default-deny:p1
// @cpt-dod:cpt-frontx-dod-extension-domain-governance-route-identity-enforcement:p1

import type {
  ExtensionDomain,
  Extension,
  MfeEntry,
} from '../types';
import type { TypeSystemPlugin } from '../type-substrate';
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
import {
  DomainValidationError,
  UnsupportedLifecycleStageError,
  DomainRouteValidationError,
  ExtensionRouteConflictError,
  DuplicateRouteTokenError,
} from '../errors';
import { isValidRouteName, routeNamesEqual, getExtensionRouteToken } from '../routing-identity';

export class DefaultExtensionManager extends ExtensionManager {
  private readonly domains = new Map<string, ExtensionDomainState>();
  private readonly extensions = new Map<string, ExtensionState>();
  private readonly typeSystem: TypeSystemPlugin;
  private readonly triggerLifecycle: LifecycleTriggerCallback;
  private readonly triggerDomainOwnLifecycle: DomainLifecycleTriggerCallback;
  private readonly unmountExtension: (extensionId: string) => Promise<void>;
  private readonly releaseExtensionBridge: (extensionId: string) => void;
  private readonly validateEntryType: (entryTypeId: string) => void;

  constructor(config: {
    typeSystem: TypeSystemPlugin;
    triggerLifecycle: LifecycleTriggerCallback;
    triggerDomainOwnLifecycle: DomainLifecycleTriggerCallback;
    unmountExtension: (extensionId: string) => Promise<void>;
    releaseExtension: (extensionId: string) => void;
    validateEntryType: (entryTypeId: string) => void;
  }) {
    super();
    this.typeSystem = config.typeSystem;
    this.triggerLifecycle = config.triggerLifecycle;
    this.triggerDomainOwnLifecycle = config.triggerDomainOwnLifecycle;
    this.unmountExtension = config.unmountExtension;
    this.releaseExtensionBridge = config.releaseExtension;
    this.validateEntryType = config.validateEntryType;
  }

  // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-register-domain-call
  registerDomain(domain: ExtensionDomain): void {
    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-route-invalid-check
    // Runs before `typeSystem.register` so a rejected domain never reaches
    // the type system at all (no partial admission). A domain's own route
    // name is strict: unlike an extension's declared route, no leading '/'
    // is tolerated (a domain name is not a path). Guarded against
    // untyped/JS callers: a present-but-non-string `route` is rejected the
    // same way an invalid string one is, never propagated to `.startsWith`.
    const declaredDomainRoute: unknown = domain.route;
    if (declaredDomainRoute !== undefined) {
      const isString = typeof declaredDomainRoute === 'string';
      if (!isString || !isValidRouteName(declaredDomainRoute as string)) {
        // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-route-invalid-reject
        throw new DomainRouteValidationError(
          domain.id,
          isString ? (declaredDomainRoute as string) : String(declaredDomainRoute)
        );
        // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-route-invalid-reject
      }
    }
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-route-invalid-check

    try {
      this.typeSystem.register(domain);
    } catch (cause) {
      const err = cause instanceof Error ? cause : new Error(String(cause));
      throw new DomainValidationError(domain.id, err);
    }

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
  }
  // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-register-domain-call

  async unregisterDomain(domainId: string): Promise<void> {
    const domainState = this.domains.get(domainId);
    if (!domainState) {
      return;
    }

    const extensionIds = Array.from(domainState.extensions);
    for (const extensionId of extensionIds) {
      await this.unregisterExtension(extensionId);
    }

    await this.triggerDomainOwnLifecycle(
      domainId,
      this.typeSystem.resolveLifecycleStageDestroyedId()
    );

    this.domains.delete(domainId);
  }

  // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-register-extension
  async registerExtension(extension: Extension): Promise<void> {
    // Route checks run before `typeSystem.register` so a rejected extension
    // never reaches the type system at all (no partial admission).

    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-extension-route-reconcile
    // Guarded: the conflict check only runs when the base route is itself a
    // string — a non-string base `route` is not a conflict candidate; it
    // simply is not the declared route (`getDeclaredRoute`'s own guard).
    const rawBaseRoute: unknown = extension.route;
    const presentationRoute = this.getPresentationRoute(extension);
    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-extension-route-conflict-check
    if (typeof rawBaseRoute === 'string' && presentationRoute !== undefined) {
      const baseStripped = rawBaseRoute.startsWith('/') ? rawBaseRoute.slice(1) : rawBaseRoute;
      const presentationStripped = presentationRoute.startsWith('/')
        ? presentationRoute.slice(1)
        : presentationRoute;
      if (!routeNamesEqual(baseStripped, presentationStripped)) {
        // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-extension-route-conflict-reject
        throw new ExtensionRouteConflictError(extension.id, rawBaseRoute, presentationRoute);
        // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-extension-route-conflict-reject
      }
    }
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-extension-route-conflict-check
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-extension-route-reconcile

    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-extension-route-token-check
    // The target domain may not be registered yet at this point (route
    // checks now run ahead of the domain-existence check below): when it
    // isn't, there is no sibling set to compare against, so the duplicate
    // check is simply skipped here and the pre-existing domain-not-registered
    // rejection further down still fires, unchanged.
    const routeToken = getExtensionRouteToken(extension);
    if (routeToken !== undefined) {
      const domainStateForRouteCheck = this.domains.get(extension.domain);
      if (domainStateForRouteCheck) {
        for (const siblingId of domainStateForRouteCheck.extensions) {
          const sibling = this.extensions.get(siblingId);
          if (!sibling) continue;
          const siblingToken = getExtensionRouteToken(sibling.extension);
          // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-extension-route-duplicate-check
          if (siblingToken !== undefined && routeNamesEqual(siblingToken, routeToken)) {
            // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-extension-route-duplicate-reject
            throw new DuplicateRouteTokenError(extension.id, siblingId, extension.domain, routeToken);
            // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-extension-route-duplicate-reject
          }
          // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-extension-route-duplicate-check
        }
      }
    }
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-extension-route-token-check

    this.typeSystem.register(extension);

    const domainState = this.domains.get(extension.domain);
    if (!domainState) {
      throw new Error(
        `Cannot register extension '${extension.id}': ` +
        `domain '${extension.domain}' is not registered. ` +
        `Register the domain first using registerDomain().`
      );
    }

    const entry = this.resolveEntry(extension.entry);
    if (!entry) {
      throw new Error(
        `Entry '${extension.entry}' not found. ` +
        `Entries must be resolved before extension registration.`
      );
    }

    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-contract-match
    const contractResult = validateContract(entry, domainState.domain, this.typeSystem);
    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-contract-fail-check
    // @cpt-begin:cpt-frontx-state-extension-domain-governance-admission:p1:inst-adm-t1
    if (!contractResult.valid) {
    // @cpt-end:cpt-frontx-state-extension-domain-governance-admission:p1:inst-adm-t1
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-contract-fail-check
      // @cpt-begin:cpt-frontx-state-extension-domain-governance-admission:p1:inst-adm-t2
      // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-contract-reject
      const details = contractResult.errors
        .map((e) => `  - ${e.type}: ${e.details}`)
        .join('\n');
      throw new Error(
        `Contract validation failed for extension '${extension.entry}' in domain ` +
          `'${extension.domain}':\n${details}`
      );
      // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-contract-reject
      // @cpt-end:cpt-frontx-state-extension-domain-governance-admission:p1:inst-adm-t2
    }
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-contract-match

    validateExtensionType(this.typeSystem, domainState.domain, extension);

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

    // @cpt-begin:cpt-frontx-state-extension-domain-governance-admission:p1:inst-adm-t4
    this.validateEntryType(entry.id);
    // @cpt-end:cpt-frontx-state-extension-domain-governance-admission:p1:inst-adm-t4

    // @cpt-begin:cpt-frontx-state-extension-domain-governance-admission:p1:inst-adm-t3
    const extensionState: ExtensionState = {
      extension,
      entry,
      bridge: null,
      childBridge: null,
      loadState: 'idle',
      mountState: 'unmounted',
      container: null,
      lifecycle: null,
      error: undefined,
    };
    this.extensions.set(extension.id, extensionState);
    domainState.extensions.add(extension.id);

    await this.triggerLifecycle(
      extension.id,
      this.typeSystem.resolveLifecycleStageInitId()
    );
    // @cpt-end:cpt-frontx-state-extension-domain-governance-admission:p1:inst-adm-t3
    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-admission-fail
    // (implicit: error thrown above transitions to admission-fail; normal path returns)
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-admission-fail
  }
  // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-register-extension

  async unregisterExtension(extensionId: string): Promise<void> {
    const extensionState = this.extensions.get(extensionId);
    if (!extensionState) {
      return;
    }

    if (extensionState.mountState === 'mounted') {
      await this.unmountExtension(extensionId);
    }

    await this.triggerLifecycle(
      extensionId,
      this.typeSystem.resolveLifecycleStageDestroyedId()
    );

    this.releaseExtensionBridge(extensionId);

    const domainState = this.domains.get(extensionState.extension.domain);
    if (domainState) {
      domainState.extensions.delete(extensionId);
    }

    this.extensions.delete(extensionId);
  }

  getDomainState(domainId: string): ExtensionDomainState | undefined {
    return this.domains.get(domainId);
  }

  getExtensionState(extensionId: string): ExtensionState | undefined {
    return this.extensions.get(extensionId);
  }

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

  updateSharedProperty(propertyId: string, value: unknown): void {
    const matchingDomainStates: ExtensionDomainState[] = [];
    for (const domainState of this.domains.values()) {
      if (domainState.domain.sharedProperties.includes(propertyId)) {
        matchingDomainStates.push(domainState);
      }
    }

    if (matchingDomainStates.length === 0) {
      return;
    }

    const ephemeralId = `${propertyId}frontx.mfes.comm.runtime.v1`;
    this.typeSystem.register({ id: ephemeralId, value });

    for (const domainState of matchingDomainStates) {
      domainState.properties.set(propertyId, value);

      const subscribers = domainState.propertySubscribers.get(propertyId);
      if (subscribers) {
        for (const callback of subscribers) {
          callback(propertyId, value);
        }
      }
    }
  }

  getDomainProperty(domainId: string, propertyTypeId: string): unknown {
    const domainState = this.domains.get(domainId);
    if (!domainState) {
      throw new Error(`Domain '${domainId}' not registered`);
    }
    return domainState.properties.get(propertyTypeId);
  }

  private resolveEntry(entryId: string): MfeEntry | undefined {
    for (const state of this.extensions.values()) {
      if (state.entry.id === entryId) {
        return state.entry;
      }
    }

    const schema = this.typeSystem.getSchema(entryId);
    if (schema && this.isMfeEntry(schema)) {
      return schema;
    }

    return undefined;
  }

  /**
   * `presentation.route`, duck-typed: the base `Extension` contract carries
   * no `presentation` field (that is `ScreenExtension`'s own addition), so
   * any concrete extension may or may not carry one at runtime.
   */
  private getPresentationRoute(extension: Extension): string | undefined {
    const presentation = (extension as { presentation?: { route?: unknown } }).presentation;
    if (presentation && typeof presentation.route === 'string') {
      return presentation.route;
    }
    return undefined;
  }

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

  clear(): void {
    for (const extensionId of Array.from(this.extensions.keys())) {
      this.releaseExtensionBridge(extensionId);
    }
    this.domains.clear();
    this.extensions.clear();
  }

  getMountedExtensions(domainId: string): readonly string[] {
    const domainState = this.domains.get(domainId);
    if (!domainState) {
      return [];
    }
    return domainState.mountedExtensions.slice();
  }

  addMountedExtension(domainId: string, extensionId: string): void {
    const domainState = this.domains.get(domainId);
    if (!domainState) {
      return;
    }
    if (!domainState.mountedExtensions.includes(extensionId)) {
      domainState.mountedExtensions.push(extensionId);
    }
  }

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

  // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-registered
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
  // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-registered
}
