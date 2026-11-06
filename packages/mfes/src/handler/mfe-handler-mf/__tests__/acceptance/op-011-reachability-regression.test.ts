/**
 * Acceptance: OP-011 — reachability over a longer unit chain stays
 * correct after the linear `unitForModulePath` scans are replaced by a
 * per-graph module-path index: every unit of a 60-deep relative-import
 * chain is still reached, fetched, and minted.
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

describe('acceptance: OP-011 reachability index regression', () => {
  it('OP-011: a 60-unit relative-import chain reaches, fetches and mints every unit', async () => {
    const DEPTH = 60;
    const units = Array.from({ length: DEPTH }, (_, i) => ({
      modulePaths: [`m${i}.js`],
      relativeImports: i < DEPTH - 1 ? [`./m${i + 1}.js`] : [],
      source:
        i < DEPTH - 1
          ? `import './m${i + 1}.js';\nexport const v${i} = ${i};\n`
          : `export const v${i} = ${i};\n`,
    }));
    const graph = buildGraphFile('chain-pkg', '1.0.0', units, 'm0.js', []);
    const routes: Record<string, { body: string }> = {
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "chain-pkg";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/chain-pkg.graph.json`]: { body: graph.text },
    };
    graph.unitLocations.forEach((loc, i) => {
      routes[`${PUBLIC_PATH}${loc}`] = { body: units[i].source };
    });
    const router = createFetchRouter(routes);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest([graphSharedDep('chain-pkg', graph)], {
      entryRoots: { './lifecycle': ['chain-pkg'] },
    });
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-op011'),
      ).resolves.toBeDefined();
      for (const loc of graph.unitLocations) {
        expect(router.calls).toContain(`${PUBLIC_PATH}${loc}`);
      }
    } finally {
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});
