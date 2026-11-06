/**
 * Acceptance: OP-008 — the requires-closure `MfeLoadError` names the
 * graph file and producer behind each unmet requirement, not just the
 * package names.
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

describe('acceptance: OP-008 requires-closure error names file and producer', () => {
  it('OP-008: a missing requires entry fails naming the graph file location and producer', async () => {
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: 'export const r = 1;\n' }],
      'index.js',
      ['lodash'],
      undefined,
      { producer: { name: 'closure-producer', version: '3.1.0' } },
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: 'export default {};' },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest([graphSharedDep('react', graph)]);
    try {
      const outcome = await handler
        .load(buildEntry(manifest), 'ext-op008')
        .then(() => null, (e: unknown) => e);
      expect(outcome).toBeInstanceOf(MfeLoadError);
      const message = String((outcome as Error).message);
      expect(message).toMatch(/'lodash'/);
      expect(message).toMatch(/react\.graph/);
      expect(message).toMatch(/closure-producer@3\.1\.0/);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
