/**
 * Registration through the registry refuses a domain or an extension whose
 * lifecycle hook holds an action that fails the action's own type, at any
 * step of its chain, and leaves nothing of it behind: not on the real GTS
 * store, not in the registry, and not admitted by the router
 * (`cpt-frontx-algo-mfe-registry-router-admission`
 * `inst-algo-ra-domain-hook-actions` / `inst-algo-ra-extension-hook-actions`,
 * `cpt-frontx-algo-gts-type-provider-instance-write` `inst-iw-hook-actions`).
 *
 * Exercises the real store through `GtsPlugin`, because the check runs inside
 * the provider's `register()`, where the declaration being registered is
 * visible to its own hook actions. A hook that names its own domain or
 * extension therefore still registers.
 */
import { describe, it, expect } from 'vitest';
import {
  createMfeRegistryFactory,
  MfeHandler,
  MfeBridgeFactory,
  ChildMfeBridge,
  ExtensionDomainImplementation,
  ExtensionDomainImplementationFactory,
  ConcurrentMountStrategy,
  ActionHandler,
  DomainValidationError,
  type MfeEntryLifecycle,
  type DomainContext,
  type ContainerHooks,
  type RouterPort,
  type Extension,
  type ExtensionDomain,
  type MfeEntry,
} from '@gears-frontx/mfes';
// @internal — colocated test, direct relative import is permitted.
import { GtsPlugin } from '../plugin';

const DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~test.hookactions.fixture.domain.v1';
const HOOKED_DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~test.hookactions.fixture.hooked.v1';
const ENTRY_ID = 'gts.frontx.mfes.mfe.entry.v1~test.hookactions.fixture.entry.v1';
const EXT_ID = 'gts.frontx.mfes.ext.extension.v1~test.hookactions.fixture.ext.v1';
const HOOKED_EXT_ID = 'gts.frontx.mfes.ext.extension.v1~test.hookactions.fixture.hooked.v1';

class NoopContainerHooks implements ContainerHooks {
  create(): Element { return document.createElement('div'); }
  destroy(): void { /* noop */ }
}

class ConcurrentDomainImpl extends ExtensionDomainImplementation {
  readonly strategy: ConcurrentMountStrategy;
  constructor(ctx: DomainContext, hooks: ContainerHooks) {
    super();
    this.strategy = new ConcurrentMountStrategy(ctx.mounter, hooks);
    ctx.registerHandler(
      ctx.typeSystem.resolveMountExtActionId(),
      ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as { subject: string }))
    );
    ctx.registerHandler(
      ctx.typeSystem.resolveUnmountExtActionId(),
      ActionHandler.fromFunction((_t, p) => this.strategy.unmount!(p as { subject: string }))
    );
  }
  protected getMountStrategies() { return [this.strategy]; }
}

class ConcurrentDomainFactory extends ExtensionDomainImplementationFactory {
  build(ctx: DomainContext): ConcurrentDomainImpl {
    return new ConcurrentDomainImpl(ctx, new NoopContainerHooks());
  }
}

/** Never invoked: these tests register and never mount. */
class StubBridgeFactory extends MfeBridgeFactory {
  create(): ChildMfeBridge {
    throw new Error('not reached — this test never mounts an extension');
  }
  dispose(): void { /* unused */ }
}

class StubHandler extends MfeHandler {
  readonly bridgeFactory = new StubBridgeFactory();
  async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return { mount: () => {}, unmount: () => {} };
  }
}

/** A router that admits everything and records what it is told to release. */
function admittingRouter(released: string[]): RouterPort {
  return {
    connect: () => { /* unused */ },
    registerDomain: () => { /* admitted */ },
    registerExtension: () => { /* admitted */ },
    releaseDomain: (domainId) => { released.push(domainId); },
    releaseExtension: (extensionId) => { released.push(extensionId); },
    assignOccupantValue: () => undefined,
    reflect: () => { /* unused */ },
    supplyNavigation: () => { /* unused */ },
    startDomain: () => { /* unused */ },
    stopDomain: () => { /* unused */ },
  };
}

function setUp() {
  const plugin = new GtsPlugin({ isolated: true });
  const released: string[] = [];
  const registry = createMfeRegistryFactory().build({
    typeSystem: plugin,
    mfeHandlers: [new StubHandler(ENTRY_ID)],
    router: admittingRouter(released),
  });
  const entry: MfeEntry = { id: ENTRY_ID, requiredProperties: [], actions: [], domainActions: [] };
  plugin.register(entry);

  const mountExt = plugin.resolveMountExtActionId();
  const unmountExt = plugin.resolveUnmountExtActionId();
  const init = plugin.resolveLifecycleStageInitId();
  const destroyed = plugin.resolveLifecycleStageDestroyedId();
  const deactivated = plugin.resolveLifecycleStageDeactivatedId();

  function domain(id: string, route: string, lifecycle?: ExtensionDomain['lifecycle']): ExtensionDomain {
    return {
      id,
      route,
      actions: [plugin.resolveLoadExtActionId(), mountExt, unmountExt],
      extensionsActions: [],
      sharedProperties: [],
      defaultActionTimeout: 5000,
      lifecycleStages: [init, destroyed],
      extensionsLifecycleStages: [deactivated],
      ...(lifecycle ? { lifecycle } : {}),
    };
  }

  function extension(id: string, route: string, lifecycle?: Extension['lifecycle']): Extension {
    return { id, domain: DOMAIN_ID, entry: ENTRY_ID, route, ...(lifecycle ? { lifecycle } : {}) };
  }

  registry.registerDomain(domain(DOMAIN_ID, 'screens'), new ConcurrentDomainFactory());

  return { plugin, registry, released, domain, extension, mountExt, unmountExt, init, destroyed, deactivated };
}

describe('registration checks each lifecycle hook action against its own type', () => {
  it('refuses a domain whose hook mounts into an extension, and accepts the corrected hook that mounts into the domain itself', async () => {
    const { plugin, registry, released, domain, extension, mountExt, init, destroyed } = setUp();
    await registry.registerExtension(extension(EXT_ID, 'home'));

    const refused = domain(HOOKED_DOMAIN_ID, 'panels', [
      { stage: init, actions_chain: { action: { type: mountExt, target: EXT_ID, payload: { subject: EXT_ID } } } },
    ]);

    let error: unknown;
    try {
      registry.registerDomain(refused, new ConcurrentDomainFactory());
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(DomainValidationError);
    expect((error as Error).message).toMatch(/lifecycle hook action at lifecycle\[0\]\.actions_chain\.action fails/);

    // Registered nowhere: not on the store, not in the registry, and the router's admission released.
    expect(plugin.getSchema(HOOKED_DOMAIN_ID)).toBeUndefined();
    expect(registry.getDomain(HOOKED_DOMAIN_ID)).toBeUndefined();
    expect(released).toEqual([HOOKED_DOMAIN_ID]);

    // `destroyed` does not fire in this test, so the corrected hook is only registered, never dispatched.
    const corrected = domain(HOOKED_DOMAIN_ID, 'panels', [
      { stage: destroyed, actions_chain: { action: { type: mountExt, target: HOOKED_DOMAIN_ID, payload: { subject: EXT_ID } } } },
    ]);
    expect(() => registry.registerDomain(corrected, new ConcurrentDomainFactory())).not.toThrow();
    expect(plugin.getSchema(HOOKED_DOMAIN_ID)).toBeDefined();
    expect(registry.getDomain(HOOKED_DOMAIN_ID)).toBeDefined();
  });

  it('refuses an extension whose hook fails past the first step, and accepts the corrected chain that names the extension itself', async () => {
    const { plugin, registry, released, extension, mountExt, unmountExt, deactivated } = setUp();

    const refused = extension(HOOKED_EXT_ID, 'home', [
      {
        stage: deactivated,
        actions_chain: {
          action: { type: unmountExt, target: DOMAIN_ID, payload: { subject: HOOKED_EXT_ID } },
          next: { action: { type: mountExt, target: HOOKED_EXT_ID, payload: { subject: HOOKED_EXT_ID } } },
        },
      },
    ]);

    await expect(registry.registerExtension(refused)).rejects.toThrow(
      /lifecycle hook action at lifecycle\[0\]\.actions_chain\.next\.action fails/
    );
    expect(plugin.getSchema(HOOKED_EXT_ID)).toBeUndefined();
    expect(registry.getExtension(HOOKED_EXT_ID)).toBeUndefined();
    expect(released).toEqual([HOOKED_EXT_ID]);

    // `deactivated` does not fire in this test, so the corrected hook is only registered, never dispatched.
    const corrected = extension(HOOKED_EXT_ID, 'home', [
      {
        stage: deactivated,
        actions_chain: {
          action: { type: unmountExt, target: DOMAIN_ID, payload: { subject: HOOKED_EXT_ID } },
          next: { action: { type: mountExt, target: DOMAIN_ID, payload: { subject: HOOKED_EXT_ID } } },
        },
      },
    ]);
    await expect(registry.registerExtension(corrected)).resolves.toBeUndefined();
    expect(plugin.getSchema(HOOKED_EXT_ID)).toBeDefined();
    expect(registry.getExtension(HOOKED_EXT_ID)).toBeDefined();
  });
});
