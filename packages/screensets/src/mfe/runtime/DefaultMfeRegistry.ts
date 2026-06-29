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
// @cpt-flow:cpt-frontx-flow-mfe-registry-register-domain:p1
// @cpt-flow:cpt-frontx-flow-mfe-registry-register-extension:p1
// @cpt-flow:cpt-frontx-flow-mfe-registry-unregister-extension:p1
// @cpt-flow:cpt-frontx-flow-mfe-registry-unregister-domain:p1
// @cpt-flow:cpt-frontx-flow-mfe-registry-execute-chain:p1
// @cpt-flow:cpt-frontx-flow-mfe-registry-update-shared-property:p1
// @cpt-flow:cpt-frontx-flow-mfe-registry-query:p2
// @cpt-algo:cpt-frontx-algo-mfe-registry-gts-package-discovery:p1
// @cpt-algo:cpt-frontx-algo-mfe-registry-handler-resolution:p1
// @cpt-algo:cpt-frontx-algo-mfe-registry-domain-implementation-construction:p1
// @cpt-algo:cpt-frontx-algo-mfe-registry-cross-validate-handlers:p1
// @cpt-dod:cpt-frontx-dod-mfe-registry-handler-injection:p1
// @cpt-dod:cpt-frontx-dod-mfe-registry-registry-contract:p1

import type { TypeSystemPlugin } from '../plugins/types';
import {
  MfeRegistry,
  type MfeRegistryConfig,
  type MfeHandler,
  type ParentMfeBridge,
  type ExtensionDomain,
  type Extension,
  type ActionsChain,
  type ExtensionDomainImplementationFactory,
  type ExtensionMounter,
  ActionsChainsMediator,
  RuntimeCoordinator,
  InvalidatableDomainContext,
  ConcurrentMountStrategy,
  OptionalMountStrategy,
  ExclusiveMountStrategy,
} from '@gears-frontx/mfes';
import { WeakMapRuntimeCoordinator } from '../coordination/weak-map-runtime-coordinator';
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
import { INFRASTRUCTURE_LIFECYCLE_ACTIONS } from '../validation/contract';
import { FRONTX_ACTION_LOAD_EXT, FRONTX_ACTION_MOUNT_EXT, FRONTX_ACTION_UNMOUNT_EXT } from '../constants';
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
      infrastructureActionTypes: INFRASTRUCTURE_LIFECYCLE_ACTIONS,
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
      this.handlers.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
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

  // @cpt-begin:cpt-frontx-algo-mfe-registry-handler-resolution:p1:inst-1
  private validateEntryType(entryTypeId: string): void {
    if (this.handlers.length === 0) {
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
  // @cpt-end:cpt-frontx-algo-mfe-registry-handler-resolution:p1:inst-1

  private resolveHandler(entryTypeId: string): MfeHandler | undefined {
    return this.handlers.find(handler =>
      this.typeSystem.isTypeOf(entryTypeId, handler.handledBaseTypeId)
    );
  }

  // ─── registerDomain ───────────────────────────────────────────────────────

  /**
   * Register an extension domain.
   */
  // @cpt-begin:cpt-frontx-flow-mfe-registry-register-domain:p1:inst-1
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
    const ctx = new InvalidatableDomainContext(mounter, lifecycleTrigger);
    ctx.prepopulateHandler(
      FRONTX_ACTION_LOAD_EXT,
      new LoadExtHandler(this.operationSerializer, this.mountManager)
    );

    // Step 4: Invoke factory (try/finally for rollback + ctx invalidation).
    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-compose-domain
    // @cpt-begin:cpt-frontx-algo-mfe-registry-domain-implementation-construction:p1:inst-1
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
    // @cpt-end:cpt-frontx-algo-mfe-registry-domain-implementation-construction:p1:inst-1
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
    this.triggerDomainOwnLifecycleStageInternal(
      declaration.id,
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1'
    ).catch(error => {
      console.error('[DefaultMfeRegistry] Domain init error:', error, { domainId: declaration.id });
    });
    // @cpt-end:cpt-frontx-state-extension-domain-governance-cardinality:p2:inst-card-t3
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-registered
    // @cpt-end:cpt-frontx-state-extension-domain-governance-cardinality:p2:inst-card-t1
  }
  // @cpt-end:cpt-frontx-flow-mfe-registry-register-domain:p1:inst-1

  /**
   * Cross-validate handlers vs declaration AND strategy/cardinality matrix.
   *
   * @throws {Error} on any violation.
   */
  // @cpt-algo:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1
  // @cpt-state:cpt-frontx-state-extension-domain-governance-cardinality:p2
  // @cpt-dod:cpt-frontx-dod-extension-domain-governance-cardinality-enforcement:p1
  // @cpt-begin:cpt-frontx-algo-mfe-registry-cross-validate-handlers:p1:inst-1
  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-identify-strategy
  private crossValidateHandlers(
    declaration: ExtensionDomain,
    strategies: import('./mount-strategy').MountStrategy[],
    ctx: InvalidatableDomainContext
  ): void {
    if (strategies.length === 0) {
      throw new Error(
        `Domain '${declaration.id}': domain implementation must capture at least one MountStrategy instance.`
      );
    }

    // Use the first strategy as the representative — mixed-strategy domains are not supported.
    const strategy = strategies[0];
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
        'Custom strategy classes are not supported (per ADR-0020).'
      );
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-unknown-reject
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-match-strategy

    const declaredActions = declaration.actions;

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-required-check-loop
    // Enforce REQUIRED actions in declaration.
    if (requireMount && !declaredActions.includes(FRONTX_ACTION_MOUNT_EXT)) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-missing-required
      throw new Error(
        `Domain '${declaration.id}': ${strategyName} requires '${FRONTX_ACTION_MOUNT_EXT}' in declaration.actions.`
      );
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-missing-required
    }
    if (requireUnmount && !declaredActions.includes(FRONTX_ACTION_UNMOUNT_EXT)) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-required-fail
      throw new Error(
        `Domain '${declaration.id}': ${strategyName} requires '${FRONTX_ACTION_UNMOUNT_EXT}' in declaration.actions.`
      );
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-required-fail
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-required-check-loop

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-forbidden-check-loop
    // Enforce FORBIDDEN actions in declaration.
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-forbidden-present
    if (forbidUnmount && declaredActions.includes(FRONTX_ACTION_UNMOUNT_EXT)) {
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-forbidden-present
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-forbidden-fail
      throw new Error(
        `Domain '${declaration.id}': ${strategyName} forbids '${FRONTX_ACTION_UNMOUNT_EXT}' in declaration.actions.`
      );
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-forbidden-fail
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-forbidden-check-loop

    const collectedHandlers = ctx.getCollectedHandlers();

    // Every action in declaration.actions must have a handler.
    for (const actionType of declaredActions) {
      if (!collectedHandlers.has(actionType)) {
        throw new Error(
          `Domain '${declaration.id}': declaration lists '${actionType}' but no handler was registered via ctx.registerHandler.`
        );
      }
    }

    // Every handler registered via ctx.registerHandler must be in
    // declaration.actions. Per the spec (inst-enforce-no-extra-handlers), this
    // check is scoped to handlers REGISTERED by the factory, not handlers
    // PREPOPULATED by the registry itself (e.g., FRONTX_ACTION_LOAD_EXT supplied
    // by LoadExtHandler injection). The registry-supplied handlers are infrastructure
    // and need not appear in declaration.actions for every domain.
    const prepopulated = ctx.getPrepopulatedActionTypes();
    for (const [actionType] of collectedHandlers) {
      if (prepopulated.has(actionType)) continue;
      if (!declaredActions.includes(actionType)) {
        throw new Error(
          `Domain '${declaration.id}': handler registered for '${actionType}' but '${actionType}' is not declared in declaration.actions.`
        );
      }
    }
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-accept
    // domain accepted — strategy registered as mount executor (implicit; execution continues in registerDomain)
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-accept
  }
  // @cpt-end:cpt-frontx-algo-mfe-registry-cross-validate-handlers:p1:inst-1

  // ─── Execute actions chain ────────────────────────────────────────────────

  // @cpt-begin:cpt-frontx-flow-mfe-registry-execute-chain:p1:inst-1
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
  // @cpt-end:cpt-frontx-flow-mfe-registry-execute-chain:p1:inst-1

  // ─── Shared property ──────────────────────────────────────────────────────

  // @cpt-begin:cpt-frontx-flow-mfe-registry-update-shared-property:p1:inst-1
  updateSharedProperty(propertyId: string, value: unknown): void {
    this.extensionManager.updateSharedProperty(propertyId, value);
  }
  // @cpt-end:cpt-frontx-flow-mfe-registry-update-shared-property:p1:inst-1

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

  // @cpt-begin:cpt-frontx-flow-mfe-registry-register-extension:p1:inst-1
  // @cpt-begin:cpt-frontx-algo-mfe-registry-gts-package-discovery:p1:inst-1
  async registerExtension(extension: Extension): Promise<void> {
    return this.operationSerializer.serializeOperation(extension.id, async () => {
      await this.extensionManager.registerExtension(extension);

      try {
        const packageId = extractGtsPackage(extension.id);
        if (!this.packages.has(packageId)) {
          this.packages.set(packageId, new Set<string>());
        }
        this.packages.get(packageId)!.add(extension.id);
      } catch {
        // Not a valid GTS ID — skip package tracking.
      }
    });
  }
  // @cpt-end:cpt-frontx-flow-mfe-registry-register-extension:p1:inst-1
  // @cpt-end:cpt-frontx-algo-mfe-registry-gts-package-discovery:p1:inst-1

  // @cpt-begin:cpt-frontx-flow-mfe-registry-unregister-extension:p1:inst-1
  async unregisterExtension(extensionId: string): Promise<void> {
    return this.operationSerializer.serializeOperation(extensionId, async () => {
      await this.extensionManager.unregisterExtension(extensionId);

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
  // @cpt-end:cpt-frontx-flow-mfe-registry-unregister-extension:p1:inst-1

  // @cpt-begin:cpt-frontx-flow-mfe-registry-unregister-domain:p1:inst-1
  async unregisterDomain(domainId: string): Promise<void> {
    return this.operationSerializer.serializeOperation(domainId, async () => {
      this.mediator.unregisterAllHandlers(domainId);
      return this.extensionManager.unregisterDomain(domainId);
    });
  }
  // @cpt-end:cpt-frontx-flow-mfe-registry-unregister-domain:p1:inst-1

  // @cpt-begin:cpt-frontx-flow-mfe-registry-query:p2:inst-1
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
  // @cpt-end:cpt-frontx-flow-mfe-registry-query:p2:inst-1

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
