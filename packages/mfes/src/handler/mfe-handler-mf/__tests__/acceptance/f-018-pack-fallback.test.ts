/**
 * Acceptance: F-018 — pack fallback is decided per package BEFORE that
 * package's unit text is fetched on the attempt (never paying a failed
 * unit round), and a pack importing an unreached package does not
 * produce a false circular error.
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
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

const BUDGET_ZERO = {
  retries: 0,
  packFallbackBudgetMs: 0,
} as ConstructorParameters<typeof MfeHandlerMF>[1];

describe('acceptance: F-018 pack fallback decision', () => {
  it('F-018: with the budget exceeded the pack is fetched and no unit URL of that package is requested on the attempt', async () => {
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
        handler.load(buildEntry(manifest), 'ext-f018'),
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

  it('F-018: a pack whose bareImports name a package no root reaches is not a circular error', async () => {
    const PACK_SRC = 'import "left-pad";\nexport const r = 1;\n';
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: 'export const r = 1;\n' }],
      'index.js',
      [],
      PACK_SRC,
    );
    // The pack imports 'left-pad', which exists in shared[] but is
    // reached by no declared root — target: not a circular error.
    const leftPad = buildGraphFile(
      'left-pad',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: 'export const p = 1;\n' }],
      'index.js',
      [],
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
      [`${PUBLIC_PATH}shared/left-pad.graph.json`]: { body: leftPad.text },
      [`${PUBLIC_PATH}${graph.packLocation}`]: { body: PACK_SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, BUDGET_ZERO);
    const manifest = buildManifest(
      [graphSharedDep('react', graph), graphSharedDep('left-pad', leftPad)],
      { entryRoots: { './lifecycle': ['react'] } },
    );
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-f018-circular'),
      ).resolves.toBeDefined();
    } finally {
      fetchSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});
