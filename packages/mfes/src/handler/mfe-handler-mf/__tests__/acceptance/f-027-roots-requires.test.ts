/**
 * Acceptance: F-027 — requires closure is checked even when no roots are
 * declared (fetch-all fallback must not skip the closure check), and an
 * explicit empty root set means an empty reachable set.
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

describe('acceptance: F-027 roots and requires on the fetch-all path', () => {
  it('F-027: requires closure is checked even when no entryRoots are declared — a missing package fails the load', async () => {
    const SRC = 'import "left-pad";\nexport const r = 1;\n';
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [
        {
          modulePaths: ['index.js'],
          bareImports: ['left-pad'],
          source: SRC,
        },
      ],
      'index.js',
      ['left-pad'],
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
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    // No entryRoots at all — the fetch-all path still owes the closure
    // check: 'left-pad' is required but absent from shared[].
    const manifest = buildManifest([graphSharedDep('react', graph)]);
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-f027'),
      ).rejects.toThrow(MfeLoadError);
      await expect(
        handler.load(buildEntry(manifest), 'ext-f027-b'),
      ).rejects.toThrow(/left-pad/);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('F-027: an explicitly empty entryRoots list reaches no units of that package', async () => {
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: 'export const r = 1;\n' }],
      'index.js',
      [],
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'export default {};',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
      [`${PUBLIC_PATH}${graph.unitLocations[0]}`]: {
        body: 'export const r = 1;\n',
      },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest([graphSharedDep('react', graph)], {
      entryRoots: { './lifecycle': [] },
    });
    try {
      await handler
        .load(buildEntry(manifest), 'ext-f027-empty')
        .catch(() => undefined);
      expect(
        router.calls.filter((u) => u.endsWith(graph.unitLocations[0])),
        'an explicit empty root set reaches zero units',
      ).toEqual([]);
    } finally {
      fetchSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});
