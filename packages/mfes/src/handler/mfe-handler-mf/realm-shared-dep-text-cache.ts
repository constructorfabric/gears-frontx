/**
 * Realm-shared shared-dependency source-text cache rendezvous.
 *
 * `MfeHandlerMF`'s `sharedDepTextCache` field is obtained through
 * {@link getRealmSharedDepTextCache} rather than constructed per-handler-
 * instance, so two independently loaded copies of this package — e.g. a
 * host application and a nested extension host that constructs its own
 * `MfeHandlerMF`, per `cpt-frontx-adr-mfe-load-isolation` — converge on one
 * cache for the same shared-dependency source text instead of each
 * fetching and caching it separately, matching what their deduplication
 * keys (`cpt-frontx-adr-shared-dep-dedup-key`) already agree: the two loads
 * reuse the same emitted build.
 *
 * This module is the rendezvous that lets every COMPATIBLE, independently
 * loaded copy of this package converge on one bounded cache for that source
 * text, following the exact same `globalThis`-anchored, version-namespaced
 * pattern `inbound-bridge-link.ts` already uses for the mount-context
 * rendezvous — `Symbol.for(...)`, not a module-scoped variable, so every
 * copy resolves to the identical backing slot regardless of which copy's
 * module instance is executing.
 *
 * Realizes `cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous`,
 * the DoD `cpt-frontx-dod-mfe-isolation-realm-shared-dep-text-cache`, the
 * DESIGN constraint `cpt-frontx-constraint-mfes-realm-shared-dep-cache`
 * (MFES-7), and the decision recorded in
 * `cpt-frontx-adr-shared-dep-cache-reach` (ADR-0035).
 *
 * NOT exported from the package's public barrel (`src/index.ts`) — reachable
 * only from other files inside this package, same discipline as
 * `inbound-bridge-link.ts`. Convergence adds no exported symbol, no
 * capability method, and no constructor argument: a copy reaches the cache
 * only by calling {@link getRealmSharedDepTextCache}.
 *
 * @packageDocumentation
 * @internal
 */

import { LruCache } from './lru-cache';

/**
 * The protocol version this evaluated copy of the package speaks. Carried
 * on the rendezvous entry itself (`RealmSharedDepTextCacheEntry.v`) so a
 * copy that does not recognize it can tell apart from one that does,
 * WITHOUT guessing at the found value's shape. An incompatible future
 * protocol change (e.g. a different key scheme or entry shape) MUST bump
 * this and use a new symbol suffix (`:2`) rather than reinterpreting this
 * slot — see `cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous`,
 * step `inst-rsdc-else-version-unknown`.
 */
const SHARED_DEP_TEXT_CACHE_PROTOCOL_VERSION = 1 as const;

/**
 * `Symbol.for(...)` — not a module-scoped variable — so every independently
 * loaded, protocol-compatible copy of this package resolves to the exact
 * same global symbol registry key, and therefore the exact same backing
 * slot on `globalThis`, regardless of which copy's module instance is
 * executing. Mirrors `inbound-bridge-link.ts`'s `RENDEZVOUS_KEY` and the
 * existing `globalThis.__FRONTX_LAZY__` pattern, for the identical reason.
 * The trailing `:1` is the protocol version baked into the symbol
 * description itself, distinct from (but kept in lockstep with)
 * {@link SHARED_DEP_TEXT_CACHE_PROTOCOL_VERSION}.
 */
const SHARED_DEP_TEXT_CACHE_KEY = Symbol.for(
  '@gears-frontx/mfes:shared-dep-text-cache:1'
);

/**
 * Realm-wide bound, not per-handler and not per-copy: neither the number of
 * compatible copies coexisting in a realm, nor the number of handlers each
 * constructs, multiplies this cache's footprint. Bounds resident
 * MAPPINGS, not retained bytes — a single source response is not
 * size-limited here, and no byte ceiling is claimed on this cache's behalf.
 * 128 is a fixed policy constant, sized to the same per-scope capacity
 * `MfeHandlerMF.ts` documents its own scope-local bound at, and applied
 * once per realm rather than once per handler; it is not a demonstrated
 * optimum for every production composition, and sustained eviction churn
 * is the trigger for revisiting it
 * (`cpt-frontx-dod-mfe-isolation-realm-shared-dep-text-cache`).
 */
const SHARED_DEP_TEXT_CACHE_CAPACITY = 128;

/**
 * Internal STRUCTURAL interface a realm-shared cache must expose — `get`,
 * `set`, and `delete`, the only operations the loading path needs of it.
 * Deliberately not `LruCache` by class identity: `instanceof` cannot be
 * relied upon across independently evaluated copies of this package, each
 * of which defines its OWN `LruCache` class object with its own identity,
 * even though every copy's class is structurally identical.
 */
export interface SharedDepTextCache {
  get(key: string): Promise<string> | undefined;
  set(key: string, value: Promise<string>): void;
  delete(key: string): boolean;
}

/**
 * One versioned rendezvous entry. `v` is checked with `===` against
 * {@link SHARED_DEP_TEXT_CACHE_PROTOCOL_VERSION} — never merely asserted to
 * be present — so a copy speaking a different, incompatible protocol
 * version is recognized as such rather than silently misinterpreted.
 */
interface RealmSharedDepTextCacheEntry {
  readonly v: 1;
  readonly cache: SharedDepTextCache;
}

interface RealmSharedDepTextCacheGlobal {
  [SHARED_DEP_TEXT_CACHE_KEY]?: unknown;
}

/**
 * This evaluated copy's OWN fallback cache, used when the realm rendezvous
 * slot cannot be understood (`inst-rsdc-fallback-local`). Module-scoped —
 * not `Symbol.for(...)`-anchored on `globalThis` — is exactly what makes it
 * copy-local rather than realm-shared: every independently loaded copy of
 * this package gets its own module instance of this file, and therefore
 * its own private `fallbackCache` binding, while every call to
 * {@link getRealmSharedDepTextCache} FROM THIS SAME COPY sees the same
 * binding.
 *
 * Lazily created (not initialized at module-evaluation time) and memoized
 * here, rather than constructed fresh inside {@link getRealmSharedDepTextCache}
 * on every fallback call: a fresh `new LruCache(...)` per call would give
 * every handler THIS COPY constructs its own separate fallback cache,
 * defeating the intra-copy sharing `inst-rsdc-fallback-local` requires —
 * "reuse degrades to copy scope", not "reuse degrades to nothing". Two
 * DIFFERENT, incompatible copies still get two different fallback caches,
 * because each has its own module instance of this file and therefore its
 * own `fallbackCache` variable — the intended separation.
 */
let fallbackCache: SharedDepTextCache | undefined;

function getFallbackCache(): SharedDepTextCache {
  if (fallbackCache === undefined) {
    fallbackCache = new LruCache<string, Promise<string>>(SHARED_DEP_TEXT_CACHE_CAPACITY);
  }
  return fallbackCache;
}

/** Type-guard, not a cast: narrows `unknown` without trusting the caller. */
function isStructurallyConformingCache(candidate: unknown): candidate is SharedDepTextCache {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof (candidate as Record<string, unknown>).get === 'function' &&
    typeof (candidate as Record<string, unknown>).set === 'function' &&
    typeof (candidate as Record<string, unknown>).delete === 'function'
  );
}

/**
 * Recognizes a same-protocol entry by its `v` field and by the operations
 * the loading path needs of `cache` — never by class identity, which
 * cannot be relied upon across independently evaluated copies (see the
 * doc comment on {@link SharedDepTextCache}).
 */
function isRecognizedEntry(candidate: unknown): candidate is RealmSharedDepTextCacheEntry {
  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }
  const maybeEntry = candidate as { v?: unknown; cache?: unknown };
  return (
    maybeEntry.v === SHARED_DEP_TEXT_CACHE_PROTOCOL_VERSION &&
    isStructurallyConformingCache(maybeEntry.cache)
  );
}

/**
 * Returns the bounded shared-dependency source-text cache this copy's loads
 * consult: the one cache every compatible, independently loaded copy in the
 * realm converges on, or a cache local to this copy when the realm's entry
 * cannot be understood.
 *
 * Realizes `cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous`.
 * Called once per `MfeHandlerMF` construction (`private readonly
 * sharedDepTextCache = getRealmSharedDepTextCache();`) — the field is
 * instance-held, but the cache it names is realm-shared
 * (`inst-rsdc-hold-reference`).
 */
// @cpt-begin:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-read-slot
export function getRealmSharedDepTextCache(): SharedDepTextCache {
  const host = globalThis as unknown as RealmSharedDepTextCacheGlobal;
  const existing = host[SHARED_DEP_TEXT_CACHE_KEY];
  // @cpt-end:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-read-slot

  // @cpt-begin:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-if-empty
  if (existing === undefined) {
    // Create-and-publish is entirely synchronous — no `await` separates the
    // two statements below — which is what keeps two copies initializing
    // in the same realm from each minting their own cache: whichever
    // copy's call runs first (JS is single-threaded) completes this whole
    // branch, publishing the entry, before any other copy's call can even
    // begin.
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-publish
    const cache = new LruCache<string, Promise<string>>(SHARED_DEP_TEXT_CACHE_CAPACITY);
    const entry: RealmSharedDepTextCacheEntry = {
      v: SHARED_DEP_TEXT_CACHE_PROTOCOL_VERSION,
      cache,
    };
    host[SHARED_DEP_TEXT_CACHE_KEY] = entry;
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-return-cache
    return cache;
    // @cpt-end:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-return-cache
    // @cpt-end:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-publish
  }
  // @cpt-end:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-if-empty

  // @cpt-begin:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-if-version-known
  if (isRecognizedEntry(existing)) {
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-adopt
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-trusted-coordination
    // Adopted whichever same-realm code published it: no cross-copy
    // authentication is attempted here, because independently loaded
    // copies share no prior secret, no unforgeable common object
    // identity, and no class identity. The version and structural checks
    // above guard against ACCIDENTAL incompatibility only — they are not,
    // and must not be presented as, publisher authentication
    // (`cpt-frontx-adr-shared-dep-cache-reach` records this as
    // an accepted consequence).
    // @cpt-begin:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-return-cache
    return existing.cache;
    // @cpt-end:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-return-cache
    // @cpt-end:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-trusted-coordination
    // @cpt-end:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-adopt
  }
  // @cpt-end:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-if-version-known

  // @cpt-begin:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-else-version-unknown
  // The entry is malformed, or carries a protocol version this copy does
  // not recognize. Left entirely untouched below — not read further, not
  // mutated, not replaced, not deleted — because a copy that cannot
  // establish the entry's semantics must not act on them. An incompatible
  // future protocol occupies a rendezvous slot of its own (a new
  // `Symbol.for(...)` suffix) rather than contending for this one.
  console.debug(
    '[MfeHandlerMF] Realm shared-dependency source-text cache rendezvous slot ' +
      `(${String(SHARED_DEP_TEXT_CACHE_KEY)}) carries an entry this copy does not ` +
      'recognize as protocol version ' +
      `${SHARED_DEP_TEXT_CACHE_PROTOCOL_VERSION}. Leaving that entry untouched and ` +
      'falling back to a cache local to this copy — reuse degrades to copy scope ' +
      'rather than failing the load.'
  );
  // @cpt-begin:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-leave-unknown
  // (nothing written to `host[SHARED_DEP_TEXT_CACHE_KEY]` here — see comment above)
  // @cpt-end:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-leave-unknown
  // @cpt-begin:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-fallback-local
  // One shared fallback per evaluated copy (`getFallbackCache`'s
  // module-scoped memoization), not a fresh cache per call — every handler
  // THIS copy constructs, across every fallback call, shares the same
  // bounded local cache.
  // @cpt-begin:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-return-cache
  return getFallbackCache();
  // @cpt-end:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-return-cache
  // @cpt-end:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-fallback-local
  // @cpt-end:cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous:p1:inst-rsdc-else-version-unknown
}
// `inst-rsdc-hold-reference` is realized by `MfeHandlerMF`'s own
// `sharedDepTextCache` field (see its @cpt-begin/@cpt-end block in
// `MfeHandlerMF.ts`), which holds the cache this function returns
// per-instance rather than static to the evaluated copy.
