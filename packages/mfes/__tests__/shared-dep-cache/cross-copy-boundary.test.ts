/**
 * Realm-shared shared-dependency source-text cache across TWO independently
 * loaded copies of this package.
 *
 * `MfeHandlerMF.sharedDepTextCache` is obtained from
 * `getRealmSharedDepTextCache()` (`realm-shared-dep-text-cache.ts`) rather
 * than constructed per handler instance, so a nested extension host that
 * constructs its own `MfeHandlerMF` from its own independently loaded copy
 * of `@gears-frontx/mfes` (per `cpt-frontx-adr-mfe-load-isolation`)
 * converges on the same cache as its host and fetches shared-dependency
 * source text once rather than once per copy, whenever both loads'
 * deduplication keys agree they reuse the same emitted build. This suite
 * proves that convergence by rendezvousing on a `globalThis`-anchored,
 * version-namespaced slot — the exact pattern `inbound-bridge-link.ts`'s
 * mount-context rendezvous already uses, and the exact `vi.resetModules()`
 * + dynamic `import()` technique
 * `registration-propagation/cross-copy-boundary.test.ts` uses to obtain two
 * GENUINELY SEPARATE module instances, since a shared import would
 * trivially "pass" even a module-scoped cache that is fundamentally broken
 * across copies.
 *
 * Most cases drive `fetchSharedDepSources` / `buildSharedDepBlobUrls`
 * directly via reflection (both are `private`), following this package's
 * existing pattern of reflecting into private handler methods for tests
 * that don't need a full `load()` (see `resolveLazyChunk` in
 * `MfeHandlerMF.test.ts`) — `fetchSharedDepSources` alone exercises the
 * realm-cache dedup/eviction/fallback behavior without needing to stub
 * dynamic `import()` of a `blob:` URL, which jsdom does not support.
 * `buildSharedDepBlobUrls` additionally mints real blob URLs (via the real,
 * unstubbed `URL.createObjectURL`), which is what proves distinct module
 * evaluation survives shared source text. The staggered-timeout case drives
 * the full `handler.load()` path (with a stubbed `importBlobModule`),
 * because the timeout ledger that owns identity-checked release is
 * `load()`-internal state with no other test seam.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MfManifest, MfManifestShared } from '../../src/manifest/mf-manifest';
import type { MfeEntryMF } from '../../src/types/mfe-entry-mf';

/**
 * Opt-in stub for `importBlobModule`, identical in spirit to
 * `MfeHandlerMF.test.ts`'s own `blobModuleStub`: dynamic `import()` of a
 * `blob:` URL is unsupported under jsdom/vitest's module loader, so a
 * `load()` that reaches the import step still rejects unless stubbed. Only
 * the staggered-timeout test below needs a load to actually SUCCEED (copy
 * A's retry) — every other test in this file drives `fetchSharedDepSources`
 * / `buildSharedDepBlobUrls` directly and never reaches this step.
 */
const blobModuleStub = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock('../../src/handler/mfe-handler-mf/mf-dynamic-module-ops', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/handler/mfe-handler-mf/mf-dynamic-module-ops')>();
  return {
    ...actual,
    importBlobModule: (blobUrl: string): Promise<unknown> =>
      blobModuleStub.current !== undefined
        ? Promise.resolve(blobModuleStub.current)
        : actual.importBlobModule(blobUrl),
  };
});

// ─── Realm rendezvous symbol — page-lifetime state that must not leak ─────

/**
 * Mirrors the literal in `realm-shared-dep-text-cache.ts` exactly (a test
 * double for the protocol string, not an import of production code's
 * constant, so a change to that literal without a matching test update
 * surfaces as a cross-copy-adoption failure here rather than silently
 * passing against a private constant only one side changed).
 */
const SHARED_DEP_TEXT_CACHE_SYMBOL = Symbol.for(
  '@gears-frontx/mfes:shared-dep-text-cache:1'
);

function resetRealmSharedDepTextCache(): void {
  delete (globalThis as Record<symbol, unknown>)[SHARED_DEP_TEXT_CACHE_SYMBOL];
}

// Deleted in setup AND teardown: this cache is deliberately page-lifetime
// (never cleared by handler discard or registry disposal), so nothing but
// an explicit reset stops one test's realm state from leaking into another.
beforeEach(resetRealmSharedDepTextCache);
afterEach(() => {
  resetRealmSharedDepTextCache();
  vi.restoreAllMocks();
});

// ─── Loading a genuinely separate module copy ──────────────────────────────

/**
 * Imports the handler module fresh. Calling this twice with
 * `vi.resetModules()` in between produces two copies with no shared class
 * identity — `copyA.MfeHandlerMF !== copyB.MfeHandlerMF` — while
 * `globalThis` (unaffected by `vi.resetModules()`) is the one thing both
 * copies still share, which is the entire premise the realm rendezvous
 * depends on.
 */
async function loadCopy() {
  const handlerModule = await import('../../src/handler/mfe-handler-mf/MfeHandlerMF');
  return { MfeHandlerMF: handlerModule.MfeHandlerMF };
}

type Copy = Awaited<ReturnType<typeof loadCopy>>;
type Handler = InstanceType<Copy['MfeHandlerMF']>;

// ─── Fixture builders (mirrors MfeHandlerMF.test.ts's own helpers) ────────

const MANIFEST_ID_A = 'mock.mfe.mf_manifest.v1~copy-a.manifest.v1';
const MANIFEST_ID_B = 'mock.mfe.mf_manifest.v1~copy-b.manifest.v1';
const ENTRY_BASE_ID = 'mock.mfe.entry.v1~';

function sharedDep(
  name: string,
  chunkPath: string,
  opts: { version?: string; contentHash?: string } = {}
): MfManifestShared {
  return {
    name,
    version: opts.version ?? '1.0.0',
    chunkPath,
    unwrapKey: null,
    ...(opts.contentHash !== undefined ? { contentHash: opts.contentHash } : {}),
  };
}

function buildManifest(
  id: string,
  publicPath: string,
  shared: MfManifestShared[]
): MfManifest {
  return {
    id,
    name: 'testMfe',
    metaData: {
      name: 'testMfe',
      type: 'app',
      buildInfo: { buildVersion: '1.0.0', buildName: 'testMfe' },
      remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' },
      globalName: 'testMfe',
      publicPath,
    },
    shared,
  };
}

function buildEntry(manifest: MfManifest, id: string): MfeEntryMF {
  return {
    id,
    requiredProperties: [],
    actions: [],
    domainActions: [],
    manifest,
    exposedModule: './lifecycle',
    exposeAssets: {
      js: { sync: ['assets/lifecycle.js'], async: [] },
      css: { sync: [], async: [] },
    },
  };
}

/** A `Response`-shaped object satisfying `fetchSourceText`'s checks. */
function jsResponse(body: string): Response {
  return {
    ok: true,
    headers: { get: () => 'application/javascript' },
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

/** Invoke a handler's private `fetchSharedDepSources` via reflection. */
function fetchShared(
  handler: Handler,
  manifest: MfManifest
): Promise<Map<string, string>> {
  return (
    handler as unknown as {
      fetchSharedDepSources: (m: MfManifest) => Promise<Map<string, string>>;
    }
  ).fetchSharedDepSources(manifest);
}

/** Invoke a handler's private `buildSharedDepBlobUrls` via reflection. */
function buildSharedBlobUrls(
  handler: Handler,
  manifest: MfManifest,
  entryId: string,
  extensionId: string
): Promise<Map<string, string>> {
  return (
    handler as unknown as {
      buildSharedDepBlobUrls: (
        m: MfManifest,
        e: string,
        x: string
      ) => Promise<Map<string, string>>;
    }
  ).buildSharedDepBlobUrls(manifest, entryId, extensionId);
}

/** Reads a handler's `sharedDepTextCache` field via reflection. */
function realmCacheOf(handler: Handler): {
  get(key: string): Promise<string> | undefined;
  set(key: string, value: Promise<string>): void;
  delete(key: string): boolean;
} {
  return (
    handler as unknown as {
      sharedDepTextCache: {
        get(key: string): Promise<string> | undefined;
        set(key: string, value: Promise<string>): void;
        delete(key: string): boolean;
      };
    }
  ).sharedDepTextCache;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe('Realm-shared shared-dependency source-text cache across two independently loaded module instances', () => {
  it('two copies produce distinct MfeHandlerMF constructors, yet adopt the SAME protocol-v1 realm cache', async () => {
    const copyA = await loadCopy();
    vi.resetModules();
    const copyB = await loadCopy();

    expect(copyA.MfeHandlerMF).not.toBe(copyB.MfeHandlerMF);

    const handlerA = new copyA.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const handlerB = new copyB.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });

    expect(handlerA instanceof copyB.MfeHandlerMF).toBe(false);
    // Identical CACHE object across two unrelated class hierarchies — the
    // whole point of the realm rendezvous.
    expect(realmCacheOf(handlerA)).toBe(realmCacheOf(handlerB));
  });

  it('concurrent loads from both copies for the same name@version@contentHash, at DIFFERENT absolute URLs, issue exactly one fetch', async () => {
    const copyA = await loadCopy();
    vi.resetModules();
    const copyB = await loadCopy();

    const contentHash =
      '0e6ffdcfeba0f920be9dfcd093ae95baba245d9b07dee5348111e3ecb25e3599';
    const fetchCalls: string[] = [];
    let releaseFetch: (() => void) | undefined;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(((
      input: string | URL | Request
    ) => {
      fetchCalls.push(String(input));
      return new Promise<Response>((resolve) => {
        releaseFetch = () => resolve(jsResponse('export const depx = 1;'));
      });
    }) as unknown as typeof fetch);

    const manifestA = buildManifest(
      MANIFEST_ID_A,
      'http://localhost:4101/mfe-a/',
      [sharedDep('dep-x', 'shared/dep-x.js', { contentHash })]
    );
    const manifestB = buildManifest(
      MANIFEST_ID_B,
      'http://localhost:4102/mfe-b/',
      [sharedDep('dep-x', 'shared/dep-x.js', { contentHash })]
    );

    const handlerA = new copyA.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const handlerB = new copyB.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });

    const resultA = fetchShared(handlerA, manifestA);
    const resultB = fetchShared(handlerB, manifestB);

    // Let both copies reach their cache-get/fetch decision before resolving.
    await sleep(10);
    expect(fetchCalls).toHaveLength(1);
    releaseFetch?.();

    const [textsA, textsB] = await Promise.all([resultA, resultB]);
    expect(textsA.get('dep-x')).toBe('export const depx = 1;');
    expect(textsB.get('dep-x')).toBe('export const depx = 1;');

    fetchSpy.mockRestore();
  });

  it('sequential cross-copy reuse of a fulfilled promise: copy B\'s later call never fetches', async () => {
    const copyA = await loadCopy();
    vi.resetModules();
    const copyB = await loadCopy();

    const contentHash =
      'a73f08acc63e6f8d9732679dae84b4942b3148be0a9ba8f670084b8fef530f6d';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsResponse('export const depx = 1;'));

    const manifestA = buildManifest(
      MANIFEST_ID_A,
      'http://localhost:4101/mfe-a/',
      [sharedDep('dep-x', 'shared/dep-x.js', { contentHash })]
    );
    const manifestB = buildManifest(
      MANIFEST_ID_B,
      'http://localhost:4102/mfe-b/',
      [sharedDep('dep-x', 'shared/dep-x.js', { contentHash })]
    );

    const handlerA = new copyA.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const handlerB = new copyB.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });

    await fetchShared(handlerA, manifestA);
    await fetchShared(handlerB, manifestB);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('both loads still mint DISTINCT blob URLs — distinct module specifiers prepared per load — despite sharing the fetched source text (module evaluation itself is out of scope: jsdom cannot import a blob: URL)', async () => {
    const copyA = await loadCopy();
    vi.resetModules();
    const copyB = await loadCopy();

    const contentHash =
      'de4d39c675358c5beb85c910733bb377518691f115c5be822015449bb651133b';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsResponse('export const depx = 1;'));

    const manifestA = buildManifest(
      MANIFEST_ID_A,
      'http://localhost:4101/mfe-a/',
      [sharedDep('dep-x', 'shared/dep-x.js', { contentHash })]
    );
    const manifestB = buildManifest(
      MANIFEST_ID_B,
      'http://localhost:4102/mfe-b/',
      [sharedDep('dep-x', 'shared/dep-x.js', { contentHash })]
    );

    const handlerA = new copyA.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const handlerB = new copyB.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });

    const blobUrlsA = await buildSharedBlobUrls(
      handlerA,
      manifestA,
      'entry-a',
      'ext-a'
    );
    const blobUrlsB = await buildSharedBlobUrls(
      handlerB,
      manifestB,
      'entry-b',
      'ext-b'
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1); // source text shared
    expect(blobUrlsA.get('dep-x')).toMatch(/^blob:/);
    expect(blobUrlsB.get('dep-x')).toMatch(/^blob:/);
    // Distinct blob URLs = distinct module SPECIFIERS prepared, one per
    // load, over the shared text — module records never cross the
    // boundary. This does NOT prove distinct module EVALUATION: jsdom does
    // not support dynamic `import()` of a `blob:` URL, so this test never
    // imports either blob URL and makes no claim about what evaluating
    // them would do.
    expect(blobUrlsA.get('dep-x')).not.toBe(blobUrlsB.get('dep-x'));

    fetchSpy.mockRestore();
  });

  it('URL-fallback keys at different absolute URLs do NOT share, even across copies', async () => {
    const copyA = await loadCopy();
    vi.resetModules();
    const copyB = await loadCopy();

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsResponse('export const depy = 1;'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // No contentHash declared on either side, so each falls back to
    // name@version@<its own resolved URL> — the two URLs differ.
    const manifestA = buildManifest(
      MANIFEST_ID_A,
      'http://localhost:4101/mfe-a/',
      [sharedDep('dep-y', 'shared/dep-y.js')]
    );
    const manifestB = buildManifest(
      MANIFEST_ID_B,
      'http://localhost:4102/mfe-b/',
      [sharedDep('dep-y', 'shared/dep-y.js')]
    );

    const handlerA = new copyA.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const handlerB = new copyB.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });

    await fetchShared(handlerA, manifestA);
    await fetchShared(handlerB, manifestB);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:4101/mfe-a/shared/dep-y.js'
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:4102/mfe-b/shared/dep-y.js'
    );

    warnSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it('an entry with an unrecognized protocol version is left unread/unmutated/unreplaced/undeleted, and the load still succeeds by falling back to a local cache', async () => {
    const copyA = await loadCopy();

    // Pre-occupy the rendezvous slot with an entry a future, incompatible
    // protocol might publish.
    const bogusEntry = { v: 999, cache: 'not-a-cache' };
    (globalThis as Record<symbol, unknown>)[SHARED_DEP_TEXT_CACHE_SYMBOL] =
      bogusEntry;
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsResponse('export const depz = 1;'));

    const manifestA = buildManifest(
      MANIFEST_ID_A,
      'http://localhost:4101/mfe-a/',
      [sharedDep('dep-z', 'shared/dep-z.js')]
    );
    const handlerA = new copyA.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });

    // Load still succeeds — the copy degrades to a local fallback rather
    // than failing or attempting to operate on the unrecognized entry.
    await expect(fetchShared(handlerA, manifestA)).resolves.toBeDefined();

    // The unrecognized entry is untouched: same object, same fields.
    expect(
      (globalThis as Record<symbol, unknown>)[SHARED_DEP_TEXT_CACHE_SYMBOL]
    ).toBe(bogusEntry);
    expect(debugSpy).toHaveBeenCalled();

    debugSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it('the fallback used when the realm slot is unrecognized is SHARED by every handler in the SAME evaluated copy, and is itself bounded at 128 entries — while the unrecognized entry stays untouched throughout', async () => {
    const copyA = await loadCopy();

    // Pre-occupy the rendezvous slot with an entry a future, incompatible
    // protocol might publish — BEFORE either handler below is constructed,
    // so both resolve their `sharedDepTextCache` field against this same
    // unrecognized entry.
    const bogusEntry = { v: 999, cache: 'not-a-cache' };
    (globalThis as Record<symbol, unknown>)[SHARED_DEP_TEXT_CACHE_SYMBOL] =
      bogusEntry;
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    // Two handlers from the SAME copy, constructed independently (no
    // reference passed between them).
    const handlerA1 = new copyA.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const handlerA2 = new copyA.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const fallback1 = realmCacheOf(handlerA1);
    const fallback2 = realmCacheOf(handlerA2);

    // The property under test: one shared fallback per evaluated copy, not
    // a fresh cache per handler (the defect this test guards against) —
    // and definitely not the realm slot's own (bogus, unusable) cache.
    expect(fallback1).toBe(fallback2);
    expect(fallback1).not.toBe(bogusEntry.cache);

    // Bounded at the same 128-entry capacity as the realm cache, checked
    // directly on the fallback before anything else touches it — mirrors
    // the realm-wide LRU test above, against the fallback instance instead.
    for (let i = 0; i < 128; i += 1) {
      fallback1.set(`fb-k${i}`, Promise.resolve(`v${i}`));
    }
    expect(fallback1.get('fb-k0')).toBeDefined(); // re-inserted as MRU
    expect(fallback2.get('fb-k1')).toBeDefined(); // MRU'd via the OTHER handler's reference
    fallback1.set('fb-k128', Promise.resolve('v128')); // 129th distinct insertion
    expect(fallback1.get('fb-k2')).toBeUndefined(); // evicted: least-recently-used
    expect(fallback2.get('fb-k0')).toBeDefined();
    expect(fallback2.get('fb-k128')).toBeDefined();

    // Genuinely shared, not merely equal by accident: a fetch driven
    // through handlerA1 is observed as a cache hit by handlerA2 — zero
    // additional network fetches.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsResponse('export const depz2 = 1;'));
    const manifestA = buildManifest(
      MANIFEST_ID_A,
      'http://localhost:4101/mfe-a/',
      [sharedDep('dep-z2', 'shared/dep-z2.js')]
    );
    await fetchShared(handlerA1, manifestA);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await fetchShared(handlerA2, manifestA);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // still 1 — handlerA2 hit the shared fallback

    // Throughout all of the above, the unrecognized realm-slot entry
    // itself was never read for its (bogus) cache, never mutated, never
    // replaced, and never deleted.
    expect(
      (globalThis as Record<symbol, unknown>)[SHARED_DEP_TEXT_CACHE_SYMBOL]
    ).toBe(bogusEntry);
    expect(debugSpy).toHaveBeenCalled();

    debugSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it('the fallback used when the realm slot is unrecognized is SEPARATE across independently evaluated copies: two copies get two DIFFERENT fallback instances, and a fetch through one copy is not observed as a hit by the other', async () => {
    const copyA = await loadCopy();
    vi.resetModules();
    const copyB = await loadCopy();

    // Same unrecognized entry, present before EITHER copy's handler is
    // constructed — so both copies independently fall back, and any
    // sharing observed below could only come from a genuine cross-copy
    // leak, never from timing.
    const bogusEntry = { v: 999, cache: 'not-a-cache' };
    (globalThis as Record<symbol, unknown>)[SHARED_DEP_TEXT_CACHE_SYMBOL] =
      bogusEntry;
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const handlerA = new copyA.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const handlerB = new copyB.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const fallbackA = realmCacheOf(handlerA);
    const fallbackB = realmCacheOf(handlerB);

    // The property under test: separate fallbacks across copies — the
    // flip side of same-copy sharing above. This is what stops two copies
    // speaking incompatible protocol versions from silently sharing a
    // cache whose key semantics differ; a fallback that were a true
    // global would pass every same-copy assertion above while failing
    // this one.
    expect(fallbackA).not.toBe(fallbackB);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsResponse('export const depz3 = 1;'));
    // Same `contentHash` on both sides, deliberately: with no hash the
    // dedup key falls back to `name@version@<resolved absolute URL>`, and
    // A's and B's publicPaths already differ — so the two calls would
    // compute DIFFERENT keys and copy B would issue its own fetch even if
    // both copies shared ONE cache, proving nothing about separation. The
    // shared hash makes the key `name@version@contentHash`, identical on
    // both sides despite the differing origins — mirroring the real
    // scenario of one dependency at the same content hash served from two
    // origins — so a hit here would require the fallback to actually be
    // one shared cache, and only genuine separation produces the second
    // fetch below.
    const contentHash =
      'deadbeefeba0f920be9dfcd093ae95baba245d9b07dee5348111e3ecb25e359a';
    const manifestA = buildManifest(
      MANIFEST_ID_A,
      'http://localhost:4101/mfe-a/',
      [sharedDep('dep-z3', 'shared/dep-z3.js', { contentHash })]
    );
    const manifestB = buildManifest(
      MANIFEST_ID_B,
      'http://localhost:4102/mfe-b/',
      [sharedDep('dep-z3', 'shared/dep-z3.js', { contentHash })]
    );

    // A fetch through copy A's handler is NOT observed as a hit by copy
    // B's handler: copy B still issues its own fetch for the identical
    // dependency AT THE IDENTICAL KEY (same name@version@contentHash,
    // different origin).
    await fetchShared(handlerA, manifestA);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await fetchShared(handlerB, manifestB);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // copy B's own fetch — no cross-copy hit

    // The unrecognized realm-slot entry itself was still never read,
    // mutated, replaced, or deleted by either copy.
    expect(
      (globalThis as Record<symbol, unknown>)[SHARED_DEP_TEXT_CACHE_SYMBOL]
    ).toBe(bogusEntry);
    expect(debugSpy).toHaveBeenCalled();

    debugSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it('a rejected shared promise is evicted, and a later call can retry successfully', async () => {
    const copyA = await loadCopy();

    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((() => {
      callCount += 1;
      return callCount === 1
        ? Promise.reject(new TypeError('transient network failure'))
        : Promise.resolve(jsResponse('export const depw = 1;'));
    }) as unknown as typeof fetch);

    const manifestA = buildManifest(
      MANIFEST_ID_A,
      'http://localhost:4101/mfe-a/',
      [sharedDep('dep-w', 'shared/dep-w.js')]
    );
    const handlerA = new copyA.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });

    await expect(fetchShared(handlerA, manifestA)).rejects.toThrow();
    // Give the eviction-on-rejection `.catch` a turn to run.
    await sleep(0);

    const retried = await fetchShared(handlerA, manifestA);
    expect(retried.get('dep-w')).toBe('export const depw = 1;');
    expect(callCount).toBe(2);

    fetchSpy.mockRestore();
  });

  it('rejection of an OLDER promise cannot evict a NEWER promise registered under the same key — driving the PRODUCTION eviction-on-rejection callback, not a hand-rolled stand-in for it', async () => {
    const copyA = await loadCopy();
    const handlerA = new copyA.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const cache = realmCacheOf(handlerA);

    let rejectOlder: ((reason: unknown) => void) | undefined;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((_resolve, reject) => {
          rejectOlder = reject;
        })
    );

    const manifestA = buildManifest(
      MANIFEST_ID_A,
      'http://localhost:4101/mfe-a/',
      [sharedDep('dep-v', 'shared/dep-v.js')]
    );
    const key = 'dep-v@1.0.0@http://localhost:4101/mfe-a/shared/dep-v.js';

    // Kicks off the OLDER fetch through the real production path: this is
    // what attaches `fetchSharedDepSources`'s own eviction-on-rejection
    // `.catch` to the resulting promise — not a hand-rolled stand-in for
    // it. `fetchShared` itself will go on to reject once `rejectOlder` is
    // called below; that rejection is asserted on, not swallowed silently.
    const olderCall = fetchShared(handlerA, manifestA);
    const olderRejection = expect(olderCall).rejects.toThrow();
    expect(cache.get(key)).toBeDefined(); // production published P_older synchronously

    // Simulate a concurrent caller that already replaced the mapping with
    // a newer generation before the older fetch's own rejection is
    // observed — the same situation a timeout-release-then-retry produces
    // (see the staggered-timeout test below), reproduced directly here
    // rather than through the timer/backoff machinery.
    const newer = Promise.resolve('export const depv = 2;');
    cache.set(key, newer);

    rejectOlder?.(new TypeError('older fetch failed'));
    await olderRejection; // let PRODUCTION's own `.catch` (inside fetchSharedDepSources) run

    expect(cache.get(key)).toBe(newer);

    fetchSpy.mockRestore();
  });

  it('an attempt that actually JOINS a replacement generation (P2) can later release exactly that generation on its own timeout', async () => {
    const copyA = await loadCopy();

    const contentHash =
      'ffff39c675358c5beb85c910733bb377518691f115c5be822015449bb651133d';
    const key = `dep-r@1.0.0@${contentHash}`;

    let fetchCallCount = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((() => {
      fetchCallCount += 1;
      // Both the original attempt's fetch (P1) and the retry's fetch (P2)
      // hang forever, so each generation is still unsettled — and
      // therefore still eligible for identity-checked release — when its
      // own attempt's timeout fires.
      return new Promise<Response>(() => {});
    }) as unknown as typeof fetch);

    const manifestA = buildManifest(
      MANIFEST_ID_A,
      'http://localhost:4101/mfe-a/',
      [sharedDep('dep-r', 'shared/dep-r.js', { contentHash })]
    );
    const handlerA = new copyA.MfeHandlerMF(ENTRY_BASE_ID, {
      retries: 1,
      timeout: 50,
    });
    const entryA = buildEntry(manifestA, 'entry-a-p2-release');
    const cache = realmCacheOf(handlerA);

    // Attempt 1 joins/publishes P1, times out at ~50ms, identity-releases
    // P1 (already covered by the pre-existing single-copy timeout test).
    // Attempt 2 (the retry, after the ~1000ms backoff) publishes P2 under
    // the SAME key and, since P2 also hangs, times out on its OWN fresh
    // 50ms budget — that release is what this test isolates: the attempt
    // that actually joined P2 is the one whose identity check against P2
    // succeeds.
    await expect(handlerA.load(entryA, 'ext-a-p2-release')).rejects.toThrow(
      /timed out after 50ms/
    );

    expect(fetchCallCount).toBe(2); // P1's fetch, then P2's — two distinct generations
    // P2's own attempt released P2: nothing is left mapped under the key.
    expect(cache.get(key)).toBeUndefined();

    fetchSpy.mockRestore();
  }, 5000);

  it('a pre-existing, structurally conforming protocol-v1 cache is ADOPTED by BOTH independently loaded copies — the accepted trust model, not authentication', async () => {
    const copyA = await loadCopy();
    vi.resetModules();
    const copyB = await loadCopy();

    // A structural stand-in, not `LruCache` by class identity — the
    // rendezvous accepts it because it conforms to get/set/delete, exactly
    // as ADR-0035 records: no cross-copy authentication is possible or
    // attempted.
    const preOccupied = {
      store: new Map<string, Promise<string>>(),
      get(k: string) {
        return this.store.get(k);
      },
      set(k: string, v: Promise<string>) {
        this.store.set(k, v);
      },
      delete(k: string) {
        return this.store.delete(k);
      },
    };
    (globalThis as Record<symbol, unknown>)[SHARED_DEP_TEXT_CACHE_SYMBOL] = {
      v: 1,
      cache: preOccupied,
    };

    // BOTH copies — constructed only after the slot was pre-occupied above
    // — must resolve to the exact same pre-existing object, neither
    // replacing it nor minting one of their own.
    const handlerA = new copyA.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const handlerB = new copyB.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    expect(realmCacheOf(handlerA)).toBe(preOccupied);
    expect(realmCacheOf(handlerB)).toBe(preOccupied);
    expect(realmCacheOf(handlerA)).toBe(realmCacheOf(handlerB));

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsResponse('export const depu = 1;'));
    const manifestA = buildManifest(
      MANIFEST_ID_A,
      'http://localhost:4101/mfe-a/',
      [sharedDep('dep-u', 'shared/dep-u.js')]
    );
    const manifestB = buildManifest(
      MANIFEST_ID_B,
      'http://localhost:4102/mfe-b/',
      [sharedDep('dep-u', 'shared/dep-u.js')]
    );
    await fetchShared(handlerA, manifestA);
    await fetchShared(handlerB, manifestB);

    // Both fetches actually landed IN the pre-occupied store — proof of
    // real adoption BY BOTH copies, not merely a returned reference
    // nothing writes through.
    expect(preOccupied.store.size).toBe(2);

    fetchSpy.mockRestore();
  });

  it('exact 128-entry realm-wide LRU: the 129th distinct insertion evicts the least-recently-used entry, with no multiplication by handler or copy count', async () => {
    const copyA = await loadCopy();
    vi.resetModules();
    const copyB = await loadCopy();

    const handlerA = new copyA.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const handlerB = new copyB.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const cacheA = realmCacheOf(handlerA);
    const cacheB = realmCacheOf(handlerB);
    expect(cacheA).toBe(cacheB); // same realm-wide instance, both copies

    for (let i = 0; i < 128; i += 1) {
      cacheA.set(`k${i}`, Promise.resolve(`v${i}`));
    }
    expect(cacheA.get('k0')).toBeDefined(); // still resident, re-inserted as MRU
    expect(cacheB.get('k1')).toBeDefined(); // visible from the OTHER copy's reference

    // k0 and k1 are now MRU (just re-`get`); the next insertion evicts the
    // actual least-recently-used entry — k2.
    cacheA.set('k128', Promise.resolve('v128'));

    expect(cacheA.get('k2')).toBeUndefined();
    expect(cacheB.get('k0')).toBeDefined();
    expect(cacheB.get('k128')).toBeDefined();
  });

  it('a second, independently constructed handler in the same copy hits the same realm cache the first handler used', async () => {
    // NOTE on scope: this test demonstrates only that the cache is not
    // per-handler-instance. It does NOT exercise or claim anything about
    // lifetime, disposal, or discard: the first handler (`handlerA` below)
    // stays referenced for the whole test, no handler is ever discarded,
    // and no `MfeRegistry` is constructed or disposed here (`MfeHandlerMF`
    // has no disposal contract to begin with —
    // `cpt-frontx-dod-mfe-isolation-realm-shared-dep-text-cache` is
    // explicit that none exists). What IS shown: two handlers, constructed
    // one after the other with no relationship between them (no shared
    // reference, no registry gluing them together), both resolve to the
    // same realm cache, and the second's call is a cache hit.
    const copyA = await loadCopy();

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsResponse('export const dept = 1;'));
    const manifestA = buildManifest(
      MANIFEST_ID_A,
      'http://localhost:4101/mfe-a/',
      [sharedDep('dep-t', 'shared/dep-t.js')]
    );

    const handlerA = new copyA.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    await fetchShared(handlerA, manifestA);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // A second, independently constructed handler — no reference to
    // `handlerA` is passed or reused here — still hits.
    const handlerLater = new copyA.MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    expect(realmCacheOf(handlerLater)).toBe(realmCacheOf(handlerA));
    await fetchShared(handlerLater, manifestA);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });

  // ─── Staggered timeout: generation identity across the copy boundary ────

  it(
    'staggered timeout across copies: A joins P1 and times out (identity-deletes P1); a retry publishes P2; B releases its recorded P1 late — P2 REMAINS mapped (the negative half of the generation rule; the positive half — an attempt that joined P2 CAN release P2 — is proved by the preceding single-copy test)',
    async () => {
      const copyA = await loadCopy();
      vi.resetModules();
      const copyB = await loadCopy();

      const contentHash =
        'abcd39c675358c5beb85c910733bb377518691f115c5be822015449bb651133c';
      const key = `dep-s@1.0.0@${contentHash}`;

      let fetchCallCount = 0;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(((
        input: string | URL | Request
      ) => {
        const url = String(input);
        if (!url.endsWith('lifecycle.js')) {
          fetchCallCount += 1;
          // First call (A's original attempt, generation P1) hangs
          // forever; every later call (the retry's own fetch, P2) resolves.
          return fetchCallCount === 1
            ? new Promise<Response>(() => {})
            : Promise.resolve(jsResponse('export const deps = 1;'));
        }
        // Expose chunk: resolves to an empty module immediately for both
        // copies — irrelevant to this test, which only cares about the
        // shared-dep cache entry.
        return Promise.resolve(jsResponse('export default {};'));
      }) as unknown as typeof fetch);

      const manifestA = buildManifest(
        MANIFEST_ID_A,
        'http://localhost:4101/mfe-a/',
        [sharedDep('dep-s', 'shared/dep-s.js', { contentHash })]
      );
      const manifestB = buildManifest(
        MANIFEST_ID_B,
        'http://localhost:4102/mfe-b/',
        [sharedDep('dep-s', 'shared/dep-s.js', { contentHash })]
      );

      // A: short timeout + one retry, so its own attempt abandons P1 and a
      // retry publishes P2 within this test's real-clock budget.
      const handlerA = new copyA.MfeHandlerMF(ENTRY_BASE_ID, {
        retries: 1,
        timeout: 50,
      });
      // B: a single attempt whose budget is long enough to fire AFTER A's
      // retry has already published P2 (50ms timeout + 1000ms backoff +
      // an effectively-instant retry fetch), so B's own release runs late,
      // against a replacement generation it never joined.
      const handlerB = new copyB.MfeHandlerMF(ENTRY_BASE_ID, {
        retries: 0,
        timeout: 1300,
      });

      const entryA = buildEntry(manifestA, 'entry-a-staggered');
      const entryB = buildEntry(manifestB, 'entry-b-staggered');

      blobModuleStub.current = {
        default: { mount: (): void => {}, unmount: (): void => {} },
      };

      const loadA = handlerA.load(entryA, 'ext-a-staggered');
      // Give A a moment to register P1 in the realm cache before B joins.
      await sleep(10);
      const loadB = handlerB.load(entryB, 'ext-b-staggered');

      const cache = realmCacheOf(handlerA);
      expect(cache).toBe(realmCacheOf(handlerB));

      // A's attempt (50ms) times out, retries (1000ms backoff), and its
      // retry's own fetch (P2) resolves quickly — A's load eventually
      // succeeds because the retry issues its own fetch rather than
      // rejoining the abandoned P1.
      await expect(loadA).resolves.toBeDefined();
      const p2 = cache.get(key);
      expect(p2).toBeDefined();

      // B's own attempt (1300ms) fires well after A's retry replaced the
      // mapping with P2. B's ledger still carries P1 (the promise it
      // actually joined), so its identity check fails against P2 and
      // cannot remove it.
      await expect(loadB).rejects.toThrow(/timed out after 1300ms/);
      expect(cache.get(key)).toBe(p2); // P2 REMAINS mapped

      blobModuleStub.current = undefined;
      fetchSpy.mockRestore();
    },
    5000
  );
});
