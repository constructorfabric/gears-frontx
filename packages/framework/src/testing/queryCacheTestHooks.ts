// @cpt-dod:cpt-frontx-dod-framework-composition-reexports:p1

/**
 * Test-only inspection hooks for the queryCache() / queryCacheShared() plugins.
 *
 * These wrap internal `Symbol.for()` slots so tests can assert lifecycle
 * invariants (shared QueryClient identity, retainer counts, broadcast targets,
 * deferred-join resolver/activator) without duplicating opaque symbol keys at
 * the test boundary. Runtime shape remains internal — tests should read here
 * instead of calling `Symbol.for('hai3:query-cache:…')` directly.
 *
 * Exposed only through `@gears-frontx/framework/testing`. Not re-exported from
 * the main entry.
 */

import type { QueryClient } from '@tanstack/query-core';
import type { HAI3App } from '../types';

// @cpt-begin:cpt-frontx-dod-framework-composition-reexports:p1:inst-query-cache-test-hooks-symbols
const SHARED_QUERY_CLIENT_SYMBOL = Symbol.for('hai3:query-cache:shared-client');
const SHARED_QUERY_CLIENT_RETAINERS_SYMBOL = Symbol.for('hai3:query-cache:shared-client-retainers');
const QUERY_CLIENT_BROADCAST_TARGET_SYMBOL = Symbol.for('hai3:query-cache:broadcast-target');
const APP_QUERY_CLIENT_SYMBOL = Symbol.for('hai3:query-cache:app-client');
const APP_QUERY_CLIENT_RESOLVER_SYMBOL = Symbol.for('hai3:query-cache:app-client-resolver');
const APP_QUERY_CLIENT_ACTIVATOR_SYMBOL = Symbol.for('hai3:query-cache:app-client-activator');

type SharedQueryClientHost = typeof globalThis & {
  [SHARED_QUERY_CLIENT_SYMBOL]?: QueryClient;
  [SHARED_QUERY_CLIENT_RETAINERS_SYMBOL]?: number;
};

type QueryClientWithMetadata = QueryClient & {
  [QUERY_CLIENT_BROADCAST_TARGET_SYMBOL]?: string;
};

type QueryClientApp = HAI3App & {
  [APP_QUERY_CLIENT_SYMBOL]?: QueryClient;
  [APP_QUERY_CLIENT_RESOLVER_SYMBOL]?: () => QueryClient | undefined;
  [APP_QUERY_CLIENT_ACTIVATOR_SYMBOL]?: () => QueryClient | undefined;
};
// @cpt-end:cpt-frontx-dod-framework-composition-reexports:p1:inst-query-cache-test-hooks-symbols

// @cpt-begin:cpt-frontx-dod-framework-composition-reexports:p1:inst-query-cache-test-hooks-peeks
/** Returns the shared host-owned QueryClient, if one is currently retained. */
export function peekSharedQueryClient(): QueryClient | undefined {
  return (globalThis as SharedQueryClientHost)[SHARED_QUERY_CLIENT_SYMBOL];
}

/** Returns the current shared-client retainer count (0 when fully torn down). */
export function peekSharedQueryClientRetainers(): number {
  return (globalThis as SharedQueryClientHost)[SHARED_QUERY_CLIENT_RETAINERS_SYMBOL] ?? 0;
}

/** Returns the broadcast-target token stamped on a QueryClient for local fan-out. */
export function peekQueryClientBroadcastTarget(client: QueryClient): string | undefined {
  return (client as QueryClientWithMetadata)[QUERY_CLIENT_BROADCAST_TARGET_SYMBOL];
}

/** Returns the QueryClient currently attached to an app instance, if any. */
export function peekAppQueryClient(app: HAI3App): QueryClient | undefined {
  return (app as QueryClientApp)[APP_QUERY_CLIENT_SYMBOL];
}

/** Returns the deferred resolver that queryCacheShared() installs before a host joins. */
export function peekAppQueryClientResolver(
  app: HAI3App
): (() => QueryClient | undefined) | undefined {
  return (app as QueryClientApp)[APP_QUERY_CLIENT_RESOLVER_SYMBOL];
}

/**
 * Returns the activator that child apps built with queryCacheShared() use to join
 * a host runtime that booted later. Returns undefined when no deferred join is pending.
 */
export function peekAppQueryClientActivator(
  app: HAI3App
): (() => QueryClient | undefined) | undefined {
  return (app as QueryClientApp)[APP_QUERY_CLIENT_ACTIVATOR_SYMBOL];
}
// @cpt-end:cpt-frontx-dod-framework-composition-reexports:p1:inst-query-cache-test-hooks-peeks
