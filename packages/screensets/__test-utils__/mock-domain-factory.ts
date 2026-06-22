/**
 * MockDomainFactory — test replacement for the removed ContainerProvider.
 *
 * Implements `ExtensionDomainImplementationFactory` using `ConcurrentMountStrategy`
 * (for domains with both mount_ext and unmount_ext) or `ExclusiveMountStrategy`
 * (for domains with only mount_ext — "swap semantics").
 *
 * Usage:
 *   const factory = new MockDomainFactory();
 *   registry.registerDomain(domain, factory.prepareForDomain(domain));
 *
 * The `prepareForDomain` call must precede each `registerDomain` call so the
 * factory knows which strategy to select. It returns `this` so it can be
 * inlined in the call.
 *
 * Spy-compatible:
 *   factory.getContainer = vi.fn().mockReturnValue(container);
 *   factory.releaseContainer = vi.fn();
 *
 * Container reference:
 *   const container = factory.mockContainer as HTMLElement;
 */

import { ExtensionDomainImplementationFactory } from '../src/mfe/runtime/ExtensionDomainImplementationFactory';
import { ExtensionDomainImplementation } from '../src/mfe/runtime/ExtensionDomainImplementation';
import {
  ConcurrentMountStrategy,
  ExclusiveMountStrategy,
} from '../src/mfe/runtime/mount-strategies';
import type { ContainerHooks, MountStrategy, ActionPayload } from '../src/mfe/runtime/mount-strategy';
import type { DomainContext } from '../src/mfe/runtime/DomainContext';
import { ActionHandler } from '../src/mfe/mediator/types';
import {
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
} from '../src/mfe/constants/index';
import type { ExtensionDomain } from '../src/mfe/types';
import type { MfeRegistry } from '../src/mfe/runtime/MfeRegistry';

// ─── Internal implementation class ───────────────────────────────────────────

class MockDomainImpl extends ExtensionDomainImplementation {
  private readonly _strategies: MountStrategy[];

  constructor(strategies: MountStrategy[]) {
    super();
    this._strategies = strategies;
  }

  protected getMountStrategies(): MountStrategy[] {
    return this._strategies;
  }
}

// ─── MockDomainFactory ────────────────────────────────────────────────────────

/**
 * Test factory — drop-in replacement for the removed `MockContainerProvider`.
 *
 * @see MockDomainFactory for usage.
 */
export class MockDomainFactory extends ExtensionDomainImplementationFactory {
  /**
   * Pre-created element. Tests that need a DOM reference before the first
   * mount call (e.g., shadow-dom-mount.test.ts) use this directly.
   */
  public readonly mockContainer: Element;

  /**
   * Called per extension during mount. Reassign or spy to control which
   * container element is returned and to assert call counts.
   */
  public getContainer: (extensionId: string) => Element;

  /**
   * Called per extension during unmount. Reassign or spy to assert cleanup.
   */
  public releaseContainer: (extensionId: string) => void;

  /**
   * When non-null the factory uses an ExclusiveMountStrategy (swap semantics)
   * for the next `build()` call. Cleared after each `build()`.
   *
   * Tests that register on swap domains must call `factory.prepareForDomain(domain)`
   * before `registry.registerDomain(domain, factory)`.
   */
  private _pendingDeclaration: ExtensionDomain | null = null;

  /**
   * When ExclusiveMountStrategy is needed, the factory requires a registry
   * reference to satisfy `getMountedExtensions(domainId)`. Set via
   * `setRegistry(registry)` before the first swap-domain registration.
   */
  private _registry: MfeRegistry | null = null;

  /**
   * When true, `build()` registers no-op handlers for ALL declared actions
   * that have no natural handler (i.e., everything except the standard lifecycle
   * actions handled by strategy registration). Enables tests that declare custom
   * action types on domains without needing per-action handler setup.
   */
  private _permissive = false;

  constructor() {
    super();
    this.mockContainer = document.createElement('div');
    this.mockContainer.setAttribute('data-mock', 'true');
    this.getContainer = (_extensionId: string): Element => this.mockContainer;
    this.releaseContainer = (_extensionId: string): void => {};
  }

  /**
   * Set the declaration for the NEXT `build()` call.
   * Must be called immediately before `registry.registerDomain(domain, factory)`.
   *
   * @returns `this` for fluent use: `registry.registerDomain(domain, factory.prepareForDomain(domain))`
   */
  prepareForDomain(declaration: ExtensionDomain): this {
    this._pendingDeclaration = declaration;
    return this;
  }

  /**
   * Inject the registry so ExclusiveMountStrategy can query mounted extensions.
   * Required only for swap-semantics (exclusive) domains.
   *
   * @returns `this` for chaining.
   */
  setRegistry(registry: MfeRegistry): this {
    this._registry = registry;
    return this;
  }

  /**
   * Enable permissive mode: `build()` registers no-op handlers for any
   * declared action type that is not covered by the selected MountStrategy.
   * Use this for tests that declare custom action types on domains without
   * setting up real handlers for them.
   *
   * @returns `this` for chaining.
   */
  asPermissive(): this {
    this._permissive = true;
    return this;
  }

  build(ctx: DomainContext): ExtensionDomainImplementation {
    const declaration = this._pendingDeclaration;
    // Always clear after consuming so a missing prepareForDomain call is detectable.
    this._pendingDeclaration = null;

    if (declaration === null) {
      throw new Error(
        'MockDomainFactory.build() called without a preceding prepareForDomain(declaration) call. ' +
        'Always call factory.prepareForDomain(domain) immediately before registry.registerDomain(domain, factory).'
      );
    }

    const hooks: ContainerHooks = {
      create: (extensionId: string) => this.getContainer(extensionId),
      destroy: (extensionId: string) => this.releaseContainer(extensionId),
    };

    const hasUnmount = declaration.actions.includes(FRONTX_ACTION_UNMOUNT_EXT);

    let strategy: MountStrategy;
    if (hasUnmount) {
      // Domains that declare unmount_ext use ConcurrentMountStrategy.
      const concurrent = new ConcurrentMountStrategy(ctx.mounter, hooks);
      ctx.registerHandler(
        FRONTX_ACTION_MOUNT_EXT,
        ActionHandler.fromFunction((_t, p) => concurrent.mount(p as ActionPayload))
      );
      ctx.registerHandler(
        FRONTX_ACTION_UNMOUNT_EXT,
        ActionHandler.fromFunction((_t, p) => concurrent.unmount!(p as ActionPayload))
      );
      strategy = concurrent;
    } else {
      // Domains that declare only mount_ext use ExclusiveMountStrategy (swap semantics).
      const registry = this._registry;
      if (registry === null) {
        throw new Error(
          'MockDomainFactory: ExclusiveMountStrategy requires a registry reference. ' +
          'Call factory.setRegistry(registry) before registering a swap-semantics domain.'
        );
      }
      const exclusive = new ExclusiveMountStrategy(ctx.mounter, hooks, registry, declaration.id);
      ctx.registerHandler(
        FRONTX_ACTION_MOUNT_EXT,
        ActionHandler.fromFunction((_t, p) => exclusive.mount(p as ActionPayload))
      );
      strategy = exclusive;
    }

    if (this._permissive) {
      // Register no-op handlers for any extra declared actions not already
      // covered by the strategy registration above or pre-populated by the
      // registry (load_ext). This satisfies the cross-validation requirement
      // that every declared action has a handler.
      const alreadyHandled = new Set([
        FRONTX_ACTION_LOAD_EXT,   // pre-populated by DefaultMfeRegistry
        FRONTX_ACTION_MOUNT_EXT,  // registered by strategy above
        ...(hasUnmount ? [FRONTX_ACTION_UNMOUNT_EXT] : []),
      ]);
      for (const actionType of declaration.actions) {
        if (!alreadyHandled.has(actionType)) {
          ctx.registerHandler(
            actionType,
            ActionHandler.fromFunction(async () => { /* no-op */ })
          );
        }
      }
    }

    return new MockDomainImpl([strategy]);
  }
}
