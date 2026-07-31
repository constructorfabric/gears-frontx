/**
 * Integration tests for useApiMutation and QueryCache methods.
 *
 * Covers:
 *   - useApiMutation: accepts { endpoint, callbacks }, returns ApiMutationResult
 *   - QueryCache: methods accept EndpointDescriptor | QueryKey via resolveKey
 *   - createQueryCache.invalidateMany: skips empty keys, invalidates present keys
 *   - Cross-root cache sync: set/invalidate/remove broadcast into sibling providers
 *
 * @packageDocumentation
 */

// @cpt-FEATURE:implement-endpoint-descriptors:p3
// @cpt-FEATURE:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { eventBus, resetSharedFetchCache, resetSharedQueryClient } from '@gears-frontx/framework';
import { useApiMutation } from '../src/hooks/useApiMutation';
import { createQueryCache, type MutationCallbackContext } from '../src/hooks/QueryCache';
import {
  ownedApps,
  buildTestQueryClient,
  buildMutationCacheTestQueryClient,
  makeQueryWrapper,
  makeMutationDescriptor,
  makeQueryDescriptor,
  buildPresetApp,
  getAttachedQueryClient,
} from './queryHooks.helpers';

afterEach(() => {
  ownedApps.forEach((app) => {
    app.destroy();
  });
  ownedApps.length = 0;
  eventBus.clearAll();
  resetSharedFetchCache();
  resetSharedQueryClient();
});

// ============================================================================
// useApiMutation
// ============================================================================

describe('useApiMutation', () => {
  // @cpt-begin:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-test-calls-fn
  it('calls endpoint.fetch with the variables passed to mutate()', async () => {
    const client = buildTestQueryClient();
    const wrapper = makeQueryWrapper(client);

    const fetchFn = vi.fn(async (vars: { name: string }) => vars.name);
    const endpoint = makeMutationDescriptor<string, { name: string }>(
      ['updateName'],
      fetchFn
    );

    const { result } = renderHook(
      () => useApiMutation<string, Error, { name: string }>({ endpoint }),
      { wrapper }
    );

    result.current.mutate({ name: 'test' });

    await waitFor(() => expect(result.current.data).toBe('test'));
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenCalledWith(
      { name: 'test' },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(result.current.isPending).toBe(false);
  });
  // @cpt-end:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-test-calls-fn

  // @cpt-begin:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-test-on-success
  it('calls onSuccess callback with { queryCache } injected as final argument', async () => {
    const client = buildTestQueryClient();
    const wrapper = makeQueryWrapper(client);

    const onSuccess = vi.fn();
    const endpoint = makeMutationDescriptor<string, string>(
      ['toUpper'],
      async (value) => value.toUpperCase()
    );

    const { result } = renderHook(
      () =>
        useApiMutation<string, Error, string>({
          endpoint,
          onSuccess,
        }),
      { wrapper }
    );

    result.current.mutate('hello');

    await waitFor(() => expect(result.current.data).toBe('HELLO'));
    expect(onSuccess).toHaveBeenCalledOnce();
    // Verify the injected { queryCache } context is the final argument
    const [data, variables, context, callbackCtx] = onSuccess.mock.calls[0] as [string, string, unknown, MutationCallbackContext];
    expect(data).toBe('HELLO');
    expect(variables).toBe('hello');
    expect(context).toBeUndefined();
    expect(callbackCtx).toHaveProperty('queryCache');
    expect(typeof callbackCtx.queryCache.get).toBe('function');
    expect(typeof callbackCtx.queryCache.set).toBe('function');
    expect(typeof callbackCtx.queryCache.invalidate).toBe('function');
    expect(typeof callbackCtx.queryCache.cancel).toBe('function');
    expect(typeof callbackCtx.queryCache.remove).toBe('function');
  });
  // @cpt-end:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-test-on-success

  // @cpt-begin:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-test-query-cache-get-set
  it('queryCache.get and queryCache.set read and write to the QueryClient cache', async () => {
    const client = buildMutationCacheTestQueryClient();
    const wrapper = makeQueryWrapper(client);

    const QUERY_KEY = ['@test', 'item'];
    // Seed an initial cache entry before the mutation runs.
    client.setQueryData(QUERY_KEY, { count: 0 });

    let capturedGet: unknown;
    let capturedSet: unknown;

    const endpoint = makeMutationDescriptor<void, void>(['noop'], async () => undefined);

    const { result } = renderHook(
      () =>
        useApiMutation<void, Error, void>({
          endpoint,
          onMutate: async (_variables, { queryCache }) => {
            // Read the seeded value via queryCache.get (raw QueryKey)
            capturedGet = queryCache.get<{ count: number }>(QUERY_KEY);
            // Write an optimistic update via queryCache.set (plain value)
            queryCache.set(QUERY_KEY, { count: 99 });
            capturedSet = queryCache.get<{ count: number }>(QUERY_KEY);
          },
        }),
      { wrapper }
    );

    result.current.mutate();

    await waitFor(() => expect(result.current.data).toBeUndefined());
    await waitFor(() => expect(result.current.isPending).toBe(false));

    // get() returned the seeded value
    expect(capturedGet).toEqual({ count: 0 });
    // set() wrote the optimistic value and get() reflects it immediately
    expect(capturedSet).toEqual({ count: 99 });
    // The underlying QueryClient also holds the updated value
    expect(client.getQueryData(QUERY_KEY)).toEqual({ count: 99 });
  });
  // @cpt-end:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-test-query-cache-get-set

  it('queryCache methods accept EndpointDescriptor in place of raw QueryKey', async () => {
    const client = buildMutationCacheTestQueryClient();
    const wrapper = makeQueryWrapper(client);

    const QUERY_KEY = ['@test', 'descriptor-key-test'] as const;
    const queryDescriptor = makeQueryDescriptor(QUERY_KEY, () => Promise.resolve({ v: 1 }));

    client.setQueryData([...QUERY_KEY], { v: 0 });

    let capturedViaDescriptor: unknown;

    const mutationEndpoint = makeMutationDescriptor<void, void>(['noop2'], async () => undefined);

    const { result } = renderHook(
      () =>
        useApiMutation<void, Error, void>({
          endpoint: mutationEndpoint,
          onMutate: async (_vars, { queryCache }) => {
            // Pass EndpointDescriptor — resolveKey extracts .key automatically
            capturedViaDescriptor = queryCache.get<{ v: number }>(queryDescriptor);
            queryCache.set(queryDescriptor, { v: 42 });
          },
        }),
      { wrapper }
    );

    result.current.mutate();

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(capturedViaDescriptor).toEqual({ v: 0 });
    expect(client.getQueryData([...QUERY_KEY])).toEqual({ v: 42 });
  });

  // @cpt-begin:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-test-set-updater
  it('queryCache.set supports an updater function for atomic read-modify-write', async () => {
    const client = buildMutationCacheTestQueryClient();
    const wrapper = makeQueryWrapper(client);

    const QUERY_KEY = ['@test', 'list'];
    client.setQueryData(QUERY_KEY, ['a', 'b']);

    const endpoint = makeMutationDescriptor<void, void>(['appendC'], async () => undefined);

    const { result } = renderHook(
      () =>
        useApiMutation<void, Error, void>({
          endpoint,
          onMutate: async (_variables, { queryCache }) => {
            // Updater function receives the current value; return appended list.
            queryCache.set<string[]>(QUERY_KEY, (old) => [...(old ?? []), 'c']);
          },
        }),
      { wrapper }
    );

    result.current.mutate();

    await waitFor(() => expect(result.current.isPending).toBe(false));
    // Updater appended 'c' atomically.
    expect(client.getQueryData(QUERY_KEY)).toEqual(['a', 'b', 'c']);
  });
  // @cpt-end:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-test-set-updater

  // @cpt-begin:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-test-query-cache-invalidate
  it('queryCache.invalidate in onSettled marks cached queries as stale', async () => {
    const client = buildMutationCacheTestQueryClient();
    const wrapper = makeQueryWrapper(client);

    const QUERY_KEY = ['@test', 'entity'];
    client.setQueryData(QUERY_KEY, { value: 'original' });

    const endpoint = makeMutationDescriptor<void, void>(['noopInvalidate'], async () => undefined);

    const { result } = renderHook(
      () =>
        useApiMutation<void, Error, void>({
          endpoint,
          onSettled: async (_data, _error, _variables, _context, { queryCache }) => {
            await queryCache.invalidate(QUERY_KEY);
          },
        }),
      { wrapper }
    );

    result.current.mutate();

    await waitFor(() => expect(result.current.isPending).toBe(false));
    // After invalidation, the query is marked stale (isInvalidated flag).
    const queryState = client.getQueryState(QUERY_KEY);
    expect(queryState?.isInvalidated).toBe(true);
  });
  // @cpt-end:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-test-query-cache-invalidate

  it('uses the latest lifecycle callback closures after rerender while a mutation is in flight', async () => {
    const client = buildMutationCacheTestQueryClient();
    const wrapper = makeQueryWrapper(client);

    const FIRST_QUERY_KEY = ['@test', 'settled-first'];
    const SECOND_QUERY_KEY = ['@test', 'settled-second'];
    client.setQueryData(FIRST_QUERY_KEY, { value: 'first' });
    client.setQueryData(SECOND_QUERY_KEY, { value: 'second' });

    let resolveMutation!: () => void;
    const mutationGate = new Promise<void>((resolve) => {
      resolveMutation = resolve;
    });

    const endpoint = makeMutationDescriptor<void, void>(
      ['rerenderedSettledCallback'],
      async () => {
        await mutationGate;
      }
    );

    const { result, rerender } = renderHook(
      ({ queryKey }: { queryKey: readonly unknown[] }) =>
        useApiMutation<void, Error, void>({
          endpoint,
          onSettled: async (_data, _error, _variables, _context, { queryCache }) => {
            await queryCache.invalidate(queryKey);
          },
        }),
      {
        wrapper,
        initialProps: { queryKey: FIRST_QUERY_KEY },
      }
    );

    let mutatePromise!: Promise<void>;
    await act(async () => {
      mutatePromise = result.current.mutateAsync();
    });

    rerender({ queryKey: SECOND_QUERY_KEY });

    await act(async () => {
      resolveMutation();
      await mutatePromise;
    });

    await waitFor(() =>
      expect(client.getQueryState(SECOND_QUERY_KEY)?.isInvalidated).toBe(true)
    );
    expect(client.getQueryState(FIRST_QUERY_KEY)?.isInvalidated).not.toBe(true);
  });

  // @cpt-begin:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-test-on-error-rollback
  it('onError receives { queryCache } for snapshot rollback on mutation failure', async () => {
    const client = buildMutationCacheTestQueryClient();
    const wrapper = makeQueryWrapper(client);

    const QUERY_KEY = ['@test', 'rollback'];
    client.setQueryData(QUERY_KEY, { value: 'original' });

    const endpoint = makeMutationDescriptor<void, void>(
      ['alwaysFail'],
      async () => { throw new Error('server error'); }
    );

    const { result } = renderHook(
      () =>
        useApiMutation<void, Error, void, { snapshot: unknown }>({
          endpoint,
          onMutate: async (_variables, { queryCache }) => {
            const snapshot = queryCache.get(QUERY_KEY);
            queryCache.set(QUERY_KEY, { value: 'optimistic' });
            return { snapshot };
          },
          onError: async (_error, _variables, context, { queryCache }) => {
            // Restore the snapshot using the context from onMutate.
            if (context?.snapshot !== undefined) {
              queryCache.set(QUERY_KEY, context.snapshot);
            }
          },
        }),
      { wrapper }
    );

    result.current.mutate();

    await waitFor(() => expect(result.current.error).toBeDefined());
    // After rollback, the original value is restored.
    expect(client.getQueryData(QUERY_KEY)).toEqual({ value: 'original' });
  });
  // @cpt-end:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-test-on-error-rollback

  // @cpt-begin:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-test-abort-unmount
  it('does not abort the descriptor fetch signal on unmount by default', async () => {
    expect.assertions(2);
    const client = buildTestQueryClient();
    const wrapper = makeQueryWrapper(client);

    let resolveGate!: () => void;
    const gate = new Promise<void>((r) => {
      resolveGate = r;
    });

    let ranPastGate = false;
    const endpoint = makeMutationDescriptor<string, void>(['abortOnUnmount'], async (_vars, opts) => {
      await gate;
      if (opts?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      ranPastGate = true;
      return 'should-not-win';
    });

    const { result, unmount } = renderHook(
      () => useApiMutation<string, Error, void>({ endpoint }),
      { wrapper }
    );

    let mutatePromise!: Promise<string>;
    await act(async () => {
      mutatePromise = result.current.mutateAsync();
    });

    unmount();

    await act(async () => {
      resolveGate();
      await expect(mutatePromise).resolves.toBe('should-not-win');
    });
    expect(ranPastGate).toBe(true);
  });
  // @cpt-end:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-test-abort-unmount

  it('aborts the descriptor fetch signal on unmount when abortOnUnmount is enabled', async () => {
    expect.assertions(2);
    const client = buildTestQueryClient();
    const wrapper = makeQueryWrapper(client);

    let resolveGate!: () => void;
    const gate = new Promise<void>((r) => {
      resolveGate = r;
    });

    let ranPastGate = false;
    const endpoint = makeMutationDescriptor<string, void>(['abortOnUnmountEnabled'], async (_vars, opts) => {
      await gate;
      if (opts?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      ranPastGate = true;
      return 'should-not-win';
    });

    const { result, unmount } = renderHook(
      () => useApiMutation<string, Error, void>({ endpoint, abortOnUnmount: true }),
      { wrapper }
    );

    let mutatePromise!: Promise<string>;
    await act(async () => {
      mutatePromise = result.current.mutateAsync();
    });

    unmount();

    await act(async () => {
      resolveGate();
      await expect(mutatePromise).rejects.toMatchObject({ name: 'AbortError' });
    });
    expect(ranPastGate).toBe(false);
  });

  it('aborts all in-flight descriptor fetch signals on unmount when abortOnUnmount is enabled', async () => {
    expect.assertions(4);
    const client = buildTestQueryClient();
    const wrapper = makeQueryWrapper(client);

    let resolveGate1!: () => void;
    const gate1 = new Promise<void>((r) => {
      resolveGate1 = r;
    });
    let resolveGate2!: () => void;
    const gate2 = new Promise<void>((r) => {
      resolveGate2 = r;
    });

    let firstRanPastGate = false;
    let secondRanPastGate = false;
    const endpoint = makeMutationDescriptor<number, { batch: 1 | 2 }>(
      ['abortAllOnUnmount'],
      async (vars, opts) => {
        await (vars.batch === 1 ? gate1 : gate2);
        if (opts?.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        if (vars.batch === 1) {
          firstRanPastGate = true;
        } else {
          secondRanPastGate = true;
        }
        return vars.batch;
      }
    );

    const { result, unmount } = renderHook(
      () => useApiMutation<number, Error, { batch: 1 | 2 }>({ endpoint, abortOnUnmount: true }),
      { wrapper }
    );

    let firstPromise!: Promise<number>;
    let secondPromise!: Promise<number>;
    await act(async () => {
      firstPromise = result.current.mutateAsync({ batch: 1 });
    });
    await act(async () => {
      secondPromise = result.current.mutateAsync({ batch: 2 });
    });

    unmount();

    await act(async () => {
      resolveGate1();
      resolveGate2();
      await expect(firstPromise).rejects.toMatchObject({ name: 'AbortError' });
      await expect(secondPromise).rejects.toMatchObject({ name: 'AbortError' });
    });

    expect(firstRanPastGate).toBe(false);
    expect(secondRanPastGate).toBe(false);
  });

  // @cpt-begin:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-test-abort-supersede
  it('does not abort the prior in-flight fetch when a new mutateAsync starts by default', async () => {
    expect.assertions(3);
    const client = buildTestQueryClient();
    const wrapper = makeQueryWrapper(client);

    let resolveGate1!: () => void;
    const gate1 = new Promise<void>((r) => {
      resolveGate1 = r;
    });
    let resolveGate2!: () => void;
    const gate2 = new Promise<void>((r) => {
      resolveGate2 = r;
    });

    let firstCompleted = false;
    const endpoint = makeMutationDescriptor<number, { batch: 1 | 2 }>(
      ['abortSupersede'],
      async (vars, opts) => {
        await (vars.batch === 1 ? gate1 : gate2);
        if (opts?.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        if (vars.batch === 1) {
          firstCompleted = true;
        }
        return vars.batch;
      }
    );

    const { result } = renderHook(
      () => useApiMutation<number, Error, { batch: 1 | 2 }>({ endpoint }),
      { wrapper }
    );

    let firstPromise!: Promise<number>;
    let secondPromise!: Promise<number>;
    await act(async () => {
      firstPromise = result.current.mutateAsync({ batch: 1 });
    });
    await act(async () => {
      secondPromise = result.current.mutateAsync({ batch: 2 });
    });

    await act(async () => {
      resolveGate1();
      await expect(firstPromise).resolves.toBe(1);
    });
    expect(firstCompleted).toBe(true);

    await act(async () => {
      resolveGate2();
      await expect(secondPromise).resolves.toBe(2);
    });
  });
  // @cpt-end:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-test-abort-supersede

  it('aborts the prior in-flight fetch when cancelOnSupersede is enabled', async () => {
    expect.assertions(3);
    const client = buildTestQueryClient();
    const wrapper = makeQueryWrapper(client);

    let resolveGate1!: () => void;
    const gate1 = new Promise<void>((r) => {
      resolveGate1 = r;
    });
    let resolveGate2!: () => void;
    const gate2 = new Promise<void>((r) => {
      resolveGate2 = r;
    });

    let firstCompleted = false;
    const endpoint = makeMutationDescriptor<number, { batch: 1 | 2 }>(
      ['abortSupersedeEnabled'],
      async (vars, opts) => {
        await (vars.batch === 1 ? gate1 : gate2);
        if (opts?.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        if (vars.batch === 1) {
          firstCompleted = true;
        }
        return vars.batch;
      }
    );

    const { result } = renderHook(
      () => useApiMutation<number, Error, { batch: 1 | 2 }>({ endpoint, cancelOnSupersede: true }),
      { wrapper }
    );

    let firstPromise!: Promise<number>;
    let secondPromise!: Promise<number>;
    await act(async () => {
      firstPromise = result.current.mutateAsync({ batch: 1 });
    });
    await act(async () => {
      secondPromise = result.current.mutateAsync({ batch: 2 });
    });

    await act(async () => {
      resolveGate1();
      await expect(firstPromise).rejects.toMatchObject({ name: 'AbortError' });
    });
    expect(firstCompleted).toBe(false);

    await act(async () => {
      resolveGate2();
      await expect(secondPromise).resolves.toBe(2);
    });
  });
});

// ============================================================================
// createQueryCache.invalidateMany
// ============================================================================

describe('createQueryCache.invalidateMany', () => {
  it('does not call invalidateQueries when queryKey is missing, null, or empty', async () => {
    const queryClient = buildTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const cache = createQueryCache(queryClient);

    await cache.invalidateMany();
    await cache.invalidateMany({});
    await cache.invalidateMany({ queryKey: undefined });
    await cache.invalidateMany({ queryKey: null });
    await cache.invalidateMany({ queryKey: [] });

    expect(invalidateSpy).not.toHaveBeenCalled();
    invalidateSpy.mockRestore();
  });

  it('invalidates when queryKey is present', async () => {
    const queryClient = buildTestQueryClient();
    const queryKey = ['@test', 'invalidate-many'] as const;
    queryClient.setQueryData(queryKey, { ok: true });
    const cache = createQueryCache(queryClient);

    await cache.invalidateMany({ queryKey });

    expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true);
  });
});

// ============================================================================
// Cross-root cache sync
// ============================================================================

describe('QueryCache stays shared across separate providers', () => {
  it('queryCache.set broadcasts updates into sibling providers using a different QueryClient', async () => {
    const clientA = buildMutationCacheTestQueryClient();
    const appB = buildPresetApp();
    const clientB = getAttachedQueryClient(appB);
    const queryKey = ['@test', 'broadcast', 'set'] as const;

    expect(clientB).not.toBe(clientA);
    clientA.setQueryData(queryKey, { value: 'seed-a' });
    clientB.setQueryData(queryKey, { value: 'seed-b' });

    const queryCacheA = createQueryCache(clientA);

    queryCacheA.set(queryKey, { value: 'optimistic' });

    expect(clientA.getQueryData(queryKey)).toEqual({ value: 'optimistic' });
    await waitFor(() =>
      expect(clientB.getQueryData(queryKey)).toEqual({ value: 'optimistic' })
    );
  });

  it('queryCache.set rollback restores sibling providers using a different QueryClient', async () => {
    const clientA = buildMutationCacheTestQueryClient();
    const appB = buildPresetApp();
    const clientB = getAttachedQueryClient(appB);
    const queryKey = ['@test', 'broadcast', 'rollback'] as const;

    expect(clientB).not.toBe(clientA);
    clientA.setQueryData(queryKey, { value: 'original' });
    clientB.setQueryData(queryKey, { value: 'original' });

    const queryCacheA = createQueryCache(clientA);

    queryCacheA.set(queryKey, { value: 'optimistic' });
    expect(clientA.getQueryData(queryKey)).toEqual({ value: 'optimistic' });
    await waitFor(() =>
      expect(clientB.getQueryData(queryKey)).toEqual({ value: 'optimistic' })
    );

    queryCacheA.set(queryKey, { value: 'original' });
    await waitFor(() => {
      expect(clientA.getQueryData(queryKey)).toEqual({ value: 'original' });
      expect(clientB.getQueryData(queryKey)).toEqual({ value: 'original' });
    });
  });

  it('queryCache.invalidate broadcasts stale state into sibling providers using a different QueryClient', async () => {
    const clientA = buildMutationCacheTestQueryClient();
    const appB = buildPresetApp();
    const clientB = getAttachedQueryClient(appB);
    const queryKey = ['@test', 'broadcast', 'invalidate'] as const;

    expect(clientB).not.toBe(clientA);
    clientA.setQueryData(queryKey, { value: 'stale-a' });
    clientB.setQueryData(queryKey, { value: 'stale-b' });

    const queryCacheA = createQueryCache(clientA);

    await queryCacheA.invalidate(queryKey);

    await waitFor(() => {
      expect(clientA.getQueryState(queryKey)?.isInvalidated).toBe(true);
      expect(clientB.getQueryState(queryKey)?.isInvalidated).toBe(true);
    });
  });

  it('queryCache.remove broadcasts removals into sibling providers using a different QueryClient', async () => {
    const clientA = buildMutationCacheTestQueryClient();
    const appB = buildPresetApp();
    const clientB = getAttachedQueryClient(appB);
    const queryKey = ['@test', 'broadcast', 'remove'] as const;

    expect(clientB).not.toBe(clientA);
    clientA.setQueryData(queryKey, { value: 'seed-a' });
    clientB.setQueryData(queryKey, { value: 'seed-b' });

    const queryCacheA = createQueryCache(clientA);

    queryCacheA.remove(queryKey);

    await waitFor(() => {
      expect(clientA.getQueryState(queryKey)).toBeUndefined();
      expect(clientB.getQueryState(queryKey)).toBeUndefined();
    });
  });
});
