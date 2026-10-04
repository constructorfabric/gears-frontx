/**
 * Unit tests for `DomainOccupancyCoordinator` — the internal two-slot
 * occupancy queue for Optional/Exclusive domains
 * (`cpt-frontx-algo-extension-domain-governance-mount-execution` steps 6-13).
 */
import { describe, it, expect, vi } from 'vitest';
import { DomainOccupancyCoordinator } from '../DomainOccupancyCoordinator';

const DOMAIN_ID = 'domain-under-test';

/** A controlled deferred — the only kind of "wait" these tests use for non-timer scenarios. */
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

describe('DomainOccupancyCoordinator', () => {
  it('inst-me-queue-start-when-empty: an empty queue starts the request synchronously and runs its task', async () => {
    let taskCalls = 0;
    const coordinator = new DomainOccupancyCoordinator(DOMAIN_ID);
    const settlement = coordinator.submit('mount', 'ext-a', 5000, async () => {
      taskCalls += 1;
    });
    // Task invoked synchronously, before this call returns.
    expect(taskCalls).toBe(1);
    await expect(settlement).resolves.toBeUndefined();
  });

  it('a synchronous throw from the task counts as a failure', async () => {
    const coordinator = new DomainOccupancyCoordinator(DOMAIN_ID);
    const settlement = coordinator.submit('mount', 'ext-a', 5000, () => {
      throw new Error('sync failure');
    });
    await expect(settlement).rejects.toThrow('sync failure');
  });

  it('inst-me-queue-join-pending: a second request for the same operation/subject as the pending entry joins it — one task invocation, both settle together', async () => {
    const coordinator = new DomainOccupancyCoordinator(DOMAIN_ID);
    const gate = createDeferred();
    let taskCalls = 0;

    const first = coordinator.submit('mount', 'ext-a', 5000, async () => {
      taskCalls += 1;
      await gate.promise;
    });
    // Pending entry for ext-b.
    const second = coordinator.submit('mount', 'ext-b', 5000, async () => {
      taskCalls += 1;
    });
    // Joins the pending ext-b entry — no second task registered.
    const third = coordinator.submit('mount', 'ext-b', 5000, async () => {
      taskCalls += 1;
    });

    gate.resolve();
    await first;
    await Promise.all([second, third]);

    // Running (ext-a) + pending (ext-b, joined once) = 2 task invocations.
    expect(taskCalls).toBe(2);
  });

  it('inst-me-queue-join-running: a request matching the running entry joins it, and replaces any different pending entry (whose callers fail)', async () => {
    const coordinator = new DomainOccupancyCoordinator(DOMAIN_ID);
    const gate = createDeferred();
    let runningTaskCalls = 0;

    const running = coordinator.submit('mount', 'ext-a', 5000, async () => {
      runningTaskCalls += 1;
      await gate.promise;
    });
    const pendingB = coordinator.submit('mount', 'ext-b', 5000, async () => {});
    // Matches the running entry (ext-a) — replaces pendingB and joins running.
    const joinRunning = coordinator.submit('mount', 'ext-a', 5000, async () => {});

    await expect(pendingB).rejects.toThrow(/replaced/);

    gate.resolve();
    await running;
    await joinRunning;

    expect(runningTaskCalls).toBe(1);
  });

  it('inst-me-queue-enter-pending: a different operation/subject while running enters as pending', async () => {
    const coordinator = new DomainOccupancyCoordinator(DOMAIN_ID);
    const gate = createDeferred();
    const order: string[] = [];

    const running = coordinator.submit('mount', 'ext-a', 5000, async () => {
      order.push('start:a');
      await gate.promise;
      order.push('end:a');
    });
    const pending = coordinator.submit('mount', 'ext-b', 5000, async () => {
      order.push('run:b');
    });

    expect(order).toEqual(['start:a']);
    gate.resolve();
    await running;
    await pending;
    expect(order).toEqual(['start:a', 'end:a', 'run:b']);
  });

  it('inst-me-queue-replace-pending: both slots held, neither matches — the pending entry (and every caller that joined it) fails, the new request becomes pending', async () => {
    const coordinator = new DomainOccupancyCoordinator(DOMAIN_ID);
    const gate = createDeferred();
    const order: string[] = [];

    const running = coordinator.submit('mount', 'ext-a', 5000, async () => {
      await gate.promise;
      order.push('run:a');
    });
    const pendingBJoiner1 = coordinator.submit('mount', 'ext-b', 5000, async () => {
      order.push('run:b');
    });
    const pendingBJoiner2 = coordinator.submit('mount', 'ext-b', 5000, async () => {});
    // Replaces pending B — B never starts.
    const pendingC = coordinator.submit('mount', 'ext-c', 5000, async () => {
      order.push('run:c');
    });

    await expect(pendingBJoiner1).rejects.toThrow(/replaced/);
    await expect(pendingBJoiner2).rejects.toThrow(/replaced/);

    gate.resolve();
    await running;
    await pendingC;

    expect(order).toEqual(['run:a', 'run:c']);
  });

  it('inst-me-queue-join-same-operation-subject: a mount(A) never joins a pending unmount(A) — it replaces it instead', async () => {
    const coordinator = new DomainOccupancyCoordinator(DOMAIN_ID);
    const gate = createDeferred();

    const running = coordinator.submit('mount', 'ext-x', 5000, async () => {
      await gate.promise;
    });
    const pendingUnmount = coordinator.submit('unmount', 'ext-a', 5000, async () => {});
    const mountA = coordinator.submit('mount', 'ext-a', 5000, async () => {});

    await expect(pendingUnmount).rejects.toThrow(/replaced/);

    gate.resolve();
    await running;
    await mountA;
  });

  it('inst-me-queue-pending-timeout: a lone pending caller times out alone, the entry never starts, and its timer is cleared on settle', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const coordinator = new DomainOccupancyCoordinator(DOMAIN_ID);
      const gate = createDeferred();
      let pendingTaskCalls = 0;

      const running = coordinator.submit('mount', 'ext-a', 5000, async () => {
        await gate.promise;
      });
      const pending = coordinator.submit('mount', 'ext-b', 50, async () => {
        pendingTaskCalls += 1;
      });
      const pendingRejection = expect(pending).rejects.toThrow(/timed out/);

      await vi.advanceTimersByTimeAsync(60);
      await pendingRejection;

      gate.resolve();
      await running;
      expect(pendingTaskCalls).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a caller of the running entry whose timer fires is ignored — the running entry keeps running and completes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const coordinator = new DomainOccupancyCoordinator(DOMAIN_ID);
      const gate = createDeferred();
      let taskCalls = 0;

      const running = coordinator.submit('mount', 'ext-a', 50, async () => {
        taskCalls += 1;
        await gate.promise;
      });

      // Timer fires while the entry is running — must be ignored.
      await vi.advanceTimersByTimeAsync(60);

      gate.resolve();
      await expect(running).resolves.toBeUndefined();
      expect(taskCalls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('inst-me-queue-complete-running: running completion promotes the pending entry, which then starts', async () => {
    const coordinator = new DomainOccupancyCoordinator(DOMAIN_ID);
    const gate = createDeferred();
    const order: string[] = [];

    const running = coordinator.submit('mount', 'ext-a', 5000, async () => {
      order.push('run:a');
      await gate.promise;
    });
    const pending = coordinator.submit('mount', 'ext-b', 5000, async () => {
      order.push('run:b');
    });

    gate.resolve();
    await running;
    await pending;

    expect(order).toEqual(['run:a', 'run:b']);
  });

  it('on failure, every caller of the running entry fails with the same cause, and the pending entry is still promoted', async () => {
    const coordinator = new DomainOccupancyCoordinator(DOMAIN_ID);
    const cause = new Error('running failed');
    const order: string[] = [];

    const running = coordinator.submit('mount', 'ext-a', 5000, async () => {
      throw cause;
    });
    const pending = coordinator.submit('mount', 'ext-b', 5000, async () => {
      order.push('run:b');
    });

    await expect(running).rejects.toBe(cause);
    await pending;
    expect(order).toEqual(['run:b']);
  });

  it('inst-me-queue-domain-unregister: close fails the pending entry\'s callers without starting it; the running entry is untouched', async () => {
    const coordinator = new DomainOccupancyCoordinator(DOMAIN_ID);
    const gate = createDeferred();
    let pendingTaskCalls = 0;

    const running = coordinator.submit('mount', 'ext-a', 5000, async () => {
      await gate.promise;
    });
    const pending = coordinator.submit('mount', 'ext-b', 5000, async () => {
      pendingTaskCalls += 1;
    });

    coordinator.close('was unregistered while the request was queued.');
    await expect(pending).rejects.toThrow(/unregistered/);

    gate.resolve();
    await running;
    expect(pendingTaskCalls).toBe(0);
  });

  it('close on an empty pending slot fails no caller', () => {
    const coordinator = new DomainOccupancyCoordinator(DOMAIN_ID);
    expect(() => coordinator.close('unused')).not.toThrow();
  });

  it('a request submitted after close fails at once and never enters a slot; the running entry completes and nothing is promoted', async () => {
    const coordinator = new DomainOccupancyCoordinator(DOMAIN_ID);
    const gate = createDeferred();
    let lateTaskCalls = 0;

    const running = coordinator.submit('mount', 'ext-a', 5000, async () => {
      await gate.promise;
    });

    coordinator.close('was unregistered while the request was queued.');

    const late = coordinator.submit('mount', 'ext-b', 5000, async () => {
      lateTaskCalls += 1;
    });
    await expect(late).rejects.toThrow(
      "mount_ext: request for 'ext-b' in domain 'domain-under-test' was unregistered while the request was queued."
    );

    gate.resolve();
    await running;
    expect(lateTaskCalls).toBe(0);
    expect(coordinator.isEmpty()).toBe(true);
  });

  it('isEmpty() reports true only while the queue holds neither a running nor a pending entry', async () => {
    const coordinator = new DomainOccupancyCoordinator(DOMAIN_ID);
    expect(coordinator.isEmpty()).toBe(true);

    const gate = createDeferred();
    const running = coordinator.submit('mount', 'ext-a', 5000, async () => {
      await gate.promise;
    });
    expect(coordinator.isEmpty()).toBe(false);

    gate.resolve();
    await running;
    expect(coordinator.isEmpty()).toBe(true);
  });

  it('inst-me-queue-pending-timeout: when a pending entry\'s original caller times out and a later joiner remains, the entry runs the surviving joiner\'s task, never the timed-out caller\'s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const coordinator = new DomainOccupancyCoordinator(DOMAIN_ID);
      const gate = createDeferred();
      let taskXCalls = 0;
      let taskYCalls = 0;

      const running = coordinator.submit('mount', 'ext-a', 5000, async () => {
        await gate.promise;
      });
      // Original caller X enters as pending, with its own short timer.
      const pendingX = coordinator.submit('mount', 'ext-b', 50, async () => {
        taskXCalls += 1;
      });
      const pendingXRejection = expect(pendingX).rejects.toThrow(/timed out/);
      // A joiner Y admits to the same still-pending entry before X's timer
      // fires — as a fallback dispatched independently of this queue would.
      const pendingY = coordinator.submit('mount', 'ext-b', 5000, async () => {
        taskYCalls += 1;
      });

      // X's own queued timer fires: X leaves, Y remains the entry's only
      // live caller.
      await vi.advanceTimersByTimeAsync(60);
      await pendingXRejection;

      gate.resolve();
      await running;
      await pendingY;

      expect(taskXCalls).toBe(0);
      expect(taskYCalls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('every caller\'s timer is cleared once it settles — no leaked timers remain after a run', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const coordinator = new DomainOccupancyCoordinator(DOMAIN_ID);
      const settlement = coordinator.submit('mount', 'ext-a', 5000, async () => {});
      await settlement;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
