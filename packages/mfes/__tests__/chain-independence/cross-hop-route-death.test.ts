/**
 * Hand-over refusal (`cpt-frontx-adr-action-dispatch-and-chaining`).
 *
 * Crossing a hop is one runtime handing the sub-chain to another and being
 * done: nothing comes back. The hand-over call either refuses or accepts:
 *
 * - A REFUSAL (an inactive or disposed bridge, a revoked link, no receiver
 *   wired, an unrecognized envelope version, or a disposed receiving
 *   registry) is a failure of the action at the delivering runtime, which
 *   executes the chain's `fallback`; the refusal leaves no side effect at the
 *   far side.
 * - An ACCEPTANCE ends this runtime's part: it executes neither `next` nor
 *   `fallback` for that sub-chain.
 *
 * Exercised at both runtime-crossing tiers: the downward forwarding-entry
 * tier and the upward escalation tier.
 *
 * Action and domain IDs are a mock notation rather than real GTS strings:
 * MFES-1 forbids @gears-frontx/mfes from carrying type-format literals.
 */

import { describe, it, expect } from 'vitest';
import { DefaultActionsChainsMediator } from '../../src/mediator/DefaultActionsChainsMediator';
import { CROSS_HOP_PROTOCOL_VERSION, CrossHopRoute, type CrossHopEnvelope } from '../../src/mediator/CrossHopRoute';
import { ActionHandler } from '../../src/mediator/ActionHandler';
import { DefaultMfeRegistry } from '../../src/runtime/DefaultMfeRegistry';
import type { TypeSystemPlugin } from '../../src/type-substrate';
import type { ActionsChain } from '../../src/types';
import type { ExtensionDomainState } from '../../src/runtime/ExtensionManager';

const REMOTE = 'domain.remote.v1';
const LOCAL = 'domain.local.v1';
const ACTION_REMOTE = 'mock.action.v1~remote.v1~';
const ACTION_FALLBACK = 'mock.action.v1~fallback.v1~';
const ACTION_NEXT = 'mock.action.v1~next.v1~';

function createMockPlugin(): TypeSystemPlugin<unknown> {
  return {
    name: 'MockPlugin',
    version: '1.0.0',
    registerSchema(): void {},
    getSchema: () => undefined,
    register(): void {},
    isTypeOf: (typeId: string, baseTypeId: string) => typeId === baseTypeId,
    validateInstance: () => ({ valid: true, errors: [] }),
    resolveLoadExtActionId: () => 'mock.action.v1~load_ext.v1~',
    resolveMountExtActionId: () => 'mock.action.v1~mount_ext.v1~',
    resolveUnmountExtActionId: () => 'mock.action.v1~unmount_ext.v1~',
    resolveLifecycleStageInitId: () => 'mock.stage.v1~init.v1',
    resolveLifecycleStageActivatedId: () => 'mock.stage.v1~activated.v1',
    resolveLifecycleStageDeactivatedId: () => 'mock.stage.v1~deactivated.v1',
    resolveLifecycleStageDestroyedId: () => 'mock.stage.v1~destroyed.v1',
  };
}

function makeDomainState(): ExtensionDomainState {
  return {
    domain: {
      id: LOCAL,
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

/** A settlement signal a handler resolves explicitly — never a poll. */
function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

interface Harness {
  mediator: DefaultActionsChainsMediator;
  fallbackRuns: { count: number };
  nextRuns: { count: number };
  fallbackReached: Promise<void>;
}

function makeHarness(tier: 'forwarding-entry' | 'escalation', route: CrossHopRoute): Harness {
  const mediator = new DefaultActionsChainsMediator({
    typeSystem: createMockPlugin(),
    getDomainState: () => makeDomainState(),
    getExtensionEntry: () => undefined,
    ...(tier === 'forwarding-entry'
      ? { resolveForwardingEntry: (targetId: string) => (targetId === REMOTE ? route : undefined) }
      : { resolveEscalation: () => route }),
  });

  const fallbackRuns = { count: 0 };
  const nextRuns = { count: 0 };
  const fallbackReached = createDeferred();
  mediator.registerHandler(
    LOCAL,
    ACTION_FALLBACK,
    ActionHandler.fromFunction(async () => {
      fallbackRuns.count += 1;
      fallbackReached.resolve();
    })
  );
  mediator.registerHandler(
    LOCAL,
    ACTION_NEXT,
    ActionHandler.fromFunction(async () => {
      nextRuns.count += 1;
    })
  );
  return { mediator, fallbackRuns, nextRuns, fallbackReached: fallbackReached.promise };
}

function chainThroughHop(): ActionsChain {
  return {
    action: { type: ACTION_REMOTE, target: REMOTE, payload: {} },
    next: { action: { type: ACTION_NEXT, target: LOCAL, payload: {} } },
    fallback: { action: { type: ACTION_FALLBACK, target: LOCAL, payload: {} } },
  };
}

/**
 * Runs the mediator's internal recursion for `chain` and resolves once it
 * has ended — the deterministic synchronisation point for asserting that a
 * branch did NOT run.
 */
function executeToEnd(mediator: DefaultActionsChainsMediator, chain: ActionsChain): Promise<void> {
  return (mediator as unknown as { executeChain(c: ActionsChain): Promise<void> }).executeChain(chain);
}

function receiverOf(registry: DefaultMfeRegistry): (envelope: CrossHopEnvelope) => void {
  return (
    registry as unknown as { receiveCrossHopNode(envelope: CrossHopEnvelope): void }
  ).receiveCrossHopNode.bind(registry);
}

describe.each([
  ['downward forwarding-entry tier', 'forwarding-entry' as const],
  ['upward escalation tier', 'escalation' as const],
])('%s — a refused hand-over', (_label, tier) => {
  it('executes the chain\'s `fallback` at the delivering runtime, and not `next`', async () => {
    const route = new CrossHopRoute(() => {
      throw new Error('refused');
    });
    const { mediator, fallbackRuns, nextRuns, fallbackReached } = makeHarness(tier, route);

    mediator.executeActionsChain(chainThroughHop());

    await fallbackReached;
    expect(fallbackRuns.count).toBe(1);
    expect(nextRuns.count).toBe(0);
  });
});

describe('an accepted hand-over ends this runtime\'s part of that sub-chain', () => {
  it('executes neither `next` nor `fallback` at the delivering runtime', async () => {
    const envelopes: CrossHopEnvelope[] = [];
    const route = new CrossHopRoute((envelope) => {
      envelopes.push(envelope);
    });
    const { mediator, fallbackRuns, nextRuns } = makeHarness('forwarding-entry', route);

    await executeToEnd(mediator, chainThroughHop());

    expect(envelopes).toHaveLength(1);
    expect(fallbackRuns.count).toBe(0);
    expect(nextRuns.count).toBe(0);
  });
});

describe('an unrecognized envelope version', () => {
  it('is refused by the receiving registry, so the delivering runtime executes `fallback`', async () => {
    // The receiving side is the real production receiver. A peer built
    // from a different release is simulated by bumping the version the
    // envelope carries in transit.
    const farRegistry = new DefaultMfeRegistry({ typeSystem: createMockPlugin() });
    const receive = receiverOf(farRegistry);
    const route = new CrossHopRoute((envelope) => receive({ ...envelope, version: envelope.version + 1 }));
    const { mediator, fallbackRuns, fallbackReached } = makeHarness('forwarding-entry', route);

    mediator.executeActionsChain(chainThroughHop());

    await fallbackReached;
    expect(fallbackRuns.count).toBe(1);
  });

  it('refuses at the call with no side effect at the far side', async () => {
    const farRegistry = new DefaultMfeRegistry({ typeSystem: createMockPlugin() });
    const farMediator = (farRegistry as unknown as { mediator: DefaultActionsChainsMediator }).mediator;
    let farHandlerRuns = 0;
    farMediator.registerHandler(
      REMOTE,
      ACTION_REMOTE,
      ActionHandler.fromFunction(async () => {
        farHandlerRuns += 1;
      })
    );
    const receive = receiverOf(farRegistry);

    expect(() =>
      receive({
        version: CROSS_HOP_PROTOCOL_VERSION + 1,
        chain: { action: { type: ACTION_REMOTE, target: REMOTE, payload: {}, timeout: 1000 } },
      })
    ).toThrow();

    // A recognized hand-over to the same far side is the synchronisation
    // point: it executes after the refused one would have.
    const reached = createDeferred();
    farMediator.registerHandler(REMOTE, ACTION_NEXT, ActionHandler.fromFunction(async () => reached.resolve()));
    receive({ version: CROSS_HOP_PROTOCOL_VERSION, chain: { action: { type: ACTION_NEXT, target: REMOTE, payload: {}, timeout: 1000 } } });
    await reached.promise;
    expect(farHandlerRuns).toBe(0);
  });
});

describe('a disposed receiving registry', () => {
  it('refuses the hand-over at the call', () => {
    const farRegistry = new DefaultMfeRegistry({ typeSystem: createMockPlugin() });
    farRegistry.dispose();
    const receive = receiverOf(farRegistry);

    expect(() =>
      receive({
        version: CROSS_HOP_PROTOCOL_VERSION,
        chain: { action: { type: ACTION_REMOTE, target: REMOTE, payload: {} } },
      })
    ).toThrow();
  });
});
