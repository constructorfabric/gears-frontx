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
import { RealmSharedDepTextCacheProvider } from '../index';
import type { SharedDepTextCache } from '../index';

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
  const specifierPattern = /\bfrom\s*['"](\.[^'"]+)['"]/g;
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(specifierPattern)) {
      let resolved = path.resolve(path.dirname(file), match[1]);
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
      'RealmSharedDepTextCacheProvider',
      'SharedUnitGraphLoader',
      'UnitBlobMinter',
    ]);
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
