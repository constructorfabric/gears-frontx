/**
 * useApiInfiniteQuery - Declarative paginated data fetching hook
 *
 * Accepts an initial EndpointDescriptor plus descriptor resolvers for adjacent
 * pages. Each page remains a standard service descriptor so MFE code does not
 * need raw TanStack query keys or query functions.
 */
// @cpt-dod:cpt-frontx-dod-request-lifecycle-use-api-query:p2
// @cpt-flow:cpt-frontx-flow-request-lifecycle-use-api-query:p2

import type { EndpointDescriptor } from '@gears-frontx/framework';
import type { ApiInfiniteQueryResult } from '../types';
import type { ApiQueryOverrides } from './useApiQuery';
import { useHAI3InfiniteQuery } from '../queryClient';

export interface ApiInfiniteQueryPageContext<TPage> {
  page: TPage;
  pages: readonly TPage[];
  descriptor: EndpointDescriptor<TPage>;
  descriptors: readonly EndpointDescriptor<TPage>[];
}

export interface ApiInfiniteQueryOptions<TPage> extends ApiQueryOverrides {
  /** Descriptor for the first page in the sequence. */
  initialPage: EndpointDescriptor<TPage>;
  /**
   * Resolve the next page descriptor from the current page payload.
   * Return undefined when there is no next page.
   */
  getNextPage: (
    context: ApiInfiniteQueryPageContext<TPage>
  ) => EndpointDescriptor<TPage> | undefined;
  /**
   * Resolve the previous page descriptor from the current first page payload.
   * Return undefined when backward pagination is not available.
   */
  getPreviousPage?: (
    context: ApiInfiniteQueryPageContext<TPage>
  ) => EndpointDescriptor<TPage> | undefined;
  /** Optional TanStack maxPages passthrough for bounded page windows. */
  maxPages?: number;
}

export function useApiInfiniteQuery<TPage = unknown, TError = Error>(
  options: ApiInfiniteQueryOptions<TPage>
): ApiInfiniteQueryResult<TPage, TError> {
  return useHAI3InfiniteQuery<TPage, TError>(options);
}
