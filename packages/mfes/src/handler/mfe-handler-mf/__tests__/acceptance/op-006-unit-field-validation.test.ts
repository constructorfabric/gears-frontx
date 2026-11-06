/**
 * Acceptance: OP-006 — per-unit fields and root array elements are checked
 * at the point of use: a malformed `modulePaths` (unit field or root
 * element) surfaces as `MfeLoadError` naming the graph file and the
 * producer, never a raw `TypeError`.
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
  sha256Hex,
} from '../helpers/manifest-builder';
import { createFetchRouter } from '../helpers/fetch-router';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';
import type { MfManifest } from '../../../../manifest/mf-manifest';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

const PRODUCER = { name: 'unit-fields-producer', version: '2.0.0' };

function corruptUnit(graphText: string): string {
  return graphText.replace('"modulePaths":["index.js"]', '"modulePaths":7');
}

describe('acceptance: OP-006 point-of-use field validation', () => {
  it('OP-006: a unit with a malformed modulePaths field fails with MfeLoadError naming the graph file and producer', async () => {
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: 'export const r = 1;\n' }],
      'index.js',
      [],
      undefined,
      { producer: PRODUCER },
    );
    const bad = corruptUnit(graph.text);
    const dep = {
      ...graphSharedDep('react', graph),
      graphFile: {
        location: 'shared/react.graph.json',
        contentHash: sha256Hex(bad),
      },
    };
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: 'export default {};' },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: bad },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest([dep], {
      entryRoots: { './lifecycle': ['react'] },
    });
    try {
      const outcome = await handler
        .load(buildEntry(manifest), 'ext-op006')
        .then(() => null, (e: unknown) => e);
      expect(outcome).toBeInstanceOf(MfeLoadError);
      expect(String((outcome as Error).message)).toMatch(/react\.graph/);
      expect(String((outcome as Error).message)).toMatch(
        /unit-fields-producer/,
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('OP-006: a root element with a malformed modulePaths field fails with MfeLoadError, not a raw TypeError', async () => {
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: 'export const r = 1;\n' }],
      'index.js',
      [],
    );
    const manifest: MfManifest = buildManifest(
      [graphSharedDep('react', graph)],
      {
        entryRoots: {
          './lifecycle': [
            { name: 'react', version: '1.0.0', modulePaths: 42 as unknown as string[] },
          ],
        },
      },
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: 'export default {};' },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    try {
      const outcome = await handler
        .load(buildEntry(manifest), 'ext-op006-roots')
        .then(() => null, (e: unknown) => e);
      expect(outcome).toBeInstanceOf(MfeLoadError);
      expect(String((outcome as Error).message)).toMatch(/modulePaths/);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
