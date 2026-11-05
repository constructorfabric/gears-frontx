/**
 * Acceptance: P13-C — pack fallback covers every entry point the consumer
 * imports, not only the package's main entry. The pack is the main entry
 * bundled whole and answers the package name alone; before the fix a
 * package delivered by its pack delivered nothing else, so an imported
 * subpath (`react-dom/client`) was left as a bare specifier no minted
 * reference answered.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  stubbedDynamicModuleOps,
  stubSuccessfulImport,
} from '../helpers/blob-module-stub';

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
import {
  buildEntry,
  buildGraphFile,
  buildManifest,
  ENTRY_BASE_ID,
  graphSharedDep,
  PUBLIC_PATH,
} from '../helpers/manifest-builder';
import { createFetchRouter } from '../helpers/fetch-router';
import {
  captureMintedSources,
  unmintedSpecifiers,
} from '../helpers/minted-sources';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

const BUDGET_ZERO = {
  retries: 0,
  packFallbackBudgetMs: 0,
} as ConstructorParameters<typeof MfeHandlerMF>[1];

const LIFECYCLE_SRC =
  'import { version } from "dom";\nimport { createRoot } from "dom/client";\nexport default { version, createRoot };';

describe('acceptance: P13-C pack fallback covers every imported entry', () => {
  it('P13-C: a package delivered by its pack also delivers the subpath entry unit the consumer imports, minted after the pack it imports', async () => {
    // CommonJS-shaped output: the subpath entry is bundled on its own and
    // imports the package by name (no relative imports).
    const MAIN_SRC = 'export const version = "unit";\n';
    const PACK_SRC = 'export const version = "pack";\n';
    const CLIENT_SRC =
      'import { version } from "dom";\nexport const createRoot = version;\n';
    const dom = buildGraphFile(
      'dom',
      '1.0.0',
      [
        { modulePaths: ['cjs/dom.js', 'index.js'], source: MAIN_SRC },
        {
          modulePaths: ['cjs/dom-client.js', 'client.js'],
          bareImports: ['dom'],
          bareSpecifiers: ['dom'],
          source: CLIENT_SRC,
        },
      ],
      'index.js',
      ['dom'],
      PACK_SRC,
      { entryModulePaths: { '.': 'index.js', './client': 'client.js' } },
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: LIFECYCLE_SRC },
      [`${PUBLIC_PATH}shared/dom.graph.json`]: { body: dom.text },
      [`${PUBLIC_PATH}${dom.unitLocations[0]}`]: { body: MAIN_SRC },
      [`${PUBLIC_PATH}${dom.unitLocations[1]}`]: { body: CLIENT_SRC },
      [`${PUBLIC_PATH}${dom.packLocation}`]: { body: PACK_SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const minted = captureMintedSources();
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, BUDGET_ZERO);
    const manifest = buildManifest([graphSharedDep('dom', dom)], {
      entryRoots: {
        './lifecycle': ['dom', { name: 'dom', version: '1.0.0', modulePaths: ['client.js'] }],
      },
    });
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-p13c-companion'),
      ).resolves.toBeDefined();
      expect(router.calls).toContain(`${PUBLIC_PATH}${dom.packLocation}`);
      expect(router.calls).toContain(`${PUBLIC_PATH}${dom.unitLocations[1]}`);
      // The pack answers the package name; its main unit is not fetched.
      expect(router.calls).not.toContain(`${PUBLIC_PATH}${dom.unitLocations[0]}`);
      const sources = await minted.sources();
      const lifecycle = sources.find((s) => s.includes('export default'));
      const client = sources.find((s) => s.includes('export const createRoot'));
      expect(lifecycle).toBeDefined();
      expect(client).toBeDefined();
      expect(unmintedSpecifiers(lifecycle as string)).toEqual([]);
      expect(unmintedSpecifiers(client as string)).toEqual([]);
      // Leaves first: the pack the client entry imports is minted before it.
      expect(sources.indexOf(PACK_SRC)).toBeGreaterThanOrEqual(0);
      expect(sources.indexOf(PACK_SRC)).toBeLessThan(sources.indexOf(client as string));
    } finally {
      minted.restore();
      fetchSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('P13-C: a package whose imported subpath entry shares modules with the pack keeps its units, so every imported entry is still answered', async () => {
    // ESM-shaped output: both entries import a shared module by relative
    // path. Delivering the pack beside the subpath's units would
    // instantiate that module twice.
    const MAIN_SRC = 'import "./shared.js";\nexport const version = 1;\n';
    const SHARED_SRC = 'export const shared = 1;\n';
    const CLIENT_SRC = 'import "./shared.js";\nexport const createRoot = 1;\n';
    const PACK_SRC = 'export const version = "pack";\n';
    const dom = buildGraphFile(
      'dom',
      '1.0.0',
      [
        { modulePaths: ['index.js'], relativeImports: ['./shared.js'], source: MAIN_SRC },
        { modulePaths: ['shared.js'], source: SHARED_SRC },
        { modulePaths: ['client.js'], relativeImports: ['./shared.js'], source: CLIENT_SRC },
      ],
      'index.js',
      [],
      PACK_SRC,
      { entryModulePaths: { '.': 'index.js', './client': 'client.js' } },
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: LIFECYCLE_SRC },
      [`${PUBLIC_PATH}shared/dom.graph.json`]: { body: dom.text },
      [`${PUBLIC_PATH}${dom.unitLocations[0]}`]: { body: MAIN_SRC },
      [`${PUBLIC_PATH}${dom.unitLocations[1]}`]: { body: SHARED_SRC },
      [`${PUBLIC_PATH}${dom.unitLocations[2]}`]: { body: CLIENT_SRC },
      [`${PUBLIC_PATH}${dom.packLocation}`]: { body: PACK_SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const minted = captureMintedSources();
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, BUDGET_ZERO);
    const manifest = buildManifest([graphSharedDep('dom', dom)], {
      entryRoots: {
        './lifecycle': ['dom', { name: 'dom', version: '1.0.0', modulePaths: ['client.js'] }],
      },
    });
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-p13c-units'),
      ).resolves.toBeDefined();
      expect(router.calls).not.toContain(`${PUBLIC_PATH}${dom.packLocation}`);
      for (const location of dom.unitLocations) {
        expect(router.calls).toContain(`${PUBLIC_PATH}${location}`);
      }
      const lifecycle = (await minted.sources()).find((s) =>
        s.includes('export default'),
      );
      expect(lifecycle).toBeDefined();
      expect(unmintedSpecifiers(lifecycle as string)).toEqual([]);
    } finally {
      minted.restore();
      fetchSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});
