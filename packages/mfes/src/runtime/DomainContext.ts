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

import type { ExtensionMounter } from './ExtensionMounter';
import type { DomainLifecycleTrigger } from './DomainLifecycleTrigger';
import type { ActionHandler } from '../mediator/ActionHandler';
import type { TypeSystemPlugin } from '../type-substrate';

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
   * The injected type-system plugin. Use `typeSystem.resolveMountExtActionId()`
   * / `resolveUnmountExtActionId()` / `resolveLoadExtActionId()` to obtain the
   * framework's well-known lifecycle action IDs in the active plugin's own
   * notation — domain authors never import a concrete type-format literal.
   * Does not throw after invalidation (read-only reference, not a mutator).
   */
  readonly typeSystem: TypeSystemPlugin;

  /**
   * Register an `ActionHandler` for the given action type in this domain.
   *
   * Called inside `factory.build(ctx)` for each action type the domain handles.
   * Throws after `registerDomain` returns.
   *
   * @param actionType - The action type ID, e.g. `ctx.typeSystem.resolveMountExtActionId()`.
   * @param handler - `ActionHandler` instance to invoke when the action fires.
   */
  registerHandler(actionType: string, handler: ActionHandler): void;
}
