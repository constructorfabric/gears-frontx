/**
 * Integration tests for useApiQuery — TanStack Query–backed read hook.
 *
 * Covers:
 *   - useApiQuery: accepts EndpointDescriptor, returns ApiQueryResult
 *   - staleTime cascading (descriptor → component override → runtime default)
 *   - shared-fetch-cache interaction with queryCache/queryCacheShared plugins
 *
 * @packageDocumentation
 */

// @cpt-FEATURE:implement-endpoint-descriptors:p3
// @cpt-FEATURE:cpt-frontx-dod-request-lifecycle-use-api-query:p2

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { eventBus, resetSharedFetchCache, resetSharedQueryClient } from '@gears-frontx/framework';
import { FrontXProvider, useApiQuery } from '@gears-frontx/react';
import {
  ownedApps,
  buildTestQueryClient,
  makeQueryWrapper,
  makeQueryDescriptor,
  makeRestQueryDescriptor,
  buildHostAppWithQueryCache,
  buildChildAppWithQueryCacheShared,
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
// useApiQuery
// ============================================================================

describe('useApiQuery', () => {
  // @cpt-begin:cpt-frontx-dod-request-lifecycle-use-api-query:p2:inst-test-data
  it('returns data from a successful descriptor fetch', async () => {
    const client = buildTestQueryClient();
    const wrapper = makeQueryWrapper(client);

    const descriptor = makeQueryDescriptor(
      ['item', 1],
      () => Promise.resolve({ id: 1 })
    );

    const { result } = renderHook(
      () => useApiQuery<{ id: number }>(descriptor),
      { wrapper }
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({ id: 1 });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
  });
  // @cpt-end:cpt-frontx-dod-request-lifecycle-use-api-query:p2:inst-test-data

  // @cpt-begin:cpt-frontx-dod-request-lifecycle-use-api-query:p2:inst-test-loading
  it('reports isLoading true before the descriptor fetch resolves', () => {
    const client = buildTestQueryClient();
    const wrapper = makeQueryWrapper(client);

    // A promise that never settles keeps the hook in loading state.
    const descriptor = makeQueryDescriptor<string>(
      ['slow'],
      () => new Promise(() => undefined)
    );

    const { result } = renderHook(
      () => useApiQuery<string>(descriptor),
      { wrapper }
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
  // @cpt-end:cpt-frontx-dod-request-lifecycle-use-api-query:p2:inst-test-loading

  // @cpt-begin:cpt-frontx-dod-request-lifecycle-use-api-query:p2:inst-test-error
  it('reports isError true and exposes error when descriptor fetch rejects', async () => {
    const client = buildTestQueryClient();
    const wrapper = makeQueryWrapper(client);

    const boom = new Error('network failure');
    const descriptor = makeQueryDescriptor<never>(
      ['bad'],
      () => Promise.reject(boom)
    );

    const { result } = renderHook(
      () => useApiQuery<never, Error>(descriptor),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(boom);
  });
  // @cpt-end:cpt-frontx-dod-request-lifecycle-use-api-query:p2:inst-test-error

  it('descriptor staleTime is applied as cache config (override cascades)', async () => {
    const client = buildTestQueryClient();
    const wrapper = makeQueryWrapper(client);

    const descriptor = makeQueryDescriptor(
      ['config'],
      () => Promise.resolve({ v: 1 }),
      { staleTime: 600_000 }
    );

    const { result } = renderHook(
      () => useApiQuery(descriptor),
      { wrapper }
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    // Query should not be stale because staleTime = 10 min
    const queryState = client.getQueryState(['config']);
    expect(queryState?.isInvalidated).toBeFalsy();
  });

  it('component-level override makes the cached query stale on remount', async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: 0, gcTime: 300_000 },
        mutations: { retry: 0 },
      },
    });
    const wrapper = makeQueryWrapper(client);
    const fetchFn = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    const descriptor = makeQueryDescriptor(
      ['overrideTest'],
      fetchFn,
      { staleTime: 600_000 }
    );

    const firstRender = renderHook(
      () => useApiQuery(descriptor, { staleTime: 0 }),
      { wrapper }
    );

    await waitFor(() => expect(firstRender.result.current.data).toBe('first'));
    firstRender.unmount();

    const secondRender = renderHook(
      () => useApiQuery(descriptor, { staleTime: 0 }),
      { wrapper }
    );

    await waitFor(() => expect(secondRender.result.current.data).toBe('second'));
    expect(fetchFn).toHaveBeenCalledTimes(2);
    secondRender.unmount();
  });

  it('forwards component staleTime overrides into descriptor fetches', async () => {
    const client = buildTestQueryClient();
    const wrapper = makeQueryWrapper(client);
    const fetchFn = vi.fn(() => Promise.resolve('value'));

    const descriptor = makeQueryDescriptor(
      ['overrideForwarded'],
      fetchFn,
      { staleTime: 600_000 }
    );

    const { result } = renderHook(
      () => useApiQuery(descriptor, { staleTime: 0 }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.data).toBe('value'));
    expect(fetchFn).toHaveBeenCalledWith(
      expect.objectContaining({ staleTime: 0 })
    );
  });

  it('forwards runtime default staleTime into descriptor fetches', async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: 0, gcTime: 0, staleTime: 0 },
        mutations: { retry: 0 },
      },
    });
    const wrapper = makeQueryWrapper(client);
    const fetchFn = vi.fn(() => Promise.resolve('value'));
    const descriptor = makeQueryDescriptor(['runtimeDefaultForwarded'], fetchFn);

    const { result } = renderHook(
      () => useApiQuery(descriptor),
      { wrapper }
    );

    await waitFor(() => expect(result.current.data).toBe('value'));
    expect(fetchFn).toHaveBeenCalledWith(
      expect.objectContaining({ staleTime: 0 })
    );
  });

  it('queryCache({ staleTime: 0 }) disables shared fetch cache reuse across runtimes', async () => {
    // Host must register queryCache() before the child can use queryCacheShared().
    // Two live apps keep the shared fetch cache retained so Rest uses getWithSharedCache
    // (not the peek-null fallback to plain get()).
    const hostApp = buildHostAppWithQueryCache(0);
    const childApp = buildChildAppWithQueryCacheShared();
    const fetchFn = vi
      .fn<(path: string, options?: { signal?: AbortSignal }) => Promise<string>>()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');
    const descriptor = makeRestQueryDescriptor('/shared-zero-stale-time', fetchFn);

    const firstRender = renderHook(
      () => useApiQuery<string>(descriptor),
      { wrapper: ({ children }) => <FrontXProvider app={hostApp}>{children}</FrontXProvider> }
    );
    await waitFor(() => expect(firstRender.result.current.data).toBe('first'));
    firstRender.unmount();

    // Same shared QueryClient: clear TanStack so the second root must run queryFn again,
    // while still exercising L1 shared-fetch (plugin default staleTime is 0 → no L1 reuse).
    getAttachedQueryClient(hostApp).removeQueries({ queryKey: descriptor.key as unknown[] });

    const secondRender = renderHook(
      () => useApiQuery<string>(descriptor),
      { wrapper: ({ children }) => <FrontXProvider app={childApp}>{children}</FrontXProvider> }
    );
    await waitFor(() => expect(secondRender.result.current.data).toBe('second'));

    expect(fetchFn).toHaveBeenCalledTimes(2);
    secondRender.unmount();
  });

  it('per-hook staleTime: 0 disables shared fetch cache reuse across runtimes', async () => {
    const hostApp = buildHostAppWithQueryCache(60_000);
    const childApp = buildChildAppWithQueryCacheShared();
    const fetchFn = vi
      .fn<(path: string, options?: { signal?: AbortSignal }) => Promise<string>>()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');
    const descriptor = makeRestQueryDescriptor('/shared-override-zero-stale-time', fetchFn, {
      staleTime: 60_000,
    });

    const firstRender = renderHook(
      () => useApiQuery<string>(descriptor, { staleTime: 0 }),
      { wrapper: ({ children }) => <FrontXProvider app={hostApp}>{children}</FrontXProvider> }
    );
    await waitFor(() => expect(firstRender.result.current.data).toBe('first'));
    firstRender.unmount();

    getAttachedQueryClient(hostApp).removeQueries({ queryKey: descriptor.key as unknown[] });

    const secondRender = renderHook(
      () => useApiQuery<string>(descriptor, { staleTime: 0 }),
      { wrapper: ({ children }) => <FrontXProvider app={childApp}>{children}</FrontXProvider> }
    );
    await waitFor(() => expect(secondRender.result.current.data).toBe('second'));

    expect(fetchFn).toHaveBeenCalledTimes(2);
    secondRender.unmount();
  });
});
