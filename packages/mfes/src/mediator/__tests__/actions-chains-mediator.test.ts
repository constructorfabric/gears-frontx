import { describe, it, expect, vi } from 'vitest';
import { DefaultActionsChainsMediator } from '../actions-chains-mediator';
import { ActionHandler } from '../types';
import { CrossHopRoute } from '../cross-hop-route';
import type { CrossHopEnvelope } from '../cross-hop-route';
import { fromEnvelopeDiagnostics } from '../dispatch-diagnostics';
import type { TypeSystemPlugin } from '../../type-substrate';
import type { MfeEntry, ActionsChain } from '../../types';
import type { ExtensionDomainState } from '../../runtime/extension-manager';
import type { ChainNodeFailureDiagnostic, MfeDiagnosticSink } from '../../runtime/config';

// Mock-plugin-local stand-ins for the framework's well-known lifecycle action
// IDs, deliberately NOT the real GTS strings — proves the mediator's
// hierarchy-aware paths never assume any particular notation.
const MOUNT_EXT = 'mock.action.v1~mount_ext.v1~';
const UNMOUNT_EXT = 'mock.action.v1~unmount_ext.v1~';
const LOAD_EXT = 'mock.action.v1~load_ext.v1~';
// Stand-ins for the four well-known lifecycle stages, same rationale as above.
const STAGE_INIT = 'mock.stage.v1~init.v1';
const STAGE_ACTIVATED = 'mock.stage.v1~activated.v1';
const STAGE_DEACTIVATED = 'mock.stage.v1~deactivated.v1';
const STAGE_DESTROYED = 'mock.stage.v1~destroyed.v1';
// A domain-declared "is-a" derivative of mount_ext — NOT string-equal to
// MOUNT_EXT, but recognized as derived from it by the mock's isTypeOf.
const DERIVED_MOUNT_EXT = `${MOUNT_EXT}vendor.v1~`;

function createMockPlugin(): TypeSystemPlugin<unknown> {
  return {
    name: 'MockPlugin',
    version: '1.0.0',
    registerSchema(): void {},
    getSchema(): undefined {
      return undefined;
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
      return STAGE_INIT;
    },
    resolveLifecycleStageActivatedId(): string {
      return STAGE_ACTIVATED;
    },
    resolveLifecycleStageDeactivatedId(): string {
      return STAGE_DEACTIVATED;
    },
    resolveLifecycleStageDestroyedId(): string {
      return STAGE_DESTROYED;
    },
  };
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

function makeMediator(getExtensionEntry: (id: string) => MfeEntry | undefined = () => undefined) {
  return new DefaultActionsChainsMediator({
    typeSystem: createMockPlugin(),
    getDomainState: () => makeDomainState(),
    getExtensionEntry,
  });
}

/**
 * Variant of `makeMediator` that also accepts a `diagnosticSink` and a
 * `resolveForwardingEntry` callback — the two extra construction hooks the
 * defect-1/defect-2 regression tests below need (a capturing sink, and a
 * cross-hop route resolution for the defect-2 remote-node scenario).
 */
function makeMediatorWithConfig(config: {
  getExtensionEntry?: (id: string) => MfeEntry | undefined;
  diagnosticSink?: MfeDiagnosticSink;
  resolveForwardingEntry?: (targetId: string, arrivalEdge: unknown) => CrossHopRoute | undefined;
}) {
  return new DefaultActionsChainsMediator({
    typeSystem: createMockPlugin(),
    getDomainState: () => makeDomainState(),
    getExtensionEntry: config.getExtensionEntry ?? (() => undefined),
    diagnosticSink: config.diagnosticSink,
    resolveForwardingEntry: config.resolveForwardingEntry,
  });
}

/** A settlement signal a test resolves explicitly from inside a handler — never a poll. */
function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * Like `createDeferred`, but also exposes `reject` — needed by the
 * never-settles regression test, which must later reject the SAME promise
 * a torn-down attempt already stopped waiting on, to prove that rejection
 * is still consumed safely rather than surfacing as an unhandled rejection.
 */
function createRejectableDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
} {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeCapturingDiagnosticSink() {
  const chainNodeFailures: ChainNodeFailureDiagnostic[] = [];
  const sink: MfeDiagnosticSink = {
    reportLifecycleDispatchRefusal() {},
    reportChainNodeFailure(diagnostic) {
      chainNodeFailures.push(diagnostic);
    },
  };
  return { sink, chainNodeFailures };
}

describe('DefaultActionsChainsMediator — hierarchy-aware handler resolution', () => {
  it('resolves a handler registered under a DERIVED mount_ext id when dispatched with the BASE id', async () => {
    const mediator = makeMediator();
    let handled = false;
    mediator.registerHandler(
      'domain-1',
      DERIVED_MOUNT_EXT,
      ActionHandler.fromFunction(async () => {
        handled = true;
      })
    );

    const result = await mediator.runAcceptedChain({
      action: { type: MOUNT_EXT, target: 'domain-1', payload: { subject: 'ext-1' } },
    });

    expect(result.completed).toBe(true);
    expect(handled).toBe(true);
  });

  it('resolves a handler registered under the BASE mount_ext id when dispatched with a DERIVED id', async () => {
    const mediator = makeMediator();
    let handled = false;
    mediator.registerHandler(
      'domain-1',
      MOUNT_EXT,
      ActionHandler.fromFunction(async () => {
        handled = true;
      })
    );

    const result = await mediator.runAcceptedChain({
      action: { type: DERIVED_MOUNT_EXT, target: 'domain-1', payload: { subject: 'ext-1' } },
    });

    expect(result.completed).toBe(true);
    expect(handled).toBe(true);
  });

  it('does not misroute an ActionHandler that happens to define its own `send` method as a CrossHopRoute', async () => {
    // Regression guard for the old duck-typed `isCrossHopRoute` check, which
    // identified a resolved handler as a cross-hop route purely by the
    // presence of a `send` method. An ordinary application `ActionHandler`
    // is free to name its own unrelated method `send` — under duck-typing
    // this handler would have been misrouted into `CrossHopRoute` handling
    // and crashed treating its own unrelated `send` as the cross-hop
    // transport, which it isn't.
    class HandlerWithOwnSendMethod extends ActionHandler {
      handled = false;
      sentCount = 0;

      async handleAction(): Promise<void> {
        this.handled = true;
      }

      // Unrelated application-level method that happens to share a name
      // with CrossHopRoute.send — must not affect dispatch resolution.
      async send(): Promise<void> {
        this.sentCount += 1;
      }
    }

    const mediator = makeMediator();
    const handler = new HandlerWithOwnSendMethod();
    mediator.registerHandler('domain-1', MOUNT_EXT, handler);

    const result = await mediator.runAcceptedChain({
      action: { type: MOUNT_EXT, target: 'domain-1', payload: { subject: 'ext-1' } },
    });

    expect(result.completed).toBe(true);
    expect(handler.handled).toBe(true);
    expect(handler.sentCount).toBe(0);
  });

  it('still fails with NoHandlerForActionTargetError semantics for a genuinely unrelated action type', async () => {
    const mediator = makeMediator();
    mediator.registerHandler('domain-1', MOUNT_EXT, ActionHandler.fromFunction(async () => {}));

    const result = await mediator.runAcceptedChain({
      action: { type: 'mock.action.v1~unrelated.v1~', target: 'domain-1' },
    });

    expect(result.completed).toBe(false);
    expect(result.path).toEqual(['mock.action.v1~unrelated.v1~']);
  });

  it('exempts a DERIVED infrastructure action from entry declaration validation', async () => {
    // Entry declares NO actions at all — if the derived load_ext id were
    // treated as a regular (non-infrastructure) action, this would throw
    // "Action type ... is not declared by target entry" before dispatch.
    const entry: MfeEntry = {
      id: 'ext-1',
      entry: 'ext-1',
      domain: 'domain-1',
      actions: [],
      domainActions: [],
      requiredProperties: [],
    } as unknown as MfeEntry;

    const mediator = makeMediator(() => entry);
    let handled = false;
    mediator.registerHandler(
      'ext-1',
      `${LOAD_EXT}vendor.v1~`,
      ActionHandler.fromFunction(async () => {
        handled = true;
      })
    );

    const result = await mediator.runAcceptedChain({
      action: { type: `${LOAD_EXT}vendor.v1~`, target: 'ext-1' },
    });

    expect(result.completed).toBe(true);
    expect(handled).toBe(true);
  });
});

describe('DefaultActionsChainsMediator — deferred target retirement (cpt-frontx-adr-action-dispatch-and-chaining)', () => {
  it('removes a retired target immediately when nothing is pending against it', () => {
    const mediator = makeMediator();
    mediator.registerHandler('domain-1', MOUNT_EXT, ActionHandler.fromFunction(async () => {}));

    expect((mediator as unknown as { actionHandlers: Map<string, unknown> }).actionHandlers.has('domain-1')).toBe(true);

    expect(() => mediator.unregisterAllHandlers('domain-1')).not.toThrow();

    expect((mediator as unknown as { actionHandlers: Map<string, unknown> }).actionHandlers.has('domain-1')).toBe(false);
  });

  it(
    'retires a target logically and immediately while a reservation is pending against it, ' +
      'deferring physical removal to the drain — never throwing and never blocking the caller',
    async () => {
      const mediator = makeMediator();

      // Controlled deferred: the test — not a timer, not a microtask flush
      // — decides exactly when the reserved handler settles.
      let releaseGate: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
      let handleCount = 0;
      mediator.registerHandler(
        'domain-1',
        MOUNT_EXT,
        ActionHandler.fromFunction(async () => {
          handleCount += 1;
          await gate;
        })
      );

      // `runAcceptedChain` is async, but per `inst-reserve-first-node` its
      // synchronous prefix — resolving the handler and tracking the
      // in-flight reservation — runs in THIS synchronous turn, before the
      // returned promise is ever awaited below.
      const reservedChainPromise = mediator.runAcceptedChain({
        action: { type: MOUNT_EXT, target: 'domain-1', payload: { subject: 'ext-1' } },
      });

      // Retiring the target now — with a reservation already standing
      // against it — must not throw (this is exactly the entity's-own-
      // destroyed-stage-targets-itself scenario the ADR resolves).
      expect(() => mediator.unregisterAllHandlers('domain-1')).not.toThrow();

      // Logical retraction is immediate: physical registrations survive...
      expect((mediator as unknown as { actionHandlers: Map<string, unknown> }).actionHandlers.has('domain-1')).toBe(true);

      // ...but a NEW dispatch to the now-retired target does not resolve,
      // regardless of the still-present physical registration.
      const newDispatchResult = await mediator.runAcceptedChain({
        action: { type: MOUNT_EXT, target: 'domain-1', payload: { subject: 'ext-2' } },
      });
      expect(newDispatchResult.completed).toBe(false);
      expect(handleCount).toBe(1); // the new dispatch never reached the handler

      // Drain the original reservation deterministically.
      releaseGate();
      const reservedChainResult = await reservedChainPromise;
      expect(reservedChainResult.completed).toBe(true);

      // Physical removal happens on drain, not before.
      expect((mediator as unknown as { actionHandlers: Map<string, unknown> }).actionHandlers.has('domain-1')).toBe(false);
    }
  );

  it(
    'finds its own in-flight reservation already standing when it synchronously retires its own ' +
      'target during its own first synchronous turn — the reservation (`inst-add-inflight`) must exist ' +
      'BEFORE the handler is invoked (`inst-invoke-within-timeout`), never after',
    async () => {
      const mediator = makeMediator();

      let handlerRan = false;
      // Captured the instant the handler synchronously retires its OWN
      // target, during its own first synchronous turn (before this async
      // handler function ever reaches an `await`) — exactly the
      // synchronously re-entrant case `inst-reserve-first-node` names.
      let physicallyRegisteredAtSelfRetireTime: boolean | undefined;

      mediator.registerHandler(
        'domain-1',
        MOUNT_EXT,
        ActionHandler.fromFunction(async () => {
          handlerRan = true;
          // Synchronously (no `await` above this line) retire the very
          // target this handler is running against. If the mediator's own
          // in-flight reservation for THIS invocation were added only
          // after invoking the handler, `unregisterAllHandlers` would see
          // nothing pending here and remove the physical registration
          // immediately rather than deferring it to the drain.
          mediator.unregisterAllHandlers('domain-1');
          physicallyRegisteredAtSelfRetireTime = (
            mediator as unknown as { actionHandlers: Map<string, unknown> }
          ).actionHandlers.has('domain-1');
        })
      );

      const result = await mediator.runAcceptedChain({
        action: { type: MOUNT_EXT, target: 'domain-1', payload: { subject: 'ext-1' } },
      });

      expect(handlerRan).toBe(true);
      expect(result.completed).toBe(true);
      // The reservation was already standing at the moment the handler
      // retired its own target: retraction deferred physical removal
      // rather than removing it immediately.
      expect(physicallyRegisteredAtSelfRetireTime).toBe(true);

      // The reservation itself still drains normally once this node's own
      // promise settles — no leak from reserving ahead of invocation.
      expect((mediator as unknown as { actionHandlers: Map<string, unknown> }).actionHandlers.has('domain-1')).toBe(false);
    }
  );
});

describe('DefaultActionsChainsMediator — AC5.14: a reservation taken at acceptance keeps its target reachable through retirement for exactly ONE resolution (inst-reservation-keeps-handler)', () => {
  it(
    'a node accepted via acceptSingleNodeForHop still reaches its handler when its target is retired ' +
      'in the same synchronous turn, before its scheduled execution runs; a fresh dispatch to that ' +
      'retired target afterward fails',
    async () => {
      const { sink, chainNodeFailures } = makeCapturingDiagnosticSink();
      const mediator = makeMediatorWithConfig({ diagnosticSink: sink });

      let handlerRan = false;
      const executedSignal = createDeferred();
      mediator.registerHandler(
        'domain-1',
        MOUNT_EXT,
        ActionHandler.fromFunction(async () => {
          handlerRan = true;
          executedSignal.resolve();
        })
      );

      const action = { type: MOUNT_EXT, target: 'domain-1', payload: { subject: 'ext-1' } };
      mediator.acceptSingleNodeForHop({ action });

      // Same synchronous turn as acceptance: the scheduled microtask that
      // resolves and executes the node has not run yet.
      mediator.unregisterAllHandlers('domain-1');

      // Let the scheduled execution run — an explicit settlement signal
      // from inside the handler itself, never a poll.
      await executedSignal.promise;

      expect(handlerRan).toBe(true);
      expect(chainNodeFailures).toEqual([]);

      // A fresh dispatch — a NEW `Action` object — to the now-retired
      // target is excluded from the reservation this node held: it fails.
      const freshResult = await mediator.runAcceptedChain({
        action: { type: MOUNT_EXT, target: 'domain-1', payload: { subject: 'ext-2' } },
      });
      expect(freshResult.completed).toBe(false);
    }
  );

  it(
    'the bypass a reservation grants is single-use: re-dispatching the SAME Action object after its ' +
      'own attempt has settled is excluded from it, even while the target is still retired and its ' +
      'physical removal is still deferred by another, unrelated, standing reservation',
    async () => {
      const mediator = makeMediator();

      // ONE handler registration for the whole (target, actionType) pair —
      // the mediator holds exactly one. The FIRST invocation (the OTHER,
      // unrelated reservation below) awaits a gate this test never
      // releases, so `domain-1`'s physical registrations stay in place for
      // the whole test — exactly the "physical removal still deferred"
      // precondition. Every LATER invocation settles immediately instead.
      const neverReleasedGate = new Promise<void>(() => {});
      let invocationCount = 0;
      const laterInvocationSettled = createDeferred();
      mediator.registerHandler(
        'domain-1',
        MOUNT_EXT,
        ActionHandler.fromFunction(async () => {
          invocationCount += 1;
          if (invocationCount === 1) {
            await neverReleasedGate;
          } else {
            laterInvocationSettled.resolve();
          }
        })
      );

      // The OTHER, unrelated reservation: dispatched and deliberately never
      // awaited — its handler invocation never settles in this test.
      void mediator.runAcceptedChain({
        action: { type: MOUNT_EXT, target: 'domain-1', payload: { subject: 'other' } },
      });

      const reusedAction = { type: MOUNT_EXT, target: 'domain-1', payload: { subject: 'reused' } };
      mediator.acceptSingleNodeForHop({ action: reusedAction });
      mediator.unregisterAllHandlers('domain-1');

      // Let the accepted node's own scheduled execution run — an explicit
      // settlement signal from inside the handler itself.
      await laterInvocationSettled.promise;
      expect(invocationCount).toBe(2);

      // The physical registration is STILL present: the OTHER reservation
      // above never drains in this test, so retirement's physical removal
      // stays deferred throughout — the precondition this test needs.
      expect((mediator as unknown as { actionHandlers: Map<string, unknown> }).actionHandlers.has('domain-1')).toBe(true);

      // Re-dispatch the IDENTICAL `Action` OBJECT — never a fresh one —
      // now that its own attempt has already settled once. If the bypass
      // this object was granted at acceptance were still standing, this
      // would reach the handler a SECOND time (`invocationCount` -> 3,
      // and this call would complete); it must not.
      const reusedResult = await mediator.runAcceptedChain({ action: reusedAction });
      expect(reusedResult.completed).toBe(false);
      expect(invocationCount).toBe(2);
    }
  );
});

describe('DefaultActionsChainsMediator — a hand-over across a hop reserves nothing on the sending side (inst-add-inflight, inst-flow-hand-over)', () => {
  it(
    'never reserves the mediator-level in-flight entry for a node it hands across a hop: the sending ' +
      "side's `pendingActions` never gains an entry for the remote target, because a runtime never " +
      'reserves for a node it hands over rather than executes',
    async () => {
      let sawReservedAtSendTime: boolean | undefined;

      const mediator = makeMediatorWithConfig({
        resolveForwardingEntry: (targetId) =>
          targetId === 't-remote'
            ? new CrossHopRoute((): void => {
                // Invoked synchronously by `executeCrossHopNode` — the
                // sending side must hold NO reservation for this target at
                // the moment the hop is handed the node.
                const pendingActions = (
                  mediator as unknown as { pendingActions: Map<string, Set<unknown>> }
                ).pendingActions;
                sawReservedAtSendTime = pendingActions.has('t-remote');
              })
            : undefined,
      });

      const result = await mediator.runAcceptedChain({
        action: { type: UNMOUNT_EXT, target: 't-remote', payload: {} },
      });

      // Handing the node over ends this executor's own path at that node
      // (`inst-t-pending-handed-over`) — it is not "completed" from here.
      expect(result.completed).toBe(false);
      expect(sawReservedAtSendTime).toBe(false);

      // No leak: nothing was ever reserved here to drain.
      const pendingActions = (
        mediator as unknown as { pendingActions: Map<string, Set<unknown>> }
      ).pendingActions;
      expect(pendingActions.has('t-remote')).toBe(false);
    }
  );
});

describe(
  'DefaultActionsChainsMediator — a target logically retired but ' +
    'physically retained is never reserved at acceptance and gets no resolution bypass ' +
    '(wouldResolveLocallyNow)',
  () => {
    it(
      'a cross-hop delivery received via acceptSingleNodeForHop while its target is logically retired ' +
        'but physically retained (another reservation still outstanding) is NOT reserved, gets no ' +
        'bypass, and does not execute the handler — its fallback runs at the receiving registry instead',
      async () => {
        const mediator = makeMediator();

        // Counts every invocation of domain-1's own MOUNT_EXT handler — the
        // OTHER, unrelated dispatch below is expected to reach it exactly
        // once; the delivery under test must never reach it a second time.
        let handlerInvocationCount = 0;
        // Never releases, deliberately: this is the OTHER, unrelated
        // reservation that keeps `domain-1`'s physical registration in
        // place across retirement for the whole test.
        const neverReleasedGate = new Promise<void>(() => {});
        mediator.registerHandler(
          'domain-1',
          MOUNT_EXT,
          ActionHandler.fromFunction(async () => {
            handlerInvocationCount += 1;
            await neverReleasedGate;
          })
        );

        let fallbackRan = false;
        const fallbackSettled = createDeferred();
        mediator.registerHandler(
          'fallback-target',
          UNMOUNT_EXT,
          ActionHandler.fromFunction(async () => {
            fallbackRan = true;
            fallbackSettled.resolve();
          })
        );

        // Take the OTHER reservation, deliberately never awaited. Its
        // synchronous prefix — including invoking the handler above — runs
        // in this same synchronous turn (`inst-reserve-first-node`).
        void mediator.runAcceptedChain({
          action: { type: MOUNT_EXT, target: 'domain-1', payload: { subject: 'other' } },
        });
        expect(handlerInvocationCount).toBe(1);

        // Retire domain-1 logically while that reservation is still
        // standing: physical registrations survive.
        mediator.unregisterAllHandlers('domain-1');
        expect(
          (mediator as unknown as { actionHandlers: Map<string, unknown> }).actionHandlers.has('domain-1')
        ).toBe(true);

        const pendingActionsBefore =
          (mediator as unknown as { pendingActions: Map<string, Set<unknown>> }).pendingActions.get(
            'domain-1'
          )?.size ?? 0;

        // A NEW delivery to the now-retired-but-physically-retained target,
        // accepted exactly as a receiving registry would via
        // `DefaultMfeRegistry.receiveCrossHopNode` -> `acceptSingleNodeForHop`.
        const deliveredAction = {
          type: MOUNT_EXT,
          target: 'domain-1',
          payload: { subject: 'new-delivery' },
        };
        mediator.acceptSingleNodeForHop({
          action: deliveredAction,
          fallback: { action: { type: UNMOUNT_EXT, target: 'fallback-target', payload: {} } },
        });

        // Acceptance must NOT have added a reservation for this delivery —
        // the pending count against domain-1 is unchanged from before this
        // call, taken synchronously, before the scheduled microtask runs.
        const pendingActionsAfter =
          (mediator as unknown as { pendingActions: Map<string, Set<unknown>> }).pendingActions.get(
            'domain-1'
          )?.size ?? 0;
        expect(pendingActionsAfter).toBe(pendingActionsBefore);

        // No resolution bypass was granted to this delivery's Action object
        // either.
        expect(
          (
            mediator as unknown as { actionsReservedBeforeResolution: WeakSet<object> }
          ).actionsReservedBeforeResolution.has(deliveredAction)
        ).toBe(false);

        // Let the scheduled execution run — an explicit settlement signal
        // from inside the fallback handler itself, never a poll.
        await fallbackSettled.promise;
        // Still exactly ONE invocation — the OTHER dispatch's own. This
        // delivery never reached the handler a second time.
        expect(handlerInvocationCount).toBe(1);
        expect(fallbackRan).toBe(true);
      }
    );
  }
);

describe(
  'DefaultActionsChainsMediator — a locally registered target whose ' +
    'dispatched action type has no local match is not reserved at acceptance when routed onward ' +
    '(wouldResolveLocallyNow)',
  () => {
    it(
      'a target with a local handler registered under a DIFFERENT action type — no keyed, no ' +
        'hierarchy-derived, and no catch-all match for the DISPATCHED action type — is not reserved at ' +
        'this intermediate registry when routed onward through a forwarding entry: `pendingActions` ' +
        'never gains an entry for it, neither synchronously at acceptance nor during the onward delivery',
      async () => {
        const sendSettled = createDeferred();
        let pendingActionsHadEntryAtSendTime: boolean | undefined;

        const mediator = makeMediatorWithConfig({
          resolveForwardingEntry: (targetId) =>
            targetId === 'domain-1'
              ? new CrossHopRoute((): void => {
                  const pendingActions = (
                    mediator as unknown as { pendingActions: Map<string, Set<unknown>> }
                  ).pendingActions;
                  pendingActionsHadEntryAtSendTime = pendingActions.has('domain-1');
                  sendSettled.resolve();
                })
              : undefined,
        });

        // A local handler IS registered for domain-1, but under LOAD_EXT —
        // not the action type dispatched below (MOUNT_EXT). Neither mock ID
        // derives from the other (`isTypeOf`), and no catch-all is
        // registered either, so `wouldResolveLocallyNow('domain-1',
        // MOUNT_EXT)` must be `false` even though
        // `actionHandlers.has('domain-1')` is `true`.
        mediator.registerHandler('domain-1', LOAD_EXT, ActionHandler.fromFunction(async () => {}));

        const action = { type: MOUNT_EXT, target: 'domain-1', payload: {} };
        mediator.acceptSingleNodeForHop({ action });

        // Not reserved synchronously at acceptance, before the scheduled
        // microtask has even run.
        const pendingActions = (
          mediator as unknown as { pendingActions: Map<string, Set<unknown>> }
        ).pendingActions;
        expect(pendingActions.has('domain-1')).toBe(false);
        expect(
          (
            mediator as unknown as { actionsReservedBeforeResolution: WeakSet<object> }
          ).actionsReservedBeforeResolution.has(action)
        ).toBe(false);

        // Let the scheduled onward delivery run — an explicit settlement
        // signal from inside the route's own `send`, never a poll.
        await sendSettled.promise;
        expect(pendingActionsHadEntryAtSendTime).toBe(false);
      }
    );
  }
);

describe(
  'DefaultActionsChainsMediator — failure-report de-duplication is EXECUTION-scoped, not mediator-wide',
  () => {
    it(
      'a handler that rethrows the SAME Error INSTANCE on a later, independent dispatch still has that ' +
        'later failure reported — a mediator-wide de-duplication set would recognize the object from the ' +
        "FIRST dispatch and silently swallow the SECOND dispatch's own report and path entry",
      async () => {
        const { sink, chainNodeFailures } = makeCapturingDiagnosticSink();
        const mediator = makeMediatorWithConfig({ diagnosticSink: sink });

        // ONE `Error` object, deliberately reused (not `new Error(...)` per
        // call) — the exact shape of the hole: a handler that caches and
        // rethrows a single static instance across dispatches.
        const sharedError = new Error('same Error instance, rethrown across independent dispatches');
        mediator.registerHandler(
          'domain-1',
          MOUNT_EXT,
          ActionHandler.fromFunction(async () => {
            throw sharedError;
          })
        );

        const makeChain = (): ActionsChain => ({
          action: { type: MOUNT_EXT, target: 'domain-1', payload: {} },
        });

        // First, standalone accepted execution.
        const first = await mediator.runAcceptedChain(makeChain());
        // Second, entirely INDEPENDENT accepted execution — same mediator
        // instance, same thrown object, no relation to the first beyond that.
        const second = await mediator.runAcceptedChain(makeChain());

        expect(first.completed).toBe(false);
        expect(second.completed).toBe(false);

        // Both independent dispatches must each produce their OWN structured
        // diagnostic — the whole point of `inst-diagnostic-record`'s "for a
        // refusal and for every node failure alike" is that NEITHER attempt
        // is silently unattributed. Two reports, not one.
        expect(chainNodeFailures).toHaveLength(2);
        expect(chainNodeFailures[0]).toMatchObject({
          classification: 'chain-node-failure',
          path: [MOUNT_EXT],
          target: 'domain-1',
          failureClass: 'handler-failure',
        });
        expect(chainNodeFailures[1]).toMatchObject({
          classification: 'chain-node-failure',
          path: [MOUNT_EXT],
          target: 'domain-1',
          failureClass: 'handler-failure',
        });
        // Genuinely independent executions: distinct correlation identities.
        expect(chainNodeFailures[0]!.correlationId).not.toEqual(chainNodeFailures[1]!.correlationId);
      }
    );
  }
);

describe(
  'DefaultActionsChainsMediator — a throwing diagnostic sink is CONTAINED, never suppressing ' +
    "a chain's own fallback",
  () => {
    it(
      "a `reportChainNodeFailure` sink that itself throws still lets the failed node's declared " +
        'fallback run to completion — the sink failure must never propagate and abort the chain\'s ' +
        'own recursion',
      async () => {
        const throwingSink: MfeDiagnosticSink = {
          reportLifecycleDispatchRefusal() {},
          reportChainNodeFailure() {
            throw new Error('diagnostic sink itself is broken');
          },
        };
        const mediator = makeMediatorWithConfig({ diagnosticSink: throwingSink });
        let fallbackRan = false;
        mediator.registerHandler(
          'domain-1',
          MOUNT_EXT,
          ActionHandler.fromFunction(async () => {
            throw new Error('node fails');
          })
        );
        mediator.registerHandler(
          'domain-1',
          LOAD_EXT,
          ActionHandler.fromFunction(async () => {
            fallbackRan = true;
          })
        );

        const chain: ActionsChain = {
          action: { type: MOUNT_EXT, target: 'domain-1', payload: {} },
          fallback: { action: { type: LOAD_EXT, target: 'domain-1', payload: {} } },
        };

        const result = await mediator.runAcceptedChain(chain);

        expect(fallbackRan).toBe(true);
        expect(result.completed).toBe(true);
      }
    );
  }
);

describe(
  'DefaultActionsChainsMediator — accumulated-path diagnostics',
  () => {
    it(
      'reports a TWO-entry path, each node once, when a chain of exactly two nodes fails at the ' +
        'second node with no fallback anywhere — not a THREE-entry path double-counting the first ' +
        'node via the ancestor frame that re-catches the propagated failure',
      async () => {
        const { sink, chainNodeFailures } = makeCapturingDiagnosticSink();
        const mediator = makeMediatorWithConfig({ diagnosticSink: sink });
        mediator.registerHandler('domain-1', MOUNT_EXT, ActionHandler.fromFunction(async () => {}));
        mediator.registerHandler(
          'domain-1',
          UNMOUNT_EXT,
          ActionHandler.fromFunction(async () => {
            throw new Error('second node fails');
          })
        );

        const chain: ActionsChain = {
          action: { type: MOUNT_EXT, target: 'domain-1', payload: {} },
          next: { action: { type: UNMOUNT_EXT, target: 'domain-1', payload: {} } },
        };

        const result = await mediator.runAcceptedChain(chain);

        // The truthful path: each of the two attempted nodes exactly once,
        // in order — not the first node counted twice via the ancestor's
        // own re-catch of the propagated failure.
        expect(result.completed).toBe(false);
        expect(result.path).toEqual([MOUNT_EXT, UNMOUNT_EXT]);

        // The single-report guard (`reportedFailures`) still holds: exactly
        // ONE structured diagnostic, naming the node that actually failed,
        // and carrying the SAME truthful (two-entry) path.
        expect(chainNodeFailures).toHaveLength(1);
        expect(chainNodeFailures[0]).toMatchObject({
          classification: 'chain-node-failure',
          path: [MOUNT_EXT, UNMOUNT_EXT],
          target: 'domain-1',
          failureClass: 'handler-failure',
        });
      }
    );

    it(
      "ends the chain at the failed node: a failed 'next' with no fallback of its own is NEVER " +
        "re-caught by, and never selects the fallback of, the ANCESTOR node that dispatched it — " +
        "the ancestor's own fallback must NOT run, and the chain settles non-completed at the " +
        'failed node with a truthful, two-entry path',
      async () => {
        const { sink, chainNodeFailures } = makeCapturingDiagnosticSink();
        const mediator = makeMediatorWithConfig({ diagnosticSink: sink });
        let ancestorFallbackRan = false;
        mediator.registerHandler('domain-1', MOUNT_EXT, ActionHandler.fromFunction(async () => {}));
        mediator.registerHandler(
          'domain-1',
          UNMOUNT_EXT,
          ActionHandler.fromFunction(async () => {
            throw new Error("next fails, no fallback of its own");
          })
        );
        mediator.registerHandler(
          'domain-1',
          LOAD_EXT,
          ActionHandler.fromFunction(async () => {
            ancestorFallbackRan = true;
          })
        );

        const chain: ActionsChain = {
          action: { type: MOUNT_EXT, target: 'domain-1', payload: {} },
          next: { action: { type: UNMOUNT_EXT, target: 'domain-1', payload: {} } },
          fallback: { action: { type: LOAD_EXT, target: 'domain-1', payload: {} } },
        };

        const result = await mediator.runAcceptedChain(chain);

        // The ANCESTOR's own fallback must NEVER run for a failure that
        // belongs entirely to its `next` continuation, which declared no
        // fallback of its own — the failure is handled entirely within
        // that continuation, and the chain ends there.
        expect(ancestorFallbackRan).toBe(false);
        expect(result.completed).toBe(false);
        expect(result.path).toEqual([MOUNT_EXT, UNMOUNT_EXT]);

        // Reported exactly once, naming the node that actually failed —
        // never the ancestor re-observing the same failure.
        expect(chainNodeFailures).toHaveLength(1);
        expect(chainNodeFailures[0]).toMatchObject({
          classification: 'chain-node-failure',
          path: [MOUNT_EXT, UNMOUNT_EXT],
          target: 'domain-1',
          failureClass: 'handler-failure',
        });
      }
    );

    it(
      'a node failing several hops away reports a path INCLUDING the sending executor\'s own prefix, ' +
        'rather than a bare single entry naming only the remote node — the sender\'s accumulated path ' +
        "travels inside the cross-hop envelope's existing diagnostics context (senderPath)",
      async () => {
        // The remote node's execution is scheduled on a microtask by
        // `acceptSingleNodeForHop`, strictly after the hand-over call
        // returns — an explicit settlement signal (never a blind microtask
        // flush) tells this test when that reporting has happened.
        let signalRemoteFailureReported: () => void = () => {};
        const remoteFailureReported = new Promise<void>((resolve) => {
          signalRemoteFailureReported = resolve;
        });
        const { chainNodeFailures: remoteFailures } = makeCapturingDiagnosticSink();
        const remoteSink: MfeDiagnosticSink = {
          reportLifecycleDispatchRefusal() {},
          reportChainNodeFailure(diagnostic) {
            remoteFailures.push(diagnostic);
            signalRemoteFailureReported();
          },
        };
        const remoteMediator = makeMediatorWithConfig({ diagnosticSink: remoteSink });
        // The remote registry has no handler at all for 't-remote'/UNMOUNT_EXT
        // — its OWN local node execution fails with NoHandlerForActionTargetError.

        const localMediator = makeMediatorWithConfig({
          resolveForwardingEntry: (targetId) =>
            targetId === 't-remote'
              ? new CrossHopRoute(
                  // Simulates `DefaultMfeRegistry.receiveCrossHopNode`: reconstruct
                  // the diagnostic context (including `senderPath`) from the
                  // envelope and accept exactly one node onto the remote mediator.
                  (envelope: CrossHopEnvelope): void => {
                    remoteMediator.acceptSingleNodeForHop(
                      envelope.node,
                      fromEnvelopeDiagnostics(envelope.diagnostics)
                    );
                  }
                )
              : undefined,
        });
        localMediator.registerHandler('domain-1', MOUNT_EXT, ActionHandler.fromFunction(async () => {}));

        const chain: ActionsChain = {
          action: { type: MOUNT_EXT, target: 'domain-1', payload: {} },
          next: { action: { type: UNMOUNT_EXT, target: 't-remote', payload: {} } },
        };

        const result = await localMediator.runAcceptedChain(chain);

        expect(result.completed).toBe(false);

        await remoteFailureReported;

        // The REMOTE registry's own structured diagnostic — the only
        // attribution surface for a chain failing where nobody local is
        // watching — must carry the FULL path leading to the failing node,
        // not a disconnected single entry for the remote node alone.
        expect(remoteFailures).toHaveLength(1);
        expect(remoteFailures[0]).toMatchObject({
          classification: 'chain-node-failure',
          path: [MOUNT_EXT, UNMOUNT_EXT],
          target: 't-remote',
          failureClass: 'missing-handler',
        });
      }
    );
  }
);

describe(
  'DefaultActionsChainsMediator — acceptSingleNodeForHop validates the COMPLETE handed-over ' +
    'sub-chain before taking any reservation, refusing synchronously with no state left at the receiver',
  () => {
    function pendingReservationCount(
      mediator: DefaultActionsChainsMediator,
      targetId: string
    ): number {
      const pending = (
        mediator as unknown as { pendingActions: Map<string, Set<Promise<void>>> }
      ).pendingActions;
      return pending.get(targetId)?.size ?? 0;
    }

    it('refuses synchronously, with no reservation left, when a continuation is malformed', () => {
      const mediator = makeMediator();

      expect(() =>
        mediator.acceptSingleNodeForHop({
          action: { type: MOUNT_EXT, target: 'domain-1', payload: {} },
          // A `next` that is present but not itself a conforming chain
          // object — the exact shape `validateChainEnvelope` refuses.
          next: 'not-a-chain-node' as unknown as ActionsChain,
        })
      ).toThrow();

      expect(pendingReservationCount(mediator, 'domain-1')).toBe(0);
    });

    it('refuses synchronously, with no reservation left, when the handed-over sub-chain closes a cycle', () => {
      const mediator = makeMediator();

      const cyclic: Record<string, unknown> = {
        action: { type: MOUNT_EXT, target: 'domain-1', payload: {} },
      };
      // `next` points back at the same node object — a self-cycle.
      cyclic['next'] = cyclic;

      expect(() =>
        mediator.acceptSingleNodeForHop(cyclic as unknown as ActionsChain)
      ).toThrow();

      expect(pendingReservationCount(mediator, 'domain-1')).toBe(0);
    });

    it('refuses synchronously, with no reservation left, when the handed-over node declares an invalid timeout', () => {
      const mediator = makeMediator();

      expect(() =>
        mediator.acceptSingleNodeForHop({
          action: { type: MOUNT_EXT, target: 'domain-1', payload: {}, timeout: -1 },
        })
      ).toThrow();

      expect(pendingReservationCount(mediator, 'domain-1')).toBe(0);
    });

    it(
      'a cycle in a CONTINUATION handed over by a forwarding entry refuses the delivery at the sending ' +
        "runtime's own call, so ONLY the delivering runtime's fallback runs — the receiving registry " +
        'takes no reservation and its own handler for the target is never invoked',
      async () => {
        const { sink } = makeCapturingDiagnosticSink();
        let fallbackRan = false;
        let remoteHandlerRan = false;
        const remoteMediator = makeMediatorWithConfig({ diagnosticSink: sink });
        remoteMediator.registerHandler(
          'domain-1',
          UNMOUNT_EXT,
          ActionHandler.fromFunction(async () => {
            remoteHandlerRan = true;
          })
        );

        const localMediator = makeMediatorWithConfig({
          resolveForwardingEntry: (targetId) =>
            targetId === 't-remote'
              ? new CrossHopRoute((envelope: CrossHopEnvelope): void => {
                  remoteMediator.acceptSingleNodeForHop(
                    envelope.node,
                    fromEnvelopeDiagnostics(envelope.diagnostics)
                  );
                })
              : undefined,
        });
        localMediator.registerHandler(
          'domain-1',
          LOAD_EXT,
          ActionHandler.fromFunction(async () => {
            fallbackRan = true;
          })
        );

        const cyclicContinuation: Record<string, unknown> = {
          action: { type: UNMOUNT_EXT, target: 't-remote', payload: {} },
        };
        cyclicContinuation['next'] = cyclicContinuation;

        const chain: ActionsChain = {
          action: { type: MOUNT_EXT, target: 'domain-1', payload: {} },
          next: cyclicContinuation as unknown as ActionsChain,
          fallback: { action: { type: LOAD_EXT, target: 'domain-1', payload: {} } },
        };

        const result = await localMediator.runAcceptedChain(chain);

        expect(fallbackRan).toBe(true);
        expect(result.completed).toBe(true);
        expect(remoteHandlerRan).toBe(false);
        expect(pendingReservationCount(remoteMediator, 't-remote')).toBe(0);
      }
    );
  }
);

describe(
  'DefaultActionsChainsMediator — dispose() ends every execution this executor holds ' +
    '(inst-executor-teardown-ends)',
  () => {
    function pendingReservationCount(
      mediator: DefaultActionsChainsMediator,
      targetId: string
    ): number {
      const pending = (
        mediator as unknown as { pendingActions: Map<string, Set<Promise<void>>> }
      ).pendingActions;
      return pending.get(targetId)?.size ?? 0;
    }

    it(
      'a node whose handler settles SUCCESSFULLY after this executor is disposed selects neither ' +
        '`next` nor `fallback`, dispatches no continuation, and records no chain-failure diagnostic; ' +
        "its reservation is released so the target's drain still completes",
      async () => {
        const { sink, chainNodeFailures } = makeCapturingDiagnosticSink();
        const mediator = makeMediatorWithConfig({ diagnosticSink: sink });

        let nextRan = false;
        let fallbackRan = false;
        const settleGate = createDeferred();
        mediator.registerHandler(
          'domain-1',
          MOUNT_EXT,
          ActionHandler.fromFunction(async () => {
            await settleGate.promise;
          })
        );
        mediator.registerHandler(
          'domain-1',
          UNMOUNT_EXT,
          ActionHandler.fromFunction(async () => {
            nextRan = true;
          })
        );
        mediator.registerHandler(
          'domain-1',
          LOAD_EXT,
          ActionHandler.fromFunction(async () => {
            fallbackRan = true;
          })
        );

        const chain: ActionsChain = {
          action: { type: MOUNT_EXT, target: 'domain-1', payload: {} },
          next: { action: { type: UNMOUNT_EXT, target: 'domain-1', payload: {} } },
          fallback: { action: { type: LOAD_EXT, target: 'domain-1', payload: {} } },
        };

        const resultPromise = mediator.runAcceptedChain(chain);
        // The node's own attempt is in flight (awaiting `settleGate`) —
        // reserved against its target — when this executor is disposed.
        expect(pendingReservationCount(mediator, 'domain-1')).toBe(1);
        mediator.dispose();

        // Settle the in-flight attempt AFTER disposal, successfully.
        settleGate.resolve();
        const result = await resultPromise;

        expect(nextRan).toBe(false);
        expect(fallbackRan).toBe(false);
        expect(chainNodeFailures).toEqual([]);
        expect(result.completed).toBe(false);
        expect(pendingReservationCount(mediator, 'domain-1')).toBe(0);
      }
    );

    it(
      'a node whose handler settles by FAILING after this executor is disposed selects neither ' +
        '`next` nor `fallback`, dispatches no continuation, and records no chain-failure diagnostic; ' +
        "its reservation is released so the target's drain still completes",
      async () => {
        const { sink, chainNodeFailures } = makeCapturingDiagnosticSink();
        const mediator = makeMediatorWithConfig({ diagnosticSink: sink });

        let fallbackRan = false;
        const settleGate = createDeferred();
        mediator.registerHandler(
          'domain-1',
          MOUNT_EXT,
          ActionHandler.fromFunction(async () => {
            await settleGate.promise;
            throw new Error('handler fails after disposal');
          })
        );
        mediator.registerHandler(
          'domain-1',
          LOAD_EXT,
          ActionHandler.fromFunction(async () => {
            fallbackRan = true;
          })
        );

        const chain: ActionsChain = {
          action: { type: MOUNT_EXT, target: 'domain-1', payload: {} },
          fallback: { action: { type: LOAD_EXT, target: 'domain-1', payload: {} } },
        };

        const resultPromise = mediator.runAcceptedChain(chain);
        expect(pendingReservationCount(mediator, 'domain-1')).toBe(1);
        mediator.dispose();

        // Settle the in-flight attempt AFTER disposal, with a failure.
        settleGate.resolve();
        const result = await resultPromise;

        expect(fallbackRan).toBe(false);
        expect(chainNodeFailures).toEqual([]);
        expect(result.completed).toBe(false);
        expect(pendingReservationCount(mediator, 'domain-1')).toBe(0);
      }
    );

    it(
      'a scheduled cross-hop accepted node whose executor is disposed BEFORE its execution starts ' +
        'never invokes its handler, and its acceptance reservation is released',
      async () => {
        const mediator = makeMediator();

        let handlerRan = false;
        mediator.registerHandler(
          'domain-1',
          MOUNT_EXT,
          ActionHandler.fromFunction(async () => {
            handlerRan = true;
          })
        );

        const action = { type: MOUNT_EXT, target: 'domain-1', payload: {} };
        mediator.acceptSingleNodeForHop({ action });

        // Acceptance reserved synchronously, before the scheduled
        // microtask that would resolve and invoke the handler has run.
        expect(pendingReservationCount(mediator, 'domain-1')).toBe(1);

        // Captured BEFORE `dispose()` — the reservation `dispose()` must
        // release synchronously, and (once resolved) the deterministic
        // behavioural signal awaited below for the scheduled microtask
        // itself, never a bare microtask-flush hack.
        const pending = (
          mediator as unknown as { pendingActions: Map<string, Set<Promise<void>>> }
        ).pendingActions.get('domain-1');
        const reservation = pending ? [...pending][0] : undefined;
        expect(reservation).toBeDefined();

        mediator.dispose();

        // Released SYNCHRONOUSLY by `dispose()` itself — asserted here,
        // before awaiting anything at all, and before the scheduled
        // microtask that would otherwise have started the node has run.
        expect(pendingReservationCount(mediator, 'domain-1')).toBe(0);

        // The reservation promise was already resolved synchronously above;
        // awaiting it lets the scheduled microtask — which finds the
        // executor already disposed — run to completion before asserting
        // the handler never ran.
        await reservation;

        expect(handlerRan).toBe(false);
        expect(pendingReservationCount(mediator, 'domain-1')).toBe(0);
      }
    );

    it(
      'a handler that NEVER settles is not waited for: dispose() ends the attempt immediately, ' +
        'releases its reservation, selects neither `next` nor `fallback`, records no chain-failure ' +
        "diagnostic, and the handler's later rejection produces no unhandled rejection",
      async () => {
        const { sink, chainNodeFailures } = makeCapturingDiagnosticSink();
        const mediator = makeMediatorWithConfig({ diagnosticSink: sink });

        let nextRan = false;
        let fallbackRan = false;
        const neverSettles = createRejectableDeferred();
        mediator.registerHandler(
          'domain-1',
          MOUNT_EXT,
          // Returns the SAME never-yet-settled promise every call — the
          // handler itself never resolves or rejects on its own.
          ActionHandler.fromFunction(() => neverSettles.promise)
        );
        mediator.registerHandler(
          'domain-1',
          UNMOUNT_EXT,
          ActionHandler.fromFunction(async () => {
            nextRan = true;
          })
        );
        mediator.registerHandler(
          'domain-1',
          LOAD_EXT,
          ActionHandler.fromFunction(async () => {
            fallbackRan = true;
          })
        );

        const chain: ActionsChain = {
          action: { type: MOUNT_EXT, target: 'domain-1', payload: {} },
          next: { action: { type: UNMOUNT_EXT, target: 'domain-1', payload: {} } },
          fallback: { action: { type: LOAD_EXT, target: 'domain-1', payload: {} } },
        };

        const resultPromise = mediator.runAcceptedChain(chain);
        // The node's own attempt is in flight — reserved against its
        // target — and its handler will NEVER settle on its own.
        expect(pendingReservationCount(mediator, 'domain-1')).toBe(1);

        mediator.dispose();

        // Released SYNCHRONOUSLY by `dispose()` itself — asserted here,
        // before awaiting `resultPromise` at all: the handler's gate is
        // never resolved, so a release that instead waited on the
        // handler's own promise (a promise reaction one microtask removed
        // from `dispose()` returning) would leave this reservation standing
        // right here, forever.
        expect(pendingReservationCount(mediator, 'domain-1')).toBe(0);

        // Settles WITHOUT the handler's gate ever being resolved.
        const result = await resultPromise;

        expect(result.completed).toBe(false);
        expect(result.handedOver).toBeUndefined();
        expect(result.tornDown).toBe(true);
        expect(nextRan).toBe(false);
        expect(fallbackRan).toBe(false);
        expect(chainNodeFailures).toEqual([]);
        expect(pendingReservationCount(mediator, 'domain-1')).toBe(0);

        // The handler's own promise settles LATER, by rejecting — this must
        // never surface as an unhandled rejection now that the attempt has
        // already moved on without it.
        neverSettles.reject(new Error('late rejection after teardown'));
        await neverSettles.promise.catch(() => {});
      }
    );

    it(
      'a declared-timeout node torn down before its timeout elapses never raises a timeout ' +
        'diagnostic — the timer is disarmed by disposal, not merely outrun by it',
      async () => {
        vi.useFakeTimers();
        try {
          const { sink, chainNodeFailures } = makeCapturingDiagnosticSink();
          const mediator = makeMediatorWithConfig({ diagnosticSink: sink });

          const neverSettles = createDeferred();
          mediator.registerHandler(
            'domain-1',
            MOUNT_EXT,
            ActionHandler.fromFunction(() => neverSettles.promise)
          );

          const chain: ActionsChain = {
            action: { type: MOUNT_EXT, target: 'domain-1', payload: {}, timeout: 50 },
          };

          const resultPromise = mediator.runAcceptedChain(chain);
          expect(pendingReservationCount(mediator, 'domain-1')).toBe(1);
          expect(vi.getTimerCount()).toBe(1);

          mediator.dispose();

          // Both the timer and the reservation are gone SYNCHRONOUSLY, the
          // instant `dispose()` returns — before awaiting `resultPromise`
          // at all. The timer's own disarm is a direct, synchronous call
          // from the teardown callback, never a promise reaction queued
          // behind it.
          expect(vi.getTimerCount()).toBe(0);
          expect(pendingReservationCount(mediator, 'domain-1')).toBe(0);

          const result = await resultPromise;
          expect(result.completed).toBe(false);
          expect(result.tornDown).toBe(true);

          // The timer itself was disarmed by disposal — not merely
          // abandoned — so no timer is left scheduled at all.
          expect(vi.getTimerCount()).toBe(0);

          // Advance PAST the declared timeout: were the timer still armed,
          // its rejection would otherwise be observed here as a chain-node
          // failure diagnostic.
          await vi.advanceTimersByTimeAsync(100);

          expect(chainNodeFailures).toEqual([]);
        } finally {
          vi.useRealTimers();
        }
      }
    );

    it(
      'disposing the SENDING executor after it has successfully handed a node over does not affect ' +
        "the far side's execution: the receiving executor still dispatches its own `next` for it",
      async () => {
        let signalRemoteNextRan: () => void = () => {};
        const remoteNextRan = new Promise<void>((resolve) => {
          signalRemoteNextRan = resolve;
        });
        const remoteMediator = makeMediator();
        remoteMediator.registerHandler(
          't-remote',
          MOUNT_EXT,
          ActionHandler.fromFunction(async () => {})
        );
        remoteMediator.registerHandler(
          't-remote',
          UNMOUNT_EXT,
          ActionHandler.fromFunction(async () => {
            signalRemoteNextRan();
          })
        );

        const localMediator = makeMediatorWithConfig({
          resolveForwardingEntry: (targetId) =>
            targetId === 't-remote'
              ? new CrossHopRoute((envelope: CrossHopEnvelope): void => {
                  remoteMediator.acceptSingleNodeForHop(
                    envelope.node,
                    fromEnvelopeDiagnostics(envelope.diagnostics)
                  );
                })
              : undefined,
        });

        const chain: ActionsChain = {
          action: { type: MOUNT_EXT, target: 't-remote', payload: {} },
          next: { action: { type: UNMOUNT_EXT, target: 't-remote', payload: {} } },
        };

        // Hand the node over — the local (sending) executor's own path
        // ends here, having handed it off, before it is disposed below.
        localMediator.executeActionsChain(chain);

        // The SENDING executor is disposed right after the successful
        // hand-over — it held nothing for this node at that point, so its
        // own teardown cannot affect what the far side does with it.
        localMediator.dispose();

        await remoteNextRan;
      }
    );

    it(
      'holds no per-attempt teardown subscription once an attempt has settled: after many attempts ' +
        'settle normally, this executor retains zero registered teardown callbacks',
      async () => {
        const mediator = makeMediator();
        mediator.registerHandler(
          'domain-1',
          MOUNT_EXT,
          ActionHandler.fromFunction(async () => {})
        );

        const teardownCallbackCount = (): number =>
          (mediator as unknown as { teardownCallbacks: Set<() => void> }).teardownCallbacks.size;

        const attemptCount = 50;
        for (let i = 0; i < attemptCount; i++) {
          const chain: ActionsChain = {
            action: { type: MOUNT_EXT, target: 'domain-1', payload: {} },
          };
          // Each attempt's own teardown subscription is registered
          // synchronously (inside `executeLocalNode`) and removed, in its
          // own `finally`, the instant this settled attempt is awaited —
          // never left standing past the attempt it belongs to
          // (`inst-executor-teardown-ends`).
          await mediator.runAcceptedChain(chain);
        }

        expect(teardownCallbackCount()).toBe(0);
      }
    );
  }
);
