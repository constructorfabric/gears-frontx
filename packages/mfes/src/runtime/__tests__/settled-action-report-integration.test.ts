/**
 * Settled-action report, driven through a real `DefaultMfeRegistry` with a
 * recording `RouterPort` and the real `OptionalMountStrategy` /
 * `ExclusiveMountStrategy` implementations
 * (`cpt-frontx-algo-extension-domain-governance-mount-execution`
 * `inst-me-report-settled`, `inst-me-report-internal-releases`,
 * `inst-me-exclusive-no-public-unmount`,
 * `cpt-frontx-dod-extension-domain-governance-settled-action-report`).
 *
 * Complements `settled-action-report.test.ts` (isolated
 * `MountExtActionHandler`/`UnmountExtActionHandler` unit tests) with cases
 * that need a real strategy's physical eviction/displacement behavior, or a
 * real nested registry, to observe: the internal release a strategy
 * performs is folded into the one report for the mount that caused it, and
 * never reported — or dispatched as `unmount_ext` — on its own.
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
 * superseded while pending, deterministically (no sleep, no poll). Once
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

function makeDomain(id: string, requireUnmount: boolean): ExtensionDomain {
  return {
    id,
    actions: requireUnmount
      ? [ACTION_LOAD_EXT, ACTION_MOUNT_EXT, ACTION_UNMOUNT_EXT]
      : [ACTION_LOAD_EXT, ACTION_MOUNT_EXT],
    extensionsActions: [],
    sharedProperties: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
    extensionsTypeId: '',
  } as unknown as ExtensionDomain;
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

/** Registers a one-off domain-scoped probe action resolving the returned deferred when its handler runs. */
function wireProbe(registry: DefaultMfeRegistry, domainId: string, actionType: string): Promise<void> {
  const deferred = createDeferred();
  const mediator = (registry as unknown as { mediator: DefaultActionsChainsMediator }).mediator;
  mediator.registerHandler(domainId, actionType, ActionHandler.fromFunction(async () => { deferred.resolve(); }));
  return deferred.promise;
}

describe('settled-action report — real Optional/Exclusive strategies through a real registry', () => {
  it('Optional: a mount that displaces the prior occupant produces one report for the mount, none for the displaced extension', async () => {
    const plugin = createPlugin();
    const router = createRouterSpy();
    const domainId = 'domain-optional-displace';
    const registry = freshRegistry(plugin, router);
    registry.registerDomain(makeDomain(domainId, true), new OptionalDomainFactory(registry, domainId));
    await registry.registerExtension(makeExtension('ext-a', domainId));
    await registry.registerExtension(makeExtension('ext-b', domainId));
    registry.getMounter(domainId).attach(document.createElement('div'));

    const aFired = wireProbe(registry, domainId, 'optional-displace-a-next');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'optional-displace-a-next', target: domainId, payload: {} } },
    });
    await aFired;
    expect(registry.getMountedExtensions(domainId)).toEqual(['ext-a']);
    router.reports.length = 0;

    const bFired = wireProbe(registry, domainId, 'optional-displace-b-next');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-b' } },
      next: { action: { type: 'optional-displace-b-next', target: domainId, payload: {} } },
    });
    await bFired;

    expect(registry.getMountedExtensions(domainId)).toEqual(['ext-b']);
    // One report, for the mount that displaced ext-a — none for ext-a itself.
    expect(router.reports).toHaveLength(1);
    expect(router.reports[0]).toMatchObject({
      domainId,
      succeeded: true,
      payload: { subject: 'ext-b' },
    });

    registry.dispose();
  });

  it('Exclusive: a mount that evicts the prior occupant produces one report for the mount, none for the evicted extension', async () => {
    const plugin = createPlugin();
    const router = createRouterSpy();
    const domainId = 'domain-exclusive-evict';
    const registry = freshRegistry(plugin, router);
    registry.registerDomain(makeDomain(domainId, false), new ExclusiveDomainFactory(registry, domainId));
    await registry.registerExtension(makeExtension('ext-a', domainId));
    await registry.registerExtension(makeExtension('ext-b', domainId));
    registry.getMounter(domainId).attach(document.createElement('div'));

    const aFired = wireProbe(registry, domainId, 'exclusive-evict-a-next');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'exclusive-evict-a-next', target: domainId, payload: {} } },
    });
    await aFired;
    expect(registry.getMountedExtensions(domainId)).toEqual(['ext-a']);
    router.reports.length = 0;

    const bFired = wireProbe(registry, domainId, 'exclusive-evict-b-next');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-b' } },
      next: { action: { type: 'exclusive-evict-b-next', target: domainId, payload: {} } },
    });
    await bFired;

    expect(registry.getMountedExtensions(domainId)).toEqual(['ext-b']);
    // One report, for the mount that evicted ext-a — none for ext-a itself.
    expect(router.reports).toHaveLength(1);
    expect(router.reports[0]).toMatchObject({
      domainId,
      succeeded: true,
      payload: { subject: 'ext-b' },
    });

    registry.dispose();
  });

  it('a mount that replaces a host extension produces one report in the parent registry; the nested occupants its teardown releases report nothing in the nested registry', async () => {
    const hostDomainId = 'domain-host-exclusive';
    const nestedDomainId = 'domain-nested-concurrent';
    const parentRouter = createRouterSpy();
    const nestedRouter = createRouterSpy();
    let nestedRegistry: DefaultMfeRegistry | undefined;
    // Resolves once the nested registration/mount `mount()` fires — without
    // awaiting — has itself settled. Captured here, instead of guessed at
    // with a fixed number of `Promise.resolve()` microtask flushes, so the
    // test can await the actual observable event rather than its own guess
    // at how many microtask turns separate it from `hostFired`.
    const nestedMountSettled = createDeferred();

    class HostExtensionHandler extends MfeHandler {
      readonly bridgeFactory = new MfeBridgeFactoryDefault();
      async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
        return {
          // Builds a nested registry synchronously inside `mount` — the
          // window the ambient inbound-bridge rendezvous scopes to — and
          // admits one extension into it, so the host's own eventual
          // teardown (slot detach, `cpt-frontx-algo-extension-domain-
          // governance-slot-detach`) has a nested occupant to release.
          mount: () => {
            const nestedPlugin = createPlugin();
            registerEntrySchema(nestedPlugin);
            nestedRegistry = new DefaultMfeRegistry({
              typeSystem: nestedPlugin,
              mfeHandlers: [new StubHandler(ENTRY_ID)],
              router: nestedRouter,
            });
            nestedRegistry.registerDomain(
              makeDomain(nestedDomainId, true),
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
    registry.registerDomain(makeDomain(hostDomainId, false), new ExclusiveDomainFactory(registry, hostDomainId));
    await registry.registerExtension(makeExtension('host-ext', hostDomainId));
    await registry.registerExtension(makeExtension('replacement-ext', hostDomainId));
    registry.getMounter(hostDomainId).attach(document.createElement('div'));

    const hostFired = wireProbe(registry, hostDomainId, 'host-mount-next');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: hostDomainId, payload: { subject: 'host-ext' } },
      next: { action: { type: 'host-mount-next', target: hostDomainId, payload: {} } },
    });
    await hostFired;
    // Let the host's own nested registration/mount (fired from inside its
    // own `mount`, not awaited by the prologue) settle before proceeding —
    // awaits the actual observable event rather than a fixed number of
    // microtask flushes.
    await nestedMountSettled.promise;
    expect(nestedRegistry?.getMountedExtensions(nestedDomainId)).toEqual(['nested-ext']);
    // Only the replacement's own report is under test below.
    parentRouter.reports.length = 0;
    nestedRouter.reports.length = 0;

    const replacementFired = wireProbe(registry, hostDomainId, 'replacement-mount-next');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: hostDomainId, payload: { subject: 'replacement-ext' } },
      next: { action: { type: 'replacement-mount-next', target: hostDomainId, payload: {} } },
    });
    await replacementFired;

    // One report in the parent registry, for the mount that replaced the host.
    expect(parentRouter.reports).toHaveLength(1);
    expect(parentRouter.reports[0]).toMatchObject({
      domainId: hostDomainId,
      succeeded: true,
      payload: { subject: 'replacement-ext' },
    });
    // The nested occupant's teardown (a slot detach, not an occupancy
    // action) reports nothing to its own registry's router.
    expect(nestedRouter.reports).toHaveLength(0);

    nestedRegistry?.dispose();
    registry.dispose();
  });

  for (const strategyName of ['optional', 'exclusive'] as const) {
    it(`[${strategyName}] burst: mount(A) running, mount(B) and mount(C) superseded while pending, mount(D) runs next — exactly two reports, for A and for D`, async () => {
      const plugin = createPlugin();
      const router = createRouterSpy();
      const domainId = `domain-burst-report-${strategyName}`;
      const gate = createDeferred();
      const registry = freshRegistry(plugin, router, new GatedMountHandler(ENTRY_ID, gate.promise));
      const factory = strategyName === 'optional'
        ? new OptionalDomainFactory(registry, domainId)
        : new ExclusiveDomainFactory(registry, domainId);
      registry.registerDomain(makeDomain(domainId, strategyName === 'optional'), factory);
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
      expect(router.reports.map((r) => (r.payload as { subject: string }).subject)).toEqual(['ext-a', 'ext-d']);
      expect(registry.getMountedExtensions(domainId)).toEqual(['ext-d']);

      registry.dispose();
    });
  }
});
