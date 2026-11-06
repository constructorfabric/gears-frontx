/**
 * Acceptance: OP-004 — on the fetch-all path (no declared roots) the pack
 * fallback must never engage: every unit of a declared package is fetched
 * and minted, so deep-subpath specifiers are claimed instead of surviving
 * unrewritten beside a pack that answered only the package name.
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

describe('acceptance: OP-004 fetch-all path never chooses the pack', () => {
  it('OP-004: with no declared roots every unit is fetched — the pack does not substitute for reachable units', async () => {
    const MAIN_SRC = 'export const main = 1;\n';
    const DEEP_SRC = 'export const deep = 1;\n';
    const PACK_SRC = 'export const pack = 1;\n';
    const kit = buildGraphFile(
      '@scope/kit',
      '1.0.0',
      [
        { modulePaths: ['index.js'], source: MAIN_SRC },
        { modulePaths: ['esm/deep/index.js'], source: DEEP_SRC },
      ],
      'index.js',
      [],
      PACK_SRC,
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "@scope/kit";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/@scope/kit.graph.json`]: { body: kit.text },
      [`${PUBLIC_PATH}${kit.unitLocations[0]}`]: { body: MAIN_SRC },
      [`${PUBLIC_PATH}${kit.unitLocations[1]}`]: { body: DEEP_SRC },
      [`${PUBLIC_PATH}${kit.packLocation ?? ''}`]: { body: PACK_SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    // No entryRoots declared: the fetch-all path.
    const manifest = buildManifest([graphSharedDep('@scope/kit', kit)]);
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-op004'),
      ).resolves.toBeDefined();
      // Fetch-all semantics: both units were fetched, the pack was not.
      expect(router.calls).toContain(
        `${PUBLIC_PATH}${kit.unitLocations[0]}`,
      );
      expect(router.calls).toContain(
        `${PUBLIC_PATH}${kit.unitLocations[1]}`,
      );
      expect(router.calls).not.toContain(
        `${PUBLIC_PATH}${kit.packLocation ?? ''}`,
      );
    } finally {
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});
