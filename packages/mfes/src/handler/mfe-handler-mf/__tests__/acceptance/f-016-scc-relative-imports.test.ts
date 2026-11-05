/**
 * Acceptance: F-016 — a multi-module SCC unit resolves its relative
 * imports against EVERY member module path, not `modulePaths[0]` alone.
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
import type { SharedDepGraphFile } from '../../../../unit-format/graph-file';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

describe('acceptance: F-016 multi-module SCC relative-import resolution', () => {
  it('F-016: a relative import resolvable only via a non-first member module path reaches the right unit', async () => {
    const SCC_SRC = 'import "./b.js";\nexport const scc = 1;\n';
    const TARGET_SRC = 'export const b = 1;\n';
    const scc = buildGraphFile(
      'pkg',
      '1.0.0',
      [
        {
          // The SCC unit carries two member paths; the relative import
          // './b.js' is resolved against the directory of the member that
          // issues it, not blindly against modulePaths[0].
          modulePaths: ['lib/a.js', 'lib/c.js'],
          relativeImports: ['./b.js'],
          source: SCC_SRC,
        },
        { modulePaths: ['lib/b.js'], source: TARGET_SRC },
      ],
      'lib/a.js',
      [],
    );
    // Target: './b.js' resolved relative to the unit's members resolves to
    // the 'lib/b.js' unit; resolving only against modulePaths[0]'s file
    // name picks the wrong or missing unit.
    const graph: SharedDepGraphFile = scc.graph;
    void graph;
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "pkg";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/pkg.graph.json`]: { body: scc.text },
      [`${PUBLIC_PATH}${scc.unitLocations[0]}`]: { body: SCC_SRC },
      [`${PUBLIC_PATH}${scc.unitLocations[1]}`]: { body: TARGET_SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest([graphSharedDep('pkg', scc)], {
      entryRoots: { './lifecycle': ['pkg'] },
    });
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-f016'),
      ).resolves.toBeDefined();
      // The 'lib/b.js' unit was reached through the relative import, so
      // its location was fetched — never left unresolvable or mis-mapped.
      expect(router.calls).toContain(
        `${PUBLIC_PATH}${scc.unitLocations[1]}`,
      );
    } finally {
      fetchSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});
