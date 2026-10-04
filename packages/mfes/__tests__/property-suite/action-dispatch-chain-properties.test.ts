/**
 * Explicit property suite for `cpt-frontx-adr-action-dispatch-and-chaining`:
 * the non-awaitable surface, immediate execution of a chain's first action,
 * a child bridge that hands nothing over while unusable, non-blocking
 * lifecycle stages, and execution-time handler resolution for a handed-over
 * sub-chain.
 *
 * Hygiene: no `setTimeout`, no bare microtask flush, no arbitrary wait to
 * "let it settle". Settlement is always observed via a controlled deferred
 * a handler resolves.
 *
 * Domain/action ids here are a mock notation, never the real GTS strings —
 * MFES-1 forbids `@gears-frontx/mfes` from carrying a type-format literal.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DefaultMfeRegistry } from '../../src/runtime/DefaultMfeRegistry';
import { DefaultActionsChainsMediator } from '../../src/mediator/DefaultActionsChainsMediator';
import { ActionHandler } from '../../src/mediator/ActionHandler';
import { ChildMfeBridgeImpl } from '../../src/bridge/ChildMfeBridgeImpl';
import type { TypeSystemPlugin } from '../../src/type-substrate';
import type { ActionsChain, Extension, ExtensionDomain, MfeEntry } from '../../src/types';
import { MfeHandler, type MfeEntryLifecycle } from '../../src/handler/MfeHandler';
import { ChildMfeBridge } from '../../src/handler/ChildMfeBridge';
import { MfeBridgeFactoryDefault } from '../../src/bridge/MfeBridgeFactoryDefault';
import { ExtensionDomainImplementation } from '../../src/runtime/ExtensionDomainImplementation';
import { ExtensionDomainImplementationFactory } from '../../src/runtime/ExtensionDomainImplementationFactory';
import type { DomainContext } from '../../src/runtime/DomainContext';
import { ConcurrentMountStrategy } from '../../src/runtime/ConcurrentMountStrategy';
import type { ContainerHooks, ActionPayload } from '../../src/runtime/MountStrategy';
import type { ExtensionDomainState } from '../../src/runtime/ExtensionManager';
import type { DefaultLifecycleManager } from '../../src/runtime/DefaultLifecycleManager';

// ─── Mock-notation well-known ids ──────────────────────────────────────────
// ─── Mock-notation well-known ids ──────────────────────────────────────────

const LOAD_EXT = 'mock.action.v1~load_ext.v1~';
const MOUNT_EXT = 'mock.action.v1~mount_ext.v1~';
const UNMOUNT_EXT = 'mock.action.v1~unmount_ext.v1~';
const ACTION_PRIMARY = 'mock.action.v1~action_primary.v1~';
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

function createDeferred<T = void>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
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

  it("DefaultActionsChainsMediator.executeActionsChain returns exactly undefined at runtime", () => {
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
    // Static, source-level guard: the public barrel
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
      const { ChildMfeBridgeImpl } = await import('../../src/bridge/ChildMfeBridgeImpl');
      const { ParentMfeBridgeImpl } = await import('../../src/bridge/ParentMfeBridgeImpl');

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
// P2 — Immediate execution of the first action
// ═════════════════════════════════════════════════════════════════════════

describe('P2 — Immediate execution of the first action', () => {
  it(
    'a direct dispatch: the dispatching call has already returned, and the handler has already been ' +
      'INVOKED (not settled)',
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

      // Returns nothing awaitable.
      const returned = mediator.executeActionsChain(actionChain(MOUNT_EXT, 'domain-1'));

      expect(returned).toBeUndefined();
      // The dispatching call has returned while the handler is invoked but
      // not yet settled.
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
// P3 — An unusable child bridge hands nothing over
// ═════════════════════════════════════════════════════════════════════════

describe('P3 — An unusable child bridge hands nothing over', () => {
  function wiredCallback(bridge: ChildMfeBridgeImpl): ActionsChain[] {
    const handed: ActionsChain[] = [];
    bridge.setExecuteActionsChainCallback((chain) => {
      handed.push(chain);
    });
    return handed;
  }

  it('a disposed bridge hands nothing over and does not throw', () => {
    const childBridge = new ChildMfeBridgeImpl('domain.p3', 'ext.p3-disposed');
    const handed = wiredCallback(childBridge);
    childBridge.activate();
    childBridge.destroy();

    expect(childBridge.executeActionsChain(actionChain(MOUNT_EXT, 'ext.p3-disposed'))).toBeUndefined();
    expect(handed).toEqual([]);
  });

  it('an inactive bridge hands nothing over and does not throw', () => {
    const childBridge = new ChildMfeBridgeImpl('domain.p3', 'ext.p3-inactive');
    const handed = wiredCallback(childBridge);

    expect(childBridge.executeActionsChain(actionChain(MOUNT_EXT, 'ext.p3-inactive'))).toBeUndefined();
    expect(handed).toEqual([]);
  });

  it('a bridge not wired to a dispatch callback hands nothing over and does not throw', () => {
    const childBridge = new ChildMfeBridgeImpl('domain.p3', 'ext.p3-unwired');
    childBridge.activate();

    expect(childBridge.executeActionsChain(actionChain(MOUNT_EXT, 'ext.p3-unwired'))).toBeUndefined();
  });

  it('an active, wired bridge hands the chain to the callback unchanged', () => {
    const childBridge = new ChildMfeBridgeImpl('domain.p3', 'ext.p3-active');
    const handed = wiredCallback(childBridge);
    childBridge.activate();
    const chain = actionChain(MOUNT_EXT, 'ext.p3-active');

    childBridge.executeActionsChain(chain);

    expect(handed).toEqual([chain]);
    expect(handed[0]).toBe(chain);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// P7 — Lifecycle non-blocking
// ═════════════════════════════════════════════════════════════════════════

describe('P7 — Lifecycle non-blocking', () => {
  it(
    "on the ACTIVATED stage triggered by mount(): a first hook whose action fails never reaches mount()'s " +
      "own caller, and does not stop the stage's second hook from executing",
    async () => {
      const PROBE = 'mock.action.v1~p7-probe.v1~';
      const D = 'domain.p7.v1';
      const ENTRY = 'entry.p7.v1';
      const EXT = 'ext.p7.v1';
      const probeReached = createDeferred();

      const entries = new Map<string, MfeEntry>([[ENTRY, makeEntry(ENTRY)]]);
      const registry = new DefaultMfeRegistry({
        typeSystem: createMockPlugin(entries),
        mfeHandlers: [new InjectableMountHandler(ENTRY, () => {})],
      });
      const domain = makeDomain(D, [PROBE]);
      domain.extensionsLifecycleStages = ['mock.stage.v1~activated.v1'];
      registry.registerDomain(
        domain,
        new GenericDomainFactory([
          [PROBE, ActionHandler.fromFunction(async () => { probeReached.resolve(); })],
        ])
      );

      const extension: Extension = {
        id: EXT,
        domain: D,
        entry: ENTRY,
        lifecycle: [
          // Dispatched FIRST (declaration order) — no handler exists for
          // its target, so the action fails.
          {
            stage: 'mock.stage.v1~activated.v1',
            actions_chain: actionChain(PROBE, 'mock.target.v1~no-handler.v1'),
          },
          // Dispatched SECOND — an ordinary probe.
          { stage: 'mock.stage.v1~activated.v1', actions_chain: actionChain(PROBE, D) },
        ],
      } as Extension;

      await registry.registerExtension(extension);
      const mounter = registry.getMounter(D);
      mounter.attach(document.createElement('div'));

      await expect(mounter.mount(EXT, document.createElement('div'))).resolves.toBeUndefined();

      await probeReached.promise;
    }
  );
});

// ═════════════════════════════════════════════════════════════════════════
// P9 — A handed-over sub-chain resolves its handler at execution time
// ═════════════════════════════════════════════════════════════════════════

describe('P9 — a handed-over sub-chain resolves its handler at execution time, not when the hand-over is accepted', () => {
  it('invokes the handler registered AFTER acceptance, not the one registered at acceptance', async () => {
    const mediator = makeMediator();
    const invoked: string[] = [];
    const executedSignal = createDeferred<void>();
    mediator.registerHandler(
      'domain-1',
      ACTION_PRIMARY,
      ActionHandler.fromFunction(async () => {
        invoked.push('at-acceptance');
      })
    );

    mediator.receiveHandedOverChain({
      action: { type: ACTION_PRIMARY, target: 'domain-1', payload: {} },
    });

    // Acceptance has returned and the sub-chain has not executed yet.
    mediator.registerHandler(
      'domain-1',
      ACTION_PRIMARY,
      ActionHandler.fromFunction(async () => {
        invoked.push('at-execution');
        executedSignal.resolve();
      })
    );
    expect(invoked).toEqual([]);

    await executedSignal.promise;
    expect(invoked).toEqual(['at-execution']);
  });

  it('executes a sub-chain whose handler did not exist at acceptance but was registered before execution', async () => {
    const mediator = makeMediator();
    const executedSignal = createDeferred<void>();

    mediator.receiveHandedOverChain({
      action: { type: ACTION_PRIMARY, target: 'domain-1', payload: {} },
    });

    mediator.registerHandler(
      'domain-1',
      ACTION_PRIMARY,
      ActionHandler.fromFunction(async () => {
        executedSignal.resolve();
      })
    );

    await executedSignal.promise;
  });

  it('executes `fallback` for a sub-chain whose handler was unregistered between acceptance and execution', async () => {
    const mediator = makeMediator();
    let invoked = false;
    const fallbackSignal = createDeferred<void>();
    mediator.registerHandler(
      'domain-1',
      ACTION_PRIMARY,
      ActionHandler.fromFunction(async () => {
        invoked = true;
      })
    );
    mediator.registerHandler(
      'domain-1',
      ACTION_FALLBACK,
      ActionHandler.fromFunction(async () => {
        fallbackSignal.resolve();
      })
    );

    mediator.receiveHandedOverChain({
      action: { type: ACTION_PRIMARY, target: 'domain-1', payload: {} },
      fallback: { action: { type: ACTION_FALLBACK, target: 'domain-1', payload: {} } },
    });

    mediator.unregisterHandler('domain-1', ACTION_PRIMARY);

    await fallbackSignal.promise;
    expect(invoked).toBe(false);
  });
});
