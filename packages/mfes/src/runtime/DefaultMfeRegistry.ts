/**
 * DefaultMfeRegistry - Concrete MFE Runtime Implementation
 *
 * This is the DEFAULT concrete implementation of MfeRegistry.
 * It wires all collaborators together and implements the facade API.
 *
 * INTERNAL: This class is NOT exported from the public barrel.
 * External consumers obtain instances via mfeRegistryFactory.build(config).
 *
 * @packageDocumentation
 * @internal
 */
// @cpt-algo:cpt-frontx-algo-mfe-registry-handler-resolution:p1
// @cpt-dod:cpt-frontx-dod-mfe-registry-handler-injection:p1
// @cpt-dod:cpt-frontx-dod-mfe-registry-registry-contract:p1

import type { TypeSystemPlugin } from '../type-substrate';
import { MfeRegistry } from '../registry/MfeRegistry';
import type { MfeRegistryConfig } from './config';
import type { MfeHandler, ParentMfeBridge } from '../handler/types';
import type { ExtensionDomain, Extension, ActionsChain } from '../types';
import type { ExtensionDomainImplementationFactory } from './ExtensionDomainImplementationFactory';
import type { ExtensionMounter } from './ExtensionMounter';
import { ActionsChainsMediator } from '../mediator/types';
import { RuntimeCoordinator } from './coordination/types';
import { InvalidatableDomainContext } from './DomainContext';
import { ConcurrentMountStrategy, OptionalMountStrategy, ExclusiveMountStrategy } from './mount-strategies';
import { WeakMapRuntimeCoordinator } from './coordination/weak-map-runtime-coordinator';
import { DefaultActionsChainsMediator } from '../mediator/actions-chains-mediator';
import { type ExtensionDomainState } from './extension-manager';
import { DefaultExtensionManager } from './default-extension-manager';
import { DefaultLifecycleManager } from './default-lifecycle-manager';
import { MountManager } from './mount-manager';
import { DefaultMountManager } from './default-mount-manager';
import { OperationSerializer } from './operation-serializer';
import { RuntimeBridgeFactory } from './runtime-bridge-factory';
import { DefaultRuntimeBridgeFactory } from './default-runtime-bridge-factory';
import { LoadExtHandler } from './extension-lifecycle-action-handler';
import { EntryTypeNotHandledError } from '../errors';
import { extractGtsPackage } from '../gts/extract-package';
import { DefaultExtensionMounter } from './DefaultExtensionMounter';
import { DefaultDomainLifecycleTrigger } from './DefaultDomainLifecycleTrigger';

/**
 * Default concrete implementation of MfeRegistry.
 *
 * This class extends the abstract MfeRegistry and provides the full
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
export class DefaultMfeRegistry extends MfeRegistry {
  /**
   * Type System plugin instance.
   * All type validation and schema operations go through this plugin.
   */
  public readonly typeSystem: TypeSystemPlugin;


  /**
   * Extension manager for managing extension and domain state.
   */
  private readonly extensionManager: DefaultExtensionManager;

  /**
   * Lifecycle manager for triggering lifecycle stages.
   */
  private readonly lifecycleManager: DefaultLifecycleManager;

  /**
   * Mount manager for loading and mounting MFEs.
   */
  private readonly mountManager: MountManager;

  /**
   * Runtime bridge factory for creating bridge connections.
   */
  private readonly bridgeFactory: RuntimeBridgeFactory;

  /**
   * Runtime coordinator for managing runtime connections.
   */
  private readonly coordinator: RuntimeCoordinator;

  /**
   * Actions chains mediator for action chain execution.
   */
  private readonly mediator: ActionsChainsMediator;

  /**
   * Operation serializer for per-entity concurrency control.
   */
  private readonly operationSerializer: OperationSerializer;

  /**
   * Registered MFE handlers.
   */
  private readonly handlers: MfeHandler[] = [];

  /**
   * Child MFE bridges (parent -> child communication).
   */
  private readonly childBridges = new Map<string, ParentMfeBridge>();

  /**
   * Parent MFE bridge (child -> parent communication).
   */
  private parentBridge: ParentMfeBridge | null = null;

  /**
   * GTS package to extension ID mappings.
   */
  private readonly packages = new Map<string, Set<string>>();

  constructor(config: MfeRegistryConfig) {
    super();

    if (!config.typeSystem) {
      throw new Error(
        'MfeRegistry requires a TypeSystemPlugin. ' +
        'Provide it via config.typeSystem parameter. ' +
        'Use mfeRegistryFactory.build({ typeSystem: gtsPlugin }) to create an instance.'
      );
    }

    this.typeSystem = config.typeSystem;

    this.operationSerializer = new OperationSerializer();
    this.coordinator = new WeakMapRuntimeCoordinator();
    this.bridgeFactory = new DefaultRuntimeBridgeFactory();

    this.mediator = new DefaultActionsChainsMediator({
      typeSystem: this.typeSystem,
      getDomainState: (domainId) => this.extensionManager.getDomainState(domainId),
      getExtensionEntry: (extensionId) =>
        this.extensionManager.getExtensionState(extensionId)?.entry,
    });

    this.extensionManager = new DefaultExtensionManager({
      typeSystem: this.typeSystem,
      // Internal lifecycle trigger — bypasses the public surface (removed in spec v1.6).
      triggerLifecycle: (extensionId, stageId) =>
        this.triggerLifecycleStageInternal(extensionId, stageId),
      triggerDomainOwnLifecycle: (domainId, stageId) =>
        this.triggerDomainOwnLifecycleStageInternal(domainId, stageId),
      // Bypass OperationSerializer: the parent operation (unregisterExtension)
      // already holds the serializer lock for this entity ID, so we cannot
      // re-enter registry.executeActionsChain. Routing through the per-domain
      // DefaultExtensionMounter keeps mount-set bookkeeping (removeMountedExtension)
      // and DOM container teardown centralized while still avoiding the lock.
      unmountExtension: (extensionId) => this.bypassUnmountExtension(extensionId),
      validateEntryType: (entryTypeId) => this.validateEntryType(entryTypeId),
    });

    this.lifecycleManager = new DefaultLifecycleManager(
      this.extensionManager,
      async (chain) => { await this.executeActionsChain(chain); }
    );

    this.mountManager = new DefaultMountManager({
      extensionManager: this.extensionManager,
      resolveHandler: (entryTypeId) => this.resolveHandler(entryTypeId),
      coordinator: this.coordinator,
      typeSystem: this.typeSystem,
      triggerLifecycle: (extensionId, stageId) =>
        this.triggerLifecycleStageInternal(extensionId, stageId),
      executeActionsChain: (chain) => this.executeActionsChain(chain),
      hostRuntime: this,
      registerCatchAllActionHandler: (domainId, handler) =>
        this.mediator.registerCatchAllHandler(domainId, handler),
      unregisterCatchAllActionHandler: (domainId) =>
        this.mediator.unregisterCatchAllHandler(domainId),
      registerExtensionActionHandler: (extensionId, actionTypeId, handler, domainId) =>
        this.mediator.registerHandler(extensionId, actionTypeId, handler, domainId),
      unregisterExtensionActionHandler: (extensionId) =>
        this.mediator.unregisterAllHandlers(extensionId),
      bridgeFactory: this.bridgeFactory,
    });

    if (config.mfeHandlers) {
      for (const handler of config.mfeHandlers) {
        this.handlers.push(handler);
      }
      // @cpt-begin:cpt-frontx-algo-mfe-registry-handler-resolution:p1:inst-algo-hr-01
      this.handlers.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
      // @cpt-end:cpt-frontx-algo-mfe-registry-handler-resolution:p1:inst-algo-hr-01
    }
  }

  // ─── Private lifecycle trigger helpers (replaces old public methods) ──────

  /**
   * Internal: trigger a lifecycle stage for a specific extension.
   * Used by collaborators that previously called the now-removed public methods.
   */
  private async triggerLifecycleStageInternal(extensionId: string, stageId: string): Promise<void> {
    return this.lifecycleManager.triggerLifecycleStage(extensionId, stageId);
  }

  /**
   * Internal: auto-unmount path used by `DefaultExtensionManager.unregisterExtension`.
   *
   * Resolves the extension's domain, then dispatches through the per-domain
   * `DefaultExtensionMounter` so mount-set bookkeeping (`removeMountedExtension`)
   * and container DOM teardown run alongside `MountManager.unmountExtension`.
   *
   * The serializer lock for this extension is already held by the parent
   * `unregisterExtension` operation; the mounter does not re-acquire it, so
   * no deadlock is possible.
   */
  private async bypassUnmountExtension(extensionId: string): Promise<void> {
    const extState = this.extensionManager.getExtensionState(extensionId);
    if (!extState) {
      return;
    }
    const domainState = this.extensionManager.getDomainState(extState.extension.domain);
    const mounter = domainState?.mounter;
    if (mounter) {
      await mounter.unmount(extensionId);
      return;
    }
    await this.mountManager.unmountExtension(extensionId);
  }

  /**
   * Internal: trigger a lifecycle stage on the domain entity itself.
   */
  private async triggerDomainOwnLifecycleStageInternal(domainId: string, stageId: string): Promise<void> {
    return this.lifecycleManager.triggerDomainOwnLifecycleStage(domainId, stageId);
  }

  // ─── Entry type validation ────────────────────────────────────────────────

  private validateEntryType(entryTypeId: string): void {
    if (this.handlers.length === 0) {
      return;
    }

    // @cpt-begin:cpt-frontx-algo-mfe-registry-handler-resolution:p1:inst-algo-hr-03
    // No handler covers the entry type after evaluating all → resolution failure.
    const canHandle = this.handlers.some(handler =>
      this.typeSystem.isTypeOf(entryTypeId, handler.handledBaseTypeId)
    );
    if (!canHandle) {
      throw new EntryTypeNotHandledError(
        entryTypeId,
        this.handlers.map(h => h.handledBaseTypeId)
      );
    }
    // @cpt-end:cpt-frontx-algo-mfe-registry-handler-resolution:p1:inst-algo-hr-03
  }

  private resolveHandler(entryTypeId: string): MfeHandler | undefined {
    // @cpt-begin:cpt-frontx-algo-mfe-registry-handler-resolution:p1:inst-algo-hr-02b
    // Iterate handlers (already priority-sorted) and return the first whose
    // handled base type matches the entry type through the injected type system.
    return this.handlers.find(handler =>
      this.typeSystem.isTypeOf(entryTypeId, handler.handledBaseTypeId)
    );
    // @cpt-end:cpt-frontx-algo-mfe-registry-handler-resolution:p1:inst-algo-hr-02b
  }

  // ─── registerDomain ───────────────────────────────────────────────────────

  /**
   * Register an extension domain.
   */
  registerDomain(
    declaration: ExtensionDomain,
    factory: ExtensionDomainImplementationFactory
  ): void {
    // Step 1: GTS-validate and store initial domain state (no init trigger yet).
    this.extensionManager.registerDomain(declaration);

    // Step 2: Construct per-domain mounter and lifecycle trigger.
    const mounter = new DefaultExtensionMounter(
      declaration.id,
      this.mountManager,
      (domainId, extId) => this.extensionManager.addMountedExtension(domainId, extId),
      (domainId, extId) => this.extensionManager.removeMountedExtension(domainId, extId),
      (domainId) => this.extensionManager.getMountedExtensions(domainId),
      // Hooks passed to detach — strategies create their own hooks; the mounter uses them
      // only for mass-unmount in detach(), so we supply a no-op here and let each
      // strategy handle its own hooks during normal unmount. Detach delegates to
      // mountManager.unmountExtension directly without hooks.destroy since by detach
      // time the strategy has already been invalidated.
      {
        create: (_extId) => { throw new Error('DefaultExtensionMounter: create called on detach hooks'); },
        destroy: (_extId) => { /* no-op: strategy handles destroy during normal unmount */ },
      }
    );
    const lifecycleTrigger = new DefaultDomainLifecycleTrigger(declaration.id, this.lifecycleManager);

    // Step 3: Build DomainContext and pre-populate LoadExtHandler.
    const ctx = new InvalidatableDomainContext(mounter, lifecycleTrigger, this.typeSystem);
    ctx.prepopulateHandler(
      this.typeSystem.resolveLoadExtActionId(),
      new LoadExtHandler(this.operationSerializer, this.mountManager)
    );

    // Step 4: Invoke factory (try/finally for rollback + ctx invalidation).
    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-compose-domain
    let implementation;
    try {
      implementation = factory.build(ctx);
    } catch (error) {
      // Atomic rollback: clear any partially-registered handlers and remove domain.
      ctx.clearCollectedHandlers();
      this.extensionManager.unregisterDomain(declaration.id).catch(() => { /* best-effort */ });
      throw error;
    } finally {
      // Function-handle-level invalidation: after build() returns (or throws),
      // any subsequent access to ctx.mounter / ctx.lifecycleTrigger / ctx.registerHandler
      // — including captured function handles — throws.
      ctx.invalidate();
    }
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-compose-domain

    // Step 5: Cross-validate handlers vs declaration AND strategy/cardinality matrix.
    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-cardinality-check
    // @cpt-begin:cpt-frontx-state-extension-domain-governance-cardinality:p2:inst-card-t1
    try {
      this.crossValidateHandlers(declaration, implementation._getMountStrategiesInternal(), ctx);
    } catch (error) {
      // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-cardinality-fail-check
      // @cpt-begin:cpt-frontx-state-extension-domain-governance-cardinality:p2:inst-card-t2
      ctx.clearCollectedHandlers();
      this.extensionManager.unregisterDomain(declaration.id).catch(() => { /* best-effort */ });
      // @cpt-end:cpt-frontx-state-extension-domain-governance-cardinality:p2:inst-card-t2
      // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-cardinality-fail-check
      // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-cardinality-reject
      // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-reg-fail
      throw error;
      // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-reg-fail
      // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-cardinality-reject
    }
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-cardinality-check

    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-registered
    // @cpt-begin:cpt-frontx-state-extension-domain-governance-cardinality:p2:inst-card-t3
    // Step 6: Persist handlers to mediator.
    for (const [actionType, handler] of ctx.getCollectedHandlers()) {
      this.mediator.registerHandler(declaration.id, actionType, handler);
    }

    // Step 7: Persist domain implementation references.
    this.extensionManager.setDomainImplementation(
      declaration.id,
      mounter,
      lifecycleTrigger,
      implementation
    );

    // Step 8: Fire-and-forget 'init' lifecycle stage (errors logged to console.error).
    // Resolve the stage ID through the injected plugin so the runtime never
    // spells a concrete type-format literal for this concept (issue #505,
    // MFES-1 / inst-resolve-lifecycle-stage-init).
    this.triggerDomainOwnLifecycleStageInternal(
      declaration.id,
      this.typeSystem.resolveLifecycleStageInitId()
    ).catch(error => {
      console.error('[DefaultMfeRegistry] Domain init error:', error, { domainId: declaration.id });
    });
    // @cpt-end:cpt-frontx-state-extension-domain-governance-cardinality:p2:inst-card-t3
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-registered
    // @cpt-end:cpt-frontx-state-extension-domain-governance-cardinality:p2:inst-card-t1
  }

  /**
   * Cross-validate handlers vs declaration AND strategy/cardinality matrix.
   *
   * @throws {Error} on any violation.
   */
  // @cpt-algo:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1
  // @cpt-state:cpt-frontx-state-extension-domain-governance-cardinality:p2
  // @cpt-dod:cpt-frontx-dod-extension-domain-governance-cardinality-enforcement:p1
  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-identify-strategy
  private crossValidateHandlers(
    declaration: ExtensionDomain,
    strategies: import('./mount-strategy').MountStrategy[],
    ctx: InvalidatableDomainContext
  ): void {
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-no-strategy-reject
    if (strategies.length === 0) {
      throw new Error(
        `Domain '${declaration.id}': domain implementation must capture at least one MountStrategy instance.`
      );
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-no-strategy-reject

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-first-strategy-representative
    // Use the first strategy as the representative — mixed-strategy domains are not supported.
    const strategy = strategies[0];
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-first-strategy-representative
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-identify-strategy

    // Identify strategy class and look up cardinality row.
    let requireMount: boolean;
    let requireUnmount: boolean;
    let forbidUnmount: boolean;
    let strategyName: string;

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-match-strategy
    if (strategy instanceof ConcurrentMountStrategy) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-concurrent-row
      strategyName = 'ConcurrentMountStrategy';
      requireMount = true;
      requireUnmount = true;
      forbidUnmount = false;
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-concurrent-row
    } else if (strategy instanceof OptionalMountStrategy) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-optional-row
      strategyName = 'OptionalMountStrategy';
      requireMount = true;
      requireUnmount = true;
      forbidUnmount = false;
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-optional-row
    } else if (strategy instanceof ExclusiveMountStrategy) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-exclusive-row
      strategyName = 'ExclusiveMountStrategy';
      requireMount = true;
      requireUnmount = false;
      forbidUnmount = true;
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-exclusive-row
    } else {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-unknown-reject
      throw new Error(
        `Domain '${declaration.id}': unrecognized MountStrategy class. ` +
        'The cardinality matrix only handles ConcurrentMountStrategy, OptionalMountStrategy, and ExclusiveMountStrategy. ' +
        'Custom strategy classes are not supported (per ADR-0009).'
      );
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-unknown-reject
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-match-strategy

    const declaredActions = declaration.actions;

    // Resolve the framework's well-known lifecycle action IDs through the
    // injected plugin — the runtime never spells a concrete type-format
    // literal for these concepts (MFES-1).
    const mountExtActionId = this.typeSystem.resolveMountExtActionId();
    const unmountExtActionId = this.typeSystem.resolveUnmountExtActionId();

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-required-check-loop
    // Enforce REQUIRED actions in declaration.
    // Non-string entries are treated as non-matching (F-009 hardening) rather than
    // letting typeSystem.isTypeOf throw on a malformed declaredActions entry.
    const hasMountExtOrDerivative = declaredActions.some(
      (id) => typeof id === 'string' && this.typeSystem.isTypeOf(id, mountExtActionId)
    );
    const hasUnmountExtOrDerivative = declaredActions.some(
      (id) => typeof id === 'string' && this.typeSystem.isTypeOf(id, unmountExtActionId)
    );
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-missing-required
    if (requireMount && !hasMountExtOrDerivative) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-required-fail
      throw new Error(
        `Domain '${declaration.id}': ${strategyName} requires '${mountExtActionId}' in declaration.actions.`
      );
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-required-fail
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-missing-required
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-missing-required
    if (requireUnmount && !hasUnmountExtOrDerivative) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-required-fail
      throw new Error(
        `Domain '${declaration.id}': ${strategyName} requires '${unmountExtActionId}' in declaration.actions.`
      );
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-required-fail
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-missing-required
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-required-check-loop

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-forbidden-check-loop
    // Enforce FORBIDDEN actions in declaration.
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-forbidden-present
    if (forbidUnmount && hasUnmountExtOrDerivative) {
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-forbidden-present
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-forbidden-fail
      // Name the actual declared action that triggered the violation (may be a
      // hierarchy-derived id, not necessarily the plugin-resolved base id) for debuggability.
      const offendingAction = declaredActions.find(
        (id) => typeof id === 'string' && this.typeSystem.isTypeOf(id, unmountExtActionId)
      );
      throw new Error(
        `Domain '${declaration.id}': ${strategyName} forbids '${unmountExtActionId}' in declaration.actions, ` +
        `but declared action '${String(offendingAction)}' violates this rule.`
      );
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-forbidden-fail
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-forbidden-check-loop

    const collectedHandlers = ctx.getCollectedHandlers();

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-required-loop
    // Every action in declaration.actions must have a handler.
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-missing-check
    for (const actionType of declaredActions) {
      if (!collectedHandlers.has(actionType)) {
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-missing-check
        // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-missing-fail
        throw new Error(
          `Domain '${declaration.id}': declaration lists '${actionType}' but no handler was registered via ctx.registerHandler.`
        );
        // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-missing-fail
      }
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-required-loop

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-extra-loop
    // Every handler registered via ctx.registerHandler must be in
    // declaration.actions. Per the spec (inst-enforce-no-extra-handlers), this
    // check is scoped to handlers REGISTERED by the factory, not handlers
    // PREPOPULATED by the registry itself (e.g., the plugin-resolved 'load_ext'
    // action id supplied by LoadExtHandler injection). The registry-supplied handlers are infrastructure
    // and need not appear in declaration.actions for every domain.
    const prepopulated = ctx.getPrepopulatedActionTypes();
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-extra-check
    for (const [actionType] of collectedHandlers) {
      if (prepopulated.has(actionType)) continue;
      if (!declaredActions.includes(actionType)) {
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-extra-check
        // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-extra-fail
        throw new Error(
          `Domain '${declaration.id}': handler registered for '${actionType}' but '${actionType}' is not declared in declaration.actions.`
        );
        // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-extra-fail
      }
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-extra-loop
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-accept
    // domain accepted — strategy registered as mount executor (implicit; execution continues in registerDomain)
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-accept
  }

  // ─── Execute actions chain ────────────────────────────────────────────────

  // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-mount-action
  async executeActionsChain(chain: ActionsChain): Promise<void> {
    const result = await this.mediator.executeActionsChain(chain);
    if (!result.completed) {
      console.error(
        `[MfeRegistry] Actions chain failed:`,
        result.error ?? 'unknown error',
        `| path: [${result.path.join(' -> ')}]`
      );
    }
    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-admitted-mount
    // (mount strategy invoked via mediator dispatch chain → strategy.mount())
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-admitted-mount
    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-mount-success
    // (implicit: chain.completed = true on success path)
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-mount-success
  }
  // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-mount-action

  // ─── Shared property ──────────────────────────────────────────────────────

  updateSharedProperty(propertyId: string, value: unknown): void {
    this.extensionManager.updateSharedProperty(propertyId, value);
  }

  getDomainProperty(domainId: string, propertyTypeId: string): unknown {
    return this.extensionManager.getDomainProperty(domainId, propertyTypeId);
  }

  // ─── Query ────────────────────────────────────────────────────────────────

  /**
   * Get the insertion-ordered list of currently-mounted extension IDs for a domain.
   */
  getMountedExtensions(domainId: string): readonly string[] {
    return this.extensionManager.getMountedExtensions(domainId);
  }

  /**
   * Returns the per-domain `ExtensionMounter` instance.
   * Called by the React `ExtensionDomainSlot` to call attach/detach.
   *
   * @throws {Error} if domain is not registered.
   */
  getMounter(domainId: string): ExtensionMounter {
    const state = this.extensionManager.getDomainState(domainId);
    if (!state || !state.mounter) {
      throw new Error(
        `getMounter: domain '${domainId}' is not registered or has no mounter. ` +
        'Call registerDomain before accessing the mounter.'
      );
    }
    return state.mounter;
  }

  getParentBridge(extensionId: string): ParentMfeBridge | null {
    return this.extensionManager.getExtensionState(extensionId)?.bridge ?? null;
  }

  // @cpt-flow:cpt-frontx-flow-mfe-registry-register-validate-mount:p1
  // @cpt-algo:cpt-frontx-algo-mfe-registry-register-extension:p2
  async registerExtension(extension: Extension): Promise<void> {
    return this.operationSerializer.serializeOperation(extension.id, async () => {
      // @cpt-begin:cpt-frontx-flow-mfe-registry-register-validate-mount:p1:inst-flow-rvm-05
      // Developer-invoked registration of an Extension value: delegates entry
      // type-validation, handler resolution, and entry storage to the manager.
      await this.extensionManager.registerExtension(extension);
      // @cpt-end:cpt-frontx-flow-mfe-registry-register-validate-mount:p1:inst-flow-rvm-05

      try {
        // @cpt-begin:cpt-frontx-algo-mfe-registry-register-extension:p2:inst-algo-re-05
        // Store the admitted extension in the registry's internal map keyed by id.
        const packageId = extractGtsPackage(extension.id);
        if (!this.packages.has(packageId)) {
          this.packages.set(packageId, new Set<string>());
        }
        this.packages.get(packageId)!.add(extension.id);
        // @cpt-end:cpt-frontx-algo-mfe-registry-register-extension:p2:inst-algo-re-05
      } catch {
        // Not a valid GTS ID — skip package tracking.
      }
    });
  }

  // @cpt-state:cpt-frontx-state-mfe-registry-entry-lifecycle:p2
  async unregisterExtension(extensionId: string): Promise<void> {
    return this.operationSerializer.serializeOperation(extensionId, async () => {
      // @cpt-begin:cpt-frontx-state-mfe-registry-entry-lifecycle:p2:inst-state-el-09
      // MOUNTED -> UNREGISTERED: extension is unmounted first, then removed.
      await this.extensionManager.unregisterExtension(extensionId);
      // @cpt-end:cpt-frontx-state-mfe-registry-entry-lifecycle:p2:inst-state-el-09

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
        // Not a valid GTS ID — no package tracking to clean up.
      }
    });
  }

  async unregisterDomain(domainId: string): Promise<void> {
    return this.operationSerializer.serializeOperation(domainId, async () => {
      this.mediator.unregisterAllHandlers(domainId);
      return this.extensionManager.unregisterDomain(domainId);
    });
  }

  getExtension(extensionId: string): Extension | undefined {
    return this.extensionManager.getExtensionState(extensionId)?.extension;
  }

  getDomain(domainId: string): ExtensionDomain | undefined {
    return this.extensionManager.getDomainState(domainId)?.domain;
  }

  getExtensionsForDomain(domainId: string): Extension[] {
    const extensionStates = this.extensionManager.getExtensionStatesForDomain(domainId);
    return extensionStates.map(state => state.extension);
  }

  getRegisteredPackages(): string[] {
    return Array.from(this.packages.keys());
  }

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

  /**
   * Get domain state for a registered domain.
   * INTERNAL: Used by ActionsChainsMediator for domain resolution.
   */
  getDomainState(domainId: string): ExtensionDomainState | undefined {
    return this.extensionManager.getDomainState(domainId);
  }

  setTheme(cssVars: Record<string, string>): void {
    this.mountManager.setTheme(cssVars);
  }

  dispose(): void {
    if (this.parentBridge) {
      this.parentBridge.dispose();
      this.parentBridge = null;
    }

    for (const bridge of this.childBridges.values()) {
      bridge.dispose();
    }
    this.childBridges.clear();

    this.extensionManager.clear();
    this.operationSerializer.clear();
    this.packages.clear();
    this.handlers.length = 0;

    void this.coordinator;
  }
}
