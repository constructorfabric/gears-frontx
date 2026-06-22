/**
 * useApiSuspenseQuery - Suspense declarative data fetching hook
 *
 * Mirrors useApiQuery but integrates with React Suspense so the initial load is
 * handled by a Suspense boundary.
 */
// @cpt-dod:cpt-frontx-dod-request-lifecycle-use-api-query:p2
// @cpt-flow:cpt-frontx-flow-request-lifecycle-use-api-query:p2
// @cpt-state:cpt-frontx-state-request-lifecycle-query:p2

import type { EndpointDescriptor } from '@gears-frontx/framework';
import type { ApiSuspenseQueryResult } from '../types';
import type { ApiQueryOverrides } from './useApiQuery';
import { useFrontXSuspenseQuery } from '../queryClient';

// @cpt-begin:cpt-frontx-flow-request-lifecycle-use-api-query:p2:inst-delegate-use-suspense-query
export function useApiSuspenseQuery<TData = unknown, TError = Error>(
  descriptor: EndpointDescriptor<TData>,
  overrides?: ApiQueryOverrides
): ApiSuspenseQueryResult<TData, TError> {
  return useFrontXSuspenseQuery<TData, TError>(descriptor, overrides);
}
// @cpt-end:cpt-frontx-flow-request-lifecycle-use-api-query:p2:inst-delegate-use-suspense-query
