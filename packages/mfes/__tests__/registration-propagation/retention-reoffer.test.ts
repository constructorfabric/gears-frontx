/**
 * Retention and re-offer of a nested registry's inbound-bridge adoption
 * (`cpt-frontx-algo-mfe-host-communication-registration-propagation`:
 * `inst-record-claims-on-mount-throw`, `inst-reoffer-retained-adoption`,
 * `inst-reoffer-hand-link`, `inst-unlink-on-retraction`,
 * `inst-registry-is-root`, `inst-nested-registry-lifetime-scope`).
 *
 * A nested registry is constructed inside the synchronous window of its host
 * extension's mount. The mount manager keeps, per extension id, the re-link
 * callbacks of the adopters claimed in that window. Unregistering the
 * extension unlinks the adopters and keeps them; the first mount after the
 * next registration hands them the freshly minted link, so the single nested
 * registry becomes reachable again without being constructed a second time.
 *
 * Domain/action ids are a mock notation, never the real GTS strings.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DefaultMfeRegistry } from '../../src/runtime/DefaultMfeRegistry';
import type { TypeSystemPlugin } from '../../src/type-substrate';
import type { ActionsChain, Extension, ExtensionDomain, MfeEntry } from '../../src/types';
import { MfeHandler, type MfeEntryLifecycle } from '../../src/handler/MfeHandler';
import type { ChildMfeBridge } from '../../src/handler/ChildMfeBridge';
import { MfeBridgeFactoryDefault } from '../../src/bridge/MfeBridgeFactoryDefault';
import { ExtensionDomainImplementation } from '../../src/runtime/ExtensionDomainImplementation';
import { ExtensionDomainImplementationFactory } from '../../src/runtime/ExtensionDomainImplementationFactory';
import type { DomainContext } from '../../src/runtime/DomainContext';
import { ConcurrentMountStrategy } from '../../src/runtime/ConcurrentMountStrategy';
import type { ContainerHooks, ActionPayload } from '../../src/runtime/MountStrategy';
import { ActionHandler } from '../../src/mediator/ActionHandler';
import type { RouterPort } from '../../src/router/RouterPort';

const LOAD_EXT = 'mock.action.v1~load_ext.v1~';
const MOUNT_EXT = 'mock.action.v1~mount_ext.v1~';
const UNMOUNT_EXT = 'mock.action.v1~unmount_ext.v1~';
const ACTION_ROOT = 'mock.action.v1~action_root.v1~';

const D0 = 'domain.shell.v1';

function createMockPlugin(): TypeSystemPlugin {
  return {
    name: 'MockPlugin',
    version: '1.0.0',
    registerSchema(): void {},
    getSchema(typeId: string): unknown {
      return typeId.startsWith('entry.') ? makeEntry(typeId) : undefined;
    },
    register(): void {},
    isTypeOf(typeId: string, baseTypeId: string): boolean {
      return typeId === baseTypeId || typeId.startsWith(baseTypeId);
    },
    validateInstance() {
      return { valid: true, errors: [] };
    },
    resolveLoadExtActionId: () => LOAD_EXT,
    resolveMountExtActionId: () => MOUNT_EXT,
    resolveUnmountExtActionId: () => UNMOUNT_EXT,
    resolveLifecycleStageInitId: () => 'mock.stage.v1~init.v1',
    resolveLifecycleStageActivatedId: () => 'mock.stage.v1~activated.v1',
    resolveLifecycleStageDeactivatedId: () => 'mock.stage.v1~deactivated.v1',
    resolveLifecycleStageDestroyedId: () => 'mock.stage.v1~destroyed.v1',
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

  constructor(ctx: DomainContext, extraHandlers: ReadonlyArray<[string, ActionHandler]>) {
    super();
    this.strategy = new ConcurrentMountStrategy(ctx.mounter, new NoopHooks());
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

/** A handler whose `load()` always resolves to the lifecycle object currently assigned to `lifecycle`. */
class StableLifecycleHandler extends MfeHandler {
  readonly bridgeFactory = new MfeBridgeFactoryDefault();

  constructor(
    entryBaseTypeId: string,
    public lifecycle: MfeEntryLifecycle<ChildMfeBridge>
  ) {
    super(entryBaseTypeId);
  }

  async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return this.lifecycle;
  }
}

function actionChain(type: string, target: string): ActionsChain {
  return { action: { type, target, payload: {} } };
}

interface CallCounter {
  readonly count: number;
  increment(): void;
  waitFor(target: number): Promise<void>;
}

function makeCallCounter(): CallCounter {
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

function awaitChain(registry: DefaultMfeRegistry, chain: ActionsChain): Promise<void> {
  return (registry as unknown as { mediator: { executeChain(chain: ActionsChain): Promise<void> } })
    .mediator.executeChain(chain);
}

function fakeRouter(overrides: Partial<RouterPort> = {}): RouterPort {
  return {
    registerDomain: () => {},
    registerExtension: () => {},
    releaseDomain: () => {},
    releaseExtension: () => {},
    assignOccupantValue: () => undefined,
    reportSettled: () => {},
    supplyNavigation: () => {},
    ...overrides,
  };
}

function forwardingEntryIds(registry: DefaultMfeRegistry): Map<string, unknown> {
  return (registry as unknown as { forwardingEntries: Map<string, unknown> }).forwardingEntries;
}

function currentInboundEdge(registry: DefaultMfeRegistry): unknown {
  return (registry as unknown as { inboundBridgeLink: { edge: unknown } | null }).inboundBridgeLink?.edge;
}

/** Registers a one-domain nested registry with a single leaf action, as a host extension's mount would. */
function buildNestedRegistry(
  plugin: TypeSystemPlugin,
  domainId: string,
  leafAction: string,
  counter: CallCounter,
  router?: RouterPort
): DefaultMfeRegistry {
  const nested = new DefaultMfeRegistry({ typeSystem: plugin, router });
  nested.registerDomain(
    makeDomain(domainId, [leafAction]),
    new GenericDomainFactory([
      [leafAction, ActionHandler.fromFunction(async () => { counter.increment(); })],
    ])
  );
  return nested;
}

function buildShell(plugin: TypeSystemPlugin, handlers: MfeHandler[], rootCounter?: CallCounter): DefaultMfeRegistry {
  const shell = new DefaultMfeRegistry({ typeSystem: plugin, mfeHandlers: handlers });
  shell.registerDomain(
    makeDomain(D0, [ACTION_ROOT]),
    new GenericDomainFactory([
      [ACTION_ROOT, ActionHandler.fromFunction(async () => { rootCounter?.increment(); })],
    ])
  );
  shell.getMounter(D0).attach(document.createElement('div'));
  return shell;
}

describe('retention and re-offer of a nested registry adoption', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('after unregister and re-register, the single nested registry is re-linked: it re-advertises upward, receives downward delivery, supplies navigation again, and escalates — with no second construction (inst-reoffer-retained-adoption)', async () => {
    const ENTRY = 'entry.retained.v1';
    const EXT = 'ext.retained.v1';
    const D_N = 'domain.retained-nested.v1';
    const ACTION_LEAF = 'mock.action.v1~action_retained_leaf.v1~';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const plugin = createMockPlugin();
    const leafCounter = makeCallCounter();
    const rootCounter = makeCallCounter();
    const supplyNavigation = vi.fn();

    let constructions = 0;
    let nested: DefaultMfeRegistry | undefined;
    const lifecycle: MfeEntryLifecycle<ChildMfeBridge> = {
      mount: () => {
        if (!nested) {
          constructions += 1;
          nested = buildNestedRegistry(plugin, D_N, ACTION_LEAF, leafCounter, fakeRouter({ supplyNavigation }));
        }
      },
      unmount: () => {},
    };

    const shell = buildShell(plugin, [new StableLifecycleHandler(ENTRY, lifecycle)], rootCounter);
    const mounter = shell.getMounter(D0);

    await shell.registerExtension(makeExtension(EXT, D0, ENTRY));
    await mounter.mount(EXT, document.createElement('div'));
    expect(forwardingEntryIds(shell).has(D_N)).toBe(true);
    expect(supplyNavigation).toHaveBeenCalledTimes(1);

    await shell.unregisterExtension(EXT);
    expect(forwardingEntryIds(shell).has(D_N)).toBe(false);
    expect(currentInboundEdge(nested!)).toBeUndefined();

    await shell.registerExtension(makeExtension(EXT, D0, ENTRY));
    await mounter.mount(EXT, document.createElement('div'));

    expect(constructions).toBe(1);
    // Upward re-advertisement and navigation supply happen at re-link time.
    expect(forwardingEntryIds(shell).has(D_N)).toBe(true);
    expect(supplyNavigation).toHaveBeenCalledTimes(2);
    expect(currentInboundEdge(nested!)).toBeDefined();

    // Downward delivery from the shell to the nested registry's target.
    await awaitChain(shell, actionChain(ACTION_LEAF, D_N));
    await leafCounter.waitFor(1);
    expect(leafCounter.count).toBe(1);

    // Escalation from the nested registry to the shell.
    await awaitChain(nested!, actionChain(ACTION_ROOT, D0));
    await rootCounter.waitFor(1);
    expect(rootCounter.count).toBe(1);
  });

  it('a synchronous mount throw after in-window construction still records the adopter: unregister unlinks it and the next mount after re-registration re-offers it (inst-record-claims-on-mount-throw)', async () => {
    const ENTRY = 'entry.throwing.v1';
    const EXT = 'ext.throwing.v1';
    const D_N = 'domain.throwing-nested.v1';
    const ACTION_LEAF = 'mock.action.v1~action_throwing_leaf.v1~';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const plugin = createMockPlugin();
    const leaf = makeCallCounter();
    const navigation = vi.fn();

    let nested: DefaultMfeRegistry | undefined;
    let mountCalls = 0;
    const lifecycle: MfeEntryLifecycle<ChildMfeBridge> = {
      mount: () => {
        mountCalls += 1;
        if (!nested) {
          nested = buildNestedRegistry(plugin, D_N, ACTION_LEAF, leaf, fakeRouter({ supplyNavigation: navigation }));
        }
        if (mountCalls === 1) {
          throw new Error('synchronous mount failure');
        }
      },
      unmount: () => {},
    };

    const shell = buildShell(plugin, [new StableLifecycleHandler(ENTRY, lifecycle)]);
    const mounter = shell.getMounter(D0);

    await shell.registerExtension(makeExtension(EXT, D0, ENTRY));
    await expect(mounter.mount(EXT, document.createElement('div'))).rejects.toThrow('synchronous mount failure');
    expect(navigation).toHaveBeenCalledTimes(1);
    expect(currentInboundEdge(nested!)).toBeDefined();

    // Unregistering unlinks the adopter recorded despite the throw.
    await shell.unregisterExtension(EXT);
    expect(currentInboundEdge(nested!)).toBeUndefined();
    expect(forwardingEntryIds(shell).has(D_N)).toBe(false);

    await shell.registerExtension(makeExtension(EXT, D0, ENTRY));
    await mounter.mount(EXT, document.createElement('div'));

    expect(forwardingEntryIds(shell).has(D_N)).toBe(true);
    expect(navigation).toHaveBeenCalledTimes(2);
    await awaitChain(shell, actionChain(ACTION_LEAF, D_N));
    await leaf.waitFor(1);
    expect(leaf.count).toBe(1);
  });

  it('an ordinary unmount and remount keeps the link and offers nothing again: no re-link, no second navigation supply', async () => {
    const ENTRY = 'entry.ordinary.v1';
    const EXT = 'ext.ordinary.v1';
    const D_N = 'domain.ordinary-nested.v1';
    const ACTION_LEAF = 'mock.action.v1~action_ordinary_leaf.v1~';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const plugin = createMockPlugin();
    const leaf = makeCallCounter();
    const navigation = vi.fn();

    let nested: DefaultMfeRegistry | undefined;
    const lifecycle: MfeEntryLifecycle<ChildMfeBridge> = {
      mount: () => {
        if (!nested) {
          nested = buildNestedRegistry(plugin, D_N, ACTION_LEAF, leaf, fakeRouter({ supplyNavigation: navigation }));
        }
      },
      unmount: () => {},
    };
    const shell = buildShell(plugin, [new StableLifecycleHandler(ENTRY, lifecycle)]);
    const mounter = shell.getMounter(D0);

    await shell.registerExtension(makeExtension(EXT, D0, ENTRY));
    await mounter.mount(EXT, document.createElement('div'));
    const edgeBefore = currentInboundEdge(nested!);
    expect(edgeBefore).toBeDefined();

    await mounter.unmount(EXT);
    await mounter.mount(EXT, document.createElement('div'));

    expect(currentInboundEdge(nested!)).toBe(edgeBefore);
    expect(navigation).toHaveBeenCalledTimes(1);
    await awaitChain(shell, actionChain(ACTION_LEAF, D_N));
    await leaf.waitFor(1);
    expect(leaf.count).toBe(1);
  });

  it('concurrent mounts of two host extensions attribute each nested registry to its own extension, and unregistering one leaves the other linked', async () => {
    const ENTRY_A = 'entry.concurrent-a.v1';
    const ENTRY_B = 'entry.concurrent-b.v1';
    const EXT_A = 'ext.concurrent-a.v1';
    const EXT_B = 'ext.concurrent-b.v1';
    const D_A = 'domain.concurrent-a-nested.v1';
    const D_B = 'domain.concurrent-b-nested.v1';
    const LEAF_A = 'mock.action.v1~action_concurrent_a.v1~';
    const LEAF_B = 'mock.action.v1~action_concurrent_b.v1~';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const plugin = createMockPlugin();
    const leafA = makeCallCounter();
    const leafB = makeCallCounter();

    let nestedA: DefaultMfeRegistry | undefined;
    let nestedB: DefaultMfeRegistry | undefined;
    let bridgeA: ChildMfeBridge | undefined;
    let bridgeB: ChildMfeBridge | undefined;
    const handlerA = new StableLifecycleHandler(ENTRY_A, {
      mount: (_c, bridge) => {
        bridgeA = bridge;
        nestedA = buildNestedRegistry(plugin, D_A, LEAF_A, leafA);
      },
      unmount: () => {},
    });
    const handlerB = new StableLifecycleHandler(ENTRY_B, {
      mount: (_c, bridge) => {
        bridgeB = bridge;
        nestedB = buildNestedRegistry(plugin, D_B, LEAF_B, leafB);
      },
      unmount: () => {},
    });
    const shell = buildShell(plugin, [handlerA, handlerB]);
    const mounter = shell.getMounter(D0);

    await shell.registerExtension(makeExtension(EXT_A, D0, ENTRY_A));
    await shell.registerExtension(makeExtension(EXT_B, D0, ENTRY_B));
    await Promise.all([
      mounter.mount(EXT_A, document.createElement('div')),
      mounter.mount(EXT_B, document.createElement('div')),
    ]);

    expect(currentInboundEdge(nestedA!)).toBe(bridgeA);
    expect(currentInboundEdge(nestedB!)).toBe(bridgeB);
    expect(bridgeA).not.toBe(bridgeB);

    await shell.unregisterExtension(EXT_A);

    expect(currentInboundEdge(nestedA!)).toBeUndefined();
    expect(currentInboundEdge(nestedB!)).toBe(bridgeB);
    expect(forwardingEntryIds(shell).has(D_A)).toBe(false);
    expect(forwardingEntryIds(shell).has(D_B)).toBe(true);
    await awaitChain(shell, actionChain(LEAF_B, D_B));
    await leafB.waitFor(1);
    expect(leafB.count).toBe(1);
    expect(leafA.count).toBe(0);
  });

  it('after a re-offer, transitive forwarding is re-established across three levels: the shell again reaches the deepest target (inst-reoffer-hand-link)', async () => {
    const ENTRY_A = 'entry.deep-a.v1';
    const ENTRY_B = 'entry.deep-b.v1';
    const EXT_A = 'ext.deep-a.v1';
    const EXT_B = 'ext.deep-b.v1';
    const D_1 = 'domain.deep-level1.v1';
    const D_2 = 'domain.deep-level2.v1';
    const LEAF_DEEP = 'mock.action.v1~action_deep_leaf.v1~';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const plugin = createMockPlugin();
    const deepLeaf = makeCallCounter();

    let level1: DefaultMfeRegistry | undefined;
    let level2: DefaultMfeRegistry | undefined;
    let constructions = 0;

    const handlerB = new StableLifecycleHandler(ENTRY_B, {
      mount: () => {
        if (!level2) {
          constructions += 1;
          level2 = buildNestedRegistry(plugin, D_2, LEAF_DEEP, deepLeaf);
        }
      },
      unmount: () => {},
    });
    const handlerA = new StableLifecycleHandler(ENTRY_A, {
      mount: () => {
        if (!level1) {
          constructions += 1;
          level1 = new DefaultMfeRegistry({ typeSystem: plugin, mfeHandlers: [handlerB] });
          level1.registerDomain(makeDomain(D_1), new GenericDomainFactory());
        }
      },
      unmount: () => {},
    });

    const shell = buildShell(plugin, [handlerA]);
    const mounter0 = shell.getMounter(D0);

    await shell.registerExtension(makeExtension(EXT_A, D0, ENTRY_A));
    await mounter0.mount(EXT_A, document.createElement('div'));
    const mounter1 = level1!.getMounter(D_1);
    mounter1.attach(document.createElement('div'));
    await level1!.registerExtension(makeExtension(EXT_B, D_1, ENTRY_B));
    await mounter1.mount(EXT_B, document.createElement('div'));

    await awaitChain(shell, actionChain(LEAF_DEEP, D_2));
    await deepLeaf.waitFor(1);
    expect(deepLeaf.count).toBe(1);

    await shell.unregisterExtension(EXT_A);
    expect(forwardingEntryIds(shell).has(D_2)).toBe(false);

    await shell.registerExtension(makeExtension(EXT_A, D0, ENTRY_A));
    await mounter0.mount(EXT_A, document.createElement('div'));

    expect(constructions).toBe(2);
    expect(forwardingEntryIds(shell).has(D_2)).toBe(true);
    await awaitChain(shell, actionChain(LEAF_DEEP, D_2));
    await deepLeaf.waitFor(2);
    expect(deepLeaf.count).toBe(2);
  });

  it('a registry constructed outside every mount window is a root: no inbound link, no diagnostic (inst-registry-is-root)', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const plugin = createMockPlugin();
    const registry = new DefaultMfeRegistry({ typeSystem: plugin });

    expect(currentInboundEdge(registry)).toBeUndefined();
    expect(debugSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    registry.dispose();
  });

  it('a failed occupant-value assignment leaves the retained adopters unlinked; the retried mount mints the link again and re-links them (inst-reoffer-retained-adoption)', async () => {
    const ENTRY = 'entry.assign-fails.v1';
    const EXT = 'ext.assign-fails.v1';
    const D_N = 'domain.assign-fails-nested.v1';
    const ACTION_LEAF = 'mock.action.v1~action_assign_fails_leaf.v1~';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const plugin = createMockPlugin();
    const leaf = makeCallCounter();
    const assignOccupantValue = vi.fn(() => undefined);
    const router = fakeRouter({ assignOccupantValue });

    let nested: DefaultMfeRegistry | undefined;
    const lifecycle: MfeEntryLifecycle<ChildMfeBridge> = {
      mount: () => {
        if (!nested) {
          nested = buildNestedRegistry(plugin, D_N, ACTION_LEAF, leaf);
        }
      },
      unmount: () => {},
    };
    const shell = new DefaultMfeRegistry({
      typeSystem: plugin,
      mfeHandlers: [new StableLifecycleHandler(ENTRY, lifecycle)],
      router,
    });
    shell.registerDomain(makeDomain(D0), new GenericDomainFactory());
    shell.getMounter(D0).attach(document.createElement('div'));
    const mounter = shell.getMounter(D0);

    await shell.registerExtension(makeExtension(EXT, D0, ENTRY));
    await mounter.mount(EXT, document.createElement('div'));
    await shell.unregisterExtension(EXT);
    expect(currentInboundEdge(nested!)).toBeUndefined();

    await shell.registerExtension(makeExtension(EXT, D0, ENTRY));
    assignOccupantValue.mockImplementationOnce(() => {
      throw new Error('assignment refused');
    });
    await expect(mounter.mount(EXT, document.createElement('div'))).rejects.toThrow('assignment refused');

    // The assignment failed before the re-offer.
    expect(currentInboundEdge(nested!)).toBeUndefined();
    expect(forwardingEntryIds(shell).has(D_N)).toBe(false);

    await mounter.mount(EXT, document.createElement('div'));
    expect(currentInboundEdge(nested!)).toBeDefined();
    await awaitChain(shell, actionChain(ACTION_LEAF, D_N));
    await leaf.waitFor(1);
    expect(leaf.count).toBe(1);
  });

  it('a re-offered registry whose router reads the navigation reader immediately sees the new occupant value (inst-ov-supply-navigation)', async () => {
    const ENTRY = 'entry.reads-immediately.v1';
    const EXT = 'ext.reads-immediately.v1';
    const D_N = 'domain.reads-immediately-nested.v1';
    const ACTION_LEAF = 'mock.action.v1~action_reads_immediately_leaf.v1~';
    const plugin = createMockPlugin();
    const leaf = makeCallCounter();
    let assigned = 0;
    const shellRouter = fakeRouter({ assignOccupantValue: () => `value-${++assigned}` });
    const readValues: unknown[] = [];
    const nestedRouter = fakeRouter({
      supplyNavigation: (reader) => {
        readValues.push(reader());
      },
    });

    let nested: DefaultMfeRegistry | undefined;
    const lifecycle: MfeEntryLifecycle<ChildMfeBridge> = {
      mount: () => {
        if (!nested) {
          nested = buildNestedRegistry(plugin, D_N, ACTION_LEAF, leaf, nestedRouter);
        }
      },
      unmount: () => {},
    };
    const shell = new DefaultMfeRegistry({
      typeSystem: plugin,
      mfeHandlers: [new StableLifecycleHandler(ENTRY, lifecycle)],
      router: shellRouter,
    });
    shell.registerDomain(makeDomain(D0), new GenericDomainFactory());
    shell.getMounter(D0).attach(document.createElement('div'));
    const mounter = shell.getMounter(D0);

    await shell.registerExtension(makeExtension(EXT, D0, ENTRY));
    await mounter.mount(EXT, document.createElement('div'));
    await shell.unregisterExtension(EXT);
    await shell.registerExtension(makeExtension(EXT, D0, ENTRY));
    await mounter.mount(EXT, document.createElement('div'));

    expect(readValues).toEqual(['value-1', 'value-2']);
  });

  describe('an action handed down from the parent never escalates', () => {
    const ACTION_UNHANDLED = 'mock.action.v1~action_unhandled.v1~';

    async function setUp(label: string) {
      const ENTRY = `entry.${label}.v1`;
      const EXT = `ext.${label}.v1`;
      const D_N = `domain.${label}-nested.v1`;
      const ACTION_LEAF = `mock.action.v1~action_${label}_leaf.v1~`;
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const plugin = createMockPlugin();
      const leaf = makeCallCounter();
      let nested: DefaultMfeRegistry | undefined;
      const lifecycle: MfeEntryLifecycle<ChildMfeBridge> = {
        mount: () => {
          nested = buildNestedRegistry(plugin, D_N, ACTION_LEAF, leaf);
        },
        unmount: () => {},
      };
      const shell = buildShell(plugin, [new StableLifecycleHandler(ENTRY, lifecycle)]);
      await shell.registerExtension(makeExtension(EXT, D0, ENTRY));
      await shell.getMounter(D0).mount(EXT, document.createElement('div'));
      const received = vi.spyOn(
        shell as unknown as { receiveCrossHopNode(envelope: unknown): void },
        'receiveCrossHopNode'
      );
      return { shell, nested: nested!, leaf, received, D_N, ACTION_LEAF };
    }

    it('unresolved in the child, it fails there: the chain\'s fallback runs once in the child and nothing reaches the parent', async () => {
      const { shell, leaf, received, D_N, ACTION_LEAF } = await setUp('no-escalate-fallback');

      await awaitChain(shell, {
        action: { type: ACTION_UNHANDLED, target: D_N, payload: {} },
        fallback: { action: { type: ACTION_LEAF, target: D_N, payload: {} } },
      });
      await leaf.waitFor(1);

      expect(leaf.count).toBe(1);
      expect(received).not.toHaveBeenCalled();
    });

    it('with no fallback nothing happens and nothing reaches the parent', async () => {
      const { shell, leaf, received, D_N, ACTION_LEAF } = await setUp('no-escalate-bare');

      // Handed down in order: the unhandled action fails synchronously in the
      // child, so the leaf action behind it settling shows it already ran.
      await awaitChain(shell, actionChain(ACTION_UNHANDLED, D_N));
      await awaitChain(shell, actionChain(ACTION_LEAF, D_N));
      await leaf.waitFor(1);

      expect(leaf.count).toBe(1);
      expect(received).not.toHaveBeenCalled();
    });
  });
});
