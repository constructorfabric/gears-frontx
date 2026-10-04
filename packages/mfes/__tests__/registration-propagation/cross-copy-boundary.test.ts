/**
 * Cross-nesting reachability across TWO independently loaded copies of this
 * package (not one shared module graph).
 *
 * Per `cpt-frontx-adr-mfe-load-isolation`, a mounted extension may evaluate
 * its own independently loaded copy of `@gears-frontx/mfes` — including the
 * realm-global rendezvous machinery this feature depends on
 * (`inst-track-mounting-bridge`, `inst-adopt-ambient-bridge`) and the
 * arrival-edge WeakMap used for loop containment (`inst-tag-arrival-edge`).
 * The single-module-graph suite (`cross-nesting-reachability.test.ts`)
 * exercises the OBSERVABLE behavior this feature promises, but it cannot
 * exercise the one thing most likely to silently regress: whether that
 * behavior actually survives the module-instance boundary, since a shared
 * import trivially "passes" even a module-scoped WeakMap/stack design that
 * is fundamentally broken across copies.
 *
 * This suite obtains two GENUINELY SEPARATE module instances of the package
 * via `vi.resetModules()` + two distinct batches of dynamic `import()` calls
 * — copy A hosts the shell registry, copy B hosts the nested registry — and
 * verifies that inbound-bridge adoption, downward forwarding, upward
 * escalation, arrival-edge loop containment, the collision guard, and
 * parent-owned retraction all hold across that boundary. No code under test
 * is changed for this suite; it exercises the same public/internal surface
 * as the single-graph suite, just wired through two copies.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { TypeSystemPlugin } from '../../src/type-substrate';
import type {
  ActionsChain,
  Extension,
  ExtensionDomain,
  MfeEntry,
} from '../../src/types';
import type { ChildMfeBridge } from '../../src/handler/ChildMfeBridge';
import type { MfeEntryLifecycle } from '../../src/handler/MfeHandler';
import type { DomainContext } from '../../src/runtime/DomainContext';
import type { ContainerHooks, ActionPayload } from '../../src/runtime/MountStrategy';

// ─── Mock-notation well-known action ids (never real GTS strings — MFES-1) ──

const LOAD_EXT = 'mock.action.v1~load_ext.v1~';
const MOUNT_EXT = 'mock.action.v1~mount_ext.v1~';
const UNMOUNT_EXT = 'mock.action.v1~unmount_ext.v1~';
const ACTION_ROOT = 'mock.action.v1~action_root.v1~';
const ACTION_LEAF = 'mock.action.v1~action_leaf.v1~';
const ACTION_HANG = 'mock.action.v1~action_hang.v1~';
const ACTION_COLLIDE = 'mock.action.v1~action_collide.v1~';
const ACTION_UNRESOLVABLE = 'mock.action.v1~action_unresolvable.v1~';

function createMockPlugin(entries: Map<string, MfeEntry>): TypeSystemPlugin {
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

function makeEntry(id: string): MfeEntry {
  return { id, requiredProperties: [], actions: [], domainActions: [] };
}

function makeExtension(id: string, domain: string, entry: string): Extension {
  return { id, domain, entry, lifecycle: [] } as Extension;
}

function actionChain(type: string, target: string): ActionsChain {
  return { action: { type, target, payload: {} } };
}

// ─── Loading a genuinely separate module copy ──────────────────────────────

/**
 * Imports the full set of runtime pieces this harness needs, all from the
 * SAME module-registry generation (no `vi.resetModules()` between these
 * `import()` calls) — so within one call to `loadCopy()`, every import below
 * resolves against one internally-consistent module graph, including
 * whatever `DefaultMfeRegistry.ts` itself transitively imports (e.g.
 * `ConcurrentMountStrategy` from `./ConcurrentMountStrategy`, the realm-global
 * rendezvous helpers from `./inbound-bridge-link`).
 *
 * Calling this twice, with `vi.resetModules()` in between, is what makes the
 * two calls' results genuinely distinct copies rather than the same cached
 * modules: `vi.resetModules()` clears vitest's module registry so the next
 * `import()` of an already-seen specifier re-evaluates the module from
 * scratch, producing new class objects with no shared identity to the first
 * copy's — while `globalThis` (unaffected by `vi.resetModules()`) is exactly
 * the one thing both copies still share, which is the entire premise the
 * realm-global rendezvous mechanism depends on.
 */
/**
 * An explicit settlement signal for a far-side effect a test cannot
 * `await` directly: under the continuation model, the dispatching side's
 * own settlement resolves the instant it hands a node over, well before
 * the far side's own scheduled execution actually runs it. Counter-based
 * rather than a single deferred, so a handler invoked more than once can
 * be awaited to a specific count — never a blind microtask flush or a
 * timer-based poll (mirrors the identical helper in the property suite).
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

async function loadCopy() {
  const [
    registryModule,
    handlerTypesModule,
    bridgeFactoryModule,
    domainImplModule,
    domainImplFactoryModule,
    mountStrategiesModule,
    mediatorTypesModule,
    parentBridgeModule,
    bridgeErrorsModule,
  ] = await Promise.all([
    import('../../src/runtime/DefaultMfeRegistry'),
    import('../../src/handler/MfeHandler'),
    import('../../src/bridge/MfeBridgeFactoryDefault'),
    import('../../src/runtime/ExtensionDomainImplementation'),
    import('../../src/runtime/ExtensionDomainImplementationFactory'),
    import('../../src/runtime/ConcurrentMountStrategy'),
    import('../../src/mediator/ActionHandler'),
    import('../../src/bridge/ParentMfeBridgeImpl'),
    import('../../src/bridge/errors'),
  ]);

  return {
    DefaultMfeRegistry: registryModule.DefaultMfeRegistry,
    MfeHandler: handlerTypesModule.MfeHandler,
    MfeBridgeFactoryDefault: bridgeFactoryModule.MfeBridgeFactoryDefault,
    ExtensionDomainImplementation: domainImplModule.ExtensionDomainImplementation,
    ExtensionDomainImplementationFactory: domainImplFactoryModule.ExtensionDomainImplementationFactory,
    ConcurrentMountStrategy: mountStrategiesModule.ConcurrentMountStrategy,
    ActionHandler: mediatorTypesModule.ActionHandler,
    // Same-generation imports (see the doc comment above): resolves to the
    // exact `ParentMfeBridgeImpl`/`BridgeInactiveError` this copy's own
    // `DefaultMfeRegistry` uses internally, so tests can spy on/assert
    // against the actual mechanism.
    ParentMfeBridgeImpl: parentBridgeModule.ParentMfeBridgeImpl,
    BridgeInactiveError: bridgeErrorsModule.BridgeInactiveError,
  };
}

type Copy = Awaited<ReturnType<typeof loadCopy>>;

/**
 * Runs the registry mediator's internal recursion for `chain` and resolves
 * once this registry's own part has ended — after a hand-over is accepted,
 * that is before the far side executes it. The public `executeActionsChain`
 * returns nothing awaitable (`cpt-frontx-adr-mfe-runtime-public-surface`);
 * far-side effects are observed through counters a handler increments.
 * Duck-typed (`as unknown as {...}`), since a registry here may belong to
 * either independently loaded module copy.
 */
function awaitChain(
  registry: InstanceType<Copy['DefaultMfeRegistry']>,
  chain: ActionsChain
): Promise<void> {
  return (registry as unknown as { mediator: { executeChain(chain: ActionsChain): Promise<void> } })
    .mediator.executeChain(chain);
}

/** Builds a `ConcurrentMountStrategy`-backed domain implementation bound to one specific copy's classes. */
function makeDomainFactory(
  copy: Copy,
  extraHandlers: ReadonlyArray<[string, InstanceType<Copy['ActionHandler']>]> = []
) {
  class NoopHooks implements ContainerHooks {
    create(_extensionId: string): Element {
      return document.createElement('div');
    }
    destroy(_extensionId: string): void { /* no-op */ }
  }

  class GenericDomainImpl extends copy.ExtensionDomainImplementation {
    private readonly strategy: InstanceType<Copy['ConcurrentMountStrategy']>;

    constructor(ctx: DomainContext) {
      super();
      const hooks = new NoopHooks();
      this.strategy = new copy.ConcurrentMountStrategy(ctx.mounter, hooks);
      ctx.registerHandler(
        MOUNT_EXT,
        copy.ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as ActionPayload))
      );
      ctx.registerHandler(
        UNMOUNT_EXT,
        copy.ActionHandler.fromFunction((_t, p) => this.strategy.unmount!(p as ActionPayload))
      );
      for (const [actionType, handler] of extraHandlers) {
        ctx.registerHandler(actionType, handler);
      }
    }

    protected getMountStrategies() {
      return [this.strategy];
    }
  }

  class GenericDomainFactory extends copy.ExtensionDomainImplementationFactory {
    build(ctx: DomainContext): GenericDomainImpl {
      return new GenericDomainImpl(ctx);
    }
  }

  return new GenericDomainFactory();
}

/** An `MfeHandler`, bound to one specific copy's classes, whose `load()` resolves to an injectable synchronous `mount()`. */
function makeInjectableMountHandler(
  copy: Copy,
  entryBaseTypeId: string,
  onMount: (bridge: ChildMfeBridge) => void
) {
  class InjectableMountHandler extends copy.MfeHandler {
    readonly bridgeFactory = new copy.MfeBridgeFactoryDefault();

    async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
      return {
        mount: (_container, bridge) => {
          // Synchronous body: anything constructed here — in particular a
          // further `DefaultMfeRegistry`, from EITHER copy — falls inside
          // the realm-global rendezvous window (`inst-track-mounting-bridge`).
          onMount(bridge);
        },
        unmount: () => { /* no-op */ },
      };
    }
  }

  return new InjectableMountHandler(entryBaseTypeId);
}

// ─── Topology: shell (copy A) -> child-ext -> nested registry (copy B) ────

const D0 = 'domain.shell.v1';
const D1 = 'domain.nested.v1';
const CHILD_EXT = 'ext.child.v1';
const CHILD_ENTRY = 'entry.child.v1';
const SIBLING_EXT = 'ext.sibling.v1';
const SIBLING_ENTRY = 'entry.sibling.v1';

interface Topology {
  copyA: Copy;
  copyB: Copy;
  shell: InstanceType<Copy['DefaultMfeRegistry']>;
  nested: InstanceType<Copy['DefaultMfeRegistry']>;
  siblingNested: InstanceType<Copy['DefaultMfeRegistry']> | undefined;
  rootCounter: ReturnType<typeof makeCallCounter>;
  leafCounter: ReturnType<typeof makeCallCounter>;
  collideCounterFirst: ReturnType<typeof makeCallCounter>;
  collideCounterSecond: { count: number };
  errorSpy: ReturnType<typeof vi.spyOn>;
}

/**
 * Builds shell (copy A) -> child-ext -> nested (copy B, domain D1), across
 * the real mount path (`registerExtension` / `ExtensionMounter.mount`) —
 * the same route the React slot takes, and the same one the single-graph
 * suite uses, just spanning two independently loaded copies.
 */
async function buildCrossCopyTopology(includeCollidingSibling = false): Promise<Topology> {
  vi.resetModules();
  const copyA = await loadCopy();
  vi.resetModules();
  const copyB = await loadCopy();

  const entries = new Map<string, MfeEntry>([
    [CHILD_ENTRY, makeEntry(CHILD_ENTRY)],
    [SIBLING_ENTRY, makeEntry(SIBLING_ENTRY)],
  ]);
  // Structural interface, not a class — safe to share the identical plugin
  // object across both copies; a `TypeSystemPlugin` is duck-typed by every
  // caller, on either side of the boundary.
  const plugin = createMockPlugin(entries);
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* silence expected diagnostics */ });

  const rootCounter = makeCallCounter();
  const leafCounter = makeCallCounter();
  const collideCounterFirst = makeCallCounter();
  const collideCounterSecond = { count: 0 };

  let nested!: InstanceType<Copy['DefaultMfeRegistry']>;
  let siblingNested: InstanceType<Copy['DefaultMfeRegistry']> | undefined;

  const childHandler = makeInjectableMountHandler(copyA, CHILD_ENTRY, () => {
    // Synchronously construct a registry from COPY B inside child-ext's own
    // mount() body, which is running as part of COPY A's mount manager —
    // this is the entire cross-copy "adopt the ambient bridge" contract.
    nested = new copyB.DefaultMfeRegistry({ typeSystem: plugin });
    nested.registerDomain(
      makeDomain(D1, [ACTION_LEAF, ACTION_HANG]),
      makeDomainFactory(copyB, [
        [ACTION_LEAF, copyB.ActionHandler.fromFunction(async () => { leafCounter.increment(); })],
        // Never settles on its own — proves a forwarded action already
        // accepted here keeps executing, untouched, when the far side is
        // later disposed.
        [ACTION_HANG, copyB.ActionHandler.fromFunction(() => new Promise<void>(() => { /* hangs */ }))],
      ])
    );
    if (includeCollidingSibling) {
      nested.registerDomain(
        makeDomain('domain.collide.v1', [ACTION_COLLIDE]),
        makeDomainFactory(copyB, [
          [ACTION_COLLIDE, copyB.ActionHandler.fromFunction(async () => { collideCounterFirst.increment(); })],
        ])
      );
    }
  });

  const siblingHandler = makeInjectableMountHandler(copyA, SIBLING_ENTRY, () => {
    // A SECOND independently loaded copy-B registry — an independent
    // subtree that collides with the first on 'domain.collide.v1'.
    siblingNested = new copyB.DefaultMfeRegistry({ typeSystem: plugin });
    siblingNested.registerDomain(
      makeDomain('domain.collide.v1', [ACTION_COLLIDE]),
      makeDomainFactory(copyB, [
        [ACTION_COLLIDE, copyB.ActionHandler.fromFunction(async () => { collideCounterSecond.count += 1; })],
      ])
    );
  });

  const shell = new copyA.DefaultMfeRegistry({
    typeSystem: plugin,
    mfeHandlers: includeCollidingSibling ? [childHandler, siblingHandler] : [childHandler],
  });

  shell.registerDomain(
    makeDomain(D0, [ACTION_ROOT]),
    makeDomainFactory(copyA, [
      [ACTION_ROOT, copyA.ActionHandler.fromFunction(async () => { rootCounter.increment(); })],
    ])
  );

  await shell.registerExtension(makeExtension(CHILD_EXT, D0, CHILD_ENTRY));
  const mounter0 = shell.getMounter(D0);
  mounter0.attach(document.createElement('div'));
  await mounter0.mount(CHILD_EXT, document.createElement('div'));

  if (includeCollidingSibling) {
    await shell.registerExtension(makeExtension(SIBLING_EXT, D0, SIBLING_ENTRY));
    await mounter0.mount(SIBLING_EXT, document.createElement('div'));
  }

  return {
    copyA,
    copyB,
    shell,
    nested,
    siblingNested,
    rootCounter,
    leafCounter,
    collideCounterFirst,
    collideCounterSecond,
    errorSpy,
  };
}

describe('Cross-copy boundary: registration propagation, escalation, retraction across two independently loaded module instances', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('the two copies are genuinely distinct module instances, not one shared import', async () => {
    const copyA = await loadCopy();
    vi.resetModules();
    const copyB = await loadCopy();

    expect(copyA.DefaultMfeRegistry).not.toBe(copyB.DefaultMfeRegistry);
    expect(copyA.MfeHandler).not.toBe(copyB.MfeHandler);
    expect(copyA.ActionHandler).not.toBe(copyB.ActionHandler);

    const instanceFromA = new copyA.DefaultMfeRegistry({ typeSystem: createMockPlugin(new Map()) });
    // The nested registry from copy B is never an `instanceof` copy A's own
    // class, and vice versa — proving the two are unrelated class
    // hierarchies, exactly the situation `cpt-frontx-adr-mfe-load-isolation`
    // says a real nested MFE composition produces.
    expect(instanceFromA instanceof copyB.DefaultMfeRegistry).toBe(false);
  });

  it('(1) inbound-bridge adoption and downward forwarding work across the copy boundary: shell (copy A) reaches the nested registry (copy B)', async () => {
    const { shell, leafCounter } = await buildCrossCopyTopology();

    void awaitChain(shell, actionChain(ACTION_LEAF, D1));

    await leafCounter.waitFor(1);
    expect(leafCounter.count).toBe(1);
  });

  it('(2) upward escalation works across the copy boundary: the nested registry (copy B) reaches the shell (copy A)', async () => {
    const { nested, rootCounter } = await buildCrossCopyTopology();

    void awaitChain(nested, actionChain(ACTION_ROOT, D0));

    await rootCounter.waitFor(1);
    expect(rootCounter.count).toBe(1);
  });

  it('(3) arrival-edge loop containment holds across the copy boundary: the shell never ping-pongs an escalated-from-nested dispatch back down through the same bridge', async () => {
    const { nested, rootCounter } = await buildCrossCopyTopology();

    // The nested registry (copy B) does not declare ACTION_UNRESOLVABLE, so
    // it must escalate to the shell (copy A). The shell legitimately holds
    // a forwarding entry for D1 pointing right back down through the exact
    // bridge this action just arrived on. Without cross-copy-correct
    // arrival-edge tagging (`inst-tag-arrival-edge`) — the tag is written by
    // copy A's `buildInboundBridgeLinkFor` closure and must be read back by
    // copy A's own `resolveHandler`, never by copy B's WeakMap — the shell
    // would hand the action straight back down to the nested registry.
    const nestedReceiveSpy = vi.spyOn(
      nested as unknown as { receiveCrossHopNode(envelope: unknown): void },
      'receiveCrossHopNode'
    );

    // The shell finds no handler and executes the chain's `fallback` — the
    // synchronisation point for this test.
    nested.executeActionsChain({
      action: { type: ACTION_UNRESOLVABLE, target: D1, payload: {} },
      fallback: actionChain(ACTION_ROOT, D0),
    });

    await rootCounter.waitFor(1);
    expect(nestedReceiveSpy).not.toHaveBeenCalled();
  });

  it('(4) the collision guard rejects a cross-copy advertisement collision between two independent copy-B subtrees mounted under the same copy-A shell', async () => {
    const { shell, siblingNested, collideCounterFirst, collideCounterSecond, errorSpy } =
      await buildCrossCopyTopology(true);

    expect(siblingNested).toBeDefined();
    const collisionLog = errorSpy.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('Advertisement collision')
    );
    expect(collisionLog).toBeDefined();

    // The shell keeps routing to the FIRST-registered target; the second
    // copy-B subtree's own local domain of the same id is never reachable
    // through the shell.
    void awaitChain(shell, actionChain(ACTION_COLLIDE, 'domain.collide.v1'));
    await collideCounterFirst.waitFor(1);
    expect(collideCounterFirst.count).toBe(1);
    expect(collideCounterSecond.count).toBe(0);
  });

  it('(5) the shell\'s dispatch hands a forwarded action over; disposing the nested (copy B) registry afterward leaves that accepted execution untouched and only retracts the route for LATER dispatches, across the boundary', async () => {
    const { shell, nested, rootCounter } = await buildCrossCopyTopology();

    // Hand over a sub-chain whose handler never settles; the shell's own
    // part ends once the far side (copy B) accepts it.
    await awaitChain(shell, actionChain(ACTION_HANG, D1));

    // Dispose the copy-B registry — the accepted sub-chain is untouched:
    // disposal acts on the ROUTE only.
    nested.dispose();

    // The shell's forwarding entry for D1 is gone.
    const forwardingEntries = (shell as unknown as { forwardingEntries: Map<string, unknown> })
      .forwardingEntries;
    expect(forwardingEntries.has(D1)).toBe(false);

    // A later dispatch finds no route: the action fails and its fallback runs.
    await awaitChain(shell, {
      action: { type: ACTION_LEAF, target: D1, payload: {} },
      fallback: actionChain(ACTION_ROOT, D0),
    });
    expect(rootCounter.count).toBe(1);
  });

  it('(6) unmounting the child extension deactivates the copy-B nested registry\'s bridge across the copy boundary: the hand-over is refused as inactive, not as missing a handler', async () => {
    const { shell, rootCounter, copyA } = await buildCrossCopyTopology();

    // Unmount child-ext directly through the shell's own mount manager,
    // WITHOUT ever calling `nested.dispose()` — an ordinary unmount only
    // deactivates the bridge (`inst-bridge-deactivation`), across the copy
    // boundary the same as within one module graph; the forwarding entry
    // for D1 stays recorded at the shell.
    const mounter0 = shell.getMounter(D0);
    await mounter0.unmount(CHILD_EXT);

    // Spy on copy A's own `ParentMfeBridgeImpl.sendCrossHopEnvelope` (the
    // exact method `shell`'s internal `sendDown` closure calls), same-copy
    // generation as `shell` itself so `instanceof` holds.
    const sendSpy = vi.spyOn(copyA.ParentMfeBridgeImpl.prototype, 'sendCrossHopEnvelope');
    await awaitChain(shell, {
      action: { type: ACTION_LEAF, target: D1, payload: {} },
      fallback: actionChain(ACTION_ROOT, D0),
    });

    // Outcome-level check: the action failed, so its fallback ran.
    expect(rootCounter.count).toBe(1);

    // Mechanism-level check: the forwarding entry for D1 WAS resolved and
    // reached the bridge (not a no-route failure), and the bridge refused
    // the hand-over at the call because it is inactive.
    expect(sendSpy).toHaveBeenCalled();
    const lastCall = sendSpy.mock.results[sendSpy.mock.results.length - 1];
    expect(lastCall.type).toBe('throw');
    expect(lastCall.value).toBeInstanceOf(copyA.BridgeInactiveError);

    sendSpy.mockRestore();
  });

  it('(7) a copy-B registry keeps its already-adopted live link across an unmount and remount of its copy-A host extension, and continues to advertise successfully', async () => {
    vi.resetModules();
    const copyA = await loadCopy();
    vi.resetModules();
    const copyB = await loadCopy();

    const REUSE_ENTRY = 'entry.reuse-cross-copy.v1';
    const REUSE_EXT = 'ext.reuse-cross-copy.v1';
    const D_REUSE = 'domain.reuse-cross-copy.v1';
    const ACTION_REUSE = 'mock.action.v1~action_reuse_cross_copy.v1~';

    const entries = new Map<string, MfeEntry>([[REUSE_ENTRY, makeEntry(REUSE_ENTRY)]]);
    const plugin = createMockPlugin(entries);
    vi.spyOn(console, 'error').mockImplementation(() => { /* silence expected diagnostics */ });
    const reuseCounter = makeCallCounter();

    // Constructed exactly once, from copy B, the very first time `mount()`
    // runs.
    let reusedNested: InstanceType<Copy['DefaultMfeRegistry']> | undefined;

    const reuseHandler = makeInjectableMountHandler(copyA, REUSE_ENTRY, () => {
      if (!reusedNested) {
        reusedNested = new copyB.DefaultMfeRegistry({ typeSystem: plugin });
        reusedNested.registerDomain(
          makeDomain(D_REUSE, [ACTION_REUSE]),
          makeDomainFactory(copyB, [
            [ACTION_REUSE, copyB.ActionHandler.fromFunction(async () => { reuseCounter.increment(); })],
          ])
        );
      }
      // Remount: no new copy-B `DefaultMfeRegistry` is constructed here;
      // the registry's adopted link stays live across the copy boundary.
    });

    const shell = new copyA.DefaultMfeRegistry({
      typeSystem: plugin,
      mfeHandlers: [reuseHandler],
    });
    shell.registerDomain(makeDomain(D0), makeDomainFactory(copyA));

    await shell.registerExtension(makeExtension(REUSE_EXT, D0, REUSE_ENTRY));
    const mounter0 = shell.getMounter(D0);
    mounter0.attach(document.createElement('div'));

    await mounter0.mount(REUSE_EXT, document.createElement('div'));
    await awaitChain(shell, actionChain(ACTION_REUSE, D_REUSE));
    await reuseCounter.waitFor(1);
    expect(reuseCounter.count).toBe(1);

    await mounter0.unmount(REUSE_EXT);
    await mounter0.mount(REUSE_EXT, document.createElement('div'));

    // The shell's own part ends at the hand-over; the terminal effect below
    // is the observation.
    await awaitChain(shell, actionChain(ACTION_REUSE, D_REUSE));
    await reuseCounter.waitFor(2);
    expect(reuseCounter.count).toBe(2);

    vi.restoreAllMocks();
  });

  it(
    '(8) a cross-hop envelope version the receiving COPY does not recognize refuses the ' +
      "hand-over, so the delivering runtime executes the fallback — exercised across two " +
      'genuinely independently loaded copies (AC5.12)',
    async () => {
      const { shell, copyA } = await buildCrossCopyTopology();

      // Intercept copy A's own transport call and bump the envelope's
      // version by one before it crosses into copy B — simulating a peer
      // built from a different release, never mutating the shared
      // `CROSS_HOP_PROTOCOL_VERSION` constant itself.
      const originalSend = copyA.ParentMfeBridgeImpl.prototype.sendCrossHopEnvelope;
      const sendSpy = vi
        .spyOn(copyA.ParentMfeBridgeImpl.prototype, 'sendCrossHopEnvelope')
        .mockImplementation(function (this: InstanceType<Copy['ParentMfeBridgeImpl']>, envelope: unknown) {
          const bumped = { ...(envelope as { version: number }), version: (envelope as { version: number }).version + 1 };
          return originalSend.call(this, bumped as never);
        });

      let fallbackRan = false;
      shell.registerDomain(
        makeDomain('domain.version-fallback.v1', [ACTION_ROOT]),
        makeDomainFactory(copyA, [
          [ACTION_ROOT, copyA.ActionHandler.fromFunction(async () => { fallbackRan = true; })],
        ])
      );

      await awaitChain(shell, {
        action: { type: ACTION_LEAF, target: D1, payload: {} },
        fallback: actionChain(ACTION_ROOT, 'domain.version-fallback.v1'),
      });

      // The hand-over was refused at the call — copy B took nothing — so
      // the delivering runtime (copy A's own shell) executes the fallback.
      expect(fallbackRan).toBe(true);

      sendSpy.mockRestore();
    }
  );
});
