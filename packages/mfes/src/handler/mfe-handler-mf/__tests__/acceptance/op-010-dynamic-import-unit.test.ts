/**
 * Acceptance: OP-010 — a unit carrying a dynamic `import()` the runtime
 * can neither rewrite nor dependency-edge fails fast at minting with an
 * `MfeLoadError` naming the unit, instead of minting a blob that breaks
 * in the browser.
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

describe('acceptance: OP-010 dynamic import inside a unit fails fast', () => {
  it('OP-010: a unit source containing import() rejects the load with MfeLoadError', async () => {
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [
        {
          modulePaths: ['index.js'],
          source: "const p = import('./lazy.js');\nexport const r = 1;\n",
        },
      ],
      'index.js',
      [],
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: 'export default {};' },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
      [`${PUBLIC_PATH}${graph.unitLocations[0]}`]: {
        body: "const p = import('./lazy.js');\nexport const r = 1;\n",
      },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest([graphSharedDep('react', graph)]);
    try {
      const outcome = await handler
        .load(buildEntry(manifest), 'ext-op010')
        .then(() => null, (e: unknown) => e);
      expect(outcome).toBeInstanceOf(MfeLoadError);
      expect(String((outcome as Error).message)).toMatch(
        /dynamic import|import\(\)/i,
      );
    } finally {
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
