import { describe, it, expect, afterEach, vi } from 'vitest';
import { DefaultActionsChainsMediator } from '../DefaultActionsChainsMediator';
import { ActionHandler } from '../ActionHandler';
import { CROSS_HOP_PROTOCOL_VERSION, CrossHopRoute } from '../CrossHopRoute';
import type { CrossHopEnvelope } from '../CrossHopRoute';
import type { TypeSystemPlugin } from '../../type-substrate';
import type { MfeEntry, ActionsChain } from '../../types';
import type { ExtensionDomainState } from '../../runtime/ExtensionManager';

// Mock-plugin-local stand-ins for the framework's well-known lifecycle action
// IDs, deliberately NOT the real GTS strings — proves the mediator's
// paths never assume any particular notation.
const MOUNT_EXT = 'mock.action.v1~mount_ext.v1~';
const UNMOUNT_EXT = 'mock.action.v1~unmount_ext.v1~';
const LOAD_EXT = 'mock.action.v1~load_ext.v1~';
const STAGE_INIT = 'mock.stage.v1~init.v1';
const STAGE_ACTIVATED = 'mock.stage.v1~activated.v1';
const STAGE_DEACTIVATED = 'mock.stage.v1~deactivated.v1';
const STAGE_DESTROYED = 'mock.stage.v1~destroyed.v1';
const ACTION_A = 'mock.action.v1~a.v1~';
const ACTION_B = 'mock.action.v1~b.v1~';
const ACTION_C = 'mock.action.v1~c.v1~';
const DEFAULT_TIMEOUT = 5000;

function createMockPlugin(register: (action: unknown) => void = () => {}): TypeSystemPlugin<unknown> {
  return {
    name: 'MockPlugin',
    version: '1.0.0',
    registerSchema(): void {},
    getSchema(): undefined {
      return undefined;
    },
    register,
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
      defaultActionTimeout: DEFAULT_TIMEOUT,
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

function makeMediator(config: {
  getExtensionEntry?: (id: string) => MfeEntry | undefined;
  resolveForwardingEntry?: (targetId: string, arrivalEdge: unknown) => CrossHopRoute | undefined;
  register?: (action: unknown) => void;
} = {}): DefaultActionsChainsMediator {
  return new DefaultActionsChainsMediator({
    typeSystem: createMockPlugin(config.register),
    getDomainState: () => makeDomainState(),
    getExtensionEntry: config.getExtensionEntry ?? (() => undefined),
    resolveForwardingEntry: config.resolveForwardingEntry,
  });
}

/** A settlement signal a handler resolves explicitly — never a poll. */
function createDeferred(): { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A handler that records its invocation and resolves `reached`. */
function recordingHandler(): { handler: ActionHandler; reached: ReturnType<typeof createDeferred>; calls: number[] } {
  const reached = createDeferred();
  const calls: number[] = [];
  const handler = ActionHandler.fromFunction(async () => {
    calls.push(1);
    reached.resolve();
  });
  return { handler, reached, calls };
}

/**
 * Runs the mediator's internal recursion for `chain` and resolves once it
 * has ended — the deterministic synchronisation point for asserting that a
 * branch did NOT run.
 */
function executeToEnd(mediator: DefaultActionsChainsMediator, chain: ActionsChain): Promise<void> {
  return (mediator as unknown as { executeChain(c: ActionsChain): Promise<void> }).executeChain(chain);
}

const failing = (): ActionHandler =>
  ActionHandler.fromFunction(async () => {
    throw new Error('action fails');
  });
const succeeding = (): ActionHandler => ActionHandler.fromFunction(async () => {});

afterEach(() => {
  vi.useRealTimers();
});

describe('DefaultActionsChainsMediator — recursive chain execution', () => {
  it('executeActionsChain returns nothing awaitable', () => {
    const mediator = makeMediator();
    mediator.registerHandler('domain-1', ACTION_A, succeeding());

    const result: unknown = mediator.executeActionsChain({ action: { type: ACTION_A, target: 'domain-1' } });

    expect(result).toBeUndefined();
  });

  it('on success executes `next`, not `fallback`', async () => {
    const mediator = makeMediator();
    const next = recordingHandler();
    const fallback = recordingHandler();
    mediator.registerHandler('domain-1', ACTION_A, succeeding());
    mediator.registerHandler('domain-1', ACTION_B, next.handler);
    mediator.registerHandler('domain-1', ACTION_C, fallback.handler);

    mediator.executeActionsChain({
      action: { type: ACTION_A, target: 'domain-1' },
      next: { action: { type: ACTION_B, target: 'domain-1' } },
      fallback: { action: { type: ACTION_C, target: 'domain-1' } },
    });

    await next.reached.promise;
    expect(next.calls).toHaveLength(1);
    expect(fallback.calls).toHaveLength(0);
  });

  it('on a handler that rejects executes `fallback`, not `next`', async () => {
    const mediator = makeMediator();
    const next = recordingHandler();
    const fallback = recordingHandler();
    mediator.registerHandler('domain-1', ACTION_A, failing());
    mediator.registerHandler('domain-1', ACTION_B, next.handler);
    mediator.registerHandler('domain-1', ACTION_C, fallback.handler);

    mediator.executeActionsChain({
      action: { type: ACTION_A, target: 'domain-1' },
      next: { action: { type: ACTION_B, target: 'domain-1' } },
      fallback: { action: { type: ACTION_C, target: 'domain-1' } },
    });

    await fallback.reached.promise;
    expect(fallback.calls).toHaveLength(1);
    expect(next.calls).toHaveLength(0);
  });

  it('on a handler that throws synchronously executes `fallback`', async () => {
    class SyncThrowingHandler extends ActionHandler {
      handleAction(): Promise<void> {
        throw new Error('synchronous throw');
      }
    }
    const mediator = makeMediator();
    const fallback = recordingHandler();
    mediator.registerHandler('domain-1', ACTION_A, new SyncThrowingHandler());
    mediator.registerHandler('domain-1', ACTION_C, fallback.handler);

    mediator.executeActionsChain({
      action: { type: ACTION_A, target: 'domain-1' },
      fallback: { action: { type: ACTION_C, target: 'domain-1' } },
    });

    await fallback.reached.promise;
    expect(fallback.calls).toHaveLength(1);
  });

  it('ends the chain when the selected branch is absent: a failed action with only `next` runs nothing further', async () => {
    const mediator = makeMediator();
    const next = recordingHandler();
    mediator.registerHandler('domain-1', ACTION_A, failing());
    mediator.registerHandler('domain-1', ACTION_B, next.handler);

    await executeToEnd(mediator, {
      action: { type: ACTION_A, target: 'domain-1' },
      next: { action: { type: ACTION_B, target: 'domain-1' } },
    });

    expect(next.calls).toHaveLength(0);
  });

  it('ends the chain when the selected branch is absent: a succeeded action with only `fallback` runs nothing further', async () => {
    const mediator = makeMediator();
    const fallback = recordingHandler();
    mediator.registerHandler('domain-1', ACTION_A, succeeding());
    mediator.registerHandler('domain-1', ACTION_C, fallback.handler);

    await executeToEnd(mediator, {
      action: { type: ACTION_A, target: 'domain-1' },
      fallback: { action: { type: ACTION_C, target: 'domain-1' } },
    });

    expect(fallback.calls).toHaveLength(0);
  });

  it("a failed `next` with no fallback of its own ends the chain and never runs the parent's `fallback`", async () => {
    const mediator = makeMediator();
    const parentFallback = recordingHandler();
    mediator.registerHandler('domain-1', ACTION_A, succeeding());
    mediator.registerHandler('domain-1', ACTION_B, failing());
    mediator.registerHandler('domain-1', ACTION_C, parentFallback.handler);

    await executeToEnd(mediator, {
      action: { type: ACTION_A, target: 'domain-1' },
      next: { action: { type: ACTION_B, target: 'domain-1' } },
      fallback: { action: { type: ACTION_C, target: 'domain-1' } },
    });

    expect(parentFallback.calls).toHaveLength(0);
  });

  it('executes branches recursively: next → fallback → next', async () => {
    const mediator = makeMediator();
    const last = recordingHandler();
    mediator.registerHandler('domain-1', ACTION_A, succeeding());
    mediator.registerHandler('domain-1', ACTION_B, failing());
    mediator.registerHandler('domain-1', ACTION_C, succeeding());
    mediator.registerHandler('domain-1', MOUNT_EXT, last.handler);

    mediator.executeActionsChain({
      action: { type: ACTION_A, target: 'domain-1' },
      next: {
        action: { type: ACTION_B, target: 'domain-1' },
        fallback: {
          action: { type: ACTION_C, target: 'domain-1' },
          next: { action: { type: MOUNT_EXT, target: 'domain-1' } },
        },
      },
    });

    await last.reached.promise;
    expect(last.calls).toHaveLength(1);
  });

  it('resolves each action\'s handler when that action executes: a handler registered after dispatch serves `next`', async () => {
    const mediator = makeMediator();
    const gate = createDeferred();
    mediator.registerHandler('domain-1', ACTION_A, ActionHandler.fromFunction(() => gate.promise));

    mediator.executeActionsChain({
      action: { type: ACTION_A, target: 'domain-1' },
      next: { action: { type: ACTION_B, target: 'domain-1' } },
    });

    const next = recordingHandler();
    mediator.registerHandler('domain-1', ACTION_B, next.handler);
    gate.resolve();

    await next.reached.promise;
    expect(next.calls).toHaveLength(1);
  });
});

describe('DefaultActionsChainsMediator — failure causes lead to `fallback`', () => {
  it('a missing handler executes `fallback`', async () => {
    const mediator = makeMediator();
    const fallback = recordingHandler();
    mediator.registerHandler('domain-1', ACTION_C, fallback.handler);

    mediator.executeActionsChain({
      action: { type: ACTION_A, target: 'unregistered-target' },
      fallback: { action: { type: ACTION_C, target: 'domain-1' } },
    });

    await fallback.reached.promise;
    expect(fallback.calls).toHaveLength(1);
  });

  it('an admission failure executes `fallback` without invoking the handler', async () => {
    const mediator = makeMediator({
      register: (action) => {
        if ((action as { type: string }).type === ACTION_A) {
          throw new Error('not admitted');
        }
      },
    });
    const handler = recordingHandler();
    const fallback = recordingHandler();
    mediator.registerHandler('domain-1', ACTION_A, handler.handler);
    mediator.registerHandler('domain-1', ACTION_C, fallback.handler);

    mediator.executeActionsChain({
      action: { type: ACTION_A, target: 'domain-1' },
      fallback: { action: { type: ACTION_C, target: 'domain-1' } },
    });

    await fallback.reached.promise;
    expect(handler.calls).toHaveLength(0);
  });

  it('a declaration failure executes `fallback` without invoking the handler', async () => {
    const entry = { id: 'ext-1', actions: [] } as unknown as MfeEntry;
    const mediator = makeMediator({ getExtensionEntry: (id) => (id === 'ext-1' ? entry : undefined) });
    const handler = recordingHandler();
    const fallback = recordingHandler();
    mediator.registerHandler('ext-1', ACTION_A, handler.handler, 'domain-1');
    mediator.registerHandler('domain-1', ACTION_C, fallback.handler);

    mediator.executeActionsChain({
      action: { type: ACTION_A, target: 'ext-1' },
      fallback: { action: { type: ACTION_C, target: 'domain-1' } },
    });

    await fallback.reached.promise;
    expect(handler.calls).toHaveLength(0);
  });

  it("an expired per-action timeout executes `fallback` (the action's declared timeout)", async () => {
    vi.useFakeTimers();
    const mediator = makeMediator();
    const fallback = recordingHandler();
    mediator.registerHandler('domain-1', ACTION_A, ActionHandler.fromFunction(() => new Promise<void>(() => {})));
    mediator.registerHandler('domain-1', ACTION_C, fallback.handler);

    mediator.executeActionsChain({
      action: { type: ACTION_A, target: 'domain-1', timeout: 100 },
      fallback: { action: { type: ACTION_C, target: 'domain-1' } },
    });
    vi.advanceTimersByTime(100);

    await fallback.reached.promise;
    expect(fallback.calls).toHaveLength(1);
  });

  it('without a declared timeout the domain default applies: success before it expires runs `next`, not `fallback`', async () => {
    vi.useFakeTimers();
    const mediator = makeMediator();
    const gate = createDeferred();
    const next = recordingHandler();
    const fallback = recordingHandler();
    mediator.registerHandler('domain-1', ACTION_A, ActionHandler.fromFunction(() => gate.promise));
    mediator.registerHandler('domain-1', ACTION_B, next.handler);
    mediator.registerHandler('domain-1', ACTION_C, fallback.handler);

    mediator.executeActionsChain({
      action: { type: ACTION_A, target: 'domain-1' },
      next: { action: { type: ACTION_B, target: 'domain-1' } },
      fallback: { action: { type: ACTION_C, target: 'domain-1' } },
    });
    vi.advanceTimersByTime(DEFAULT_TIMEOUT - 1);
    gate.resolve();

    await next.reached.promise;
    expect(fallback.calls).toHaveLength(0);
  });

  it('without a declared timeout the domain default applies: expiry executes `fallback`', async () => {
    vi.useFakeTimers();
    const mediator = makeMediator();
    const fallback = recordingHandler();
    mediator.registerHandler('domain-1', ACTION_A, ActionHandler.fromFunction(() => new Promise<void>(() => {})));
    mediator.registerHandler('domain-1', ACTION_C, fallback.handler);

    mediator.executeActionsChain({
      action: { type: ACTION_A, target: 'domain-1' },
      fallback: { action: { type: ACTION_C, target: 'domain-1' } },
    });
    vi.advanceTimersByTime(DEFAULT_TIMEOUT);

    await fallback.reached.promise;
    expect(fallback.calls).toHaveLength(1);
  });
});

describe('DefaultActionsChainsMediator — hand-over across a hop', () => {
  it('hands the sub-chain — the action with its `next` and `fallback` — over in a versioned envelope', async () => {
    const envelopes: CrossHopEnvelope[] = [];
    const mediator = makeMediator({
      resolveForwardingEntry: (targetId) =>
        targetId === 't-remote' ? new CrossHopRoute((envelope) => envelopes.push(envelope)) : undefined,
    });
    const chain: ActionsChain = {
      action: { type: ACTION_A, target: 't-remote' },
      next: { action: { type: ACTION_B, target: 'domain-1' } },
      fallback: { action: { type: ACTION_C, target: 'domain-1' } },
    };

    await executeToEnd(mediator, chain);

    expect(envelopes).toEqual([{ version: CROSS_HOP_PROTOCOL_VERSION, chain }]);
    expect(envelopes[0]!.chain).toBe(chain);
  });

  it('an accepted hand-over is done here: neither `next` nor `fallback` executes at the delivering runtime', async () => {
    const next = recordingHandler();
    const fallback = recordingHandler();
    const mediator = makeMediator({
      resolveForwardingEntry: (targetId) => (targetId === 't-remote' ? new CrossHopRoute(() => {}) : undefined),
    });
    mediator.registerHandler('domain-1', ACTION_B, next.handler);
    mediator.registerHandler('domain-1', ACTION_C, fallback.handler);

    await executeToEnd(mediator, {
      action: { type: ACTION_A, target: 't-remote' },
      next: { action: { type: ACTION_B, target: 'domain-1' } },
      fallback: { action: { type: ACTION_C, target: 'domain-1' } },
    });

    expect(next.calls).toHaveLength(0);
    expect(fallback.calls).toHaveLength(0);
  });

  it('a refused hand-over executes `fallback` at the delivering runtime', async () => {
    const fallback = recordingHandler();
    const mediator = makeMediator({
      resolveForwardingEntry: (targetId) =>
        targetId === 't-remote'
          ? new CrossHopRoute(() => {
              throw new Error('refused');
            })
          : undefined,
    });
    mediator.registerHandler('domain-1', ACTION_C, fallback.handler);

    mediator.executeActionsChain({
      action: { type: ACTION_A, target: 't-remote' },
      fallback: { action: { type: ACTION_C, target: 'domain-1' } },
    });

    await fallback.reached.promise;
    expect(fallback.calls).toHaveLength(1);
  });

  it('a hand-over across two hops reaches the far runtime, which executes the sub-chain and its `next` itself', async () => {
    const farNext = recordingHandler();
    const far = makeMediator();
    far.registerHandler('domain-1', ACTION_A, succeeding());
    far.registerHandler('domain-1', ACTION_B, farNext.handler);
    const middle = makeMediator({
      resolveForwardingEntry: (targetId) =>
        targetId === 'domain-1' ? new CrossHopRoute((envelope) => far.receiveHandedOverChain(envelope.chain)) : undefined,
    });
    const near = makeMediator({
      resolveForwardingEntry: () => new CrossHopRoute((envelope) => middle.receiveHandedOverChain(envelope.chain)),
    });

    near.executeActionsChain({
      action: { type: ACTION_A, target: 'domain-1' },
      next: { action: { type: ACTION_B, target: 'domain-1' } },
    });

    await farNext.reached.promise;
    expect(farNext.calls).toHaveLength(1);
  });

  it('receiveHandedOverChain executes the sub-chain only after the hand-over call returns', async () => {
    const mediator = makeMediator();
    const handler = recordingHandler();
    mediator.registerHandler('domain-1', ACTION_A, handler.handler);

    mediator.receiveHandedOverChain({ action: { type: ACTION_A, target: 'domain-1' } });
    expect(handler.calls).toHaveLength(0);

    await handler.reached.promise;
    expect(handler.calls).toHaveLength(1);
  });

  it('after the far side accepts, a failure there executes the far side\'s `fallback`', async () => {
    const farFallback = recordingHandler();
    const far = makeMediator();
    far.registerHandler('domain-1', ACTION_A, failing());
    far.registerHandler('domain-1', ACTION_C, farFallback.handler);
    const near = makeMediator({
      resolveForwardingEntry: () => new CrossHopRoute((envelope) => far.receiveHandedOverChain(envelope.chain)),
    });

    near.executeActionsChain({
      action: { type: ACTION_A, target: 'domain-1' },
      fallback: { action: { type: ACTION_C, target: 'domain-1' } },
    });

    await farFallback.reached.promise;
    expect(farFallback.calls).toHaveLength(1);
  });
});

describe('DefaultActionsChainsMediator — handler resolution', () => {
  it('does not misroute an ActionHandler that defines its own `send` method as a CrossHopRoute', async () => {
    const reached = createDeferred();
    class HandlerWithOwnSendMethod extends ActionHandler {
      sentCount = 0;

      async handleAction(): Promise<void> {
        reached.resolve();
      }

      // Unrelated application-level method that shares a name with
      // CrossHopRoute.send — must not affect dispatch resolution.
      async send(): Promise<void> {
        this.sentCount += 1;
      }
    }

    const mediator = makeMediator();
    const handler = new HandlerWithOwnSendMethod();
    mediator.registerHandler('domain-1', MOUNT_EXT, handler);

    mediator.executeActionsChain({
      action: { type: MOUNT_EXT, target: 'domain-1', payload: { subject: 'ext-1' } },
    });

    await reached.promise;
    expect(handler.sentCount).toBe(0);
  });

  it('a genuinely unrelated action type resolves no handler and executes `fallback`', async () => {
    const mediator = makeMediator();
    const fallback = recordingHandler();
    mediator.registerHandler('domain-1', MOUNT_EXT, succeeding());
    mediator.registerHandler('domain-1', ACTION_C, fallback.handler);

    mediator.executeActionsChain({
      action: { type: 'mock.action.v1~unrelated.v1~', target: 'domain-1' },
      fallback: { action: { type: ACTION_C, target: 'domain-1' } },
    });

    await fallback.reached.promise;
    expect(fallback.calls).toHaveLength(1);
  });

  it('unregisterAllHandlers removes the target: a later action to it executes `fallback`', async () => {
    const mediator = makeMediator();
    const fallback = recordingHandler();
    mediator.registerHandler('domain-2', ACTION_A, succeeding());
    mediator.registerHandler('domain-1', ACTION_C, fallback.handler);

    mediator.unregisterAllHandlers('domain-2');
    mediator.executeActionsChain({
      action: { type: ACTION_A, target: 'domain-2' },
      fallback: { action: { type: ACTION_C, target: 'domain-1' } },
    });

    await fallback.reached.promise;
    expect(fallback.calls).toHaveLength(1);
  });

  it('executeChain never rejects, even when handed a malformed chain', async () => {
    const mediator = makeMediator();
    const execute = (mediator as unknown as { executeChain(chain: unknown): Promise<void> }).executeChain;

    await expect(execute.call(mediator, undefined)).resolves.toBeUndefined();
  });
});
