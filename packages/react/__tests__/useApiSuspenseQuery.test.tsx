/**
 * Integration tests for useApiSuspenseQuery — suspense-driven read hook.
 *
 * Covers:
 *   - useApiSuspenseQuery: supports suspense-driven descriptor reads
 *   - custom error generic passthrough
 *
 * @packageDocumentation
 */

// @cpt-FEATURE:implement-endpoint-descriptors:p3

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { describe, it, expect, expectTypeOf, afterEach, vi } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { eventBus, resetSharedFetchCache, resetSharedQueryClient } from '@gears-frontx/framework';
import { FrontXProvider } from '@gears-frontx/react';
import { useApiSuspenseQuery } from '../src/hooks/useApiSuspenseQuery';
import {
  ownedApps,
  buildAppWithQueryClient,
  buildTestQueryClient,
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
      return <div data-testid="suspense-query-error">{this.state.error.message}</div>;
    }

    return this.props.children;
  }
}

// ============================================================================
// useApiSuspenseQuery
// ============================================================================

describe('useApiSuspenseQuery', () => {
  it('resolves descriptor data through suspense', async () => {
    const client = buildTestQueryClient();
    const wrapper = makeSuspenseQueryWrapper(client);

    const descriptor = makeQueryDescriptor(
      ['suspense-item', 1],
      () => Promise.resolve({ id: 1, name: 'alpha' })
    );

    const { result } = renderHook(
      () => useApiSuspenseQuery<{ id: number; name: string }>(descriptor),
      { wrapper }
    );

    await waitFor(() =>
      expect(result.current.data).toEqual({ id: 1, name: 'alpha' })
    );
    expect(result.current.isFetching).toBe(false);
  });

  it('accepts a custom error generic without changing the suspense result contract', async () => {
    const client = buildTestQueryClient();
    const wrapper = makeSuspenseQueryWrapper(client);

    type DomainError = Error & { code: 'DOMAIN_FAILURE' };

    const descriptor = makeQueryDescriptor(
      ['suspense-item', 'typed-error'],
      () => Promise.resolve({ id: 2, name: 'beta' })
    );

    const { result } = renderHook(
      () => useApiSuspenseQuery<{ id: number; name: string }, DomainError>(descriptor),
      { wrapper }
    );

    await waitFor(() =>
      expect(result.current.data).toEqual({ id: 2, name: 'beta' })
    );
    expectTypeOf(result.current.data).toEqualTypeOf<{ id: number; name: string }>();
    expectTypeOf(result.current.error).toEqualTypeOf<DomainError | null>();
    expect(result.current.error).toBeNull();
  });

  it('surfaces descriptor rejections through an error boundary', async () => {
    const client = buildTestQueryClient();
    const app = buildAppWithQueryClient(client);
    const boom = new Error('suspense failure');
    const onError = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const descriptor = makeQueryDescriptor<never>(
      ['suspense-item', 'error'],
      () => Promise.reject(boom)
    );

    function Probe() {
      useApiSuspenseQuery(descriptor);
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
        expect(screen.getByTestId('suspense-query-error').textContent).toBe('suspense failure')
      );
      expect(onError).toHaveBeenCalledWith(boom);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
