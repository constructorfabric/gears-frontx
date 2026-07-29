/**
 * Test-only domain factory for the framework package tests.
 *
 * Thin wrapper that satisfies the `ExtensionDomainImplementationFactory`
 * contract used by `MfeRegistry.registerDomain`. Internally selects between
 * `ConcurrentMountStrategy`, `OptionalMountStrategy`, and `ExclusiveMountStrategy`
 * based on the domain declaration's action set.
 *
 * Usage:
 *   const provider = new TestContainerProvider();
 *   registry.registerDomain(domain, provider.prepareForDomain(domain));
 *
 * The `prepareForDomain` call returns `this` so it can be inlined.
 */

import {
  ExtensionDomainImplementationFactory,
  ExtensionDomainImplementation,
  ConcurrentMountStrategy,
  ExclusiveMountStrategy,
  ActionHandler,
  type ContainerHooks,
  type DomainContext,
  type ExtensionDomain,
  type MountStrategy,
  type MfeRegistry,
  type ActionPayload,
} from '@gears-frontx/mfes';

class TestDomainImpl extends ExtensionDomainImplementation {
  private readonly _strategies: MountStrategy[];
  constructor(strategies: MountStrategy[]) {
    super();
    this._strategies = strategies;
  }
  protected getMountStrategies(): MountStrategy[] {
    return this._strategies;
  }
}

export class TestContainerProvider extends ExtensionDomainImplementationFactory {
  public readonly mockContainer: Element =
    typeof document !== 'undefined'
      ? document.createElement('div')
      : ({} as unknown as Element);

  private _pendingDeclaration: ExtensionDomain | null = null;
  private _registry: MfeRegistry | null = null;

  constructor(_container?: Element) {
    super();
    if (_container) (this as { mockContainer: Element }).mockContainer = _container;
  }

  setRegistry(registry: MfeRegistry): this {
    this._registry = registry;
    return this;
  }

  prepareForDomain(declaration: ExtensionDomain): this {
    this._pendingDeclaration = declaration;
    return this;
  }

  build(ctx: DomainContext): TestDomainImpl {
    const declaration = this._pendingDeclaration;
    this._pendingDeclaration = null;
    if (!declaration) {
      throw new Error('TestContainerProvider.build called without prepareForDomain');
    }
    const actions = declaration.actions ?? [];

    // Resolve the framework's well-known lifecycle action IDs through the
    // injected typeSystem rather than a hardcoded import — mirrors
    // DefaultMfeRegistry.crossValidateHandlers so this fixture accepts every
    // domain the real registry accepts, including a hierarchy-derived (is-a)
    // mount_ext/unmount_ext variant, not just an exact GTS-literal match.
    // Handlers are registered under the ACTUAL declared action id (which may
    // be the derived variant) — crossValidateHandlers checks declared actions
    // against collected handlers by exact key, not by isTypeOf.
    const mountExtActionId = ctx.typeSystem.resolveMountExtActionId();
    const unmountExtActionId = ctx.typeSystem.resolveUnmountExtActionId();
    const declaredMountAction = actions.find((id) => ctx.typeSystem.isTypeOf(id, mountExtActionId));
    const declaredUnmountAction = actions.find((id) => ctx.typeSystem.isTypeOf(id, unmountExtActionId));

    const container = this.mockContainer;
    const hooks: ContainerHooks = {
      create: () => container,
      destroy: () => undefined,
    };

    const strategies: MountStrategy[] = [];
    if (declaredMountAction && declaredUnmountAction) {
      const strategy = new ConcurrentMountStrategy(ctx.mounter, hooks);
      strategies.push(strategy);
      ctx.registerHandler(
        declaredMountAction,
        ActionHandler.fromFunction((_t, p) => strategy.mount(p as ActionPayload))
      );
      ctx.registerHandler(
        declaredUnmountAction,
        ActionHandler.fromFunction((_t, p) => strategy.unmount!(p as ActionPayload))
      );
    } else if (declaredMountAction) {
      if (!this._registry) {
        throw new Error('TestContainerProvider: ExclusiveMountStrategy requires setRegistry(registry) before registering an exclusive domain');
      }
      const strategy = new ExclusiveMountStrategy(ctx.mounter, hooks, this._registry, declaration.id);
      strategies.push(strategy);
      ctx.registerHandler(
        declaredMountAction,
        ActionHandler.fromFunction((_t, p) => strategy.mount(p as ActionPayload))
      );
    }

    return new TestDomainImpl(strategies);
  }
}
