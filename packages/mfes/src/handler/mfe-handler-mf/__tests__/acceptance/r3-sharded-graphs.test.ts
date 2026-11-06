/**
 * Acceptance: R3 round-3 findings — a lazy `import()` into a SHARDED
 * shared package fetches the index graph AND the shard/partition
 * documents its specifier names before minting (R3-01); deep
 * specifiers and unit-identifier roots resolve through the
 * module-path → partition index (SZ-014/015); and a `spec:` token is
 * minted only for a manifest dep that declares a graphFile (R3-03).
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
  SharedDepGraphUnit,
} from '../../../../unit-format/graph-file';
import type { MfManifestShared } from '../../../../manifest/mf-manifest';
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

interface ShardUnitSpec {
  modulePaths: string[];
  source: string;
  bareImports?: string[];
  bareSpecifiers?: string[];
  relativeImports?: string[];
  dynamicImports?: string[];
}

/**
 * Build a `{name, version, units}` shard/partition document with real
 * content identities, returning its text, its file ref and the unit
 * locations the fetch router must serve.
 */
function buildShard(
  name: string,
  units: readonly ShardUnitSpec[],
  location: string,
): { text: string; ref: SharedDepGraphFileRef; unitLocations: string[] } {
  const doc: SharedDepGraphShard = {
    name,
    version: '1.0.0',
    units: units.map((u) => {
      const hash = sha256Hex(u.source);
      const loc = `shared/${name}/${u.modulePaths[0].replace(/\.[cm]?js$/, '')}.${hash}.js`;
      (u as { location?: string }).location = loc;
      return {
        contentHash: hash,
        modulePaths: u.modulePaths,
        bareImports: u.bareImports ?? [],
        ...(u.bareSpecifiers !== undefined
          ? { bareSpecifiers: u.bareSpecifiers }
          : {}),
        relativeImports: u.relativeImports ?? [],
        ...(u.dynamicImports !== undefined
          ? { dynamicImports: u.dynamicImports }
          : {}),
        location: loc,
      } as SharedDepGraphUnit;
    }),
  };
  const text = JSON.stringify(doc);
  return {
    text,
    ref: { location, contentHash: sha256Hex(text) },
    unitLocations: doc.units.map((u) => u.location),
  };
}

/** A sharded index graph (`units: []`) with the given shard refs. */
function buildIndexGraph(
  name: string,
  extra: Partial<SharedDepGraphFile>,
): { text: string; hash: string } {
  const graph: SharedDepGraphFile = {
    name,
    version: '1.0.0',
    unitMode: 'units',
    units: [],
    requires: [],
    ...extra,
  };
  const text = JSON.stringify(graph);
  return { text, hash: sha256Hex(text) };
}

describe('acceptance: R3-01 lazy import() into a sharded package', () => {
  it('fetches the entry shard the specifier names and mints its unit on demand', async () => {
    const MAIN_SRC = "const p = import('lodash/fp');\nexport const r = 1;\n";
    const FP_SRC = 'export const fp = 1;\n';
    const react = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: MAIN_SRC, dynamicImports: ['lodash/fp'] }],
      'index.js',
      ['lodash'],
    );
    const fpShard = buildShard(
      'lodash',
      [{ modulePaths: ['fp/index.js'], source: FP_SRC }],
      'shared/lodash.shard-fp.json',
    );
    const otherShard = buildShard(
      'lodash',
      [{ modulePaths: ['other.js'], source: 'export const o = 1;\n' }],
      'shared/lodash.units.json',
    );
    const lodashIndex = buildIndexGraph('lodash', {
      entryShards: { './fp': fpShard.ref },
      unitsShard: otherShard.ref,
    });
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
      [`${PUBLIC_PATH}${fpShard.ref.location}`]: { body: fpShard.text },
      [`${PUBLIC_PATH}${otherShard.ref.location}`]: { body: otherShard.text },
      [`${PUBLIC_PATH}${fpShard.unitLocations[0]}`]: { body: FP_SRC },
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
        handler.load(buildEntry(manifest), 'ext-r3-01-a'),
      ).resolves.toBeDefined();
      // The lazy resolve fetches the index graph AND the './fp' shard —
      // never the whole-unit-list shard.
      const loaderId = registerSpy.mock.results[0].value as string;
      const blobUrl = await lazyGlobal().resolve(loaderId, 'spec:lodash/fp');
      expect(blobUrl).toMatch(/^blob:/);
      expect(router.calls).toContain(`${PUBLIC_PATH}shared/lodash.graph.json`);
      expect(router.calls).toContain(`${PUBLIC_PATH}${fpShard.ref.location}`);
      expect(router.calls).not.toContain(
        `${PUBLIC_PATH}${otherShard.ref.location}`,
      );
      expect(router.calls).toContain(
        `${PUBLIC_PATH}${fpShard.unitLocations[0]}`,
      );
    } finally {
      minted.restore();
      registerSpy.mockRestore();
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('fetches only the partition a deep specifier names via the module index', async () => {
    const MAIN_SRC =
      "const p = import('lodash/deep/Mod.mjs');\nexport const r = 1;\n";
    const DEEP_SRC = 'export const deep = 1;\n';
    const react = buildGraphFile(
      'react',
      '1.0.0',
      [
        {
          modulePaths: ['index.js'],
          source: MAIN_SRC,
          dynamicImports: ['lodash/deep/Mod.mjs'],
        },
      ],
      'index.js',
      ['lodash'],
    );
    const p0 = buildShard(
      'lodash',
      [{ modulePaths: ['index.js'], source: 'export const i = 1;\n' }],
      'shared/lodash.part-0.json',
    );
    const p1 = buildShard(
      'lodash',
      [{ modulePaths: ['deep/Mod.mjs'], source: DEEP_SRC }],
      'shared/lodash.part-1.json',
    );
    const lodashIndex = buildIndexGraph('lodash', {
      unitPartitions: [p0.ref, p1.ref],
      modulePartitions: { 'index.js': 0, 'deep/Mod.mjs': 1 },
    });
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
      [`${PUBLIC_PATH}${p1.unitLocations[0]}`]: { body: DEEP_SRC },
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
        handler.load(buildEntry(manifest), 'ext-r3-01-b'),
      ).resolves.toBeDefined();
      const loaderId = registerSpy.mock.results[0].value as string;
      const blobUrl = await lazyGlobal().resolve(
        loaderId,
        'spec:lodash/deep/Mod.mjs',
      );
      expect(blobUrl).toMatch(/^blob:/);
      expect(router.calls).toContain(`${PUBLIC_PATH}${p1.ref.location}`);
      expect(router.calls).not.toContain(`${PUBLIC_PATH}${p0.ref.location}`);
      expect(router.calls).toContain(`${PUBLIC_PATH}${p1.unitLocations[0]}`);
    } finally {
      minted.restore();
      registerSpy.mockRestore();
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});

describe('acceptance: R3-03 spec: token only for deps declaring a graphFile', () => {
  it('mints untouched for an undeclared package and for a dep without graphFile', async () => {
    const SRC =
      "const a = import('not-shared');\nconst b = import('no-graph');\nexport const r = 1;\n";
    const react = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: SRC }],
      'index.js',
      [],
    );
    const noGraph: MfManifestShared = {
      name: 'no-graph',
      version: '1.0.0',
      chunkPath: 'shared/no-graph.js',
      unwrapKey: null,
    };
    const manifest = buildManifest(
      [graphSharedDep('react', react), noGraph],
      { entryRoots: { './lifecycle': ['react'] } },
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: react.text },
      [`${PUBLIC_PATH}${react.unitLocations[0]}`]: { body: SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const minted = captureMintedSources();
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-r3-03'),
      ).resolves.toBeDefined();
      const sources = await minted.sources();
      const unitSource = sources.find((s) => s.includes('export const r'));
      expect(unitSource).toBeDefined();
      expect(unitSource).toContain("import('not-shared')");
      expect(unitSource).toContain("import('no-graph')");
      expect(unitSource).not.toContain('__frontx_lazy');
    } finally {
      minted.restore();
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});
