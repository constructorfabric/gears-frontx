/**
 * Realm shared-dependency source-text cache test hooks.
 *
 * The realm cache lives on a `Symbol.for` rendezvous slot whose protocol
 * version is baked into the symbol description. Suites reset it per test
 * so cached text never leaks between tests under an identical key.
 */

import type { RealmSharedDepTextCacheDiagnostics } from '../../ByteBudgetLruCache';
import type { SharedDepTextCache } from '../../RealmSharedDepTextCacheProvider';

/**
 * Mirrors the literal in `RealmSharedDepTextCacheProvider.ts` exactly — a
 * test double for the protocol string, deliberately NOT an import of the
 * private constant.
 */
export const SHARED_DEP_TEXT_CACHE_SYMBOL = Symbol.for(
  '@gears-frontx/mfes:shared-dep-text-cache:1',
);

/** Delete the realm rendezvous slot (test isolation). */
export function resetRealmSharedDepTextCache(): void {
  Reflect.deleteProperty(globalThis, SHARED_DEP_TEXT_CACHE_SYMBOL);
}

/**
 * The cache the realm rendezvous slot publishes, read from the slot itself:
 * the one cache every handler of every copy converges on.
 */
export function realmSharedDepTextCache(): SharedDepTextCache {
  const slot: { cache: SharedDepTextCache } = Reflect.get(
    globalThis,
    SHARED_DEP_TEXT_CACHE_SYMBOL,
  );
  return slot.cache;
}

/** The held bytes, entry count, budget and evictions the realm cache reports. */
export function realmCacheDiagnostics(): RealmSharedDepTextCacheDiagnostics {
  const diagnostics = realmSharedDepTextCache().getDiagnostics?.();
  if (diagnostics === undefined) {
    throw new Error('the realm cache reports no diagnostics');
  }
  return diagnostics;
}
