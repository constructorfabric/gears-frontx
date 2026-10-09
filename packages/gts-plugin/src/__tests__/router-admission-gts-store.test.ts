/**
 * Router admission ordered before durable type-system registration, for both
 * extensions and domains (`cpt-frontx-algo-mfe-registry-router-admission`
 * `inst-algo-ra-present-extension` / `inst-algo-ra-present-domain`,
 * `cpt-frontx-dod-mfe-registry-router-admission`).
 *
 * Exercises the real, shipped `GtsStore` through `GtsPlugin` — not a mock
 * `typeSystem` — because the defect this guards against is specifically
 * that the type system's own `register()` call persists an entity into its
 * backing store with no way to undo that persist; a mock plugin recording
 * calls proves nothing about whether the real store actually ends up
 * holding the entity. `GtsPlugin.getSchema(id)` doubles as "is any entity —
 * schema or instance — registered under this id", since `GtsStore.get` is
 * generic over both.
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

const DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~test.routeradmission.fixture.domain.v1';
const ENTRY_ID = 'gts.frontx.mfes.mfe.entry.v1~test.routeradmission.fixture.entry.v1';
const EXT_ID = 'gts.frontx.mfes.ext.extension.v1~test.routeradmission.fixture.ext.v1';

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

/**
 * Never actually invoked: neither test mounts the extension, only
 * registers it, so `bridgeFactory.create` is never reached. A minimal
 * concrete subclass is still required because `MfeHandler.bridgeFactory`
 * is typed as the abstract `MfeBridgeFactory`.
 */
class StubBridgeFactory extends MfeBridgeFactory {
  create(): ChildMfeBridge {
    throw new Error('not reached — this test never mounts the extension');
  }
  dispose(): void { /* unused */ }
}

class StubHandler extends MfeHandler {
  readonly bridgeFactory = new StubBridgeFactory();
  async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return { mount: () => {}, unmount: () => {} };
  }
}

function makeDomain(plugin: GtsPlugin, overrides: Partial<ExtensionDomain> = {}): ExtensionDomain {
  return {
    id: DOMAIN_ID,
    actions: [
      plugin.resolveLoadExtActionId(),
      plugin.resolveMountExtActionId(),
      plugin.resolveUnmountExtActionId(),
    ],
    extensionsActions: [],
    sharedProperties: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
    ...overrides,
  };
}

function makeExtension(): Extension {
  return { id: EXT_ID, domain: DOMAIN_ID, entry: ENTRY_ID };
}

function makeEntry(): MfeEntry {
  return { id: ENTRY_ID, requiredProperties: [], actions: [], domainActions: [] };
}

function buildRegistry(
  plugin: GtsPlugin,
  router: RouterPort,
  domainOverrides: Partial<ExtensionDomain> = {}
) {
  const registry = createMfeRegistryFactory().build({
    typeSystem: plugin,
    mfeHandlers: [new StubHandler(ENTRY_ID)],
    router,
  });
  plugin.register(makeEntry());
  registry.registerDomain(makeDomain(plugin, domainOverrides), new ConcurrentDomainFactory());
  return registry;
}

describe('extension registration leaves nothing in the real GTS store when the router rejects', () => {
  it('a router rejection leaves the extension unregistered with the type system, not merely absent from the registry map', async () => {
    const plugin = new GtsPlugin({ isolated: true });
    const router: RouterPort = {
      registerDomain: () => { /* domain admitted */ },
      registerExtension: () => { throw new Error('router: route conflict'); },
      releaseDomain: () => { /* unused */ },
      releaseExtension: () => { /* unused */ },
      assignOccupantValue: () => undefined,
      reportSettled: () => { /* unused */ },
      supplyNavigation: () => { /* unused */ },
    };
    const registry = buildRegistry(plugin, router);

    await expect(registry.registerExtension(makeExtension())).rejects.toThrow('router: route conflict');

    // The real GtsStore never received this instance: the type system's own
    // `register()` call is deferred until after the router admits, so a
    // router rejection — which throws before that call ever runs — leaves
    // the extension registered nowhere, including with the type system.
    expect(plugin.getSchema(EXT_ID)).toBeUndefined();
  });

  it('a router that admits the extension lets it reach the real GTS store', async () => {
    const plugin = new GtsPlugin({ isolated: true });
    const router: RouterPort = {
      registerDomain: () => { /* domain admitted */ },
      registerExtension: () => { /* extension admitted */ },
      releaseDomain: () => { /* unused */ },
      releaseExtension: () => { /* unused */ },
      assignOccupantValue: () => undefined,
      reportSettled: () => { /* unused */ },
      supplyNavigation: () => { /* unused */ },
    };
    const registry = buildRegistry(plugin, router);

    await expect(registry.registerExtension(makeExtension())).resolves.toBeUndefined();

    expect(plugin.getSchema(EXT_ID)).toBeDefined();
  });
});

describe('domain registration leaves nothing in the real GTS store when the router rejects', () => {
  it('a router rejection leaves the domain unregistered with the type system, not merely absent from the registry map', () => {
    const plugin = new GtsPlugin({ isolated: true });
    const router: RouterPort = {
      registerDomain: () => { throw new Error('router: domain route conflict'); },
      registerExtension: () => { /* unused */ },
      releaseDomain: () => { /* unused */ },
      releaseExtension: () => { /* unused */ },
      assignOccupantValue: () => undefined,
      reportSettled: () => { /* unused */ },
      supplyNavigation: () => { /* unused */ },
    };
    const registry = createMfeRegistryFactory().build({ typeSystem: plugin, router });

    expect(() =>
      registry.registerDomain(makeDomain(plugin), new ConcurrentDomainFactory())
    ).toThrow('router: domain route conflict');

    // The real GtsStore never received this declaration: `typeSystem.register`
    // for the domain is deferred until after the router admits, so a router
    // rejection — which throws before that call ever runs — leaves the
    // domain registered nowhere, including with the type system.
    expect(plugin.getSchema(DOMAIN_ID)).toBeUndefined();
  });

  it('a router that admits the domain lets it reach the real GTS store', () => {
    const plugin = new GtsPlugin({ isolated: true });
    const router: RouterPort = {
      registerDomain: () => { /* domain admitted */ },
      registerExtension: () => { /* unused */ },
      releaseDomain: () => { /* unused */ },
      releaseExtension: () => { /* unused */ },
      assignOccupantValue: () => undefined,
      reportSettled: () => { /* unused */ },
      supplyNavigation: () => { /* unused */ },
    };
    const registry = createMfeRegistryFactory().build({ typeSystem: plugin, router });

    expect(() =>
      registry.registerDomain(makeDomain(plugin), new ConcurrentDomainFactory())
    ).not.toThrow();

    expect(plugin.getSchema(DOMAIN_ID)).toBeDefined();
  });
});

/**
 * The other half of the admission ordering: the router has no opinion on
 * GTS schema validity, so it admits something the type system then rejects.
 * Guards against a router admission left with no matching release: the
 * type-system failure path must tell the router to free what it had
 * already admitted before the failure propagates
 * (`cpt-frontx-algo-mfe-registry-router-admission`
 * `inst-extension-type-register` / `inst-domain-type-register`).
 */
describe('router admission is released when the router admits but type-system registration then fails', () => {
  it('an invalid extension is admitted by the router, rejected by the real GTS store, released from the router, and a corrected retry succeeds', async () => {
    const plugin = new GtsPlugin({ isolated: true });
    const released: string[] = [];
    const router: RouterPort = {
      registerDomain: () => { /* domain admitted */ },
      // The router validates nothing about GTS shape — admitting here is
      // exactly what lets the extension reach (and fail) type-system
      // registration afterward.
      registerExtension: () => { /* extension admitted */ },
      releaseDomain: () => { /* unused */ },
      releaseExtension: (extensionId) => { released.push(extensionId); },
      assignOccupantValue: () => undefined,
      reportSettled: () => { /* unused */ },
      supplyNavigation: () => { /* unused */ },
    };
    // The hook's `stage` must be one the domain actually declares (governance's
    // own string-membership check, which never touches GTS) and must itself be
    // a real registered stage (so only the missing `actions_chain` below — a
    // required field the GTS schema enforces, not something governance looks
    // at — is what makes this extension GTS-invalid).
    const stageId = plugin.resolveLifecycleStageActivatedId();
    const registry = buildRegistry(plugin, router, { extensionsLifecycleStages: [stageId] });

    const invalidExtension = {
      ...makeExtension(),
      lifecycle: [{ stage: stageId }],
    } as unknown as Extension;

    await expect(registry.registerExtension(invalidExtension)).rejects.toThrow();

    // Validated against a disposable store mirroring the real one before ever
    // touching it (`cpt-frontx-algo-gts-type-provider-instance-write`
    // `inst-iw-validate`): the real GtsStore never received this instance.
    expect(plugin.getSchema(EXT_ID)).toBeUndefined();

    // The router had already admitted it before type-system validation ran;
    // releasing that admission is what lets a corrected retry reuse the id.
    expect(released).toEqual([EXT_ID]);

    await expect(registry.registerExtension(makeExtension())).resolves.toBeUndefined();
    expect(plugin.getSchema(EXT_ID)).toBeDefined();
  });

  it('an invalid domain is admitted by the router, rejected by the real GTS store, released from the router, and a corrected retry succeeds', () => {
    const plugin = new GtsPlugin({ isolated: true });
    const released: string[] = [];
    const router: RouterPort = {
      // The router validates nothing about GTS shape — admitting here is
      // exactly what lets the domain reach (and fail) type-system
      // registration afterward.
      registerDomain: () => { /* domain admitted */ },
      registerExtension: () => { /* unused */ },
      releaseDomain: (domainId) => { released.push(domainId); },
      releaseExtension: () => { /* unused */ },
      assignOccupantValue: () => undefined,
      reportSettled: () => { /* unused */ },
      supplyNavigation: () => { /* unused */ },
    };
    const registry = createMfeRegistryFactory().build({ typeSystem: plugin, router });

    // A syntactically valid but never-registered stage id: governance's own
    // lifecycle-hook check never inspects `lifecycleStages` unless a `lifecycle`
    // hook is actually declared (this domain declares none), so only the
    // GTS schema's own `x-gts-ref` existence check on this field rejects it.
    const phantomStageId = 'gts.frontx.mfes.lifecycle.stage.v1~test.routeradmission.fixture.phantom.v1';
    const invalidDomain = makeDomain(plugin, { lifecycleStages: [phantomStageId] });

    expect(() =>
      registry.registerDomain(invalidDomain, new ConcurrentDomainFactory())
    ).toThrow();

    expect(plugin.getSchema(DOMAIN_ID)).toBeUndefined();
    expect(released).toEqual([DOMAIN_ID]);

    expect(() =>
      registry.registerDomain(makeDomain(plugin), new ConcurrentDomainFactory())
    ).not.toThrow();
    expect(plugin.getSchema(DOMAIN_ID)).toBeDefined();
  });
});
