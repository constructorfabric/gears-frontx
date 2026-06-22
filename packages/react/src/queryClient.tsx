import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import {
  QueryClientContext,
  QueryClientProvider,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
  type MutationFunctionContext,
} from '@tanstack/react-query';
import {
  subscribeQueryCacheRuntimeChanged,
  type EndpointDescriptor,
  type FrontXApp,
} from '@gears-frontx/framework';
import type { ApiQueryOverrides } from './hooks/useApiQuery';
import type {
  ApiInfiniteQueryOptions,
  ApiInfiniteQueryPageContext,
} from './hooks/useApiInfiniteQuery';
import type { UseApiMutationOptions } from './hooks/useApiMutation';
import { createQueryCache, type MutationCallbackContext, type QueryCacheKey } from './hooks/QueryCache';

// @cpt-FEATURE:implement-endpoint-descriptors:p3
// @cpt-dod:cpt-frontx-dod-request-lifecycle-query-provider:p2
// @cpt-flow:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2
// @cpt-flow:cpt-frontx-flow-request-lifecycle-use-api-query:p2
// @cpt-flow:cpt-frontx-flow-request-lifecycle-use-api-mutation:p2

// @cpt-begin:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-react-query-client-symbols
const APP_QUERY_CLIENT_SYMBOL = Symbol.for('frontx:query-cache:app-client');
const APP_QUERY_CLIENT_RESOLVER_SYMBOL = Symbol.for('frontx:query-cache:app-client-resolver');
const APP_QUERY_CLIENT_ACTIVATOR_SYMBOL = Symbol.for('frontx:query-cache:app-client-activator');

type QueryClientApp = FrontXApp & {
  [APP_QUERY_CLIENT_SYMBOL]?: QueryClient;
  [APP_QUERY_CLIENT_RESOLVER_SYMBOL]?: () => QueryClient | undefined;
  [APP_QUERY_CLIENT_ACTIVATOR_SYMBOL]?: () => QueryClient | undefined;
};

const FrontXQueryClientContext = createContext<QueryClient | undefined>(undefined);
// @cpt-end:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-react-query-client-symbols

// @cpt-begin:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-resolve-app-query-client
type RuntimeAwareEndpointDescriptor<TData> = EndpointDescriptor<TData> & {
  fetch(options?: { signal?: AbortSignal; staleTime?: number }): Promise<TData>;
};

type AppResolvedQueryClient = {
  app: FrontXApp;
  queryClient: QueryClient;
};

const useCommitEffect = typeof globalThis.window === 'undefined' ? useEffect : useLayoutEffect;

export function resolveFrontXQueryClient(app: FrontXApp): QueryClient | undefined {
  const clientApp = app as QueryClientApp;
  return clientApp[APP_QUERY_CLIENT_SYMBOL] ?? clientApp[APP_QUERY_CLIENT_RESOLVER_SYMBOL]?.();
}

export function hasFrontXQueryClientActivator(app: FrontXApp): boolean {
  return typeof (app as QueryClientApp)[APP_QUERY_CLIENT_ACTIVATOR_SYMBOL] === 'function';
}

export function activateFrontXQueryClient(app: FrontXApp): QueryClient | undefined {
  const clientApp = app as QueryClientApp;
  return clientApp[APP_QUERY_CLIENT_SYMBOL] ?? clientApp[APP_QUERY_CLIENT_ACTIVATOR_SYMBOL]?.();
}
// @cpt-end:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-resolve-app-query-client

// @cpt-begin:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-imperative-cache-bootstrap
/**
 * Imperatively invalidates cache entries for `target` on the QueryClient bound to `app`.
 * Use from non-React code (e.g. MFE actions); in components prefer `useQueryCache().invalidate`.
 */
export async function invalidateQueryCacheForApp(
  app: FrontXApp,
  target: EndpointDescriptor<unknown> | QueryCacheKey
): Promise<void> {
  const queryClient = resolveFrontXQueryClient(app) ?? activateFrontXQueryClient(app);
  if (!queryClient) {
    throw new Error(
      '[invalidateQueryCacheForApp] No QueryClient on app. Ensure queryCache() or queryCacheShared() is in the plugin chain.'
    );
  }
  await createQueryCache(queryClient).invalidate(target);
}

/** Resolves the app-bound QueryClient without triggering plugin activation during render. */
export function bootstrapFrontXQueryClient(app: FrontXApp): QueryClient | undefined {
  return resolveFrontXQueryClient(app);
}
// @cpt-end:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-imperative-cache-bootstrap

// @cpt-begin:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-use-bootstrapped-query-client
export function useBootstrappedFrontXQueryClient(app: FrontXApp): QueryClient | undefined {
  const fromApp = useMemo(() => bootstrapFrontXQueryClient(app), [app]);
  const [eventResolvedClient, setEventResolvedClient] = useState<AppResolvedQueryClient | undefined>(
    undefined
  );
  const queryClient =
    fromApp ?? (eventResolvedClient?.app === app ? eventResolvedClient.queryClient : undefined);

  useCommitEffect(() => {
    if (fromApp || !hasFrontXQueryClientActivator(app)) {
      return;
    }

    const tryResolveQueryClient = () => {
      const nextQueryClient = resolveFrontXQueryClient(app) ?? activateFrontXQueryClient(app);
      if (nextQueryClient) {
        setEventResolvedClient((current) => {
          if (current?.app === app && current.queryClient === nextQueryClient) {
            return current;
          }

          return {
            app,
            queryClient: nextQueryClient,
          };
        });
      }
    };

    // Only activate after commit so abandoned renders cannot leak retainers/listeners.
    tryResolveQueryClient();

    const subscription = subscribeQueryCacheRuntimeChanged(() => {
      tryResolveQueryClient();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [app, fromApp]);

  return queryClient;
}
// @cpt-end:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-use-bootstrapped-query-client

// @cpt-begin:cpt-frontx-dod-request-lifecycle-query-provider:p2:inst-frontx-query-client-provider
export function FrontXQueryClientProvider({
  queryClient,
  children,
}: Readonly<{
  queryClient: QueryClient | undefined;
  children: React.ReactNode;
}>) {
  if (!queryClient) {
    return (
      <FrontXQueryClientContext.Provider value={undefined}>
        <QueryClientContext.Provider value={undefined}>{children}</QueryClientContext.Provider>
      </FrontXQueryClientContext.Provider>
    );
  }

  return (
    <FrontXQueryClientContext.Provider value={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </FrontXQueryClientContext.Provider>
  );
}
// @cpt-end:cpt-frontx-dod-request-lifecycle-query-provider:p2:inst-frontx-query-client-provider

// @cpt-begin:cpt-frontx-dod-request-lifecycle-query-provider:p2:inst-query-client-context-hooks
export function useOptionalFrontXQueryClient(): QueryClient | undefined {
  return useContext(FrontXQueryClientContext);
}

export function useRequiredFrontXQueryClient(): QueryClient {
  const queryClient = useOptionalFrontXQueryClient();
  if (!queryClient) {
    throw new Error(
      '[FrontXProvider] No query cache available. Add queryCache() or queryCacheShared() to your plugin composition.'
    );
  }

  return queryClient;
}
// @cpt-end:cpt-frontx-dod-request-lifecycle-query-provider:p2:inst-query-client-context-hooks

// @cpt-begin:implement-endpoint-descriptors:p3:inst-descriptor-fetch-stale-helpers
function buildPageContext<TPage>(
  page: TPage,
  pages: readonly TPage[],
  descriptor: EndpointDescriptor<TPage>,
  descriptors: readonly EndpointDescriptor<TPage>[]
): ApiInfiniteQueryPageContext<TPage> {
  return {
    page,
    pages,
    descriptor,
    descriptors,
  };
}

function normalizeFetchStaleTime(staleTime: unknown): number | undefined {
  if (staleTime === 'static') {
    return Number.POSITIVE_INFINITY;
  }

  return typeof staleTime === 'number' ? staleTime : undefined;
}

function resolveFetchStaleTime<TData>(
  queryClient: QueryClient,
  descriptor: EndpointDescriptor<TData>,
  overrideStaleTime?: number
): number | undefined {
  return normalizeFetchStaleTime(
    overrideStaleTime ??
      descriptor.staleTime ??
      queryClient.getDefaultOptions().queries?.staleTime
  );
}

function fetchDescriptor<TData>(
  descriptor: EndpointDescriptor<TData>,
  options?: { signal?: AbortSignal; staleTime?: number }
): Promise<TData> {
  return (descriptor as RuntimeAwareEndpointDescriptor<TData>).fetch(options);
}
// @cpt-end:implement-endpoint-descriptors:p3:inst-descriptor-fetch-stale-helpers

// @cpt-begin:cpt-frontx-flow-request-lifecycle-use-api-query:p2:inst-delegate-frontx-use-query
export function useFrontXQuery<TData = unknown, TError = Error>(
  descriptor: EndpointDescriptor<TData>,
  overrides?: ApiQueryOverrides
) {
  const queryClient = useRequiredFrontXQueryClient();
  const staleTime = resolveFetchStaleTime(queryClient, descriptor, overrides?.staleTime);
  const result = useQuery<TData, TError>({
    queryKey: descriptor.key as unknown[],
    queryFn: ({ signal }) => fetchDescriptor(descriptor, { signal, staleTime }),
    staleTime: overrides?.staleTime ?? descriptor.staleTime,
    gcTime: overrides?.gcTime ?? descriptor.gcTime,
  });

  return {
    data: result.data,
    error: result.error,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    isError: result.isError,
    refetch: result.refetch,
  };
}
// @cpt-end:cpt-frontx-flow-request-lifecycle-use-api-query:p2:inst-delegate-frontx-use-query

// @cpt-begin:cpt-frontx-flow-request-lifecycle-use-api-query:p2:inst-delegate-frontx-use-suspense-query
export function useFrontXSuspenseQuery<TData = unknown, TError = Error>(
  descriptor: EndpointDescriptor<TData>,
  overrides?: ApiQueryOverrides
) {
  const queryClient = useRequiredFrontXQueryClient();
  const staleTime = resolveFetchStaleTime(queryClient, descriptor, overrides?.staleTime);
  const result = useSuspenseQuery<TData, TError>({
    queryKey: descriptor.key as unknown[],
    queryFn: ({ signal }) => fetchDescriptor(descriptor, { signal, staleTime }),
    staleTime: overrides?.staleTime ?? descriptor.staleTime,
    gcTime: overrides?.gcTime ?? descriptor.gcTime,
  });

  return {
    data: result.data,
    error: result.error,
    isFetching: result.isFetching,
    refetch: async () => {
      await result.refetch();
    },
  };
}
// @cpt-end:cpt-frontx-flow-request-lifecycle-use-api-query:p2:inst-delegate-frontx-use-suspense-query

// @cpt-begin:cpt-frontx-flow-request-lifecycle-use-api-query:p2:inst-delegate-frontx-use-infinite-query
export function useFrontXInfiniteQuery<TPage = unknown, TError = Error>(
  options: ApiInfiniteQueryOptions<TPage>
) {
  const queryClient = useRequiredFrontXQueryClient();
  const result = useInfiniteQuery<
    TPage,
    TError,
    readonly TPage[],
    readonly unknown[],
    EndpointDescriptor<TPage>
  >({
    queryKey: options.initialPage.key,
    initialPageParam: options.initialPage,
    queryFn: ({ pageParam, signal }) =>
      fetchDescriptor(pageParam, {
        signal,
        staleTime: resolveFetchStaleTime(queryClient, pageParam, options.staleTime),
      }),
    getNextPageParam: (
      lastPage,
      allPages,
      lastPageDescriptor,
      allPageDescriptors
    ) =>
      options.getNextPage(
        buildPageContext(
          lastPage,
          allPages,
          lastPageDescriptor,
          allPageDescriptors
        )
      ),
    getPreviousPageParam: options.getPreviousPage
      ? (firstPage, allPages, firstPageDescriptor, allPageDescriptors) =>
          options.getPreviousPage?.(
            buildPageContext(
              firstPage,
              allPages,
              firstPageDescriptor,
              allPageDescriptors
            )
          )
      : undefined,
    select: (data) => data.pages,
    staleTime: options.staleTime ?? options.initialPage.staleTime,
    gcTime: options.gcTime ?? options.initialPage.gcTime,
    maxPages: options.maxPages,
  });

  return {
    data: result.data,
    error: result.error,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    isError: result.isError,
    hasNextPage: result.hasNextPage ?? false,
    hasPreviousPage: result.hasPreviousPage ?? false,
    isFetchingNextPage: result.isFetchingNextPage,
    isFetchingPreviousPage: result.isFetchingPreviousPage,
    fetchNextPage: async () => {
      await result.fetchNextPage();
    },
    fetchPreviousPage: async () => {
      await result.fetchPreviousPage();
    },
    refetch: async () => {
      await result.refetch();
    },
  };
}
// @cpt-end:cpt-frontx-flow-request-lifecycle-use-api-query:p2:inst-delegate-frontx-use-infinite-query

// @cpt-begin:cpt-frontx-flow-request-lifecycle-use-api-query:p2:inst-delegate-frontx-use-suspense-infinite-query
export function useFrontXSuspenseInfiniteQuery<TPage = unknown, TError = Error>(
  options: ApiInfiniteQueryOptions<TPage>
) {
  const queryClient = useRequiredFrontXQueryClient();
  const result = useSuspenseInfiniteQuery<
    TPage,
    TError,
    readonly TPage[],
    readonly unknown[],
    EndpointDescriptor<TPage>
  >({
    queryKey: options.initialPage.key,
    initialPageParam: options.initialPage,
    queryFn: ({ pageParam, signal }) =>
      fetchDescriptor(pageParam, {
        signal,
        staleTime: resolveFetchStaleTime(queryClient, pageParam, options.staleTime),
      }),
    getNextPageParam: (
      lastPage,
      allPages,
      lastPageDescriptor,
      allPageDescriptors
    ) =>
      options.getNextPage(
        buildPageContext(
          lastPage,
          allPages,
          lastPageDescriptor,
          allPageDescriptors
        )
      ),
    getPreviousPageParam: options.getPreviousPage
      ? (firstPage, allPages, firstPageDescriptor, allPageDescriptors) =>
          options.getPreviousPage?.(
            buildPageContext(
              firstPage,
              allPages,
              firstPageDescriptor,
              allPageDescriptors
            )
          )
      : undefined,
    select: (data) => data.pages,
    staleTime: options.staleTime ?? options.initialPage.staleTime,
    gcTime: options.gcTime ?? options.initialPage.gcTime,
    maxPages: options.maxPages,
  });

  return {
    data: result.data,
    error: result.error,
    isFetching: result.isFetching,
    hasNextPage: result.hasNextPage ?? false,
    hasPreviousPage: result.hasPreviousPage ?? false,
    isFetchingNextPage: result.isFetchingNextPage,
    isFetchingPreviousPage: result.isFetchingPreviousPage,
    fetchNextPage: async () => {
      await result.fetchNextPage();
    },
    fetchPreviousPage: async () => {
      await result.fetchPreviousPage();
    },
    refetch: async () => {
      await result.refetch();
    },
  };
}
// @cpt-end:cpt-frontx-flow-request-lifecycle-use-api-query:p2:inst-delegate-frontx-use-suspense-infinite-query

// @cpt-begin:cpt-frontx-flow-request-lifecycle-use-api-mutation:p2:inst-delegate-frontx-use-mutation
export function useFrontXMutation<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
>(
  options: UseApiMutationOptions<TData, TError, TVariables, TContext>,
  callbackCtx: MutationCallbackContext
) {
  useRequiredFrontXQueryClient();

  const latestRef = React.useRef({ options, callbackCtx });
  latestRef.current = { options, callbackCtx };
  const fetchAbortControllersRef = React.useRef<Set<AbortController>>(new Set());

  React.useEffect(() => {
    const fetchAbortControllers = fetchAbortControllersRef.current;
    return () => {
      if (latestRef.current.options.abortOnUnmount) {
        for (const controller of fetchAbortControllers) {
          controller.abort();
        }
        fetchAbortControllers.clear();
      }
    };
  }, []);

  const mutationFn = React.useCallback((variables: TVariables, context: MutationFunctionContext) => {
    const cancelOnSupersede = latestRef.current.options.cancelOnSupersede;
    if (cancelOnSupersede) {
      for (const controller of fetchAbortControllersRef.current) {
        controller.abort();
      }
      fetchAbortControllersRef.current.clear();
    }

    const controller = new AbortController();
    fetchAbortControllersRef.current.add(controller);

    const librarySignal = (context as MutationFunctionContext & { signal?: AbortSignal }).signal;
    if (cancelOnSupersede && librarySignal) {
      if (librarySignal.aborted) {
        controller.abort();
      } else {
        librarySignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    return latestRef.current.options.endpoint
      .fetch(variables, { signal: controller.signal })
      .finally(() => {
        fetchAbortControllersRef.current.delete(controller);
      });
  }, []);

  const onMutate = React.useCallback((variables: TVariables, _context: MutationFunctionContext) => {
    const current = latestRef.current;
    if (!current.options.onMutate) {
      return undefined as TContext;
    }

    return current.options.onMutate(variables, current.callbackCtx);
  }, []);

  const onSuccess = React.useCallback((data: TData, variables: TVariables, context: TContext | undefined) => {
    const current = latestRef.current;
    return current.options.onSuccess?.(data, variables, context, current.callbackCtx);
  }, []);

  const onError = React.useCallback((error: TError, variables: TVariables, context: TContext | undefined) => {
    const current = latestRef.current;
    return current.options.onError?.(error, variables, context, current.callbackCtx);
  }, []);

  const onSettled = React.useCallback((
    data: TData | undefined,
    error: TError | null,
    variables: TVariables,
    context: TContext | undefined
  ) => {
    const current = latestRef.current;
    return current.options.onSettled?.(
      data,
      error,
      variables,
      context,
      current.callbackCtx
    );
  }, []);

  const mutation = useMutation<TData, TError, TVariables, TContext>({
    mutationFn,
    onMutate: options.onMutate ? onMutate : undefined,
    onSuccess: options.onSuccess ? onSuccess : undefined,
    onError: options.onError ? onError : undefined,
    onSettled: options.onSettled ? onSettled : undefined,
  });

  return {
    mutate: mutation.mutate as (variables: TVariables) => void,
    mutateAsync: mutation.mutateAsync as (variables: TVariables) => Promise<TData>,
    isPending: mutation.isPending,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
}
// @cpt-end:cpt-frontx-flow-request-lifecycle-use-api-mutation:p2:inst-delegate-frontx-use-mutation
