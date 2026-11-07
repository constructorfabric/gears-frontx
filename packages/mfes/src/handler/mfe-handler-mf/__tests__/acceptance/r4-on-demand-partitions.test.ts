/**
 * Acceptance: R4 round-4 findings — a lazy `spec:` import needing an
 * UNFETCHED partition of a package whose index graph the boot fetch set
 * already loaded fetches exactly that partition before minting (R4-04):
 * `ensureSharedDepGraph` no longer early-returns on a loaded index, and
 * the seeded merge state fetches no document twice (R4-05).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubbedDynamicModuleOps } from '../helpers/blob-module-stub';

const blobModuleStub = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../../mf-dynamic-module-ops', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../mf-dynamic-module-ops')>();
  return {
    ...actual,
    DynamicModuleOps: stubbedDynamicModuleOps(
      actual.DynamicModuleOps,
      blobModuleStub,
    ),
  };
});

import { MfeHandlerMF } from '../../MfeHandlerMF';
import { LazyLoaderRegistry } from '../../../../lazy-loader/LazyLoaderRegistry';
import type {
  SharedDepGraphFile,
  SharedDepGraphFileRef,
  SharedDepGraphShard,
} from '../../../../unit-format/graph-file';
import {
  buildEntry,
  buildGraphFile,
  buildManifest,
  ENTRY_BASE_ID,
  graphSharedDep,
  PUBLIC_PATH,
  sha256Hex,
} from '../helpers/manifest-builder';
import { createFetchRouter } from '../helpers/fetch-router';
import { captureMintedSources } from '../helpers/minted-sources';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';
import { stubSuccessfulImport } from '../helpers/blob-module-stub';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

const lazyGlobal = (): { resolve(id: string, path: string): Promise<string> } =>
  (globalThis as unknown as {
    __FRONTX_LAZY__: { resolve(id: string, path: string): Promise<string> };
  }).__FRONTX_LAZY__;

/** A `{name, version, units}` partition document with real identities. */
function buildPartition(
  name: string,
  modulePath: string,
  source: string,
  location: string,
): { text: string; ref: SharedDepGraphFileRef; unitLocation: string } {
  const hash = sha256Hex(source);
  const unitLocation = `shared/${name}/${modulePath.replace(/\.[cm]?js$/, '')}.${hash}.js`;
  const doc: SharedDepGraphShard = {
    name,
    version: '1.0.0',
    units: [
      {
        contentHash: hash,
        modulePaths: [modulePath],
        bareImports: [],
        bareSpecifiers: [],
        relativeImports: [],
        dynamicImports: [],
        location: unitLocation,
      },
    ],
  };
  const text = JSON.stringify(doc);
  return {
    text,
    ref: { location, contentHash: sha256Hex(text) },
    unitLocation,
  };
}

describe('acceptance: R4-04 lazy import() needing an unfetched partition', () => {
  it(
    'fetches exactly the missing partition of the already-loaded package and mints on demand',
    { timeout: 20_000 },
    async () => {
      // The `import('lodash')` call resolves to a `unit:` token at mint
      // time — that registers the per-load lazy loader the test then
      // calls with a `spec:` token directly.
      const MAIN_SRC =
        "import 'lodash';\nconst p = import('lodash');\nexport const r = 1;\n";
      const INDEX_SRC = 'export const i = 1;\n';
      const FEATURE_SRC = 'export const f = 1;\n';
      const react = buildGraphFile(
        'react',
        '1.0.0',
        [
          {
            modulePaths: ['index.js'],
            source: MAIN_SRC,
            bareImports: ['lodash'],
            bareSpecifiers: ['lodash'],
            // No lazy imports recorded: 'lodash/feature' stays outside
            // the boot fetch set — partition 1 is not fetched at boot.
            dynamicImports: [],
          },
        ],
        'index.js',
        ['lodash'],
      );
      const p0 = buildPartition(
        'lodash',
        'index.js',
        INDEX_SRC,
        'shared/lodash.part-0.json',
      );
      const p1 = buildPartition(
        'lodash',
        'feature.js',
        FEATURE_SRC,
        'shared/lodash.part-1.json',
      );
      const lodashGraph: SharedDepGraphFile = {
        name: 'lodash',
        version: '1.0.0',
        unitMode: 'units',
        units: [],
        requires: [],
        mainModulePath: 'index.js',
        entryModulePaths: { '.': 'index.js', './feature': 'feature.js' },
        unitPartitions: [p0.ref, p1.ref],
        modulePartitions: { 'index.js': 0, 'feature.js': 1 },
      };
      const lodashText = JSON.stringify(lodashGraph);
      const lodashIndex = { text: lodashText, hash: sha256Hex(lodashText) };
      const manifest = buildManifest(
        [
          graphSharedDep('react', react, { requires: ['lodash'] }),
          graphSharedDep('lodash', lodashIndex),
        ],
        { entryRoots: { './lifecycle': ['react'] } },
      );
      const router = createFetchRouter({
        [`${PUBLIC_PATH}assets/lifecycle.js`]: {
          body: 'import "react";\nexport default {};',
        },
        [`${PUBLIC_PATH}shared/react.graph.json`]: { body: react.text },
        [`${PUBLIC_PATH}${react.unitLocations[0]}`]: { body: MAIN_SRC },
        [`${PUBLIC_PATH}shared/lodash.graph.json`]: { body: lodashIndex.text },
        [`${PUBLIC_PATH}${p0.ref.location}`]: { body: p0.text },
        [`${PUBLIC_PATH}${p1.ref.location}`]: { body: p1.text },
        [`${PUBLIC_PATH}${p0.unitLocation}`]: { body: INDEX_SRC },
        [`${PUBLIC_PATH}${p1.unitLocation}`]: { body: FEATURE_SRC },
      });
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(router as typeof fetch);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const registerSpy = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
      const minted = captureMintedSources();
      stubSuccessfulImport(blobModuleStub);
      const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
      try {
        await expect(
          handler.load(buildEntry(manifest), 'ext-r4-04'),
        ).resolves.toBeDefined();
        // Boot: the index graph plus the main-entry partition only.
        expect(router.calls).toContain(`${PUBLIC_PATH}${p0.ref.location}`);
        expect(router.calls).not.toContain(`${PUBLIC_PATH}${p1.ref.location}`);
        const loaderId = registerSpy.mock.results[0].value as string;
        // The lazy specifier names a partition the boot set did not
        // cover: it is fetched on demand, the unit minted, and the
        // specifier resolves to a blob — never a MfeLoadError.
        const blobUrl = await lazyGlobal().resolve(
          loaderId,
          'spec:lodash/feature',
        );
        expect(blobUrl).toMatch(/^blob:/);
        expect(router.calls).toContain(`${PUBLIC_PATH}${p1.ref.location}`);
        expect(router.calls).toContain(`${PUBLIC_PATH}${p1.unitLocation}`);
        // The already-merged partition is never fetched again (R4-05):
        // one request for each document, even on a repeated resolve.
        await lazyGlobal().resolve(loaderId, 'spec:lodash/feature');
        const count = (url: string): number =>
          router.calls.filter((c) => c === url).length;
        expect(count(`${PUBLIC_PATH}${p0.ref.location}`)).toBe(1);
        expect(count(`${PUBLIC_PATH}${p1.ref.location}`)).toBe(1);
      } finally {
        minted.restore();
        registerSpy.mockRestore();
        fetchSpy.mockRestore();
        warnSpy.mockRestore();
        blobModuleStub.current = undefined;
      }
    },
  );
});
