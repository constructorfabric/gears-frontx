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
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
  type ContainerHooks,
  type DomainContext,
  type ExtensionDomain,
  type MountStrategy,
  type MfeRegistry,
  type ActionPayload,
} from '@gears-frontx/screensets';

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
    const hasMount = actions.includes(FRONTX_ACTION_MOUNT_EXT);
    const hasUnmount = actions.includes(FRONTX_ACTION_UNMOUNT_EXT);
    const container = this.mockContainer;
    const hooks: ContainerHooks = {
      create: () => container,
      destroy: () => undefined,
    };

    const strategies: MountStrategy[] = [];
    if (hasMount && hasUnmount) {
      const strategy = new ConcurrentMountStrategy(ctx.mounter, hooks);
      strategies.push(strategy);
      ctx.registerHandler(
        FRONTX_ACTION_MOUNT_EXT,
        ActionHandler.fromFunction((_t, p) => strategy.mount(p as ActionPayload))
      );
      ctx.registerHandler(
        FRONTX_ACTION_UNMOUNT_EXT,
        ActionHandler.fromFunction((_t, p) => strategy.unmount!(p as ActionPayload))
      );
    } else if (hasMount) {
      if (!this._registry) {
        throw new Error('TestContainerProvider: ExclusiveMountStrategy requires setRegistry(registry) before registering an exclusive domain');
      }
      const strategy = new ExclusiveMountStrategy(ctx.mounter, hooks, this._registry, declaration.id);
      strategies.push(strategy);
      ctx.registerHandler(
        FRONTX_ACTION_MOUNT_EXT,
        ActionHandler.fromFunction((_t, p) => strategy.mount(p as ActionPayload))
      );
    }

    return new TestDomainImpl(strategies);
  }
}
