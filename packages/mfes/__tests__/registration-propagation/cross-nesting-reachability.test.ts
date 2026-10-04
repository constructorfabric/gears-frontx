/**
 * Cross-nesting reachability: registration propagation, escalation, and retraction.
 *
 * Builds a real 3-level `DefaultMfeRegistry` composition — shell -> child
 * registry (constructed synchronously inside its own hosting extension's
 * `mount()`, hosting its own domain) -> grandchild registry (constructed the
 * same way, one level deeper) — entirely through the public mount path
 * (`registerDomain` / `registerExtension` / `ExtensionMounter.mount`), the
 * same route the React slot takes. No new public method or config field is
 * used anywhere: the shell never learns of the grandchild directly, and
 * nesting composes purely through ambient mount-context bridge discovery
 * (`inst-adopt-ambient-bridge`) plus automatic registration propagation
 * (`cpt-frontx-algo-mfe-host-communication-registration-propagation`).
 *
 * Domain/action ids here are a mock notation, never the real GTS strings —
 * MFES-1 forbids `@gears-frontx/mfes` from carrying a type-format literal.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
// @internal — colocated-style direct import, consistent with the rest of
// this package's DefaultMfeRegistry test suite.
import { DefaultMfeRegistry } from '../../src/runtime/DefaultMfeRegistry';
import type { TypeSystemPlugin } from '../../src/type-substrate';
import type { ActionsChain, Extension, ExtensionDomain, MfeEntry } from '../../src/types';
import { MfeHandler, type MfeEntryLifecycle } from '../../src/handler/MfeHandler';
import { ChildMfeBridge } from '../../src/handler/ChildMfeBridge';
import { ParentMfeBridge } from '../../src/handler/ParentMfeBridge';
import { MfeBridgeFactoryDefault } from '../../src/bridge/MfeBridgeFactoryDefault';
import { ExtensionDomainImplementation } from '../../src/runtime/ExtensionDomainImplementation';
import { ExtensionDomainImplementationFactory } from '../../src/runtime/ExtensionDomainImplementationFactory';
import type { DomainContext } from '../../src/runtime/DomainContext';
import { ConcurrentMountStrategy } from '../../src/runtime/ConcurrentMountStrategy';
import type { ContainerHooks, ActionPayload } from '../../src/runtime/MountStrategy';
import { ActionHandler } from '../../src/mediator/ActionHandler';
import type { InboundBridgeLink } from '../../src/runtime/inbound-bridge-link';
import { ParentMfeBridgeImpl } from '../../src/bridge/ParentMfeBridgeImpl';
import { BridgeInactiveError } from '../../src/bridge/errors';
import { CROSS_HOP_PROTOCOL_VERSION } from '../../src/mediator/CrossHopRoute';
import type { CrossHopEnvelope } from '../../src/mediator/CrossHopRoute';

// Global symbol registry key mirrored from `inbound-bridge-link.ts`'s own
// `LINK_PROPERTY_KEY` — `Symbol.for(...)` guarantees this resolves to the
// exact same symbol, letting tests below read the link the production code
// attached to the bridge object without any new export. Test-file-local:
// production's own internal `LinkCarryingBridge` type stays unexported.
const LINK_PROPERTY_KEY = Symbol.for('@gears-frontx/mfes:inbound-bridge-link:1');

interface LinkCarryingBridge {
  [LINK_PROPERTY_KEY]?: InboundBridgeLink;
}

// ─── Mock-notation well-known action ids ───────────────────────────────────

const LOAD_EXT = 'mock.action.v1~load_ext.v1~';
const MOUNT_EXT = 'mock.action.v1~mount_ext.v1~';
const UNMOUNT_EXT = 'mock.action.v1~unmount_ext.v1~';
const ACTION_ROOT = 'mock.action.v1~action_root.v1~';
const ACTION_LEAF = 'mock.action.v1~action_leaf.v1~';
const ACTION_HANG = 'mock.action.v1~action_hang.v1~';
const ACTION_COLLIDE = 'mock.action.v1~action_collide.v1~';
const ACTION_UNRESOLVABLE = 'mock.action.v1~action_unresolvable.v1~';
const ACTION_ASYNC = 'mock.action.v1~action_async.v1~';
// AC5.4 (no double fallback): registered on D1 (registry1's own domain),
// throw synchronously / reject asynchronously respectively, and are never
// dispatched anywhere else in this file.
const ACTION_THROW_SYNC = 'mock.action.v1~action_throw_sync.v1~';
const ACTION_THROW_ASYNC = 'mock.action.v1~action_throw_async.v1~';
// The declared `fallback` target for both above — local to D1 (registry1),
// never crossing a further hop.
const ACTION_B_FALLBACK = 'mock.action.v1~action_b_fallback.v1~';
// Registered on D0 (registry0/shell's own domain) but never targeted by any
// chain in the AC5.4 tests — proves the delivering runtime (registry0)
// genuinely runs NOTHING of its own for a node it handed over, rather than
// merely "the specific declared fallback happened not to collide".
const ACTION_A_NEXT = 'mock.action.v1~action_a_next.v1~';
const ACTION_A_FALLBACK = 'mock.action.v1~action_a_fallback.v1~';
// AC5.2: succeeds locally at B (registry1, D1) — its declared `next` is
// what this file's AC5.2 test routes back UP the arrival edge to A.
const ACTION_B_PRIMARY = 'mock.action.v1~action_b_primary.v1~';
// Registered on D1 (registry1's own domain), handled locally there and
// never settling on its own — used to prove an ESCALATION registry1 already
// ACCEPTED (registry2 -> registry1) keeps executing there, untouched, when
// registry2's own link is revoked afterwards, distinct from `ACTION_HANG`
// above, which proves the same for the DOWNWARD forwarding-entry tier
// instead.
const ACTION_HANG_UP = 'mock.action.v1~action_hang_up.v1~';
// Registered on D1 (registry1's own domain) and handled locally there, but
// settling only when the test releases its gate — long enough for the
// extension that EMITTED the chain (child-ext, registered at registry0) to
// be torn down while the chain is mid-flight. Used to pin that a chain keeps
// executing in the registry that executes it regardless of whatever emitted
// it (`cpt-frontx-adr-action-dispatch-and-chaining`, MFES-8).
const ACTION_GATED = 'mock.action.v1~action_gated.v1~';
const ACTION_AFTER_GATE = 'mock.action.v1~action_after_gate.v1~';

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

// ─── Domain plumbing ─────────────────────────────────────────────────────

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

/** A ConcurrentMountStrategy-backed domain that can also register extra action handlers. */
class GenericDomainImpl extends ExtensionDomainImplementation {
  private readonly strategy: ConcurrentMountStrategy;

  constructor(ctx: DomainContext, extraHandlers: ReadonlyArray<[string, ActionHandler]>) {
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

/** An MfeHandler whose `load()` resolves to a lifecycle with an injectable, synchronous `mount()`. */
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
        // Synchronous body: anything constructed here — in particular a
        // further `DefaultMfeRegistry` — falls inside the ambient
        // mounting-bridge window (`inst-track-mounting-bridge`).
        this.onMount(bridge);
      },
      unmount: () => {},
    };
  }
}

function actionChain(type: string, target: string): ActionsChain {
  return { action: { type, target, payload: {} } };
}

// A `CrossHopEnvelope` for direct `InboundBridgeLink.escalate` calls in this
// suite — the escalation transport takes the versioned envelope (a version
// and the sub-chain), never a bare `ActionsChain`, matching how
// `DefaultMfeRegistry` hands one to `link.escalate`.
function crossHopEnvelope(type: string, target: string): CrossHopEnvelope {
  return {
    version: CROSS_HOP_PROTOCOL_VERSION,
    chain: { action: { type, target, payload: {} } },
  };
}

/**
 * Runs the registry mediator's internal recursion for `chain` and resolves
 * once this registry's own part has ended — after a hand-over is accepted,
 * that is before the far side executes it. The public `executeActionsChain`
 * returns nothing awaitable (`cpt-frontx-adr-mfe-runtime-public-surface`);
 * far-side effects are observed through counters a handler increments.
 */
function awaitChain(registry: DefaultMfeRegistry, chain: ActionsChain): Promise<void> {
  return (registry as unknown as { mediator: { executeChain(chain: ActionsChain): Promise<void> } })
    .mediator.executeChain(chain);
}

// ─── Topology ───────────────────────────────────────────────────────────────
//
// shell (registry0, domain D0) -> child-ext -> registry1 (domains D1, COLLIDE)
//   -> grandchild-ext -> registry2 (domain D2)
// shell also hosts sibling-ext -> registry1b (domain COLLIDE), an
// independent subtree whose advertisement for COLLIDE collides with
// registry1's.

const D0 = 'domain.shell.v1';
const D1 = 'domain.child.v1';
const D2 = 'domain.grandchild.v1';
const COLLIDE = 'domain.collide.v1';
const CHILD_EXT = 'ext.child.v1';
const GRANDCHILD_EXT = 'ext.grandchild.v1';
const SIBLING_EXT = 'ext.sibling.v1';
const CHILD_ENTRY = 'entry.child.v1';
const GRANDCHILD_ENTRY = 'entry.grandchild.v1';
const SIBLING_ENTRY = 'entry.sibling.v1';

interface Topology {
  registry0: DefaultMfeRegistry;
  registry1: DefaultMfeRegistry;
  registry2: DefaultMfeRegistry;
  registry1b: DefaultMfeRegistry;
  rootCounter: CallCounter;
  leafCounter: CallCounter;
  /**
   * Resolves the moment the never-settling ACTION_HANG_UP handler at the
   * ESCALATION target (D1, on registry1) is actually invoked — i.e. the
   * moment the escalating hop has been ACCEPTED and its node started.
   * Awaiting it is how a test reaches the accepted-but-incomplete state
   * deterministically, from real behaviour, rather than by flushing
   * microtasks and hoping.
   */
  hangUpStarted: Promise<void>;
  /** Counts settlements of the gated D1 node; see `ACTION_GATED`. */
  gatedCounter: { count: number };
  /** Counts the gated node's `next` continuation; see `ACTION_AFTER_GATE`. */
  afterGateCounter: { count: number };
  /** Resolves once the gated D1 handler has actually been entered. */
  gateReached: Promise<void>;
  /** Lets the gated D1 handler finish. */
  releaseGate: () => void;
  collideCounterA: { count: number };
  collideCounterB: { count: number };
  /** AC5.4: counts B's (registry1's) own local `fallback` dispatch. */
  bFallbackCounter: CallCounter;
  /** AC5.4: must stay 0 — A's (registry0's) own unrelated handlers. */
  aNextCounter: CallCounter;
  aFallbackCounter: CallCounter;
  errorSpy: ReturnType<typeof vi.spyOn>;
}

/**
 * An explicit settlement signal for a far-side effect a test cannot
 * `await` directly: the dispatching side's own part ends once it hands a
 * sub-chain over, before the far side executes it. Counter-based
 * rather than a single deferred, so a handler invoked more than once can
 * be awaited to a specific count — never a blind microtask flush or a
 * timer-based poll (mirrors the identical helper in the property suite).
 */
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

interface CallCounter {
  readonly count: number;
  increment(): void;
  waitFor(target: number): Promise<void>;
}

async function buildTopology(): Promise<Topology> {
  const entries = new Map<string, MfeEntry>([
    [CHILD_ENTRY, makeEntry(CHILD_ENTRY)],
    [GRANDCHILD_ENTRY, makeEntry(GRANDCHILD_ENTRY)],
    [SIBLING_ENTRY, makeEntry(SIBLING_ENTRY)],
  ]);
  const plugin = createMockPlugin(entries);
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  const rootCounter = makeCallCounter();
  const leafCounter = makeCallCounter();
  const gatedCounter = { count: 0 };
  const afterGateCounter = { count: 0 };
  const bFallbackCounter = makeCallCounter();
  const aNextCounter = makeCallCounter();
  const aFallbackCounter = makeCallCounter();
  let markGateReached!: () => void;
  const gateReached = new Promise<void>((resolve) => {
    markGateReached = resolve;
  });
  let releaseGate!: () => void;
  const gateReleased = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  let markHangUpStarted!: () => void;
  const hangUpStarted = new Promise<void>((resolve) => {
    markHangUpStarted = resolve;
  });
  const collideCounterA = { count: 0 };
  const collideCounterB = { count: 0 };

  let registry1!: DefaultMfeRegistry;
  let registry2!: DefaultMfeRegistry;
  let registry1b!: DefaultMfeRegistry;

  const childHandler = new InjectableMountHandler(CHILD_ENTRY, () => {
    // Synchronously construct the child registry inside child-ext's own
    // mount() body — this is the entire "adopt the ambient bridge" contract.
    registry1 = new DefaultMfeRegistry({
      typeSystem: plugin,
      mfeHandlers: [
        new InjectableMountHandler(GRANDCHILD_ENTRY, () => {
          registry2 = new DefaultMfeRegistry({ typeSystem: plugin });
          registry2.registerDomain(
            makeDomain(D2, [ACTION_LEAF, ACTION_HANG]),
            new GenericDomainFactory([
              [ACTION_LEAF, ActionHandler.fromFunction(async () => { leafCounter.increment(); })],
              // Never settles on its own — used to prove a forwarded
              // action already accepted here keeps executing, untouched,
              // when the route it arrived through is later retracted.
              [ACTION_HANG, ActionHandler.fromFunction(() => new Promise<void>(() => {}))],
            ])
          );
        }),
      ],
    });
    registry1.registerDomain(
      makeDomain(D1, [
        ACTION_HANG_UP,
        ACTION_GATED,
        ACTION_AFTER_GATE,
        ACTION_THROW_SYNC,
        ACTION_THROW_ASYNC,
        ACTION_B_FALLBACK,
        ACTION_B_PRIMARY,
      ]),
      new GenericDomainFactory([
        [ACTION_GATED, ActionHandler.fromFunction(async () => {
          markGateReached();
          await gateReleased;
          gatedCounter.count += 1;
        })],
        [ACTION_AFTER_GATE, ActionHandler.fromFunction(async () => { afterGateCounter.count += 1; })],
        // Never settles on its own — the escalation-side counterpart to
        // ACTION_HANG on D2 above, used to exercise a route retracted or
        // deactivated AFTER an escalated node was already accepted at its
        // authoritative target. Signals `hangUpStarted` first, so a test
        // can observe that the hop was ACCEPTED and its node started
        // before the route dies.
        [ACTION_HANG_UP, ActionHandler.fromFunction(() => {
          markHangUpStarted();
          return new Promise<void>(() => {});
        })],
        // AC5.4: fails at B (registry1) — synchronously and, in the other
        // variant, via a later rejection — so B's OWN dispatch of the
        // chain's declared `fallback` (`ACTION_B_FALLBACK`, local to D1)
        // is what must answer it, never a fallback A (registry0) runs.
        [ACTION_THROW_SYNC, ActionHandler.fromFunction(() => {
          throw new Error('AC5.4: synchronous handler failure at B');
        })],
        [ACTION_THROW_ASYNC, ActionHandler.fromFunction(async () => {
          throw new Error('AC5.4: asynchronous handler failure at B');
        })],
        [ACTION_B_FALLBACK, ActionHandler.fromFunction(async () => { bFallbackCounter.increment(); })],
        // AC5.2: succeeds locally at B; its declared `next` (ACTION_ROOT@D0)
        // is dispatched from B itself and routes back UP the arrival edge.
        [ACTION_B_PRIMARY, ActionHandler.fromFunction(async () => {})],
      ])
    );
    registry1.registerDomain(
      makeDomain(COLLIDE, [ACTION_COLLIDE]),
      new GenericDomainFactory([
        [ACTION_COLLIDE, ActionHandler.fromFunction(async () => { collideCounterA.count += 1; })],
      ])
    );
  });

  const siblingHandler = new InjectableMountHandler(SIBLING_ENTRY, () => {
    registry1b = new DefaultMfeRegistry({ typeSystem: plugin });
    registry1b.registerDomain(
      makeDomain(COLLIDE, [ACTION_COLLIDE]),
      new GenericDomainFactory([
        [ACTION_COLLIDE, ActionHandler.fromFunction(async () => { collideCounterB.count += 1; })],
      ])
    );
  });

  const registry0 = new DefaultMfeRegistry({
    typeSystem: plugin,
    mfeHandlers: [childHandler, siblingHandler],
  });

  registry0.registerDomain(
    makeDomain(D0, [ACTION_ROOT, ACTION_A_NEXT, ACTION_A_FALLBACK]),
    new GenericDomainFactory([
      [ACTION_ROOT, ActionHandler.fromFunction(async () => { rootCounter.increment(); })],
      // AC5.4: registered and reachable from A (registry0), but never
      // targeted by any chain in the AC5.4 tests — must stay at 0.
      [ACTION_A_NEXT, ActionHandler.fromFunction(async () => { aNextCounter.increment(); })],
      [ACTION_A_FALLBACK, ActionHandler.fromFunction(async () => { aFallbackCounter.increment(); })],
    ])
  );

  // ── Level 1: mount child-ext -> constructs registry1, advertises D1 + COLLIDE (first) ──
  await registry0.registerExtension(makeExtension(CHILD_EXT, D0, CHILD_ENTRY));
  const mounter0 = registry0.getMounter(D0);
  mounter0.attach(document.createElement('div'));
  await mounter0.mount(CHILD_EXT, document.createElement('div'));

  // ── Level 2: mount grandchild-ext inside registry1 -> constructs registry2, advertises D2 ──
  await registry1.registerExtension(makeExtension(GRANDCHILD_EXT, D1, GRANDCHILD_ENTRY));
  const mounter1 = registry1.getMounter(D1);
  mounter1.attach(document.createElement('div'));
  await mounter1.mount(GRANDCHILD_EXT, document.createElement('div'));

  // ── Independent sibling subtree: mounts alongside child-ext, collides on COLLIDE ──
  await registry0.registerExtension(makeExtension(SIBLING_EXT, D0, SIBLING_ENTRY));
  await mounter0.mount(SIBLING_EXT, document.createElement('div'));

  return {
    registry0,
    registry1,
    registry2,
    registry1b,
    rootCounter,
    leafCounter,
    hangUpStarted,
    gatedCounter,
    afterGateCounter,
    gateReached,
    releaseGate,
    collideCounterA,
    collideCounterB,
    bFallbackCounter,
    aNextCounter,
    aFallbackCounter,
    errorSpy,
  };
}

describe('Cross-nesting reachability: registration propagation, escalation, retraction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(a) shell-to-grandchild dispatch succeeds via propagated forwarding entries', async () => {
    const { registry0, leafCounter } = await buildTopology();

    void awaitChain(registry0, actionChain(ACTION_LEAF, D2));

    await leafCounter.waitFor(1);
    expect(leafCounter.count).toBe(1);
  });

  it('(b) grandchild-to-shell dispatch succeeds via escalation', async () => {
    const { registry2, rootCounter } = await buildTopology();

    void awaitChain(registry2, actionChain(ACTION_ROOT, D0));

    await rootCounter.waitFor(1);
    expect(rootCounter.count).toBe(1);
  });

  it('(c) a target-id collision between two independent subtrees is rejected: the ancestor keeps routing to the first-registered target', async () => {
    const { registry0, registry1b, collideCounterA, collideCounterB, errorSpy } =
      await buildTopology();

    // The collision was logged during topology construction (sibling-ext's
    // mount, which advertises COLLIDE second).
    expect(registry1b).toBeDefined();
    const collisionLog = errorSpy.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('Advertisement collision')
    );
    expect(collisionLog).toBeDefined();

    // Shell keeps routing COLLIDE to the FIRST-registered target (registry1) —
    // registry1b's own local domain of the same id is never reachable
    // through the shell.
    await awaitChain(registry0, actionChain(ACTION_COLLIDE, COLLIDE));
    expect(collideCounterA.count).toBe(1);
    expect(collideCounterB.count).toBe(0);
  });

  it(
    '(d) disposing the child subtree retracts its advertisements from the shell, without touching a ' +
      "sub-chain the far side already accepted: the SHELL's own part ends at the hand-over, and a " +
      'LATER dispatch to the retracted target finds no route, so its fallback runs',
    async () => {
      const { registry0, registry1, rootCounter } = await buildTopology();

      // Hand a sub-chain whose handler never settles down through the
      // forwarding entry: the shell's own part ends once registry1 accepts.
      await awaitChain(registry0, actionChain(ACTION_HANG, D2));

      // Dispose registry1 — the accepted sub-chain is untouched: retraction
      // acts on the route only.
      registry1.dispose();

      // After retraction the shell holds no forwarding entry for D2.
      const forwardingEntries = (registry0 as unknown as { forwardingEntries: Map<string, unknown> })
        .forwardingEntries;
      expect(forwardingEntries.has(D2)).toBe(false);

      // A later dispatch finds no route: the action fails and its fallback runs.
      await awaitChain(registry0, {
        action: { type: ACTION_LEAF, target: D2, payload: {} },
        fallback: actionChain(ACTION_ROOT, D0),
      });
      expect(rootCounter.count).toBe(1);
    }
  );

  it('(e) the child-facing bridge surfaces are exactly 4 methods + 2 identity properties on ChildMfeBridge, and exactly 2 members on ParentMfeBridge', () => {
    // Exact key-set equality (not mere assignability) at compile time: if a
    // member is ever added to or removed from either abstract class, one of
    // these two type assignments fails to typecheck (`npm run type-check:test`,
    // CI-gated), catching MFES-6 surface growth that a runtime check alone
    // (abstract methods have no runtime footprint — see below) cannot.
    type Equals<X, Y> =
      (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;

    type ChildMfeBridgeKeys = keyof ChildMfeBridge;
    type ExpectedChildKeys =
      | 'extDomainId'
      | 'extensionId'
      | 'executeActionsChain'
      | 'subscribeToProperty'
      | 'getProperty'
      | 'registerActionHandler';
    const _childKeysExact: Equals<ChildMfeBridgeKeys, ExpectedChildKeys> = true;

    type ParentMfeBridgeKeys = keyof ParentMfeBridge;
    type ExpectedParentKeys = 'instanceId' | 'dispose';
    const _parentKeysExact: Equals<ParentMfeBridgeKeys, ExpectedParentKeys> = true;

    void _childKeysExact;
    void _parentKeysExact;

    // Runtime companion: abstract methods without a body compile to NO
    // prototype entry at all (only 'constructor' survives), so the abstract
    // classes' prototypes carry zero method implementations of their own —
    // confirming nothing was ever demoted from abstract to a concrete
    // default on either class.
    expect(Object.getOwnPropertyNames(ChildMfeBridge.prototype)).toEqual(['constructor']);
    expect(Object.getOwnPropertyNames(ParentMfeBridge.prototype)).toEqual(['constructor']);
  });

  it('(f) arrival-edge exclusion actually changes the outcome: registry1 never ping-pongs an escalated-from-registry2 dispatch back down through the same bridge', async () => {
    const { registry2, rootCounter } = await buildTopology();

    // registry2 has no handler for ACTION_UNRESOLVABLE on D2, so it
    // escalates, tagging its inbound bridge as the arrival edge. registry1
    // holds a forwarding entry for D2 pointing back down through that same
    // bridge; without arrival-edge exclusion it would hand the action
    // straight back to registry2. Spy on registry2's receiving side to prove
    // that never happens.
    const registry2ReceiveSpy = vi.spyOn(
      registry2 as unknown as { receiveCrossHopNode(envelope: CrossHopEnvelope): void },
      'receiveCrossHopNode'
    );

    // The action continues escalating to the shell, finds no handler there,
    // and the shell executes the chain's `fallback` — the synchronisation
    // point for this test.
    registry2.executeActionsChain({
      action: { type: ACTION_UNRESOLVABLE, target: D2, payload: {} },
      fallback: actionChain(ACTION_ROOT, D0),
    });

    await rootCounter.waitFor(1);
    expect(registry2ReceiveSpy).not.toHaveBeenCalled();
  });

  it('(f2) a chain\'s fallback fires when its primary action fails purely through cross-hop escalation, not just on a local failure', async () => {
    const { registry2, rootCounter } = await buildTopology();

    // Primary action is unresolvable anywhere (same as test (f)), forcing
    // registry2 to escalate all the way to the shell and fail there with no
    // handler; the shell executes the chain's `fallback`, so `rootCounter`
    // is incremented even though the primary action never ran anywhere.
    const chain: ActionsChain = {
      action: { type: ACTION_UNRESOLVABLE, target: D2, payload: {} },
      fallback: actionChain(ACTION_ROOT, D0),
    };

    void awaitChain(registry2, chain);

    await rootCounter.waitFor(1);
    expect(rootCounter.count).toBe(1);
  });

  it('(f3) a chain\'s fallback fires when its primary action fails purely through downward forwarding-entry delivery, not just on a local failure', async () => {
    const { registry0, leafCounter, rootCounter } = await buildTopology();

    // Dispatched FROM the shell, targeting D2 (registry2's own local domain)
    // with an action type D2 does not handle — this resolves via the
    // downward forwarding-entry tier (test (a)'s route), not escalation. The
    // action fails where it is executed, and that registry executes the
    // `fallback`.
    const chain: ActionsChain = {
      action: { type: ACTION_UNRESOLVABLE, target: D2, payload: {} },
      fallback: actionChain(ACTION_ROOT, D0),
    };

    // Handing the sub-chain down to registry2 ends the SHELL's own part: the
    // shell never observes registry2's failure or the fallback registry2
    // executes (escalating back up to reach D0). Observed through the
    // terminal effects.
    void awaitChain(registry0, chain);

    await rootCounter.waitFor(1);
    expect(rootCounter.count).toBe(1);
    expect(leafCounter.count).toBe(0);
  });

  it(
    '(f4) AC5.4 — after A (registry0) hands a node to B (registry1) and B\'s handler throws ' +
      'SYNCHRONOUSLY, B\'s own declared `fallback` runs exactly once, and A never runs anything of its ' +
      'own for this node (no double fallback)',
    async () => {
      const { registry0, bFallbackCounter, aNextCounter, aFallbackCounter } = await buildTopology();

      const chain: ActionsChain = {
        action: { type: ACTION_THROW_SYNC, target: D1, payload: {} },
        next: actionChain(ACTION_A_NEXT, D0),
        fallback: actionChain(ACTION_B_FALLBACK, D1),
      };

      // registry0's own part ends once B accepts the hand-over — it never
      // observes B's handler throwing, nor B executing the fallback.
      await awaitChain(registry0, chain);

      await bFallbackCounter.waitFor(1);
      expect(bFallbackCounter.count).toBe(1);
      // A's OWN next/fallback handlers — reachable from A, but never the
      // target of anything this chain does — never ran: A genuinely did
      // nothing of its own for this node after handing it over.
      expect(aNextCounter.count).toBe(0);
      expect(aFallbackCounter.count).toBe(0);
    }
  );

  it(
    '(f5) AC5.4 — after A (registry0) hands a node to B (registry1) and B\'s handler REJECTS later ' +
      '(asynchronously), B\'s own declared `fallback` runs exactly once, and A never runs anything of ' +
      'its own for this node (no double fallback)',
    async () => {
      const { registry0, bFallbackCounter, aNextCounter, aFallbackCounter } = await buildTopology();

      const chain: ActionsChain = {
        action: { type: ACTION_THROW_ASYNC, target: D1, payload: {} },
        next: actionChain(ACTION_A_NEXT, D0),
        fallback: actionChain(ACTION_B_FALLBACK, D1),
      };

      await awaitChain(registry0, chain);

      await bFallbackCounter.waitFor(1);
      expect(bFallbackCounter.count).toBe(1);
      expect(aNextCounter.count).toBe(0);
      expect(aFallbackCounter.count).toBe(0);
    }
  );

  it(
    '(f6) AC5.2 — a node handed DOWN to B (registry1) whose declared `next` targets A\'s own domain ' +
      '(D0, back UP the arrival edge B received the node on) is dispatched from B itself and executes ' +
      'at A, never subject to the arrival-edge exclusion that governs re-routing the ORIGINAL action',
    async () => {
      const { registry0, rootCounter } = await buildTopology();

      const chain: ActionsChain = {
        action: { type: ACTION_B_PRIMARY, target: D1, payload: {} },
        next: actionChain(ACTION_ROOT, D0),
      };

      // A's own part ends once B accepts the hand-over; B executes
      // ACTION_B_PRIMARY, succeeds, and executes `next` itself — routed
      // through B's own resolution tiers, which escalate back up through the
      // very bridge the action arrived on (a continuation is not subject to
      // arrival-edge exclusion, `inst-dispatch-continuation`) — reaching A's
      // ACTION_ROOT.
      await awaitChain(registry0, chain);

      await rootCounter.waitFor(1);
      expect(rootCounter.count).toBe(1);
    }
  );

  it('(g) an async mount() still closes the ambient window at its synchronous prefix: a registry built there before the first await still adopts the correct inbound bridge', async () => {
    const ASYNC_ENTRY = 'entry.async-child.v1';
    const ASYNC_EXT = 'ext.async-child.v1';
    const D_ASYNC = 'domain.async-child.v1';

    const entries = new Map<string, MfeEntry>([[ASYNC_ENTRY, makeEntry(ASYNC_ENTRY)]]);
    const plugin = createMockPlugin(entries);
    const counter = { count: 0 };
    let asyncReached: () => void = () => {};

    let asyncChildRegistry!: DefaultMfeRegistry;

    /** Same ambient-adoption contract as `InjectableMountHandler`, but `mount()`
     * is itself `async` and awaits past its own synchronous prefix — proving
     * the ambient window closes at the synchronous prefix's end (when the
     * call returns its pending promise), not at the promise's eventual
     * settlement. */
    class AsyncInjectableMountHandler extends MfeHandler {
      readonly bridgeFactory = new MfeBridgeFactoryDefault();

      constructor(
        entryBaseTypeId: string,
        private readonly onMount: (bridge: ChildMfeBridge) => void
      ) {
        super(entryBaseTypeId);
      }

      async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
        return {
          mount: async (_container, bridge) => {
            // Synchronous prefix of this async function body: still inside
            // the ambient mounting-bridge window, exactly like a sync mount().
            this.onMount(bridge);
            // Yield past the point where `pushAmbientMountingBridge`'s window
            // already closed (immediately after this call synchronously
            // returned its pending promise to `DefaultMountManager`).
            await Promise.resolve();
          },
          unmount: async () => {},
        };
      }
    }

    const asyncHandler = new AsyncInjectableMountHandler(ASYNC_ENTRY, (bridge) => {
      void bridge;
      asyncChildRegistry = new DefaultMfeRegistry({ typeSystem: plugin });
      asyncChildRegistry.registerDomain(
        makeDomain(D_ASYNC, [ACTION_ASYNC]),
        new GenericDomainFactory([
          [ACTION_ASYNC, ActionHandler.fromFunction(async () => { counter.count += 1; asyncReached(); })],
        ])
      );
    });

    const registry0 = new DefaultMfeRegistry({
      typeSystem: plugin,
      mfeHandlers: [asyncHandler],
    });
    registry0.registerDomain(makeDomain(D0), new GenericDomainFactory());

    await registry0.registerExtension(makeExtension(ASYNC_EXT, D0, ASYNC_ENTRY));
    const mounter0 = registry0.getMounter(D0);
    mounter0.attach(document.createElement('div'));
    // `mount()`'s own synchronous prefix — where `onMount` constructs
    // `asyncChildRegistry` and calls `registerDomain` (which propagates the
    // domain's advertisement upward synchronously, per
    // `inst-compose-advertisement`) — runs before `mount()`'s own first
    // `await`, still inside the ambient mounting-bridge window. Awaiting the
    // extension's own `load()` (also async) first is required before that
    // synchronous prefix runs at all, so the earliest externally-observable
    // checkpoint is after the whole mount settles.
    await mounter0.mount(ASYNC_EXT, document.createElement('div'));

    expect(asyncChildRegistry).toBeDefined();

    // Reachability proves the ambient window closed correctly and
    // `asyncChildRegistry` adopted the right inbound bridge: if it hadn't
    // (e.g. adopted no bridge, or the wrong one), this dispatch from the
    // shell down into `asyncChildRegistry`'s own domain would fail to
    // resolve a handler.
    const reached = new Promise<void>((resolve) => {
      asyncReached = resolve;
    });
    void awaitChain(registry0, actionChain(ACTION_ASYNC, D_ASYNC));
    await reached;
    expect(counter.count).toBe(1);
  });

  it('(h) unmounting the child extension deactivates its bridge: a shell-to-descendant hand-over is refused as inactive, not as missing a handler', async () => {
    const { registry0, rootCounter } = await buildTopology();

    // Unmount child-ext directly through the shell's own mounter, WITHOUT
    // ever calling registry1.dispose() — an ordinary unmount deactivates the
    // bridge rather than retracting the advertisements propagated through
    // it (`inst-bridge-deactivation`); registry1's forwarding entries at the
    // shell (D1, and D2 re-propagated through it) stay recorded.
    const mounter0 = registry0.getMounter(D0);
    await mounter0.unmount(CHILD_EXT);

    // The dispatch still resolves the forwarding entry for D2, but the
    // hand-over through the now-inactive bridge is refused. Spy on
    // `ParentMfeBridgeImpl.sendCrossHopEnvelope` — the call `sendDown` makes
    // through the forwarding entry's bridge — to inspect the refusal.
    const sendSpy = vi.spyOn(ParentMfeBridgeImpl.prototype, 'sendCrossHopEnvelope');
    await awaitChain(registry0, {
      action: { type: ACTION_LEAF, target: D2, payload: {} },
      fallback: actionChain(ACTION_ROOT, D0),
    });

    // Outcome-level check: the action failed, so its fallback ran.
    expect(rootCounter.count).toBe(1);

    // Mechanism-level check: the forwarding entry for D2 WAS resolved and
    // reached the bridge (not a no-route failure), and the bridge refused
    // the hand-over at the call because it is inactive.
    expect(sendSpy).toHaveBeenCalled();
    const lastCall = sendSpy.mock.results[sendSpy.mock.results.length - 1];
    expect(lastCall.type).toBe('throw');
    expect(lastCall.value).toBeInstanceOf(BridgeInactiveError);

    sendSpy.mockRestore();
  });

  it('(i) a mount failure deactivates the acquired bridge rather than retracting what a nested registry advertised before the failure', async () => {
    const FAIL_ENTRY = 'entry.fail-child.v1';
    const FAIL_EXT = 'ext.fail-child.v1';
    const D_FAIL = 'domain.fail-child.v1';
    const ACTION_FAIL_LEAF = 'mock.action.v1~action_fail_leaf.v1~';

    const entries = new Map<string, MfeEntry>([[FAIL_ENTRY, makeEntry(FAIL_ENTRY)]]);
    const plugin = createMockPlugin(entries);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const leafCounter = makeCallCounter();

    let registryFail: DefaultMfeRegistry | undefined;

    class FailingMountHandler extends MfeHandler {
      readonly bridgeFactory = new MfeBridgeFactoryDefault();

      async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
        return {
          mount: (_container, bridge) => {
            void bridge;
            // Synchronously construct a nested registry and admit a domain
            // — advertising D_FAIL upward — THEN throw, simulating a mount
            // that fails after partially wiring itself up.
            registryFail = new DefaultMfeRegistry({ typeSystem: plugin });
            registryFail.registerDomain(
              makeDomain(D_FAIL, [ACTION_FAIL_LEAF]),
              new GenericDomainFactory([
                [ACTION_FAIL_LEAF, ActionHandler.fromFunction(async () => { leafCounter.increment(); })],
              ])
            );
            throw new Error('mount failed after advertising D_FAIL');
          },
          unmount: () => {},
        };
      }
    }

    const registry0 = new DefaultMfeRegistry({
      typeSystem: plugin,
      mfeHandlers: [new FailingMountHandler(FAIL_ENTRY)],
    });
    registry0.registerDomain(makeDomain(D0), new GenericDomainFactory());

    await registry0.registerExtension(makeExtension(FAIL_EXT, D0, FAIL_ENTRY));
    const mounter0 = registry0.getMounter(D0);
    mounter0.attach(document.createElement('div'));

    await expect(mounter0.mount(FAIL_EXT, document.createElement('div'))).rejects.toThrow(
      'mount failed after advertising D_FAIL'
    );
    expect(registryFail).toBeDefined();

    // The mount-failure path deactivates the acquired bridge rather than
    // retracting D_FAIL's advertisement — the forwarding entry the nested
    // registry advertised before the failure stays recorded at the shell,
    // but the hand-over through the now-inactive bridge is refused, so the
    // handler this test guards is never invoked. As in test (h), spy on
    // `ParentMfeBridgeImpl.sendCrossHopEnvelope` to inspect the refusal.
    const sendSpy = vi.spyOn(ParentMfeBridgeImpl.prototype, 'sendCrossHopEnvelope');
    await awaitChain(registry0, actionChain(ACTION_FAIL_LEAF, D_FAIL));

    // The forwarding entry for D_FAIL WAS resolved and reached the bridge
    // (not a no-route failure), and the bridge refused the hand-over at the
    // call because it is inactive.
    expect(sendSpy).toHaveBeenCalled();
    const lastCall = sendSpy.mock.results[sendSpy.mock.results.length - 1];
    expect(lastCall.type).toBe('throw');
    expect(lastCall.value).toBeInstanceOf(BridgeInactiveError);
    expect(leafCounter.count).toBe(0);

    vi.restoreAllMocks();
  });

  it('(j) a single nested registry keeps its already-adopted live link across an unmount and remount — no re-link needed — and continues to advertise every target it holds', async () => {
    const REUSE_ENTRY = 'entry.reuse-child.v1';
    const REUSE_EXT = 'ext.reuse-child.v1';
    const D_REUSE = 'domain.reuse-child.v1';
    const ACTION_REUSE_LEAF = 'mock.action.v1~action_reuse_leaf.v1~';

    const entries = new Map<string, MfeEntry>([[REUSE_ENTRY, makeEntry(REUSE_ENTRY)]]);
    const plugin = createMockPlugin(entries);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reuseCounter = makeCallCounter();

    // Constructed exactly once, the very first time `mount()` runs. The link
    // it adopts at that first mount is
    // minted once, for the whole registration lifetime of its host
    // extension, and stays live across every subsequent mount/unmount cycle
    // of that same extension — so it needs no re-link from the parent.
    let reusedRegistry: DefaultMfeRegistry | undefined;

    const reuseHandler = new InjectableMountHandler(REUSE_ENTRY, () => {
      if (!reusedRegistry) {
        // First mount: constructed synchronously inside mount()'s own body,
        // so it legitimately adopts the ambient bridge (`inst-adopt-ambient-bridge`).
        reusedRegistry = new DefaultMfeRegistry({ typeSystem: plugin });
        reusedRegistry.registerDomain(
          makeDomain(D_REUSE, [ACTION_REUSE_LEAF]),
          new GenericDomainFactory([
            [ACTION_REUSE_LEAF, ActionHandler.fromFunction(async () => { reuseCounter.increment(); })],
          ])
        );
      }
      // Remount: the SAME registry instance serves the extension — no
      // further ambient-bridge adoption happens for it; reachability is
      // unaffected, since the link it adopted at first mount is still the
      // registry's own current link.
    });

    const registry0 = new DefaultMfeRegistry({
      typeSystem: plugin,
      mfeHandlers: [reuseHandler],
    });
    registry0.registerDomain(makeDomain(D0), new GenericDomainFactory());

    await registry0.registerExtension(makeExtension(REUSE_EXT, D0, REUSE_ENTRY));
    const mounter0 = registry0.getMounter(D0);
    mounter0.attach(document.createElement('div'));

    // ── First mount: reusedRegistry is constructed in the window and
    // linked — the shell can reach its domain. ──
    await mounter0.mount(REUSE_EXT, document.createElement('div'));
    expect(reusedRegistry).toBeDefined();

    // Handing the sub-chain down to `reusedRegistry` ends registry0's own
    // part; observed through the terminal effect.
    void awaitChain(registry0, actionChain(ACTION_REUSE_LEAF, D_REUSE));
    await reuseCounter.waitFor(1);
    expect(reuseCounter.count).toBe(1);

    // ── Unmount: the parent (registry0) only DEACTIVATES the bridge — the
    // forwarding entry for D_REUSE, and reusedRegistry's own adopted link,
    // both stay exactly as they were (`inst-bridge-deactivation`). ──
    await mounter0.unmount(REUSE_EXT);

    // ── Remount: reuseHandler's mount() body constructs nothing; the
    // registry's link was never revoked, so it is still the SAME live link,
    // active again together with the bridge it is attached to. ──
    await mounter0.mount(REUSE_EXT, document.createElement('div'));

    // The shell still reaches D_REUSE: the registry's advertisement for it
    // was never retracted, so nothing needs to be re-propagated, with no
    // action required from the microfrontend author.
    void awaitChain(registry0, actionChain(ACTION_REUSE_LEAF, D_REUSE));
    await reuseCounter.waitFor(2);
    expect(reuseCounter.count).toBe(2);

    vi.restoreAllMocks();
  });

  it('(k) after unmount + remount, a shell-to-descendant dispatch succeeds through the SAME, reactivated bridge pair', async () => {
    const REUSE_ENTRY = 'entry.reuse-child2.v1';
    const REUSE_EXT = 'ext.reuse-child2.v1';
    const D_REUSE = 'domain.reuse-child2.v1';
    const ACTION_REUSE_LEAF = 'mock.action.v1~action_reuse_leaf2.v1~';

    const entries = new Map<string, MfeEntry>([[REUSE_ENTRY, makeEntry(REUSE_ENTRY)]]);
    const plugin = createMockPlugin(entries);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reuseCounter = makeCallCounter();

    let reusedRegistry: DefaultMfeRegistry | undefined;
    // The bridge instance handed to `mount()` on each mount cycle — the SAME
    // pair (by reference) every time: minted once at first mount and
    // reactivated (not recreated) on every subsequent mount, per
    // `DefaultMountManager.mountExtension` / `RuntimeBridgeFactory.acquireBridge`.
    const bridges: ChildMfeBridge[] = [];

    const reuseHandler = new InjectableMountHandler(REUSE_ENTRY, (bridge) => {
      bridges.push(bridge);
      if (!reusedRegistry) {
        reusedRegistry = new DefaultMfeRegistry({ typeSystem: plugin });
        reusedRegistry.registerDomain(
          makeDomain(D_REUSE, [ACTION_REUSE_LEAF]),
          new GenericDomainFactory([
            [ACTION_REUSE_LEAF, ActionHandler.fromFunction(async () => { reuseCounter.increment(); })],
          ])
        );
      }
    });

    const registry0 = new DefaultMfeRegistry({
      typeSystem: plugin,
      mfeHandlers: [reuseHandler],
    });
    registry0.registerDomain(makeDomain(D0), new GenericDomainFactory());

    await registry0.registerExtension(makeExtension(REUSE_EXT, D0, REUSE_ENTRY));
    const mounter0 = registry0.getMounter(D0);
    mounter0.attach(document.createElement('div'));

    await mounter0.mount(REUSE_EXT, document.createElement('div'));
    await mounter0.unmount(REUSE_EXT);
    // The first mount's bridge pair is only DEACTIVATED by
    // `DefaultMountManager.unmountExtension` (`bridgeFactory.deactivateBridge`)
    // at this point — not destroyed. The remount below reactivates that same
    // pair; the shell's forwarding entry for D_REUSE, recorded against that
    // same bridge object, was never retracted by an ordinary unmount, so
    // dispatch resumes without any re-linking.
    await mounter0.mount(REUSE_EXT, document.createElement('div'));

    expect(bridges).toHaveLength(2);
    expect(bridges[0]).toBe(bridges[1]);

    // Handing the sub-chain down ends registry0's own part; observed
    // through the terminal effect.
    void awaitChain(registry0, actionChain(ACTION_REUSE_LEAF, D_REUSE));

    await reuseCounter.waitFor(1);
    expect(reuseCounter.count).toBe(1);

    vi.restoreAllMocks();
  });

  it('(l) permanent unregistration revokes the link: propagate/retract/escalate on a retained reference never reach ancestor state or the disposed bridge', async () => {
    const REVOKE_ENTRY = 'entry.revoke-child.v1';
    const REVOKE_EXT = 'ext.revoke-child.v1';
    const OTHER_TARGET = 'domain.revoke-other-target.v1';
    const ACTION_OTHER = 'mock.action.v1~action_revoke_other.v1~';

    const entries = new Map<string, MfeEntry>([[REVOKE_ENTRY, makeEntry(REVOKE_ENTRY)]]);
    const plugin = createMockPlugin(entries);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let capturedBridge: ChildMfeBridge | undefined;

    const revokeHandler = new InjectableMountHandler(REVOKE_ENTRY, (bridge) => {
      capturedBridge = bridge;
    });

    const registry0 = new DefaultMfeRegistry({
      typeSystem: plugin,
      mfeHandlers: [revokeHandler],
    });
    registry0.registerDomain(makeDomain(D0), new GenericDomainFactory());

    await registry0.registerExtension(makeExtension(REVOKE_EXT, D0, REVOKE_ENTRY));
    const mounter0 = registry0.getMounter(D0);
    mounter0.attach(document.createElement('div'));
    await mounter0.mount(REVOKE_EXT, document.createElement('div'));

    expect(capturedBridge).toBeDefined();
    const link = (capturedBridge as unknown as LinkCarryingBridge)[LINK_PROPERTY_KEY]!;
    expect(link).toBeDefined();

    // Revoke the link via the host extension's PERMANENT unregistration —
    // no registry ever adopted it in this test, so this exercises pure
    // revocation. An ordinary unmount would only deactivate the bridge and
    // leave the link live (test (l2) below).
    await registry0.unregisterExtension(REVOKE_EXT);

    errorSpy.mockClear();

    // A retained reference to the now-revoked link must refuse to act.
    const accepted: boolean = link.propagateAdvertisement(OTHER_TARGET);
    expect(accepted).toBe(false);

    expect(() => link.retractAdvertisement(OTHER_TARGET)).not.toThrow();

    expect(() => link.escalate(crossHopEnvelope(ACTION_OTHER, OTHER_TARGET))).toThrow(/revoked/);

    // No ancestor state was acquired by the rejected propagate call above.
    const forwardingEntries = (registry0 as unknown as { forwardingEntries: Map<string, unknown> })
      .forwardingEntries;
    expect(forwardingEntries.has(OTHER_TARGET)).toBe(false);

    vi.restoreAllMocks();
  });

  it('(l2) ordinary unmount does NOT revoke the link: advertisements stay propagated and dispatch rejects as inactive, not revoked', async () => {
    const UNMOUNT_ONLY_ENTRY = 'entry.unmount-only-child.v1';
    const UNMOUNT_ONLY_EXT = 'ext.unmount-only-child.v1';

    const entries = new Map<string, MfeEntry>([[UNMOUNT_ONLY_ENTRY, makeEntry(UNMOUNT_ONLY_ENTRY)]]);
    const plugin = createMockPlugin(entries);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    let capturedBridge: ChildMfeBridge | undefined;

    const handler = new InjectableMountHandler(UNMOUNT_ONLY_ENTRY, (bridge) => {
      capturedBridge = bridge;
    });

    const registry0 = new DefaultMfeRegistry({
      typeSystem: plugin,
      mfeHandlers: [handler],
    });
    registry0.registerDomain(makeDomain(D0), new GenericDomainFactory());

    await registry0.registerExtension(makeExtension(UNMOUNT_ONLY_EXT, D0, UNMOUNT_ONLY_ENTRY));
    const mounter0 = registry0.getMounter(D0);
    mounter0.attach(document.createElement('div'));
    await mounter0.mount(UNMOUNT_ONLY_EXT, document.createElement('div'));

    expect(capturedBridge).toBeDefined();
    const link = (capturedBridge as unknown as LinkCarryingBridge)[LINK_PROPERTY_KEY]!;
    expect(link).toBeDefined();

    // Ordinary unmount — NOT permanent unregistration.
    await mounter0.unmount(UNMOUNT_ONLY_EXT);

    // The link is still live: it keeps refusing to act only for the reason
    // that its bridge is now inactive, never because it was revoked.
    const accepted: boolean = link.propagateAdvertisement('domain.does-not-matter.v1');
    expect(accepted).toBe(true);

    expect(() =>
      link.escalate(crossHopEnvelope('mock.action.v1~irrelevant.v1~', 'domain.irrelevant.v1'))
    ).toThrow(/inactive/);

    vi.restoreAllMocks();
  });

  it('(m) a fresh claim made in a mount window supersedes the adopters recorded for the extension, which are left unlinked (inst-relink-repropagate)', async () => {
    const FRESH_ENTRY = 'entry.fresh-child.v1';
    const FRESH_EXT = 'ext.fresh-child.v1';
    const D_FRESH = 'domain.fresh-child.v1';
    const ACTION_FRESH_LEAF = 'mock.action.v1~action_fresh_leaf.v1~';

    const entries = new Map<string, MfeEntry>([[FRESH_ENTRY, makeEntry(FRESH_ENTRY)]]);
    const plugin = createMockPlugin(entries);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const counters = [makeCallCounter(), makeCallCounter()];
    const rootCounter = makeCallCounter();

    const registries: DefaultMfeRegistry[] = [];

    const freshHandler = new InjectableMountHandler(FRESH_ENTRY, () => {
      // Each `mount()` call constructs a registry inside its window, so each
      // window produces a fresh claim.
      const index = registries.length;
      const registry = new DefaultMfeRegistry({ typeSystem: plugin });
      registry.registerDomain(
        makeDomain(D_FRESH, [ACTION_FRESH_LEAF]),
        new GenericDomainFactory([
          [ACTION_FRESH_LEAF, ActionHandler.fromFunction(async () => { counters[index].increment(); })],
        ])
      );
      registries.push(registry);
    });

    const registry0 = new DefaultMfeRegistry({
      typeSystem: plugin,
      mfeHandlers: [freshHandler],
    });
    registry0.registerDomain(
      makeDomain(D0, [ACTION_ROOT]),
      new GenericDomainFactory([
        [ACTION_ROOT, ActionHandler.fromFunction(async () => { rootCounter.increment(); })],
      ])
    );

    await registry0.registerExtension(makeExtension(FRESH_EXT, D0, FRESH_ENTRY));
    const mounter0 = registry0.getMounter(D0);
    mounter0.attach(document.createElement('div'));

    await mounter0.mount(FRESH_EXT, document.createElement('div'));
    await mounter0.unmount(FRESH_EXT);
    await mounter0.mount(FRESH_EXT, document.createElement('div'));

    expect(registries).toHaveLength(2);
    const [firstRegistry, secondRegistry] = registries;

    // Shell reaches the SECOND (current) registry's domain; observed through
    // the terminal effect.
    void awaitChain(registry0, actionChain(ACTION_FRESH_LEAF, D_FRESH));
    await counters[1].waitFor(1);
    expect(counters[1].count).toBe(1);
    expect(counters[0].count).toBe(0);

    // The SECOND registry genuinely holds the current link and can escalate
    // up to the shell.
    void awaitChain(secondRegistry, actionChain(ACTION_ROOT, D0));
    await rootCounter.waitFor(1);
    expect(rootCounter.count).toBe(1);

    // The FIRST registry was unlinked when the SECOND registry's
    // construction, inside the second mount's ambient window, produced a
    // fresh claim on the extension's still-live link: that fresh claim
    // supersedes the claim the first registry holds
    // (`inst-relink-repropagate`'s supersession clause), NOT an
    // unmount-triggered revocation — an ordinary unmount never revokes the
    // link at all (test (l2)). Proven here by escalating directly FROM
    // `firstRegistry`, which has no local handler for the shell's own
    // action: with a working link it would hand the action over to
    // `registry0`; unlinked, no route resolves, the action fails, and
    // `firstRegistry` executes the fallback on its own local domain.
    await awaitChain(firstRegistry, {
      action: { type: ACTION_ROOT, target: D0, payload: {} },
      fallback: actionChain(ACTION_FRESH_LEAF, D_FRESH),
    });
    expect(counters[0].count).toBe(1);
    expect(rootCounter.count).toBe(1); // unchanged — firstRegistry's escalation never reached it

    vi.restoreAllMocks();
  });

  it(
    'a target re-advertised over a STILL-LIVE edge that already holds the identical entry for it is ' +
      'accepted as an idempotent no-op — neither rejected nor logged (inst-readvertise-same-edge)',
    async () => {
      const IDEMP_ENTRY = 'entry.idempotent-child.v1';
      const IDEMP_EXT = 'ext.idempotent-child.v1';
      const D_IDEMP = 'domain.idempotent-child.v1';
      const ACTION_IDEMP_LEAF = 'mock.action.v1~action_idempotent_leaf.v1~';

      const entries = new Map<string, MfeEntry>([[IDEMP_ENTRY, makeEntry(IDEMP_ENTRY)]]);
      const plugin = createMockPlugin(entries);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const counter = makeCallCounter();

      const registries: DefaultMfeRegistry[] = [];
      const idempHandler = new InjectableMountHandler(IDEMP_ENTRY, () => {
        // A fresh registry every mount — its adoption re-propagates D_IDEMP
        // upward through the SAME still-live edge (the extension's own
        // bridge pair never changes across mounts) that already holds the
        // ancestor's own recorded entry for it, minted by the PREVIOUS
        // mount's registry.
        const registry = new DefaultMfeRegistry({ typeSystem: plugin });
        registry.registerDomain(
          makeDomain(D_IDEMP, [ACTION_IDEMP_LEAF]),
          new GenericDomainFactory([
            [ACTION_IDEMP_LEAF, ActionHandler.fromFunction(async () => { counter.increment(); })],
          ])
        );
        registries.push(registry);
      });

      const registry0 = new DefaultMfeRegistry({
        typeSystem: plugin,
        mfeHandlers: [idempHandler],
      });
      registry0.registerDomain(makeDomain(D0), new GenericDomainFactory());

      await registry0.registerExtension(makeExtension(IDEMP_EXT, D0, IDEMP_ENTRY));
      const mounter0 = registry0.getMounter(D0);
      mounter0.attach(document.createElement('div'));

      await mounter0.mount(IDEMP_EXT, document.createElement('div'));

      // Remount WITHOUT ever unregistering the extension in between: the
      // link registry0 minted for it is still live, and the second
      // registry's own adoption (step 2) re-advertises D_IDEMP over that
      // SAME edge — the ancestor already holds exactly this entry for it.
      errorSpy.mockClear();
      await mounter0.unmount(IDEMP_EXT);
      await mounter0.mount(IDEMP_EXT, document.createElement('div'));

      // Neither rejected (a collision would be logged) nor otherwise
      // logged — an ordinary, silent no-op.
      const collisionLog = errorSpy.mock.calls.find((call: unknown[]) =>
        String(call[0]).includes('Advertisement collision')
      );
      expect(collisionLog).toBeUndefined();

      // The route still resolves — proving the entry was genuinely
      // accepted (as the SAME entry), not silently dropped.
      expect(registries).toHaveLength(2);
      void awaitChain(registry0, actionChain(ACTION_IDEMP_LEAF, D_IDEMP));
      await counter.waitFor(1);
      expect(counter.count).toBe(1);

      vi.restoreAllMocks();
    }
  );

  it('(n) a first mount that acquires a bridge but then fails BEFORE the link-mint step still mints the link on the next, successful mount', async () => {
    const RETRY_ENTRY = 'entry.retry-child.v1';
    const RETRY_EXT = 'ext.retry-child.v1';
    const D_RETRY = 'domain.retry-child.v1';
    const ACTION_RETRY_LEAF = 'mock.action.v1~action_retry_leaf.v1~';

    const entries = new Map<string, MfeEntry>([[RETRY_ENTRY, makeEntry(RETRY_ENTRY)]]);
    const plugin = createMockPlugin(entries);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const leafCounter = makeCallCounter();

    let retryRegistry: DefaultMfeRegistry | undefined;

    const retryHandler = new InjectableMountHandler(RETRY_ENTRY, () => {
      // Constructed on whichever mount attempt actually reaches this
      // synchronous body — the first attempt's own `createShadowRoot` call
      // (below the bridge-acquisition step, above the link-mint step) is
      // what fails on the first container, so this only ever runs on the
      // SECOND, successful attempt.
      retryRegistry = new DefaultMfeRegistry({ typeSystem: plugin });
      retryRegistry.registerDomain(
        makeDomain(D_RETRY, [ACTION_RETRY_LEAF]),
        new GenericDomainFactory([
          [ACTION_RETRY_LEAF, ActionHandler.fromFunction(async () => { leafCounter.increment(); })],
        ])
      );
    });

    const registry0 = new DefaultMfeRegistry({
      typeSystem: plugin,
      mfeHandlers: [retryHandler],
    });
    registry0.registerDomain(makeDomain(D0), new GenericDomainFactory());

    await registry0.registerExtension(makeExtension(RETRY_EXT, D0, RETRY_ENTRY));
    const mounter0 = registry0.getMounter(D0);
    mounter0.attach(document.createElement('div'));

    // First mount attempt: the bridge pair IS acquired (`extensionState.bridge`
    // / `extensionState.childBridge` get set) before `createShadowRoot` runs,
    // but the container already carries a CLOSED shadow root attached
    // outside `DefaultMountManager`'s own knowledge — `element.shadowRoot`
    // reads back `null` for a closed root, so `createShadowRoot` calls
    // `element.attachShadow(...)` again, which the DOM spec (and jsdom)
    // reject with "already hosts a shadow tree". This throws strictly
    // BEFORE the link-mint step (`inst-track-mounting-bridge`), which sits
    // even later, so nothing about the extension's own bridge pair is
    // reverted by the failure path — only deactivated.
    const poisonedContainer = document.createElement('div');
    poisonedContainer.attachShadow({ mode: 'closed' });

    await expect(mounter0.mount(RETRY_EXT, poisonedContainer)).rejects.toThrow(
      /already hosts a shadow tree|shadow root/i
    );
    expect(retryRegistry).toBeUndefined();

    // Second mount attempt, on a fresh (unpoisoned) container: must succeed
    // all the way through, including the link-mint step. The mint step's
    // gate (`!existing`, derived from `extensionState.bridge` /
    // `childBridge`) must not treat state left over from the FIRST, failed
    // attempt as an "already minted" bridge pair — otherwise minting is
    // skipped forever and `retryRegistry`'s advertisement is propagated
    // locally but never reaches the shell.
    await mounter0.mount(RETRY_EXT, document.createElement('div'));
    expect(retryRegistry).toBeDefined();

    // Handing the sub-chain down ends registry0's own part; observed
    // through the terminal effect.
    void awaitChain(registry0, actionChain(ACTION_RETRY_LEAF, D_RETRY));
    await leafCounter.waitFor(1);
    expect(leafCounter.count).toBe(1);

    vi.restoreAllMocks();
  });

  it(
    '(n) an escalation already ACCEPTED at registry1 keeps executing there, untouched, when ' +
      "registry2's own link is revoked afterwards — retraction acts on the ROUTE only, never on a " +
      'sub-chain the far side already accepted, and a LATER dispatch through the revoked link is ' +
      'refused (AC5.8)',
    async () => {
      const { registry1, registry2, leafCounter, hangUpStarted } = await buildTopology();

      // Dispatched FROM registry2 (the grandchild), targeting ACTION_HANG_UP
      // on D1 — registry2 has no local handler for D1, so this resolves via
      // the ESCALATION tier (registry2's own inbound-bridge link to
      // registry1). The declared `fallback` targets ACTION_LEAF on D2 —
      // registry2's OWN local domain.
      const chain: ActionsChain = {
        action: { type: ACTION_HANG_UP, target: D1, payload: {}, timeout: 3600000 },
        fallback: actionChain(ACTION_LEAF, D2),
      };

      registry2.executeActionsChain(chain);

      // The far handler has genuinely started: registry1 accepted the
      // sub-chain before this point.
      await hangUpStarted;

      // Revoke registry2's own inbound-bridge link via GRANDCHILD_EXT's
      // permanent unregistration on registry1 — the same production
      // trigger test (l) uses for the downward forwarding-entry tier, here
      // exercised for the escalation tier instead.
      await registry1.unregisterExtension(GRANDCHILD_EXT);

      // Retraction acts on the route only: it never touches the sub-chain
      // registry1 already accepted, which keeps executing there, and
      // registry2's own declared `fallback` never runs for it.
      expect(leafCounter.count).toBe(0);

      // A LATER dispatch through the now-revoked link finds no route: the
      // action fails and registry2 executes its fallback.
      await awaitChain(registry2, {
        action: { type: ACTION_LEAF, target: D1, payload: {} },
        fallback: actionChain(ACTION_LEAF, D2),
      });
      expect(leafCounter.count).toBe(1);
    }
  );

  it('(p) a chain emitted by an extension keeps running after that extension is UNMOUNTED and then permanently UNREGISTERED, executing normally in the registry that executes it', async () => {
    // A chain keeps executing in the registry that executes it, regardless
    // of whatever EMITTED it (`cpt-frontx-adr-action-dispatch-and-chaining`,
    // MFES-8). Here the emitter is child-ext — an extension registered and
    // mounted at the SHELL (registry0) — while the executing registry is
    // registry1, the registry child-ext hosts, and the chain's actions target registry1's
    // OWN local domain D1. Tearing child-ext down at the shell therefore
    // removes the emitter and nothing else the chain depends on.
    const {
      registry0,
      registry1,
      gatedCounter,
      afterGateCounter,
      gateReached,
      releaseGate,
    } = await buildTopology();

    const chain: ActionsChain = {
      action: { type: ACTION_GATED, target: D1, payload: {} },
      next: actionChain(ACTION_AFTER_GATE, D1),
      // Would run if anything ended the action as a FAILURE. It must not.
      fallback: actionChain(ACTION_LEAF, D2),
    };

    const executionEnded = awaitChain(registry1, chain);

    // The first action is genuinely executing inside registry1.
    await gateReached;

    // Tear the EMITTER down, both ways the ADR names: an ordinary unmount
    // (deactivates its bridge) and then permanent unregistration (revokes
    // its link, retracts its advertisements, releases its bridge pair).
    const mounter0 = registry0.getMounter(D0);
    await mounter0.unmount(CHILD_EXT);
    await registry0.unregisterExtension(CHILD_EXT);

    // Neither of those ended the chain: it is still waiting on its own
    // first node, which now finishes on its own terms.
    releaseGate();
    await executionEnded;

    expect(gatedCounter.count).toBe(1);
    // `next` executed, so the action succeeded rather than being cut short.
    expect(afterGateCounter.count).toBe(1);
  });
});
