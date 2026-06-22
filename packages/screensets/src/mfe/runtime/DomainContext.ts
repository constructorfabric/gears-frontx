/**
 * DomainContext - Construction-time context for domain implementation factories
 *
 * Exposes the per-domain mounter, lifecycle trigger, and handler registration
 * entry point. Mechanically invalidated by the registry in a `finally` block
 * once `factory.build(ctx)` returns or throws.
 *
 * `InvalidatableDomainContext` is the concrete class used by the registry.
 * Domain authors see only the `DomainContext` interface.
 *
 * @packageDocumentation
 */
// @cpt-FEATURE:cpt-frontx-feature-mfe-registry:p2
// @cpt-dod:cpt-frontx-dod-mfe-registry-mount-contracts:p1
// @cpt-algo:cpt-frontx-algo-mfe-registry-domain-implementation-construction:p1

import type { ExtensionMounter } from './ExtensionMounter';
import type { DomainLifecycleTrigger } from './DomainLifecycleTrigger';
import type { ActionHandler } from '../mediator/types';

/**
 * Construction-time context exposed to `ExtensionDomainImplementationFactory.build`.
 *
 * All three members throw once the registry invalidates the context
 * (i.e., after `build` returns or throws). This is enforced at the
 * function-handle level: references to `ctx.mounter`, `ctx.lifecycleTrigger`,
 * or `ctx.registerHandler` captured in the implementation's closure also
 * throw after invalidation.
 *
 * References captured by strategies (which store the mounter as a bound
 * class field set directly in their constructor, not via `ctx`) survive
 * invalidation.
 */
// @cpt-begin:cpt-frontx-dod-mfe-registry-mount-contracts:p1:inst-domain-context
export interface DomainContext {
  /**
   * The per-domain mount facade for this domain.
   * Strategies capture this privately at construction.
   * Throws after `registerDomain` returns.
   */
  readonly mounter: ExtensionMounter;

  /**
   * The per-domain lifecycle trigger for this domain.
   * Implementations may capture this to fire lifecycle transitions.
   * Throws after `registerDomain` returns.
   */
  readonly lifecycleTrigger: DomainLifecycleTrigger;

  /**
   * Register an `ActionHandler` for the given action type in this domain.
   *
   * Called inside `factory.build(ctx)` for each action type the domain handles.
   * Throws after `registerDomain` returns.
   *
   * @param actionType - GTS action type ID (e.g., `FRONTX_ACTION_MOUNT_EXT`).
   * @param handler - `ActionHandler` instance to invoke when the action fires.
   */
  registerHandler(actionType: string, handler: ActionHandler): void;
}
// @cpt-end:cpt-frontx-dod-mfe-registry-mount-contracts:p1:inst-domain-context


/**
 * Concrete invalidatable implementation of `DomainContext`.
 *
 * Used by `DefaultMfeRegistry` to enforce function-handle-level
 * invalidation after `factory.build` completes. The `valid` flag is
 * consulted on every accessor and method call; once `invalidate()` is
 * called, all access throws.
 *
 * The collected handlers are retrieved via `getCollectedHandlers()` and
 * cleared atomically on rollback via `clearCollectedHandlers()`.
 *
 * @internal
 */
export class InvalidatableDomainContext implements DomainContext {
  // @cpt-begin:cpt-frontx-algo-mfe-registry-domain-implementation-construction:p1:inst-init-collector
  private valid: boolean = true;
  private readonly collectedHandlers = new Map<string, ActionHandler>();
  // Action types prepopulated by the registry (e.g., LoadExtHandler) — excluded
  // from cross-validation's "no extra handlers" check since the spec restricts
  // that check to handlers registered via `ctx.registerHandler`.
  private readonly prepopulatedActionTypes = new Set<string>();
  // @cpt-end:cpt-frontx-algo-mfe-registry-domain-implementation-construction:p1:inst-init-collector

  constructor(
    private readonly _mounter: ExtensionMounter,
    private readonly _lifecycleTrigger: DomainLifecycleTrigger
  ) {}

  // @cpt-begin:cpt-frontx-algo-mfe-registry-domain-implementation-construction:p1:inst-build-context-mounter
  get mounter(): ExtensionMounter {
    if (!this.valid) {
      throw new Error('DomainContext invalidated after registration');
    }
    return this._mounter;
  }
  // @cpt-end:cpt-frontx-algo-mfe-registry-domain-implementation-construction:p1:inst-build-context-mounter

  // @cpt-begin:cpt-frontx-algo-mfe-registry-domain-implementation-construction:p1:inst-build-context-trigger
  get lifecycleTrigger(): DomainLifecycleTrigger {
    if (!this.valid) {
      throw new Error('DomainContext invalidated after registration');
    }
    return this._lifecycleTrigger;
  }
  // @cpt-end:cpt-frontx-algo-mfe-registry-domain-implementation-construction:p1:inst-build-context-trigger

  // @cpt-begin:cpt-frontx-algo-mfe-registry-domain-implementation-construction:p1:inst-build-context-register
  registerHandler(actionType: string, handler: ActionHandler): void {
    if (!this.valid) {
      throw new Error('DomainContext.registerHandler called after registration');
    }
    this.collectedHandlers.set(actionType, handler);
  }
  // @cpt-end:cpt-frontx-algo-mfe-registry-domain-implementation-construction:p1:inst-build-context-register

  /**
   * Pre-populate a handler in the collector without requiring context validity.
   * Used by the registry to inject the standard `LoadExtHandler` before
   * calling `factory.build(ctx)`. Prepopulated handlers are tracked separately
   * so cross-validation can exclude them from the "no extra handlers" check.
   */
  prepopulateHandler(actionType: string, handler: ActionHandler): void {
    this.collectedHandlers.set(actionType, handler);
    this.prepopulatedActionTypes.add(actionType);
  }

  /**
   * Return the set of action types that were prepopulated by the registry
   * (vs. registered by the domain factory via `registerHandler`).
   */
  getPrepopulatedActionTypes(): ReadonlySet<string> {
    return this.prepopulatedActionTypes;
  }

  // @cpt-begin:cpt-frontx-algo-mfe-registry-domain-implementation-construction:p1:inst-invalidate-context
  /**
   * Mark the context as invalid. All subsequent accessor and method calls throw.
   * Called by the registry in the `finally` block after `factory.build`.
   */
  invalidate(): void {
    this.valid = false;
  }
  // @cpt-end:cpt-frontx-algo-mfe-registry-domain-implementation-construction:p1:inst-invalidate-context

  // @cpt-begin:cpt-frontx-algo-mfe-registry-domain-implementation-construction:p1:inst-get-handlers
  /**
   * Return the handlers collected during `factory.build(ctx)`.
   * Called by the registry to persist them to the mediator.
   */
  getCollectedHandlers(): Map<string, ActionHandler> {
    return this.collectedHandlers;
  }
  // @cpt-end:cpt-frontx-algo-mfe-registry-domain-implementation-construction:p1:inst-get-handlers

  // @cpt-begin:cpt-frontx-algo-mfe-registry-domain-implementation-construction:p1:inst-clear-handlers
  /**
   * Clear all collected handlers. Called on atomic rollback when
   * `factory.build` throws or cross-validation fails.
   */
  clearCollectedHandlers(): void {
    this.collectedHandlers.clear();
    this.prepopulatedActionTypes.clear();
  }
  // @cpt-end:cpt-frontx-algo-mfe-registry-domain-implementation-construction:p1:inst-clear-handlers
}

