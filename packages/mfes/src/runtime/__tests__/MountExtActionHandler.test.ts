/**
 * Unit tests for `MountExtActionHandler` — the strategy-agnostic mount-ext
 * prologue (`cpt-frontx-algo-extension-domain-governance-mount-execution`
 * prologue instructions).
 *
 * These tests exercise the decorator directly against a fake `inner` handler
 * and fake collaborators, isolated from the real strategy/MountManager
 * pipeline (covered separately by
 * `mount-ext-prologue-integration.test.ts`), so each prologue rule can be
 * pinned deterministically with explicit settlement signals — no sleeps, no
 * polling, no `vi.waitFor`, no bare microtask flush.
 */
import { describe, it, expect } from 'vitest';
import { MountExtActionHandler } from '../MountExtActionHandler';
import type {
  ExtensionAdmissionReader,
  MountedExtensionReader,
  UnmountInFlightReader,
} from '../MountExtActionHandler';
import { UnmountExtActionHandler } from '../UnmountExtActionHandler';
import { DomainOccupancyCoordinator } from '../DomainOccupancyCoordinator';
import { ConcurrentMountJoiner } from '../ConcurrentMountJoiner';
import { ActionTimeoutResolver } from '../../mediator/ActionTimeoutResolver';
import { ActionHandler } from '../../mediator/ActionHandler';

const DOMAIN_ID = 'domain-under-test';
const DEFAULT_TIMEOUT = 5000;

/** A controlled deferred — the only kind of "wait" these tests use. */
function createDeferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Builds the three reader ports from plain functions, for test brevity. */
function makeReaders(overrides: {
  domainOf: (extensionId: string) => string | undefined;
  isMounted: (extensionId: string) => boolean;
  inFlight: (extensionId: string) => Promise<void> | undefined;
}): [ExtensionAdmissionReader, MountedExtensionReader, UnmountInFlightReader] {
  return [
    { domainOf: overrides.domainOf },
    { isMounted: overrides.isMounted },
    { inFlight: overrides.inFlight },
  ];
}

const timeoutResolver = new ActionTimeoutResolver();
const domainReader = (): { id: string; defaultActionTimeout: number } => ({
  id: DOMAIN_ID,
  defaultActionTimeout: DEFAULT_TIMEOUT,
});

/** Constructs a Concurrent-shaped handler (no queue, a fresh joiner). */
function makeConcurrentHandler(
  inner: ActionHandler,
  readers: [ExtensionAdmissionReader, MountedExtensionReader, UnmountInFlightReader],
  joiner: ConcurrentMountJoiner = new ConcurrentMountJoiner()
): MountExtActionHandler {
  const [admissionReader, mountedReader, unmountInFlightReader] = readers;
  return new MountExtActionHandler(
    inner,
    DOMAIN_ID,
    admissionReader,
    mountedReader,
    unmountInFlightReader,
    timeoutResolver,
    domainReader,
    undefined,
    joiner,
    undefined,
    () => []
  );
}

/** Constructs an Optional/Exclusive-shaped handler (a queue, no joiner). */
function makeQueueHandler(
  inner: ActionHandler,
  readers: [ExtensionAdmissionReader, MountedExtensionReader, UnmountInFlightReader],
  queue: DomainOccupancyCoordinator = new DomainOccupancyCoordinator(DOMAIN_ID)
): MountExtActionHandler {
  const [admissionReader, mountedReader, unmountInFlightReader] = readers;
  return new MountExtActionHandler(
    inner,
    DOMAIN_ID,
    admissionReader,
    mountedReader,
    unmountInFlightReader,
    timeoutResolver,
    domainReader,
    queue,
    undefined,
    undefined,
    () => []
  );
}

describe('MountExtActionHandler', () => {
  it('inst-me-eligibility-check: fails a mount request for an extension not admitted to the addressed domain', async () => {
    let innerCalls = 0;
    const inner = ActionHandler.fromFunction(async () => { innerCalls += 1; });
    const readers = makeReaders({
      domainOf: () => 'some-other-domain',
      isMounted: () => false,
      inFlight: () => undefined,
    });
    const wrapped = makeConcurrentHandler(inner, readers);

    await expect(
      wrapped.handleAction('mount_ext', { subject: 'ext-a' })
    ).rejects.toThrow(/not admitted/);
    expect(innerCalls).toBe(0);
  });

  it('inst-me-eligibility-check: fails a mount request for an extension registered nowhere', async () => {
    let innerCalls = 0;
    const inner = ActionHandler.fromFunction(async () => { innerCalls += 1; });
    const readers = makeReaders({
      domainOf: () => undefined,
      isMounted: () => false,
      inFlight: () => undefined,
    });
    const wrapped = makeConcurrentHandler(inner, readers);

    await expect(
      wrapped.handleAction('mount_ext', { subject: 'ghost' })
    ).rejects.toThrow(/not admitted/);
    expect(innerCalls).toBe(0);
  });

  it('inst-me-already-mounted-complete (Concurrent): completes successfully immediately, without invoking the strategy (inner handler) at all', async () => {
    let innerCalls = 0;
    const inner = ActionHandler.fromFunction(async () => { innerCalls += 1; });
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: () => true,
      inFlight: () => undefined,
    });
    const wrapped = makeConcurrentHandler(inner, readers);

    await expect(wrapped.handleAction('mount_ext', { subject: 'ext-a' })).resolves.toBeUndefined();
    expect(innerCalls).toBe(0);
  });

  it('inst-me-already-mounted-complete (queue): completes immediately while the queue is empty; falls through to the queue while it is not', async () => {
    let innerCalls = 0;
    const inner = ActionHandler.fromFunction(async () => { innerCalls += 1; });
    const mounted = true;
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: () => mounted,
      inFlight: () => undefined,
    });
    const queue = new DomainOccupancyCoordinator(DOMAIN_ID);
    const wrapped = makeQueueHandler(inner, readers, queue);

    await expect(wrapped.handleAction('mount_ext', { subject: 'ext-a' })).resolves.toBeUndefined();
    expect(innerCalls).toBe(0);
  });

  it('inst-me-join-in-progress-mount (Concurrent): a second concurrent request for the same extension joins the first physical mount instead of starting a second one', async () => {
    let innerCalls = 0;
    const gate = createDeferred<void>();
    const inner = ActionHandler.fromFunction(async () => {
      innerCalls += 1;
      await gate.promise;
    });
    let mounted = false;
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: () => mounted,
      inFlight: () => undefined,
    });
    const wrapped = makeConcurrentHandler(inner, readers);

    const first = wrapped.handleAction('mount_ext', { subject: 'ext-a' });
    const second = wrapped.handleAction('mount_ext', { subject: 'ext-a' });

    expect(innerCalls).toBe(1);

    gate.resolve();
    mounted = true;
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    expect(innerCalls).toBe(1);
  });

  it('inst-me-join-in-progress-mount (Concurrent): when the joined physical mount fails, the joining request fails with the same cause', async () => {
    let innerCalls = 0;
    const gate = createDeferred<void>();
    const cause = new Error('physical mount failed');
    const inner = ActionHandler.fromFunction(async () => {
      innerCalls += 1;
      await gate.promise;
      throw cause;
    });
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: () => false,
      inFlight: () => undefined,
    });
    const wrapped = makeConcurrentHandler(inner, readers);

    const first = wrapped.handleAction('mount_ext', { subject: 'ext-a' });
    const second = wrapped.handleAction('mount_ext', { subject: 'ext-a' });
    expect(innerCalls).toBe(1);

    gate.resolve();

    let firstError: unknown;
    let secondError: unknown;
    await first.catch((e) => { firstError = e; });
    await second.catch((e) => { secondError = e; });

    expect(firstError).toBe(cause);
    expect(secondError).toBe(cause);
  });

  it('inst-me-await-unmount-settle / inst-me-fresh-mount-after-unmount (Concurrent): waits for an in-progress unmount to settle, then proceeds with a fresh mount', async () => {
    let innerCalls = 0;
    const unmountGate = createDeferred<void>();
    const inner = ActionHandler.fromFunction(async () => { innerCalls += 1; });
    let unmountInFlight: Promise<void> | undefined = unmountGate.promise;
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: () => false,
      inFlight: () => unmountInFlight,
    });
    const wrapped = makeConcurrentHandler(inner, readers);

    const mountCall = wrapped.handleAction('mount_ext', { subject: 'ext-a' });

    expect(innerCalls).toBe(0);

    unmountInFlight = undefined;
    unmountGate.resolve();

    await expect(mountCall).resolves.toBeUndefined();
    expect(innerCalls).toBe(1);
  });

  it('inst-me-fail-after-unmount-failure (Concurrent): fails the mount request when the awaited unmount itself failed', async () => {
    let innerCalls = 0;
    const unmountGate = createDeferred<void>();
    const inner = ActionHandler.fromFunction(async () => { innerCalls += 1; });
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: () => false,
      inFlight: () => unmountGate.promise,
    });
    const wrapped = makeConcurrentHandler(inner, readers);

    const mountCall = wrapped.handleAction('mount_ext', { subject: 'ext-a' });
    unmountGate.reject(new Error('unmount failed'));

    await expect(mountCall).rejects.toThrow(/could not be mounted/);
    expect(innerCalls).toBe(0);
  });

  it('inst-me-queue-await-unmount-at-turn (queue): a mount of an extension whose non-queue unmount is in flight waits for it instead of completing on the stale mount-set record', async () => {
    let innerCalls = 0;
    const inner = ActionHandler.fromFunction(async () => { innerCalls += 1; });
    const unmountDeferred = createDeferred<void>();
    const consulted = createDeferred<void>();
    let consultedOnce = false;
    let unmountPending = true;
    let mounted = true;
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: () => mounted,
      inFlight: () => {
        if (!consultedOnce) {
          consultedOnce = true;
          consulted.resolve();
        }
        return unmountPending ? unmountDeferred.promise : undefined;
      },
    });
    const queue = new DomainOccupancyCoordinator(DOMAIN_ID);
    const wrapped = makeQueueHandler(inner, readers, queue);

    const request = wrapped.handleAction('mount_ext', { subject: 'ext-a' });
    let settled = false;
    request.then(() => { settled = true; }, () => { settled = true; });

    await consulted.promise;
    expect(settled).toBe(false);

    mounted = false;
    unmountPending = false;
    unmountDeferred.resolve();

    await expect(request).resolves.toBeUndefined();
    expect(innerCalls).toBe(1);
  });

  it('inst-me-fail-after-unmount-failure (queue): the mount fails when the awaited non-queue unmount failed', async () => {
    let innerCalls = 0;
    const inner = ActionHandler.fromFunction(async () => { innerCalls += 1; });
    const unmountDeferred = createDeferred<void>();
    let unmountPending = true;
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: () => true,
      inFlight: () => (unmountPending ? unmountDeferred.promise : undefined),
    });
    const queue = new DomainOccupancyCoordinator(DOMAIN_ID);
    const wrapped = makeQueueHandler(inner, readers, queue);

    const request = wrapped.handleAction('mount_ext', { subject: 'ext-a' });

    unmountPending = false;
    unmountDeferred.reject(new Error('unmount failed'));

    await expect(request).rejects.toThrow(/in-progress unmount/);
    expect(innerCalls).toBe(0);
  });

  it('falls through to the inner handler untouched when the payload carries no string subject', async () => {
    let innerCalls = 0;
    const inner = ActionHandler.fromFunction(async () => { innerCalls += 1; });
    const readers = makeReaders({
      domainOf: () => undefined,
      isMounted: () => false,
      inFlight: () => undefined,
    });
    const wrapped = makeConcurrentHandler(inner, readers);

    await wrapped.handleAction('mount_ext', {});
    expect(innerCalls).toBe(1);
  });

  it('inst-me-join-in-progress-mount: a synchronous re-entrant mount request for the SAME extension joins the same physical mount instead of starting a second one', async () => {
    let innerCalls = 0;
    let mounted = false;
    const gate = createDeferred<void>();
    const wrappedRef: { current?: ActionHandler } = {};
    const inner = ActionHandler.fromFunction(async (actionTypeId, payload) => {
      innerCalls += 1;
      if (innerCalls === 1) {
        void wrappedRef.current!.handleAction(actionTypeId, payload);
      }
      await gate.promise;
    });
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: () => mounted,
      inFlight: () => undefined,
    });
    const wrapped = makeConcurrentHandler(inner, readers);
    wrappedRef.current = wrapped;

    const first = wrapped.handleAction('mount_ext', { subject: 'ext-a' });

    expect(innerCalls).toBe(1);

    gate.resolve();
    mounted = true;
    await expect(first).resolves.toBeUndefined();
    expect(innerCalls).toBe(1);
  });

  it('inst-me-queue-fresh-mount-at-turn: a fresh mount for a DIFFERENT extension in an Optional/Exclusive-shaped queue is ordered after the previous fresh mount settles', async () => {
    const occupancy: { current: string[] } = { current: [] };
    const events: string[] = [];
    const inner = ActionHandler.fromFunction(async (_actionTypeId, payload) => {
      const subject = (payload as { subject: string }).subject;
      const priorOccupant = occupancy.current[0];
      if (priorOccupant !== undefined && priorOccupant !== subject) {
        await Promise.resolve();
        occupancy.current = occupancy.current.filter((id) => id !== priorOccupant);
        events.push(`evict:${priorOccupant}`);
      }
      await Promise.resolve();
      occupancy.current = [...occupancy.current, subject];
      events.push(`mount:${subject}`);
    });
    const queue = new DomainOccupancyCoordinator(DOMAIN_ID);
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: (extensionId) => occupancy.current.includes(extensionId),
      inFlight: () => undefined,
    });
    const wrapped = makeQueueHandler(inner, readers, queue);

    const first = wrapped.handleAction('mount_ext', { subject: 'ext-a' });
    const second = wrapped.handleAction('mount_ext', { subject: 'ext-b' });

    await Promise.all([first, second]);

    expect(occupancy.current).toEqual(['ext-b']);
    expect(events).toEqual(['mount:ext-a', 'evict:ext-a', 'mount:ext-b']);
  });

  it('a mount handler that throws synchronously (before its own first await) rejects the request rather than hanging, and a retry for the same extension succeeds', async () => {
    let callCount = 0;
    const inner = ActionHandler.fromFunction((_actionTypeId, _payload): Promise<void> => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error('synchronous mount failure');
      }
      return Promise.resolve();
    });
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: () => false,
      inFlight: () => undefined,
    });
    const wrapped = makeConcurrentHandler(inner, readers);

    await expect(
      wrapped.handleAction('mount_ext', { subject: 'ext-a' })
    ).rejects.toThrow('synchronous mount failure');

    await expect(
      wrapped.handleAction('mount_ext', { subject: 'ext-a' })
    ).resolves.toBeUndefined();
    expect(callCount).toBe(2);
  });
});

/**
 * `UnmountExtActionHandler` ordered against `MountExtActionHandler` through
 * the SAME `DomainOccupancyCoordinator` — an Optional-domain shape.
 */
describe('UnmountExtActionHandler / MountExtActionHandler — same-domain occupancy queue', () => {
  it('inst-me-queue-join-running: a mount(A) accepted while an explicit unmount(A) is pending behind a running mount(A) replaces the pending unmount and joins the running mount', async () => {
    const mountSet = new Set<string>();
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: (id) => mountSet.has(id),
      inFlight: () => undefined,
    });
    const [admissionReader, mountedReader] = readers;

    const order: string[] = [];
    const mountGate = createDeferred();
    const mountInner = ActionHandler.fromFunction(async (_t, payload) => {
      await mountGate.promise;
      const { subject } = payload as { subject: string };
      order.push(`mount:${subject}`);
      mountSet.add(subject);
    });

    const unmountInner = ActionHandler.fromFunction(async (_t, payload) => {
      const { subject } = payload as { subject: string };
      order.push(`unmount:${subject}`);
      mountSet.delete(subject);
    });

    const queue = new DomainOccupancyCoordinator(DOMAIN_ID);
    const mountHandler = makeQueueHandler(mountInner, readers, queue);
    const unmountHandler = new UnmountExtActionHandler(
      unmountInner,
      DOMAIN_ID,
      admissionReader,
      mountedReader,
      timeoutResolver,
      domainReader,
      queue,
      undefined,
      undefined,
      () => []
    );

    // First mount(A): running, gated open.
    const firstMount = mountHandler.handleAction('mount_ext', { subject: 'ext-a' });
    // Explicit unmount(A), pending behind the running mount(A).
    const secondUnmount = unmountHandler.handleAction('unmount_ext', { subject: 'ext-a' });
    // A third mount(A) request matches the RUNNING entry (mount ext-a): it
    // replaces the pending unmount (which fails and takes its own
    // fallback) and joins the running mount instead.
    const thirdMount = mountHandler.handleAction('mount_ext', { subject: 'ext-a' });

    await expect(secondUnmount).rejects.toThrow(/replaced/);

    mountGate.resolve();

    await Promise.all([firstMount, thirdMount]);

    expect(order).toEqual(['mount:ext-a']);
    expect(mountSet.has('ext-a')).toBe(true);
    expect(mountedReader.isMounted('ext-a')).toBe(true);
  });
});
