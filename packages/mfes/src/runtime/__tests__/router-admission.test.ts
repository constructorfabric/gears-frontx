/**
 * Router admission and release notifications
 * (`cpt-frontx-algo-mfe-registry-router-admission`,
 * `cpt-frontx-dod-mfe-registry-router-admission`,
 * `cpt-frontx-dod-mfe-registry-router-configuration`).
 *
 * Covers: a router test double is presented each domain/extension
 * registration before it becomes durable; a rejection leaves nothing
 * registered (re-registration succeeds); release notifications fire on
 * unregistration and disposal; a registry built with no router presents and
 * releases nothing.
 */
import { mountedIn } from './helpers/mounted-in';
import { describe, it, expect, vi } from 'vitest';
import { DefaultMfeRegistry } from '../DefaultMfeRegistry';
import type { TypeSystemPlugin } from '../../type-substrate';
import type { Extension, ExtensionDomain, MfeEntry } from '../../types';
import { MfeHandler, type MfeEntryLifecycle } from '../../handler/MfeHandler';
import type { ChildMfeBridge } from '../../handler/ChildMfeBridge';
import { MfeBridgeFactoryDefault } from '../../bridge/MfeBridgeFactoryDefault';
import { ExtensionDomainImplementation } from '../ExtensionDomainImplementation';
import { ExtensionDomainImplementationFactory } from '../ExtensionDomainImplementationFactory';
import type { DomainContext } from '../DomainContext';
import { ConcurrentMountStrategy } from '../ConcurrentMountStrategy';
import type { ContainerHooks } from '../MountStrategy';
import { ActionHandler } from '../../mediator/ActionHandler';
import type { RouterPort } from '../../router/RouterPort';
import { DomainValidationError } from '../../errors/DomainValidationError';

const ACTION_LOAD_EXT = 'cti.example.action~load_ext.v1~';
const ACTION_MOUNT_EXT = 'cti.example.action~mount_ext.v1~';
const ACTION_UNMOUNT_EXT = 'cti.example.action~unmount_ext.v1~';
const STAGE_INIT = 'cti.example.lifecycle.stage~init';
const STAGE_ACTIVATED = 'cti.example.lifecycle.stage~activated';
const STAGE_DEACTIVATED = 'cti.example.lifecycle.stage~deactivated';
const STAGE_DESTROYED = 'cti.example.lifecycle.stage~destroyed';

const ENTRY_ID = 'cti.example.entry~widget.v1';
const EXTENSION_ID = 'cti.example.extension~widget.v1';
const DOMAIN_ID = 'cti.example.domain.concurrent.v1';
const DOMAIN_ROUTE = 'screens';
const EXTENSION_ROUTE = 'home';

interface MockSchema {
  $id?: string;
  id?: string;
  requiredProperties?: string[];
  actions?: string[];
  domainActions?: string[];
}

function createPlugin(): TypeSystemPlugin<MockSchema> {
  const schemas = new Map<string, MockSchema>();
  return {
    name: 'MockPlugin',
    version: '1.0.0',
    registerSchema(schema) { if (schema.$id) schemas.set(schema.$id, schema); },
    getSchema(typeId) { return schemas.get(typeId); },
    register() { /* accept everything */ },
    isTypeOf(typeId, baseTypeId) { return typeId === baseTypeId || typeId.startsWith(baseTypeId); },
    validateInstance() { return { valid: true, errors: [] }; },
    resolveLoadExtActionId: () => ACTION_LOAD_EXT,
    resolveMountExtActionId: () => ACTION_MOUNT_EXT,
    resolveUnmountExtActionId: () => ACTION_UNMOUNT_EXT,
    resolveLifecycleStageInitId: () => STAGE_INIT,
    resolveLifecycleStageActivatedId: () => STAGE_ACTIVATED,
    resolveLifecycleStageDeactivatedId: () => STAGE_DEACTIVATED,
    resolveLifecycleStageDestroyedId: () => STAGE_DESTROYED,
  };
}

function registerEntrySchema(plugin: TypeSystemPlugin<MockSchema>): void {
  const entry: MfeEntry & MockSchema = {
    $id: ENTRY_ID,
    id: ENTRY_ID,
    requiredProperties: [],
    actions: [],
    domainActions: [],
  };
  plugin.registerSchema(entry as unknown as MockSchema);
}

/** An explicit `undefined` route declares no route; an omitted one declares `DOMAIN_ROUTE`. */
function makeDomain(id: string = DOMAIN_ID, ...routeArg: [route?: string | undefined]): ExtensionDomain {
  const route = routeArg.length === 0 ? DOMAIN_ROUTE : routeArg[0];
  return {
    id,
    ...(route === undefined ? {} : { route }),
    actions: [ACTION_LOAD_EXT, ACTION_MOUNT_EXT, ACTION_UNMOUNT_EXT],
    extensionsActions: [],
    sharedProperties: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
  } as unknown as ExtensionDomain;
}

/** An explicit `undefined` route declares no route; an omitted one declares `EXTENSION_ROUTE`. */
function makeExtension(
  id: string = EXTENSION_ID,
  domain: string = DOMAIN_ID,
  ...routeArg: [route?: string | undefined]
): Extension {
  const route = routeArg.length === 0 ? EXTENSION_ROUTE : routeArg[0];
  return { id, domain, entry: ENTRY_ID, ...(route === undefined ? {} : { route }) } as Extension;
}

class StubHandler extends MfeHandler {
  readonly bridgeFactory = new MfeBridgeFactoryDefault();
  async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return { mount: () => {}, unmount: () => {} };
  }
}

class RecordingContainerHooks implements ContainerHooks {
  readonly created: string[] = [];
  readonly destroyed: string[] = [];
  create(extensionId: string): Element {
    this.created.push(extensionId);
    return document.createElement('div');
  }
  destroy(extensionId: string): void {
    this.destroyed.push(extensionId);
  }
}

class ConcurrentDomainImpl extends ExtensionDomainImplementation {
  readonly strategy: ConcurrentMountStrategy;
  constructor(ctx: DomainContext, hooks: ContainerHooks) {
    super();
    this.strategy = new ConcurrentMountStrategy(ctx.mounter, hooks);
    ctx.registerHandler(ACTION_MOUNT_EXT, ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as { subject: string })));
    ctx.registerHandler(ACTION_UNMOUNT_EXT, ActionHandler.fromFunction((_t, p) => this.strategy.unmount!(p as { subject: string })));
  }
  protected getMountStrategies() { return [this.strategy]; }
}

class ConcurrentDomainFactory extends ExtensionDomainImplementationFactory {
  readonly hooks = new RecordingContainerHooks();
  strategy!: ConcurrentMountStrategy;
  build(ctx: DomainContext): ConcurrentDomainImpl {
    const impl = new ConcurrentDomainImpl(ctx, this.hooks);
    this.strategy = impl.strategy;
    return impl;
  }
}

/** A router test double recording every call it receives, in order. */
function createRouterSpy(): RouterPort & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    connect: vi.fn(() => { calls.push('connect'); }),
    registerDomain: vi.fn((domainId: string, _route: string, _declaresUnmount: boolean) => { calls.push(`registerDomain:${domainId}`); }),
    registerExtension: vi.fn((extensionId: string, _domainId: string, _route: string) => { calls.push(`registerExtension:${extensionId}`); }),
    startDomain: vi.fn(() => {}),
    stopDomain: vi.fn(() => {}),
    releaseDomain: vi.fn((domainId: string) => { calls.push(`releaseDomain:${domainId}`); }),
    releaseExtension: vi.fn((extensionId: string) => { calls.push(`releaseExtension:${extensionId}`); }),
    assignOccupantValue: vi.fn((_domainId: string, _extensionId: string) => undefined),
    reflect: vi.fn((domainId: string, extensionIds: string[], verb: 'push' | 'replace') => { calls.push(`reflect:${domainId}:${verb}:${extensionIds.join(',')}`); }),
    supplyNavigation: vi.fn(() => {}),
  };
}

function freshRegistry(
  plugin: TypeSystemPlugin<MockSchema>,
  router?: RouterPort,
  handler: MfeHandler = new StubHandler(ENTRY_ID)
): DefaultMfeRegistry {
  registerEntrySchema(plugin);
  return new DefaultMfeRegistry({ typeSystem: plugin, mfeHandlers: [handler], router });
}

describe('router admission', () => {
  it('a domain and an extension declared without route never reach the router, and nothing is released for them', async () => {
    const plugin = createPlugin();
    const router = createRouterSpy();
    const registry = freshRegistry(plugin, router);
    registry.registerDomain(makeDomain(DOMAIN_ID, undefined), new ConcurrentDomainFactory());
    await registry.registerExtension(makeExtension(EXTENSION_ID, DOMAIN_ID, undefined));

    await registry.unregisterExtension(EXTENSION_ID);
    await registry.unregisterDomain(DOMAIN_ID);
    await registry.dispose();

    expect(router.registerDomain).not.toHaveBeenCalled();
    expect(router.registerExtension).not.toHaveBeenCalled();
    expect(router.releaseExtension).not.toHaveBeenCalled();
    expect(router.releaseDomain).not.toHaveBeenCalled();
  });

  it('an unrouted extension in a routed domain is not registered with the router, and only the routed domain is released', async () => {
    const plugin = createPlugin();
    const router = createRouterSpy();
    const registry = freshRegistry(plugin, router);
    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory());
    await registry.registerExtension(makeExtension(EXTENSION_ID, DOMAIN_ID, undefined));

    await registry.unregisterDomain(DOMAIN_ID);

    expect(router.registerExtension).not.toHaveBeenCalled();
    expect(router.releaseExtension).not.toHaveBeenCalled();
    expect(router.releaseDomain).toHaveBeenCalledWith(DOMAIN_ID);
    await registry.dispose();
  });

  it('no router member receives a declaration object: every argument is a string or a boolean', async () => {
    const plugin = createPlugin();
    const router = createRouterSpy();
    const registry = freshRegistry(plugin, router);
    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory());
    await registry.registerExtension(makeExtension());
    const mounter = registry.getMounter(DOMAIN_ID);
    mounter.attach(document.createElement('div'));
    await mounter.mount(EXTENSION_ID, document.createElement('div'));
    await registry.unregisterExtension(EXTENSION_ID);
    await registry.unregisterDomain(DOMAIN_ID);

    const members = [
      router.registerDomain, router.registerExtension, router.releaseDomain, router.releaseExtension,
      router.assignOccupantValue, router.startDomain, router.stopDomain,
    ] as Array<ReturnType<typeof vi.fn>>;
    const args = members.flatMap((member) => member.mock.calls.flat());
    expect(args.length).toBeGreaterThan(0);
    for (const arg of args) expect(['string', 'boolean']).toContain(typeof arg);
    await registry.dispose();
  });

  it('presents the domain declaration to the router after the runtime\'s own checks pass and before it becomes durable', async () => {
    const plugin = createPlugin();
    const router = createRouterSpy();
    const registry = freshRegistry(plugin, router);
    const factory = new ConcurrentDomainFactory();

    registry.registerDomain(makeDomain(), factory);

    expect(router.registerDomain).toHaveBeenCalledTimes(1);
    expect(router.registerDomain).toHaveBeenCalledWith(DOMAIN_ID, DOMAIN_ROUTE, true);

    await registry.dispose();
  });

  it('a router that rejects a domain registration leaves it registered nowhere; re-registering the same id afterward succeeds', async () => {
    const plugin = createPlugin();
    const router = createRouterSpy();
    (router.registerDomain as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('router refuses this domain');
    });
    const registry = freshRegistry(plugin, router);

    expect(() => registry.registerDomain(makeDomain(), new ConcurrentDomainFactory())).toThrow(
      'router refuses this domain'
    );

    // Nothing left behind: a fresh registration of the same domain id must
    // not collide with a half-admitted remnant.
    expect(() => registry.registerDomain(makeDomain(), new ConcurrentDomainFactory())).not.toThrow();
    expect(router.registerDomain).toHaveBeenCalledTimes(2);

    await registry.dispose();
  });

  it('presents the extension declaration to the router after every runtime check passes and before its state is stored', async () => {
    const plugin = createPlugin();
    const router = createRouterSpy();
    const registry = freshRegistry(plugin, router);
    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory());

    await registry.registerExtension(makeExtension());

    expect(router.registerExtension).toHaveBeenCalledTimes(1);
    expect(router.registerExtension).toHaveBeenCalledWith(EXTENSION_ID, DOMAIN_ID, EXTENSION_ROUTE);

    await registry.dispose();
  });

  it('registering an already-registered domain id throws before any router call and leaves the live domain unchanged', async () => {
    const plugin = createPlugin();
    const router = createRouterSpy();
    const registry = freshRegistry(plugin, router);
    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory());
    const mounter = registry.getMounter(DOMAIN_ID);

    expect(() => registry.registerDomain(makeDomain(), new ConcurrentDomainFactory())).toThrow(
      DomainValidationError
    );

    expect(router.registerDomain).toHaveBeenCalledTimes(1);
    expect(router.releaseDomain).not.toHaveBeenCalled();
    expect(registry.getMounter(DOMAIN_ID)).toBe(mounter);

    await registry.dispose();
  });

  it('registering an already-registered extension id throws before any router call and leaves the registered extension unchanged', async () => {
    const plugin = createPlugin();
    const router = createRouterSpy();
    const registry = freshRegistry(plugin, router);
    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory());
    const original = makeExtension();
    await registry.registerExtension(original);

    await expect(registry.registerExtension({ ...original })).rejects.toThrow(
      `Extension '${EXTENSION_ID}' is already registered.`
    );

    expect(router.registerExtension).toHaveBeenCalledTimes(1);
    expect(router.releaseExtension).not.toHaveBeenCalled();
    const { route: _route, ...withoutRoute } = original;
    expect(registry.getExtension(EXTENSION_ID)).toEqual(withoutRoute);

    await registry.dispose();
  });

  it('a router that rejects an extension registration leaves no extension state, no handler, no advertisement, and no init trigger; re-registration afterward succeeds', async () => {
    const plugin = createPlugin();
    const router = createRouterSpy();
    (router.registerExtension as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('router refuses this extension');
    });
    const registry = freshRegistry(plugin, router);
    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory());

    await expect(registry.registerExtension(makeExtension())).rejects.toThrow('router refuses this extension');

    expect(registry.getExtension(EXTENSION_ID)).toBeUndefined();
    expect(registry.getExtensionsForDomain(DOMAIN_ID)).toHaveLength(0);

    // Re-registering the same id afterward succeeds — proving no partial
    // state (e.g. a handler-resolution record or package-map entry) survived.
    await expect(registry.registerExtension(makeExtension())).resolves.toBeUndefined();
    expect(registry.getExtension(EXTENSION_ID)).toBeDefined();

    await registry.dispose();
  });

  it('unregistering a MOUNTED admitted extension unmounts it, destroys its container, sends releaseExtension, and issues no command', async () => {
    // inst-me-no-command-outside-action, inst-algo-ra-cleanup-no-command
    const plugin = createPlugin();
    const router = createRouterSpy();
    const registry = freshRegistry(plugin, router);
    const factory = new ConcurrentDomainFactory();
    registry.registerDomain(makeDomain(), factory);
    await registry.registerExtension(makeExtension());

    const mounter = registry.getMounter(DOMAIN_ID);
    mounter.attach(document.createElement('div'));
    await mounter.mount(EXTENSION_ID, document.createElement('div'));
    expect(mountedIn(registry, DOMAIN_ID)).toContain(EXTENSION_ID);
    router.calls.length = 0;

    await registry.unregisterExtension(EXTENSION_ID);

    expect(mountedIn(registry, DOMAIN_ID)).not.toContain(EXTENSION_ID);
    expect(router.releaseExtension).toHaveBeenCalledWith(EXTENSION_ID);
    expect(router.reflect).not.toHaveBeenCalled();

    await registry.dispose();
  });

  it('sends releaseExtension when an admitted extension is unregistered', async () => {
    // inst-me-no-command-outside-action, inst-algo-ra-cleanup-no-command
    const plugin = createPlugin();
    const router = createRouterSpy();
    const registry = freshRegistry(plugin, router);
    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory());
    await registry.registerExtension(makeExtension());

    await registry.unregisterExtension(EXTENSION_ID);

    expect(router.releaseExtension).toHaveBeenCalledWith(EXTENSION_ID);
    // The release never issues a reflect command: unregistration is
    // resource cleanup, not an occupancy action.
    expect(router.reflect).not.toHaveBeenCalled();

    await registry.dispose();
  });

  it('unregistering an admitted domain sends releaseExtension for each of its extensions, then releaseDomain', async () => {
    // inst-me-no-command-outside-action, inst-algo-ra-cleanup-no-command
    const plugin = createPlugin();
    const router = createRouterSpy();
    const registry = freshRegistry(plugin, router);
    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory());
    await registry.registerExtension(makeExtension('ext-a'));
    await registry.registerExtension(makeExtension('ext-b'));
    router.calls.length = 0;

    await registry.unregisterDomain(DOMAIN_ID);

    const releaseCalls = router.calls.filter((c) => c.startsWith('release'));
    expect(releaseCalls).toContain('releaseExtension:ext-a');
    expect(releaseCalls).toContain('releaseExtension:ext-b');
    expect(releaseCalls.indexOf('releaseDomain:' + DOMAIN_ID)).toBe(releaseCalls.length - 1);
    expect(router.reflect).not.toHaveBeenCalled();

    await registry.dispose();
  });

  it('an extension registration naming a domain being unregistered is rejected immediately, never admitted to the router', async () => {
    // `registerExtension` is serialized per extension id, `unregisterDomain`
    // per domain id — different keys, so the two can run concurrently.
    // `ext-a` is already a domain member when teardown starts; `ext-b`
    // targets the same domain while that teardown is still draining `ext-a`.
    // Starting both without awaiting either first, then awaiting both
    // together, reproduces that interleaving deterministically through the
    // microtask ordering the operation queues already impose — no sleep or
    // poll is needed. `unregisterDomain` closes the domain to new
    // registrations as its very first action
    // (`cpt-frontx-algo-mfe-registry-domain-unregister-closes-admission`
    // `inst-algo-du-close-first`), before draining or querying it even once,
    // so `ext-b`'s registration is rejected synchronously within its own
    // serialized operation and never reaches the router at all — closing
    // the exact final-query gap `inst-algo-du-drain-bounded` describes.
    const plugin = createPlugin();
    const router = createRouterSpy();
    const registry = freshRegistry(plugin, router);
    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory());
    await registry.registerExtension(makeExtension('ext-a'));
    router.calls.length = 0;

    const unregisterDomainDone = registry.unregisterDomain(DOMAIN_ID);
    const registerExtensionDone = registry.registerExtension(makeExtension('ext-b'));
    await expect(registerExtensionDone).rejects.toThrow(/being unregistered/);
    await unregisterDomainDone;

    expect(router.releaseExtension).toHaveBeenCalledWith('ext-a');
    expect(router.releaseExtension).not.toHaveBeenCalledWith('ext-b');
    expect(router.releaseDomain).toHaveBeenCalledWith(DOMAIN_ID);
    // Never admitted: the router never even saw `ext-b`'s registration.
    expect(router.calls).not.toContain('registerExtension:ext-b');

    // Not orphaned: no registry state (router admission or registry's own
    // bookkeeping) was ever created for the extension rejected mid-teardown.
    expect(registry.getExtension('ext-b')).toBeUndefined();
    expect(registry.getExtensionsForDomain(DOMAIN_ID)).toHaveLength(0);

    // The domain id is free again once its own unregistration has settled —
    // the close is scoped to the unregistration in flight, not permanent.
    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory());
    await expect(registry.registerExtension(makeExtension('ext-c'))).resolves.toBeUndefined();

    await registry.dispose();
  });

  it('disposing the registry sends releaseExtension and releaseDomain for every admitted extension and domain it still holds, and issues no command', async () => {
    // inst-me-no-command-outside-action, inst-algo-ra-cleanup-no-command
    const plugin = createPlugin();
    const router = createRouterSpy();
    const registry = freshRegistry(plugin, router);
    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory());
    await registry.registerExtension(makeExtension());
    router.calls.length = 0;

    await registry.dispose();

    expect(router.releaseExtension).toHaveBeenCalledWith(EXTENSION_ID);
    expect(router.releaseDomain).toHaveBeenCalledWith(DOMAIN_ID);
    expect(router.reflect).not.toHaveBeenCalled();
  });

  it('a release that throws is logged and the cleanup completes', async () => {
    const plugin = createPlugin();
    const router = createRouterSpy();
    (router.releaseExtension as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('release boom');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const registry = freshRegistry(plugin, router);
    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory());
    await registry.registerExtension(makeExtension());

    await expect(registry.unregisterExtension(EXTENSION_ID)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
    await registry.dispose();
  });

  it('a router that admits an extension the type system then rejects releases the admission, rethrows the type-system error unchanged, and leaves nothing registered even when the release itself throws', async () => {
    const plugin = createPlugin();
    const router = createRouterSpy();
    (router.releaseExtension as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('release boom');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const registry = freshRegistry(plugin, router);
    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory());

    // Only the extension's own type-system registration must fail here — the
    // domain registration above already exercised `register()` successfully.
    plugin.register = () => {
      throw new Error('invalid extension declaration');
    };

    await expect(registry.registerExtension(makeExtension())).rejects.toThrow(
      'invalid extension declaration'
    );

    // The release error is logged, never swallowed silently and never
    // substituted for the type-system error that propagated.
    expect(errorSpy).toHaveBeenCalled();
    expect(router.releaseExtension).toHaveBeenCalledWith(EXTENSION_ID);
    expect(registry.getExtension(EXTENSION_ID)).toBeUndefined();
    expect(registry.getExtensionsForDomain(DOMAIN_ID)).toHaveLength(0);

    errorSpy.mockRestore();
    await registry.dispose();
  });

  it('a router that admits a domain the type system then rejects releases the admission once, throws a DomainValidationError, and leaves nothing registered', async () => {
    const plugin = createPlugin();
    const router = createRouterSpy();
    const registry = freshRegistry(plugin, router);
    const original = plugin.register;
    plugin.register = () => {
      throw new Error('invalid domain declaration');
    };

    expect(() => registry.registerDomain(makeDomain(), new ConcurrentDomainFactory())).toThrow(DomainValidationError);
    expect(router.releaseDomain).toHaveBeenCalledTimes(1);
    expect(router.releaseDomain).toHaveBeenCalledWith(DOMAIN_ID);
    expect(registry.getDomain(DOMAIN_ID)).toBeUndefined();

    // Nothing remains: the corrected declaration registers.
    plugin.register = original;
    expect(() => registry.registerDomain(makeDomain(), new ConcurrentDomainFactory())).not.toThrow();
    await registry.dispose();
  });

  it('a domain implementation factory that throws presents nothing to the router and registers nothing', async () => {
    const plugin = createPlugin();
    const router = createRouterSpy();
    const registry = freshRegistry(plugin, router);
    class ThrowingFactory extends ExtensionDomainImplementationFactory {
      build(): never {
        throw new Error('factory refuses');
      }
    }

    expect(() => registry.registerDomain(makeDomain(), new ThrowingFactory())).toThrow('factory refuses');
    expect(router.registerDomain).not.toHaveBeenCalled();
    expect(router.releaseDomain).not.toHaveBeenCalled();
    expect(registry.getDomain(DOMAIN_ID)).toBeUndefined();
    expect(() => registry.registerDomain(makeDomain(), new ConcurrentDomainFactory())).not.toThrow();
    await registry.dispose();
  });

  it('an extension whose domain contract matching fails is rejected before any router call and before anything is stored', async () => {
    const plugin = createPlugin();
    const router = createRouterSpy();
    const registry = freshRegistry(plugin, router);
    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory());
    const needy = `${ENTRY_ID}.needs`;
    plugin.registerSchema({
      $id: needy,
      id: needy,
      requiredProperties: ['cti.example.property~missing.v1'],
      actions: [],
      domainActions: [],
    });

    await expect(
      registry.registerExtension({ id: EXTENSION_ID, domain: DOMAIN_ID, entry: needy, route: EXTENSION_ROUTE } as Extension)
    ).rejects.toThrow('Contract validation failed');

    expect(router.registerExtension).not.toHaveBeenCalled();
    expect(registry.getExtension(EXTENSION_ID)).toBeUndefined();
    expect(registry.getExtensionsForDomain(DOMAIN_ID)).toHaveLength(0);
    await registry.dispose();
  });

  it('a registry built with no router presents nothing, releases nothing, and behaves exactly as without a router', async () => {
    const plugin = createPlugin();
    const registry = freshRegistry(plugin, undefined);
    const factory = new ConcurrentDomainFactory();
    registry.registerDomain(makeDomain(), factory);
    await registry.registerExtension(makeExtension());

    const mounter = registry.getMounter(DOMAIN_ID);
    mounter.attach(document.createElement('div'));
    await mounter.mount(EXTENSION_ID, document.createElement('div'));
    expect(mountedIn(registry, DOMAIN_ID)).toContain(EXTENSION_ID);

    await registry.unregisterExtension(EXTENSION_ID);
    expect(registry.getExtension(EXTENSION_ID)).toBeUndefined();

    await registry.dispose();
  });
});
