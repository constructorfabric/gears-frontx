/**
 * Integration tests for FrontXProvider — QueryClient wiring and MFE root sharing.
 *
 * Covers:
 *   - FrontXProvider: reads the app-owned QueryClient from queryCache()/queryCacheShared()
 *   - Shared QueryClient reuse across separately mounted MFE roots
 *
 * @packageDocumentation
 */

// @cpt-FEATURE:implement-endpoint-descriptors:p3
// @cpt-FEATURE:cpt-frontx-dod-request-lifecycle-query-provider:p2

import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientContext } from '@tanstack/react-query';
import {
  createFrontX,
  createFrontXApp,
  eventBus,
  resetSharedFetchCache,
  resetSharedQueryClient,
  type MockState,
} from '@gears-frontx/framework';
import {
  FrontXProvider,
  useApiQuery,
  useFrontX,
  useQueryCache,
  type MfeContextValue,
} from '@gears-frontx/react';
import { useOptionalFrontXQueryClient } from '@gears-frontx/react/testing';
import {
  ownedApps,
  buildTestQueryClient,
  buildAppWithQueryClient,
  buildHostAppWithQueryCache,
  buildChildAppWithQueryCacheShared,
  getAttachedQueryClient,
  makeQueryDescriptor,
  makeContextValue,
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
// query cache provider inside FrontXProvider
// ============================================================================

describe('FrontXProvider provides query cache access to descendants', () => {
  it('activates a late-joining shared QueryClient during the first plain FrontXProvider render', async () => {
    const childApp = buildChildAppWithQueryCacheShared();
    const hostApp = buildHostAppWithQueryCache(60_000);
    getAttachedQueryClient(hostApp).setQueryData(['probe', 'late-join'], 'shared-query-client');

    function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
      return <FrontXProvider app={childApp}>{children}</FrontXProvider>;
    }

    const { result } = renderHook(
      () => useQueryCache().get<string>(['probe', 'late-join']),
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(result.current).toBe('shared-query-client'));
  });

  it('retries a shared QueryClient join when the host runtime appears after the child root mounts', async () => {
    const childApp = buildChildAppWithQueryCacheShared();

    function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
      return <FrontXProvider app={childApp}>{children}</FrontXProvider>;
    }

    const { result } = renderHook(
      () => useOptionalFrontXQueryClient(),
      { wrapper: Wrapper }
    );

    // Deferred subtree: inner tree is not mounted until a host client exists, so the hook
    // may not run yet and renderHook leaves `result.current` at null (not undefined).
    expect(result.current == null).toBe(true);

    let hostApp!: ReturnType<typeof buildHostAppWithQueryCache>;
    await act(async () => {
      hostApp = buildHostAppWithQueryCache(60_000);
    });
    getAttachedQueryClient(hostApp).setQueryData(['probe', 'late-host'], 'shared-query-client');

    await waitFor(() =>
      expect(result.current?.getQueryData(['probe', 'late-host'])).toBe('shared-query-client')
    );
  });

  it('shadows outer query contexts when a nested app has no resolved QueryClient', () => {
    const outerClient = buildTestQueryClient();
    const outerApp = buildAppWithQueryClient(outerClient);
    const innerApp = createFrontX().build();
    ownedApps.push(innerApp);

    function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
      return (
        <FrontXProvider app={outerApp}>
          <FrontXProvider app={innerApp}>{children}</FrontXProvider>
        </FrontXProvider>
      );
    }

    const frontxClient = renderHook(
      () => useOptionalFrontXQueryClient(),
      { wrapper: Wrapper }
    );
    expect(frontxClient.result.current).toBeUndefined();

    const tanstackClient = renderHook(
      () => React.useContext(QueryClientContext),
      { wrapper: Wrapper }
    );
    expect(tanstackClient.result.current).toBeUndefined();
  });

  it('provider-owned apps still toggle mock mode when a QueryClient is attached', async () => {
    const app = buildAppWithQueryClient(buildTestQueryClient());

    function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
      return <FrontXProvider app={app}>{children}</FrontXProvider>;
    }

    const { result } = renderHook(
      () => useFrontX().actions.toggleMockMode,
      { wrapper: Wrapper }
    );

    expect(typeof result.current).toBe('function');

    act(() => {
      result.current(true);
    });
    await waitFor(() =>
      expect((app.store.getState() as { mock: MockState }).mock.enabled).toBe(true)
    );

    act(() => {
      result.current(false);
    });
    await waitFor(() =>
      expect((app.store.getState() as { mock: MockState }).mock.enabled).toBe(false)
    );
  });

  it('useFrontX exposes the provided app instance when app prop is set', () => {
    const providedApp = createFrontXApp();
    ownedApps.push(providedApp);

    function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
      return <FrontXProvider app={providedApp}>{children}</FrontXProvider>;
    }

    const { result } = renderHook(
      () => useFrontX(),
      { wrapper: Wrapper }
    );

    expect(result.current).toBe(providedApp);
  });

  it('aligns QueryClient with the new app on the same commit when the app prop swaps', () => {
    const clientA = buildTestQueryClient();
    const clientB = buildTestQueryClient();
    clientA.setQueryData(['frontx-provider-swap-probe'], 'a');
    clientB.setQueryData(['frontx-provider-swap-probe'], 'b');
    const appA = buildAppWithQueryClient(clientA);
    const appB = buildAppWithQueryClient(clientB);

    const renderLog: Array<{ appLabel: 'A' | 'B'; cache: string | undefined }> = [];

    function SwapProbe() {
      const app = useFrontX();
      const cache = useQueryCache().get<string>(['frontx-provider-swap-probe']);
      renderLog.push({
        appLabel: app === appA ? 'A' : 'B',
        cache,
      });
      return null;
    }

    function Tree({ activeApp }: Readonly<{ activeApp: typeof appA }>) {
      return (
        <FrontXProvider app={activeApp}>
          <SwapProbe />
        </FrontXProvider>
      );
    }

    const { rerender } = render(<Tree activeApp={appA} />);
    renderLog.length = 0;
    rerender(<Tree activeApp={appB} />);

    expect(renderLog).toEqual([{ appLabel: 'B', cache: 'b' }]);
  });

  // @cpt-begin:cpt-frontx-dod-request-lifecycle-query-provider:p2:inst-test-frontx-provider
  it('useApiQuery resolves inside FrontXProvider when the app provides a QueryClient', async () => {
    // FrontXProvider reads the app-owned QueryClient and mounts the React provider.
    // If the query resolves, the provider wiring through the plugin is correct.
    const app = buildAppWithQueryClient(buildTestQueryClient());
    function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
      return <FrontXProvider app={app}>{children}</FrontXProvider>;
    }

    const descriptor = makeQueryDescriptor(
      ['answer'],
      () => Promise.resolve(42)
    );

    const { result } = renderHook(
      () => useApiQuery<number>(descriptor),
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(result.current.data).toBe(42));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });
  // @cpt-end:cpt-frontx-dod-request-lifecycle-query-provider:p2:inst-test-frontx-provider
});

// ============================================================================
// Shared QueryClient across separately mounted MFE roots
// ============================================================================

describe('FrontXProvider reuses a shared QueryClient across MFE roots', () => {
  // @cpt-begin:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-test-mfe-shared-cache
  it('two FrontXProviders using apps backed by the same QueryClient return the same cached value for the same descriptor key', async () => {
    // Separate MFE roots each render their own FrontXProvider. Shared cache only
    // happens when the same runtime is injected into both roots.
    // The first descriptor fetch populates the cache; the second MFE gets the cached result.
    //
    // gcTime must be > 0 so the cache entry survives between the two
    // independent renderHook calls (the first observer unmounts before
    // the second mounts).
    // staleTime: Infinity prevents stale-triggered refetches.
    // refetchOnMount: false / refetchOnWindowFocus: false eliminate background
    // refetches in the jsdom test environment so the assertion is deterministic.
    const sharedClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: 0,
          gcTime: 300_000,
          staleTime: Infinity,
          refetchOnMount: false,
          refetchOnWindowFocus: false,
        },
      },
    });
    const queryFnAlpha = vi.fn(() => Promise.resolve('data-from-alpha'));
    const queryFnBeta = vi.fn(() => Promise.resolve('data-from-beta'));

    // Both descriptors share the same key — cache hit expected on second render.
    const descriptorAlpha = makeQueryDescriptor(['shared-key'], queryFnAlpha);
    const descriptorBeta = makeQueryDescriptor(['shared-key'], queryFnBeta);

    const sharedApp = buildAppWithQueryClient(sharedClient);

    function makeMfeWrapper(contextValue: MfeContextValue) {
      return function MfeWrapper({ children }: { children: React.ReactNode }) {
        return (
          <FrontXProvider app={sharedApp} mfeBridge={contextValue}>
            {children}
          </FrontXProvider>
        );
      };
    }

    const mfe1Value = makeContextValue('mfe-alpha');
    const mfe2Value = makeContextValue('mfe-beta');

    // MFE alpha fetches first — populates the shared cache.
    const { result: result1 } = renderHook(
      () => useApiQuery<string>(descriptorAlpha),
      { wrapper: makeMfeWrapper(mfe1Value) }
    );

    await waitFor(() => expect(result1.current.data).toBeDefined());
    expect(result1.current.data).toBe('data-from-alpha');
    expect(queryFnAlpha).toHaveBeenCalledOnce();

    // MFE beta uses the same key — gets the cached result from alpha.
    const { result: result2 } = renderHook(
      () => useApiQuery<string>(descriptorBeta),
      { wrapper: makeMfeWrapper(mfe2Value) }
    );

    await waitFor(() => expect(result2.current.data).toBeDefined());
    // Both MFEs see the same data — cache is shared.
    expect(result2.current.data).toBe('data-from-alpha');
    // Beta's queryFn was NOT called because the cache was already populated.
    expect(queryFnBeta).not.toHaveBeenCalled();
  });
  // @cpt-end:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-test-mfe-shared-cache
});
