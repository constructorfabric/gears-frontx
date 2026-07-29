/**
 * useApiMutation - Declarative mutation hook with restricted QueryCache injection
 *
 * Accepts { endpoint: MutationDescriptor, callbacks } and returns a Gears FrontX-owned
 * ApiMutationResult. Supports optimistic updates, rollback, and cache invalidation
 * through the QueryCache interface injected into each callback.
 *
 * Optimistic update pattern:
 *   onMutate  -> cancel outgoing refetches, snapshot via queryCache.get,
 *                apply optimistic data via queryCache.set, return snapshot
 *   onError   -> restore snapshot via queryCache.set(key, context.snapshot)
 *   onSettled -> invalidate to refetch authoritative state
 *
 * TanStack Query is used internally only and is NOT re-exported.
 * MFEs interact with the cache through QueryCache, not the raw QueryClient.
 */
// @cpt-dod:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2
// @cpt-flow:cpt-frontx-flow-request-lifecycle-use-api-mutation:p2
// @cpt-algo:cpt-frontx-algo-request-lifecycle-optimistic-update:p2
// @cpt-algo:cpt-frontx-algo-request-lifecycle-query-invalidation:p2
// @cpt-state:cpt-frontx-state-request-lifecycle-mutation:p2
// @cpt-FEATURE:implement-endpoint-descriptors:p3

import type { MutationDescriptor } from '@gears-frontx/framework';
import type { MutationCallbackContext } from './QueryCache';
import type { ApiMutationResult } from '../types';
import { useFrontXMutation, useRequiredFrontXQueryClient } from '../queryClient';
import { createQueryCache } from './QueryCache';
import { useMemo } from 'react';

export type { QueryCache, MutationCallbackContext } from './QueryCache';

// @cpt-begin:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-type-alias
/**
 * Options for useApiMutation.
 *
 * Each callback receives { queryCache } as an additional final parameter,
 * providing controlled access to the shared cache without exposing the
 * raw QueryClient. TContext is the return type of onMutate, passed as
 * context to onSuccess, onError, and onSettled.
 */
export type UseApiMutationOptions<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
> = {
  endpoint: MutationDescriptor<TData, TVariables>;
  cancelOnSupersede?: boolean;
  abortOnUnmount?: boolean;
  onMutate?: (variables: TVariables, ctx: MutationCallbackContext) => Promise<TContext> | TContext;
  onSuccess?: (data: TData, variables: TVariables, context: TContext | undefined, ctx: MutationCallbackContext) => unknown;
  onError?: (error: TError, variables: TVariables, context: TContext | undefined, ctx: MutationCallbackContext) => unknown;
  onSettled?: (data: TData | undefined, error: TError | null, variables: TVariables, context: TContext | undefined, ctx: MutationCallbackContext) => unknown;
};
// @cpt-end:cpt-frontx-dod-request-lifecycle-use-api-mutation:p2:inst-type-alias

// @cpt-begin:cpt-frontx-flow-request-lifecycle-use-api-mutation:p2:inst-delegate-use-mutation
export function useApiMutation<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
>(
  options: UseApiMutationOptions<TData, TError, TVariables, TContext>
): ApiMutationResult<TData, TError, TVariables> {
  const queryClient = useRequiredFrontXQueryClient();
  const queryCache = useMemo(() => createQueryCache(queryClient), [queryClient]);
  const callbackCtx: MutationCallbackContext = useMemo(() => ({ queryCache }), [queryCache]);
  return useFrontXMutation<TData, TError, TVariables, TContext>(options, callbackCtx);
}
// @cpt-end:cpt-frontx-flow-request-lifecycle-use-api-mutation:p2:inst-delegate-use-mutation
