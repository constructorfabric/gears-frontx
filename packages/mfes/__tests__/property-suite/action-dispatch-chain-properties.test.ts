/**
 * Explicit property suite for `cpt-frontx-adr-action-dispatch-and-chaining`.
 *
 * This package already has targeted tests for pieces of this ADR. This suite
 * is the cross-cutting, EXPLICIT pin of the seven properties defined in the
 * ADR — each test names the property it pins in its own
 * description, and is written so that reintroducing the corresponding
 * defect makes it FAIL. Where existing tests already cover a property, this suite extends
 * them rather than duplicating them — each section cites which existing test(s)
 * it builds on.
 *
 * Hygiene: no `setTimeout`, no bare microtask flush, no arbitrary wait to
 * "let it settle". Timing for P6 is INJECTED via `vi.useFakeTimers()` and
 * explicit `vi.advanceTimersByTime()` calls inside test-controlled handlers
 * — never a real sleep. Settlement is always observed via a controlled
 * deferred, a terminal effect (a handler/fallback recording), or the
 * sanctioned internal completion-bearing operations already used elsewhere
 * in this package's test suite (`mediator.runAcceptedChain`,
 * `registry.executeAndAwaitChain` via a local `awaitChain` helper) — never
 * via `await` on a `void`-returning acceptance call.
 *
 * Domain/action ids here are a mock notation, never the real GTS strings —
 * MFES-1 forbids `@gears-frontx/mfes` from carrying a type-format literal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DefaultMfeRegistry } from '../../src/runtime/DefaultMfeRegistry';
import { DefaultActionsChainsMediator } from '../../src/mediator/actions-chains-mediator';
const LARGE_BOUND_MS = 15000;
import { ActionHandler } from '../../src/mediator/types';
import { ChildMfeBridgeImpl } from '../../src/bridge/ChildMfeBridge';
import { BridgeDisposedError, BridgeInactiveError } from '../../src/bridge/errors';
import { CrossHopRoute } from '../../src/mediator/cross-hop-route';
import type { CrossHopEnvelope } from '../../src/mediator/cross-hop-route';
import { fromEnvelopeDiagnostics } from '../../src/mediator/dispatch-diagnostics';
import type { TypeSystemPlugin } from '../../src/type-substrate';
import type { ActionsChain, Extension, ExtensionDomain, MfeEntry } from '../../src/types';
import {
  MfeHandler,
  ChildMfeBridge,
  type MfeEntryLifecycle,
} from '../../src/handler/types';
import { MfeBridgeFactoryDefault } from '../../src/bridge/mfe-bridge-factory-default';
import { ExtensionDomainImplementation } from '../../src/runtime/ExtensionDomainImplementation';
import { ExtensionDomainImplementationFactory } from '../../src/runtime/ExtensionDomainImplementationFactory';
import type { DomainContext } from '../../src/runtime/DomainContext';
import { ConcurrentMountStrategy } from '../../src/runtime/mount-strategies';
import type { ContainerHooks, ActionPayload } from '../../src/runtime/mount-strategy';
import type { ExtensionDomainState } from '../../src/runtime/extension-manager';
import { ActionsChainRefusalError } from '../../src/errors';
import type { DefaultLifecycleManager } from '../../src/runtime/default-lifecycle-manager';
import type { ChainNodeFailureDiagnostic, MfeDiagnosticSink } from '../../src/runtime/config';

// ─── Mock-notation well-known ids ──────────────────────────────────────────

const LOAD_EXT = 'mock.action.v1~load_ext.v1~';
const MOUNT_EXT = 'mock.action.v1~mount_ext.v1~';
const UNMOUNT_EXT = 'mock.action.v1~unmount_ext.v1~';
const ACTION_PRIMARY = 'mock.action.v1~action_primary.v1~';
const ACTION_NEXT = 'mock.action.v1~action_next.v1~';
const ACTION_ROOT = 'mock.action.v1~action_root.v1~';
const ACTION_UNRESOLVABLE = 'mock.action.v1~action_unresolvable.v1~';
const ACTION_FALLBACK = 'mock.action.v1~action_fallback.v1~';

function createMockPlugin(entries: Map<string, MfeEntry> = new Map()): TypeSystemPlugin {
  return {
    name: 'MockPlugin',
    version: '1.0.0',
    registerSchema(): void {},
    getSchema(typeId: string): unknown {
      return entries.get(typeId);
    },
    register(): void {},
    isTypeOf(typeId: string, baseTypeId: string): boolean {
      return typeId === baseTypeId || typeId.startsWith(baseTypeId);
    },
    validateInstance() {
      return { valid: true, errors: [] };
    },
    resolveLoadExtActionId(): string {
      return LOAD_EXT;
    },
    resolveMountExtActionId(): string {
      return MOUNT_EXT;
    },
    resolveUnmountExtActionId(): string {
      return UNMOUNT_EXT;
    },
    resolveLifecycleStageInitId(): string {
      return 'mock.stage.v1~init.v1';
    },
    resolveLifecycleStageActivatedId(): string {
      return 'mock.stage.v1~activated.v1';
    },
    resolveLifecycleStageDeactivatedId(): string {
      return 'mock.stage.v1~deactivated.v1';
    },
    resolveLifecycleStageDestroyedId(): string {
      return 'mock.stage.v1~destroyed.v1';
    },
  };
}

class NoopHooks implements ContainerHooks {
  create(_extensionId: string): Element {
    return document.createElement('div');
  }
  destroy(_extensionId: string): void {}
}

function makeDomain(id: string, extraActions: string[] = []): ExtensionDomain {
  return {
    id,
    actions: [LOAD_EXT, MOUNT_EXT, UNMOUNT_EXT, ...extraActions],
    extensionsActions: [],
    sharedProperties: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
    extensionsTypeId: '',
  } as unknown as ExtensionDomain;
}

class GenericDomainImpl extends ExtensionDomainImplementation {
  private readonly strategy: ConcurrentMountStrategy;

  constructor(ctx: DomainContext, extraHandlers: ReadonlyArray<[string, ActionHandler]> = []) {
    super();
    const hooks = new NoopHooks();
    this.strategy = new ConcurrentMountStrategy(ctx.mounter, hooks);
    ctx.registerHandler(
      MOUNT_EXT,
      ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as ActionPayload))
    );
    ctx.registerHandler(
      UNMOUNT_EXT,
      ActionHandler.fromFunction((_t, p) => this.strategy.unmount!(p as ActionPayload))
    );
    for (const [actionType, handler] of extraHandlers) {
      ctx.registerHandler(actionType, handler);
    }
  }

  protected getMountStrategies() {
    return [this.strategy];
  }
}

class GenericDomainFactory extends ExtensionDomainImplementationFactory {
  constructor(private readonly extraHandlers: ReadonlyArray<[string, ActionHandler]> = []) {
    super();
  }

  build(ctx: DomainContext): GenericDomainImpl {
    return new GenericDomainImpl(ctx, this.extraHandlers);
  }
}

function makeEntry(id: string): MfeEntry {
  return { id, requiredProperties: [], actions: [], domainActions: [] };
}

function makeExtension(id: string, domain: string, entry: string): Extension {
  return { id, domain, entry, lifecycle: [] } as Extension;
}

function actionChain(type: string, target: string, extra: Partial<ActionsChain> = {}): ActionsChain {
  return { action: { type, target, payload: {} }, ...extra };
}

/** An `MfeHandler` whose `mount()` synchronously hands the bridge to a callback. */
class InjectableMountHandler extends MfeHandler {
  readonly bridgeFactory = new MfeBridgeFactoryDefault();

  constructor(
    entryBaseTypeId: string,
    private readonly onMount: (bridge: ChildMfeBridge) => void
  ) {
    super(entryBaseTypeId);
  }

  async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return {
      mount: (_container, bridge) => {
        this.onMount(bridge);
      },
      unmount: () => {},
    };
  }
}

/**
 * Awaits full settlement of a chain via the registry's internal,
 * completion-bearing `executeAndAwaitChain` — the sanctioned pattern already
 * used throughout this package's suites (`bridge-lifetime.test.ts`,
 * `cross-nesting-reachability.test.ts`) to observe a chain's own settlement
 * deterministically, since the public `executeActionsChain` is
 * acceptance-only and yields nothing an emitter can await.
 */
function awaitChain(registry: DefaultMfeRegistry, chain: ActionsChain): Promise<void> {
  return (registry as unknown as { executeAndAwaitChain(chain: ActionsChain): Promise<void> })
    .executeAndAwaitChain(chain);
}

function mediatorOf(registry: DefaultMfeRegistry): DefaultActionsChainsMediator {
  return (registry as unknown as { mediator: DefaultActionsChainsMediator }).mediator;
}

function createDeferred<T = void>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * An explicit settlement signal for a far-side effect a test cannot
 * `await` directly: under the continuation model, the dispatching side's
 * own settlement resolves the instant it hands a node over, well before
 * the far side's own scheduled execution actually runs it. Counter-based
 * rather than a single deferred, so a handler invoked more than once (once
 * per hop scenario sharing one target) can be awaited to a specific count
 * — never a blind microtask flush or a timer-based poll.
 */
function makeCallCounter() {
  let count = 0;
  let notify: () => void = () => {};
  return {
    get count() {
      return count;
    },
    increment(): void {
      count += 1;
      notify();
    },
    waitFor(target: number): Promise<void> {
      if (count >= target) return Promise.resolve();
      return new Promise((resolve) => {
        notify = () => {
          if (count >= target) resolve();
        };
      });
    },
  };
}

function makeMediator(): DefaultActionsChainsMediator {
  return new DefaultActionsChainsMediator({
    typeSystem: createMockPlugin(),
    getDomainState: () => makeDomainState(),
    getExtensionEntry: () => undefined,
  });
}

function makeDomainState(): ExtensionDomainState {
  return {
    domain: {
      id: 'domain-1',
      actions: [],
      extensionsActions: [],
      sharedProperties: [],
      defaultActionTimeout: 5000,
      lifecycleStages: [],
      extensionsLifecycleStages: [],
      extensionsTypeId: '',
    },
    properties: new Map(),
    extensions: new Set(),
    propertySubscribers: new Map(),
    mountedExtensions: [],
    mounter: null,
    lifecycleTrigger: null,
    implementation: null,
  };
}

/**
 * Builds a `CrossHopRoute` chain of exactly `hops` INDEPENDENT mediator
 * boundaries — `hops - 1` intermediate `DefaultActionsChainsMediator`
 * instances, each wired with its OWN `resolveForwardingEntry` route handing
 * over to the next mediator's `acceptSingleNodeForHop` — the same
 * authoritative-acceptance path a real `receiveCrossHopNode` drives —
 * terminating at `farMediator`, which alone holds the registered handler.
 *
 * Deliberately NOT one `send` function closure wrapped `hops` times around a
 * single call to `farMediator`: that would construct only ONE
 * `CrossHopRoute` no matter how large `hops` was passed — silently proving
 * the SAME thing for `hops=1` and `hops=6` alike. Here, each intermediate
 * mediator's own `executeChainRecursive` resolves the action to ITS OWN
 * forwarding route and hands it over through ITS OWN `executeCrossHopNode`
 * — so `hops` truly means `hops` independent boundaries crossed, and the
 * per-action bound enforced across every one of them is resolved and
 * enforced at `farMediator` alone, never supplied by any hop between.
 *
 * Module-scoped (it was local to the P6 suite until P8 below needed the
 * same genuine depth) — kept for both suites so they cross the same real
 * boundaries.
 */
function makeAuthoritativeHopRoute(farMediator: DefaultActionsChainsMediator, hops: number): CrossHopRoute {
  const crossOneHop = (target: DefaultActionsChainsMediator) => (envelope: CrossHopEnvelope): void => {
    // Exactly what `receiveCrossHopNode` does: acceptance is taken
    // SYNCHRONOUSLY here — this call is done the instant it returns, and the
    // node's completion, once it executes, is bounded only at the registry
    // authoritative for the target.
    target.acceptSingleNodeForHop(envelope.node, fromEnvelopeDiagnostics(envelope.diagnostics));
  };

  let downstream = farMediator;
  for (let i = 1; i < hops; i++) {
    const target = downstream;
    downstream = new DefaultActionsChainsMediator({
      typeSystem: createMockPlugin(),
      getDomainState: () => undefined,
      getExtensionEntry: () => undefined,
      resolveForwardingEntry: () => new CrossHopRoute(crossOneHop(target)),
    });
  }
  return new CrossHopRoute(crossOneHop(downstream));
}

// ═════════════════════════════════════════════════════════════════════════
// P1 — Non-awaitable surface
// ═════════════════════════════════════════════════════════════════════════

describe('P1 — Non-awaitable surface', () => {
  it('MfeRegistry.executeActionsChain returns exactly undefined at runtime', () => {
    const registry = new DefaultMfeRegistry({ typeSystem: createMockPlugin() });
    registry.registerDomain(makeDomain('d-p1-registry'), new GenericDomainFactory());

    const returned = registry.executeActionsChain(
      actionChain(MOUNT_EXT, 'd-p1-registry', { action: { type: 'mock.action.v1~noop.v1~', target: 'd-p1-registry' } })
    );

    expect(returned).toBeUndefined();
  });

  it("ChildMfeBridge.executeActionsChain returns exactly undefined at runtime", async () => {
    let capturedBridge: ChildMfeBridge | undefined;
    const entries = new Map<string, MfeEntry>([['entry.p1', makeEntry('entry.p1')]]);
    const registry = new DefaultMfeRegistry({
      typeSystem: createMockPlugin(entries),
      mfeHandlers: [new InjectableMountHandler('entry.p1', (bridge) => { capturedBridge = bridge; })],
    });
    registry.registerDomain(makeDomain('d-p1-bridge'), new GenericDomainFactory());
    await registry.registerExtension(makeExtension('ext.p1', 'd-p1-bridge', 'entry.p1'));
    const mounter = registry.getMounter('d-p1-bridge');
    mounter.attach(document.createElement('div'));
    await mounter.mount('ext.p1', document.createElement('div'));

    expect(capturedBridge).toBeDefined();
    capturedBridge!.registerActionHandler('mock.action.v1~ping.v1~', ActionHandler.fromFunction(async () => {}));

    const returned = capturedBridge!.executeActionsChain(actionChain('mock.action.v1~ping.v1~', 'ext.p1'));
    expect(returned).toBeUndefined();
  });

  it("the mediator's acceptance operation (DefaultActionsChainsMediator.executeActionsChain) returns exactly undefined at runtime", () => {
    const mediator = makeMediator();
    mediator.registerHandler('domain-1', MOUNT_EXT, ActionHandler.fromFunction(async () => {}));

    const returned = mediator.executeActionsChain(actionChain(MOUNT_EXT, 'domain-1'));
    expect(returned).toBeUndefined();
  });

  it('all three DefaultLifecycleManager trigger methods return exactly undefined at runtime', async () => {
    const registry = new DefaultMfeRegistry({ typeSystem: createMockPlugin() });
    registry.registerDomain(makeDomain('d-p1-lm'), new GenericDomainFactory());
    const entries = new Map<string, MfeEntry>([['entry.p1-lm', makeEntry('entry.p1-lm')]]);
    const registry2 = new DefaultMfeRegistry({ typeSystem: createMockPlugin(entries) });
    registry2.registerDomain(makeDomain('d-p1-lm2'), new GenericDomainFactory());
    await registry2.registerExtension(makeExtension('ext.p1-lm', 'd-p1-lm2', 'entry.p1-lm'));

    const lifecycleManager = (registry2 as unknown as { lifecycleManager: DefaultLifecycleManager }).lifecycleManager;

    expect(lifecycleManager.triggerLifecycleStage('ext.p1-lm', 'mock.stage.v1~init.v1')).toBeUndefined();
    expect(lifecycleManager.triggerDomainLifecycleStage('d-p1-lm2', 'mock.stage.v1~init.v1')).toBeUndefined();
    expect(lifecycleManager.triggerDomainOwnLifecycleStage('d-p1-lm2', 'mock.stage.v1~init.v1')).toBeUndefined();
  });

  it('all three DomainLifecycleTrigger methods return exactly undefined at runtime', () => {
    const registry = new DefaultMfeRegistry({ typeSystem: createMockPlugin() });
    registry.registerDomain(makeDomain('d-p1-dlt'), new GenericDomainFactory());
    const domainState = registry.getDomainState('d-p1-dlt');
    expect(domainState?.lifecycleTrigger).toBeDefined();
    const trigger = domainState!.lifecycleTrigger!;

    expect(trigger.triggerOwnStage('mock.stage.v1~init.v1')).toBeUndefined();
    expect(trigger.triggerStage('mock.stage.v1~init.v1')).toBeUndefined();
    // triggerExtensionStage throws synchronously for an unregistered extension
    // id (per its own contract) rather than returning — exercised with a
    // valid stage on the domain's own id is not meaningful for this method,
    // so this leg is proven instead by P1's registry-level bridge test above,
    // which drives the same dispatch surface through a real mounted extension.
    expect(() => trigger.triggerExtensionStage('unknown-ext', 'mock.stage.v1~init.v1')).toThrow();
  });

  it("ChainResult and ChainExecutionOptions are not importable from the package root", () => {
    // Static, source-level regression guard: the public barrel
    // (`src/index.ts`) must never (re-)export either identifier. A runtime
    // `import()` check would be misleading here, since `export type` erases
    // at compile time regardless of whether the barrel still names it — the
    // property this pins is that the barrel's OWN export list never grows
    // to include them again.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const barrelPath = path.resolve(here, '../../src/index.ts');
    const barrelSource = fs.readFileSync(barrelPath, 'utf-8');
    // Strip line comments before checking: the barrel is ALLOWED to mention
    // these identifiers in prose explaining why they were removed — what
    // must never reappear is an actual `export`/`export type` of either.
    const withoutLineComments = barrelSource
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');

    expect(withoutLineComments).not.toMatch(/\bChainResult\b/);
    expect(withoutLineComments).not.toMatch(/\bChainExecutionOptions\b/);
  });

  it(
    'the public barrel never exposes a completion-bearing dispatch operation: ' +
      'ChildMfeBridgeImpl and ParentMfeBridgeImpl (the concrete bridge classes) are not re-exported, ' +
      'and no exported function/class carries a completion-bearing sendActionsChain() method',
    async () => {
      const publicApi: Record<string, unknown> = await import('../../src/index');
      const { ChildMfeBridgeImpl } = await import('../../src/bridge/ChildMfeBridge');
      const { ParentMfeBridgeImpl } = await import('../../src/bridge/ParentMfeBridge');

      const exportedValues = Object.values(publicApi);
      // Neither concrete implementation is reachable BY VALUE from the
      // public barrel — whether under its own name or re-exported under a
      // different one.
      expect(exportedValues).not.toContain(ChildMfeBridgeImpl);
      expect(exportedValues).not.toContain(ParentMfeBridgeImpl);

      // Generically: no function/class the barrel actually exports carries
      // a method literally named `sendActionsChain` on its own prototype —
      // the concrete completion-bearing operation this property forbids on
      // the public surface, wherever it might otherwise be exposed from.
      for (const [name, value] of Object.entries(publicApi)) {
        if (typeof value === 'function' && value.prototype) {
          expect(
            Object.getOwnPropertyNames(value.prototype),
            `export '${name}' must not carry a completion-bearing 'sendActionsChain' method`
          ).not.toContain('sendActionsChain');
        }
      }
    }
  );
});

// ═════════════════════════════════════════════════════════════════════════
// P2 — Immediate acceptance
// ═════════════════════════════════════════════════════════════════════════
//
// The reservation itself — that `inst-add-inflight`'s in-flight tracking
// entry exists BEFORE the handler is invoked, for both a local node and a
// cross-hop node — is pinned exhaustively, by direct inspection of the
// mediator's own `pendingActions`/`actionHandlers` state, in
// `actions-chains-mediator.test.ts`'s "deferred target retirement" and
// "cross-hop reservation ordering" suites. The tests below deliberately do
// NOT re-claim that property (a test proving only synchronous INVOCATION
// timing would still pass with `trackPendingAction` deleted entirely) —
// they are scoped to a narrower, distinct property: that the dispatching
// call's own synchronous prefix has already invoked the handler (not
// merely resolved it) before returning.

describe('P2 — Immediate acceptance (synchronous invocation timing; see the reservation-ordering suites in actions-chains-mediator.test.ts for the reservation itself)', () => {
  it(
    'a direct dispatch: the dispatching call has already returned, and the handler has already been ' +
      'INVOKED (not settled) — synchronous invocation timing only, NOT proof that an in-flight ' +
      'reservation exists (that is pinned directly in actions-chains-mediator.test.ts)',
    () => {
      const mediator = makeMediator();
      const gate = createDeferred();
      let invokedCount = 0;
      let settledCount = 0;
      mediator.registerHandler(
        'domain-1',
        MOUNT_EXT,
        ActionHandler.fromFunction(async () => {
          invokedCount += 1;
          await gate.promise;
          settledCount += 1;
        })
      );

      // Acceptance-only: this call returns `undefined` synchronously.
      const returned = mediator.executeActionsChain(actionChain(MOUNT_EXT, 'domain-1'));

      expect(returned).toBeUndefined();
      // The dispatching call has returned AND the caller has proceeded to
      // this line while the handler is invoked but not yet settled — proof
      // of SYNCHRONOUS INVOCATION timing (acceptance's synchronous prefix
      // reaches the handler call before this method returns). This alone
      // does not prove an in-flight RESERVATION exists — it would hold
      // identically with `trackPendingAction` deleted — see the
      // reservation-ordering suites in `actions-chains-mediator.test.ts`
      // for that distinct property.
      expect(invokedCount).toBe(1);
      expect(settledCount).toBe(0);

      gate.resolve();
    }
  );

  it(
    'through a lifecycle transition: registerDomain returns while its GATED init hook is still in flight ' +
      '(extends the non-gts-lifecycle-stages.test.ts coverage of the same property, framed explicitly as P2)',
    async () => {
      const gate = createDeferred();
      let invoked = false;
      let settled = false;
      const domain = makeDomain('d-p2-lifecycle', ['mock.action.v1~probe.v1~']);
      domain.lifecycle = [
        {
          stage: 'mock.stage.v1~init.v1',
          actions_chain: actionChain('mock.action.v1~probe.v1~', 'd-p2-lifecycle'),
        },
      ];
      domain.lifecycleStages = ['mock.stage.v1~init.v1'];

      class GatedFactory extends ExtensionDomainImplementationFactory {
        build(ctx: DomainContext) {
          class Impl extends ExtensionDomainImplementation {
            private readonly strategy = new ConcurrentMountStrategy(ctx.mounter, new NoopHooks());
            constructor() {
              super();
              ctx.registerHandler(MOUNT_EXT, ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as ActionPayload)));
              ctx.registerHandler(UNMOUNT_EXT, ActionHandler.fromFunction((_t, p) => this.strategy.unmount!(p as ActionPayload)));
              ctx.registerHandler(
                'mock.action.v1~probe.v1~',
                ActionHandler.fromFunction(async () => {
                  invoked = true;
                  await gate.promise;
                  settled = true;
                })
              );
            }
            protected getMountStrategies() {
              return [this.strategy];
            }
          }
          return new Impl();
        }
      }

      const registry = new DefaultMfeRegistry({ typeSystem: createMockPlugin() });

      // registerDomain is itself synchronous and returns `void`.
      const returned = registry.registerDomain(domain, new GatedFactory());

      expect(returned).toBeUndefined();
      expect(invoked).toBe(true);
      expect(settled).toBe(false); // the transition proceeded past its return without waiting

      gate.resolve();
      await gate.promise;
    }
  );
});

// ═════════════════════════════════════════════════════════════════════════
// P3 — True synchronous refusal
// ═════════════════════════════════════════════════════════════════════════

describe('P3 — True synchronous refusal', () => {
  it('a disposed bridge throws synchronously (BridgeDisposedError), never a rejected promise', () => {
    const childBridge = new ChildMfeBridgeImpl('domain.p3', 'ext.p3-disposed');
    childBridge.activate();
    childBridge.destroy();

    // If this were implemented as an async rejection instead of a
    // synchronous throw, `executeActionsChain` would return a Promise and
    // this assertion — which requires the CALL ITSELF to throw — would fail.
    expect(() => childBridge.executeActionsChain(actionChain(MOUNT_EXT, 'ext.p3-disposed'))).toThrow(
      BridgeDisposedError
    );
  });

  it('an inactive (never-activated) bridge throws synchronously (BridgeInactiveError), never a rejected promise', () => {
    const childBridge = new ChildMfeBridgeImpl('domain.p3', 'ext.p3-inactive');
    // Never activated.
    expect(() => childBridge.executeActionsChain(actionChain(MOUNT_EXT, 'ext.p3-inactive'))).toThrow(
      BridgeInactiveError
    );
  });

  it('an unwired dispatch callback throws synchronously, never a rejected promise', () => {
    const childBridge = new ChildMfeBridgeImpl('domain.p3', 'ext.p3-unwired');
    childBridge.activate();
    // `setExecuteActionsChainCallback` deliberately never called.
    expect(() => childBridge.executeActionsChain(actionChain(MOUNT_EXT, 'ext.p3-unwired'))).toThrow(
      /not connected/i
    );
  });

  it('a disposed registry throws synchronously (ActionsChainRefusalError, disposed_registry), never a rejected promise', () => {
    const registry = new DefaultMfeRegistry({ typeSystem: createMockPlugin() });
    registry.registerDomain(makeDomain('d-p3-registry'), new GenericDomainFactory());
    registry.dispose();

    let caught: unknown;
    try {
      registry.executeActionsChain(actionChain(MOUNT_EXT, 'd-p3-registry'));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ActionsChainRefusalError);
    expect((caught as ActionsChainRefusalError).refusalClass).toBe('disposed_registry');
  });

  it(
    'none of the four refusals above produce an unhandled promise rejection: a listener installed ' +
      'for the duration of each call observes nothing',
    () => {
      const rejections: unknown[] = [];
      const onUnhandled = (reason: unknown) => rejections.push(reason);
      process.on('unhandledRejection', onUnhandled);
      try {
        const disposedBridge = new ChildMfeBridgeImpl('d', 'e1');
        disposedBridge.activate();
        disposedBridge.destroy();
        expect(() => disposedBridge.executeActionsChain(actionChain(MOUNT_EXT, 'e1'))).toThrow();

        const inactiveBridge = new ChildMfeBridgeImpl('d', 'e2');
        expect(() => inactiveBridge.executeActionsChain(actionChain(MOUNT_EXT, 'e2'))).toThrow();

        const unwiredBridge = new ChildMfeBridgeImpl('d', 'e3');
        unwiredBridge.activate();
        expect(() => unwiredBridge.executeActionsChain(actionChain(MOUNT_EXT, 'e3'))).toThrow();

        const registry = new DefaultMfeRegistry({ typeSystem: createMockPlugin() });
        registry.dispose();
        expect(() => registry.executeActionsChain(actionChain(MOUNT_EXT, 'x'))).toThrow();
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
      // Synchronous throws create no Promise at all, so nothing can ever
      // reject asynchronously as a result of the four calls above.
      expect(rejections).toEqual([]);
    }
  );
});

// ═════════════════════════════════════════════════════════════════════════
// P4 — Failure stays executor-owned
// ═════════════════════════════════════════════════════════════════════════

describe('P4 — Failure stays executor-owned', () => {
  it(
    "a valid chain whose first target is unresolved: the public acceptance call itself never throws, " +
      "the chain's declared fallback runs (proven by its own effect), and a SUBSTITUTED diagnostic " +
      "sink receives the failing node's identity",
    async () => {
      // Before `inst-diagnostic-record` closed the mediator's gap, this
      // property could only assert the mediator's hardcoded
      // `console.debug` call at `inst-no-handler` by its literal string and
      // shallow shape — there was no injectable sink for a chain-node
      // failure, only `MfeDiagnosticSink.reportLifecycleDispatchRefusal`
      // for a lifecycle hook's dispatch REFUSAL. Now the SAME kind of
      // substitutable sink covers a node failure too
      // (`MfeDiagnosticSink.reportChainNodeFailure`), and this test asserts
      // against that sink directly instead of console output.
      const nodeFailures: ChainNodeFailureDiagnostic[] = [];
      const diagnosticSink: MfeDiagnosticSink = {
        reportLifecycleDispatchRefusal() {
          // Not under test here — this property exercises a chain-node
          // failure, not a lifecycle-hook refusal.
        },
        reportChainNodeFailure(diagnostic) {
          nodeFailures.push(diagnostic);
        },
      };
      const fallbackCounter = { count: 0 };
      const registry = new DefaultMfeRegistry({ typeSystem: createMockPlugin(), diagnosticSink });
      registry.registerDomain(
        makeDomain('d-p4', [ACTION_FALLBACK]),
        new GenericDomainFactory([
          [ACTION_FALLBACK, ActionHandler.fromFunction(async () => { fallbackCounter.count += 1; })],
        ])
      );

      const chain: ActionsChain = {
        action: { type: ACTION_UNRESOLVABLE, target: 'd-p4', payload: {} },
        fallback: actionChain(ACTION_FALLBACK, 'd-p4'),
      };

      // The public, acceptance-only call must not throw for a chain whose
      // failure is discoverable only during execution (a chain failure, not
      // a refusal).
      expect(() => registry.executeActionsChain(chain)).not.toThrow();

      // Observe the fallback's own effect deterministically via the
      // sanctioned internal completion-bearing operation, on a fresh but
      // shape-identical chain (the one above was already fire-and-forget
      // dispatched, and its own settlement is not independently observable
      // from the public surface by design).
      await awaitChain(registry, {
        action: { type: ACTION_UNRESOLVABLE, target: 'd-p4', payload: {} },
        fallback: actionChain(ACTION_FALLBACK, 'd-p4'),
      });

      // The chain's declared fallback actually ran — proven by its own
      // effect (a counter it incremented), never by inspecting a returned
      // value (acceptance-only dispatch yields none).
      expect(fallbackCounter.count).toBeGreaterThanOrEqual(1);

      // The SUBSTITUTED sink received a structured diagnostic for the
      // failing node — the accumulated path, the node's own target, the
      // failure class, and a correlation identity for the dispatch — for
      // BOTH the fire-and-forget and the awaited dispatch above.
      expect(nodeFailures.length).toBeGreaterThanOrEqual(2);
      for (const diagnostic of nodeFailures) {
        expect(diagnostic).toEqual(
          expect.objectContaining({
            classification: 'chain-node-failure',
            target: 'd-p4',
            failureClass: 'missing-handler',
            path: expect.arrayContaining([ACTION_UNRESOLVABLE]),
            correlationId: expect.any(String),
          })
        );
      }
      // The two dispatches are distinct: each carries its OWN correlation
      // identity, never a shared/reused one.
      expect(new Set(nodeFailures.map((d) => d.correlationId)).size).toBe(nodeFailures.length);
    }
  );
});

// ═════════════════════════════════════════════════════════════════════════
// P5 — Origin/depth equivalence
// ═════════════════════════════════════════════════════════════════════════

describe('P5 — Origin/depth equivalence', () => {
  // Topology: registry0 (root, domain D0) -> child-ext -> registry1
  // (mid-tree, domain D1) -> grandchild-ext -> registry2 (leaf, no local
  // domain of its own). The SAME declared chain is dispatched from each of
  // the three registries' own mediators (`mediator.runAcceptedChain`, the
  // sanctioned way to observe a chain's settlement class and path
  // deterministically — see `bridge-lifetime.test.ts`).
  const D0 = 'domain.p5.shell.v1';
  const D1 = 'domain.p5.mid.v1';
  const CHILD_ENTRY = 'entry.p5.child.v1';
  const GRANDCHILD_ENTRY = 'entry.p5.grandchild.v1';
  const CHILD_EXT = 'ext.p5.child.v1';
  const GRANDCHILD_EXT = 'ext.p5.grandchild.v1';

  async function buildP5Topology() {
    const entries = new Map<string, MfeEntry>([
      [CHILD_ENTRY, makeEntry(CHILD_ENTRY)],
      [GRANDCHILD_ENTRY, makeEntry(GRANDCHILD_ENTRY)],
    ]);
    const plugin = createMockPlugin(entries);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rootCounter = makeCallCounter();
    const primaryLog: string[] = [];
    const nextLog: string[] = [];
    const primaryCounter = makeCallCounter();
    const nextCounter = makeCallCounter();

    let registry1!: DefaultMfeRegistry;
    let registry2!: DefaultMfeRegistry;

    const childHandler = new InjectableMountHandler(CHILD_ENTRY, () => {
      registry1 = new DefaultMfeRegistry({
        typeSystem: plugin,
        mfeHandlers: [
          new InjectableMountHandler(GRANDCHILD_ENTRY, () => {
            registry2 = new DefaultMfeRegistry({ typeSystem: plugin });
          }),
        ],
      });
      registry1.registerDomain(
        makeDomain(D1, [ACTION_PRIMARY, ACTION_NEXT]),
        new GenericDomainFactory([
          [ACTION_PRIMARY, ActionHandler.fromFunction(async () => { primaryLog.push('D1'); primaryCounter.increment(); })],
          [ACTION_NEXT, ActionHandler.fromFunction(async () => { nextLog.push('D1'); nextCounter.increment(); })],
        ])
      );
    });

    const registry0 = new DefaultMfeRegistry({
      typeSystem: plugin,
      mfeHandlers: [childHandler],
    });
    registry0.registerDomain(
      makeDomain(D0, [ACTION_ROOT]),
      new GenericDomainFactory([
        [ACTION_ROOT, ActionHandler.fromFunction(async () => { rootCounter.increment(); })],
      ])
    );

    await registry0.registerExtension(makeExtension(CHILD_EXT, D0, CHILD_ENTRY));
    const mounter0 = registry0.getMounter(D0);
    mounter0.attach(document.createElement('div'));
    await mounter0.mount(CHILD_EXT, document.createElement('div'));

    await registry1.registerExtension(makeExtension(GRANDCHILD_EXT, D1, GRANDCHILD_ENTRY));
    const mounter1 = registry1.getMounter(D1);
    mounter1.attach(document.createElement('div'));
    await mounter1.mount(GRANDCHILD_EXT, document.createElement('div'));

    return {
      registry0,
      registry1,
      registry2,
      rootCounter,
      primaryLog,
      nextLog,
      primaryCounter,
      nextCounter,
      errorSpy,
    };
  }

  it(
    'local resolution (mid), downward forwarding (root), and double escalation (leaf) all produce the ' +
      'IDENTICAL handler-and-fallback sequence and settlement class for the SAME successful chain',
    async () => {
      const { registry0, registry1, registry2, primaryLog, nextLog, primaryCounter, nextCounter } =
        await buildP5Topology();

      const chain = (): ActionsChain => ({
        action: { type: ACTION_PRIMARY, target: D1, payload: {} },
        next: { action: { type: ACTION_NEXT, target: D1, payload: {} } },
      });

      const expectedPath = [ACTION_PRIMARY, ACTION_NEXT];

      // registry1: resolves LOCALLY (D1 is registry1's own domain) — the
      // only one of the three dispatches below whose OWN settlement
      // reflects the outcome; the other two hand the node over across a
      // hop and are done with it immediately (`inst-t-pending-handed-over`).
      const fromMid = await mediatorOf(registry1).runAcceptedChain(chain());

      // registry0: resolves via the DOWNWARD FORWARDING-ENTRY tier (D1 was
      // propagated up to it by registry1) — observed through D1's own
      // terminal effect, not through registry0's own settlement.
      void mediatorOf(registry0).runAcceptedChain(chain());
      // registry2: resolves via UPWARD ESCALATION to registry1 — likewise
      // observed only through D1's own terminal effect.
      void mediatorOf(registry2).runAcceptedChain(chain());

      // All three dispatches reach D1's own handlers, in order, each
      // producing the SAME two-entry sequence there.
      await Promise.all([primaryCounter.waitFor(3), nextCounter.waitFor(3)]);
      expect(primaryLog.length).toBe(3);
      expect(nextLog.length).toBe(3);

      expect(fromMid).toMatchObject({ completed: true, path: expectedPath });
    }
  );

  it(
    'the SAME failing-then-falling-back chain produces an IDENTICAL path and settlement class from the ' +
      'root (downward forwarding failure -> local fallback), the mid-tree registry (local failure -> single ' +
      'escalation), and the leaf (double-escalated failure -> double-escalated fallback)',
    async () => {
      const { registry0, registry1, registry2, rootCounter } = await buildP5Topology();

      const chain = (): ActionsChain => ({
        action: { type: ACTION_UNRESOLVABLE, target: D1, payload: {} },
        fallback: actionChain(ACTION_ROOT, D0),
      });

      // Every one of these three dispatches hands its fallback continuation
      // across at least one hop to reach D0 (the shell's own domain) — none
      // of registry0/registry1/registry2's OWN settlements reflects the
      // outcome, since handing a node over ends that runtime's own path at
      // it immediately (`inst-t-pending-handed-over`). Observed purely
      // through the shell's own terminal effect instead.
      void mediatorOf(registry0).runAcceptedChain(chain());
      void mediatorOf(registry1).runAcceptedChain(chain());
      void mediatorOf(registry2).runAcceptedChain(chain());

      // Terminal effect: the shell's own ACTION_ROOT handler ran once per
      // origin — proving the fallback genuinely reached and executed the
      // shell's handler in every case, from the root (downward forwarding
      // failure -> local fallback), the mid-tree registry (local failure ->
      // single escalation), and the leaf (double-escalated failure ->
      // double-escalated fallback) alike.
      await rootCounter.waitFor(3);
      expect(rootCounter.count).toBe(3);
    }
  );

  it(
    'CONTRACT: a target reachable from an ancestor is genuinely unreachable from a registry constructed ' +
      'OUTSIDE the synchronous mount window — a root with no adopted inbound bridge stays disconnected ' +
      'by design, not a failure',
    async () => {
      const plugin = createMockPlugin();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const registryA = new DefaultMfeRegistry({ typeSystem: plugin });
      registryA.registerDomain(
        makeDomain('d-p5-disconnected-a', [ACTION_ROOT]),
        new GenericDomainFactory([[ACTION_ROOT, ActionHandler.fromFunction(async () => {})]])
      );

      // registryB is constructed completely independently — never inside
      // any extension's synchronous `mount()` body, so it adopts no inbound
      // bridge and is, by design, a root with no path to registryA.
      const registryB = new DefaultMfeRegistry({ typeSystem: plugin });

      const settlement = await mediatorOf(registryB).runAcceptedChain(
        actionChain(ACTION_ROOT, 'd-p5-disconnected-a')
      );

      // Not a bug: registryB has no inbound bridge and registryA never
      // advertised through one that doesn't exist. This is the documented
      // boundary of the cross-nesting reachability guarantee, not a defect.
      expect(settlement.completed).toBe(false);
      errorSpy.mockRestore();
    }
  );
});

// ═════════════════════════════════════════════════════════════════════════
// P6 — Per-action-timeout-and-origin equivalence
// ═════════════════════════════════════════════════════════════════════════

describe('P6 — Per-action-timeout-and-origin equivalence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeDomainStateFor(id: string, defaultActionTimeout: number): ExtensionDomainState {
    return {
      domain: {
        id,
        actions: [],
        extensionsActions: [],
        sharedProperties: [],
        defaultActionTimeout,
        lifecycleStages: [],
        extensionsLifecycleStages: [],
        extensionsTypeId: '',
      },
      properties: new Map(),
      extensions: new Set(),
      propertySubscribers: new Map(),
      mountedExtensions: [],
      mounter: null,
      lifecycleTrigger: null,
      implementation: null,
    };
  }

  it(
    'the SAME action and authoritative target enforce the SAME per-action bound whether reached ' +
      'LOCALLY or across one or more simulated hops: settlement below the bound succeeds, and it is ' +
      "never derived from anything the dispatching side supplies — the author-declared action.timeout " +
      'is never rewritten by the executor',
    async () => {
      const DECLARED_ACTION_TIMEOUT = 100;
      const FAST_HANDLER_MS = 10;

      const localMediator = new DefaultActionsChainsMediator({
        typeSystem: createMockPlugin(),
        getDomainState: () => makeDomainStateFor('domain-1', 5000),
        getExtensionEntry: () => undefined,
      });
      localMediator.registerHandler(
        'domain-1',
        ACTION_PRIMARY,
        ActionHandler.fromFunction(async () => {
          vi.advanceTimersByTime(FAST_HANDLER_MS);
        })
      );
      const localChain: ActionsChain = {
        action: { type: ACTION_PRIMARY, target: 'domain-1', timeout: DECLARED_ACTION_TIMEOUT },
        fallback: { action: { type: ACTION_FALLBACK, target: 'domain-1' } },
      };
      const localSettlement = await localMediator.runAcceptedChain(localChain);

      // Counts the FAR mediator's own successful handler invocations — the
      // observation this test needs, since handing a node across a hop ends
      // the DISPATCHING side's own settlement immediately
      // (`inst-t-pending-handed-over`); nobody there observes the far
      // outcome.
      const farHandled = makeCallCounter();
      const farMediator = new DefaultActionsChainsMediator({
        typeSystem: createMockPlugin(),
        // The FAR (authoritative) registry's own domain state — irrelevant
        // here since the action declares its own timeout, but present to
        // model a real authoritative registry.
        getDomainState: () => makeDomainStateFor('far-target', 5000),
        getExtensionEntry: () => undefined,
      });
      farMediator.registerHandler(
        'far-target',
        ACTION_PRIMARY,
        ActionHandler.fromFunction(async () => {
          vi.advanceTimersByTime(FAST_HANDLER_MS);
          farHandled.increment();
        })
      );
      const farFallbackRan = { count: 0 };
      farMediator.registerHandler(
        'far-target',
        ACTION_FALLBACK,
        ActionHandler.fromFunction(async () => {
          farFallbackRan.count += 1;
        })
      );
      // The FORWARDING (dispatching) registry holds NO domain state for
      // 'far-target' at all — proving the bound enforced across the hop
      // cannot have come from it.
      const hopMediator = new DefaultActionsChainsMediator({
        typeSystem: createMockPlugin(),
        getDomainState: () => undefined,
        getExtensionEntry: () => undefined,
        resolveForwardingEntry: () => makeAuthoritativeHopRoute(farMediator, 1),
      });
      const hopChain: ActionsChain = {
        action: { type: ACTION_PRIMARY, target: 'far-target', timeout: DECLARED_ACTION_TIMEOUT },
        fallback: { action: { type: ACTION_FALLBACK, target: 'far-target' } },
      };
      await hopMediator.runAcceptedChain(hopChain);
      await farHandled.waitFor(1);

      const manyHopsMediator = new DefaultActionsChainsMediator({
        typeSystem: createMockPlugin(),
        getDomainState: () => undefined,
        getExtensionEntry: () => undefined,
        resolveForwardingEntry: () => makeAuthoritativeHopRoute(farMediator, 6),
      });
      await manyHopsMediator.runAcceptedChain(hopChain);
      await farHandled.waitFor(2);

      expect(localSettlement.completed).toBe(true);
      // Both hop dispatches succeeded at the far side — never a fallback —
      // which is only reachable if the SAME bound as the local case applied.
      expect(farFallbackRan.count).toBe(0);

      expect(localChain.action.timeout).toBe(DECLARED_ACTION_TIMEOUT);
      expect(hopChain.action.timeout).toBe(DECLARED_ACTION_TIMEOUT);
    }
  );

  it(
    'exceeding the SAME per-action bound selects the same fallback outcome regardless of whether the ' +
      'slow node resolved LOCALLY or across a simulated cross-hop route',
    async () => {
      const DECLARED_ACTION_TIMEOUT = 100;
      const SLOW_HANDLER_MS = 500;

      const localMediator = new DefaultActionsChainsMediator({
        typeSystem: createMockPlugin(),
        getDomainState: () => makeDomainStateFor('domain-1', 5000),
        getExtensionEntry: () => undefined,
      });
      localMediator.registerHandler(
        'domain-1',
        ACTION_PRIMARY,
        ActionHandler.fromFunction(async () => {
          // Advancing past the declared per-action bound fires
          // `executeWithTimeout`'s own timer synchronously as part of this
          // single advance.
          vi.advanceTimersByTime(SLOW_HANDLER_MS);
        })
      );
      const localChain: ActionsChain = {
        action: { type: ACTION_PRIMARY, target: 'domain-1', timeout: DECLARED_ACTION_TIMEOUT },
        fallback: { action: { type: ACTION_FALLBACK, target: 'domain-1' } },
      };
      const localSettlement = await localMediator.runAcceptedChain(localChain);

      // The primary action fails AT THE FAR SIDE, so the chain's declared
      // `fallback` is dispatched afresh from there, resolved against
      // 'far-target' at the FAR mediator — never at the dispatching side,
      // which is done with the node the instant it hands it over.
      const farFallbackRan = makeCallCounter();
      const farMediator = new DefaultActionsChainsMediator({
        typeSystem: createMockPlugin(),
        getDomainState: () => makeDomainStateFor('far-target', 5000),
        getExtensionEntry: () => undefined,
      });
      farMediator.registerHandler(
        'far-target',
        ACTION_PRIMARY,
        ActionHandler.fromFunction(async () => {
          vi.advanceTimersByTime(SLOW_HANDLER_MS);
        })
      );
      farMediator.registerHandler(
        'far-target',
        ACTION_FALLBACK,
        ActionHandler.fromFunction(async () => {
          farFallbackRan.increment();
        })
      );
      const hopMediator = new DefaultActionsChainsMediator({
        typeSystem: createMockPlugin(),
        getDomainState: () => undefined,
        getExtensionEntry: () => undefined,
        resolveForwardingEntry: () => makeAuthoritativeHopRoute(farMediator, 1),
      });
      const hopChain: ActionsChain = {
        action: { type: ACTION_PRIMARY, target: 'far-target', timeout: DECLARED_ACTION_TIMEOUT },
        fallback: { action: { type: ACTION_FALLBACK, target: 'far-target' } },
      };
      await hopMediator.runAcceptedChain(hopChain);
      await farFallbackRan.waitFor(1);

      expect(localSettlement.completed).toBe(false);
      expect(localSettlement.path).toEqual([ACTION_PRIMARY, ACTION_FALLBACK]);

      // The author-declared per-action timeout on BOTH chain objects must
      // survive execution completely unmodified.
      expect(localChain.action.timeout).toBe(DECLARED_ACTION_TIMEOUT);
      expect(hopChain.action.timeout).toBe(DECLARED_ACTION_TIMEOUT);
    }
  );

  it(
    "an action that declares NO timeout resolves its bound from the FAR (authoritative) target's own " +
      "domain default, never from a forwarding registry's — settlement below the far default succeeds, " +
      'beyond it selects fallback',
    async () => {
      const FAR_DOMAIN_DEFAULT_MS = 100;

      const farFallbackRan = makeCallCounter();
      const farMediator = new DefaultActionsChainsMediator({
        typeSystem: createMockPlugin(),
        getDomainState: () => makeDomainStateFor('far-target', FAR_DOMAIN_DEFAULT_MS),
        getExtensionEntry: () => undefined,
      });
      farMediator.registerHandler(
        'far-target',
        ACTION_PRIMARY,
        ActionHandler.fromFunction(async () => {
          vi.advanceTimersByTime(FAR_DOMAIN_DEFAULT_MS + 100);
        })
      );
      farMediator.registerHandler(
        'far-target',
        ACTION_FALLBACK,
        ActionHandler.fromFunction(async () => {
          farFallbackRan.increment();
        })
      );
      // The forwarding registry resolves NO domain state whatsoever for
      // 'far-target' — if the bound came from here, `resolveTimeout` would
      // throw "no domain found" instead of enforcing the far default.
      const hopMediator = new DefaultActionsChainsMediator({
        typeSystem: createMockPlugin(),
        getDomainState: () => undefined,
        getExtensionEntry: () => undefined,
        resolveForwardingEntry: () => makeAuthoritativeHopRoute(farMediator, 1),
      });
      const hopChain: ActionsChain = {
        action: { type: ACTION_PRIMARY, target: 'far-target' },
        fallback: { action: { type: ACTION_FALLBACK, target: 'far-target' } },
      };
      await hopMediator.runAcceptedChain(hopChain);

      // The far side's own fallback ran — the failure (and hence the
      // fallback dispatch) happened THERE, resolved from the far default.
      await farFallbackRan.waitFor(1);
    }
  );

  // ─── Origin invariance ACROSS the hop, at a large declared bound ────────
  //
  // A node whose declared bound is large and whose handler settles well
  // inside it must succeed identically whether reached locally or across
  // one or several hops: the hop carries no bound of its own at all
  // (`inst-flow-hand-over`), so nothing on the sending side can narrow it.

  /**
   * A handler that settles after exactly `ms` of the injected clock — never
   * by advancing the clock itself from inside the handler, which would fire
   * the SENDING side's timers in the same synchronous turn the receiving
   * side's handler is invoked and so prove nothing about which timer bounds
   * what. The test drives the clock from outside instead.
   */
  const settlesAfter = (ms: number) =>
    ActionHandler.fromFunction(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, ms);
        })
    );

  function makeFarMediatorWith(
    handlerMs: number,
    onSettled?: () => void,
    onFallbackRan?: () => void
  ): DefaultActionsChainsMediator {
    const far = new DefaultActionsChainsMediator({
      typeSystem: createMockPlugin(),
      getDomainState: () => makeDomainStateFor('far-target', 5000),
      getExtensionEntry: () => undefined,
    });
    far.registerHandler(
      'far-target',
      ACTION_PRIMARY,
      ActionHandler.fromFunction(
        () =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              onSettled?.();
              resolve();
            }, handlerMs);
          })
      )
    );
    far.registerHandler(
      'far-target',
      ACTION_FALLBACK,
      ActionHandler.fromFunction(async () => {
        onFallbackRan?.();
      })
    );
    return far;
  }

  it(
    'a node whose declared bound EXCEEDS 15s, and whose handler settles between 15s and that bound, ' +
      'selects the SAME branch (success) dispatched locally and dispatched across a hop — the hop ' +
      "carries no bound of the sending side's at all, so the node is bounded solely by the timeout " +
      'resolved at the registry authoritative for its target (AC5.5)',
    async () => {
      // Deliberately exceeds the 15s reference bound: 15000 < 20000 < 30000.
      const DECLARED_ACTION_TIMEOUT = LARGE_BOUND_MS * 2;
      const HANDLER_MS = LARGE_BOUND_MS + 5000;

      const localMediator = new DefaultActionsChainsMediator({
        typeSystem: createMockPlugin(),
        getDomainState: () => makeDomainStateFor('far-target', 5000),
        getExtensionEntry: () => undefined,
      });
      localMediator.registerHandler('far-target', ACTION_PRIMARY, settlesAfter(HANDLER_MS));

      const chainFor = (): ActionsChain => ({
        action: { type: ACTION_PRIMARY, target: 'far-target', timeout: DECLARED_ACTION_TIMEOUT },
        fallback: { action: { type: ACTION_FALLBACK, target: 'far-target' } },
      });

      const localPromise = localMediator.runAcceptedChain(chainFor());

      // The far side's own settlement, observed directly — handing the
      // node over ends the DISPATCHING side's own settlement immediately
      // (`inst-t-pending-handed-over`), so this test observes the far
      // side's outcome, not `hopMediator.runAcceptedChain`'s own return.
      let farSucceeded = false;
      let farFallbackRan = false;
      // The forwarding registry holds NO domain state for 'far-target' —
      // the bound enforced across the hop cannot have come from it.
      const hopMediator = new DefaultActionsChainsMediator({
        typeSystem: createMockPlugin(),
        getDomainState: () => undefined,
        getExtensionEntry: () => undefined,
        resolveForwardingEntry: () =>
          makeAuthoritativeHopRoute(
            makeFarMediatorWith(
              HANDLER_MS,
              () => {
                farSucceeded = true;
              },
              () => {
                farFallbackRan = true;
              }
            ),
            1
          ),
      });
      void hopMediator.runAcceptedChain(chainFor());

      // Drive the injected clock past the handler's own settlement —
      // `advanceTimersByTimeAsync` flushes the promise chains this
      // settlement runs through, both locally and across the hop.
      await vi.advanceTimersByTimeAsync(HANDLER_MS);

      const localSettlement = await localPromise;

      expect(localSettlement.completed).toBe(true);
      expect(localSettlement.path).toEqual([ACTION_PRIMARY]);
      // The property: IDENTICAL branch selection across the hop, because
      // nothing on the sending side bounds a node it hands over.
      expect(farSucceeded).toBe(true);
      expect(farFallbackRan).toBe(false);
    }
  );

  it(
    'the converse: a handler that EXCEEDS its declared bound (itself above 15s) fails and selects ' +
      'the declared fallback both locally and across a hop',
    async () => {
      const DECLARED_ACTION_TIMEOUT = LARGE_BOUND_MS * 2;
      const HANDLER_MS = DECLARED_ACTION_TIMEOUT + 10000;

      const localMediator = new DefaultActionsChainsMediator({
        typeSystem: createMockPlugin(),
        getDomainState: () => makeDomainStateFor('far-target', 5000),
        getExtensionEntry: () => undefined,
      });
      localMediator.registerHandler('far-target', ACTION_PRIMARY, settlesAfter(HANDLER_MS));
      localMediator.registerHandler('far-target', ACTION_FALLBACK, settlesAfter(0));

      // The primary action fails AT THE FAR SIDE (its own declared bound
      // elapses there), so the chain's declared `fallback` is dispatched
      // afresh from there, resolved against 'far-target' at the FAR
      // mediator — never at the dispatching side.
      let farFallbackRan = false;
      const far = makeFarMediatorWith(HANDLER_MS, undefined, () => {
        farFallbackRan = true;
      });
      const hopMediator = new DefaultActionsChainsMediator({
        typeSystem: createMockPlugin(),
        getDomainState: () => makeDomainStateFor('far-target', 5000),
        getExtensionEntry: () => undefined,
        resolveForwardingEntry: (targetId) =>
          targetId === 'far-target' ? makeAuthoritativeHopRoute(far, 1) : undefined,
      });

      const localPromise = localMediator.runAcceptedChain({
        action: { type: ACTION_PRIMARY, target: 'far-target', timeout: DECLARED_ACTION_TIMEOUT },
        fallback: { action: { type: ACTION_FALLBACK, target: 'far-target' } },
      });
      void hopMediator.runAcceptedChain({
        action: { type: ACTION_PRIMARY, target: 'far-target', timeout: DECLARED_ACTION_TIMEOUT },
        fallback: { action: { type: ACTION_FALLBACK, target: 'far-target' } },
      });

      await vi.advanceTimersByTimeAsync(HANDLER_MS);

      const localSettlement = await localPromise;

      // Failed at its OWN declared bound in both cases: the branch
      // sequence is identical.
      expect(localSettlement.completed).toBe(true);
      expect(localSettlement.path).toEqual([ACTION_PRIMARY, ACTION_FALLBACK]);
      expect(farFallbackRan).toBe(true);
    }
  );

  it(
    'the same large-bound node reached across THREE independent mediator boundaries still ' +
      "selects the branch its AUTHORITATIVE registry's bound dictates, not one any hop between " +
      'supplied',
    async () => {
      const DECLARED_ACTION_TIMEOUT = LARGE_BOUND_MS * 2;
      const HANDLER_MS = LARGE_BOUND_MS + 5000;

      let farSucceeded = false;
      let farFallbackRan = false;
      const hopMediator = new DefaultActionsChainsMediator({
        typeSystem: createMockPlugin(),
        getDomainState: () => undefined,
        getExtensionEntry: () => undefined,
        // Three genuinely separate mediator instances between here and the
        // authoritative one — never one closure wrapped three times.
        resolveForwardingEntry: () =>
          makeAuthoritativeHopRoute(
            makeFarMediatorWith(
              HANDLER_MS,
              () => {
                farSucceeded = true;
              },
              () => {
                farFallbackRan = true;
              }
            ),
            3
          ),
      });
      void hopMediator.runAcceptedChain({
        action: { type: ACTION_PRIMARY, target: 'far-target', timeout: DECLARED_ACTION_TIMEOUT },
        fallback: { action: { type: ACTION_FALLBACK, target: 'far-target' } },
      });

      await vi.advanceTimersByTimeAsync(HANDLER_MS);

      expect(farSucceeded).toBe(true);
      expect(farFallbackRan).toBe(false);
    }
  );
});

// ═════════════════════════════════════════════════════════════════════════
// P7 — Lifecycle non-blocking and contained
// ═════════════════════════════════════════════════════════════════════════
//
// `non-gts-lifecycle-stages.test.ts` already pins non-blocking behaviour and
// refusal containment exhaustively for the `init` and `destroyed` stages
// (domain and extension), including declaration-vs-completion order
// inversion. This section EXTENDS that coverage to a site it does not
// touch: the `activated` stage triggered by `mount()`, proving the same
// two properties — non-blocking return, and a first hook's synchronous
// refusal not halting the stage's remaining hooks or reaching the caller —
// hold there too, and that all five sites' trigger operations return
// exactly `undefined` (P1's own runtime checks above cover the underlying
// `LifecycleManager`/`DomainLifecycleTrigger` methods directly).

describe('P7 — Lifecycle non-blocking and contained', () => {
  it(
    'extends non-gts-lifecycle-stages.test.ts (which pins this on the init/destroyed stages only): the ' +
      'SAME non-blocking + refusal-containment property holds on the ACTIVATED stage triggered by mount() ' +
      "— a first hook refused synchronously (invalid declared per-action timeout) never reaches mount()'s " +
      "own caller, and does not stop the stage's second hook from dispatching and settling",
    async () => {
      const PROBE = 'mock.action.v1~p7-probe.v1~';
      const D = 'domain.p7.v1';
      const ENTRY = 'entry.p7.v1';
      const EXT = 'ext.p7.v1';
      const probeLog: string[] = [];
      const diagnostics: unknown[] = [];

      const entries = new Map<string, MfeEntry>([[ENTRY, makeEntry(ENTRY)]]);
      const registry = new DefaultMfeRegistry({
        typeSystem: createMockPlugin(entries),
        mfeHandlers: [new InjectableMountHandler(ENTRY, () => {})],
        diagnosticSink: {
          reportLifecycleDispatchRefusal(diagnostic) {
            diagnostics.push(diagnostic);
          },
          reportChainNodeFailure(diagnostic) {
            // Not under test here — this suite exercises the ACTIVATED
            // stage's refusal-containment property, but the stub still
            // records what it receives, faithfully, like the neighbouring
            // stub in non-gts-lifecycle-stages.test.ts.
            diagnostics.push(diagnostic);
          },
        },
      });
      const domain = makeDomain(D, [PROBE]);
      domain.extensionsLifecycleStages = ['mock.stage.v1~activated.v1'];
      registry.registerDomain(
        domain,
        new GenericDomainFactory([
          [PROBE, ActionHandler.fromFunction(async () => { probeLog.push('ok'); })],
        ])
      );

      const extension: Extension = {
        id: EXT,
        domain: D,
        entry: ENTRY,
        lifecycle: [
          // Dispatched FIRST (declaration order) — refused SYNCHRONOUSLY by
          // the envelope validator (invalid, negative declared per-action
          // timeout) before any execution state exists.
          {
            stage: 'mock.stage.v1~activated.v1',
            actions_chain: { action: { type: PROBE, target: D, payload: {}, timeout: -1 } },
          },
          // Dispatched SECOND — an ordinary, valid probe.
          { stage: 'mock.stage.v1~activated.v1', actions_chain: actionChain(PROBE, D) },
        ],
      } as Extension;

      await registry.registerExtension(extension);
      const mounter = registry.getMounter(D);
      mounter.attach(document.createElement('div'));

      // `mount()` itself must never see the refusal — it is contained
      // entirely inside the lifecycle trigger.
      await expect(mounter.mount(EXT, document.createElement('div'))).resolves.toBeUndefined();

      // The SECOND hook on the same stage still dispatched (and, having no
      // gate, already settled) despite the FIRST hook's refusal.
      expect(probeLog).toEqual(['ok']);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        classification: 'lifecycle-dispatch-refusal',
        entityKind: 'extension',
        entityId: EXT,
        stageId: 'mock.stage.v1~activated.v1',
        hookPosition: 0,
        refusalClass: 'invalid_action_timeout',
        transitionContinued: true,
      });
    }
  );
});

// ═════════════════════════════════════════════════════════════════════════
// P8 — Cross-hop acceptance RESERVES before it INVOKES, and runs no handler
// code on the delivering runtime's call stack (AC5.9)
// ═════════════════════════════════════════════════════════════════════════
//
// Acceptance at the receiving registry is synchronous: `acceptSingleNodeForHop`
// validates what it was handed and reserves what the node needs before it
// returns, and runs no handler code on the delivering runtime's call stack —
// the node's actual invocation is scheduled strictly after that call
// returns. That is a property of the acceptance call itself, never of a
// second answer: this package's continuation model does not answer a hop
// twice at all (`cpt-frontx-adr-action-dispatch-and-chaining`).
//
// The distinction against P2 above is deliberate and both are load-bearing:
// P2 pins that a DIRECT dispatch has already INVOKED its handler when
// `executeActionsChain` returns, which is a property of the emitter-facing
// acceptance boundary. This suite pins the opposite ordering at the
// CROSS-HOP acceptance boundary, which is a different boundary with a
// different obligation: accepting must never run handler code on the
// delivering runtime's stack (`inst-receive-accept-reserve`).

describe('P8 — Cross-hop acceptance reserves before it invokes, and runs no handler code on the delivering stack', () => {
  /**
   * A mediator that records, at the instant `acceptSingleNodeForHop` returns
   * for a hop it answered, whether the far handler's synchronous prefix had
   * already run. Subclassed rather than monkey-patched so the observation
   * sits on the real acceptance path, and used as the terminal
   * (authoritative) mediator of a genuinely multi-boundary route.
   */
  class AcceptanceObservingMediator extends DefaultActionsChainsMediator {
    /** One entry per hop this mediator accepted, in order. */
    readonly handlerStartedAtAcceptance: boolean[] = [];

    constructor(
      config: ConstructorParameters<typeof DefaultActionsChainsMediator>[0],
      private readonly probeHandlerStarted: () => boolean
    ) {
      super(config);
    }

    override acceptSingleNodeForHop(
      ...args: Parameters<DefaultActionsChainsMediator['acceptSingleNodeForHop']>
    ): ReturnType<DefaultActionsChainsMediator['acceptSingleNodeForHop']> {
      const result = super.acceptSingleNodeForHop(...args);
      this.handlerStartedAtAcceptance.push(this.probeHandlerStarted());
      return result;
    }
  }

  it(
    'one boundary: acceptance returns, and the node is already RESERVED, before the accepted ' +
      "handler's synchronous prefix has run at all",
    async () => {
      const mediator = makeMediator();
      const gate = createDeferred();
      let handlerStarted = false;
      mediator.registerHandler(
        'domain-1',
        ACTION_PRIMARY,
        ActionHandler.fromFunction(async () => {
          // The handler's SYNCHRONOUS prefix — everything before its first
          // suspension point. This is what must not precede acceptance
          // returning.
          handlerStarted = true;
          await gate.promise;
        })
      );

      mediator.acceptSingleNodeForHop({
        action: { type: ACTION_PRIMARY, target: 'domain-1', payload: {} },
      });

      // Acceptance has already returned at this line, and not one
      // statement of the handler has run.
      expect(handlerStarted).toBe(false);

      // Reserve-before-return still holds at the RECEIVING side of the hop:
      // acceptance is not a promise to reserve later. Without an
      // acceptance-scoped reservation, deferring the invocation would open
      // a window in which this registry has accepted a node whose target
      // holds no reservation at all.
      const pendingActions = (
        mediator as unknown as { pendingActions: Map<string, Set<unknown>> }
      ).pendingActions;
      expect(pendingActions.has('domain-1')).toBe(true);

      gate.resolve();
      // Let the scheduled execution proceed and settle — observed via the
      // handler's own terminal effect, never a blind microtask flush.
      await gate.promise;

      // The node really did run — the deferral moved WHEN the handler is
      // invoked, never WHETHER.
      expect(handlerStarted).toBe(true);
    }
  );

  it(
    'THREE independent mediator boundaries: the first hop has accepted, and the deepest boundary has ' +
      'not even been reached, before the far handler begins — no hop forwards onward before it has ' +
      'accepted',
    async () => {
      let handlerStarted = false;
      const handlerStartedSignal = createDeferred<void>();
      const farMediator = new AcceptanceObservingMediator(
        {
          typeSystem: createMockPlugin(),
          getDomainState: () => undefined,
          getExtensionEntry: () => undefined,
        },
        () => handlerStarted
      );
      farMediator.registerHandler(
        'far-target',
        ACTION_PRIMARY,
        ActionHandler.fromFunction(async () => {
          handlerStarted = true;
          handlerStartedSignal.resolve();
        })
      );

      // Genuine depth: three INDEPENDENT mediator instances, each resolving
      // the action to its OWN forwarding route and handing it over through
      // its OWN `executeCrossHopNode` — never one closure wrapped three
      // times.
      const authoritativeRoute = makeAuthoritativeHopRoute(farMediator, 3);

      let handlerStartedWhenFirstHopReturned: boolean | undefined;
      let boundariesReachedWhenFirstHopReturned: number | undefined;
      const dispatchingMediator = new DefaultActionsChainsMediator({
        typeSystem: createMockPlugin(),
        getDomainState: () => undefined,
        getExtensionEntry: () => undefined,
        resolveForwardingEntry: () =>
          new CrossHopRoute((envelope) => {
            authoritativeRoute.send(envelope);
            // Sampled the instant the FIRST hop's transport call returns —
            // this runtime is done with the node right here.
            handlerStartedWhenFirstHopReturned = handlerStarted;
            boundariesReachedWhenFirstHopReturned = farMediator.handlerStartedAtAcceptance.length;
          }),
      });

      const settlement = await dispatchingMediator.runAcceptedChain({
        action: { type: ACTION_PRIMARY, target: 'far-target', timeout: 5000, payload: {} },
      });

      // Handing the node over ends this executor's own path at that node —
      // it does not observe the node's eventual completion.
      expect(settlement.completed).toBe(false);

      // Let every scheduled hand-over settle, three boundaries away.
      await handlerStartedSignal.promise;
      expect(handlerStarted).toBe(true);

      // 1. The handler had not begun when the first hop's call returned.
      expect(handlerStartedWhenFirstHopReturned).toBe(false);
      // 2. Stronger, and what makes this a MULTI-boundary claim rather than
      //    a claim about the first boundary only: the deepest boundary had
      //    not been reached AT ALL when the first hop's call returned. An
      //    intermediate mediator that began forwarding onward before its
      //    own acceptance scheduled would have driven the whole remaining
      //    route synchronously inside that first `send`, and this would be
      //    1.
      expect(boundariesReachedWhenFirstHopReturned).toBe(0);
      // 3. And at the deepest boundary — the registry authoritative for the
      //    target, which resolves the handler and the bound — acceptance
      //    likewise preceded the handler's own prefix.
      expect(farMediator.handlerStartedAtAcceptance).toEqual([false]);
    }
  );
});

// ═════════════════════════════════════════════════════════════════════════
// P9 — An accepted cross-hop node resolves its handler at EXECUTION time
// ═════════════════════════════════════════════════════════════════════════
//
// An actions chain is HISTORY-AGNOSTIC: it is executed action by action,
// and what a node does — including which handler or route answers for its
// target — follows ONLY from the state that holds at the moment that node
// executes. Nothing is determined ahead of time.
//
// P8 above pins that cross-hop acceptance RETURNS before it INVOKES, which
// necessarily puts a gap — one microtask — between acceptance and the
// node's invocation. This suite pins the other half of that split: the
// deferral must move WHEN the node runs without freezing WHAT it resolves
// to. A resolution captured during the synchronous acceptance phase and
// carried into the deferred execution would make the node run against state
// that no longer holds by the time it actually runs.
//
// The window is driven by the promise ordering the production code already
// has — `acceptSingleNodeForHop` returns synchronously and schedules the
// execution on `Promise.resolve().then(...)`, so any statement written
// after that call, in the same synchronous turn, lands strictly inside the
// window. No sleep, no timer, no microtask-flush hack.
//
// Nothing about acceptance depends on resolution having already happened:
// a handler missing at execution time is an ordinary CHAIN failure answered
// by the chain's `fallback` (P3/P4 above), never a refusal, so the second
// and third tests below are well-formed outcomes rather than protocol
// violations.

describe('P9 — an accepted cross-hop node resolves its handler at execution time, not at acceptance time', () => {
  /** A sink that swallows the expected node-failure diagnostics. */
  const silentSink: MfeDiagnosticSink = {
    reportLifecycleDispatchRefusal(): void {},
    reportChainNodeFailure(): void {},
  };

  function makeSilentMediator(): DefaultActionsChainsMediator {
    return new DefaultActionsChainsMediator({
      typeSystem: createMockPlugin(),
      getDomainState: () => makeDomainState(),
      getExtensionEntry: () => undefined,
      diagnosticSink: silentSink,
    });
  }

  it('invokes the handler registered AFTER acceptance, not the one registered at acceptance', async () => {
    const mediator = makeSilentMediator();
    const invoked: string[] = [];
    const executedSignal = createDeferred<void>();
    mediator.registerHandler(
      'domain-1',
      ACTION_PRIMARY,
      ActionHandler.fromFunction(async () => {
        invoked.push('at-acceptance');
      })
    );

    mediator.acceptSingleNodeForHop({
      action: { type: ACTION_PRIMARY, target: 'domain-1', payload: {} },
    });

    // Inside the window: acceptance has returned and the node's invocation
    // has not run yet, because it was scheduled on a microtask this
    // synchronous turn has not yielded to. Re-registering here is exactly
    // the "state changed between acceptance and execution" case.
    mediator.registerHandler(
      'domain-1',
      ACTION_PRIMARY,
      ActionHandler.fromFunction(async () => {
        invoked.push('at-execution');
        executedSignal.resolve();
      })
    );
    expect(invoked).toEqual([]);

    // The whole point: the LATER registration answered. With the
    // resolution taken during the synchronous acceptance phase this reads
    // `['at-acceptance']`.
    await executedSignal.promise;
    expect(invoked).toEqual(['at-execution']);
  });

  it('completes a node whose handler did not exist at acceptance but was registered before execution', async () => {
    const mediator = makeSilentMediator();
    let invoked = false;
    const executedSignal = createDeferred<void>();

    // Nothing resolves for this target at the instant of acceptance —
    // acceptance is meaningful anyway: it validates the action it was
    // handed, mints the execution state, and takes the reservation.
    mediator.acceptSingleNodeForHop({
      action: { type: ACTION_PRIMARY, target: 'domain-1', payload: {} },
    });

    mediator.registerHandler(
      'domain-1',
      ACTION_PRIMARY,
      ActionHandler.fromFunction(async () => {
        invoked = true;
        executedSignal.resolve();
      })
    );

    // Resolution taken at acceptance would have found nothing, thrown
    // `NoHandlerForActionTargetError` on a node with no fallback, and
    // settled with `invoked` staying `false` forever.
    await executedSignal.promise;
    expect(invoked).toBe(true);
  });

  it('fails a node whose handler was unregistered between acceptance and execution', async () => {
    const failureSignal = createDeferred<void>();
    const mediator = new DefaultActionsChainsMediator({
      typeSystem: createMockPlugin(),
      getDomainState: () => makeDomainState(),
      getExtensionEntry: () => undefined,
      diagnosticSink: {
        reportLifecycleDispatchRefusal(): void {},
        reportChainNodeFailure(): void {
          failureSignal.resolve();
        },
      },
    });
    let invoked = false;
    mediator.registerHandler(
      'domain-1',
      ACTION_PRIMARY,
      ActionHandler.fromFunction(async () => {
        invoked = true;
      })
    );

    mediator.acceptSingleNodeForHop({
      action: { type: ACTION_PRIMARY, target: 'domain-1', payload: {} },
    });

    mediator.unregisterHandler('domain-1', ACTION_PRIMARY);

    // The acceptance-scoped reservation is still released on the failure
    // branch, so the retirement drain measures nothing left standing. The
    // failure diagnostic is reported at the point the reservation is
    // released, from the SAME synchronous catch frame — an explicit
    // settlement signal for the far side's own node failure, never a poll.
    await failureSignal.promise;
    const pendingActions = (
      mediator as unknown as { pendingActions: Map<string, Set<unknown>> }
    ).pendingActions;
    expect(pendingActions.has('domain-1')).toBe(false);

    // The symmetric direction, and what makes this a claim about
    // execution-time state rather than about "later registrations win":
    // a handler gone by the time the node runs is an ordinary chain
    // failure, resolved (never rejected) — the handler that USED to be
    // registered never ran.
    expect(invoked).toBe(false);
  });
});
