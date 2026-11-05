/**
 * Ported salvage suite: whole-package pack fallback.
 *
 * Covers `inst-md-pack-fallback` (issue #718). Ported from
 * `salvage/issue-718-impl-20261105:.../MfeHandlerMF.pack-fallback.test.ts`
 * onto the shared helpers and the `./unit-format` graph shapes.
 *
 * Asserts TARGET behaviour and currently FAILS — phase 8 drives it green.
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
import { MfeLoadError } from '../../../../errors';
import {
  buildEntry,
  buildGraphFile,
  buildManifest,
  ENTRY_BASE_ID,
  graphSharedDep,
  PUBLIC_PATH,
} from '../helpers/manifest-builder';
import { createFetchRouter } from '../helpers/fetch-router';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

const BUDGET_ZERO = {
  retries: 0,
  packFallbackBudgetMs: 0,
} as ConstructorParameters<typeof MfeHandlerMF>[1];

describe('acceptance: ported pack-fallback', () => {
  it('uses per-unit fetching and never fetches the pack under the default (unconfigured) budget', async () => {
    const SRC = 'export const r = 1;\n';
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: SRC }],
      'index.js',
      [],
      'export const r = 1; // pack\n',
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
      [`${PUBLIC_PATH}${graph.unitLocations[0]}`]: { body: SRC },
      [`${PUBLIC_PATH}${graph.packLocation}`]: {
        body: 'export const r = 1; // pack\n',
      },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest([graphSharedDep('react', graph)], {
      entryRoots: { './lifecycle': ['react'] },
    });
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-pack-default'),
      ).resolves.toBeDefined();
      expect(router.calls).not.toContain(
        `${PUBLIC_PATH}${graph.packLocation}`,
      );
    } finally {
      fetchSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('fetches and verifies the pack and mints one reference when the budget is exceeded and a pack is declared', async () => {
    const PACK_SRC = 'export const r = 1; // pack\n';
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: 'export const r = 1;\n' }],
      'index.js',
      [],
      PACK_SRC,
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
      [`${PUBLIC_PATH}${graph.unitLocations[0]}`]: {
        body: 'export const r = 1;\n',
      },
      [`${PUBLIC_PATH}${graph.packLocation}`]: { body: PACK_SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, BUDGET_ZERO);
    const manifest = buildManifest([graphSharedDep('react', graph)], {
      entryRoots: { './lifecycle': ['react'] },
    });
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-pack-fallback'),
      ).resolves.toBeDefined();
      expect(router.calls).toContain(`${PUBLIC_PATH}${graph.packLocation}`);
      expect(router.calls).not.toContain(
        `${PUBLIC_PATH}${graph.unitLocations[0]}`,
      );
    } finally {
      fetchSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('keeps per-unit references when the budget is exceeded but no pack is declared', async () => {
    const SRC = 'export const r = 1;\n';
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: SRC }],
      'index.js',
      [],
    );
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
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, BUDGET_ZERO);
    const manifest = buildManifest([graphSharedDep('react', graph)], {
      entryRoots: { './lifecycle': ['react'] },
    });
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-pack-nopack'),
      ).resolves.toBeDefined();
      expect(router.calls).toContain(
        `${PUBLIC_PATH}${graph.unitLocations[0]}`,
      );
    } finally {
      fetchSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('fails the load with an MfeLoadError when the pack fails content-identity verification', async () => {
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: 'export const r = 1;\n' }],
      'index.js',
      [],
      'export const r = 1; // pack\n',
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
      [`${PUBLIC_PATH}${graph.packLocation}`]: {
        body: 'export const WRONG = 1;\n',
      },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, BUDGET_ZERO);
    const manifest = buildManifest([graphSharedDep('react', graph)], {
      entryRoots: { './lifecycle': ['react'] },
    });
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-pack-bad-hash'),
      ).rejects.toThrow(MfeLoadError);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('falls back per package: only the pack-declaring package is delivered by its pack', async () => {
    const PACK_SRC = 'export const r = 1; // pack\n';
    const react = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: 'export const r = 1;\n' }],
      'index.js',
      [],
      PACK_SRC,
    );
    const REACT_DOM_SRC = 'import "react";\nexport const d = 1;\n';
    const reactDom = buildGraphFile(
      'react-dom',
      '1.0.0',
      [
        {
          modulePaths: ['index.js'],
          bareImports: ['react'],
          source: REACT_DOM_SRC,
        },
      ],
      'index.js',
      ['react'],
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react-dom";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: react.text },
      [`${PUBLIC_PATH}shared/react-dom.graph.json`]: { body: reactDom.text },
      [`${PUBLIC_PATH}${react.packLocation}`]: { body: PACK_SRC },
      [`${PUBLIC_PATH}${reactDom.unitLocations[0]}`]: { body: REACT_DOM_SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, BUDGET_ZERO);
    const manifest = buildManifest(
      [graphSharedDep('react', react), graphSharedDep('react-dom', reactDom)],
      { entryRoots: { './lifecycle': ['react-dom'] } },
    );
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-pack-perpkg'),
      ).resolves.toBeDefined();
      expect(router.calls).toContain(`${PUBLIC_PATH}${react.packLocation}`);
      expect(router.calls).toContain(
        `${PUBLIC_PATH}${reactDom.unitLocations[0]}`,
      );
    } finally {
      fetchSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});
