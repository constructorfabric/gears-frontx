/**
 * Settled-action report
 * (`cpt-frontx-algo-extension-domain-governance-mount-execution`
 * `inst-me-report-settled`..`inst-me-report-standalone`,
 * `cpt-frontx-dod-extension-domain-governance-settled-action-report`).
 *
 * Isolated unit tests against `MountExtActionHandler`/`UnmountExtActionHandler`
 * directly, mirroring the house style of `MountExtActionHandler.test.ts`:
 * a fake `inner` handler and fake collaborators, no real strategy/mount
 * pipeline. Confirms exactly one `reportSettled` call per execution (a
 * request for which the domain's strategy ran), that it happens before the
 * chain's own `next`/`fallback` (observed via a shared ordered log both push
 * into), and that every path on which the strategy never runs reports
 * nothing.
 */
import { describe, it, expect, vi } from 'vitest';
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
import type { RouterPort, SettledActionReport } from '../../router/RouterPort';

const DOMAIN_ID = 'domain-under-test';
const DEFAULT_TIMEOUT = 5000;
const MOUNT_ACTION = 'mock.action~mount_ext.v1~';

const timeoutResolver = new ActionTimeoutResolver();
const domainReader = (): { id: string; defaultActionTimeout: number } => ({
  id: DOMAIN_ID,
  defaultActionTimeout: DEFAULT_TIMEOUT,
});

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

/** A router test double recording reportSettled calls into a shared log. */
function createRouterSpy(log: string[]): RouterPort {
  return {
    registerDomain: () => {},
    registerExtension: () => {},
    releaseDomain: () => {},
    releaseExtension: () => {},
    assignOccupantValue: () => undefined,
    reportSettled: vi.fn((_report: SettledActionReport) => {
      log.push('reportSettled');
    }),
    supplyNavigation: () => {},
  };
}

function makeConcurrentMountHandler(
  inner: ActionHandler,
  readers: [ExtensionAdmissionReader, MountedExtensionReader, UnmountInFlightReader],
  router: RouterPort | undefined,
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
    router,
    () => []
  );
}

function makeQueueMountHandler(
  inner: ActionHandler,
  readers: [ExtensionAdmissionReader, MountedExtensionReader, UnmountInFlightReader],
  router: RouterPort | undefined,
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
    router,
    () => []
  );
}

describe('settled-action report — mount_ext', () => {
  it('a fresh Concurrent mount reports exactly once, before the caller continues to its own next', async () => {
    const log: string[] = [];
    const router = createRouterSpy(log);
    const inner = ActionHandler.fromFunction(async () => { log.push('inner-ran'); });
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: () => false,
      inFlight: () => undefined,
    });
    const handler = makeConcurrentMountHandler(inner, readers, router);

    await handler.handleAction(MOUNT_ACTION, { subject: 'ext-a' });
    log.push('caller-next');

    expect(router.reportSettled).toHaveBeenCalledTimes(1);
    expect(log).toEqual(['inner-ran', 'reportSettled', 'caller-next']);
    expectReportShape(reportOf(router), { domainId: DOMAIN_ID });
  });

  it('a fresh Concurrent mount that fails reports exactly once, before the caller takes its own fallback', async () => {
    const log: string[] = [];
    const router = createRouterSpy(log);
    const inner = ActionHandler.fromFunction(async () => {
      log.push('inner-ran');
      throw new Error('mount failed');
    });
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: () => false,
      inFlight: () => undefined,
    });
    const handler = makeConcurrentMountHandler(inner, readers, router);

    await expect(handler.handleAction(MOUNT_ACTION, { subject: 'ext-a' })).rejects.toThrow('mount failed');
    log.push('caller-fallback');

    expect(router.reportSettled).toHaveBeenCalledTimes(1);
    expect(log).toEqual(['inner-ran', 'reportSettled', 'caller-fallback']);
    // The execution changed nothing: one report, empty, and no outcome member.
    expect(reportOf(router)).toEqual({ domainId: DOMAIN_ID, mounted: [], unmounted: [] });
  });

  it('a fresh Optional/Exclusive-queue mount (at-turn) reports exactly once', async () => {
    const log: string[] = [];
    const router = createRouterSpy(log);
    const inner = ActionHandler.fromFunction(async () => { log.push('inner-ran'); });
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: () => false,
      inFlight: () => undefined,
    });
    const handler = makeQueueMountHandler(inner, readers, router);

    await handler.handleAction(MOUNT_ACTION, { subject: 'ext-a' });

    expect(router.reportSettled).toHaveBeenCalledTimes(1);
    expect(log).toEqual(['inner-ran', 'reportSettled']);
    expectReportShape(reportOf(router), { domainId: DOMAIN_ID });
  });

  it('an already-mounted mount reports nothing', async () => {
    const log: string[] = [];
    const router = createRouterSpy(log);
    const inner = ActionHandler.fromFunction(async () => { log.push('inner-ran'); });
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: () => true,
      inFlight: () => undefined,
    });
    const handler = makeQueueMountHandler(inner, readers, router);

    await handler.handleAction(MOUNT_ACTION, { subject: 'ext-a' });

    expect(inner_called(log)).toBe(false);
    expect(router.reportSettled).not.toHaveBeenCalled();
  });

  it('a joined Concurrent mount (second caller joins the in-progress mount) produces exactly one report, shared by both callers', async () => {
    const log: string[] = [];
    const router = createRouterSpy(log);
    const gate = deferred();
    let innerCalls = 0;
    const inner = ActionHandler.fromFunction(async () => {
      innerCalls += 1;
      await gate.promise;
    });
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: () => false,
      inFlight: () => undefined,
    });
    const joiner = new ConcurrentMountJoiner();
    const handler = makeConcurrentMountHandler(inner, readers, router, joiner);

    const first = handler.handleAction(MOUNT_ACTION, { subject: 'ext-a' });
    const second = handler.handleAction(MOUNT_ACTION, { subject: 'ext-a' });
    gate.resolve();
    await Promise.all([first, second]);

    expect(innerCalls).toBe(1);
    expect(router.reportSettled).toHaveBeenCalledTimes(1);
  });

  it('a request replaced while pending (Optional/Exclusive queue) reports nothing', async () => {
    const log: string[] = [];
    const router = createRouterSpy(log);
    const gate = deferred();
    const inner = ActionHandler.fromFunction(async () => { await gate.promise; });
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: () => false,
      inFlight: () => undefined,
    });
    const queue = new DomainOccupancyCoordinator(DOMAIN_ID);
    const handler = makeQueueMountHandler(inner, readers, router, queue);

    // Running entry (ext-a) occupies the queue; two different-subject
    // requests queue behind it — the second replaces the first as the
    // pending entry.
    const running = handler.handleAction(MOUNT_ACTION, { subject: 'ext-a' });
    const replaced = handler.handleAction(MOUNT_ACTION, { subject: 'ext-b' });
    const replacing = handler.handleAction(MOUNT_ACTION, { subject: 'ext-c' });

    await expect(replaced).rejects.toThrow(/replaced/);
    gate.resolve();
    await running;
    await replacing;

    // Exactly two executions reached the handler (ext-a running, ext-c
    // pending-then-run); ext-b never did.
    expect(router.reportSettled).toHaveBeenCalledTimes(2);
  });

  it('a pending request whose own timer fires before it starts reports nothing', async () => {
    vi.useFakeTimers();
    try {
      const log: string[] = [];
      const router = createRouterSpy(log);
      const gate = deferred();
      const inner = ActionHandler.fromFunction(async () => { await gate.promise; });
      const readers = makeReaders({
        domainOf: () => DOMAIN_ID,
        isMounted: () => false,
        inFlight: () => undefined,
      });
      const queue = new DomainOccupancyCoordinator(DOMAIN_ID);
      const handler = makeQueueMountHandler(inner, readers, router, queue);

      const running = handler.handleAction(MOUNT_ACTION, { subject: 'ext-a' });
      const timedOut = handler.handleAction(MOUNT_ACTION, { subject: 'ext-b' }).catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT + 1);
      const outcome = await timedOut;
      expect(outcome).toBeInstanceOf(Error);

      gate.resolve();
      await running;

      // Only the running (ext-a) execution ever reached the handler.
      expect(router.reportSettled).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('settled-action report — history intent passthrough', () => {
  it('a history intent on the executed payload reaches the router as a top-level report member unchanged', async () => {
    const reportSettled = vi.fn();
    const router: RouterPort = {
      registerDomain: () => {}, registerExtension: () => {},
      releaseDomain: () => {}, releaseExtension: () => {},
      assignOccupantValue: () => undefined,
      reportSettled,
      supplyNavigation: () => {},
    };
    const inner = ActionHandler.fromFunction(async () => {});
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: () => false,
      inFlight: () => undefined,
    });
    const handler = makeConcurrentMountHandler(inner, readers, router);

    await handler.handleAction(MOUNT_ACTION, { subject: 'ext-a', history: 'replace' });

    expect(reportSettled).toHaveBeenCalledTimes(1);
    const report = reportSettled.mock.calls[0][0] as SettledActionReport;
    expect(report.history).toBe('replace');
    expect(report).not.toHaveProperty('payload');
    expectReportShape(report, { domainId: DOMAIN_ID, history: 'replace' });
  });

  it('an absent history intent stays absent from the report', async () => {
    const reportSettled = vi.fn();
    const router: RouterPort = {
      registerDomain: () => {}, registerExtension: () => {},
      releaseDomain: () => {}, releaseExtension: () => {},
      assignOccupantValue: () => undefined,
      reportSettled,
      supplyNavigation: () => {},
    };
    const inner = ActionHandler.fromFunction(async () => {});
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: () => false,
      inFlight: () => undefined,
    });
    const handler = makeConcurrentMountHandler(inner, readers, router);

    await handler.handleAction(MOUNT_ACTION, { subject: 'ext-a' });

    const report = reportSettled.mock.calls[0][0] as SettledActionReport;
    expect(report).not.toHaveProperty('history');
    expectReportShape(report, { domainId: DOMAIN_ID });
  });
});

describe('settled-action report — requests that never run the strategy (additional)', () => {
  it('an ineligible mount request (extension admitted to another domain) reports nothing', async () => {
    const log: string[] = [];
    const router = createRouterSpy(log);
    const inner = ActionHandler.fromFunction(async () => { log.push('inner-ran'); });
    const readers = makeReaders({
      domainOf: () => 'some-other-domain',
      isMounted: () => false,
      inFlight: () => undefined,
    });

    await expect(
      makeConcurrentMountHandler(inner, readers, router).handleAction(MOUNT_ACTION, { subject: 'ext-a' })
    ).rejects.toThrow(/not admitted/);
    await expect(
      makeQueueMountHandler(inner, readers, router).handleAction(MOUNT_ACTION, { subject: 'ext-a' })
    ).rejects.toThrow(/not admitted/);

    expect(router.reportSettled).not.toHaveBeenCalled();
    expect(log).toEqual([]);
  });

  it('a mount that fails because the unmount it waited on failed reports nothing', async () => {
    const log: string[] = [];
    const router = createRouterSpy(log);
    const inner = ActionHandler.fromFunction(async () => { log.push('inner-ran'); });
    const unmountGate = Promise.reject(new Error('unmount failed'));
    unmountGate.catch(() => {});
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: () => false,
      inFlight: () => unmountGate,
    });

    await expect(
      makeConcurrentMountHandler(inner, readers, router).handleAction(MOUNT_ACTION, { subject: 'ext-a' })
    ).rejects.toThrow(/could not be mounted/);
    await expect(
      makeQueueMountHandler(inner, readers, router).handleAction(MOUNT_ACTION, { subject: 'ext-a' })
    ).rejects.toThrow(/could not be mounted/);

    expect(router.reportSettled).not.toHaveBeenCalled();
    expect(log).toEqual([]);
  });
});

describe('settled-action report — unmount_ext', () => {
  it('an explicit unmount of a mounted extension reports exactly once', async () => {
    const log: string[] = [];
    const router = createRouterSpy(log);
    const inner = ActionHandler.fromFunction(async () => { log.push('inner-ran'); });
    const admissionReader: ExtensionAdmissionReader = { domainOf: () => DOMAIN_ID };
    const mountedReader: MountedExtensionReader = { isMounted: () => true };
    const handler = new UnmountExtActionHandler(
      inner,
      DOMAIN_ID,
      admissionReader,
      mountedReader,
      timeoutResolver,
      domainReader,
      new DomainOccupancyCoordinator(DOMAIN_ID),
      undefined,
      router,
      () => []
    );

    await handler.handleAction('mock.action~unmount_ext.v1~', { subject: 'ext-a', history: 'push' });

    expect(router.reportSettled).toHaveBeenCalledTimes(1);
    const report = reportOf(router);
    expect(report.history).toBe('push');
    expectReportShape(report, { domainId: DOMAIN_ID, history: 'push' });
  });

  it('an unmount of an absent subject reports nothing', async () => {
    const log: string[] = [];
    const router = createRouterSpy(log);
    const inner = ActionHandler.fromFunction(async () => { log.push('inner-ran'); });
    const admissionReader: ExtensionAdmissionReader = { domainOf: () => DOMAIN_ID };
    const mountedReader: MountedExtensionReader = { isMounted: () => false };
    const handler = new UnmountExtActionHandler(
      inner,
      DOMAIN_ID,
      admissionReader,
      mountedReader,
      timeoutResolver,
      domainReader,
      new DomainOccupancyCoordinator(DOMAIN_ID),
      undefined,
      router,
      () => []
    );

    await handler.handleAction('mock.action~unmount_ext.v1~', { subject: 'ext-a' });

    expect(router.reportSettled).not.toHaveBeenCalled();
  });

  it('a router whose reportSettled throws leaves the outcome and the caller\'s own continuation unchanged', async () => {
    const inner = ActionHandler.fromFunction(async () => {});
    const router: RouterPort = {
      registerDomain: () => {},
      registerExtension: () => {},
      releaseDomain: () => {},
      releaseExtension: () => {},
      assignOccupantValue: () => undefined,
      reportSettled: () => { throw new Error('report boom'); },
      supplyNavigation: () => {},
    };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const readers = makeReaders({
      domainOf: () => DOMAIN_ID,
      isMounted: () => false,
      inFlight: () => undefined,
    });
    const handler = makeConcurrentMountHandler(inner, readers, router);

    await expect(handler.handleAction(MOUNT_ACTION, { subject: 'ext-a' })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

function reportOf(router: RouterPort): SettledActionReport {
  const calls = (router.reportSettled as ReturnType<typeof vi.fn>).mock.calls;
  return calls[0][0] as SettledActionReport;
}

/**
 * The report carries exactly the domain, the history intent when the action
 * carries one, and the mounted / unmounted lists: no action type, no payload,
 * no outcome.
 */
function expectReportShape(
  report: SettledActionReport,
  expected: { domainId: string; history?: 'push' | 'replace' }
): void {
  const keys = ['domainId', 'mounted', 'unmounted', ...(expected.history ? ['history'] : [])].sort();
  expect(Object.keys(report).sort()).toEqual(keys);
  expect(report.domainId).toBe(expected.domainId);
  expect(Array.isArray(report.mounted)).toBe(true);
  expect(Array.isArray(report.unmounted)).toBe(true);
}

function inner_called(log: string[]): boolean {
  return log.includes('inner-ran');
}

function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
