/**
 * Shared fetch router for `mfe-handler-mf` test suites.
 *
 * Maps URL suffixes to canned responses and records every requested URL,
 * so a suite can assert which URLs were (and were not) fetched. An
 * unmapped URL rejects, making an unexpected fetch a loud failure rather
 * than a silent 200.
 */

export interface FetchRoute {
  body: string;
  /** When true the route resolves `ok: false` (a 404-shaped response). */
  notFound?: boolean;
  /** When set the route rejects with this error instead of resolving. */
  error?: Error;
  /**
   * When set, the body is served only after this many milliseconds —
   * used to exceed a configured fetch or pack-fallback budget.
   */
  delayMs?: number;
}

export interface FetchRouter {
  (input: string | URL | Request): Promise<Response>;
  /** Every URL the router was asked for, in request order. */
  readonly calls: string[];
}

/** A Response-shaped object good enough for the loader's `.ok`/`.text()` use. */
export function jsResponse(body: string, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
    headers: { get: () => 'application/javascript' },
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

/**
 * Build a fetch implementation routing on URL SUFFIX match: the first
 * route key the requested URL ends with wins, so absolute and relative
 * spellings of one URL share a route.
 */
export function createFetchRouter(
  routes: Record<string, FetchRoute>,
): FetchRouter {
  const calls: string[] = [];
  const router = (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    if (key === undefined) {
      return Promise.reject(new TypeError(`unmocked fetch: ${url}`));
    }
    const route = routes[key];
    if (route.error !== undefined) {
      return Promise.reject(route.error);
    }
    const respond = (): Promise<Response> =>
      Promise.resolve(jsResponse(route.body, route.notFound !== true));
    if (route.delayMs !== undefined) {
      return new Promise((resolve) => {
        setTimeout(() => {
          void respond().then(resolve);
        }, route.delayMs);
      });
    }
    return respond();
  };
  router.calls = calls;
  return router as FetchRouter;
}
