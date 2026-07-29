/**
 * Integration tests for useApiInfiniteQuery and useApiSuspenseInfiniteQuery.
 *
 * Covers:
 *   - useApiInfiniteQuery: accepts descriptor-driven page resolvers, returns paginated pages
 *   - useApiSuspenseInfiniteQuery: supports suspense-driven paginated reads
 *
 * @packageDocumentation
 */

// @cpt-FEATURE:implement-endpoint-descriptors:p3

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { describe, it, expect, expectTypeOf, vi, afterEach } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { eventBus, resetSharedFetchCache, resetSharedQueryClient } from '@gears-frontx/framework';
import { FrontXProvider } from '@gears-frontx/react';
import { useApiInfiniteQuery } from '../src/hooks/useApiInfiniteQuery';
import { useApiSuspenseInfiniteQuery } from '../src/hooks/useApiSuspenseInfiniteQuery';
import {
  ownedApps,
  buildAppWithQueryClient,
  buildTestQueryClient,
  makeQueryWrapper,
  makeSuspenseQueryWrapper,
  makeQueryDescriptor,
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

class TestErrorBoundary extends Component<
  { children: ReactNode; onError?: (error: Error) => void },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.error) {
      return <div data-testid="suspense-infinite-query-error">{this.state.error.message}</div>;
    }

    return this.props.children;
  }
}

// ============================================================================
// useApiInfiniteQuery
// ============================================================================

describe('useApiInfiniteQuery', () => {
  it('loads successive pages through descriptor resolvers', async () => {
    const client = buildTestQueryClient();
    const wrapper = makeQueryWrapper(client);

    type Page = {
      items: number[];
      nextPage: number | null;
    };

    const fetchPage = vi.fn(async (pageNumber: number): Promise<Page> => ({
      items: [pageNumber],
      nextPage: pageNumber < 2 ? pageNumber + 1 : null,
    }));

    const pageOne = makeQueryDescriptor<Page>(
      ['feed', { page: 1 }],
      () => fetchPage(1)
    );
    const pageTwo = makeQueryDescriptor<Page>(
      ['feed', { page: 2 }],
      () => fetchPage(2)
    );

    const { result } = renderHook(
      () =>
        useApiInfiniteQuery<Page>({
          initialPage: pageOne,
          getNextPage: ({ page }) => (page.nextPage === 2 ? pageTwo : undefined),
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.data).toEqual([{ items: [1], nextPage: 2 }]));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() =>
      expect(result.current.data).toEqual([
        { items: [1], nextPage: 2 },
        { items: [2], nextPage: null },
      ])
    );
    expect(result.current.hasNextPage).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('stores the paginated sequence under the initial descriptor key', async () => {
    const client = buildTestQueryClient();
    const wrapper = makeQueryWrapper(client);

    type Page = {
      items: string[];
      nextCursor: string | null;
    };

    const firstPage = makeQueryDescriptor<Page>(
      ['messages', { cursor: null }],
      () => Promise.resolve({ items: ['a'], nextCursor: 'cursor-2' })
    );
    const secondPage = makeQueryDescriptor<Page>(
      ['messages', { cursor: 'cursor-2' }],
      () => Promise.resolve({ items: ['b'], nextCursor: null })
    );

    const { result } = renderHook(
      () =>
        useApiInfiniteQuery<Page>({
          initialPage: firstPage,
          getNextPage: ({ page }) =>
            page.nextCursor ? secondPage : undefined,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.data).toEqual([{ items: ['a'], nextCursor: 'cursor-2' }]));

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() =>
      expect(result.current.data).toEqual([
        { items: ['a'], nextCursor: 'cursor-2' },
        { items: ['b'], nextCursor: null },
      ])
    );

    expect(client.getQueryState(firstPage.key)).toBeDefined();
    expect(client.getQueryState(secondPage.key)).toBeUndefined();
  });

  it('reports an error when the initial page descriptor rejects', async () => {
    const client = buildTestQueryClient();
    const wrapper = makeQueryWrapper(client);
    const boom = new Error('initial page failed');

    const { result } = renderHook(
      () =>
        useApiInfiniteQuery<never, Error>({
          initialPage: makeQueryDescriptor(['feed', 'error', { page: 1 }], () => Promise.reject(boom)),
          getNextPage: () => undefined,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(boom);
    expect(result.current.data).toBeUndefined();
  });

  it('preserves prior pages and exposes an error when fetching the next page fails', async () => {
    const client = buildTestQueryClient();
    const wrapper = makeQueryWrapper(client);
    const boom = new Error('next page failed');

    type Page = {
      items: string[];
      nextCursor: string | null;
    };

    const firstPage = makeQueryDescriptor<Page>(
      ['feed', 'next-page-error', { cursor: null }],
      () => Promise.resolve({ items: ['a'], nextCursor: 'cursor-2' })
    );
    const secondPage = makeQueryDescriptor<Page>(
      ['feed', 'next-page-error', { cursor: 'cursor-2' }],
      () => Promise.reject(boom)
    );

    const { result } = renderHook(
      () =>
        useApiInfiniteQuery<Page, Error>({
          initialPage: firstPage,
          getNextPage: ({ page }) => (page.nextCursor ? secondPage : undefined),
        }),
      { wrapper }
    );

    await waitFor(() =>
      expect(result.current.data).toEqual([{ items: ['a'], nextCursor: 'cursor-2' }])
    );

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.error).toBe(boom));
    expect(result.current.data).toEqual([{ items: ['a'], nextCursor: 'cursor-2' }]);
  });
});

// ============================================================================
// useApiSuspenseInfiniteQuery
// ============================================================================

describe('useApiSuspenseInfiniteQuery', () => {
  it('resolves the first page through suspense and keeps pagination helpers', async () => {
    const client = buildTestQueryClient();
    const wrapper = makeSuspenseQueryWrapper(client);

    type Page = {
      items: string[];
      nextCursor: string | null;
    };

    const firstPage = makeQueryDescriptor<Page>(
      ['suspense-messages', { cursor: null }],
      () => Promise.resolve({ items: ['a'], nextCursor: 'cursor-2' })
    );
    const secondPage = makeQueryDescriptor<Page>(
      ['suspense-messages', { cursor: 'cursor-2' }],
      () => Promise.resolve({ items: ['b'], nextCursor: null })
    );

    const { result } = renderHook(
      () =>
        useApiSuspenseInfiniteQuery<Page>({
          initialPage: firstPage,
          getNextPage: ({ page }) =>
            page.nextCursor ? secondPage : undefined,
        }),
      { wrapper }
    );

    await waitFor(() =>
      expect(result.current.data).toEqual([{ items: ['a'], nextCursor: 'cursor-2' }])
    );
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() =>
      expect(result.current.data).toEqual([
        { items: ['a'], nextCursor: 'cursor-2' },
        { items: ['b'], nextCursor: null },
      ])
    );
    expect(result.current.hasNextPage).toBe(false);
  });

  it('accepts a custom error generic for suspense infinite queries', async () => {
    const client = buildTestQueryClient();
    const wrapper = makeSuspenseQueryWrapper(client);

    type DomainError = Error & { code: 'DOMAIN_FAILURE' };
    type Page = {
      items: string[];
      nextCursor: string | null;
    };

    const firstPage = makeQueryDescriptor<Page>(
      ['suspense-messages', 'typed-error', { cursor: null }],
      () => Promise.resolve({ items: ['typed'], nextCursor: null })
    );

    const { result } = renderHook(
      () =>
        useApiSuspenseInfiniteQuery<Page, DomainError>({
          initialPage: firstPage,
          getNextPage: () => undefined,
        }),
      { wrapper }
    );

    await waitFor(() =>
      expect(result.current.data).toEqual([{ items: ['typed'], nextCursor: null }])
    );
    expectTypeOf(result.current.data).toEqualTypeOf<readonly Page[]>();
    expectTypeOf(result.current.error).toEqualTypeOf<DomainError | null>();
    expect(result.current.error).toBeNull();
  });

  it('surfaces an initial-page rejection through an error boundary', async () => {
    const client = buildTestQueryClient();
    const app = buildAppWithQueryClient(client);
    const boom = new Error('suspense infinite failure');
    const onError = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const firstPage = makeQueryDescriptor<never>(
      ['suspense-messages', 'error', { cursor: null }],
      () => Promise.reject(boom)
    );

    function Probe() {
      useApiSuspenseInfiniteQuery({
        initialPage: firstPage,
        getNextPage: () => undefined,
      });
      return <div>unreachable</div>;
    }

    try {
      render(
        <FrontXProvider app={app}>
          <TestErrorBoundary onError={onError}>
            <React.Suspense fallback={<div>loading</div>}>
              <Probe />
            </React.Suspense>
          </TestErrorBoundary>
        </FrontXProvider>
      );

      await waitFor(() =>
        expect(screen.getByTestId('suspense-infinite-query-error').textContent).toBe(
          'suspense infinite failure'
        )
      );
      expect(onError).toHaveBeenCalledWith(boom);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
