/**
 * DefaultLifecycleManager - Concrete Lifecycle Manager Implementation
 *
 * Default implementation of LifecycleManager.
 * Contains all business logic for triggering lifecycle stages and executing hooks.
 *
 * Non-blocking per `cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering`:
 * every trigger method hands its stage's matching hooks' chains, in
 * declaration order, to `executeActionsChain` without awaiting any of them;
 * the accompanying runtime transition proceeds independently of this
 * trigger's return.
 *
 * @packageDocumentation
 * @internal
 */
// @cpt-dod:cpt-frontx-dod-mfe-registry-lifecycle-stage-triggering:p1

import type { ExtensionDomain, Extension } from '../types';
import { DefaultExtensionManager } from './DefaultExtensionManager';
import {
  LifecycleManager,
  type ActionChainExecutor,
} from './LifecycleManager';

/**
 * Default lifecycle manager implementation.
 *
 * Manages lifecycle stage triggering for extensions and domains.
 *
 * @internal
 */
export class DefaultLifecycleManager extends LifecycleManager {
  /**
   * Extension manager for accessing extension and domain state.
   */
  private readonly extensionManager: DefaultExtensionManager;

  /**
   * The registry's `executeActionsChain`, which each hook's chain is handed to.
   */
  private readonly executeActionsChain: ActionChainExecutor;

  constructor(
    extensionManager: DefaultExtensionManager,
    executeActionsChain: ActionChainExecutor
  ) {
    super();
    this.extensionManager = extensionManager;
    this.executeActionsChain = executeActionsChain;
  }

  /**
   * Trigger a lifecycle stage for a specific extension. Hands the chain of
   * every hook registered for the given stage, in declaration order, to
   * `executeActionsChain` without awaiting it.
   *
   * @param extensionId - ID of the extension
   * @param stageId - ID of the lifecycle stage to trigger
   */
  triggerLifecycleStage(extensionId: string, stageId: string): void {
    const extensionState = this.extensionManager.getExtensionState(extensionId);
    if (!extensionState) {
      throw new Error(`Cannot trigger lifecycle stage: extension '${extensionId}' is not registered`);
    }

    this.triggerLifecycleStageInternal(extensionState.extension, stageId);
  }

  /**
   * Trigger a lifecycle stage for all extensions in a domain.
   * Useful for custom stages like "refresh" that affect all widgets.
   *
   * @param domainId - ID of the domain
   * @param stageId - ID of the lifecycle stage to trigger
   */
  triggerDomainLifecycleStage(domainId: string, stageId: string): void {
    const domainState = this.extensionManager.getDomainState(domainId);
    if (!domainState) {
      throw new Error(`Cannot trigger lifecycle stage: domain '${domainId}' is not registered`);
    }

    const extensionStates = this.extensionManager.getExtensionStatesForDomain(domainId);
    for (const extensionState of extensionStates) {
      this.triggerLifecycleStageInternal(extensionState.extension, stageId);
    }
  }

  /**
   * Trigger a lifecycle stage for a domain itself.
   * Executes hooks registered on the domain entity.
   *
   * @param domainId - ID of the domain
   * @param stageId - ID of the lifecycle stage to trigger
   */
  triggerDomainOwnLifecycleStage(domainId: string, stageId: string): void {
    const domainState = this.extensionManager.getDomainState(domainId);
    if (!domainState) {
      throw new Error(`Cannot trigger lifecycle stage: domain '${domainId}' is not registered`);
    }

    this.triggerLifecycleStageInternal(domainState.domain, stageId);
  }

  /**
   * Internal helper for triggering lifecycle stages.
   *
   * Collects hooks matching the stage and hands their actions chains, one
   * per hook, in declaration order, to `executeActionsChain` without
   * awaiting any of them (`inst-algo-lst-collect`,
   * `inst-algo-lst-dispatch-order`). Declaration order governs dispatch
   * order only (`inst-algo-lst-no-completion-order`). Returns once every
   * collected hook's chain has been handed over
   * (`inst-algo-lst-return-non-blocking`).
   *
   * @param entity - Extension or ExtensionDomain entity
   * @param stageId - ID of the lifecycle stage to trigger
   * @private
   */
  private triggerLifecycleStageInternal(
    entity: Extension | ExtensionDomain,
    stageId: string
  ): void {
    if (!entity.lifecycle) {
      return; // No hooks to execute
    }

    // @cpt-begin:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-collect
    // Collect hooks matching the stage, in declaration order.
    const hooks = entity.lifecycle.filter(hook => hook.stage === stageId);
    if (hooks.length === 0) {
      return; // No hooks for this stage
    }
    // @cpt-end:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-collect

    // @cpt-begin:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-dispatch-order
    // @cpt-begin:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-no-completion-order
    // Declaration order governs dispatch order only; completion order among
    // this stage's hooks is not guaranteed.
    // @cpt-end:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-no-completion-order
    for (const hook of hooks) {
      this.executeActionsChain(hook.actions_chain);
    }
    // @cpt-end:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-dispatch-order

    // @cpt-begin:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-return-non-blocking
    return;
    // @cpt-end:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-return-non-blocking
  }
}
