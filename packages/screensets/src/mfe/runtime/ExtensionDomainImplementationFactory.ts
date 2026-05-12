/**
 * ExtensionDomainImplementationFactory - Abstract synchronous factory
 *
 * Domain authors write a concrete subclass and pass it to
 * `registry.registerDomain(declaration, factory)`. The registry calls
 * `factory.build(ctx)` synchronously, captures the implementation, and
 * immediately invalidates `ctx`.
 *
 * The synchronous return type enforces synchronous construction at the type
 * level — `async build` methods are rejected at compile time because
 * `Promise<ExtensionDomainImplementation>` is not assignable to
 * `ExtensionDomainImplementation`.
 *
 * @packageDocumentation
 */
// @cpt-FEATURE:cpt-frontx-feature-mfe-registry:p2
// @cpt-dod:cpt-frontx-dod-mfe-registry-mount-contracts:p1

import type { DomainContext } from './DomainContext';
import type { ExtensionDomainImplementation } from './ExtensionDomainImplementation';

/**
 * Abstract factory for constructing a per-domain `ExtensionDomainImplementation`.
 *
 * Domain authors subclass this and implement `build(ctx)`. Inside `build`:
 * - Instantiate one or more shipped strategy classes
 *   (`ConcurrentMountStrategy`, `OptionalMountStrategy`, `ExclusiveMountStrategy`)
 * - Register per-action-type `ActionHandler` instances via `ctx.registerHandler`
 * - Capture the strategy and lifecycle trigger privately on the implementation
 *
 * After `build` returns, the registry invalidates `ctx`. Any reference to
 * `ctx.mounter`, `ctx.lifecycleTrigger`, or `ctx.registerHandler` held
 * outside the strategy's constructor will throw on next access.
 *
 * @example
 * ```typescript
 * class WidgetsDomainFactory extends ExtensionDomainImplementationFactory {
 *   build(ctx: DomainContext): ExtensionDomainImplementation {
 *     return new WidgetsDomainImpl(ctx, new DefaultContainerHooks());
 *   }
 * }
 *
 * registry.registerDomain(widgetsDomain, new WidgetsDomainFactory());
 * ```
 */
// @cpt-begin:cpt-frontx-dod-mfe-registry-mount-contracts:p1:inst-factory
export abstract class ExtensionDomainImplementationFactory {
  /**
   * Build the domain implementation synchronously.
   *
   * @param ctx - Construction-time context carrying the per-domain mounter,
   *   lifecycle trigger, and `registerHandler` entry point. Valid only for
   *   the duration of this call; the registry invalidates it in a `finally`
   *   block once `build` returns or throws.
   * @returns Concrete `ExtensionDomainImplementation` instance.
   */
  abstract build(ctx: DomainContext): ExtensionDomainImplementation;
}
// @cpt-end:cpt-frontx-dod-mfe-registry-mount-contracts:p1:inst-factory
