/**
 * DefaultExtensionManager - Concrete Extension Manager Implementation
 *
 * Default implementation of ExtensionManager using Maps for storage.
 * Contains all business logic for registration, validation, and lifecycle triggering.
 *
 * @packageDocumentation
 * @internal
 */
// @cpt-flow:cpt-frontx-flow-extension-domain-governance-admission:p1
// @cpt-state:cpt-frontx-state-extension-domain-governance-admission:p1
// @cpt-dod:cpt-frontx-dod-extension-domain-governance-contract-enforcement:p1
// @cpt-dod:cpt-frontx-dod-extension-domain-governance-default-deny:p1

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
} from './ExtensionManager';
import type { ExtensionMounter } from './ExtensionMounter';
import type { DomainLifecycleTrigger } from './DomainLifecycleTrigger';
import type { ExtensionDomainImplementation } from './ExtensionDomainImplementation';
import { validateDomainLifecycleHooks, validateExtensionLifecycleHooks } from '../validation/lifecycle';
import { validateContract } from '../validation/contract';
import { validateExtensionType } from '../validation/extension-type';
import { UnsupportedLifecycleStageError } from '../errors';
import type { RouterPort } from '../router/RouterPort';

export class DefaultExtensionManager extends ExtensionManager {
  private readonly domains = new Map<string, ExtensionDomainState>();
  private readonly extensions = new Map<string, ExtensionState>();
  private readonly typeSystem: TypeSystemPlugin;
  private readonly triggerLifecycle: LifecycleTriggerCallback;
  private readonly triggerDomainOwnLifecycle: DomainLifecycleTriggerCallback;
  private readonly unmountExtension: (extensionId: string) => Promise<void>;
  private readonly releaseExtensionBridge: (extensionId: string) => void;
  private readonly validateEntryType: (entryTypeId: string) => void;
  /**
   * The router snapshotted by the factory, or `undefined` for a standalone
   * registry. Presented an extension through `registerExtension` after
   * every runtime check passes and before the extension's state is stored
   * (`cpt-frontx-algo-mfe-registry-router-admission` `inst-algo-ra-present-extension`)
   * — this is the one point in the registration flow that precedes storage,
   * since `DefaultExtensionManager.registerExtension` itself commits state.
   */
  private readonly router: RouterPort | undefined;

  constructor(config: {
    typeSystem: TypeSystemPlugin;
    triggerLifecycle: LifecycleTriggerCallback;
    triggerDomainOwnLifecycle: DomainLifecycleTriggerCallback;
    unmountExtension: (extensionId: string) => Promise<void>;
    releaseExtension: (extensionId: string) => void;
    validateEntryType: (entryTypeId: string) => void;
    router?: RouterPort;
  }) {
    super();
    this.typeSystem = config.typeSystem;
    this.triggerLifecycle = config.triggerLifecycle;
    this.triggerDomainOwnLifecycle = config.triggerDomainOwnLifecycle;
    this.unmountExtension = config.unmountExtension;
    this.releaseExtensionBridge = config.releaseExtension;
    this.validateEntryType = config.validateEntryType;
    this.router = config.router;
  }

  // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-register-domain-call
  // Type-system registration for the domain deliberately does not happen
  // here: the provider's `register()` cannot validate without also
  // persisting the domain to the GtsStore (no validate-only call exists on
  // the port), so registering this early would leave a router-rejected (or
  // factory/cardinality-rejected) domain durably registered with the type
  // system before the caller (`DefaultMfeRegistry.registerDomain`) ever
  // reaches router admission. That caller runs
  // `this.typeSystem.register(declaration)` itself, after every one of its
  // own checks — including router admission — passes
  // (`cpt-frontx-algo-mfe-registry-router-admission` `inst-algo-ra-present-domain`).
  // This method only validates and records the in-memory, fully reversible
  // domain state: every failure path downstream calls `unregisterDomain` to
  // undo it.
  registerDomain(domain: ExtensionDomain): void {
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

    // @cpt-begin:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-sites
    // Non-blocking: the domain's own `destroyed` stage is triggered
    // alongside this unregistration transition — a notification that the
    // transition is happening, not a phase it waits on. Each hook's first
    // action resolves and invokes its handler within `executeActionsChain`,
    // so a `destroyed` hook targeting this very domain reaches its handler
    // before `DefaultMfeRegistry.unregisterDomain` unregisters it.
    this.triggerDomainOwnLifecycle(
      domainId,
      this.typeSystem.resolveLifecycleStageDestroyedId()
    );
    // @cpt-end:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-sites

    this.domains.delete(domainId);
  }

  // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-register-extension
  async registerExtension(extension: Extension): Promise<void> {
    // Type-system registration is deliberately NOT the first thing this
    // method does, even though it is the cheapest check to fail fast on:
    // the provider's `register()` cannot validate without also persisting
    // the instance (no validate-only call exists on the port), so running
    // it before the router admits would leave a router-rejected extension
    // durably registered with the type system — a partial admission the
    // router's own rejection is supposed to prevent (see the router
    // admission call below, `inst-algo-ra-present-extension`).
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

    // @cpt-algo:cpt-frontx-algo-mfe-registry-router-admission:p1
    // @cpt-algo:cpt-frontx-algo-mfe-registry-register-extension:p2
    // @cpt-flow:cpt-frontx-flow-mfe-registry-register-validate-mount:p1
    // @cpt-begin:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-present-extension
    // @cpt-begin:cpt-frontx-algo-mfe-registry-register-extension:p2:inst-algo-re-router-admit
    // @cpt-begin:cpt-frontx-flow-mfe-registry-register-validate-mount:p1:inst-flow-rvm-router-extension
    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-extension-router-admission
    // Every runtime check above has passed and nothing below here has stored
    // state, triggered `init`, or propagated an advertisement yet — this is
    // the one point in the flow that is both "after every check" and
    // "before durable". A throw here — caught nowhere in this method —
    // leaves nothing behind: it propagates to the caller as the router's
    // own error, unchanged (`inst-algo-ra-extension-rejected`,
    // `inst-algo-re-router-reject`, `inst-flow-rvm-router-extension-reject`,
    // `inst-extension-router-reject`).
    if (this.router) {
      this.router.registerExtension(extension);
    }
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-extension-router-admission

    // The router has admitted (or no router is injected): only now does the
    // extension become visible to the type system. A schema-validation
    // failure here throws with the same "nothing left behind" guarantee as
    // a router rejection for everything downstream of this point — the lines
    // below (state storage, package tracking, `init` trigger) never run —
    // but the router admission just above is not itself "nothing left
    // behind": it already happened, and no caller above this method tracks
    // it, so it must be released right here, before the throw, or a
    // corrected retry would collide with it in the router.
    // @cpt-begin:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-extension-type-register
    try {
      this.typeSystem.register(extension);
    } catch (cause) {
      // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-extension-type-register-reject
      // A release failure here is secondary to the type-system rejection
      // being rolled back for: log it and still rethrow `cause` unchanged,
      // the same contract `DefaultMfeRegistry`'s releaseRouterDomain/
      // releaseRouterExtension helpers hold for their own release calls.
      if (this.router) {
        try {
          this.router.releaseExtension(extension.id);
        } catch (releaseError) {
          console.error(
            `[DefaultExtensionManager] releaseExtension failed for '${extension.id}':`,
            releaseError
          );
        }
      }
      throw cause;
      // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-extension-type-register-reject
    }
    // @cpt-end:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-extension-type-register
    // @cpt-end:cpt-frontx-flow-mfe-registry-register-validate-mount:p1:inst-flow-rvm-router-extension
    // @cpt-end:cpt-frontx-algo-mfe-registry-register-extension:p2:inst-algo-re-router-admit
    // @cpt-end:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-present-extension

    // @cpt-begin:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-extension-rejected
    // @cpt-begin:cpt-frontx-algo-mfe-registry-register-extension:p2:inst-algo-re-router-reject
    // @cpt-begin:cpt-frontx-flow-mfe-registry-register-validate-mount:p1:inst-flow-rvm-router-extension-reject
    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-extension-router-reject
    // No separate catch exists for this rejection: `this.router.registerExtension`
    // above is called with no try/catch, so a throw propagates straight out
    // of this `async` method as this method's own rejection, reaching the
    // caller (`DefaultMfeRegistry.registerExtension`, which awaits this call
    // with no try/catch of its own either) unchanged. Nothing below this
    // point in the method — the `ExtensionState` construction, the `extensions`
    // map insertion, the `init` trigger — ever runs.
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-extension-router-reject
    // @cpt-end:cpt-frontx-flow-mfe-registry-register-validate-mount:p1:inst-flow-rvm-router-extension-reject
    // @cpt-end:cpt-frontx-algo-mfe-registry-register-extension:p2:inst-algo-re-router-reject
    // @cpt-end:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-extension-rejected

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

    // @cpt-begin:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-sites
    // Non-blocking: the `init` stage is triggered alongside admission — a
    // notification that admission happened, not a phase admission waits on.
    this.triggerLifecycle(
      extension.id,
      this.typeSystem.resolveLifecycleStageInitId()
    );
    // @cpt-end:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-sites
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

    // @cpt-begin:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-sites
    // Non-blocking: the extension's own `destroyed` stage is triggered
    // alongside this unregistration transition. Each hook's first action
    // resolves and invokes its handler within `executeActionsChain`, before
    // `releaseExtensionBridge` below unregisters this extension's handlers.
    this.triggerLifecycle(
      extensionId,
      this.typeSystem.resolveLifecycleStageDestroyedId()
    );
    // @cpt-end:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-sites

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
