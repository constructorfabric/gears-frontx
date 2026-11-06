/**
 * Scenario coverage for the `./unit-loader` sanctioned subpath
 * (`cpt-frontx-algo-unit-format-contract-loader-surface`):
 *
 *  - the subpath yields exactly the fetch, verify, realm-cache and mint
 *    classes, and its module graph reaches no registry, orchestrating
 *    handler or mediator module;
 *  - two loader copies agree on one versioned realm cache slot and dedupe
 *    by content identity;
 *  - a slot holding a foreign or older entry shape is not shared and does
 *    not throw — the consumer proceeds on its own copy-local cache.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as unitLoader from '../index';
import {
  PackFallbackPolicy,
  RealmSharedDepTextCacheProvider,
  SharedAssetUrlResolver,
  SharedUnitGraphLoader,
  UnitBlobMinter,
  VerifiedUnitFetcher,
} from '../index';
import type { SharedDepTextCache } from '../index';
import { PackFallbackPolicy as InternalPackFallbackPolicy } from '../../handler/mfe-handler-mf/PackFallbackPolicy';
import { RealmSharedDepTextCacheProvider as InternalRealmSharedDepTextCacheProvider } from '../../handler/mfe-handler-mf/RealmSharedDepTextCacheProvider';
import { SharedAssetUrlResolver as InternalSharedAssetUrlResolver } from '../../handler/mfe-handler-mf/SharedAssetUrlResolver';
import { SharedUnitGraphLoader as InternalSharedUnitGraphLoader } from '../../handler/mfe-handler-mf/SharedUnitGraphLoader';
import { UnitBlobMinter as InternalUnitBlobMinter } from '../../handler/mfe-handler-mf/UnitBlobMinter';
import { VerifiedUnitFetcher as InternalVerifiedUnitFetcher } from '../../handler/mfe-handler-mf/VerifiedUnitFetcher';
import {
  buildGraphFile,
  buildManifest,
  graphSharedDep,
  PUBLIC_PATH,
} from '../../handler/mfe-handler-mf/__tests__/helpers/manifest-builder';
import { createFetchRouter } from '../../handler/mfe-handler-mf/__tests__/helpers/fetch-router';
import { captureMintedSources, unmintedSpecifiers } from '../../handler/mfe-handler-mf/__tests__/helpers/minted-sources';
import { resetRealmSharedDepTextCache } from '../../handler/mfe-handler-mf/__tests__/helpers/realm-cache';

const SRC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

const REALM_SLOT_KEY = Symbol.for(
  '@gears-frontx/mfes:shared-dep-text-cache:1',
);

type RealmHost = Record<symbol, unknown>;

const realmHost = globalThis as unknown as RealmHost;

afterEach(() => {
  delete realmHost[REALM_SLOT_KEY];
  vi.restoreAllMocks();
});

/**
 * The transitive set of source modules a barrel pulls in, found by
 * walking its relative `import`/`export ... from` specifiers — the same
 * module-resolution a bundler applies when the subpath is consumed.
 */
function reachableSources(entryFile: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entryFile];
  // Relative specifiers in `export ... from`, `import ... from`,
  // side-effect `import './x'` and dynamic `import('./x')` — every way a
  // module can pull another source file into the graph.
  const specifierPatterns = [
    /\bfrom\s*['"](\.[^'"]+)['"]/g,
    /\bimport\s*['"](\.[^'"]+)['"]/g,
    /\bimport\s*\(\s*['"](\.[^'"]+)['"]/g,
  ];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const content = fs.readFileSync(file, 'utf8');
    const specifiers = specifierPatterns.flatMap((pattern) =>
      [...content.matchAll(pattern)].map((match) => match[1]),
    );
    for (const specifier of specifiers) {
      let resolved = path.resolve(path.dirname(file), specifier);
      if (fs.existsSync(`${resolved}.ts`)) resolved = `${resolved}.ts`;
      else if (fs.existsSync(path.join(resolved, 'index.ts'))) {
        resolved = path.join(resolved, 'index.ts');
      } else if (!resolved.endsWith('.ts')) {
        continue;
      }
      if (fs.existsSync(resolved) && !seen.has(resolved)) {
        queue.push(resolved);
      }
    }
  }
  return seen;
}

describe('@gears-frontx/mfes/unit-loader export surface', () => {
  it('exports exactly the fetch/verify, mint and realm-cache classes', () => {
    // inst-loader-surface-classes
    expect(Object.keys(unitLoader).sort()).toEqual([
      'PackFallbackPolicy',
      'RealmSharedDepTextCacheProvider',
      'SharedAssetUrlResolver',
      'SharedGraphSetLoader',
      'SharedUnitGraphLoader',
      'UnitBlobMinter',
      'VerifiedUnitFetcher',
    ]);
  });

  it('re-exports the identical classes the handler modules define', () => {
    // inst-loader-surface-classes: the subpath re-exports the very
    // collaborator classes MfeHandlerMF orchestrates — not facades or
    // copies of them.
    expect(SharedUnitGraphLoader).toBe(InternalSharedUnitGraphLoader);
    expect(UnitBlobMinter).toBe(InternalUnitBlobMinter);
    expect(RealmSharedDepTextCacheProvider).toBe(
      InternalRealmSharedDepTextCacheProvider,
    );
    expect(VerifiedUnitFetcher).toBe(InternalVerifiedUnitFetcher);
    expect(SharedAssetUrlResolver).toBe(InternalSharedAssetUrlResolver);
    expect(PackFallbackPolicy).toBe(InternalPackFallbackPolicy);
    expect(PackFallbackPolicy.DEFAULT_BUDGET_MS).toBeGreaterThan(0);
  });

  it('pulls no registry, orchestrating handler or mediator module', () => {
    // inst-loader-surface-no-orchestration
    const entry = path.join(SRC_DIR, 'unit-loader', 'index.ts');
    const reachable = reachableSources(entry);
    const forbidden = [
      /MfeHandlerMF\.ts$/,
      /src[\\/]registry[\\/]/,
      /src[\\/]mediator[\\/]/,
      /src[\\/]runtime[\\/]/,
      /src[\\/]bridge[\\/]/,
      /src[\\/]router[\\/]/,
      /src[\\/]lazy-loader[\\/]/,
      /src[\\/]state[\\/]/,
      /src[\\/]gts[\\/]/,
    ];
    for (const file of reachable) {
      for (const pattern of forbidden) {
        expect(file, `${file} must not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});

describe('versioned realm cache slot', () => {
  const conformingCache = (): SharedDepTextCache & {
    store: Map<string, Promise<string>>;
  } => {
    const store = new Map<string, Promise<string>>();
    return {
      store,
      get: (key: string) => store.get(key),
      set: (key: string, value: Promise<string>) => {
        store.set(key, value);
      },
      delete: (key: string) => store.delete(key),
    };
  };

  it('adopts a compatible published entry so two copies dedupe by content identity', () => {
    // inst-loader-slot-adopt
    const shared = conformingCache();
    realmHost[REALM_SLOT_KEY] = { v: 1, cache: shared };

    const copyA = RealmSharedDepTextCacheProvider.getCache();
    const copyB = RealmSharedDepTextCacheProvider.getCache();
    expect(copyA).toBe(shared);
    expect(copyB).toBe(shared);

    // Content-identity dedupe: a key set through one handle is seen
    // through the other.
    copyA.set('sha256:abc', Promise.resolve('unit source'));
    expect(copyB.get('sha256:abc')).toBe(copyA.get('sha256:abc'));
  });

  it('does not share a foreign or older entry shape and does not throw', () => {
    // inst-loader-slot-versioned
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const foreign = { v: 2, cache: conformingCache() };
    realmHost[REALM_SLOT_KEY] = foreign;

    let own: SharedDepTextCache | undefined;
    expect(() => {
      own = RealmSharedDepTextCacheProvider.getCache();
    }).not.toThrow();
    expect(own).toBeDefined();
    expect(own).not.toBe(foreign.cache);

    // The foreign entry is left untouched — not read into, mutated,
    // replaced or deleted.
    expect(realmHost[REALM_SLOT_KEY]).toBe(foreign);
    expect(debug).toHaveBeenCalled();

    // Reuse degrades to copy scope: a second call from this copy returns
    // the same fallback cache rather than minting a fresh one.
    expect(RealmSharedDepTextCacheProvider.getCache()).toBe(own);

    // And a malformed (non-entry) value is treated the same way.
    realmHost[REALM_SLOT_KEY] = 'not an entry';
    expect(() => RealmSharedDepTextCacheProvider.getCache()).not.toThrow();
    expect(realmHost[REALM_SLOT_KEY]).toBe('not an entry');
  });
});

describe('full load plan through ./unit-loader exports only', () => {
  // inst-loader-surface-classes: a host — the shell boot chunk's shape —
  // runs loadGraph → buildPlan → mint with no hand-written fetch or URL
  // logic: the fetch router supplies bytes, `SharedAssetUrlResolver`
  // produces every fetch URL, `VerifiedUnitFetcher` verifies and dedupes
  // through the realm cache, and `UnitBlobMinter` mints.
  const ENTRY_ID = 'test.host.entry';
  const EXPOSED = './lifecycle';
  const UNIT_SRC = 'export const react = 1;\n';

  it('fetches, verifies, realm-caches and mints a declared shared set', async () => {
    resetRealmSharedDepTextCache();
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: UNIT_SRC }],
      'index.js',
      [],
    );
    const dep = graphSharedDep('react', graph);
    const manifest = buildManifest([dep], {
      entryRoots: { [EXPOSED]: ['react'] },
    });
    const router = createFetchRouter({
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
      [`${PUBLIC_PATH}${graph.unitLocations[0]}`]: { body: UNIT_SRC },
    });
    const fetchText = (url: string): Promise<string> =>
      router(url).then((response) => response.text());

    const resolveAssetUrl = (location: string): string =>
      SharedAssetUrlResolver.resolve(location, PUBLIC_PATH, ENTRY_ID);
    const graphs = [
      await SharedUnitGraphLoader.loadGraph(
        dep,
        resolveAssetUrl(dep.graphFile?.location ?? ''),
        fetchText,
        ENTRY_ID,
      ),
    ];
    SharedUnitGraphLoader.checkRequiresClosure(
      graphs,
      new Set(manifest.shared.map((d) => d.name)),
      ENTRY_ID,
    );
    const roots = SharedUnitGraphLoader.rootsForExposedModule(
      manifest,
      EXPOSED,
      ENTRY_ID,
    );
    const fetcher = new VerifiedUnitFetcher(fetchText, ENTRY_ID);
    const plan = await SharedUnitGraphLoader.buildPlan(
      graphs,
      roots,
      PackFallbackPolicy.DEFAULT_BUDGET_MS,
      0,
      fetcher.fetchVerified,
      resolveAssetUrl,
      ENTRY_ID,
    );
    expect(plan.records).toHaveLength(1);
    expect(plan.packFallbackPackages).toEqual([]);

    const minted = captureMintedSources();
    const specifierToBlob = UnitBlobMinter.mint(
      plan.records,
      ENTRY_ID,
      undefined,
      new Map(),
    );
    expect(specifierToBlob.get('react')).toMatch(/^blob:/);
    const sources = await minted.sources();
    minted.restore();
    expect(sources).toEqual([UNIT_SRC]);
    for (const source of sources) {
      expect(unmintedSpecifiers(source)).toEqual([]);
    }

    // Verified text is deduped through the realm cache: a second plan
    // run fetches nothing again for the same content identity.
    const callsBefore = router.calls.length;
    const again = await SharedUnitGraphLoader.buildPlan(
      graphs,
      roots,
      PackFallbackPolicy.DEFAULT_BUDGET_MS,
      0,
      fetcher.fetchVerified,
      resolveAssetUrl,
      ENTRY_ID,
    );
    expect(router.calls.length).toBe(callsBefore);
    expect(again.records).toHaveLength(1);

    // The realm slot carries the adopted entry, keyed by content
    // identity — the host fetched through the same cache MFE loads use.
    const cache = RealmSharedDepTextCacheProvider.getCache();
    await expect(
      cache.get(`react@1.0.0@${graph.unitHashes[0]}`),
    ).resolves.toBe(UNIT_SRC);
  });
});
