/**
 * Acceptance: OP-005 — a unit owning `<dir>/index.js` also answers the
 * `pkg/<dir>` specifier: reachability resolves `pkg/dir` to that unit via
 * the candidate module paths, so the specifier must be claimed too, not
 * left surviving in the minted blob.
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
import { captureMintedSources, unmintedSpecifiers } from '../helpers/minted-sources';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

describe('acceptance: OP-005 dir/index.js specifier claim', () => {
  it('OP-005: a unit owning "esm/button/index.js" answers "kit/esm/button" as well as "kit/esm/button/index.js"', async () => {
    const MAIN_SRC = 'export const main = 1;\n';
    const BUTTON_SRC = 'export const button = 1;\n';
    const kit = buildGraphFile(
      'kit',
      '1.0.0',
      [
        { modulePaths: ['index.js'], source: MAIN_SRC },
        { modulePaths: ['esm/button/index.js'], source: BUTTON_SRC },
      ],
      'index.js',
      [],
    );
    const CONSUMER_SRC = 'import "kit/esm/button";\nexport const c = 1;\n';
    const consumer = buildGraphFile(
      'consumer',
      '1.0.0',
      [
        {
          modulePaths: ['index.js'],
          bareImports: ['kit'],
          bareSpecifiers: ['kit/esm/button'],
          source: CONSUMER_SRC,
        },
      ],
      'index.js',
      ['kit'],
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "consumer";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/kit.graph.json`]: { body: kit.text },
      [`${PUBLIC_PATH}shared/consumer.graph.json`]: { body: consumer.text },
      [`${PUBLIC_PATH}${kit.unitLocations[0]}`]: { body: MAIN_SRC },
      [`${PUBLIC_PATH}${kit.unitLocations[1]}`]: { body: BUTTON_SRC },
      [`${PUBLIC_PATH}${consumer.unitLocations[0]}`]: {
        body: CONSUMER_SRC,
      },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const minted = captureMintedSources();
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest(
      [graphSharedDep('kit', kit), graphSharedDep('consumer', consumer)],
      { entryRoots: { './lifecycle': ['consumer'] } },
    );
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-op005'),
      ).resolves.toBeDefined();
      const sources = await minted.sources();
      expect(sources.flatMap((s) => unmintedSpecifiers(s))).toEqual([]);
    } finally {
      minted.restore();
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});
