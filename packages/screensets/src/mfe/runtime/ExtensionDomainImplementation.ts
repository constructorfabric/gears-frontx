/**
 * ExtensionDomainImplementation - Abstract domain behavior class
 *
 * The pure-behavior domain implementation. Constructed by a factory via
 * `ExtensionDomainImplementationFactory.build(ctx)`. Captures strategies
 * privately at construction time via `DomainContext.registerHandler`.
 *
 * The registry calls `getMountStrategies()` after construction for
 * cross-validation — this is the only method exposed upward to the registry
 * to allow handler/strategy cardinality enforcement without breaking
 * encapsulation.
 *
 * @packageDocumentation
 */
// @cpt-FEATURE:cpt-frontx-feature-mfe-registry:p2
// @cpt-dod:cpt-frontx-dod-mfe-registry-mount-contracts:p1

import type { MountStrategy } from './mount-strategy';

/**
 * Abstract base class for domain behavior implementations.
 *
 * Domain authors extend this class (or a concrete subclass) inside their
 * `ExtensionDomainImplementationFactory.build(ctx)` implementation. The
 * concrete subclass is what the registry stores per registered domain.
 *
 * The one abstract method `getMountStrategies()` exists solely so the
 * registry can cross-validate handler/strategy cardinality at registration
 * time per `cpt-frontx-algo-mfe-registry-cross-validate-handlers`.
 * No other externally-callable mount/unmount API is exposed.
 *
 * @example
 * ```typescript
 * class MyDomainImpl extends ExtensionDomainImplementation {
 *   private readonly strategy: ConcurrentMountStrategy;
 *
 *   constructor(ctx: DomainContext, hooks: ContainerHooks) {
 *     super();
 *     this.strategy = new ConcurrentMountStrategy(ctx.mounter, hooks);
 *     ctx.registerHandler(HAI3_ACTION_MOUNT_EXT,
 *       ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as ActionPayload)));
 *     ctx.registerHandler(HAI3_ACTION_UNMOUNT_EXT,
 *       ActionHandler.fromFunction((_t, p) => this.strategy.unmount!(p as ActionPayload)));
 *   }
 *
 *   protected getMountStrategies(): MountStrategy[] {
 *     return [this.strategy];
 *   }
 * }
 * ```
 */
// @cpt-begin:cpt-frontx-dod-mfe-registry-mount-contracts:p1:inst-extension-domain-implementation
export abstract class ExtensionDomainImplementation {
  /**
   * Return the mount strategy instances captured during construction.
   *
   * The registry calls this once, immediately after `factory.build(ctx)` returns,
   * to run the cross-validation matrix. Subclasses MUST return all strategy
   * instances they registered action handlers for.
   *
   * This is the only upward-facing abstract method; it is not part of the
   * domain author's public surface and is never called by host application code.
   */
  protected abstract getMountStrategies(): MountStrategy[];

  /**
   * @internal — called by the registry only during `registerDomain`.
   */
  _getMountStrategiesInternal(): MountStrategy[] {
    return this.getMountStrategies();
  }
}
// @cpt-end:cpt-frontx-dod-mfe-registry-mount-contracts:p1:inst-extension-domain-implementation
