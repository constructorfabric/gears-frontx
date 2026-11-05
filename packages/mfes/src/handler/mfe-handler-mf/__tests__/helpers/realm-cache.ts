/**
 * Realm shared-dependency source-text cache test hooks.
 *
 * The realm cache lives on a `Symbol.for` rendezvous slot whose protocol
 * version is baked into the symbol description. Suites reset it per test
 * so verified text never leaks between tests under an identical key.
 */

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
  delete (globalThis as Record<symbol, unknown>)[
    SHARED_DEP_TEXT_CACHE_SYMBOL
  ];
}
