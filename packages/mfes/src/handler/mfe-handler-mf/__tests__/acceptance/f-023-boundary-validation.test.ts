/**
 * Acceptance: F-023 — boundary validation gaps: malformed roots/requires
 * fields and inline-manifest paths must surface `MfeLoadError` naming the
 * field (and the manifest), never raw `TypeError`/`SyntaxError`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    stubbedDynamicModuleOps,
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
  sha256Hex,
} from '../helpers/manifest-builder';
import { createFetchRouter } from '../helpers/fetch-router';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';
import type { MfManifest } from '../../../../manifest/mf-manifest';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

describe('acceptance: F-023 boundary validation', () => {
  it('F-023: a malformed requires field on a fetched graph file fails with MfeLoadError naming the field, not a raw TypeError', async () => {
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: 'export const r = 1;\n' }],
      'index.js',
      [],
    );
    // Corrupt the serialized document: requires as a bare string.
    const bad = graph.text.replace('"units"', '"requires":"react","units"');
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: 'export default {};' },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: bad },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    // The content hash must match the tampered text so the failure under
    // test is the malformed field, not an integrity mismatch.
    const dep = {
      ...graphSharedDep('react', graph),
      graphFile: { location: 'shared/react.graph.json', contentHash: '' },
    };
    dep.graphFile = {
      location: 'shared/react.graph.json',
      contentHash: sha256Hex(bad),
    };
    const manifest = buildManifest([dep]);
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-f023-requires'),
      ).rejects.toThrow(MfeLoadError);
      await expect(
        handler.load(buildEntry(manifest), 'ext-f023-requires-2'),
      ).rejects.toThrow(/requires/);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('F-023: an inline manifest carrying malformed roots fields fails with MfeLoadError, never a raw TypeError or SyntaxError', async () => {
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: 'export const r = 1;\n' }],
      'index.js',
      [],
    );
    const manifest: MfManifest = buildManifest([graphSharedDep('react', graph)]);
    // Malformed entryRoots supplied INLINE — bypassing none of the checks
    // a referenced manifest receives.
    (manifest as unknown as Record<string, unknown>).entryRoots = {
      './lifecycle': 'not-an-array',
    };
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
        .load(buildEntry(manifest), 'ext-f023-roots')
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(outcome).toBeInstanceOf(MfeLoadError);
      expect(String((outcome as Error).message)).toMatch(/roots|entryRoots/i);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
