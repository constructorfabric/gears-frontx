/**
 * End-to-end tests for the mount-ext prologue
 * (`cpt-frontx-algo-extension-domain-governance-mount-execution` prologue
 * instructions) running through the real `DefaultMfeRegistry`, the real
 * `DefaultMountManager` pipeline, and each of the three shipped mount
 * strategies. Complements the isolated wrapper unit tests in
 * `MountExtActionHandler.test.ts`.
 *
 * Every case uses an explicit settlement signal — a controlled deferred the
 * test resolves itself from a domain-local probe handler bound to a chain's
 * `next` or `fallback`, or a real awaited registry/mounter call — never a
 * sleep, a poll, `vi.waitFor`, or a bare microtask flush.
 */
import { describe, it, expect, vi } from 'vitest';
import { DefaultMfeRegistry } from '../DefaultMfeRegistry';
import type { DefaultExtensionMounter } from '../DefaultExtensionMounter';
import type { MfeRegistryConfig } from '../config';
import type { TypeSystemPlugin } from '../../type-substrate';
import type { ExtensionDomain, Extension, MfeEntry } from '../../types';
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
import type { MfeRegistry } from '../../registry/MfeRegistry';
import type { DefaultActionsChainsMediator } from '../../mediator/DefaultActionsChainsMediator';

// ─── Mock type-system plugin (hierarchy-agnostic, own notation) ─────────────

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

/** getSchema needs the entry to satisfy `DefaultExtensionManager`'s `isMfeEntry` duck-typing. */
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

class StubHandler extends MfeHandler {
  readonly bridgeFactory = new MfeBridgeFactoryDefault();
  async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return { mount: () => {}, unmount: () => {} };
  }
}

/** A handler whose lifecycle's own `unmount` throws — makes a physical unmount fail deterministically. */
class ThrowingUnmountHandler extends MfeHandler {
  readonly bridgeFactory = new MfeBridgeFactoryDefault();
  async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return {
      mount: () => {},
      unmount: () => { throw new Error('unmount failed'); },
    };
  }
}

/**
 * A handler whose lifecycle's own `mount` awaits an externally-controlled
 * gate before settling — makes a physical mount genuinely in progress for
 * as long as the test keeps the gate open, deterministically (no sleeps, no
 * polling). Optionally throws once the gate opens, to make the gated mount
 * fail instead of succeed.
 */
class GatedMountHandler extends MfeHandler {
  readonly bridgeFactory = new MfeBridgeFactoryDefault();
  /** Number of times this handler's lifecycle `unmount` has actually run — the physical-unmount count. */
  unmountCalls = 0;
  constructor(
    entryId: string,
    private readonly gate: Promise<void>,
    private readonly failAfterGate: boolean = false
  ) {
    super(entryId);
  }
  async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return {
      mount: async () => {
        await this.gate;
        if (this.failAfterGate) {
          throw new Error('gated mount failed');
        }
      },
      unmount: () => { this.unmountCalls += 1; },
    };
  }
}

/**
 * A handler whose lifecycle's own `mount` counts its own calls and signals
 * that it has started, then awaits an externally-controlled gate before
 * settling — makes a physical mount genuinely in progress for as long as the
 * test keeps the gate open, deterministically, while telling a first attempt
 * apart from a later, fresh one.
 */
class GatedCountingMountHandler extends MfeHandler {
  readonly bridgeFactory = new MfeBridgeFactoryDefault();
  mountCalls = 0;
  constructor(
    entryId: string,
    private readonly gate: Promise<void>,
    private readonly onMountStarted: () => void
  ) {
    super(entryId);
  }
  async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return {
      mount: async () => {
        this.mountCalls += 1;
        this.onMountStarted();
        await this.gate;
      },
      unmount: () => {},
    };
  }
}

/**
 * A handler whose lifecycle's own `unmount` signals that it has started,
 * then awaits an externally-controlled gate before settling — holds a
 * domain's unregistration teardown in progress for as long as the test
 * keeps the gate open, deterministically.
 */
class GatedUnmountHandler extends MfeHandler {
  readonly bridgeFactory = new MfeBridgeFactoryDefault();
  constructor(
    entryId: string,
    private readonly gate: Promise<void>,
    private readonly onUnmountStarted: () => void
  ) {
    super(entryId);
  }
  async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return {
      mount: () => {},
      unmount: async () => {
        this.onUnmountStarted();
        await this.gate;
      },
    };
  }
}

/**
 * A test-only handler whose `mount_ext` action awaits an
 * externally-controlled gate BEFORE ever calling the strategy's own
 * `mount` — makes a fresh mount's occupancy mutation genuinely occupy the
 * coordinator's ordering tail for as long as the test keeps the gate open,
 * deterministically. Applies uniformly to every subject the domain
 * mounts.
 */
class GatedBeforeStrategyDomainImpl extends ExtensionDomainImplementation {
  readonly entries = new Set<string>();
  readonly completed = new Set<string>();
  /**
   * Optional per-subject settlement signals for tests that need to observe
   * the exact moment a subject enters (`entries.add`) or its inner
   * completes (`completed.add`), beyond polling the two Sets above —
   * resolved synchronously from this same recording handler, never a
   * sleep, a poll, or a bare microtask flush.
   */
  onEntered?: (subject: string) => void;
  onCompleted?: (subject: string) => void;
  constructor(
    ctx: DomainContext,
    readonly strategy: MountStrategy,
    private readonly gate: Promise<void>,
    declaresUnmount: boolean = true
  ) {
    super();
    ctx.registerHandler(ACTION_MOUNT_EXT, ActionHandler.fromFunction(async (_t, p) => {
      const { subject } = p as { subject: string };
      this.entries.add(subject);
      this.onEntered?.(subject);
      await this.gate;
      try {
        const result = await this.strategy.mount(p as { subject: string });
        this.completed.add(subject);
        return result;
      } finally {
        // Fired whether the inner attempt succeeds or fails — a signal that
        // this entry's own task has settled, not that it succeeded (`completed`
        // above already tracks success alone).
        this.onCompleted?.(subject);
      }
    }));
    if (declaresUnmount) {
      ctx.registerHandler(ACTION_UNMOUNT_EXT, ActionHandler.fromFunction((_t, p) => this.strategy.unmount!(p as { subject: string })));
    }
  }
  protected getMountStrategies(): MountStrategy[] { return [this.strategy]; }
}

class GatedBeforeStrategyDomainFactory extends ExtensionDomainImplementationFactory {
  readonly hooks = new TestHooks();
  strategy!: OptionalMountStrategy | ExclusiveMountStrategy;
  impl!: GatedBeforeStrategyDomainImpl;
  /** Propagated onto `impl` once `build()` constructs it — set on this factory BEFORE `registerDomain` triggers `build()`. */
  onEntered?: (subject: string) => void;
  onCompleted?: (subject: string) => void;
  constructor(
    private readonly reg: MfeRegistry,
    private readonly domainId: string,
    private readonly strategyName: 'optional' | 'exclusive',
    private readonly gate: Promise<void>
  ) { super(); }
  build(ctx: DomainContext): GatedBeforeStrategyDomainImpl {
    this.strategy = this.strategyName === 'optional'
      ? new OptionalMountStrategy(ctx.mounter, this.hooks, this.reg, this.domainId)
      : new ExclusiveMountStrategy(ctx.mounter, this.hooks, this.reg, this.domainId);
    this.impl = new GatedBeforeStrategyDomainImpl(ctx, this.strategy, this.gate, this.strategyName === 'optional');
    this.impl.onEntered = this.onEntered;
    this.impl.onCompleted = this.onCompleted;
    return this.impl;
  }
}

/**
 * A test-only handler whose `mount_ext` action awaits an
 * externally-controlled gate, then either throws (for one designated
 * "failing" subject — never reaching the strategy at all) or calls straight
 * through to the strategy (every other subject) — models a request that
 * stays genuinely in flight for the test to queue other requests behind,
 * then fails without ever touching occupancy.
 */
class GatedFailBeforeStrategyDomainImpl extends ExtensionDomainImplementation {
  constructor(
    ctx: DomainContext,
    readonly strategy: MountStrategy,
    private readonly gate: Promise<void>,
    private readonly failingSubject: string,
    declaresUnmount: boolean = true
  ) {
    super();
    ctx.registerHandler(ACTION_MOUNT_EXT, ActionHandler.fromFunction(async (_t, p) => {
      const { subject } = p as { subject: string };
      await this.gate;
      if (subject === this.failingSubject) {
        throw new Error(`mount of '${subject}' fails before reaching the strategy`);
      }
      return this.strategy.mount(p as { subject: string });
    }));
    if (declaresUnmount) {
      ctx.registerHandler(ACTION_UNMOUNT_EXT, ActionHandler.fromFunction((_t, p) => this.strategy.unmount!(p as { subject: string })));
    }
  }
  protected getMountStrategies(): MountStrategy[] { return [this.strategy]; }
}

class GatedFailBeforeStrategyDomainFactory extends ExtensionDomainImplementationFactory {
  readonly hooks = new TestHooks();
  strategy!: OptionalMountStrategy | ExclusiveMountStrategy;
  constructor(
    private readonly reg: MfeRegistry,
    private readonly domainId: string,
    private readonly strategyName: 'optional' | 'exclusive',
    private readonly gate: Promise<void>,
    private readonly failingSubject: string
  ) { super(); }
  build(ctx: DomainContext): GatedFailBeforeStrategyDomainImpl {
    this.strategy = this.strategyName === 'optional'
      ? new OptionalMountStrategy(ctx.mounter, this.hooks, this.reg, this.domainId)
      : new ExclusiveMountStrategy(ctx.mounter, this.hooks, this.reg, this.domainId);
    return new GatedFailBeforeStrategyDomainImpl(ctx, this.strategy, this.gate, this.failingSubject, this.strategyName === 'optional');
  }
}

class TestHooks implements ContainerHooks {
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

/** A controlled deferred — the only kind of "wait" these tests use. */
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

// ─── Domain implementations, one per strategy, each exposing its strategy + hooks for spying ──

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
  strategy!: ConcurrentMountStrategy;
  build(ctx: DomainContext): ConcurrentDomainImpl {
    this.strategy = new ConcurrentMountStrategy(ctx.mounter, this.hooks);
    return new ConcurrentDomainImpl(ctx, this.strategy);
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

type SpyableFactory = ConcurrentDomainFactory | OptionalDomainFactory | ExclusiveDomainFactory;

function freshRegistry(plugin: TypeSystemPlugin<MockSchema>, handler: MfeHandler = new StubHandler(ENTRY_ID)): DefaultMfeRegistry {
  registerEntrySchema(plugin);
  const config: MfeRegistryConfig = { typeSystem: plugin, mfeHandlers: [handler] };
  return new DefaultMfeRegistry(config);
}

/** Register a one-off domain-scoped probe action whose handler resolves the returned deferred. */
function wireProbe(registry: DefaultMfeRegistry, domainId: string, actionType: string): Promise<void> {
  const deferred = createDeferred();
  const mediator = (registry as unknown as { mediator: DefaultActionsChainsMediator }).mediator;
  mediator.registerHandler(domainId, actionType, ActionHandler.fromFunction(async () => { deferred.resolve(); }));
  return deferred.promise;
}

/** Create and register a probe-host domain with Concurrent strategy (non-queueing). */
function createProbeDomain(registry: DefaultMfeRegistry, probeDomainId: string): void {
  registry.registerDomain(makeDomain(probeDomainId, true), new ConcurrentDomainFactory());
}

describe('mount-ext prologue — end to end', () => {
  it('(a) mount_ext of an already-mounted extension succeeds immediately, creates no container, evicts nothing, and does not re-trigger activated — for each strategy', async () => {
    for (const strategyName of ['concurrent', 'optional', 'exclusive'] as const) {
      const plugin = createPlugin();
      const activatedSpy = vi.spyOn(plugin, 'resolveLifecycleStageActivatedId');
      const domainId = `domain-already-mounted-${strategyName}`;
      const registry = freshRegistry(plugin);

      let factory: SpyableFactory;
      if (strategyName === 'concurrent') {
        factory = new ConcurrentDomainFactory();
      } else if (strategyName === 'optional') {
        factory = new OptionalDomainFactory(registry, domainId);
      } else {
        factory = new ExclusiveDomainFactory(registry, domainId);
      }
      registry.registerDomain(makeDomain(domainId, strategyName !== 'exclusive'), factory);

      await registry.registerExtension(makeExtension('ext-a', domainId));
      const mounter = registry.getMounter(domainId);
      mounter.attach(document.createElement('div'));

      // Pre-mount directly through the mounter (the real physical-mount
      // path), independent of the prologue, so the mount-set already shows
      // 'ext-a' as mounted before the mount_ext request under test.
      await mounter.mount('ext-a', document.createElement('div'));
      expect(registry.getMountedExtensions(domainId)).toContain('ext-a');

      const mountSpy = vi.spyOn(factory.strategy, 'mount');
      activatedSpy.mockClear();
      factory.hooks.created.length = 0;

      const nextFired = wireProbe(registry, domainId, 'already-mounted-next');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
        next: { action: { type: 'already-mounted-next', target: domainId, payload: {} } },
      });
      await nextFired;

      expect(mountSpy).not.toHaveBeenCalled();
      expect(factory.hooks.created).toHaveLength(0);
      expect(activatedSpy).not.toHaveBeenCalled();

      registry.dispose();
    }
  });

  it('(b) two concurrent mount_ext requests for the same extension share one physical mount, both settle successfully, and activated fires exactly once', async () => {
    const plugin = createPlugin();
    const activatedSpy = vi.spyOn(plugin, 'resolveLifecycleStageActivatedId');
    const domainId = 'domain-join-success';
    const registry = freshRegistry(plugin);
    const factory = new ConcurrentDomainFactory();
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-a', domainId));
    registry.getMounter(domainId).attach(document.createElement('div'));

    const mountSpy = vi.spyOn(factory.strategy, 'mount');

    const firstFired = wireProbe(registry, domainId, 'join-probe-1');
    const secondFired = wireProbe(registry, domainId, 'join-probe-2');

    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'join-probe-1', target: domainId, payload: {} } },
    });
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'join-probe-2', target: domainId, payload: {} } },
    });

    await Promise.all([firstFired, secondFired]);

    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(activatedSpy).toHaveBeenCalledTimes(1);
    expect(registry.getMountedExtensions(domainId)).toContain('ext-a');

    registry.dispose();
  });

  it('(d) mount_ext naming a domain the extension is not admitted to fails, and the chain fallback runs', async () => {
    const plugin = createPlugin();
    const domainId = 'domain-eligible';
    const otherDomainId = 'domain-not-eligible';
    const registry = freshRegistry(plugin);
    const factory = new ConcurrentDomainFactory();
    registry.registerDomain(makeDomain(domainId, true), factory);
    // A second, unrelated domain to dispatch against — 'ext-a' is registered
    // to `domainId`, never to `otherDomainId`.
    const otherFactory = new ConcurrentDomainFactory();
    registry.registerDomain(makeDomain(otherDomainId, true), otherFactory);
    await registry.registerExtension(makeExtension('ext-a', domainId));

    const fallbackFired = wireProbe(registry, otherDomainId, 'fallback-probe');

    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: otherDomainId, payload: { subject: 'ext-a' } },
      fallback: { action: { type: 'fallback-probe', target: otherDomainId, payload: {} } },
    });

    await fallbackFired;
    expect(registry.getMountedExtensions(otherDomainId)).not.toContain('ext-a');

    registry.dispose();
  });

  it('(c) a mount arriving during an in-progress unmount waits, then fresh-mounts, and activated fires again for the fresh mount', async () => {
    const plugin = createPlugin();
    const activatedSpy = vi.spyOn(plugin, 'resolveLifecycleStageActivatedId');
    const domainId = 'domain-await-unmount';
    const registry = freshRegistry(plugin);
    const factory = new ConcurrentDomainFactory();
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-a', domainId));
    const mounter = registry.getMounter(domainId);
    mounter.attach(document.createElement('div'));

    await mounter.mount('ext-a', document.createElement('div'));
    expect(activatedSpy).toHaveBeenCalledTimes(1);

    // Start (but do not await) an unmount so it is genuinely in flight when
    // the mount_ext request below arrives.
    const unmountPromise = mounter.unmount('ext-a');

    const mountFired = wireProbe(registry, domainId, 'mount-after-unmount-probe');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'mount-after-unmount-probe', target: domainId, payload: {} } },
    });

    await unmountPromise;
    await mountFired;

    expect(registry.getMountedExtensions(domainId)).toContain('ext-a');
    expect(activatedSpy).toHaveBeenCalledTimes(2);

    registry.dispose();
  });

  it('(c) a failed in-progress unmount fails the waiting mount request', async () => {
    const plugin = createPlugin();
    const domainId = 'domain-failed-unmount';
    // `unmountExtension` calls the extension's own lifecycle `unmount`, so a
    // lifecycle whose `unmount` throws makes the in-progress unmount this
    // mount request waits on fail deterministically.
    const registry = freshRegistry(plugin, new ThrowingUnmountHandler(ENTRY_ID));
    const factory = new ConcurrentDomainFactory();
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-a', domainId));
    const mounter = registry.getMounter(domainId);
    mounter.attach(document.createElement('div'));

    await mounter.mount('ext-a', document.createElement('div'));

    const unmountPromise = mounter.unmount('ext-a').catch(() => { /* asserted via the waiting mount's fallback below */ });

    const fallbackFired = wireProbe(registry, domainId, 'failed-unmount-fallback');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      fallback: { action: { type: 'failed-unmount-fallback', target: domainId, payload: {} } },
    });

    await unmountPromise;
    await fallbackFired;

    registry.dispose();
  });

  it('(e) a chain whose mount_ext targets an already-mounted extension proceeds to its declared next', async () => {
    const plugin = createPlugin();
    const domainId = 'domain-next-on-already-mounted';
    const registry = freshRegistry(plugin);
    const factory = new ConcurrentDomainFactory();
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-a', domainId));
    const mounter = registry.getMounter(domainId);
    mounter.attach(document.createElement('div'));
    await mounter.mount('ext-a', document.createElement('div'));

    const nextFired = wireProbe(registry, domainId, 'next-probe');

    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'next-probe', target: domainId, payload: {} } },
    });

    await nextFired;

    registry.dispose();
  });

  it('(f) two different extensions dispatched concurrently in an Optional/Exclusive domain end up with exactly one occupant — the last-dispatched one', async () => {
    for (const strategyName of ['optional', 'exclusive'] as const) {
      const plugin = createPlugin();
      const domainId = `domain-cross-ext-race-${strategyName}`;
      const registry = freshRegistry(plugin);
      const factory = strategyName === 'optional'
        ? new OptionalDomainFactory(registry, domainId)
        : new ExclusiveDomainFactory(registry, domainId);
      registry.registerDomain(makeDomain(domainId, strategyName === 'optional'), factory);
      await registry.registerExtension(makeExtension('ext-a', domainId));
      await registry.registerExtension(makeExtension('ext-b', domainId));
      registry.getMounter(domainId).attach(document.createElement('div'));

      const aFired = wireProbe(registry, domainId, 'race-probe-a');
      const bFired = wireProbe(registry, domainId, 'race-probe-b');

      // Dispatched back to back, neither awaited before the other starts —
      // genuinely concurrent from the mediator's point of view.
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
        next: { action: { type: 'race-probe-a', target: domainId, payload: {} } },
      });
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-b' } },
        next: { action: { type: 'race-probe-b', target: domainId, payload: {} } },
      });

      await Promise.all([aFired, bFired]);

      const mounted = registry.getMountedExtensions(domainId);
      expect(mounted).toHaveLength(1);
      // The per-domain coordinator orders different-extension fresh mounts
      // in dispatch order for strategies that read and mutate the mount set
      // (Optional/Exclusive), so the extension dispatched SECOND is the one
      // still occupying the domain once both requests have settled.
      expect(mounted).toEqual(['ext-b']);

      registry.dispose();
    }
  });

  it('(h) overlapping unmounts of the same extension physically unmount once, and a mount requested meanwhile waits for that settlement', async () => {
    const plugin = createPlugin();
    const activatedSpy = vi.spyOn(plugin, 'resolveLifecycleStageActivatedId');
    const domainId = 'domain-overlapping-unmounts';
    const registry = freshRegistry(plugin);
    const factory = new ConcurrentDomainFactory();
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-a', domainId));
    const mounter = registry.getMounter(domainId);
    mounter.attach(document.createElement('div'));
    await mounter.mount('ext-a', document.createElement('div'));
    expect(activatedSpy).toHaveBeenCalledTimes(1);

    // Two overlapping unmounts of the SAME extension, neither awaited
    // before the next starts.
    const firstUnmount = mounter.unmount('ext-a');
    const secondUnmount = mounter.unmount('ext-a');
    expect((mounter as DefaultExtensionMounter).getUnmountInFlight('ext-a')).toBeDefined();

    // A mount_ext request arriving while both unmounts are in flight must
    // wait for that settlement rather than racing it.
    const mountFired = wireProbe(registry, domainId, 'overlap-unmount-mount-probe');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'overlap-unmount-mount-probe', target: domainId, payload: {} } },
    });

    await Promise.all([firstUnmount, secondUnmount]);
    await mountFired;

    expect(registry.getMountedExtensions(domainId)).toContain('ext-a');
    expect(activatedSpy).toHaveBeenCalledTimes(2);

    registry.dispose();
  });

  it('(i) detach() racing a mount — the mount waits for detach\'s FULL release of the same extension (not merely its physical unmount), and finds the root detach itself tore down', async () => {
    const plugin = createPlugin();
    const activatedSpy = vi.spyOn(plugin, 'resolveLifecycleStageActivatedId');
    const domainId = 'domain-detach-races-mount';
    const registry = freshRegistry(plugin);
    const factory = new ConcurrentDomainFactory();
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-a', domainId));
    const mounter = registry.getMounter(domainId);
    mounter.attach(document.createElement('div'));
    await mounter.mount('ext-a', document.createElement('div'));
    expect(activatedSpy).toHaveBeenCalledTimes(1);

    // Not awaited: detach() is in flight, tracking ext-a's release, when the
    // mount_ext request below arrives.
    const detachPromise = mounter.detach();
    expect((mounter as DefaultExtensionMounter).getUnmountInFlight('ext-a')).toBeDefined();

    // The waiting mount joins the SAME release detach() itself awaits, so
    // both settle together — by the time the mount resumes, detach has
    // already torn down the root too, and the mount fails rather than
    // racing ahead into a root that is no longer attached.
    const mountFallbackFired = wireProbe(registry, domainId, 'detach-race-mount-fallback');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      fallback: { action: { type: 'detach-race-mount-fallback', target: domainId, payload: {} } },
    });

    await Promise.all([detachPromise, mountFallbackFired]);

    expect(registry.getMountedExtensions(domainId)).not.toContain('ext-a');
    expect(activatedSpy).toHaveBeenCalledTimes(1);

    registry.dispose();
  });

  it('inst-me-mount-root-detached (end to end): a mount whose lifecycle mount settles after the slot was detached is rolled back, its container destroyed, and the next mount runs the lifecycle mount again', async () => {
    const plugin = createPlugin();
    const domainId = 'domain-mount-root-detached-e2e';
    const mountStarted = createDeferred();
    const gate = createDeferred();
    const handler = new GatedCountingMountHandler(ENTRY_ID, gate.promise, () => mountStarted.resolve());
    const registry = freshRegistry(plugin, handler);
    const factory = new ConcurrentDomainFactory();
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-a', domainId));
    const mounter = registry.getMounter(domainId);
    const root = document.createElement('div');
    mounter.attach(root);

    const firstNextFired = wireProbe(registry, domainId, 'root-detached-mount-next');
    const firstFallbackFired = wireProbe(registry, domainId, 'root-detached-mount-fallback');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'root-detached-mount-next', target: domainId, payload: {} } },
      fallback: { action: { type: 'root-detached-mount-fallback', target: domainId, payload: {} } },
    });
    const firstOutcome = Promise.race([
      firstNextFired.then(() => 'next' as const),
      firstFallbackFired.then(() => 'fallback' as const),
    ]);

    // The lifecycle mount is genuinely in progress, gated open, when the
    // slot is detached out from under it.
    await mountStarted.promise;
    await mounter.detach();

    // Release the gate: the lifecycle mount settles AFTER the slot was
    // already detached — the mount rolls itself back instead of becoming an
    // orphan occupant of a root that is no longer attached.
    gate.resolve();
    await gate.promise;

    expect(await firstOutcome).toBe('fallback');
    expect(registry.getMountedExtensions(domainId)).not.toContain('ext-a');
    expect(factory.hooks.destroyed).toEqual(['ext-a']);
    expect(root.children).toHaveLength(0);

    // A fresh mount, through a fresh root, runs the lifecycle mount again —
    // the failed attempt above left nothing behind that would make this one
    // an already-mounted or joined request.
    const newRoot = document.createElement('div');
    mounter.attach(newRoot);

    const secondNextFired = wireProbe(registry, domainId, 'root-detached-mount-second-next');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'root-detached-mount-second-next', target: domainId, payload: {} } },
    });
    await secondNextFired;

    expect(handler.mountCalls).toBe(2);
    expect(registry.getMountedExtensions(domainId)).toContain('ext-a');

    registry.dispose();
  });

  it('(j) an explicit unmount of the sole occupant racing a fresh mount of a different extension in an Optional domain destroys the displaced occupant\'s container exactly once, and both actions succeed', async () => {
    const plugin = createPlugin();
    const domainId = 'domain-explicit-unmount-races-mount';
    const registry = freshRegistry(plugin);
    const factory = new OptionalDomainFactory(registry, domainId);
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-a', domainId));
    await registry.registerExtension(makeExtension('ext-b', domainId));
    registry.getMounter(domainId).attach(document.createElement('div'));

    // Pre-mount 'ext-a' as the sole occupant before the race below, through
    // the strategy itself — not the mounter directly — so the destroy the
    // strategy registers for it (`registerDestroy`) is in place for the
    // release the race below triggers.
    await factory.strategy.mount({ subject: 'ext-a' });
    expect(registry.getMountedExtensions(domainId)).toEqual(['ext-a']);

    // A destroy hook that throws on a SECOND release of the same
    // extension's container — a duplicate destroy fails this test rather
    // than passing silently.
    const destroyCallCounts = new Map<string, number>();
    factory.hooks.destroy = (extensionId: string): void => {
      const count = (destroyCallCounts.get(extensionId) ?? 0) + 1;
      destroyCallCounts.set(extensionId, count);
      if (count > 1) {
        throw new Error(`duplicate destroy release for '${extensionId}'`);
      }
    };

    const unmountFired = wireProbe(registry, domainId, 'explicit-unmount-probe');
    const mountFired = wireProbe(registry, domainId, 'race-mount-probe');

    // An explicit unmount_ext of the sole occupant ('ext-a') and a fresh
    // mount_ext of a DIFFERENT extension ('ext-b') — which itself displaces
    // 'ext-a' as part of its own strategy body — dispatched back to back,
    // neither awaited before the other starts.
    registry.executeActionsChain({
      action: { type: ACTION_UNMOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'explicit-unmount-probe', target: domainId, payload: {} } },
    });
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-b' } },
      next: { action: { type: 'race-mount-probe', target: domainId, payload: {} } },
    });

    await Promise.all([unmountFired, mountFired]);

    expect(registry.getMountedExtensions(domainId)).toEqual(['ext-b']);
    expect(destroyCallCounts.get('ext-a')).toBe(1);

    registry.dispose();
  });

  it('(k) an explicit unmount_ext of an extension joining a detach() already tearing it down destroys its container exactly once, and detach still completes', async () => {
    const plugin = createPlugin();
    const domainId = 'domain-explicit-unmount-races-detach';
    const registry = freshRegistry(plugin);
    const factory = new ConcurrentDomainFactory();
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-a', domainId));
    const mounter = registry.getMounter(domainId);
    mounter.attach(document.createElement('div'));
    // Mounted through the strategy itself — not the mounter directly — so
    // the destroy the strategy registers for it (`registerDestroy`) is in
    // place for the release detach() and the joining unmount_ext below share.
    await factory.strategy.mount({ subject: 'ext-a' });
    expect(registry.getMountedExtensions(domainId)).toEqual(['ext-a']);

    // A destroy hook that throws on a SECOND release of the same
    // extension's container — a duplicate release fails this test rather
    // than passing silently. detach()'s own release runs the SAME destroy
    // registered at mount time, and the joining unmount_ext coalesces onto
    // that same release rather than starting a second one, so exactly one
    // call to this hook is the only correct outcome; zero calls, which would
    // mean the release's destroy was lost, must not happen either.
    const destroyCallCounts = new Map<string, number>();
    factory.hooks.destroy = (extensionId: string): void => {
      const count = (destroyCallCounts.get(extensionId) ?? 0) + 1;
      destroyCallCounts.set(extensionId, count);
      if (count > 1) {
        throw new Error(`duplicate destroy release for '${extensionId}'`);
      }
    };

    // Not awaited: detach() is in flight, already tracking 'ext-a's
    // release, when the explicit unmount_ext dispatch below arrives for the
    // SAME extension.
    const detachPromise = mounter.detach();

    const unmountFired = wireProbe(registry, domainId, 'race-detach-unmount-probe');
    registry.executeActionsChain({
      action: { type: ACTION_UNMOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'race-detach-unmount-probe', target: domainId, payload: {} } },
    });

    await Promise.all([detachPromise, unmountFired]);

    // detach()'s release and the joining unmount_ext coalesce onto the SAME
    // release, so the destroy registered at mount time ran exactly once —
    // neither lost nor duplicated.
    expect(destroyCallCounts.get('ext-a')).toBe(1);
    expect(registry.getMountedExtensions(domainId)).toEqual([]);

    registry.dispose();
  });

  it('(l) inst-um-await-mount-settle/inst-um-after-mount-success: an unmount_ext arriving while the SAME extension\'s mount is in progress waits for it, then unmounts it, leaving it absent', async () => {
    const plugin = createPlugin();
    const activatedSpy = vi.spyOn(plugin, 'resolveLifecycleStageActivatedId');
    const domainId = 'domain-unmount-awaits-inflight-mount';
    // The gate the extension's own lifecycle `mount` awaits — kept pending
    // (not resolved) until the test has dispatched BOTH the mount_ext and
    // the unmount_ext below, so the two genuinely overlap.
    const gate = createDeferred();
    const handler = new GatedMountHandler(ENTRY_ID, gate.promise);
    const registry = freshRegistry(plugin, handler);
    const factory = new ConcurrentDomainFactory();
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-a', domainId));
    const mounter = registry.getMounter(domainId);
    mounter.attach(document.createElement('div'));

    // Signals the moment the strategy's physical mount has genuinely
    // started (the coordinator's in-flight-mount entry for 'ext-a' is
    // published strictly BEFORE this call, inside `runFreshMount`) — an
    // explicit settlement signal derived from real code running, not a
    // sleep, a poll, or a bare microtask flush.
    const mountStarted = createDeferred();
    const originalCreate = factory.hooks.create.bind(factory.hooks);
    factory.hooks.create = (extensionId: string): Element => {
      const el = originalCreate(extensionId);
      mountStarted.resolve();
      return el;
    };

    const mountFired = wireProbe(registry, domainId, 'inflight-mount-next');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'inflight-mount-next', target: domainId, payload: {} } },
    });

    // Wait until the mount is genuinely in progress (container created,
    // coordinator in-flight entry published) before dispatching the
    // unmount below — the whole point of this test is that both requests
    // genuinely overlap.
    await mountStarted.promise;

    const unmountFired = wireProbe(registry, domainId, 'inflight-mount-unmount-next');
    registry.executeActionsChain({
      action: { type: ACTION_UNMOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'inflight-mount-unmount-next', target: domainId, payload: {} } },
    });

    // Release the gate the mount's own lifecycle `mount` is awaiting —
    // scheduled strictly AFTER the unmount dispatch above accepted and
    // reserved its own execution, so the unmount's prologue observes the
    // mount as still in flight before this settles it.
    gate.resolve();

    await Promise.all([mountFired, unmountFired]);

    // Exactly one physical mount, then exactly one physical unmount and one
    // destroy.
    expect(factory.hooks.created).toEqual(['ext-a']);
    expect(handler.unmountCalls).toBe(1);
    expect(factory.hooks.destroyed).toEqual(['ext-a']);
    // activated fired once (for the underlying physical mount only).
    expect(activatedSpy).toHaveBeenCalledTimes(1);
    // 'ext-a' is absent from the mount set — both actions succeeded (both
    // `next` probes above fired, not a `fallback`), and the extension ends
    // up unmounted. The unmount correctly waits for the in-progress mount to
    // settle (inst-um-await-mount-settle) before proceeding.
    expect(registry.getMountedExtensions(domainId)).toEqual([]);

    registry.dispose();
  });

  it('(l) inst-um-after-mount-failure: an unmount_ext arriving while the SAME extension\'s mount is in progress, and that mount fails, completes without action and runs no additional destroy', async () => {
    const plugin = createPlugin();
    const domainId = 'domain-unmount-awaits-failed-inflight-mount';
    const gate = createDeferred();
    // `failAfterGate: true` — the lifecycle `mount` throws once the gate
    // opens, making the in-progress mount this unmount waits on fail
    // deterministically.
    const handler = new GatedMountHandler(ENTRY_ID, gate.promise, true);
    const registry = freshRegistry(plugin, handler);
    const factory = new ConcurrentDomainFactory();
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-a', domainId));
    const mounter = registry.getMounter(domainId);
    mounter.attach(document.createElement('div'));

    const mountStarted = createDeferred();
    const originalCreate = factory.hooks.create.bind(factory.hooks);
    factory.hooks.create = (extensionId: string): Element => {
      const el = originalCreate(extensionId);
      mountStarted.resolve();
      return el;
    };

    const mountFailedFallback = wireProbe(registry, domainId, 'inflight-failed-mount-fallback');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      fallback: { action: { type: 'inflight-failed-mount-fallback', target: domainId, payload: {} } },
    });

    await mountStarted.promise;

    const unmountFired = wireProbe(registry, domainId, 'inflight-failed-mount-unmount-next');
    registry.executeActionsChain({
      action: { type: ACTION_UNMOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'inflight-failed-mount-unmount-next', target: domainId, payload: {} } },
    });

    gate.resolve();

    await Promise.all([mountFailedFallback, unmountFired]);

    // The failed mount's OWN catch block destroys the container it created
    // (`ConcurrentMountStrategy.mount`'s `catch`) — that single destroy is
    // expected. The unmount request must not run a SECOND one: it never
    // invokes the strategy's `unmount` body at all once it learns the mount
    // it was waiting on failed.
    expect(factory.hooks.created).toEqual(['ext-a']);
    expect(factory.hooks.destroyed).toEqual(['ext-a']);
    expect(handler.unmountCalls).toBe(0);
    expect(registry.getMountedExtensions(domainId)).toEqual([]);

    registry.dispose();
  });

  it('(m) a Concurrent domain keeps no occupancy queue: a gated mount of one extension and a mount of a different extension run independently, and the ungated one mounts while the gated one is still in flight', async () => {
    const plugin = createPlugin();
    const domainId = 'domain-concurrent-independence';
    const registry = freshRegistry(plugin);
    const gate = createDeferred();

    // A Concurrent domain impl whose `mount_ext` handler gates ONLY
    // 'ext-a' — every other subject calls straight through to the
    // strategy, uniformly with every other Concurrent domain impl in this
    // file, except for this one gate.
    class GatedOnlyADomainImpl extends ExtensionDomainImplementation {
      constructor(ctx: DomainContext, readonly strategy: ConcurrentMountStrategy) {
        super();
        ctx.registerHandler(ACTION_MOUNT_EXT, ActionHandler.fromFunction(async (_t, p) => {
          const { subject } = p as { subject: string };
          if (subject === 'ext-a') {
            await gate.promise;
          }
          return this.strategy.mount(p as { subject: string });
        }));
        ctx.registerHandler(ACTION_UNMOUNT_EXT, ActionHandler.fromFunction((_t, p) => this.strategy.unmount!(p as { subject: string })));
      }
      protected getMountStrategies(): MountStrategy[] { return [this.strategy]; }
    }
    class GatedOnlyADomainFactory extends ExtensionDomainImplementationFactory {
      readonly hooks = new TestHooks();
      strategy!: ConcurrentMountStrategy;
      build(ctx: DomainContext): GatedOnlyADomainImpl {
        this.strategy = new ConcurrentMountStrategy(ctx.mounter, this.hooks);
        return new GatedOnlyADomainImpl(ctx, this.strategy);
      }
    }

    const factory = new GatedOnlyADomainFactory();
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-a', domainId));
    await registry.registerExtension(makeExtension('ext-b', domainId));
    registry.getMounter(domainId).attach(document.createElement('div'));

    const aFired = wireProbe(registry, domainId, 'concind-a-next');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'concind-a-next', target: domainId, payload: {} } },
    });

    const bFired = wireProbe(registry, domainId, 'concind-b-next');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-b' } },
      next: { action: { type: 'concind-b-next', target: domainId, payload: {} } },
    });

    // ext-b's own mount runs and its `next` fires, and ext-b is mounted,
    // while ext-a's own mount is still gated — a Concurrent domain keeps no
    // occupancy queue, so two different extensions' fresh mounts there
    // never order behind one another.
    await bFired;
    expect(registry.getMountedExtensions(domainId)).toEqual(['ext-b']);

    gate.resolve();
    await aFired;

    expect(registry.getMountedExtensions(domainId)).toContain('ext-a');
    expect(registry.getMountedExtensions(domainId)).toContain('ext-b');

    registry.dispose();
  });

  it('(n) a mount that waited on an in-progress unmount keeps its own fresh container — the unmount\'s destroy never reaches it', async () => {
    const plugin = createPlugin();
    const domainId = 'domain-remount-survives-unmount-destroy';
    const unmountStarted = createDeferred();
    const gate = createDeferred();
    const handler = new GatedUnmountHandler(ENTRY_ID, gate.promise, () => unmountStarted.resolve());
    const registry = freshRegistry(plugin, handler);
    const factory = new ConcurrentDomainFactory();
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-a', domainId));
    const root = document.createElement('div');
    const mounter = registry.getMounter(domainId);
    mounter.attach(root);

    // Pre-mount 'ext-a' directly through the mounter (bypasses the
    // strategy/hooks), so `factory.hooks.create` below fires exactly once —
    // for the remount (M) under test.
    await mounter.mount('ext-a', document.createElement('div'));
    expect(registry.getMountedExtensions(domainId)).toContain('ext-a');

    // A realistic destroy: releases whatever container is CURRENTLY tracked
    // for the extension id (mirroring a real host's per-id container map),
    // not a container reference the caller closed over — the same shape the
    // bug report describes.
    const liveContainers = new Map<string, Element>();
    let remountContainer: Element | undefined;
    factory.hooks.create = (extensionId: string): Element => {
      const el = document.createElement('div');
      liveContainers.set(extensionId, el);
      factory.hooks.created.push(extensionId);
      remountContainer = el;
      return el;
    };
    factory.hooks.destroy = (extensionId: string): void => {
      factory.hooks.destroyed.push(extensionId);
      const el = liveContainers.get(extensionId);
      if (el) {
        el.remove();
        liveContainers.delete(extensionId);
      }
    };

    // U: an explicit unmount_ext of 'ext-a', gated on its own physical
    // lifecycle unmount — genuinely in progress once `unmountStarted` fires.
    const unmountFired = wireProbe(registry, domainId, 'f1-unmount-next');
    registry.executeActionsChain({
      action: { type: ACTION_UNMOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'f1-unmount-next', target: domainId, payload: {} } },
    });

    await unmountStarted.promise;

    // M: a mount_ext of the SAME extension, dispatched while U is still in
    // progress — must wait for U's settlement, not race it.
    const mountFired = wireProbe(registry, domainId, 'f1-mount-next');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'f1-mount-next', target: domainId, payload: {} } },
    });

    // Release U's gated physical unmount, letting both U and the waiting M
    // proceed.
    gate.resolve();

    await Promise.all([unmountFired, mountFired]);

    expect(remountContainer).toBeDefined();
    // Container-identity assertion: M's own fresh container is the one
    // still attached under root, and is still tracked as 'ext-a's live
    // container — U's destroy, chosen for its own release, never reached
    // M's container.
    expect(root.contains(remountContainer!)).toBe(true);
    expect(liveContainers.get('ext-a')).toBe(remountContainer);
    expect(registry.getMountedExtensions(domainId)).toContain('ext-a');

    registry.dispose();
  });

  it('(o) a mount waiting on U1, then a second unmount (U2) for the same extension, ends with the extension NOT mounted', async () => {
    const plugin = createPlugin();
    const domainId = 'domain-remount-then-second-unmount';
    const unmountStarted = createDeferred();
    const gate = createDeferred();
    const handler = new GatedUnmountHandler(ENTRY_ID, gate.promise, () => unmountStarted.resolve());
    const registry = freshRegistry(plugin, handler);
    const factory = new ConcurrentDomainFactory();
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-a', domainId));
    const mounter = registry.getMounter(domainId);
    mounter.attach(document.createElement('div'));
    await mounter.mount('ext-a', document.createElement('div'));

    // U1: the first explicit unmount, gated on its own physical unmount.
    const u1Fired = wireProbe(registry, domainId, 'f5-u1-next');
    registry.executeActionsChain({
      action: { type: ACTION_UNMOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'f5-u1-next', target: domainId, payload: {} } },
    });

    await unmountStarted.promise;

    // M: a mount_ext of the same extension, dispatched while U1 is still in
    // progress — must wait for U1's settlement.
    const mFired = wireProbe(registry, domainId, 'f5-m-next');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'f5-m-next', target: domainId, payload: {} } },
    });

    // U2: a second explicit unmount, dispatched right behind M, while M's
    // own placeholder (published for waiting on U1) should already be in
    // flight in the joiner — U2 must wait for M rather than coalescing onto
    // U1 directly.
    const u2Fired = wireProbe(registry, domainId, 'f5-u2-next');
    registry.executeActionsChain({
      action: { type: ACTION_UNMOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'f5-u2-next', target: domainId, payload: {} } },
    });

    gate.resolve();

    await Promise.all([u1Fired, mFired, u2Fired]);

    expect(registry.getMountedExtensions(domainId)).not.toContain('ext-a');

    registry.dispose();
  });

  it('(p) a mount waiting on an in-progress unmount re-evaluates eligibility — a domain reassignment while it waits fails the mount, and it never remounts', async () => {
    const plugin = createPlugin();
    const domainId = 'domain-remount-eligibility-reevaluated';
    const unmountStarted = createDeferred();
    const gate = createDeferred();
    const handler = new GatedUnmountHandler(ENTRY_ID, gate.promise, () => unmountStarted.resolve());
    const registry = freshRegistry(plugin, handler);
    const factory = new ConcurrentDomainFactory();
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-a', domainId));
    const mounter = registry.getMounter(domainId);
    mounter.attach(document.createElement('div'));
    await mounter.mount('ext-a', document.createElement('div'));

    const mountSpy = vi.spyOn(factory.strategy, 'mount');

    // U: an explicit unmount, gated on its own physical unmount.
    const unmountFired = wireProbe(registry, domainId, 'f6-unmount-next');
    registry.executeActionsChain({
      action: { type: ACTION_UNMOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'f6-unmount-next', target: domainId, payload: {} } },
    });

    await unmountStarted.promise;

    // M: a mount_ext of the same extension, dispatched while U is still in
    // progress — must wait for U's settlement, then re-evaluate eligibility
    // before remounting.
    const mountFailedFallback = wireProbe(registry, domainId, 'f6-mount-fallback');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      fallback: { action: { type: 'f6-mount-fallback', target: domainId, payload: {} } },
    });

    // While M is still waiting on U's settlement, reassign 'ext-a's
    // admission away from this domain — reached the same way the fixture's
    // own admission reader is (`extensionManager.getExtensionState(...)?.extension.domain`).
    const em = (registry as unknown as {
      extensionManager: { getExtensionState: (id: string) => { extension: { domain: string } } | undefined };
    }).extensionManager;
    em.getExtensionState('ext-a')!.extension.domain = 'domain-elsewhere';

    gate.resolve();

    await Promise.all([unmountFired, mountFailedFallback]);

    // M failed (its fallback ran, not its next) and never re-entered the
    // strategy's own `mount` at all.
    expect(mountSpy).not.toHaveBeenCalled();
    expect(registry.getMountedExtensions(domainId)).not.toContain('ext-a');

    registry.dispose();
  });
});

/**
 * Two-slot occupancy queue acceptance criteria (Optional/Exclusive domains)
 * — `cpt-frontx-algo-extension-domain-governance-mount-execution` steps
 * 6-13, FEATURE §6 acceptance criteria.
 */
describe('domain occupancy queue — two-slot semantics (Optional/Exclusive)', () => {
  for (const strategyName of ['optional', 'exclusive'] as const) {
    it(`[${strategyName}] burst: mount(A) running, accepting mount(B), mount(C), mount(D) in turn ends with D as sole occupant; only A and D are physically mounted`, async () => {
      const plugin = createPlugin();
      const domainId = `domain-burst-${strategyName}`;
      const registry = freshRegistry(plugin);
      const gate = createDeferred();
      const factory = new GatedBeforeStrategyDomainFactory(registry, domainId, strategyName, gate.promise);
      registry.registerDomain(makeDomain(domainId, strategyName === 'optional'), factory);
      for (const id of ['ext-a', 'ext-b', 'ext-c', 'ext-d']) {
        await registry.registerExtension(makeExtension(id, domainId));
      }
      registry.getMounter(domainId).attach(document.createElement('div'));

      const order: string[] = [];
      const realMount = factory.strategy.mount.bind(factory.strategy);
      vi.spyOn(factory.strategy, 'mount').mockImplementation(async (payload: { subject: string }) => {
        order.push(payload.subject);
        return realMount(payload);
      });

      const aFired = wireProbe(registry, domainId, 'burst-a-next');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
        next: { action: { type: 'burst-a-next', target: domainId, payload: {} } },
      });

      const bFallback = wireProbe(registry, domainId, 'burst-b-fallback');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-b' } },
        fallback: { action: { type: 'burst-b-fallback', target: domainId, payload: {} } },
      });
      const cFallback = wireProbe(registry, domainId, 'burst-c-fallback');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-c' } },
        fallback: { action: { type: 'burst-c-fallback', target: domainId, payload: {} } },
      });
      const dFired = wireProbe(registry, domainId, 'burst-d-next');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-d' } },
        next: { action: { type: 'burst-d-next', target: domainId, payload: {} } },
      });

      // B and C never start: replaced while pending, each takes its own
      // fallback, well before the gate ever opens.
      await Promise.all([bFallback, cFallback]);

      gate.resolve();
      await Promise.all([aFired, dFired]);

      expect(order).toEqual(['ext-a', 'ext-d']);
      expect(registry.getMountedExtensions(domainId)).toEqual(['ext-d']);

      registry.dispose();
    });

    it(`[${strategyName}] replacement: both callers of a replaced pending entry take their own fallback, and the replaced entry never starts`, async () => {
      const plugin = createPlugin();
      const domainId = `domain-replace-joined-${strategyName}`;
      const registry = freshRegistry(plugin);
      const gate = createDeferred();
      const factory = new GatedBeforeStrategyDomainFactory(registry, domainId, strategyName, gate.promise);
      registry.registerDomain(makeDomain(domainId, strategyName === 'optional'), factory);
      await registry.registerExtension(makeExtension('ext-a', domainId));
      await registry.registerExtension(makeExtension('ext-b', domainId));
      await registry.registerExtension(makeExtension('ext-c', domainId));
      registry.getMounter(domainId).attach(document.createElement('div'));

      const order: string[] = [];
      const realMount = factory.strategy.mount.bind(factory.strategy);
      vi.spyOn(factory.strategy, 'mount').mockImplementation(async (payload: { subject: string }) => {
        order.push(payload.subject);
        return realMount(payload);
      });

      const aFired = wireProbe(registry, domainId, 'replace-a-next');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
        next: { action: { type: 'replace-a-next', target: domainId, payload: {} } },
      });

      // Two callers join the same pending mount(B).
      const b1Fallback = wireProbe(registry, domainId, 'replace-b1-fallback');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-b' } },
        fallback: { action: { type: 'replace-b1-fallback', target: domainId, payload: {} } },
      });
      const b2Fallback = wireProbe(registry, domainId, 'replace-b2-fallback');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-b' } },
        fallback: { action: { type: 'replace-b2-fallback', target: domainId, payload: {} } },
      });

      // mount(C) replaces the pending mount(B) — BOTH B callers fall back.
      const cFired = wireProbe(registry, domainId, 'replace-c-next');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-c' } },
        next: { action: { type: 'replace-c-next', target: domainId, payload: {} } },
      });

      await Promise.all([b1Fallback, b2Fallback]);

      gate.resolve();
      await Promise.all([aFired, cFired]);

      expect(order).toEqual(['ext-a', 'ext-c']);
      expect(registry.getMountedExtensions(domainId)).toEqual(['ext-c']);

      registry.dispose();
    });

    it(`[${strategyName}] joining: mount(A) joins a pending mount(A); mount(A) matching the running mount(A) replaces a different pending entry and joins running`, async () => {
      const plugin = createPlugin();
      const domainId = `domain-joining-${strategyName}`;
      const registry = freshRegistry(plugin);
      const gate = createDeferred();
      const factory = new GatedBeforeStrategyDomainFactory(registry, domainId, strategyName, gate.promise);
      registry.registerDomain(makeDomain(domainId, strategyName === 'optional'), factory);
      await registry.registerExtension(makeExtension('ext-x', domainId));
      await registry.registerExtension(makeExtension('ext-a', domainId));
      await registry.registerExtension(makeExtension('ext-b', domainId));
      registry.getMounter(domainId).attach(document.createElement('div'));

      const order: string[] = [];
      const realMount = factory.strategy.mount.bind(factory.strategy);
      vi.spyOn(factory.strategy, 'mount').mockImplementation(async (payload: { subject: string }) => {
        order.push(payload.subject);
        return realMount(payload);
      });

      // Running: mount(X), gated.
      const xFired = wireProbe(registry, domainId, 'join-x-next');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-x' } },
        next: { action: { type: 'join-x-next', target: domainId, payload: {} } },
      });

      // Pending: mount(A) #1.
      const a1Fired = wireProbe(registry, domainId, 'join-a1-next');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
        next: { action: { type: 'join-a1-next', target: domainId, payload: {} } },
      });

      // Joins the pending mount(A).
      const a2Fired = wireProbe(registry, domainId, 'join-a2-next');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
        next: { action: { type: 'join-a2-next', target: domainId, payload: {} } },
      });

      gate.resolve();
      await Promise.all([xFired, a1Fired, a2Fired]);

      // Exactly one physical mount of A (joined, not queued twice).
      expect(order).toEqual(['ext-x', 'ext-a']);
      expect(registry.getMountedExtensions(domainId)).toEqual(['ext-a']);

      registry.dispose();
    });

    it(`[${strategyName}] joining: mount(A) matching the RUNNING mount(A) replaces a different pending mount(B) — B's caller takes its own fallback and B never enters, and the newcomer joins running A`, async () => {
      const plugin = createPlugin();
      const domainId = `domain-join-running-replaces-pending-${strategyName}`;
      const registry = freshRegistry(plugin);
      const gate = createDeferred();
      const factory = new GatedBeforeStrategyDomainFactory(registry, domainId, strategyName, gate.promise);
      registry.registerDomain(makeDomain(domainId, strategyName === 'optional'), factory);
      await registry.registerExtension(makeExtension('ext-a', domainId));
      await registry.registerExtension(makeExtension('ext-b', domainId));
      registry.getMounter(domainId).attach(document.createElement('div'));

      const order: string[] = [];
      const realMount = factory.strategy.mount.bind(factory.strategy);
      vi.spyOn(factory.strategy, 'mount').mockImplementation(async (payload: { subject: string }) => {
        order.push(payload.subject);
        return realMount(payload);
      });

      // Running: mount(A), gated.
      const a1Fired = wireProbe(registry, domainId, 'joinrun-a1-next');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
        next: { action: { type: 'joinrun-a1-next', target: domainId, payload: {} } },
      });

      // Pending: mount(B) — a different subject than the running entry.
      const bFallback = wireProbe(registry, domainId, 'joinrun-b-fallback');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-b' } },
        fallback: { action: { type: 'joinrun-b-fallback', target: domainId, payload: {} } },
      });

      // A newcomer mount(A) matches the RUNNING entry's own operation and
      // subject — the pending mount(B) is replaced (its caller takes its
      // own fallback and never enters), and this newcomer joins the
      // running entry instead of queuing behind it.
      const a2Fired = wireProbe(registry, domainId, 'joinrun-a2-next');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
        next: { action: { type: 'joinrun-a2-next', target: domainId, payload: {} } },
      });

      // B is replaced and fails well before the gate ever opens.
      await bFallback;
      expect(factory.impl.entries.has('ext-b')).toBe(false);

      gate.resolve();
      await Promise.all([a1Fired, a2Fired]);

      // Exactly one physical mount of A — both its callers joined the SAME
      // running entry.
      expect(order).toEqual(['ext-a']);
      expect(registry.getMountedExtensions(domainId)).toEqual(['ext-a']);
      expect(factory.impl.entries.has('ext-b')).toBe(false);

      registry.dispose();
    });
  }

  for (const strategyName of ['optional', 'exclusive'] as const) {
    it(`[${strategyName}] pending timeout: a lone pending caller times out, takes its own fallback, and its entry never starts once the running entry completes`, async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        const plugin = createPlugin();
        const domainId = `domain-lone-pending-timeout-${strategyName}`;
        const registry = freshRegistry(plugin);
        const gate = createDeferred();
        const factory = new GatedBeforeStrategyDomainFactory(registry, domainId, strategyName, gate.promise);
        registry.registerDomain(makeDomain(domainId, strategyName === 'optional'), factory);
        await registry.registerExtension(makeExtension('ext-a', domainId));
        await registry.registerExtension(makeExtension('ext-b', domainId));
        registry.getMounter(domainId).attach(document.createElement('div'));

        // Running: mount(A), gated.
        const aFired = wireProbe(registry, domainId, 'lonetimeout-a-next');
        registry.executeActionsChain({
          action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
          next: { action: { type: 'lonetimeout-a-next', target: domainId, payload: {} } },
        });

        // Pending: mount(B) — its lone caller declares a short timeout.
        const bFallback = wireProbe(registry, domainId, 'lonetimeout-b-fallback');
        registry.executeActionsChain({
          action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-b' }, timeout: 10 },
          fallback: { action: { type: 'lonetimeout-b-fallback', target: domainId, payload: {} } },
        });

        await vi.advanceTimersByTimeAsync(20);
        await bFallback;

        // B's entry left the queue without ever starting: its lone caller
        // was its last, so the entry never becomes the pending entry the
        // running entry's own completion would otherwise promote.
        expect(factory.impl.entries.has('ext-b')).toBe(false);

        gate.resolve();
        await aFired;

        // The running entry (A) completed normally; there was no pending
        // entry left to promote — B's entry never started.
        expect(factory.impl.entries.has('ext-b')).toBe(false);
        expect(registry.getMountedExtensions(domainId)).toEqual(['ext-a']);

        registry.dispose();
      } finally {
        vi.useRealTimers();
      }
    });
  }

  it('[optional] pending timeout: a lone pending caller times out and takes its fallback; two callers — one short, one long — the short one fails alone while the entry still starts for the other', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const plugin = createPlugin();
      const domainId = 'domain-pending-timeout';
      const registry = freshRegistry(plugin);
      const gate = createDeferred();
      const factory = new GatedBeforeStrategyDomainFactory(registry, domainId, 'optional', gate.promise);
      registry.registerDomain(makeDomain(domainId, true), factory);
      await registry.registerExtension(makeExtension('ext-a', domainId));
      await registry.registerExtension(makeExtension('ext-b', domainId));
      registry.getMounter(domainId).attach(document.createElement('div'));

      const order: string[] = [];
      const realMount = factory.strategy.mount.bind(factory.strategy);
      vi.spyOn(factory.strategy, 'mount').mockImplementation(async (payload: { subject: string }) => {
        order.push(payload.subject);
        return realMount(payload);
      });

      // Running: mount(A), gated.
      const aFiredPromise = new Promise<void>((resolve) => {
        const mediator = (registry as unknown as { mediator: DefaultActionsChainsMediator }).mediator;
        mediator.registerHandler(domainId, 'timeout-a-next', ActionHandler.fromFunction(async () => { resolve(); }));
      });
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
        next: { action: { type: 'timeout-a-next', target: domainId, payload: {} } },
      });

      // Pending: mount(B), short declared timeout — the caller of the
      // pending entry that will fire first.
      const bShortFallback = new Promise<void>((resolve) => {
        const mediator = (registry as unknown as { mediator: DefaultActionsChainsMediator }).mediator;
        mediator.registerHandler(domainId, 'timeout-b-short-fallback', ActionHandler.fromFunction(async () => { resolve(); }));
      });
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-b' }, timeout: 10 },
        fallback: { action: { type: 'timeout-b-short-fallback', target: domainId, payload: {} } },
      });

      // A second caller joins the same pending mount(B), with a longer
      // declared timeout — must still see the entry start once B's turn
      // comes.
      const bLongFired = new Promise<void>((resolve) => {
        const mediator = (registry as unknown as { mediator: DefaultActionsChainsMediator }).mediator;
        mediator.registerHandler(domainId, 'timeout-b-long-next', ActionHandler.fromFunction(async () => { resolve(); }));
      });
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-b' }, timeout: 100000 },
        next: { action: { type: 'timeout-b-long-next', target: domainId, payload: {} } },
      });

      await vi.advanceTimersByTimeAsync(20);
      await bShortFallback;

      // The gate stays closed well past the short timeout — releasing it
      // now still lets B's own queued entry start for the long-timeout
      // caller.
      gate.resolve();
      await vi.advanceTimersByTimeAsync(1);
      await Promise.all([aFiredPromise, bLongFired]);

      expect(order).toEqual(['ext-a', 'ext-b']);
      expect(registry.getMountedExtensions(domainId)).toEqual(['ext-b']);

      registry.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('[optional] running never interrupted: a caller of the running entry whose own timer fires settles that ONE caller\'s own attempt (the mediator\'s per-action bound), but never stops the entry — it completes physically, and the pending entry then starts', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const plugin = createPlugin();
      const domainId = 'domain-running-never-interrupted';
      const registry = freshRegistry(plugin);
      const gate = createDeferred();
      const factory = new GatedBeforeStrategyDomainFactory(registry, domainId, 'optional', gate.promise);
      registry.registerDomain(makeDomain(domainId, true), factory);
      await registry.registerExtension(makeExtension('ext-a', domainId));
      await registry.registerExtension(makeExtension('ext-b', domainId));
      registry.getMounter(domainId).attach(document.createElement('div'));

      // A physical-mount completion signal for 'ext-a', independent of its
      // OWN chain's outcome (below) — proves the running entry itself keeps
      // running and finishes, regardless of what its caller's own attempt
      // does.
      const aStrategyMounted = createDeferred();
      const realMount = factory.strategy.mount.bind(factory.strategy);
      vi.spyOn(factory.strategy, 'mount').mockImplementation(async (payload: { subject: string }) => {
        const result = await realMount(payload);
        if (payload.subject === 'ext-a') {
          aStrategyMounted.resolve();
        }
        return result;
      });

      // A's own declared timeout (10ms) is armed BOTH by the queue (for its
      // caller) and, identically, by the mediator's own per-action bound
      // (`cpt-frontx-adr-action-dispatch-and-chaining`) — since the entry is
      // already running when it fires, the queue does nothing
      // (`inst-me-queue-running-never-interrupted`), but the mediator's own
      // bound still settles THIS caller's attempt: its chain takes its own
      // `fallback`, even though the entry it is attached to keeps running.
      const aFallbackFired = new Promise<void>((resolve) => {
        const mediator = (registry as unknown as { mediator: DefaultActionsChainsMediator }).mediator;
        mediator.registerHandler(domainId, 'running-a-fallback', ActionHandler.fromFunction(async () => { resolve(); }));
      });
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' }, timeout: 10 },
        fallback: { action: { type: 'running-a-fallback', target: domainId, payload: {} } },
      });

      const bFired = new Promise<void>((resolve) => {
        const mediator = (registry as unknown as { mediator: DefaultActionsChainsMediator }).mediator;
        mediator.registerHandler(domainId, 'running-b-next', ActionHandler.fromFunction(async () => { resolve(); }));
      });
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-b' } },
        next: { action: { type: 'running-b-next', target: domainId, payload: {} } },
      });

      // A's own timer fires while it is still running (gate closed) — its
      // OWN chain takes fallback, but the entry keeps running: nothing
      // about the queue's state changes because of it.
      await vi.advanceTimersByTimeAsync(20);
      await aFallbackFired;
      expect(registry.getMountedExtensions(domainId)).toEqual([]);

      gate.resolve();
      await Promise.all([aStrategyMounted.promise, bFired]);

      expect(registry.getMountedExtensions(domainId)).toEqual(['ext-b']);

      registry.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  for (const strategyName of ['optional', 'exclusive'] as const) {
    it(`[${strategyName}] eligibility at turn: an entry whose subject is unregistered while pending fails without container creation or activated`, async () => {
      const plugin = createPlugin();
      const activatedSpy = vi.spyOn(plugin, 'resolveLifecycleStageActivatedId');
      const domainId = `domain-eligibility-at-turn-${strategyName}`;
      const registry = freshRegistry(plugin);
      const gate = createDeferred();
      const factory = new GatedBeforeStrategyDomainFactory(registry, domainId, strategyName, gate.promise);
      registry.registerDomain(makeDomain(domainId, strategyName === 'optional'), factory);
      await registry.registerExtension(makeExtension('ext-a', domainId));
      await registry.registerExtension(makeExtension('ext-b', domainId));
      registry.getMounter(domainId).attach(document.createElement('div'));
      activatedSpy.mockClear();

      const aFired = wireProbe(registry, domainId, 'elig-a-next');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
        next: { action: { type: 'elig-a-next', target: domainId, payload: {} } },
      });

      const bFallback = wireProbe(registry, domainId, 'elig-b-fallback');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-b' } },
        fallback: { action: { type: 'elig-b-fallback', target: domainId, payload: {} } },
      });

      // Unregister B's extension while A is still running and B is pending
      // — evaluated at ITS turn, B is no longer admitted anywhere.
      await registry.unregisterExtension('ext-b');

      gate.resolve();
      await Promise.all([aFired, bFallback]);

      expect(factory.hooks.created).toEqual(['ext-a']);
      expect(activatedSpy).toHaveBeenCalledTimes(1);
      expect(registry.getMountedExtensions(domainId)).toEqual(['ext-a']);

      registry.dispose();
    });
  }

  it('[optional] eligibility at turn (unmount): a pending unmount(B) whose subject is unregistered while mount(X) runs fails, taking its own fallback, without invoking the strategy\'s own unmount', async () => {
    const plugin = createPlugin();
    const domainId = 'domain-eligibility-at-turn-unmount';
    const registry = freshRegistry(plugin);
    const gate = createDeferred();
    const factory = new GatedBeforeStrategyDomainFactory(registry, domainId, 'optional', gate.promise);
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-x', domainId));
    await registry.registerExtension(makeExtension('ext-b', domainId));
    registry.getMounter(domainId).attach(document.createElement('div'));

    const unmountInner = vi.spyOn(factory.strategy, 'unmount');

    // Running: mount(X), gated — keeps the queue non-empty for the whole
    // window below.
    const xFired = wireProbe(registry, domainId, 'eligum-x-next');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-x' } },
      next: { action: { type: 'eligum-x-next', target: domainId, payload: {} } },
    });

    // Pending: unmount(B) — wired with BOTH `next` and `fallback` so a
    // regression that lets it succeed (taking `next`) is caught explicitly,
    // rather than this test simply hanging on an unfired `fallback`.
    let bNextFired = false;
    let bFallbackFired = false;
    const bNext = wireProbe(registry, domainId, 'eligum-b-next');
    const bFallback = wireProbe(registry, domainId, 'eligum-b-fallback');
    void bNext.then(() => { bNextFired = true; });
    void bFallback.then(() => { bFallbackFired = true; });
    registry.executeActionsChain({
      action: { type: ACTION_UNMOUNT_EXT, target: domainId, payload: { subject: 'ext-b' } },
      next: { action: { type: 'eligum-b-next', target: domainId, payload: {} } },
      fallback: { action: { type: 'eligum-b-fallback', target: domainId, payload: {} } },
    });

    // Unregister B's extension while X is still running and unmount(B) is
    // pending — evaluated at ITS turn, B is no longer admitted anywhere.
    await registry.unregisterExtension('ext-b');

    gate.resolve();
    await Promise.race([bNext, bFallback]);
    await xFired;

    expect(bFallbackFired).toBe(true);
    expect(bNextFired).toBe(false);
    expect(unmountInner).not.toHaveBeenCalled();
    expect(registry.getMountedExtensions(domainId)).toEqual(['ext-x']);

    registry.dispose();
  });

  it('[optional] unmount rows: unmount(A) joins an identical pending unmount(A); a different pending entry (including pending mount(A)) is replaced by a newcomer unmount/mount', async () => {
    const plugin = createPlugin();
    const domainId = 'domain-unmount-rows';
    const registry = freshRegistry(plugin);
    const gate = createDeferred();
    const factory = new GatedBeforeStrategyDomainFactory(registry, domainId, 'optional', gate.promise);
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-a', domainId));
    await registry.registerExtension(makeExtension('ext-x', domainId));
    registry.getMounter(domainId).attach(document.createElement('div'));

    // Running: mount(X), gated — keeps the queue non-empty for the whole
    // window below.
    const xFired = wireProbe(registry, domainId, 'rows-x-next');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-x' } },
      next: { action: { type: 'rows-x-next', target: domainId, payload: {} } },
    });

    // Pending: unmount(A) #1.
    const a1Fired = wireProbe(registry, domainId, 'rows-a1-next');
    registry.executeActionsChain({
      action: { type: ACTION_UNMOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'rows-a1-next', target: domainId, payload: {} } },
    });

    // Joins the pending unmount(A).
    const a2Fired = wireProbe(registry, domainId, 'rows-a2-next');
    registry.executeActionsChain({
      action: { type: ACTION_UNMOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'rows-a2-next', target: domainId, payload: {} } },
    });

    gate.resolve();
    await Promise.all([xFired, a1Fired, a2Fired]);

    expect(registry.getMountedExtensions(domainId)).toEqual(['ext-x']);

    registry.dispose();
  });

  it('[optional] unmount rows: an explicit unmount(A) accepted while mount(A) is running waits behind it — success leaves A absent, failure leaves the unmount a no-op', async () => {
    const plugin = createPlugin();
    const domainId = 'domain-unmount-behind-mount';
    const registry = freshRegistry(plugin);
    const gate = createDeferred();
    const factory = new GatedBeforeStrategyDomainFactory(registry, domainId, 'optional', gate.promise);
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-a', domainId));
    registry.getMounter(domainId).attach(document.createElement('div'));

    const aFired = wireProbe(registry, domainId, 'behind-a-next');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'behind-a-next', target: domainId, payload: {} } },
    });

    const unmountInner = vi.spyOn(factory.strategy, 'unmount');
    const unmountFired = wireProbe(registry, domainId, 'behind-unmount-next');
    registry.executeActionsChain({
      action: { type: ACTION_UNMOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'behind-unmount-next', target: domainId, payload: {} } },
    });

    gate.resolve();
    await Promise.all([aFired, unmountFired]);

    expect(unmountInner).toHaveBeenCalledTimes(1);
    expect(registry.getMountedExtensions(domainId)).toEqual([]);

    registry.dispose();
  });

  it('[optional] unmount rows: an explicit unmount(A) accepted while mount(A) is running, and that mount fails before reaching the strategy, succeeds without invoking the strategy\'s own unmount', async () => {
    const plugin = createPlugin();
    const domainId = 'domain-unmount-behind-failing-mount';
    const registry = freshRegistry(plugin);
    const gate = createDeferred();
    const factory = new GatedFailBeforeStrategyDomainFactory(registry, domainId, 'optional', gate.promise, 'ext-a');
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-a', domainId));
    registry.getMounter(domainId).attach(document.createElement('div'));

    const unmountInner = vi.spyOn(factory.strategy, 'unmount');

    // Running: mount(A), gated — 'ext-a' is this factory's designated
    // failing subject, so it fails BEFORE ever reaching the strategy.
    const aFallback = wireProbe(registry, domainId, 'unmountfail-a-fallback');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      fallback: { action: { type: 'unmountfail-a-fallback', target: domainId, payload: {} } },
    });

    // Pending: an explicit unmount(A), waiting behind the running mount(A).
    const unmountFired = wireProbe(registry, domainId, 'unmountfail-unmount-next');
    registry.executeActionsChain({
      action: { type: ACTION_UNMOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'unmountfail-unmount-next', target: domainId, payload: {} } },
    });

    gate.resolve();
    await Promise.all([aFallback, unmountFired]);

    // The mount it waited on failed, so 'ext-a' never became mounted — the
    // unmount succeeds without change, never invoking the strategy's own
    // `unmount` body at all.
    expect(unmountInner).not.toHaveBeenCalled();
    expect(registry.getMountedExtensions(domainId)).toEqual([]);

    registry.dispose();
  });

  it('[optional] unmount rows: unmount(A) replaces a different pending mount(A) — mount(A)\'s caller takes its own fallback and never enters', async () => {
    const plugin = createPlugin();
    const domainId = 'domain-unmount-replaces-pending-mount';
    const registry = freshRegistry(plugin);
    const gate = createDeferred();
    const factory = new GatedBeforeStrategyDomainFactory(registry, domainId, 'optional', gate.promise);
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-x', domainId));
    await registry.registerExtension(makeExtension('ext-a', domainId));
    registry.getMounter(domainId).attach(document.createElement('div'));

    // Running: mount(X), gated.
    const xFired = wireProbe(registry, domainId, 'replrow1-x-next');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-x' } },
      next: { action: { type: 'replrow1-x-next', target: domainId, payload: {} } },
    });

    // Pending: mount(A).
    const aFallback = wireProbe(registry, domainId, 'replrow1-a-fallback');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      fallback: { action: { type: 'replrow1-a-fallback', target: domainId, payload: {} } },
    });

    // unmount(A) — same subject, but a DIFFERENT operation, so it does not
    // join the pending mount(A) (`inst-me-queue-join-same-operation-subject`)
    // — it replaces it instead.
    const unmountFired = wireProbe(registry, domainId, 'replrow1-unmount-next');
    registry.executeActionsChain({
      action: { type: ACTION_UNMOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'replrow1-unmount-next', target: domainId, payload: {} } },
    });

    // The pending mount(A) is replaced and fails well before the gate ever
    // opens — its caller takes its own fallback, and mount(A) never enters.
    await aFallback;
    expect(factory.impl.entries.has('ext-a')).toBe(false);

    gate.resolve();
    await Promise.all([xFired, unmountFired]);

    // mount(A) never entered at all: the queue never even created A's
    // entry before unmount(A) replaced it.
    expect(factory.impl.entries.has('ext-a')).toBe(false);
    expect(registry.getMountedExtensions(domainId)).toEqual(['ext-x']);

    registry.dispose();
  });

  it('[optional] unmount rows: mount(A) replaces a different pending unmount(A) — the strategy\'s own unmount is never invoked for it', async () => {
    const plugin = createPlugin();
    const domainId = 'domain-mount-replaces-pending-unmount';
    const registry = freshRegistry(plugin);
    const gate = createDeferred();
    const factory = new GatedBeforeStrategyDomainFactory(registry, domainId, 'optional', gate.promise);
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-x', domainId));
    await registry.registerExtension(makeExtension('ext-a', domainId));
    registry.getMounter(domainId).attach(document.createElement('div'));

    const unmountInner = vi.spyOn(factory.strategy, 'unmount');

    // Running: mount(X), gated.
    const xFired = wireProbe(registry, domainId, 'replrow2-x-next');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-x' } },
      next: { action: { type: 'replrow2-x-next', target: domainId, payload: {} } },
    });

    // Pending: unmount(A).
    const unmountFallback = wireProbe(registry, domainId, 'replrow2-unmount-fallback');
    registry.executeActionsChain({
      action: { type: ACTION_UNMOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      fallback: { action: { type: 'replrow2-unmount-fallback', target: domainId, payload: {} } },
    });

    // mount(A) — same subject, different operation — replaces the pending
    // unmount(A) instead of joining it.
    const aFired = wireProbe(registry, domainId, 'replrow2-a-next');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'replrow2-a-next', target: domainId, payload: {} } },
    });

    // The pending unmount(A) is replaced and fails well before the gate
    // ever opens — its caller takes its own fallback, and the strategy's
    // own `unmount` is never invoked for it (the replaced entry never
    // starts).
    await unmountFallback;
    expect(unmountInner).not.toHaveBeenCalled();

    gate.resolve();
    await Promise.all([xFired, aFired]);

    expect(unmountInner).not.toHaveBeenCalled();
    expect(registry.getMountedExtensions(domainId)).toEqual(['ext-a']);

    registry.dispose();
  });

  it('[optional] unmount rows: an unmount of a subject absent at its turn succeeds without change, never invoking inner', async () => {
    const plugin = createPlugin();
    const domainId = 'domain-unmount-absent';
    const registry = freshRegistry(plugin);
    const factory = new OptionalDomainFactory(registry, domainId);
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-a', domainId));
    registry.getMounter(domainId).attach(document.createElement('div'));

    const unmountInner = vi.spyOn(factory.strategy, 'unmount');
    const unmountFired = wireProbe(registry, domainId, 'absent-unmount-next');
    registry.executeActionsChain({
      action: { type: ACTION_UNMOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'absent-unmount-next', target: domainId, payload: {} } },
    });

    await unmountFired;
    // The queue's own at-turn evaluation (`inst-um-queue-absent-noop`) finds
    // the subject absent and succeeds without ever calling into the
    // strategy's own `unmount` body.
    expect(unmountInner).not.toHaveBeenCalled();
    expect(registry.getMountedExtensions(domainId)).toEqual([]);

    registry.dispose();
  });

  for (const strategyName of ['optional', 'exclusive'] as const) {
    it(`[${strategyName}] unregister: pending callers take fallback, the pending entry never starts, and the running entry is not interrupted`, async () => {
      const plugin = createPlugin();
      const domainId = `domain-unregister-queue-${strategyName}`;
      const probeDomainId = `${domainId}-probes`;
      const registry = freshRegistry(plugin);
      const gate = createDeferred();
      const factory = new GatedBeforeStrategyDomainFactory(registry, domainId, strategyName, gate.promise);
      registry.registerDomain(makeDomain(domainId, strategyName === 'optional'), factory);
      createProbeDomain(registry, probeDomainId);
      await registry.registerExtension(makeExtension('ext-a', domainId));
      await registry.registerExtension(makeExtension('ext-b', domainId));
      registry.getMounter(domainId).attach(document.createElement('div'));

      const aNext = wireProbe(registry, probeDomainId, 'unreg-a-next');
      const aFallback = wireProbe(registry, probeDomainId, 'unreg-a-fallback');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
        next: { action: { type: 'unreg-a-next', target: probeDomainId, payload: {} } },
        fallback: { action: { type: 'unreg-a-fallback', target: probeDomainId, payload: {} } },
      });

      const bFallback = wireProbe(registry, probeDomainId, 'unreg-b-fallback');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-b' } },
        fallback: { action: { type: 'unreg-b-fallback', target: probeDomainId, payload: {} } },
      });

      const unregisterPromise = registry.unregisterDomain(domainId);
      await bFallback;

      gate.resolve();
      await Promise.race([aNext, aFallback]);
      await unregisterPromise;

      // Running entry A entered and completed: A is mounted, B never was.
      // Pending B never started: no container was created for B.
      expect(factory.hooks.created).toEqual(['ext-a']);
      expect(factory.impl.entries.has('ext-a')).toBe(true);
      expect(factory.impl.entries.has('ext-b')).toBe(false);

      registry.dispose();
    });

    it(`[${strategyName}] dispose: the pending caller settles and its timer clears; the running entry is not interrupted`, async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        const plugin = createPlugin();
        const domainId = `domain-dispose-queue-${strategyName}`;
        const probeDomainId = `${domainId}-probes`;
        const registry = freshRegistry(plugin);
        const gate = createDeferred();
        const factory = new GatedBeforeStrategyDomainFactory(registry, domainId, strategyName, gate.promise);
        const entered = createDeferred();
        const completed = createDeferred();
        factory.onEntered = (subject) => { if (subject === 'ext-a') entered.resolve(); };
        factory.onCompleted = (subject) => { if (subject === 'ext-a') completed.resolve(); };
        registry.registerDomain(makeDomain(domainId, strategyName === 'optional'), factory);
        createProbeDomain(registry, probeDomainId);
        await registry.registerExtension(makeExtension('ext-a', domainId));
        await registry.registerExtension(makeExtension('ext-b', domainId));
        registry.getMounter(domainId).attach(document.createElement('div'));

        // Baseline timer count before either request is dispatched — nothing
        // else in this test arms a timer.
        const baselineTimers = vi.getTimerCount();

        registry.executeActionsChain({
          action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
          next: { action: { type: 'disp-a-next', target: probeDomainId, payload: {} } },
          fallback: { action: { type: 'disp-a-fallback', target: probeDomainId, payload: {} } },
        });

        registry.executeActionsChain({
          action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-b' } },
          fallback: { action: { type: 'disp-b-fallback', target: probeDomainId, payload: {} } },
        });

        // Awaiting A's own entered signal — the first asynchronous gap after
        // both dispatches above — is also a point at which B's own dispatch
        // has reached the queue and been admitted as the pending entry, with
        // its own caller timer armed.
        await entered.promise;

        // Running entry A entered: A started before dispose was called.
        // Pending entry B was admitted but never entered.
        expect(factory.impl.entries.has('ext-a')).toBe(true);
        expect(factory.impl.entries.has('ext-b')).toBe(false);

        // Both requests are admitted: each caller has its own queue timer
        // (`OccupancyCaller.armTimer`, armed by `DomainOccupancyCoordinator`'s
        // own `admit`, for the running entry as much as for the pending one)
        // AND the mediator's own identical per-action bound
        // (`DefaultActionsChainsMediator.invokeWithinTimeout`) — four timers
        // over the pre-dispatch baseline.
        expect(vi.getTimerCount()).toBe(baselineTimers + 4);

        registry.dispose();

        // Pending entry B never entered: B was queued and never started.
        expect(factory.impl.entries.has('ext-b')).toBe(false);

        // `registry.dispose()` fails the pending entry, which clears B's own
        // queue-level caller timer synchronously. A's queue-level caller
        // timer survives: the running entry is never replaced, removed, or
        // interrupted by disposal (`inst-me-queue-running-never-interrupted`).
        // Each action's own per-action timer in the mediator stays armed
        // until that action settles — three timers over the pre-dispatch
        // baseline remain armed at this point.
        expect(vi.getTimerCount()).toBe(baselineTimers + 3);

        // Release the gate so A's own inner physically finishes even though
        // the registry that dispatched it has already been disposed — its
        // entry still settles on its own merits.
        gate.resolve();
        await completed.promise;
      } finally {
        vi.useRealTimers();
      }
    });

    it(`[${strategyName}] unregister: a request dispatched while unregistration is in progress fails, takes its fallback, and never starts`, async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        const plugin = createPlugin();
        const domainId = `domain-unregister-arrival-${strategyName}`;
        const probeDomainId = `${domainId}-probes`;
        const teardownGate = createDeferred();
        const teardownStarted = createDeferred();
        const registry = freshRegistry(
          plugin,
          new GatedUnmountHandler(ENTRY_ID, teardownGate.promise, () => teardownStarted.resolve())
        );
        const factory = new GatedBeforeStrategyDomainFactory(registry, domainId, strategyName, Promise.resolve());
        registry.registerDomain(makeDomain(domainId, strategyName === 'optional'), factory);
        createProbeDomain(registry, probeDomainId);
        await registry.registerExtension(makeExtension('ext-a', domainId));
        await registry.registerExtension(makeExtension('ext-b', domainId));
        registry.getMounter(domainId).attach(document.createElement('div'));

        const aNext = wireProbe(registry, probeDomainId, 'arrival-a-next');
        registry.executeActionsChain({
          action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
          next: { action: { type: 'arrival-a-next', target: probeDomainId, payload: {} } },
        });
        await aNext;

        // Unregistration unmounts A, whose lifecycle `unmount` holds the
        // teardown open until the gate is released; the domain's handlers
        // stay registered throughout.
        const unregisterPromise = registry.unregisterDomain(domainId);
        await teardownStarted.promise;

        const bNext = wireProbe(registry, probeDomainId, 'arrival-b-next');
        const bFallback = wireProbe(registry, probeDomainId, 'arrival-b-fallback');
        registry.executeActionsChain({
          action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-b' } },
          next: { action: { type: 'arrival-b-next', target: probeDomainId, payload: {} } },
          fallback: { action: { type: 'arrival-b-fallback', target: probeDomainId, payload: {} } },
        });
        const bOutcome = Promise.race([
          bNext.then(() => 'next' as const),
          bFallback.then(() => 'fallback' as const),
        ]);

        teardownGate.resolve();
        await unregisterPromise;

        // B failed and took its fallback; its entry never started, so its
        // own task never ran and no container was created for it.
        expect(await bOutcome).toBe('fallback');
        expect(factory.impl.entries.has('ext-b')).toBe(false);
        expect(factory.hooks.created).toEqual(['ext-a']);

        registry.dispose();
      } finally {
        vi.useRealTimers();
      }
    });

    it(`[${strategyName}] unregister: a mount of a still-mounted subject dispatched while unregistration is in progress fails and takes its fallback`, async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        const plugin = createPlugin();
        const domainId = `domain-unregister-still-mounted-${strategyName}`;
        const probeDomainId = `${domainId}-probes`;
        const teardownGate = createDeferred();
        const teardownStarted = createDeferred();
        const registry = freshRegistry(
          plugin,
          new GatedUnmountHandler(ENTRY_ID, teardownGate.promise, () => teardownStarted.resolve())
        );
        const factory = new GatedBeforeStrategyDomainFactory(registry, domainId, strategyName, Promise.resolve());
        registry.registerDomain(makeDomain(domainId, strategyName === 'optional'), factory);
        createProbeDomain(registry, probeDomainId);
        await registry.registerExtension(makeExtension('ext-a', domainId));
        registry.getMounter(domainId).attach(document.createElement('div'));

        const aNext = wireProbe(registry, probeDomainId, 'still-mounted-a-next');
        registry.executeActionsChain({
          action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
          next: { action: { type: 'still-mounted-a-next', target: probeDomainId, payload: {} } },
        });
        await aNext;

        // Unregistration unmounts A, whose lifecycle `unmount` holds the
        // teardown open until the gate is released. A is still the domain's
        // occupant and the queue holds no entry at this point.
        const unregisterPromise = registry.unregisterDomain(domainId);
        await teardownStarted.promise;
        expect(registry.getMountedExtensions(domainId)).toEqual(['ext-a']);

        const againNext = wireProbe(registry, probeDomainId, 'still-mounted-again-next');
        const againFallback = wireProbe(registry, probeDomainId, 'still-mounted-again-fallback');
        registry.executeActionsChain({
          action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
          next: { action: { type: 'still-mounted-again-next', target: probeDomainId, payload: {} } },
          fallback: { action: { type: 'still-mounted-again-fallback', target: probeDomainId, payload: {} } },
        });
        const againOutcome = Promise.race([
          againNext.then(() => 'next' as const),
          againFallback.then(() => 'fallback' as const),
        ]);

        // The request settles while the teardown is still held open: it
        // fails at once instead of completing as already mounted
        // (`inst-me-queue-domain-unregister`, `inst-me-already-mounted-complete`).
        expect(await againOutcome).toBe('fallback');
        expect(factory.hooks.created).toEqual(['ext-a']);

        teardownGate.resolve();
        await unregisterPromise;

        registry.dispose();
      } finally {
        vi.useRealTimers();
      }
    });
  }

  for (const strategyName of ['optional', 'exclusive'] as const) {
    it(`[${strategyName}] already-mounted with a non-empty queue: placed in queue, and — still occupant at its turn — succeeds without container creation or activated`, async () => {
      const plugin = createPlugin();
      const activatedSpy = vi.spyOn(plugin, 'resolveLifecycleStageActivatedId');
      const domainId = `domain-already-mounted-nonempty-${strategyName}`;
      const registry = freshRegistry(plugin);
      // 'ext-g's own mount_ext handler stays gated in flight, then fails
      // BEFORE ever reaching the strategy — a running entry that never
      // touches occupancy, keeping the queue non-empty for the assertion
      // window without ever removing 'ext-a'.
      const gate = createDeferred();
      const factory = new GatedFailBeforeStrategyDomainFactory(registry, domainId, strategyName, gate.promise, 'ext-g');
      registry.registerDomain(makeDomain(domainId, strategyName === 'optional'), factory);
      await registry.registerExtension(makeExtension('ext-a', domainId));
      await registry.registerExtension(makeExtension('ext-g', domainId));
      registry.getMounter(domainId).attach(document.createElement('div'));

      await registry.getMounter(domainId).mount('ext-a', document.createElement('div'));
      expect(registry.getMountedExtensions(domainId)).toEqual(['ext-a']);
      activatedSpy.mockClear();
      factory.hooks.created.length = 0;

      // Running: mount(G) — gated, then fails before reaching the strategy.
      const gFallback = wireProbe(registry, domainId, 'nonempty-g-fallback');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-g' } },
        fallback: { action: { type: 'nonempty-g-fallback', target: domainId, payload: {} } },
      });

      // Pending: mount(A) — already mounted, but the queue is non-empty (G
      // running), so it is placed in the queue and evaluated at its turn.
      const mountSpy = vi.spyOn(factory.strategy, 'mount');
      const aFired = wireProbe(registry, domainId, 'nonempty-a-next');
      registry.executeActionsChain({
        action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
        next: { action: { type: 'nonempty-a-next', target: domainId, payload: {} } },
      });

      gate.resolve();
      await Promise.all([gFallback, aFired]);

      // A's queued mount found itself still the sole occupant at its own
      // turn — no container creation, no additional activated trigger, and
      // the strategy's own `mount` was never called for it (only ever for
      // 'ext-g', which itself never reached the strategy either).
      expect(mountSpy).not.toHaveBeenCalled();
      expect(factory.hooks.created).toEqual([]);
      expect(activatedSpy).not.toHaveBeenCalled();
      expect(registry.getMountedExtensions(domainId)).toEqual(['ext-a']);

      registry.dispose();
    });
  }

  it('inst-me-queue-await-unmount-at-turn (Optional): a mount request racing a slot detach\'s release waits for it, then finds the slot itself torn down and takes its fallback', async () => {
    const plugin = createPlugin();
    const domainId = 'domain-optional-detach-race-queue';
    const unmountStarted = createDeferred();
    const unmountGate = createDeferred();
    const handler = new GatedUnmountHandler(ENTRY_ID, unmountGate.promise, () => unmountStarted.resolve());
    const registry = freshRegistry(plugin, handler);
    const factory = new OptionalDomainFactory(registry, domainId);
    registry.registerDomain(makeDomain(domainId, true), factory);
    await registry.registerExtension(makeExtension('ext-a', domainId));
    const mounter = registry.getMounter(domainId);
    mounter.attach(document.createElement('div'));

    const firstNextFired = wireProbe(registry, domainId, 'detach-race-queue-first-next');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'detach-race-queue-first-next', target: domainId, payload: {} } },
    });
    await firstNextFired;
    expect(registry.getMountedExtensions(domainId)).toContain('ext-a');

    // Not awaited: detach() starts releasing 'ext-a' — its gated lifecycle
    // unmount is genuinely in progress once `unmountStarted` fires.
    const detachPromise = mounter.detach();
    await unmountStarted.promise;

    // A second mount_ext of the same extension, dispatched while detach's
    // release is still in flight — must wait for it (`inst-me-queue-await-unmount-at-turn`)
    // instead of completing on the still-stale mount-set record, and must
    // NOT re-run the strategy on a subject the release removes.
    const secondNextFired = wireProbe(registry, domainId, 'detach-race-queue-second-next');
    const secondFallbackFired = wireProbe(registry, domainId, 'detach-race-queue-second-fallback');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-a' } },
      next: { action: { type: 'detach-race-queue-second-next', target: domainId, payload: {} } },
      fallback: { action: { type: 'detach-race-queue-second-fallback', target: domainId, payload: {} } },
    });
    const secondOutcome = Promise.race([
      secondNextFired.then(() => 'next' as const),
      secondFallbackFired.then(() => 'fallback' as const),
    ]);

    unmountGate.resolve();
    await detachPromise;

    // The waiting mount joins the SAME release detach() itself awaits, so by
    // the time it resumes, detach has already torn the slot's root down too
    // — the fresh mount it attempts finds no root and takes its fallback.
    expect(await secondOutcome).toBe('fallback');
    expect(registry.getMountedExtensions(domainId)).not.toContain('ext-a');

    registry.dispose();
  });

  it('a failed unregisterDomain leaves the domain usable: a mount_ext request is admitted afterwards', async () => {
    const plugin = createPlugin();
    const domainId = 'domain-failed-unregister';
    const registry = freshRegistry(plugin, new ThrowingUnmountHandler(ENTRY_ID));
    registry.registerDomain(makeDomain(domainId, true), new OptionalDomainFactory(registry, domainId));
    await registry.registerExtension(makeExtension('ext-a', domainId));
    await registry.registerExtension(makeExtension('ext-b', domainId));
    const mounter = registry.getMounter(domainId);
    mounter.attach(document.createElement('div'));
    await mounter.mount('ext-a', document.createElement('div'));

    // Draining unmounts ext-a, whose lifecycle `unmount` throws.
    await expect(registry.unregisterDomain(domainId)).rejects.toThrow('unmount failed');

    const nextFired = wireProbe(registry, domainId, 'after-failed-unregister-next');
    const fallbackFired = wireProbe(registry, domainId, 'after-failed-unregister-fallback');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: domainId, payload: { subject: 'ext-b' } },
      next: { action: { type: 'after-failed-unregister-next', target: domainId, payload: {} } },
      fallback: { action: { type: 'after-failed-unregister-fallback', target: domainId, payload: {} } },
    });
    const outcome = await Promise.race([
      nextFired.then(() => 'next' as const),
      fallbackFired.then(() => 'fallback' as const),
    ]);

    expect(outcome).toBe('next');
    expect(registry.getMountedExtensions(domainId)).toContain('ext-b');

    registry.dispose();
  });
});
