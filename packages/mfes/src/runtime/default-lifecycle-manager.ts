/**
 * DefaultLifecycleManager - Concrete Lifecycle Manager Implementation
 *
 * Default implementation of LifecycleManager.
 * Contains all business logic for triggering lifecycle stages and executing hooks.
 *
 * Non-blocking per `cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering`:
 * every trigger method dispatches its stage's matching hooks, in declaration
 * order, through the acceptance-only mediator surface WITHOUT awaiting any
 * of their settlement — the accompanying runtime transition proceeds
 * independently of this trigger's own return. A hook's synchronous refusal
 * is caught and reported through the substitutable diagnostic sink, then
 * the loop continues to the next hook; it is never fatal to the remaining
 * hooks or to the caller.
 *
 * @packageDocumentation
 * @internal
 */
// @cpt-dod:cpt-frontx-dod-mfe-registry-lifecycle-stage-triggering:p1

import type { ExtensionDomain, Extension } from '../types';
import { ActionsChainRefusalError } from '../errors';
import type { MfeDiagnosticSink } from './config';
import { invokeDiagnosticSinkSafely, tagDispatchOrigin } from '../mediator/dispatch-diagnostics';
import { DefaultExtensionManager } from './default-extension-manager';
import {
  LifecycleManager,
  type ActionChainExecutor,
} from './lifecycle-manager';

/**
 * Monotonic per-process correlation counter. A hook's refusal diagnostic
 * carries the resulting identity so multiple refusals reported from the
 * same stage trigger (or across stage triggers) can be told apart, without
 * requiring any random-id generator.
 */
let correlationSeq = 0;
function nextCorrelationId(): string {
  correlationSeq += 1;
  return `lst-${correlationSeq}`;
}

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
   * Acceptance-only chain dispatcher for lifecycle hook actions chains —
   * void, synchronously-refusing, never awaited here.
   */
  private readonly executeActionsChain: ActionChainExecutor;

  /**
   * Structured diagnostic sink a hook's synchronous dispatch refusal is
   * reported through.
   */
  private readonly diagnosticSink: MfeDiagnosticSink;

  constructor(
    extensionManager: DefaultExtensionManager,
    executeActionsChain: ActionChainExecutor,
    diagnosticSink: MfeDiagnosticSink
  ) {
    super();
    this.extensionManager = extensionManager;
    this.executeActionsChain = executeActionsChain;
    this.diagnosticSink = diagnosticSink;
  }

  /**
   * Trigger a lifecycle stage for a specific extension. Dispatches all
   * lifecycle hooks registered for the given stage, in declaration order,
   * without waiting for any of them to settle.
   *
   * @param extensionId - ID of the extension
   * @param stageId - ID of the lifecycle stage to trigger
   */
  triggerLifecycleStage(extensionId: string, stageId: string): void {
    const extensionState = this.extensionManager.getExtensionState(extensionId);
    if (!extensionState) {
      throw new Error(`Cannot trigger lifecycle stage: extension '${extensionId}' is not registered`);
    }

    this.triggerLifecycleStageInternal(extensionState.extension, 'extension', stageId);
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
      this.triggerLifecycleStageInternal(extensionState.extension, 'extension', stageId);
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

    this.triggerLifecycleStageInternal(domainState.domain, 'domain', stageId);
  }

  /**
   * Internal helper for triggering lifecycle stages.
   *
   * Collects hooks matching the stage and dispatches their actions chains,
   * synchronously, one per hook, in declaration order
   * (`inst-algo-lst-collect`, `inst-algo-lst-dispatch-order`). Declaration
   * order governs DISPATCH order only — completion order among a stage's
   * hooks is explicitly not guaranteed and this method makes no attempt to
   * observe it (`inst-algo-lst-no-completion-order`). A hook's synchronous
   * refusal is caught and reported through the diagnostic sink, then the
   * loop continues to the next hook (`inst-algo-lst-refusal-contained`).
   * Returns once every collected hook has been dispatched or its refusal
   * contained, without waiting for any dispatched chain to settle
   * (`inst-algo-lst-return-non-blocking`).
   *
   * @param entity - Extension or ExtensionDomain entity
   * @param entityKind - Whether `entity` is an extension or a domain
   * @param stageId - ID of the lifecycle stage to trigger
   * @private
   */
  private triggerLifecycleStageInternal(
    entity: Extension | ExtensionDomain,
    entityKind: 'extension' | 'domain',
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
    // Dispatch each hook's actions chain synchronously, in declaration
    // order — that order governs DISPATCH order only.
    // @cpt-begin:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-no-completion-order
    // Completion order among this stage's hooks is explicitly NOT
    // guaranteed and must not be assumed: each hook's chain settles on its
    // own executor-internal schedule, independent of this loop.
    // @cpt-end:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-no-completion-order
    for (let hookPosition = 0; hookPosition < hooks.length; hookPosition++) {
      const hook = hooks[hookPosition]!;
      // Tag the hook's own root action with this trigger's origin BEFORE
      // dispatch, so a node failure discovered later while the MEDIATOR
      // executes this chain — several hops or `next`/`fallback` steps away
      // — still attributes to this stage and entity in its own
      // `ChainNodeFailureDiagnostic` (`inst-diagnostic-record`). Read back
      // by `DefaultActionsChainsMediator.runAcceptedChain` via
      // `getDispatchOrigin`; irrelevant to a synchronous REFUSAL, which is
      // reported right below with its own, already-complete context.
      tagDispatchOrigin(hook.actions_chain.action, { entityKind, entityId: entity.id, stageId });
      try {
        this.executeActionsChain(hook.actions_chain);
      } catch (error) {
        // @cpt-begin:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-refusal-contained
        const refusalClass =
          error instanceof ActionsChainRefusalError ? error.refusalClass : 'unknown_refusal';
        // Contained (`invokeDiagnosticSinkSafely`): a host-supplied sink
        // that itself throws must never abort this stage's own transition —
        // it would, were this call left unguarded, since an uncaught throw
        // here would escape this `catch` block and propagate to whatever
        // triggered the transition this trigger accompanies.
        invokeDiagnosticSinkSafely(
          () =>
            this.diagnosticSink.reportLifecycleDispatchRefusal({
              classification: 'lifecycle-dispatch-refusal',
              entityKind,
              entityId: entity.id,
              stageId,
              hookPosition,
              actionType: hook.actions_chain.action.type,
              target: hook.actions_chain.action.target,
              refusalClass,
              correlationId: nextCorrelationId(),
              transitionContinued: true,
            }),
          "reporting a lifecycle hook's dispatch refusal"
        );
        // Contained: continue to the next hook rather than aborting the
        // stage's remaining dispatches or propagating to the caller.
        // @cpt-end:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-refusal-contained
      }
    }
    // @cpt-end:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-dispatch-order

    // @cpt-begin:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-return-non-blocking
    // Falls through to an implicit `return` here — every collected hook has
    // been dispatched or its refusal contained, and this method returns
    // without waiting for any dispatched chain to settle. The accompanying
    // runtime transition (the caller of `LifecycleTrigger`) proceeds
    // independently of this return.
    // @cpt-begin:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-chain-failure-is-executor-business
    // Once a hook's chain is accepted, its subsequent execution — including
    // failing or timing out — is handled entirely by the executor that runs
    // it (`DefaultActionsChainsMediator.runAcceptedChain`) and is never
    // reported back through this trigger.
    // @cpt-end:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-chain-failure-is-executor-business
    // @cpt-end:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-return-non-blocking
  }
}
