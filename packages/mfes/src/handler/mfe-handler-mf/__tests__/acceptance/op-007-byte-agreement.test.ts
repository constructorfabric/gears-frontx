/**
 * Acceptance: OP-007 — byte-agreement diagnostics key on `name@version`,
 * not on the content hash: two manifests declaring the same name@version
 * with DIFFERENT bytes get a conflict warning (previously silent), and
 * the agreement warning dedups per manifest pair.
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
import type { MfManifest } from '../../../../manifest/mf-manifest';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

const SRC = 'export const r = 1;\n';

function reactGraph(source = SRC): ReturnType<typeof buildGraphFile> {
  return buildGraphFile(
    'react',
    '1.0.0',
    [{ modulePaths: ['index.js'], source }],
    'index.js',
    [],
  );
}

function manifestWithId(id: string, dep: ReturnType<typeof graphSharedDep>): MfManifest {
  const m = buildManifest([dep]);
  return { ...m, id };
}

describe('acceptance: OP-007 byte-agreement keyed by name@version', () => {
  it('OP-007: conflicting bytes for the same name@version emit a conflict warning naming the dep', async () => {
    const graphA = reactGraph('export const r = 1;\n');
    const graphB = reactGraph('export const r = 2;\n');
    const depA = graphSharedDep('react', graphA);
    const depB = {
      ...graphSharedDep('react', graphB),
      graphFile: {
        location: 'shared/react-b.graph.json',
        contentHash: graphB.hash,
      },
    };
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: 'export default {};' },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graphA.text },
      [`${PUBLIC_PATH}shared/react-b.graph.json`]: { body: graphB.text },
      [`${PUBLIC_PATH}${graphA.unitLocations[0]}`]: { body: SRC },
      [`${PUBLIC_PATH}${graphB.unitLocations[0]}`]: {
        body: 'export const r = 2;\n',
      },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    try {
      await handler.load(
        buildEntry(manifestWithId('m.a', depA)),
        'ext-op007-a',
      );
      warnSpy.mockClear();
      await handler.load(
        buildEntry(manifestWithId('m.b', depB)),
        'ext-op007-b',
      );
      const messages = warnSpy.mock.calls.map((c) => String(c[0]));
      expect(
        messages.some(
          (m) => /react@1\.0\.0/.test(m) && /conflict|differ/i.test(m),
        ),
      ).toBe(true);
    } finally {
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('OP-007: identical bytes under a second manifest warn once per manifest pair', async () => {
    const graph = reactGraph();
    const dep = graphSharedDep('react', graph);
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: 'export default {};' },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
      [`${PUBLIC_PATH}${graph.unitLocations[0]}`]: { body: SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    try {
      await handler.load(buildEntry(manifestWithId('m.a', dep)), 'ext-p1');
      await handler.load(buildEntry(manifestWithId('m.b', dep)), 'ext-p2');
      const agreements = warnSpy.mock.calls.filter((c) =>
        /byte-agreement/.test(String(c[0])),
      );
      expect(agreements.length).toBe(1);
      // A repeat of the same pair stays deduplicated.
      await handler.load(buildEntry(manifestWithId('m.b', dep)), 'ext-p3');
      const after = warnSpy.mock.calls.filter((c) =>
        /byte-agreement/.test(String(c[0])),
      );
      expect(after.length).toBe(1);
    } finally {
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});
