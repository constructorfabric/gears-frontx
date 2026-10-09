import { describe, expect, it, vi } from 'vitest';

import { createHooked } from './hooked';

interface Hooks {
  sync: (value: number) => number;
  later: (value: number) => number;
  none: () => void;
}

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('createHooked', () => {
  it('collects the results of the handlers in registration order', async () => {
    const hooked = createHooked<Hooks>();
    hooked.hook('sync', (value) => value + 1);
    hooked.hook('sync', (value) => value * 10);

    expect(hooked.callHookSync('sync', 2)).toEqual([3, 20]);
    expect(await hooked.callHook('sync', 2)).toEqual([3, 20]);
    expect(await hooked.callHookParallel('sync', 2)).toEqual([3, 20]);
  });

  it('returns nothing for a hook nobody registered', async () => {
    const hooked = createHooked<Hooks>();

    expect(hooked.callHookSync('none')).toEqual([]);
    expect(await hooked.callHook('none')).toEqual([]);
  });

  it('starts serial handlers one after another, each after the previous one settled', async () => {
    const hooked = createHooked<Hooks>();
    const order: string[] = [];
    const gate = deferred();
    hooked.hook('later', async (value) => {
      order.push('first start');
      await gate.promise;
      order.push('first end');
      return value;
    });
    hooked.hook('later', (value) => {
      order.push('second start');
      return value;
    });

    const run = hooked.callHook('later', 1);
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['first start']);

    gate.resolve();
    await run;
    expect(order).toEqual(['first start', 'first end', 'second start']);
  });

  it('starts parallel handlers in one synchronous pass', () => {
    const hooked = createHooked<Hooks>();
    const started: string[] = [];
    hooked.hook('later', async (value) => {
      started.push('first');
      await new Promise(() => {});
      return value;
    });
    hooked.hook('later', (value) => {
      started.push('second');
      return value;
    });

    void hooked.callHookParallel('later', 1);

    expect(started).toEqual(['first', 'second']);
  });

  it('throws a synchronous failure of a parallel handler out of the call, not into the promise', () => {
    const hooked = createHooked<Hooks>();
    hooked.hook('sync', () => {
      throw new Error('boom');
    });

    expect(() => hooked.callHookParallel('sync', 1)).toThrow('boom');
  });

  it('lets a handler unsubscribe while the hook runs without changing this run', () => {
    const hooked = createHooked<Hooks>();
    const second = vi.fn(() => 2);
    const off = hooked.hook('sync', () => {
      off();
      return 1;
    });
    hooked.hook('sync', second);

    expect(hooked.callHookSync('sync', 0)).toEqual([1, 2]);
    expect(hooked.callHookSync('sync', 0)).toEqual([2]);
  });
});
