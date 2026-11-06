/**
 * Acceptance: OP-009 — shared-file locations (graph file, unit, pack)
 * and `metaData.sharedBase` are validated by the same rules as
 * `chunkPath`: protocol-relative `//host`, non-http(s) schemes, and `..`
 * escapes out of the asset base fail the load with `MfeLoadError` before
 * any fetch.
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
import type { MfManifest } from '../../../../manifest/mf-manifest';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

const SRC = 'export const r = 1;\n';

function reactGraph(): ReturnType<typeof buildGraphFile> {
  return buildGraphFile(
    'react',
    '1.0.0',
    [{ modulePaths: ['index.js'], source: SRC }],
    'index.js',
    [],
  );
}

async function expectRejected(manifest: MfManifest): Promise<unknown> {
  const graph = reactGraph();
  const router = createFetchRouter({
    [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: 'export default {};' },
    [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
    [`${PUBLIC_PATH}${graph.unitLocations[0]}`]: { body: SRC },
  });
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(router as typeof fetch);
  const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
  try {
    const outcome = await handler
      .load(buildEntry(manifest), 'ext-op009')
      .then(() => null, (e: unknown) => e);
    expect(outcome).toBeInstanceOf(MfeLoadError);
    return outcome;
  } finally {
    fetchSpy.mockRestore();
  }
}

describe('acceptance: OP-009 shared-file location validation', () => {
  it('OP-009: a protocol-relative graphFile location fails the load', async () => {
    const graph = reactGraph();
    const dep = {
      ...graphSharedDep('react', graph),
      graphFile: {
        location: '//evil.example.com/react.graph.json',
        contentHash: graph.hash,
      },
    };
    await expectRejected(buildManifest([dep]));
  });

  it('OP-009: a graphFile location climbing out of the asset base fails the load', async () => {
    const graph = reactGraph();
    const dep = {
      ...graphSharedDep('react', graph),
      graphFile: {
        location: '../escape/react.graph.json',
        contentHash: graph.hash,
      },
    };
    await expectRejected(buildManifest([dep]));
  });

  it('OP-009: a non-http(s) sharedBase fails the load', async () => {
    const graph = reactGraph();
    const manifest = buildManifest([graphSharedDep('react', graph)], {
      metaData: { sharedBase: 'javascript:alert(1)' },
    });
    await expectRejected(manifest);
  });
});
