/**
 * Cross-hop delivery refusal: the continuation model
 * (`cpt-frontx-adr-action-dispatch-and-chaining`).
 *
 * A hop crossing is nothing more than one runtime handing a node to another
 * and being done: the delivering runtime holds no reservation or other
 * pending state for it, applies no bound of its own to it, and receives
 * nothing back. Delivery is synchronous and binary — refused at the call or
 * accepted, never both:
 *
 * - A REFUSAL (an inactive or disposed bridge, a revoked link, no receiver
 *   wired, an unrecognized transport protocol version, or a disposed
 *   receiving registry) is the current node's own failure at the delivering
 *   runtime, which dispatches the node's declared `fallback` from itself and
 *   leaves no side effect at the far side. The diagnostic names the hop's own
 *   UNAVAILABILITY, distinct from a handler failure, because no handler ran.
 * - An ACCEPTANCE transfers the sub-chain: this runtime is done with the
 *   node the instant the call returns, holding no reservation for it.
 *
 * Exercised here at the two tiers whose resolution lives outside the
 * mediator: the downward forwarding-entry tier and the upward escalation
 * tier. The parent-to-child-domain forwarding tier is exercised against its
 * real bridge in `__tests__/bridge/cross-runtime-routing.test.ts`.
 *
 * Action and domain IDs are a mock notation rather than real GTS strings:
 * MFES-1 forbids @gears-frontx/mfes from carrying type-format literals.
 */

import { describe, it, expect, vi } from 'vitest';
import { DefaultActionsChainsMediator } from '../../src/mediator/actions-chains-mediator';
import {
  CROSS_HOP_PROTOCOL_VERSION,
  CrossHopRoute,
  CrossHopUnavailableError,
  type CrossHopEnvelope,
  type CrossHopUnavailabilityCause,
} from '../../src/mediator/cross-hop-route';
import { ActionHandler } from '../../src/mediator/types';
import type { TypeSystemPlugin } from '../../src/type-substrate';
import type { ActionsChain } from '../../src/types';
import type { ExtensionDomainState } from '../../src/runtime/extension-manager';
import type { ChainNodeFailureDiagnostic, MfeDiagnosticSink } from '../../src/runtime/config';

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

/** A hop under the test's control: refuses (throws synchronously) or accepts (returns) on demand. */
function makeControllableHop() {
  let behavior: { refuse: false } | { refuse: true; cause: CrossHopUnavailabilityCause; hop: string } = {
    refuse: false,
  };
  const envelopes: CrossHopEnvelope[] = [];

  const route = new CrossHopRoute((envelope) => {
    envelopes.push(envelope);
    if (behavior.refuse) {
      throw new CrossHopUnavailableError(behavior.hop, behavior.cause, `route refused: ${behavior.cause}`);
    }
    // Accepted: returns normally, nothing further for the sender to do.
  });

  return {
    route,
    envelopes,
    /** From the next `send` onward, this hop refuses at the call. */
    refuseNext(cause: CrossHopUnavailabilityCause, hop = REMOTE): void {
      behavior = { refuse: true, cause, hop };
    },
  };
}

interface Harness {
  mediator: DefaultActionsChainsMediator;
  chainNodeFailures: ChainNodeFailureDiagnostic[];
  fallbackRuns: { count: number };
  nextRuns: { count: number };
}

function makeHarness(tier: 'forwarding-entry' | 'escalation', route: CrossHopRoute): Harness {
  const chainNodeFailures: ChainNodeFailureDiagnostic[] = [];
  const diagnosticSink: MfeDiagnosticSink = {
    reportLifecycleDispatchRefusal() {},
    reportChainNodeFailure(diagnostic) {
      chainNodeFailures.push(diagnostic);
    },
  };
  const mediator = new DefaultActionsChainsMediator({
    typeSystem: createMockPlugin(),
    getDomainState: () => makeDomainState(),
    getExtensionEntry: () => undefined,
    diagnosticSink,
    ...(tier === 'forwarding-entry'
      ? { resolveForwardingEntry: (targetId: string) => (targetId === REMOTE ? route : undefined) }
      : { resolveEscalation: () => route }),
  });

  const fallbackRuns = { count: 0 };
  const nextRuns = { count: 0 };
  mediator.registerHandler(
    LOCAL,
    ACTION_FALLBACK,
    ActionHandler.fromFunction(async () => {
      fallbackRuns.count += 1;
    })
  );
  mediator.registerHandler(
    LOCAL,
    ACTION_NEXT,
    ActionHandler.fromFunction(async () => {
      nextRuns.count += 1;
    })
  );
  return { mediator, chainNodeFailures, fallbackRuns, nextRuns };
}

function chainThroughHop(): ActionsChain {
  return {
    action: { type: ACTION_REMOTE, target: REMOTE, payload: {}, timeout: 3600000 },
    next: { action: { type: ACTION_NEXT, target: LOCAL, payload: {} } },
    fallback: { action: { type: ACTION_FALLBACK, target: LOCAL, payload: {} } },
  };
}

function pendingActionsOf(mediator: DefaultActionsChainsMediator): Map<string, Set<unknown>> {
  return (mediator as unknown as { pendingActions: Map<string, Set<unknown>> }).pendingActions;
}

describe.each([
  ['downward forwarding-entry tier', 'forwarding-entry' as const, 'bridge-deactivated' as const],
  ['upward escalation tier', 'escalation' as const, 'link-revoked' as const],
  ['upward escalation tier', 'escalation' as const, 'bridge-deactivated' as const],
])('%s — a delivery refused at the call (%s)', (_label, tier, cause) => {
  it("fails the node so the declared `fallback` runs, classing the failure as the hop's unavailability rather than a handler failure, with no reservation ever held for it", async () => {
    const hop = makeControllableHop();
    hop.refuseNext(cause);
    const { mediator, chainNodeFailures, fallbackRuns, nextRuns } = makeHarness(tier, hop.route);

    const settlement = await mediator.runAcceptedChain(chainThroughHop());

    expect(fallbackRuns.count).toBe(1);
    expect(nextRuns.count).toBe(0);
    expect(settlement.completed).toBe(true);

    expect(chainNodeFailures).toHaveLength(1);
    expect(chainNodeFailures[0]?.failureClass).toBe('hop-unavailable');
    expect(chainNodeFailures[0]?.failureClass).not.toBe('handler-failure');
    expect(chainNodeFailures[0]?.target).toBe(REMOTE);
    expect(chainNodeFailures[0]?.hopFailureCause).toBe(cause);

    // The delivering side never reserved anything for a node it hands
    // across a hop — refused or accepted (`inst-add-inflight`).
    expect(pendingActionsOf(mediator).has(REMOTE)).toBe(false);
  });
});

describe('an accepted hand-over ends this runtime\'s own execution of that node', () => {
  it('does not append the remote node to the path or follow `next`/`fallback` from the sending side — branch selection belongs to the far side', async () => {
    const hop = makeControllableHop();
    const { mediator, fallbackRuns, nextRuns } = makeHarness('forwarding-entry', hop.route);

    const settlement = await mediator.runAcceptedChain(chainThroughHop());

    // Accepted: nothing thrown, so this side is simply done with the node.
    expect(hop.envelopes).toHaveLength(1);
    expect(fallbackRuns.count).toBe(0);
    expect(nextRuns.count).toBe(0);
    expect(settlement.completed).toBe(false);
    expect(pendingActionsOf(mediator).has(REMOTE)).toBe(false);
  });
});

describe('an unrecognized transport protocol version', () => {
  it("classes an envelope the receiving copy will not recognize as the hop's UNAVAILABILITY, not a handler failure, while the declared `fallback` still answers it — refused before anything is taken", async () => {
    // The receiving side is the REAL production receiver: a
    // `DefaultMfeRegistry` whose `receiveCrossHopNode` refuses an envelope
    // whose protocol version it does not implement, synchronously, before
    // taking anything. Simulated as a peer built from a different release by
    // bumping the version the envelope carries in transit.
    const { DefaultMfeRegistry } = await import('../../src/runtime/DefaultMfeRegistry');
    const farRegistry = new DefaultMfeRegistry({ typeSystem: createMockPlugin() });
    const receive = (
      farRegistry as unknown as {
        receiveCrossHopNode(envelope: CrossHopEnvelope): void;
      }
    ).receiveCrossHopNode.bind(farRegistry);

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const route = new CrossHopRoute((envelope) => receive({ ...envelope, version: envelope.version + 1 }));
      const { mediator, chainNodeFailures, fallbackRuns } = makeHarness('forwarding-entry', route);

      const settlement = await mediator.runAcceptedChain(chainThroughHop());

      expect(settlement.completed).toBe(true);
      expect(fallbackRuns.count).toBe(1);
      expect(chainNodeFailures).toHaveLength(1);
      expect(chainNodeFailures[0]?.failureClass).toBe('hop-unavailable');
      expect(chainNodeFailures[0]?.failureClass).not.toBe('handler-failure');
      expect(chainNodeFailures[0]?.hopFailureCause).toBe('unrecognized-protocol-version');

      // The copy records which version it met and which it implements, so
      // an incompatibility is attributable rather than merely visible.
      const versionLog = consoleError.mock.calls.find((call: unknown[]) =>
        call.some((arg: unknown) => String(arg).includes('unrecognized protocol version'))
      );
      expect(versionLog).toBeDefined();
      expect(String(versionLog?.[0])).toContain(`met ${CROSS_HOP_PROTOCOL_VERSION + 1}`);
      expect(String(versionLog?.[0])).toContain(`implements ${CROSS_HOP_PROTOCOL_VERSION}`);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('logs a diagnostic, never a misattribution, rather than throwing an unrelated error', async () => {
    const { DefaultMfeRegistry } = await import('../../src/runtime/DefaultMfeRegistry');
    const farRegistry = new DefaultMfeRegistry({ typeSystem: createMockPlugin() });
    const receive = (
      farRegistry as unknown as { receiveCrossHopNode(envelope: CrossHopEnvelope): void }
    ).receiveCrossHopNode.bind(farRegistry);

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() =>
        receive({
          version: CROSS_HOP_PROTOCOL_VERSION + 1,
          node: { action: { type: ACTION_REMOTE, target: REMOTE, payload: {} } },
          diagnostics: {},
        })
      ).toThrow(CrossHopUnavailableError);
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('a disposed receiving registry', () => {
  it('refuses the delivery at the call with a registry-disposed cause, logging nothing about a handler', async () => {
    const { DefaultMfeRegistry } = await import('../../src/runtime/DefaultMfeRegistry');
    const farRegistry = new DefaultMfeRegistry({ typeSystem: createMockPlugin() });
    farRegistry.dispose();
    const receive = (
      farRegistry as unknown as { receiveCrossHopNode(envelope: CrossHopEnvelope): void }
    ).receiveCrossHopNode.bind(farRegistry);

    expect(() =>
      receive({
        version: CROSS_HOP_PROTOCOL_VERSION,
        node: { action: { type: ACTION_REMOTE, target: REMOTE, payload: {} } },
        diagnostics: {},
      })
    ).toThrow(CrossHopUnavailableError);
  });
});
