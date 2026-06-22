/**
 * useApiQuery - Declarative data fetching hook
 *
 * Accepts an EndpointDescriptor from @gears-frontx/api and returns a Gears FrontX-owned
 * ApiQueryResult. AbortSignal for request cancellation is threaded automatically
 * through the shared QueryClient integration.
 *
 * Cache config cascade: component overrides > descriptor defaults > plugin defaults.
 * Omit overrides to rely on the descriptor's staleTime/gcTime, which in turn
 * fall back to the plugin-level query-cache defaults.
 */
// @cpt-dod:cpt-frontx-dod-request-lifecycle-use-api-query:p2
// @cpt-flow:cpt-frontx-flow-request-lifecycle-use-api-query:p2
// @cpt-state:cpt-frontx-state-request-lifecycle-query:p2
// @cpt-FEATURE:implement-endpoint-descriptors:p3

import type { EndpointDescriptor } from '@gears-frontx/framework';
import type { ApiQueryResult } from '../types';
import { useFrontXQuery } from '../queryClient';

/** Per-call cache overrides. Cascade: these > descriptor > plugin defaults. */
export interface ApiQueryOverrides {
  /** Override staleTime for this specific call site. */
  staleTime?: number;
  /** Override gcTime for this specific call site. */
  gcTime?: number;
}

// @cpt-begin:cpt-frontx-flow-request-lifecycle-use-api-query:p2:inst-delegate-use-query
export function useApiQuery<TData = unknown, TError = Error>(
  descriptor: EndpointDescriptor<TData>,
  overrides?: ApiQueryOverrides
): ApiQueryResult<TData, TError> {
  return useFrontXQuery(descriptor, overrides);
}
// @cpt-end:cpt-frontx-flow-request-lifecycle-use-api-query:p2:inst-delegate-use-query
