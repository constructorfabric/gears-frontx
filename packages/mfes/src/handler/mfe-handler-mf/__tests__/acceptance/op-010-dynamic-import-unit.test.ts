/**
 * Acceptance: OP-010 — a unit carrying a literal dynamic `import()` is
 * no longer rejected: the minter rewrites each resolvable literal call
 * to `__frontx_lazy('<unit-key>')`, mints the per-load loader stub, and
 * the ABI resolver fetches, verifies and mints the target unit on
 * demand, extending the load's unit maps. A non-literal `import(expr)`
 * mints untouched.
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
import {
  buildEntry,
  buildGraphFile,
  buildManifest,
  ENTRY_BASE_ID,
  graphSharedDep,
  PUBLIC_PATH,
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

describe('acceptance: OP-010 dynamic import() inside a unit resolves on demand', () => {
  it('a literal relative import() rewrites to __frontx_lazy and the sibling unit is fetched and minted on demand', async () => {
    const MAIN_SRC = "const p = import('./lazy.js');\nexport const r = 1;\n";
    const LAZY_SRC = 'export const lazy = 1;\n';
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [
        { modulePaths: ['index.js'], source: MAIN_SRC },
        { modulePaths: ['lazy.js'], source: LAZY_SRC },
      ],
      'index.js',
      [],
    );
    const manifest = buildManifest([graphSharedDep('react', graph)], {
      entryRoots: { './lifecycle': ['react'] },
    });
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
      [`${PUBLIC_PATH}${graph.unitLocations[0]}`]: { body: MAIN_SRC },
      [`${PUBLIC_PATH}${graph.unitLocations[1]}`]: { body: LAZY_SRC },
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
        handler.load(buildEntry(manifest), 'ext-op010-1'),
      ).resolves.toBeDefined();
      // The target unit is NOT fetched eagerly: only the dynamic call
      // reaching it pulls it in.
      expect(router.calls).not.toContain(
        `${PUBLIC_PATH}${graph.unitLocations[1]}`,
      );
      const sources = await minted.sources();
      const unitSource = sources.find((s) => s.includes('export const r'));
      expect(unitSource).toBeDefined();
      expect(unitSource).toContain('import{__frontx_lazy}from"blob:');
      expect(unitSource).toContain(
        '__frontx_lazy("unit:react@1.0.0@lazy.js")',
      );
      expect(unitSource).not.toContain("import('./lazy.js')");
      // A real resolve through the exposed ABI mints the target unit.
      expect(registerSpy).toHaveBeenCalled();
      const loaderId = registerSpy.mock.results[0].value as string;
      const blobUrl = await lazyGlobal().resolve(
        loaderId,
        'unit:react@1.0.0@lazy.js',
      );
      expect(blobUrl).toMatch(/^blob:/);
      expect(router.calls).toContain(
        `${PUBLIC_PATH}${graph.unitLocations[1]}`,
      );
      const after = await minted.sources();
      expect(
        after.some(
          (s) => s.includes('export const lazy') && s.length < 200,
        ),
      ).toBe(true);
    } finally {
      minted.restore();
      registerSpy.mockRestore();
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('a literal bare subpath import() resolves to the shared package unit on demand', async () => {
    const MAIN_SRC = "const p = import('lodash/fp');\nexport const r = 1;\n";
    const FP_SRC = 'export const fp = 1;\n';
    const react = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: MAIN_SRC }],
      'index.js',
      [],
    );
    const lodash = buildGraphFile(
      'lodash',
      '1.0.0',
      [{ modulePaths: ['fp/index.js'], source: FP_SRC }],
      'fp/index.js',
      [],
    );
    const manifest = buildManifest(
      [graphSharedDep('react', react), graphSharedDep('lodash', lodash)],
      { entryRoots: { './lifecycle': ['react'] } },
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: react.text },
      [`${PUBLIC_PATH}${react.unitLocations[0]}`]: { body: MAIN_SRC },
      [`${PUBLIC_PATH}shared/lodash.graph.json`]: { body: lodash.text },
      [`${PUBLIC_PATH}${lodash.unitLocations[0]}`]: { body: FP_SRC },
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
        handler.load(buildEntry(manifest), 'ext-op010-2'),
      ).resolves.toBeDefined();
      expect(router.calls).not.toContain(
        `${PUBLIC_PATH}${lodash.unitLocations[0]}`,
      );
      const sources = await minted.sources();
      const unitSource = sources.find((s) => s.includes('export const r'));
      // lodash's graph is outside the requires closure of the declared
      // roots: the dynamic import mints a lazy `spec:` token, and the
      // resolver fetches the package's graph and unit on demand.
      expect(unitSource).toContain(
        '__frontx_lazy("spec:lodash/fp")',
      );
      const loaderId = registerSpy.mock.results[0].value as string;
      const blobUrl = await lazyGlobal().resolve(
        loaderId,
        'spec:lodash/fp',
      );
      expect(blobUrl).toMatch(/^blob:/);
      expect(router.calls).toContain(
        `${PUBLIC_PATH}shared/lodash.graph.json`,
      );
      expect(router.calls).toContain(
        `${PUBLIC_PATH}${lodash.unitLocations[0]}`,
      );
    } finally {
      minted.restore();
      registerSpy.mockRestore();
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('a non-literal import(expr) mints untouched', async () => {
    const SRC =
      "const v = './lazy.js';\nconst p = import(v);\nexport const r = 1;\n";
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: SRC }],
      'index.js',
      [],
    );
    const manifest = buildManifest([graphSharedDep('react', graph)]);
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
      [`${PUBLIC_PATH}${graph.unitLocations[0]}`]: { body: SRC },
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
        handler.load(buildEntry(manifest), 'ext-op010-3'),
      ).resolves.toBeDefined();
      const sources = await minted.sources();
      const unitSource = sources.find((s) => s.includes('export const r'));
      expect(unitSource).toContain('import(v)');
      expect(unitSource).not.toContain('__frontx_lazy');
    } finally {
      minted.restore();
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('import() inside strings, comments and regex literals is not rewritten', async () => {
    const SRC =
      'const s = "import(\'./x.js\')";\n' +
      '// import(\'./y.js\')\n' +
      '/* import(\'./z.js\') */\n' +
      'const r = /import\\(/;\n' +
      'const t = `import(\'./t.js\')`;\n' +
      'export const x = 1;\n';
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: SRC }],
      'index.js',
      [],
    );
    const manifest = buildManifest([graphSharedDep('react', graph)]);
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
      [`${PUBLIC_PATH}${graph.unitLocations[0]}`]: { body: SRC },
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
        handler.load(buildEntry(manifest), 'ext-op010-4'),
      ).resolves.toBeDefined();
      const sources = await minted.sources();
      const unitSource = sources.find((s) => s.includes('export const x'));
      expect(unitSource).not.toContain('__frontx_lazy');
      expect(unitSource).toContain("import('./x.js')");
    } finally {
      minted.restore();
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('two concurrent resolves of different tokens reaching the same unit mint it once from one fetch', async () => {
    const MAIN_SRC =
      "const a = import('./a.js');\nconst b = import('./b.js');\nexport const r = 1;\n";
    const A_SRC = "import { c } from './c.js';\nexport const a = c;\n";
    const B_SRC = "import { c } from './c.js';\nexport const b = c;\n";
    const C_SRC = 'export const c = 42;\n';
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [
        { modulePaths: ['index.js'], source: MAIN_SRC },
        { modulePaths: ['a.js'], source: A_SRC, relativeImports: ['./c.js'] },
        { modulePaths: ['b.js'], source: B_SRC, relativeImports: ['./c.js'] },
        { modulePaths: ['c.js'], source: C_SRC },
      ],
      'index.js',
      [],
    );
    const manifest = buildManifest([graphSharedDep('react', graph)], {
      entryRoots: { './lifecycle': ['react'] },
    });
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
      [`${PUBLIC_PATH}${graph.unitLocations[0]}`]: { body: MAIN_SRC },
      [`${PUBLIC_PATH}${graph.unitLocations[1]}`]: { body: A_SRC, delayMs: 5 },
      [`${PUBLIC_PATH}${graph.unitLocations[2]}`]: { body: B_SRC },
      [`${PUBLIC_PATH}${graph.unitLocations[3]}`]: { body: C_SRC, delayMs: 10 },
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
        handler.load(buildEntry(manifest), 'ext-op010-6'),
      ).resolves.toBeDefined();
      const loaderId = registerSpy.mock.results[0].value as string;
      const [aUrl, bUrl] = await Promise.all([
        lazyGlobal().resolve(loaderId, 'unit:react@1.0.0@a.js'),
        lazyGlobal().resolve(loaderId, 'unit:react@1.0.0@b.js'),
      ]);
      expect(aUrl).toMatch(/^blob:/);
      expect(bUrl).toMatch(/^blob:/);
      expect(aUrl).not.toBe(bUrl);
      const cLocation = `${PUBLIC_PATH}${graph.unitLocations[3]}`;
      expect(router.calls.filter((u) => u === cLocation)).toHaveLength(1);
      const sources = await minted.sources();
      expect(sources.filter((s) => s === C_SRC)).toHaveLength(1);
      // Both importers rewrite './c.js' to the SAME blob URL.
      const importerOf = (marker: string): string =>
        sources.find((s) => s.includes(marker)) as string;
      const cRef = (s: string): string | undefined =>
        /from\s*["'](blob:[^"']+)["']/.exec(s)?.[1];
      expect(cRef(importerOf('export const a'))).toBeDefined();
      expect(cRef(importerOf('export const a'))).toBe(
        cRef(importerOf('export const b')),
      );
    } finally {
      minted.restore();
      registerSpy.mockRestore();
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('a dynamic import into a pack-delivered package resolves to the pack blob', async () => {
    const MAIN_SRC = "const p = import('lodash');\nexport const r = 1;\n";
    const LODASH_SRC = 'export const l = 1;\n';
    const PACK_SRC = 'module.exports = { l: 1 }; // cjs pack\n';
    const react = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: MAIN_SRC }],
      'index.js',
      [],
    );
    const lodash = buildGraphFile(
      'lodash',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: LODASH_SRC }],
      'index.js',
      [],
      PACK_SRC,
    );
    const manifest = buildManifest(
      [graphSharedDep('react', react), graphSharedDep('lodash', lodash)],
      { entryRoots: { './lifecycle': ['react'] } },
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: react.text },
      [`${PUBLIC_PATH}${react.unitLocations[0]}`]: { body: MAIN_SRC },
      [`${PUBLIC_PATH}shared/lodash.graph.json`]: { body: lodash.text },
      [`${PUBLIC_PATH}${lodash.unitLocations[0]}`]: { body: LODASH_SRC },
      [`${PUBLIC_PATH}${lodash.packLocation}`]: { body: PACK_SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const registerSpy = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    const minted = captureMintedSources();
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, {
      retries: 0,
      packFallbackBudgetMs: 0,
    } as ConstructorParameters<typeof MfeHandlerMF>[1]);
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-op010-7'),
      ).resolves.toBeDefined();
      const loaderId = registerSpy.mock.results[0].value as string;
      // lodash's graph is fetched on demand when the `spec:` token
      // resolves; the pack delivers the package.
      const blobUrl = await lazyGlobal().resolve(
        loaderId,
        'spec:lodash',
      );
      expect(blobUrl).toMatch(/^blob:/);
      expect(router.calls).toContain(`${PUBLIC_PATH}${lodash.packLocation}`);
      expect(router.calls).not.toContain(
        `${PUBLIC_PATH}${lodash.unitLocations[0]}`,
      );
      // A repeat resolve answers from the minted pack with no new fetch.
      const callsBefore = router.calls.length;
      await expect(
        lazyGlobal().resolve(loaderId, 'spec:lodash'),
      ).resolves.toBe(blobUrl);
      expect(
        router.calls
          .slice(callsBefore)
          .filter((u) => u.endsWith(String(lodash.packLocation))),
      ).toHaveLength(0);
      const sources = await minted.sources();
      expect(sources.filter((s) => s === PACK_SRC)).toHaveLength(1);
    } finally {
      minted.restore();
      registerSpy.mockRestore();
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('import.meta is not a dynamic import', async () => {
    const SRC = 'const u = import.meta.url;\nexport const x = 1;\n';
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: SRC }],
      'index.js',
      [],
    );
    const manifest = buildManifest([graphSharedDep('react', graph)]);
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
      [`${PUBLIC_PATH}${graph.unitLocations[0]}`]: { body: SRC },
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
        handler.load(buildEntry(manifest), 'ext-op010-5'),
      ).resolves.toBeDefined();
      const sources = await minted.sources();
      const unitSource = sources.find((s) => s.includes('export const x'));
      expect(unitSource).toContain('import.meta.url');
      expect(unitSource).not.toContain('__frontx_lazy');
    } finally {
      minted.restore();
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});
