/**
 * Non-GTS consumer lifecycle stage resolution AND non-blocking lifecycle
 * stage triggering (`cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering`).
 *
 * Each of the four well-known lifecycle stages (init/activated/deactivated/
 * destroyed) must reach the runtime through `typeSystem.resolveLifecycleStage*Id()`,
 * never through a literal this package spells itself: a consumer whose stages
 * live outside the GTS namespace is otherwise silently unmatched. The fake
 * plugin below answers in a notation that is deliberately NOT GTS, so any
 * runtime path still holding a `gts.frontx.mfes.lifecycle.stage...` literal
 * leaves the corresponding resolver spy uncalled and fails the assertion.
 *
 * This suite ALSO pins the non-blocking contract at each of the five
 * automatic trigger sites: the accompanying runtime transition (register,
 * unregister, mount, unmount) returns without waiting for any dispatched
 * hook chain to settle, declaration order governs DISPATCH order only
 * (never completion order), and a hook's synchronous refusal is contained
 * and reported through the substitutable diagnostic sink rather than
 * propagating to the transition or halting the stage's remaining hooks.
 *
 * Every probe handler below has NO internal `await` unless the test
 * explicitly gates it with a controlled deferred the test resolves itself —
 * so, absent a gate, dispatch and "completion" (the probe's synchronous
 * push) happen in the very same synchronous turn as the triggering call,
 * making every assertion deterministic without `setTimeout`, a poll-based
 * wait, or a bare microtask flush.
 */
// @cpt-algo:cpt-frontx-algo-type-substrate-port-type-of-resolution:p2
import { describe, it, expect, vi } from 'vitest';
// @internal — colocated test, direct relative import is permitted.
import { DefaultMfeRegistry } from '../DefaultMfeRegistry';
import type { TypeSystemPlugin } from '../../type-substrate';
import type { ActionsChain, Extension, ExtensionDomain, LifecycleHook, MfeEntry } from '../../types';
import {
  MfeHandler,
  type ChildMfeBridge,
  type MfeEntryLifecycle,
} from '../../handler/types';
import { MfeBridgeFactoryDefault } from '../../bridge/mfe-bridge-factory-default';
import { ExtensionDomainImplementation } from '../ExtensionDomainImplementation';
import { ExtensionDomainImplementationFactory } from '../ExtensionDomainImplementationFactory';
import type { DomainContext } from '../DomainContext';
import { ConcurrentMountStrategy } from '../mount-strategies';
import type { ContainerHooks } from '../mount-strategy';
import { ActionHandler } from '../../mediator/types';
import type { LifecycleDispatchRefusalDiagnostic, MfeDiagnosticSink } from '../config';

// Fake non-GTS notation for the four lifecycle stages. Deliberately NOT in
// the GTS namespace - if the runtime resolved any stage through a literal
// instead of the plugin, the resolver spies would not fire.
const FAKE_STAGE_INIT = 'cti.example.lifecycle.stage~init';
const FAKE_STAGE_ACTIVATED = 'cti.example.lifecycle.stage~activated';
const FAKE_STAGE_DEACTIVATED = 'cti.example.lifecycle.stage~deactivated';
const FAKE_STAGE_DESTROYED = 'cti.example.lifecycle.stage~destroyed';
const FAKE_ACTION_LOAD_EXT = 'cti.example.action~load_ext.v1~';
const FAKE_ACTION_MOUNT_EXT = 'cti.example.action~mount_ext.v1~';
const FAKE_ACTION_UNMOUNT_EXT = 'cti.example.action~unmount_ext.v1~';
// Dispatched by every lifecycle hook below. Its handler records the stage that
// triggered it, turning "which id did the runtime fire" into an observable
// effect rather than a spy call count.
const FAKE_ACTION_STAGE_PROBE = 'cti.example.action~stage_probe.v1~';

// The stages the mount path drives. Default for the domain's
// `extensionsLifecycleStages`, and for the hooks an extension declares, so the
// mount cases observe exactly one stage each.
const MOUNT_STAGES = [FAKE_STAGE_ACTIVATED, FAKE_STAGE_DEACTIVATED];
// Registration and unregistration drive init and destroyed on the extension
// too, so the cases that cover those widen the domain's allowance and the
// extension's hooks to all four.
const ALL_EXTENSION_STAGES = [
  FAKE_STAGE_INIT,
  FAKE_STAGE_ACTIVATED,
  FAKE_STAGE_DEACTIVATED,
  FAKE_STAGE_DESTROYED,
];

const ENTRY_BASE_ID = 'cti.example.entry~';
const ENTRY_ID = `${ENTRY_BASE_ID}widget.v1`;
const EXTENSION_ID = 'cti.example.extension~widget.v1';

function createNonGtsPlugin(): TypeSystemPlugin {
  // The entry lives in the plugin rather than in an earlier registration,
  // which is how `DefaultExtensionManager.resolveEntry` finds it for a first
  // extension.
  const registered = new Map<string, unknown>([[ENTRY_ID, makeEntry()]]);

  return {
    name: 'NonGtsPlugin',
    version: '1.0.0',
    registerSchema(): void {},
    getSchema(typeId: string): unknown {
      return registered.get(typeId);
    },
    register(): void {},
    isTypeOf(typeId: string, baseTypeId: string): boolean {
      return typeId === baseTypeId || typeId.startsWith(baseTypeId);
    },
    validateInstance() {
      return { valid: true, errors: [] };
    },
    resolveLoadExtActionId(): string {
      return FAKE_ACTION_LOAD_EXT;
    },
    resolveMountExtActionId(): string {
      return FAKE_ACTION_MOUNT_EXT;
    },
    resolveUnmountExtActionId(): string {
      return FAKE_ACTION_UNMOUNT_EXT;
    },
    resolveLifecycleStageInitId(): string {
      return FAKE_STAGE_INIT;
    },
    resolveLifecycleStageActivatedId(): string {
      return FAKE_STAGE_ACTIVATED;
    },
    resolveLifecycleStageDeactivatedId(): string {
      return FAKE_STAGE_DEACTIVATED;
    },
    resolveLifecycleStageDestroyedId(): string {
      return FAKE_STAGE_DESTROYED;
    },
  };
}

// ─── Domain + factory fakes (real ExtensionDomainImplementation) ────────────

const DOMAIN_ID = 'cti.example.domain.concurrent.v1';

/**
 * A controlled deferred the test resolves explicitly — never a timer, never
 * a bare microtask flush. Used to gate a specific probe handler's completion
 * so dispatch order and completion order can be told apart deterministically.
 */
function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** A stage-probe hook action, optionally tagged so a gate can target it by tag. */
function stageProbeChain(stageId: string, tag = stageId): ActionsChain {
  return {
    action: {
      type: FAKE_ACTION_STAGE_PROBE,
      target: DOMAIN_ID,
      payload: { subject: tag },
    },
  };
}

function makeDomain(extensionsLifecycleStages: string[] = MOUNT_STAGES): ExtensionDomain {
  return {
    id: DOMAIN_ID,
    actions: [
      FAKE_ACTION_LOAD_EXT,
      FAKE_ACTION_MOUNT_EXT,
      FAKE_ACTION_UNMOUNT_EXT,
      FAKE_ACTION_STAGE_PROBE,
    ],
    extensionsActions: [],
    sharedProperties: [],
    defaultActionTimeout: 5000,
    // The declared stages and the hooks bound to them are what make the
    // dispatched id observable: DefaultLifecycleManager runs a hook only when
    // `hook.stage` equals the id it was handed, so a runtime firing a GTS
    // literal instead leaves the probe log empty.
    lifecycleStages: [FAKE_STAGE_INIT, FAKE_STAGE_DESTROYED],
    lifecycle: [
      { stage: FAKE_STAGE_INIT, actions_chain: stageProbeChain(FAKE_STAGE_INIT) },
      { stage: FAKE_STAGE_DESTROYED, actions_chain: stageProbeChain(FAKE_STAGE_DESTROYED) },
    ],
    extensionsLifecycleStages,
  };
}

function makeEntry(): MfeEntry {
  return {
    id: ENTRY_ID,
    requiredProperties: [],
    actions: [],
    domainActions: [],
  };
}

function makeExtension(stages: string[] = MOUNT_STAGES): Extension {
  return {
    id: EXTENSION_ID,
    domain: DOMAIN_ID,
    entry: ENTRY_ID,
    // Hooks target the domain rather than the extension: an extension target
    // only resolves once the mounted MFE registers a handler of its own, and
    // the stub lifecycle below registers none.
    lifecycle: stages.map((stage) => ({
      stage,
      actions_chain: stageProbeChain(stage),
    })),
  } as Extension;
}

/** An extension whose `lifecycle` is supplied verbatim, for multi-hook-per-stage cases. */
function makeExtensionWithHooks(lifecycle: LifecycleHook[]): Extension {
  return {
    id: EXTENSION_ID,
    domain: DOMAIN_ID,
    entry: ENTRY_ID,
    lifecycle,
  } as Extension;
}

/**
 * Handler whose load resolves immediately to an inert lifecycle. The mount
 * path only needs a lifecycle object to call; what this test observes is the
 * stage ids the registry fires around that call, so no module loading,
 * manifest or blob chain is involved.
 */
class StubHandler extends MfeHandler {
  readonly bridgeFactory = new MfeBridgeFactoryDefault();

  async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return { mount: () => {}, unmount: () => {} };
  }
}

class TestHooks implements ContainerHooks {
  create(_extensionId: string): Element {
    return document.createElement('div');
  }
  destroy(_extensionId: string): void {}
}

/**
 * The concrete domain implementation every case mounts through. Its
 * stage-probe handler records DISPATCH order synchronously, at the very
 * first line of the handler function — before any `await` — and records
 * COMPLETION (the probe's own settlement) only after an optional per-tag
 * gate resolves. Absent a gate for a given tag, dispatch and completion
 * coincide in the same synchronous turn.
 */
class ConcurrentDomainImpl extends ExtensionDomainImplementation {
  private readonly strategy: ConcurrentMountStrategy;

  constructor(
    ctx: DomainContext,
    private readonly dispatchOrderLog: string[],
    private readonly completionLog: string[],
    private readonly gatesByTag: Map<string, Promise<void>> = new Map()
  ) {
    super();
    const hooks = new TestHooks();
    this.strategy = new ConcurrentMountStrategy(ctx.mounter, hooks);
    ctx.registerHandler(
      FAKE_ACTION_MOUNT_EXT,
      ActionHandler.fromFunction(() => this.strategy.mount({ subject: 'stub' }))
    );
    ctx.registerHandler(
      FAKE_ACTION_UNMOUNT_EXT,
      ActionHandler.fromFunction(() => this.strategy.unmount({ subject: 'stub' }))
    );
    ctx.registerHandler(
      FAKE_ACTION_STAGE_PROBE,
      ActionHandler.fromFunction(async (_actionTypeId, payload) => {
        const subject = payload?.subject;
        if (typeof subject !== 'string') {
          return;
        }
        // Dispatch order: recorded synchronously, before any gate.
        this.dispatchOrderLog.push(subject);
        const gate = this.gatesByTag.get(subject);
        if (gate) {
          await gate;
        }
        this.completionLog.push(subject);
      })
    );
  }

  protected getMountStrategies() {
    return [this.strategy];
  }
}

class ConcurrentDomainFactory extends ExtensionDomainImplementationFactory {
  constructor(
    private readonly dispatchOrderLog: string[],
    private readonly completionLog: string[],
    private readonly gatesByTag?: Map<string, Promise<void>>
  ) {
    super();
  }

  build(ctx: DomainContext): ConcurrentDomainImpl {
    return new ConcurrentDomainImpl(ctx, this.dispatchOrderLog, this.completionLog, this.gatesByTag);
  }
}

// ─── Domain lifecycle: init and destroyed stages ───────────────────────────

describe('non-GTS consumer: domain lifecycle resolves init/destroyed stages through the plugin', () => {
  // inst-resolve-lifecycle-stage-init
  it('runs the domain hook bound to the init stage id the plugin resolved when a domain is registered, without registerDomain waiting on it', () => {
    const plugin = createNonGtsPlugin();
    const initSpy = vi.spyOn(plugin, 'resolveLifecycleStageInitId');
    const dispatchOrderLog: string[] = [];
    const completionLog: string[] = [];
    const registry = new DefaultMfeRegistry({ typeSystem: plugin });

    // `registerDomain` returns `void`, synchronously — no promise to await
    // for the triggered `init` chain. The probe handler has no internal
    // `await`, so by the time this call returns, dispatch AND completion
    // have already happened in the same synchronous turn — no `waitFor`
    // needed.
    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory(dispatchOrderLog, completionLog));

    expect(completionLog).toEqual([FAKE_STAGE_INIT]);
    expect(initSpy).toHaveBeenCalledWith();
  });

  // inst-resolve-lifecycle-stage-destroyed
  it('runs the domain hook bound to the destroyed stage id the plugin resolved when a domain is unregistered, without unregisterDomain waiting on its settlement', async () => {
    const plugin = createNonGtsPlugin();
    const destroyedSpy = vi.spyOn(plugin, 'resolveLifecycleStageDestroyedId');
    const dispatchOrderLog: string[] = [];
    const completionLog: string[] = [];
    const registry = new DefaultMfeRegistry({ typeSystem: plugin });

    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory(dispatchOrderLog, completionLog));
    expect(completionLog).toEqual([FAKE_STAGE_INIT]);
    dispatchOrderLog.length = 0;
    completionLog.length = 0;

    await registry.unregisterDomain(DOMAIN_ID);

    expect(completionLog).toEqual([FAKE_STAGE_DESTROYED]);
    expect(destroyedSpy).toHaveBeenCalledWith();
  });

  it('does not let unregisterDomain wait on a GATED destroyed hook: the transition resolves before the hook completes', async () => {
    const plugin = createNonGtsPlugin();
    const dispatchOrderLog: string[] = [];
    const completionLog: string[] = [];
    const gate = createDeferred();
    const gatesByTag = new Map([[FAKE_STAGE_DESTROYED, gate.promise]]);
    const registry = new DefaultMfeRegistry({ typeSystem: plugin });

    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory(dispatchOrderLog, completionLog, gatesByTag));
    dispatchOrderLog.length = 0;
    completionLog.length = 0;

    const unregisterPromise = registry.unregisterDomain(DOMAIN_ID);
    await unregisterPromise;

    // The transition completed WITHOUT the destroyed hook's chain having
    // settled — it was dispatched (reserved) but is still gated.
    expect(dispatchOrderLog).toEqual([FAKE_STAGE_DESTROYED]);
    expect(completionLog).toEqual([]);

    // Draining the gate lets the hook's chain finish on its own schedule.
    gate.resolve();
    await gate.promise;
    expect(completionLog).toEqual([FAKE_STAGE_DESTROYED]);
  });
});

// ─── Extension lifecycle: activated and deactivated stages ────────────────

/**
 * Register the domain and one extension, then mount it through the domain's
 * mounter — the same route the React slot takes. Returns the logs with the
 * domain's own init entry already dropped, so what remains is what the
 * extension's hooks recorded.
 */
async function mountExtensionThroughRegistry(
  plugin: TypeSystemPlugin,
  extensionStages: string[] = MOUNT_STAGES,
  gatesByTag?: Map<string, Promise<void>>
): Promise<{ registry: DefaultMfeRegistry; dispatchOrderLog: string[]; completionLog: string[] }> {
  const dispatchOrderLog: string[] = [];
  const completionLog: string[] = [];
  const registry = new DefaultMfeRegistry({
    typeSystem: plugin,
    mfeHandlers: [new StubHandler(ENTRY_BASE_ID)],
  });

  registry.registerDomain(
    makeDomain(extensionStages),
    new ConcurrentDomainFactory(dispatchOrderLog, completionLog, gatesByTag)
  );
  expect(completionLog).toEqual([FAKE_STAGE_INIT]);
  dispatchOrderLog.length = 0;
  completionLog.length = 0;

  await registry.registerExtension(makeExtension(extensionStages));

  const mounter = registry.getMounter(DOMAIN_ID);
  mounter.attach(document.createElement('div'));
  await mounter.mount(EXTENSION_ID, document.createElement('div'));

  return { registry, dispatchOrderLog, completionLog };
}

describe('non-GTS consumer: mount lifecycle resolves activated/deactivated stages through the plugin', () => {
  // inst-resolve-lifecycle-stage-activated
  it('runs the extension hook bound to the activated stage id the plugin resolved once the extension has mounted, with mountExtension not holding its promise open past mountState = "mounted"', async () => {
    const plugin = createNonGtsPlugin();
    const activatedSpy = vi.spyOn(plugin, 'resolveLifecycleStageActivatedId');

    const { completionLog } = await mountExtensionThroughRegistry(plugin);

    expect(completionLog).toEqual([FAKE_STAGE_ACTIVATED]);
    expect(activatedSpy).toHaveBeenCalledWith();
  });

  // inst-resolve-lifecycle-stage-deactivated
  it('runs the extension hook bound to the deactivated stage id the plugin resolved when the extension unmounts, without unmount waiting on it', async () => {
    const plugin = createNonGtsPlugin();
    const deactivatedSpy = vi.spyOn(plugin, 'resolveLifecycleStageDeactivatedId');

    const { registry, completionLog } = await mountExtensionThroughRegistry(plugin);
    completionLog.length = 0;

    await registry.getMounter(DOMAIN_ID).unmount(EXTENSION_ID);

    expect(completionLog).toEqual([FAKE_STAGE_DEACTIVATED]);
    expect(deactivatedSpy).toHaveBeenCalledWith();
  });

  it('mountExtension resolves and hands back the bridge before a GATED activated hook has settled', async () => {
    const plugin = createNonGtsPlugin();
    const gate = createDeferred();
    const gatesByTag = new Map([[FAKE_STAGE_ACTIVATED, gate.promise]]);

    const dispatchOrderLog: string[] = [];
    const completionLog: string[] = [];
    const registry = new DefaultMfeRegistry({
      typeSystem: plugin,
      mfeHandlers: [new StubHandler(ENTRY_BASE_ID)],
    });
    registry.registerDomain(
      makeDomain(MOUNT_STAGES),
      new ConcurrentDomainFactory(dispatchOrderLog, completionLog, gatesByTag)
    );
    dispatchOrderLog.length = 0;
    completionLog.length = 0;
    await registry.registerExtension(makeExtension(MOUNT_STAGES));

    const mounter = registry.getMounter(DOMAIN_ID);
    mounter.attach(document.createElement('div'));
    const bridge = await mounter.mount(EXTENSION_ID, document.createElement('div'));

    // `mount()` (and the `mountExtension` it wraps) already resolved with a
    // bridge — the fact the issue reports — while the activated hook's
    // chain is still gated, unsettled.
    expect(bridge).toBeUndefined(); // ExtensionMounter.mount() itself returns void
    expect(dispatchOrderLog).toEqual([FAKE_STAGE_ACTIVATED]);
    expect(completionLog).toEqual([]);

    gate.resolve();
    await gate.promise;
    expect(completionLog).toEqual([FAKE_STAGE_ACTIVATED]);
  });
});

// ─── Extension registration: init and destroyed stages ─────────────────────

describe('non-GTS consumer: extension registration resolves init/destroyed stages through the plugin', () => {
  // inst-resolve-lifecycle-stage-init
  it('runs the extension hook bound to the init stage id the plugin resolved when an extension is registered, without registerExtension waiting on a GATED hook', async () => {
    const plugin = createNonGtsPlugin();
    const initSpy = vi.spyOn(plugin, 'resolveLifecycleStageInitId');
    const dispatchOrderLog: string[] = [];
    const completionLog: string[] = [];
    const gate = createDeferred();
    // Tagged distinctly from the domain's own init hook (untagged, default
    // tag) so gating the EXTENSION's init hook does not also gate the
    // domain's — they are dispatched from different transitions.
    const EXT_INIT_TAG = 'ext-init';
    const gatesByTag = new Map([[EXT_INIT_TAG, gate.promise]]);
    const registry = new DefaultMfeRegistry({
      typeSystem: plugin,
      mfeHandlers: [new StubHandler(ENTRY_BASE_ID)],
    });

    registry.registerDomain(
      makeDomain(ALL_EXTENSION_STAGES),
      new ConcurrentDomainFactory(dispatchOrderLog, completionLog, gatesByTag)
    );
    // Drop the domain's own init so what remains is the extension's.
    expect(completionLog).toEqual([FAKE_STAGE_INIT]);
    dispatchOrderLog.length = 0;
    completionLog.length = 0;
    initSpy.mockClear();

    const extension = makeExtensionWithHooks([
      { stage: FAKE_STAGE_INIT, actions_chain: stageProbeChain(FAKE_STAGE_INIT, EXT_INIT_TAG) },
    ]);

    // registerExtension is acceptance-only and does not await the init
    // stage's own settlement — it resolves while the (gated) hook is still
    // pending.
    await registry.registerExtension(extension);

    expect(dispatchOrderLog).toEqual([EXT_INIT_TAG]);
    expect(completionLog).toEqual([]);
    expect(initSpy).toHaveBeenCalledWith();

    gate.resolve();
    await gate.promise;
    expect(completionLog).toEqual([EXT_INIT_TAG]);
  });

  // inst-resolve-lifecycle-stage-destroyed
  it(
    'dispatches deactivated then destroyed in DECLARATION order when a mounted extension is unregistered, ' +
      'while their COMPLETION order is free to invert — the property this stage-triggering algorithm pins',
    async () => {
      const plugin = createNonGtsPlugin();
      const deactivatedSpy = vi.spyOn(plugin, 'resolveLifecycleStageDeactivatedId');
      const destroyedSpy = vi.spyOn(plugin, 'resolveLifecycleStageDestroyedId');

      // Gate DEACTIVATED (dispatched first) so it completes LAST, and leave
      // DESTROYED (dispatched second) ungated so it completes immediately —
      // deliberately inverting completion order relative to dispatch order.
      const deactivatedGate = createDeferred();
      const gatesByTag = new Map([[FAKE_STAGE_DEACTIVATED, deactivatedGate.promise]]);

      const { registry, dispatchOrderLog, completionLog } = await mountExtensionThroughRegistry(
        plugin,
        ALL_EXTENSION_STAGES,
        gatesByTag
      );
      dispatchOrderLog.length = 0;
      completionLog.length = 0;

      await registry.unregisterExtension(EXTENSION_ID);

      // Dispatch order is the contract: deactivated before destroyed,
      // matching the transition's own internal sequencing (unmount, then
      // destroy) — this is what `inst-algo-lst-dispatch-order` pins.
      expect(dispatchOrderLog).toEqual([FAKE_STAGE_DEACTIVATED, FAKE_STAGE_DESTROYED]);
      // Completion order is NOT the contract: destroyed's ungated chain
      // settles before deactivated's still-gated one —
      // `inst-algo-lst-no-completion-order`.
      expect(completionLog).toEqual([FAKE_STAGE_DESTROYED]);
      expect(deactivatedSpy).toHaveBeenCalledWith();
      expect(destroyedSpy).toHaveBeenCalledWith();

      deactivatedGate.resolve();
      await deactivatedGate.promise;
      expect(completionLog).toEqual([FAKE_STAGE_DESTROYED, FAKE_STAGE_DEACTIVATED]);
    }
  );
});

// ─── Refusal containment and the substitutable diagnostic sink ────────────

describe('non-blocking lifecycle stage triggering: refusal containment (inst-algo-lst-refusal-contained)', () => {
  it(
    'contains a hook synchronously refused by the acceptance-only surface, reports it through the ' +
      'substitutable diagnostic sink, continues to the next hook, and never propagates to the transition',
    async () => {
      const plugin = createNonGtsPlugin();
      const dispatchOrderLog: string[] = [];
      const completionLog: string[] = [];
      const diagnostics: LifecycleDispatchRefusalDiagnostic[] = [];
      const diagnosticSink: MfeDiagnosticSink = {
        reportLifecycleDispatchRefusal(diagnostic) {
          diagnostics.push(diagnostic);
        },
        reportChainNodeFailure() {
          // Not under test here — this suite exercises the REFUSAL shape.
        },
      };

      const registry = new DefaultMfeRegistry({ typeSystem: plugin, diagnosticSink });

      // Two hooks bound to the SAME stage: the first declares an invalid
      // (negative) per-action timeout, refused SYNCHRONOUSLY by the envelope
      // validator before any execution state exists; the second is an
      // ordinary valid probe. Declaration order puts the refused hook
      // first, so containment is what lets the second hook still dispatch.
      const refusedChain: ActionsChain = {
        action: {
          type: FAKE_ACTION_STAGE_PROBE,
          target: DOMAIN_ID,
          payload: { subject: 'refused' },
          timeout: -1,
        },
      };
      const domain = makeDomain([FAKE_STAGE_INIT, FAKE_STAGE_DESTROYED]);
      domain.lifecycle = [
        { stage: FAKE_STAGE_INIT, actions_chain: refusedChain },
        { stage: FAKE_STAGE_INIT, actions_chain: stageProbeChain(FAKE_STAGE_INIT, 'ok') },
      ];

      // registerDomain itself must not throw: the refusal is contained.
      expect(() =>
        registry.registerDomain(domain, new ConcurrentDomainFactory(dispatchOrderLog, completionLog))
      ).not.toThrow();

      // The second hook still dispatched (and, having no gate, completed).
      expect(completionLog).toEqual(['ok']);

      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0]!;
      expect(diagnostic.classification).toBe('lifecycle-dispatch-refusal');
      expect(diagnostic.entityKind).toBe('domain');
      expect(diagnostic.entityId).toBe(DOMAIN_ID);
      expect(diagnostic.stageId).toBe(FAKE_STAGE_INIT);
      expect(diagnostic.hookPosition).toBe(0);
      expect(diagnostic.actionType).toBe(FAKE_ACTION_STAGE_PROBE);
      expect(diagnostic.target).toBe(DOMAIN_ID);
      expect(diagnostic.refusalClass).toBe('invalid_action_timeout');
      expect(typeof diagnostic.correlationId).toBe('string');
      expect(diagnostic.correlationId.length).toBeGreaterThan(0);
      expect(diagnostic.transitionContinued).toBe(true);
    }
  );

  it(
    'a diagnostic sink that itself THROWS while reporting a hook refusal must not abort the ' +
      "transition — the second hook still dispatches, and registerDomain still does not throw",
    async () => {
      const plugin = createNonGtsPlugin();
      const completionLog: string[] = [];
      const throwingSink: MfeDiagnosticSink = {
        reportLifecycleDispatchRefusal() {
          throw new Error('diagnostic sink itself is broken');
        },
        reportChainNodeFailure() {},
      };

      const registry = new DefaultMfeRegistry({ typeSystem: plugin, diagnosticSink: throwingSink });

      // Same shape as the containment test above: the FIRST hook is refused
      // synchronously (invalid declared per-action timeout), the SECOND is
      // an ordinary valid probe.
      const refusedChain: ActionsChain = {
        action: {
          type: FAKE_ACTION_STAGE_PROBE,
          target: DOMAIN_ID,
          payload: { subject: 'refused' },
          timeout: -1,
        },
      };
      const domain = makeDomain([FAKE_STAGE_INIT, FAKE_STAGE_DESTROYED]);
      domain.lifecycle = [
        { stage: FAKE_STAGE_INIT, actions_chain: refusedChain },
        { stage: FAKE_STAGE_INIT, actions_chain: stageProbeChain(FAKE_STAGE_INIT, 'ok') },
      ];

      // The throwing sink must not escape `registerDomain` — a broken
      // host-supplied sink aborting the accompanying transition is exactly
      // the containment defect this test pins.
      expect(() =>
        registry.registerDomain(domain, new ConcurrentDomainFactory([], completionLog))
      ).not.toThrow();

      // The transition was not aborted: the SECOND hook still dispatched
      // (and, having no gate, completed) despite the sink throwing while
      // reporting the FIRST hook's refusal.
      expect(completionLog).toEqual(['ok']);
    }
  );
});

// ─── Deferred target retirement (cpt-frontx-adr-action-dispatch-and-chaining) ─

describe('deferred target retirement: a destroyed hook targeting the entity being torn down', () => {
  it(
    'neither blocks unregisterDomain nor trips the pending-action guard, even though ' +
      'unregisterAllHandlers is called immediately after the (still in-flight) destroyed dispatch',
    async () => {
      const plugin = createNonGtsPlugin();
      const dispatchOrderLog: string[] = [];
      const completionLog: string[] = [];
      const gate = createDeferred();
      // The domain's own `destroyed` hook targets DOMAIN_ID itself
      // (`makeDomain()`'s hook already dispatches against `DOMAIN_ID`) —
      // exactly the scenario deferred retirement resolves: acceptance
      // reserves this hook's first (only) node against DOMAIN_ID before
      // `unregisterDomain` returns, and `DefaultMfeRegistry.unregisterDomain`
      // calls `mediator.unregisterAllHandlers(DOMAIN_ID)` immediately
      // afterward, while that reservation is still gated/pending.
      const gatesByTag = new Map([[FAKE_STAGE_DESTROYED, gate.promise]]);
      const registry = new DefaultMfeRegistry({ typeSystem: plugin });

      registry.registerDomain(makeDomain(), new ConcurrentDomainFactory(dispatchOrderLog, completionLog, gatesByTag));
      dispatchOrderLog.length = 0;
      completionLog.length = 0;

      // Must resolve (not throw, not hang) even though the destroyed hook's
      // own reservation against this same domain is still pending when
      // `unregisterAllHandlers` runs.
      await expect(registry.unregisterDomain(DOMAIN_ID)).resolves.toBeUndefined();

      expect(dispatchOrderLog).toEqual([FAKE_STAGE_DESTROYED]);
      expect(completionLog).toEqual([]); // still gated — not yet drained

      // Draining lets the reserved chain settle on its own terms.
      gate.resolve();
      await gate.promise;
      expect(completionLog).toEqual([FAKE_STAGE_DESTROYED]);
    }
  );

  it(
    'the mediator this registry holds still shows the retiring target\'s handler registrations ' +
      'in place while its reservation is pending — physical removal on drain itself is pinned ' +
      'deterministically at the mediator level (see actions-chains-mediator.test.ts)',
    async () => {
      const plugin = createNonGtsPlugin();
      const dispatchOrderLog: string[] = [];
      const completionLog: string[] = [];
      const gate = createDeferred();
      const gatesByTag = new Map([[FAKE_STAGE_DESTROYED, gate.promise]]);
      const registry = new DefaultMfeRegistry({ typeSystem: plugin });

      registry.registerDomain(makeDomain(), new ConcurrentDomainFactory(dispatchOrderLog, completionLog, gatesByTag));
      dispatchOrderLog.length = 0;
      completionLog.length = 0;

      const unregisterPromise = registry.unregisterDomain(DOMAIN_ID);
      await unregisterPromise;

      // White-box, colocated-package check: the mediator's own handler
      // registrations for the retiring domain survive while its
      // reservation is still pending — never deleted just because
      // `unregisterAllHandlers` was called.
      const mediator = (registry as unknown as { mediator: { actionHandlers: Map<string, unknown> } }).mediator;
      expect(mediator.actionHandlers.has(DOMAIN_ID)).toBe(true);

      // Deterministic cleanup so the gated chain does not leak past this test.
      gate.resolve();
      await gate.promise;
    }
  );
});
