import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSharedFetchCache,
  getSharedFetchCache,
  inspectSharedFetchCacheBookkeepingForTest,
  releaseSharedFetchCache,
  resetSharedFetchCache,
  retainSharedFetchCache,
} from '../sharedFetchCache';

/** A fetcher that behaves like fetch(): it rejects with an AbortError when its signal aborts. */
function abortableFetcher(calls: string[], label: string) {
  return ({ signal }: { signal?: AbortSignal }) =>
    new Promise<string>((resolve, reject) => {
      calls.push(label);
      const timer = setTimeout(() => resolve(`${label} data`), 0);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        },
        { once: true }
      );
    });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

beforeEach(() => {
  resetSharedFetchCache();
});

afterEach(() => {
  resetSharedFetchCache();
});

describe('SharedFetchCache', () => {
  it('deduplicates concurrent fetches for the same key', async () => {
    const cache = createSharedFetchCache();
    const fetcher = vi.fn(async () => {
      await Promise.resolve();
      return { ok: true };
    });

    const [first, second] = await Promise.all([
      cache.getOrFetch(['users'], fetcher, { staleTime: 1_000 }),
      cache.getOrFetch(['users'], fetcher, { staleTime: 1_000 }),
    ]);

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('aborts the shared request only after the last consumer aborts', async () => {
    const cache = createSharedFetchCache();
    const firstController = new AbortController();
    const secondController = new AbortController();
    let capturedSignal: AbortSignal | undefined;

    const fetcher = vi.fn(
      ({ signal }: { signal?: AbortSignal }) =>
        new Promise<string>((_resolve, reject) => {
          capturedSignal = signal;
          if (signal?.aborted) {
            reject(signal.reason ?? new Error('aborted'));
            return;
          }
          signal?.addEventListener(
            'abort',
            () => reject(signal.reason ?? new Error('aborted')),
            { once: true }
          );
        })
    );

    const firstPromise = cache.getOrFetch(['users'], fetcher, {
      signal: firstController.signal,
      staleTime: 1_000,
    });
    const secondPromise = cache.getOrFetch(['users'], fetcher, {
      signal: secondController.signal,
      staleTime: 1_000,
    });

    firstController.abort();
    await expect(firstPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(capturedSignal?.aborted).toBe(false);

    secondController.abort();
    await expect(secondPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(capturedSignal?.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('starts a new fetch for a consumer that arrives right after the last one left', async () => {
    const cache = createSharedFetchCache();
    const calls: string[] = [];
    const first = new AbortController();

    const firstPromise = cache.getOrFetch(['users'], abortableFetcher(calls, 'first'), {
      signal: first.signal,
      staleTime: 1_000,
    });
    await Promise.resolve();
    await Promise.resolve();

    first.abort();
    const secondPromise = cache.getOrFetch(['users'], abortableFetcher(calls, 'second'), {
      signal: new AbortController().signal,
      staleTime: 1_000,
    });

    await expect(firstPromise).rejects.toMatchObject({ name: 'AbortError' });
    await expect(secondPromise).resolves.toBe('second data');
    expect(calls).toEqual(['first', 'second']);
  });

  it('drops the entry and its aliases as soon as its last consumer leaves', async () => {
    const cache = createSharedFetchCache();
    const controller = new AbortController();

    const pendingPromise = cache.getOrFetch(
      ['GET', '/api/users'],
      abortableFetcher([], 'first'),
      {
        signal: controller.signal,
        aliases: [['/api/users', 'GET', '/current-user']],
        staleTime: 1_000,
      }
    );
    await Promise.resolve();

    controller.abort();

    expect(cache.isPending(['GET', '/api/users'])).toBe(false);
    expect(inspectSharedFetchCacheBookkeepingForTest(cache)).toEqual({
      entries: 0,
      aliasesByPrimaryKey: 0,
      primaryKeysByAlias: 0,
      versions: 0,
    });
    await expect(pendingPromise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('keeps the new fetch result when a fetch its last consumer left resolves late', async () => {
    const cache = createSharedFetchCache();
    const lateResult = createDeferred<string>();
    const first = new AbortController();

    // This fetcher ignores its signal, so it resolves after it was aborted.
    const firstPromise = cache.getOrFetch(['users'], () => lateResult.promise, {
      signal: first.signal,
      staleTime: 1_000,
    });
    first.abort();
    const freshFetcher = vi.fn(async () => 'fresh');
    const secondPromise = cache.getOrFetch(['users'], freshFetcher, { staleTime: 1_000 });
    await Promise.resolve();
    await Promise.resolve();

    // Checked before awaiting the second caller, which would wait on the abandoned fetch if it
    // had joined it.
    expect(freshFetcher).toHaveBeenCalledTimes(1);
    await expect(firstPromise).rejects.toMatchObject({ name: 'AbortError' });
    await expect(secondPromise).resolves.toBe('fresh');

    // The abandoned fetch settles only after the new one has stored its data.
    lateResult.resolve('stale');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(cache.lookup(['users'], { staleTime: 1_000 })).toEqual({ hit: true, data: 'fresh' });
  });

  it('drops cached data after invalidate so the next consumer refetches', async () => {
    const cache = createSharedFetchCache();
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    await expect(cache.getOrFetch(['users'], fetcher, { staleTime: 1_000 })).resolves.toBe('first');
    await expect(cache.getOrFetch(['users'], fetcher, { staleTime: 1_000 })).resolves.toBe('first');
    expect(fetcher).toHaveBeenCalledTimes(1);

    cache.invalidate(['users']);

    await expect(cache.getOrFetch(['users'], fetcher, { staleTime: 1_000 })).resolves.toBe('second');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('releases version bookkeeping after invalidating a settled entry', async () => {
    const cache = createSharedFetchCache();

    await expect(cache.getOrFetch(['users'], () => Promise.resolve('first'), { staleTime: 1_000 })).resolves.toBe(
      'first'
    );

    cache.invalidate(['users']);

    expect(inspectSharedFetchCacheBookkeepingForTest(cache).versions).toBe(0);
  });

  it('invalidates a primary entry through an exact alias key', async () => {
    const cache = createSharedFetchCache();
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    await expect(
      cache.getOrFetch(
        ['GET', '/api/users', { Authorization: 'Bearer a' }],
        fetcher,
        {
          aliases: [['/api/users', 'GET', '/current-user']],
          staleTime: 1_000,
        }
      )
    ).resolves.toBe('first');
    await expect(
      cache.getOrFetch(
        ['GET', '/api/users', { Authorization: 'Bearer a' }],
        fetcher,
        {
          aliases: [['/api/users', 'GET', '/current-user']],
          staleTime: 1_000,
        }
      )
    ).resolves.toBe('first');
    expect(fetcher).toHaveBeenCalledTimes(1);

    cache.invalidate(['/api/users', 'GET', '/current-user']);

    await expect(
      cache.getOrFetch(
        ['GET', '/api/users', { Authorization: 'Bearer a' }],
        fetcher,
        {
          aliases: [['/api/users', 'GET', '/current-user']],
          staleTime: 1_000,
        }
      )
    ).resolves.toBe('second');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('aborts an in-flight request when the same key is invalidated', async () => {
    const cache = createSharedFetchCache();
    let capturedSignal: AbortSignal | undefined;

    const fetcher = vi.fn(
      ({ signal }: { signal?: AbortSignal }) =>
        new Promise<string>((_resolve, reject) => {
          capturedSignal = signal;
          signal?.addEventListener(
            'abort',
            () => reject(signal.reason ?? new Error('aborted')),
            { once: true }
          );
        })
    );

    const pendingPromise = cache.getOrFetch(['users'], fetcher, { staleTime: 1_000 });
    await Promise.resolve();

    cache.invalidate(['users']);

    await expect(pendingPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('releases version bookkeeping after an invalidated in-flight entry settles', async () => {
    const cache = createSharedFetchCache();

    const pendingPromise = cache.getOrFetch(
      ['users'],
      ({ signal }: { signal?: AbortSignal }) =>
        new Promise<string>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), {
            once: true,
          });
        }),
      { staleTime: 1_000 }
    );

    await Promise.resolve();
    cache.invalidate(['users']);

    await expect(pendingPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(inspectSharedFetchCacheBookkeepingForTest(cache).versions).toBe(0);
  });

  it.each([
    {
      outcome: 'fails',
      fetcher: () => new Promise<string>((_resolve, reject) => setTimeout(() => reject(new Error('boom')), 0)),
      staleTime: 1_000,
    },
    {
      outcome: 'resolves with staleTime 0',
      fetcher: () => new Promise<string>((resolve) => setTimeout(() => resolve('replacement'), 0)),
      staleTime: 0,
    },
  ])(
    'releases version bookkeeping when the replacement for an invalidated in-flight entry $outcome',
    async ({ fetcher, staleTime }) => {
      const cache = createSharedFetchCache();
      const invalidatedPromise = cache.getOrFetch(['users'], abortableFetcher([], 'first'), {
        staleTime: 1_000,
      });
      await Promise.resolve();
      cache.invalidate(['users']);

      // The replacement is still in flight when the invalidated fetch settles.
      const replacementPromise = cache.getOrFetch(['users'], fetcher, { staleTime });
      await expect(invalidatedPromise).rejects.toMatchObject({ name: 'AbortError' });
      await replacementPromise.catch(() => undefined);

      expect(inspectSharedFetchCacheBookkeepingForTest(cache).versions).toBe(0);
    }
  );

  it('normalizes caller-provided Error abort reasons to AbortError', async () => {
    const cache = createSharedFetchCache();
    const controller = new AbortController();
    const abortReason = new Error('request cancelled by caller');

    const fetcher = vi.fn(
      ({ signal }: { signal?: AbortSignal }) =>
        new Promise<string>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        })
    );

    const pendingPromise = cache.getOrFetch(['users'], fetcher, {
      signal: controller.signal,
      staleTime: 1_000,
    });

    controller.abort(abortReason);

    await expect(pendingPromise).rejects.toMatchObject({
      cause: abortReason,
      message: 'request cancelled by caller',
      name: 'AbortError',
    });
  });

  it('drops cached descendant data after prefix invalidation', async () => {
    const cache = createSharedFetchCache();
    const parentFetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('parent-first')
      .mockResolvedValueOnce('parent-second');
    const childFetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('child-first')
      .mockResolvedValueOnce('child-second');
    const unrelatedFetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('unrelated-first');

    await expect(cache.getOrFetch(['messages'], parentFetcher, { staleTime: 1_000 })).resolves.toBe('parent-first');
    await expect(cache.getOrFetch(['messages', { page: 1 }], childFetcher, { staleTime: 1_000 })).resolves.toBe('child-first');
    await expect(cache.getOrFetch(['other'], unrelatedFetcher, { staleTime: 1_000 })).resolves.toBe('unrelated-first');

    cache.invalidateMany({ key: ['messages'], exact: false });

    await expect(cache.getOrFetch(['messages'], parentFetcher, { staleTime: 1_000 })).resolves.toBe('parent-second');
    await expect(cache.getOrFetch(['messages', { page: 1 }], childFetcher, { staleTime: 1_000 })).resolves.toBe('child-second');
    await expect(cache.getOrFetch(['other'], unrelatedFetcher, { staleTime: 1_000 })).resolves.toBe('unrelated-first');
    expect(parentFetcher).toHaveBeenCalledTimes(2);
    expect(childFetcher).toHaveBeenCalledTimes(2);
    expect(unrelatedFetcher).toHaveBeenCalledTimes(1);
  });

  it('drops aliased descendant data after prefix invalidation', async () => {
    const cache = createSharedFetchCache();
    const parentFetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('parent-first')
      .mockResolvedValueOnce('parent-second');
    const childFetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('child-first')
      .mockResolvedValueOnce('child-second');

    await expect(
      cache.getOrFetch(
        ['GET', '/api/messages', { Authorization: 'Bearer a' }],
        parentFetcher,
        {
          aliases: [['/api/messages', 'GET', '/messages']],
          staleTime: 1_000,
        }
      )
    ).resolves.toBe('parent-first');
    await expect(
      cache.getOrFetch(
        ['GET', '/api/messages', { Authorization: 'Bearer a' }, { page: '1' }],
        childFetcher,
        {
          aliases: [['/api/messages', 'GET', '/messages', { page: '1' }]],
          staleTime: 1_000,
        }
      )
    ).resolves.toBe('child-first');

    cache.invalidateMany({ key: ['/api/messages', 'GET', '/messages'], exact: false });

    await expect(
      cache.getOrFetch(
        ['GET', '/api/messages', { Authorization: 'Bearer a' }],
        parentFetcher,
        {
          aliases: [['/api/messages', 'GET', '/messages']],
          staleTime: 1_000,
        }
      )
    ).resolves.toBe('parent-second');
    await expect(
      cache.getOrFetch(
        ['GET', '/api/messages', { Authorization: 'Bearer a' }, { page: '1' }],
        childFetcher,
        {
          aliases: [['/api/messages', 'GET', '/messages', { page: '1' }]],
          staleTime: 1_000,
        }
      )
    ).resolves.toBe('child-second');
    expect(parentFetcher).toHaveBeenCalledTimes(2);
    expect(childFetcher).toHaveBeenCalledTimes(2);
  });

  it('does not treat an empty prefix invalidation key as a wildcard', async () => {
    const cache = createSharedFetchCache();
    const targetFetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('target-first');
    const unrelatedFetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('unrelated-first');

    await expect(cache.getOrFetch(['target'], targetFetcher, { staleTime: 1_000 })).resolves.toBe(
      'target-first'
    );
    await expect(
      cache.getOrFetch(['unrelated'], unrelatedFetcher, { staleTime: 1_000 })
    ).resolves.toBe('unrelated-first');

    cache.invalidateMany({ key: [], exact: false });

    await expect(cache.getOrFetch(['target'], targetFetcher, { staleTime: 1_000 })).resolves.toBe(
      'target-first'
    );
    await expect(
      cache.getOrFetch(['unrelated'], unrelatedFetcher, { staleTime: 1_000 })
    ).resolves.toBe('unrelated-first');
    expect(targetFetcher).toHaveBeenCalledTimes(1);
    expect(unrelatedFetcher).toHaveBeenCalledTimes(1);
  });

  it('treats invalidateMany() without filters as a no-op', async () => {
    const cache = createSharedFetchCache();
    const targetFetcher = vi.fn<() => Promise<string>>().mockResolvedValueOnce('target-first');
    const unrelatedFetcher = vi.fn<() => Promise<string>>().mockResolvedValueOnce('unrelated-first');

    await expect(cache.getOrFetch(['target'], targetFetcher, { staleTime: 1_000 })).resolves.toBe(
      'target-first'
    );
    await expect(
      cache.getOrFetch(['unrelated'], unrelatedFetcher, { staleTime: 1_000 })
    ).resolves.toBe('unrelated-first');

    cache.invalidateMany();

    await expect(cache.getOrFetch(['target'], targetFetcher, { staleTime: 1_000 })).resolves.toBe(
      'target-first'
    );
    await expect(
      cache.getOrFetch(['unrelated'], unrelatedFetcher, { staleTime: 1_000 })
    ).resolves.toBe('unrelated-first');
    expect(targetFetcher).toHaveBeenCalledTimes(1);
    expect(unrelatedFetcher).toHaveBeenCalledTimes(1);
  });

  it('treats invalidateMany({}) as a no-op', async () => {
    const cache = createSharedFetchCache();
    const targetFetcher = vi.fn<() => Promise<string>>().mockResolvedValueOnce('target-first');
    const unrelatedFetcher = vi.fn<() => Promise<string>>().mockResolvedValueOnce('unrelated-first');

    await expect(cache.getOrFetch(['target'], targetFetcher, { staleTime: 1_000 })).resolves.toBe(
      'target-first'
    );
    await expect(
      cache.getOrFetch(['unrelated'], unrelatedFetcher, { staleTime: 1_000 })
    ).resolves.toBe('unrelated-first');

    cache.invalidateMany({});

    await expect(cache.getOrFetch(['target'], targetFetcher, { staleTime: 1_000 })).resolves.toBe(
      'target-first'
    );
    await expect(
      cache.getOrFetch(['unrelated'], unrelatedFetcher, { staleTime: 1_000 })
    ).resolves.toBe('unrelated-first');
    expect(targetFetcher).toHaveBeenCalledTimes(1);
    expect(unrelatedFetcher).toHaveBeenCalledTimes(1);
  });

  it('aborts pending descendant requests during prefix invalidation', async () => {
    const cache = createSharedFetchCache();
    let parentSignal: AbortSignal | undefined;
    let childSignal: AbortSignal | undefined;

    const parentFetcher = vi.fn(
      ({ signal }: { signal?: AbortSignal }) =>
        new Promise<string>((_resolve, reject) => {
          parentSignal = signal;
          if (signal?.aborted) {
            reject(signal.reason ?? new Error('aborted'));
            return;
          }
          signal?.addEventListener(
            'abort',
            () => reject(signal.reason ?? new Error('aborted')),
            { once: true }
          );
        })
    );
    const childFetcher = vi.fn(
      ({ signal }: { signal?: AbortSignal }) =>
        new Promise<string>((_resolve, reject) => {
          childSignal = signal;
          if (signal?.aborted) {
            reject(signal.reason ?? new Error('aborted'));
            return;
          }
          signal?.addEventListener(
            'abort',
            () => reject(signal.reason ?? new Error('aborted')),
            { once: true }
          );
        })
    );

    const parentPromise = cache.getOrFetch(['messages'], parentFetcher, { staleTime: 1_000 });
    const childPromise = cache.getOrFetch(['messages', { page: 1 }], childFetcher, {
      staleTime: 1_000,
    });

    cache.invalidateMany({ key: ['messages'], exact: false });

    await expect(parentPromise).rejects.toMatchObject({ name: 'AbortError' });
    await expect(childPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(parentSignal?.aborted).toBe(true);
    expect(childSignal?.aborted).toBe(true);
  });

  it('does not reuse resolved data when staleTime is zero', async () => {
    const cache = createSharedFetchCache();
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    await expect(cache.getOrFetch(['users'], fetcher, { staleTime: 0 })).resolves.toBe('first');
    await expect(cache.getOrFetch(['users'], fetcher, { staleTime: 0 })).resolves.toBe('second');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('cleans up alias bookkeeping when a zero-stale entry is dropped after success', async () => {
    const cache = createSharedFetchCache();

    await expect(
      cache.getOrFetch(['GET', '/api/users', { Authorization: 'Bearer a' }], () => Promise.resolve('ok'), {
        aliases: [['/api/users', 'GET', '/current-user']],
        staleTime: 0,
      })
    ).resolves.toBe('ok');

    const bookkeeping = inspectSharedFetchCacheBookkeepingForTest(cache);
    expect(bookkeeping.aliasesByPrimaryKey).toBe(0);
    expect(bookkeeping.primaryKeysByAlias).toBe(0);
  });

  it('cleans up alias bookkeeping when a fetch fails', async () => {
    const cache = createSharedFetchCache();

    await expect(
      cache.getOrFetch(
        ['GET', '/api/users', { Authorization: 'Bearer a' }],
        () => Promise.reject(new Error('boom')),
        {
          aliases: [['/api/users', 'GET', '/current-user']],
          staleTime: 1_000,
        }
      )
    ).rejects.toThrow('boom');

    const bookkeeping = inspectSharedFetchCacheBookkeepingForTest(cache);
    expect(bookkeeping.aliasesByPrimaryKey).toBe(0);
    expect(bookkeeping.primaryKeysByAlias).toBe(0);
  });

  it('does not reuse cached data when a later caller requests staleTime zero', async () => {
    const cache = createSharedFetchCache();
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    await expect(cache.getOrFetch(['users'], fetcher, { staleTime: 60_000 })).resolves.toBe('first');
    await expect(cache.getOrFetch(['users'], fetcher, { staleTime: 0 })).resolves.toBe('second');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('uses the later caller staleTime when checking cached data freshness', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-06T00:00:00.000Z'));

    const cache = createSharedFetchCache();
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    await expect(cache.getOrFetch(['users'], fetcher, { staleTime: 60_000 })).resolves.toBe('first');

    vi.advanceTimersByTime(750);

    await expect(cache.getOrFetch(['users'], fetcher, { staleTime: 500 })).resolves.toBe('second');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('retains a deduped result when a concurrent caller requests caching', async () => {
    const cache = createSharedFetchCache();
    const fetcher = vi.fn(async () => {
      await Promise.resolve();
      return 'shared';
    });

    await expect(
      Promise.all([
        cache.getOrFetch(['users'], fetcher, { staleTime: 0 }),
        cache.getOrFetch(['users'], fetcher, { staleTime: 1_000 }),
      ])
    ).resolves.toEqual(['shared', 'shared']);

    await expect(cache.getOrFetch(['users'], fetcher, { staleTime: 1_000 })).resolves.toBe('shared');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('drops all cached data after clear so every key refetches', async () => {
    const cache = createSharedFetchCache();
    const usersFetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('users-first')
      .mockResolvedValueOnce('users-second');
    const profileFetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('profile-first')
      .mockResolvedValueOnce('profile-second');

    await expect(cache.getOrFetch(['users'], usersFetcher, { staleTime: 1_000 })).resolves.toBe('users-first');
    await expect(cache.getOrFetch(['profile'], profileFetcher, { staleTime: 1_000 })).resolves.toBe('profile-first');

    cache.clear();

    await expect(cache.getOrFetch(['users'], usersFetcher, { staleTime: 1_000 })).resolves.toBe('users-second');
    await expect(cache.getOrFetch(['profile'], profileFetcher, { staleTime: 1_000 })).resolves.toBe('profile-second');
    expect(usersFetcher).toHaveBeenCalledTimes(2);
    expect(profileFetcher).toHaveBeenCalledTimes(2);
  });

  it('reuses the global cache while it is retained by another runtime', async () => {
    const firstCache = retainSharedFetchCache();
    const secondCache = retainSharedFetchCache();
    const fetcher = vi.fn().mockResolvedValue('shared');

    await firstCache.getOrFetch(['users'], fetcher, { staleTime: 1_000 });
    releaseSharedFetchCache();
    await secondCache.getOrFetch(['users'], fetcher, { staleTime: 1_000 });

    expect(fetcher).toHaveBeenCalledTimes(1);
    releaseSharedFetchCache();
  });

  it('resets the global cache after the last retained runtime releases it', async () => {
    const firstCache = retainSharedFetchCache();
    const fetcher = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

    await firstCache.getOrFetch(['users'], fetcher, { staleTime: 1_000 });
    releaseSharedFetchCache();

    const secondCache = getSharedFetchCache();
    await secondCache.getOrFetch(['users'], fetcher, { staleTime: 1_000 });

    expect(secondCache).not.toBe(firstCache);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
