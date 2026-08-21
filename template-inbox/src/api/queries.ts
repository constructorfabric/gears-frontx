/**
 * Reading and writing through the API service from a component.
 *
 * `@gears-frontx/api` hands out endpoint *descriptors* - a stable cache key
 * plus a `fetch` - and leaves the caching to whoever consumes them. A server-
 * state library is one answer; for an app whose whole dataset is five reads
 * that never invalidate, it would be a dependency carrying a cache invalidation
 * model nothing here has an opinion about. So the two hooks below are the whole
 * answer instead, and a project that grows past them replaces this file with
 * its library of choice: the screens only ever see these two signatures.
 *
 * The promise cache is what makes that honest. Both screens read the same five
 * endpoints, React's StrictMode mounts every effect twice in development, and a
 * jump between screens remounts the tree - none of which should re-request
 * anything. Keying by the descriptor's own key means the dedupe survives all
 * three without a component knowing about it.
 */

import { useEffect, useState } from 'react';
import type { EndpointDescriptor, MutationDescriptor } from '@gears-frontx/api';

export type QueryResult<TData> = {
  data: TData | undefined;
  error: Error | null;
  isLoading: boolean;
};

const asError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

const inFlight = new Map<string, Promise<unknown>>();

/**
 * The request for a descriptor, started at most once per key for the lifetime
 * of the page. A rejected request is evicted so a later mount can retry rather
 * than replaying the same failure forever.
 */
const requestFor = <TData>(descriptor: EndpointDescriptor<TData>): Promise<TData> => {
  const cacheKey = JSON.stringify(descriptor.key);
  const existing = inFlight.get(cacheKey);
  if (existing !== undefined) return existing as Promise<TData>;

  const request = descriptor.fetch().catch((cause: unknown) => {
    inFlight.delete(cacheKey);
    throw asError(cause);
  });
  inFlight.set(cacheKey, request);
  return request;
};

export function useApiQuery<TData>(descriptor: EndpointDescriptor<TData>): QueryResult<TData> {
  const [result, setResult] = useState<QueryResult<TData>>({
    data: undefined,
    error: null,
    isLoading: true,
  });

  const cacheKey = JSON.stringify(descriptor.key);

  useEffect(() => {
    let current = true;
    requestFor(descriptor)
      .then((data) => {
        if (current) setResult({ data, error: null, isLoading: false });
      })
      .catch((error: unknown) => {
        if (current) setResult({ data: undefined, error: asError(error), isLoading: false });
      });
    return () => {
      current = false;
    };
    // The descriptor is rebuilt on every render of the service getter, so the
    // key it carries - not its identity - is what says "this is a different
    // request".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return result;
}

export type MutationResult<TVariables> = {
  mutate: (variables: TVariables) => void;
  isPending: boolean;
  error: Error | null;
};

/**
 * Fire-and-report writes. Nothing here refetches: the mock service holds the
 * posted message and the caller folds the response into its own state, which is
 * what a screen wants from a write it initiated.
 */
export function useApiMutation<TData, TVariables>({
  endpoint,
  onSuccess,
}: {
  endpoint: MutationDescriptor<TData, TVariables>;
  onSuccess?: (data: TData) => void;
}): MutationResult<TVariables> {
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = (variables: TVariables): void => {
    setPending(true);
    setError(null);
    endpoint
      .fetch(variables)
      .then((data) => {
        setPending(false);
        onSuccess?.(data);
      })
      .catch((cause: unknown) => {
        setPending(false);
        setError(asError(cause));
      });
  };

  return { mutate, isPending, error };
}
