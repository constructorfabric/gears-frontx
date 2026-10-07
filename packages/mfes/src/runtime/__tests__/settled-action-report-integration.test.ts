/**
 * Settled-action report, driven through a real `DefaultMfeRegistry` with a
 * recording `RouterPort` and the real `OptionalMountStrategy` /
 * `ExclusiveMountStrategy` implementations
 * (`cpt-frontx-algo-extension-domain-governance-mount-execution`
 * `inst-me-report-settled`, `inst-me-report-mounted-unmounted`,
 * `inst-me-report-internal-releases`, `inst-me-report-nested-excluded`,
 * `inst-me-report-failed-execution`, `inst-me-report-empty-execution`,
 * `inst-me-no-report-outside-action`, `inst-me-exclusive-unmount-fails`,
 * `cpt-frontx-dod-extension-domain-governance-settled-action-report`).
 *
 * Complements `settled-action-report.test.ts` (isolated
 * `MountExtActionHandler`/`UnmountExtActionHandler` unit tests) with cases
 * that need a real strategy's physical mounts, unmounts, displacement and
 * eviction, or a real nested registry, to observe: the one report of an
 * execution lists every extension that execution physically mounted and
 * unmounted, and nothing outside an action execution is reported.
 */
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
import { OptionalMountStrategy } from '../OptionalMountStrategy';
import { ExclusiveMountStrategy } from '../ExclusiveMountStrategy';
import type { ContainerHooks, MountStrategy } from '../MountStrategy';
import { ActionHandler } from '../../mediator/ActionHandler';
import type { DefaultActionsChainsMediator } from '../../mediator/DefaultActionsChainsMediator';
import type { RouterPort, SettledActionReport } from '../../router/RouterPort';
import type { MfeRegistry } from '../../registry/MfeRegistry';

const ACTION_LOAD_EXT = 'mock.action.v1~load_ext.v1~';
const ACTION_MOUNT_EXT = 'mock.action.v1~mount_ext.v1~';
const ACTION_UNMOUNT_EXT = 'mock.action.v1~unmount_ext.v1~';
const STAGE_INIT = 'mock.stage.v1~init.v1';
const STAGE_ACTIVATED = 'mock.stage.v1~activated.v1';
const STAGE_DEACTIVATED = 'mock.stage.v1~deactivated.v1';
const STAGE_DESTROYED = 'mock.stage.v1~destroyed.v1';
const ENTRY_ID = 'mock.entry.v1~widget.v1';

interface MockSchema { $id?: string }

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
    $id: ENTRY_ID, id: ENTRY_ID, requiredProperties: [], actions: [], domainActions: [],
  };
  plugin.registerSchema(entry as unknown as MockSchema);
}

class StubHandler extends MfeHandler {
  readonly bridgeFactory = new MfeBridgeFactoryDefault();
  async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return { mount: () => {}, unmount: () => {} };
  }
}

/**
 * A handler whose lifecycle `mount` awaits an externally-controlled gate
 * before settling, for every subject — used only to hold the burst test's
 * "running" entry (A) open long enough for B and C to queue up and be
 * replaced while pending, deterministically (no sleep, no poll). Once
 * resolved, the gate is already open for any later subject (D) that reaches
 * it, so it never delays them.
 */
class GatedMountHandler extends MfeHandler {
  readonly bridgeFactory = new MfeBridgeFactoryDefault();
  constructor(entryId: string, private readonly gate: Promise<void>) { super(entryId); }
  async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return {
      mount: async () => { await this.gate; },
      unmount: () => {},
    };
  }
}

/**
 * A handler whose lifecycle `mount` throws while `failMounts` is set —
 * a mount that fails after its extension's container was created.
 */
class ToggleMountHandler extends MfeHandler {
  readonly bridgeFactory = new MfeBridgeFactoryDefault();
  failMounts = false;
  async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return {
      mount: () => { if (this.failMounts) throw new Error('lifecycle mount failed'); },
      unmount: () => {},
    };
  }
}

class TestHooks implements ContainerHooks {
  create(): Element { return document.createElement('div'); }
  destroy(): void { /* no-op */ }
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

function makeExtension(id: string, domain: string): Extension {
  return { id, domain, entry: ENTRY_ID } as Extension;
}

function makeDomain(id: string): ExtensionDomain {
  return {
    id,
    actions: [ACTION_LOAD_EXT, ACTION_MOUNT_EXT, ACTION_UNMOUNT_EXT],
    extensionsActions: [],
    sharedProperties: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
    extensionsTypeId: '',
  } as unknown as ExtensionDomain;
}

class ConcurrentDomainImpl extends ExtensionDomainImplementation {
  constructor(ctx: DomainContext, readonly strategy: ConcurrentMountStrategy) {
    super();
    ctx.registerHandler(ACTION_MOUNT_EXT, ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as { subject: string })));
    ctx.registerHandler(ACTION_UNMOUNT_EXT, ActionHandler.fromFunction((_t, p) => this.strategy.unmount!(p as { subject: string })));
  }
  protected getMountStrategies(): MountStrategy[] { return [this.strategy]; }
}

class ConcurrentDomainFactory extends ExtensionDomainImplementationFactory {
  readonly hooks = new TestHooks();
  build(ctx: DomainContext): ConcurrentDomainImpl {
    return new ConcurrentDomainImpl(ctx, new ConcurrentMountStrategy(ctx.mounter, this.hooks));
  }
}

class OptionalDomainImpl extends ExtensionDomainImplementation {
  constructor(ctx: DomainContext, readonly strategy: OptionalMountStrategy) {
    super();
    ctx.registerHandler(ACTION_MOUNT_EXT, ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as { subject: string })));
    ctx.registerHandler(ACTION_UNMOUNT_EXT, ActionHandler.fromFunction((_t, p) => this.strategy.unmount!(p as { subject: string })));
  }
  protected getMountStrategies(): MountStrategy[] { return [this.strategy]; }
}

class OptionalDomainFactory extends ExtensionDomainImplementationFactory {
  readonly hooks = new TestHooks();
  strategy!: OptionalMountStrategy;
  constructor(private readonly reg: MfeRegistry, private readonly domainId: string) { super(); }
  build(ctx: DomainContext): OptionalDomainImpl {
    this.strategy = new OptionalMountStrategy(ctx.mounter, this.hooks, this.reg, this.domainId);
    return new OptionalDomainImpl(ctx, this.strategy);
  }
}

class ExclusiveDomainImpl extends ExtensionDomainImplementation {
  constructor(ctx: DomainContext, readonly strategy: ExclusiveMountStrategy) {
    super();
    ctx.registerHandler(ACTION_MOUNT_EXT, ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as { subject: string })));
    ctx.registerHandler(ACTION_UNMOUNT_EXT, ActionHandler.fromFunction((_t, p) => this.strategy.unmount!(p as { subject: string })));
  }
  protected getMountStrategies(): MountStrategy[] { return [this.strategy]; }
}

class ExclusiveDomainFactory extends ExtensionDomainImplementationFactory {
  readonly hooks = new TestHooks();
  strategy!: ExclusiveMountStrategy;
  constructor(private readonly reg: MfeRegistry, private readonly domainId: string) { super(); }
  build(ctx: DomainContext): ExclusiveDomainImpl {
    this.strategy = new ExclusiveMountStrategy(ctx.mounter, this.hooks, this.reg, this.domainId);
    return new ExclusiveDomainImpl(ctx, this.strategy);
  }
}

/** A router test double recording every `reportSettled` call it receives, in order. */
function createRouterSpy(): RouterPort & { reports: SettledActionReport[] } {
  const reports: SettledActionReport[] = [];
  return {
    reports,
    registerDomain: () => {},
    registerExtension: () => {},
    releaseDomain: () => {},
    releaseExtension: () => {},
    assignOccupantValue: () => undefined,
    reportSettled: vi.fn((report: SettledActionReport) => { reports.push(report); }),
    supplyNavigation: () => {},
  };
}

function freshRegistry(
  plugin: TypeSystemPlugin<MockSchema>,
  router: RouterPort,
  handler: MfeHandler = new StubHandler(ENTRY_ID)
): DefaultMfeRegistry {
  registerEntrySchema(plugin);
  return new DefaultMfeRegistry({ typeSystem: plugin, mfeHandlers: [handler], router });
}

type StrategyName = 'concurrent' | 'optional' | 'exclusive';

function factoryFor(name: StrategyName, registry: DefaultMfeRegistry, domainId: string): ExtensionDomainImplementationFactory {
  if (name === 'concurrent') return new ConcurrentDomainFactory();
  if (name === 'optional') return new OptionalDomainFactory(registry, domainId);
  return new ExclusiveDomainFactory(registry, domainId);
}

/** The report's exact members: no action type, payload or outcome; `history` only when given. */
function expectReport(
  report: SettledActionReport,
  expected: { domainId: string; mounted: string[]; unmounted: string[]; history?: 'push' | 'replace' }
): void {
  expect(Object.keys(report).sort()).toEqual(
    ['domainId', 'mounted', 'unmounted', ...(expected.history ? ['history'] : [])].sort()
  );
  expect([...report.mounted].sort()).toEqual([...expected.mounted].sort());
  expect([...report.unmounted].sort()).toEqual([...expected.unmounted].sort());
  expect(report.domainId).toBe(expected.domainId);
  expect(report.history).toBe(expected.history);
}

/**
 * Dispatches one chain and resolves when its `next` (resolves `'next'`) or
 * its `fallback` (resolves `'fallback'`) probe runs.
 */
function runChain(
  registry: DefaultMfeRegistry,
  domainId: string,
  type: string,
  payload: { subject: string; history?: 'push' | 'replace' },
  tag: string
): Promise<'next' | 'fallback'> {
  const next = wireProbe(registry, domainId, `${tag}-next`).then(() => 'next' as const);
  const fallback = wireProbe(registry, domainId, `${tag}-fallback`).then(() => 'fallback' as const);
  registry.executeActionsChain({
    action: { type, target: domainId, payload },
    next: { action: { type: `${tag}-next`, target: domainId, payload: {} } },
    fallback: { action: { type: `${tag}-fallback`, target: domainId, payload: {} } },
  });
  return Promise.race([next, fallback]);
}

/** Registers a one-off domain-scoped probe action resolving the returned deferred when its handler runs. */
function wireProbe(registry: DefaultMfeRegistry, domainId: string, actionType: string): Promise<void> {
  const deferred = createDeferred();
  const mediator = (registry as unknown as { mediator: DefaultActionsChainsMediator }).mediator;
  mediator.registerHandler(domainId, actionType, ActionHandler.fromFunction(async () => { deferred.resolve(); }));
  return deferred.promise;
}


/** A registry with a domain of the given strategy, extensions registered and the slot attached. */
async function setup(
  name: StrategyName,
  domainId: string,
  extensionIds: string[],
  handler?: MfeHandler
): Promise<{ registry: DefaultMfeRegistry; router: ReturnType<typeof createRouterSpy> }> {
  const router = createRouterSpy();
  const registry = freshRegistry(createPlugin(), router, handler);
  registry.registerDomain(makeDomain(domainId), factoryFor(name, registry, domainId));
  for (const id of extensionIds) {
    await registry.registerExtension(makeExtension(id, domainId));
  }
  registry.getMounter(domainId).attach(document.createElement('div'));
  return { registry, router };
}

describe('settled-action report — contents of the one report per execution', () => {
  for (const name of ['concurrent', 'optional', 'exclusive'] as const) {
    it(`[${name}] a fresh mount reports once, listing the subject as mounted and nothing unmounted, before the chain continues`, async () => {
      const domainId = `domain-fresh-${name}`;
      const { registry, router } = await setup(name, domainId, ['ext-a']);
      const seenAtNext: number[] = [];
      const nextRan = deferredProbe(registry, domainId, 'fresh-next', () => seenAtNext.push(router.reports.length));

      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
        next: { action: { type: 'fresh-next', target: domainId, payload: {} } },
      });
      await nextRan;

      expect(seenAtNext).toEqual([1]);
      expect(router.reports).toHaveLength(1);
      expectReport(router.reports[0], { domainId, mounted: ['ext-a'], unmounted: [] });

      registry.dispose();
    });

    it(`[${name}] the history intent of a mount is a top-level report member equal to the action's value`, async () => {
      const domainId = `domain-history-${name}`;
      const { registry, router } = await setup(name, domainId, ['ext-a']);

      await runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-a', history: 'replace' }, 'history');

      expect(router.reports).toHaveLength(1);
      expectReport(router.reports[0], { domainId, mounted: ['ext-a'], unmounted: [], history: 'replace' });

      registry.dispose();
    });
  }

  it('[concurrent] a fresh mount whose lifecycle mount throws reports once with nothing mounted and nothing unmounted, and the chain takes its fallback', async () => {
    const domainId = 'domain-concurrent-failed-empty';
    const handler = new ToggleMountHandler(ENTRY_ID);
    const { registry, router } = await setup('concurrent', domainId, ['ext-a'], handler);
    handler.failMounts = true;

    const settled = await runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-a' }, 'failed-empty');

    expect(settled).toBe('fallback');
    expect(router.reports).toHaveLength(1);
    expectReport(router.reports[0], { domainId, mounted: [], unmounted: [] });
    expect(registry.getMountedExtensions(domainId)).toEqual([]);

    registry.dispose();
  });

  for (const name of ['concurrent', 'optional'] as const) {
    it(`[${name}] an explicit unmount of a mounted extension reports once, listing it as unmounted and nothing mounted`, async () => {
      const domainId = `domain-unmount-${name}`;
      const { registry, router } = await setup(name, domainId, ['ext-a']);
      await runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-a' }, 'unmount-prep');
      router.reports.length = 0;

      const settled = await runChain(registry, domainId, ACTION_UNMOUNT_EXT, { subject: 'ext-a', history: 'push' }, 'unmount');

      expect(settled).toBe('next');
      expect(registry.getMountedExtensions(domainId)).toEqual([]);
      expect(router.reports).toHaveLength(1);
      expectReport(router.reports[0], { domainId, mounted: [], unmounted: ['ext-a'], history: 'push' });

      registry.dispose();
    });
  }

  it('Optional: a mount that displaces the prior occupant produces one report — incoming mounted, displaced unmounted — and none for the displaced extension', async () => {
    const domainId = 'domain-optional-displace';
    const { registry, router } = await setup('optional', domainId, ['ext-a', 'ext-b']);
    await runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-a' }, 'optional-displace-a');
    expect(registry.getMountedExtensions(domainId)).toEqual(['ext-a']);
    router.reports.length = 0;

    await runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-b' }, 'optional-displace-b');

    expect(registry.getMountedExtensions(domainId)).toEqual(['ext-b']);
    expect(router.reports).toHaveLength(1);
    expectReport(router.reports[0], { domainId, mounted: ['ext-b'], unmounted: ['ext-a'] });

    registry.dispose();
  });

  it('Exclusive: a mount that evicts the prior occupant produces one report — incoming mounted, evicted unmounted — and none for the evicted extension', async () => {
    const domainId = 'domain-exclusive-evict';
    const { registry, router } = await setup('exclusive', domainId, ['ext-a', 'ext-b']);
    await runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-a' }, 'exclusive-evict-a');
    expect(registry.getMountedExtensions(domainId)).toEqual(['ext-a']);
    router.reports.length = 0;

    await runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-b' }, 'exclusive-evict-b');

    expect(registry.getMountedExtensions(domainId)).toEqual(['ext-b']);
    expect(router.reports).toHaveLength(1);
    expectReport(router.reports[0], { domainId, mounted: ['ext-b'], unmounted: ['ext-a'] });

    registry.dispose();
  });

  it('Exclusive: an incoming mount that fails after evicting the occupant reports the evicted extension as unmounted and nothing as mounted, and the chain takes its fallback', async () => {
    const domainId = 'domain-exclusive-evict-then-fail';
    const handler = new ToggleMountHandler(ENTRY_ID);
    const { registry, router } = await setup('exclusive', domainId, ['ext-a', 'ext-b'], handler);
    await runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-a' }, 'evict-fail-a');
    router.reports.length = 0;
    handler.failMounts = true;

    const settled = await runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-b' }, 'evict-fail-b');

    expect(settled).toBe('fallback');
    expect(registry.getMountedExtensions(domainId)).toEqual([]);
    expect(router.reports).toHaveLength(1);
    expectReport(router.reports[0], { domainId, mounted: [], unmounted: ['ext-a'] });

    registry.dispose();
  });
});

describe('settled-action report — Exclusive domain unmount_ext', () => {
  it('fails (the chain takes its fallback), leaves the occupant mounted, and sends no report', async () => {
    const domainId = 'domain-exclusive-unmount';
    const { registry, router } = await setup('exclusive', domainId, ['ext-a']);
    await runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-a' }, 'exclusive-unmount-prep');
    expect(registry.getMountedExtensions(domainId)).toEqual(['ext-a']);
    router.reports.length = 0;

    const settled = await runChain(registry, domainId, ACTION_UNMOUNT_EXT, { subject: 'ext-a' }, 'exclusive-unmount');

    expect(settled).toBe('fallback');
    expect(registry.getMountedExtensions(domainId)).toEqual(['ext-a']);
    expect(router.reports).toHaveLength(0);

    registry.dispose();
  });
});

describe('settled-action report — nested occupants of a replaced host', () => {
  it('a mount that replaces a host extension produces one report in the parent registry that omits the nested occupants; the nested registry reports nothing', async () => {
    const hostDomainId = 'domain-host-exclusive';
    const nestedDomainId = 'domain-nested-concurrent';
    const parentRouter = createRouterSpy();
    const nestedRouter = createRouterSpy();
    let nestedRegistry: DefaultMfeRegistry | undefined;
    // Resolves once the nested registration/mount fired from inside the host's
    // own `mount` — not awaited by it — has itself settled.
    const nestedMountSettled = createDeferred();

    class HostExtensionHandler extends MfeHandler {
      readonly bridgeFactory = new MfeBridgeFactoryDefault();
      async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
        return {
          // Builds a nested registry inside `mount` and admits one mounted
          // extension into it, so the host's own eventual teardown (slot
          // detach, `cpt-frontx-algo-extension-domain-governance-slot-detach`)
          // has a nested occupant to release.
          mount: () => {
            const nestedPlugin = createPlugin();
            registerEntrySchema(nestedPlugin);
            nestedRegistry = new DefaultMfeRegistry({
              typeSystem: nestedPlugin,
              mfeHandlers: [new StubHandler(ENTRY_ID)],
              router: nestedRouter,
            });
            nestedRegistry.registerDomain(
              makeDomain(nestedDomainId),
              new OptionalDomainFactory(nestedRegistry, nestedDomainId)
            );
            void nestedRegistry.registerExtension(makeExtension('nested-ext', nestedDomainId)).then(() => {
              nestedRegistry!.getMounter(nestedDomainId).attach(document.createElement('div'));
              return nestedRegistry!.getMounter(nestedDomainId).mount('nested-ext', document.createElement('div'));
            }).then(nestedMountSettled.resolve, nestedMountSettled.resolve);
          },
          unmount: () => {},
        };
      }
    }

    const plugin = createPlugin();
    registerEntrySchema(plugin);
    const registry = new DefaultMfeRegistry({
      typeSystem: plugin,
      mfeHandlers: [new HostExtensionHandler(ENTRY_ID)],
      router: parentRouter,
    });
    registry.registerDomain(makeDomain(hostDomainId), new ExclusiveDomainFactory(registry, hostDomainId));
    await registry.registerExtension(makeExtension('host-ext', hostDomainId));
    await registry.registerExtension(makeExtension('replacement-ext', hostDomainId));
    registry.getMounter(hostDomainId).attach(document.createElement('div'));

    await runChain(registry, hostDomainId, ACTION_MOUNT_EXT, { subject: 'host-ext' }, 'host-mount');
    await nestedMountSettled.promise;
    expect(nestedRegistry?.getMountedExtensions(nestedDomainId)).toEqual(['nested-ext']);
    // Only the replacement's own report is under test below.
    parentRouter.reports.length = 0;
    nestedRouter.reports.length = 0;

    await runChain(registry, hostDomainId, ACTION_MOUNT_EXT, { subject: 'replacement-ext' }, 'replacement-mount');

    expect(nestedRegistry?.getMountedExtensions(nestedDomainId)).toEqual([]);
    expect(parentRouter.reports).toHaveLength(1);
    expectReport(parentRouter.reports[0], {
      domainId: hostDomainId,
      mounted: ['replacement-ext'],
      unmounted: ['host-ext'],
    });
    expect(parentRouter.reports[0].unmounted).not.toContain('nested-ext');
    expect(nestedRouter.reports).toHaveLength(0);

    nestedRegistry?.dispose();
    registry.dispose();
  });
});

describe('settled-action report — events outside an action execution', () => {
  for (const name of ['concurrent', 'optional', 'exclusive'] as const) {
    it(`[${name}] a slot detach sends no report`, async () => {
      const domainId = `domain-detach-${name}`;
      const { registry, router } = await setup(name, domainId, ['ext-a']);
      await runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-a' }, 'detach-prep');
      router.reports.length = 0;

      await registry.getMounter(domainId).detach();

      expect(registry.getMountedExtensions(domainId)).toEqual([]);
      expect(router.reports).toHaveLength(0);

      registry.dispose();
    });

    it(`[${name}] unregistering a mounted extension sends no report`, async () => {
      const domainId = `domain-unregister-ext-${name}`;
      const { registry, router } = await setup(name, domainId, ['ext-a']);
      await runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-a' }, 'unregister-ext-prep');
      router.reports.length = 0;

      await registry.unregisterExtension('ext-a');

      expect(registry.getMountedExtensions(domainId)).toEqual([]);
      expect(router.reports).toHaveLength(0);

      registry.dispose();
    });

    it(`[${name}] unregistering a domain with a mounted extension sends no report`, async () => {
      const domainId = `domain-unregister-domain-${name}`;
      const { registry, router } = await setup(name, domainId, ['ext-a']);
      await runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-a' }, 'unregister-domain-prep');
      router.reports.length = 0;

      await registry.unregisterDomain(domainId);

      expect(router.reports).toHaveLength(0);

      registry.dispose();
    });

    it(`[${name}] terminal disposal with a mounted extension sends no report`, async () => {
      const domainId = `domain-dispose-${name}`;
      const { registry, router } = await setup(name, domainId, ['ext-a']);
      await runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-a' }, 'dispose-prep');
      router.reports.length = 0;

      registry.dispose();

      expect(router.reports).toHaveLength(0);
    });
  }
});

describe('settled-action report — burst', () => {
  for (const strategyName of ['optional', 'exclusive'] as const) {
    it(`[${strategyName}] burst: mount(A) running, mount(B) and mount(C) replaced while pending, mount(D) runs next — exactly two reports: mounted [A], then mounted [D] with unmounted [A]`, async () => {
      const domainId = `domain-burst-report-${strategyName}`;
      const gate = createDeferred();
      const router = createRouterSpy();
      const registry = freshRegistry(createPlugin(), router, new GatedMountHandler(ENTRY_ID, gate.promise));
      registry.registerDomain(makeDomain(domainId), factoryFor(strategyName, registry, domainId));
      for (const id of ['ext-a', 'ext-b', 'ext-c', 'ext-d']) {
        await registry.registerExtension(makeExtension(id, domainId));
      }
      registry.getMounter(domainId).attach(document.createElement('div'));

      const aFired = wireProbe(registry, domainId, 'burst-report-a-next');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
        next: { action: { type: 'burst-report-a-next', target: domainId, payload: {} } },
      });

      const bFallback = wireProbe(registry, domainId, 'burst-report-b-fallback');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-b' } },
        fallback: { action: { type: 'burst-report-b-fallback', target: domainId, payload: {} } },
      });
      const cFallback = wireProbe(registry, domainId, 'burst-report-c-fallback');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-c' } },
        fallback: { action: { type: 'burst-report-c-fallback', target: domainId, payload: {} } },
      });
      const dFired = wireProbe(registry, domainId, 'burst-report-d-next');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-d' } },
        next: { action: { type: 'burst-report-d-next', target: domainId, payload: {} } },
      });

      // B and C are replaced while pending, well before the gate opens.
      await Promise.all([bFallback, cFallback]);

      gate.resolve();
      await Promise.all([aFired, dFired]);

      expect(router.reports).toHaveLength(2);
      expectReport(router.reports[0], { domainId, mounted: ['ext-a'], unmounted: [] });
      expectReport(router.reports[1], { domainId, mounted: ['ext-d'], unmounted: ['ext-a'] });
      expect(registry.getMountedExtensions(domainId)).toEqual(['ext-d']);

      registry.dispose();
    });
  }
});

/** Registers a domain-scoped probe action whose handler runs `onRun` and resolves the returned promise. */
function deferredProbe(registry: DefaultMfeRegistry, domainId: string, actionType: string, onRun: () => void): Promise<void> {
  const deferred = createDeferred();
  const mediator = (registry as unknown as { mediator: DefaultActionsChainsMediator }).mediator;
  mediator.registerHandler(domainId, actionType, ActionHandler.fromFunction(async () => { onRun(); deferred.resolve(); }));
  return deferred.promise;
}

/**
 * A handler whose lifecycle `mount` signals that it has started, awaits a
 * gate, then either settles or throws; its lifecycle `unmount` throws while
 * `failUnmounts` is set.
 */
class ObservedLifecycleHandler extends MfeHandler {
  readonly bridgeFactory = new MfeBridgeFactoryDefault();
  readonly mountStarted = createDeferred();
  failUnmounts = false;
  constructor(entryId: string, private readonly gate: Promise<void> = Promise.resolve(), private readonly failAfterGate = false) {
    super(entryId);
  }
  async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return {
      mount: async () => {
        this.mountStarted.resolve();
        await this.gate;
        if (this.failAfterGate) throw new Error('lifecycle mount failed');
      },
      unmount: () => { if (this.failUnmounts) throw new Error('lifecycle unmount failed'); },
    };
  }
}

describe('settled-action report — failed explicit unmount', () => {
  for (const name of ['concurrent', 'optional'] as const) {
    it(`[${name}] an explicit unmount whose execution fails reports once, before the chain takes its fallback`, async () => {
      const domainId = `domain-unmount-fails-${name}`;
      const handler = new ObservedLifecycleHandler(ENTRY_ID);
      const { registry, router } = await setup(name, domainId, ['ext-a'], handler);
      await runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-a' }, 'unmount-fails-prep');
      router.reports.length = 0;
      handler.failUnmounts = true;

      const seenAtFallback: number[] = [];
      const fallbackRan = deferredProbe(registry, domainId, 'unmount-fails-fallback', () => seenAtFallback.push(router.reports.length));
      registry.executeActionsChain({
        action: { type: ACTION_UNMOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
        fallback: { action: { type: 'unmount-fails-fallback', target: domainId, payload: {} } },
      });
      await fallbackRan;

      expect(seenAtFallback).toEqual([1]);
      expect(router.reports).toHaveLength(1);
      expectReport(router.reports[0], { domainId, mounted: [], unmounted: ['ext-a'] });

      registry.dispose();
    });
  }
});

describe('settled-action report — Exclusive unmount_ext is outside the occupancy queue', () => {
  it('fails while a gated Exclusive mount is still running, without waiting for it, and takes no queue slot', async () => {
    const domainId = 'domain-exclusive-unmount-unqueued';
    const gate = createDeferred();
    const handler = new ObservedLifecycleHandler(ENTRY_ID, gate.promise);
    const { registry, router } = await setup('exclusive', domainId, ['ext-a', 'ext-b'], handler);

    const aSettled = runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-a' }, 'excl-unq-a');
    await handler.mountStarted.promise;

    // The gate is still closed: had the unmount queued behind the running
    // mount it could not have failed yet.
    const unmountSettled = await runChain(registry, domainId, ACTION_UNMOUNT_EXT, { subject: 'ext-a' }, 'excl-unq-unmount');
    expect(unmountSettled).toBe('fallback');
    expect(router.reports).toHaveLength(0);

    // A following mount queues as the pending entry and runs once A settles.
    const bSettled = runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-b' }, 'excl-unq-b');
    gate.resolve();
    expect(await aSettled).toBe('next');
    expect(await bSettled).toBe('next');

    expect(router.reports).toHaveLength(2);
    expectReport(router.reports[0], { domainId, mounted: ['ext-a'], unmounted: [] });
    expectReport(router.reports[1], { domainId, mounted: ['ext-b'], unmounted: ['ext-a'] });

    registry.dispose();
  });
});

describe('settled-action report — requests that never run the strategy', () => {
  for (const name of ['optional', 'exclusive'] as const) {
    it(`[${name}] a request refused while its domain is being unregistered reports nothing`, async () => {
      const domainId = `domain-refused-${name}`;
      const gate = createDeferred();
      const handler = new ObservedLifecycleHandler(ENTRY_ID, gate.promise);
      const { registry, router } = await setup(name, domainId, ['ext-a', 'ext-b'], handler);

      // The continuations live in a separate domain: the domain being
      // unregistered no longer hosts handlers.
      const probeDomainId = `${domainId}-probes`;
      registry.registerDomain(makeDomain(probeDomainId), new ConcurrentDomainFactory());

      const aNext = wireProbe(registry, probeDomainId, 'refused-a-next');
      const aFallback = wireProbe(registry, probeDomainId, 'refused-a-fallback');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
        next: { action: { type: 'refused-a-next', target: probeDomainId, payload: {} } },
        fallback: { action: { type: 'refused-a-fallback', target: probeDomainId, payload: {} } },
      });
      await handler.mountStarted.promise;
      const unregistered = registry.unregisterDomain(domainId);

      const refusedFallback = wireProbe(registry, probeDomainId, 'refused-b-fallback');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-b' } },
        fallback: { action: { type: 'refused-b-fallback', target: probeDomainId, payload: {} } },
      });
      await refusedFallback;

      gate.resolve();
      const aOutcome = await Promise.race([aNext.then(() => 'next'), aFallback.then(() => 'fallback')]);
      await unregistered;

      // The running mount is unregistered mid-mount and fails; its one
      // execution is reported empty. The refused request is not an execution.
      expect(aOutcome).toBe('fallback');
      expect(router.reports).toHaveLength(1);
      expectReport(router.reports[0], { domainId, mounted: [], unmounted: [] });

      registry.dispose();
    });

    it(`[${name}] a request joining a running entry shares its one execution: one report in total`, async () => {
      const domainId = `domain-joined-${name}`;
      const gate = createDeferred();
      const handler = new ObservedLifecycleHandler(ENTRY_ID, gate.promise);
      const { registry, router } = await setup(name, domainId, ['ext-a'], handler);

      const first = runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-a' }, 'joined-first');
      await handler.mountStarted.promise;
      const second = runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-a' }, 'joined-second');
      gate.resolve();

      expect(await first).toBe('next');
      expect(await second).toBe('next');
      expect(router.reports).toHaveLength(1);
      expectReport(router.reports[0], { domainId, mounted: ['ext-a'], unmounted: [] });

      registry.dispose();
    });
  }

  it('[concurrent] an unmount whose awaited mount failed completes without a report of its own', async () => {
    const domainId = 'domain-unmount-after-failed-mount';
    const gate = createDeferred();
    const handler = new ObservedLifecycleHandler(ENTRY_ID, gate.promise, true);
    const { registry, router } = await setup('concurrent', domainId, ['ext-a'], handler);

    const mountSettled = runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-a' }, 'awaited-mount');
    await handler.mountStarted.promise;
    const unmountSettled = runChain(registry, domainId, ACTION_UNMOUNT_EXT, { subject: 'ext-a' }, 'awaited-unmount');
    gate.resolve();

    expect(await mountSettled).toBe('fallback');
    expect(await unmountSettled).toBe('next');
    expect(router.reports).toHaveLength(1);
    expectReport(router.reports[0], { domainId, mounted: [], unmounted: [] });

    registry.dispose();
  });
});

describe('settled-action report — registry built with no router', () => {
  for (const name of ['concurrent', 'optional', 'exclusive'] as const) {
    it(`[${name}] mounts and unmounts run as usual and nothing is reported`, async () => {
      const domainId = `domain-no-router-${name}`;
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const plugin = createPlugin();
      registerEntrySchema(plugin);
      const registry = new DefaultMfeRegistry({ typeSystem: plugin, mfeHandlers: [new StubHandler(ENTRY_ID)] });
      registry.registerDomain(makeDomain(domainId), factoryFor(name, registry, domainId));
      await registry.registerExtension(makeExtension('ext-a', domainId));
      registry.getMounter(domainId).attach(document.createElement('div'));

      expect(await runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-a' }, 'no-router-mount')).toBe('next');
      expect(registry.getMountedExtensions(domainId)).toEqual(['ext-a']);
      if (name !== 'exclusive') {
        expect(await runChain(registry, domainId, ACTION_UNMOUNT_EXT, { subject: 'ext-a' }, 'no-router-unmount')).toBe('next');
        expect(registry.getMountedExtensions(domainId)).toEqual([]);
      }
      expect(errorSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
      registry.dispose();
    });
  }
});

/** A handler whose lifecycle `mount` signals its subject has started and awaits that subject's own gate. */
class PerSubjectGateHandler extends MfeHandler {
  readonly bridgeFactory = new MfeBridgeFactoryDefault();
  readonly started = new Map<string, ReturnType<typeof createDeferred>>();
  readonly gates = new Map<string, ReturnType<typeof createDeferred>>();
  constructor(entryId: string, subjects: string[]) {
    super(entryId);
    for (const subject of subjects) {
      this.started.set(subject, createDeferred());
      this.gates.set(subject, createDeferred());
    }
  }
  async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return {
      mount: async (_container, bridge) => {
        this.started.get(bridge.extensionId)!.resolve();
        await this.gates.get(bridge.extensionId)!.promise;
      },
      unmount: () => {},
    };
  }
}

describe('settled-action report — overlapping Concurrent executions', () => {
  it('a mount that completes inside another mount\'s window is reported with only its own extension, and the outer mount with only its own', async () => {
    const domainId = 'domain-concurrent-overlap';
    const handler = new PerSubjectGateHandler(ENTRY_ID, ['ext-a', 'ext-b']);
    const { registry, router } = await setup('concurrent', domainId, ['ext-a', 'ext-b'], handler);

    const aSettled = runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-a' }, 'overlap-a');
    await handler.started.get('ext-a')!.promise;
    const bSettled = runChain(registry, domainId, ACTION_MOUNT_EXT, { subject: 'ext-b' }, 'overlap-b');
    await handler.started.get('ext-b')!.promise;
    handler.gates.get('ext-b')!.resolve();
    expect(await bSettled).toBe('next');
    handler.gates.get('ext-a')!.resolve();
    expect(await aSettled).toBe('next');

    expect(router.reports).toHaveLength(2);
    expectReport(router.reports[0], { domainId, mounted: ['ext-b'], unmounted: [] });
    expectReport(router.reports[1], { domainId, mounted: ['ext-a'], unmounted: [] });

    registry.dispose();
  });
});
