/**
 * Acceptance: OP-003 — a graph file produced before `bareSpecifiers`
 * existed (units carry `bareImports` only) cannot tell which subpath a
 * bare import names, so reachability must fall back to every unit of each
 * imported package — a `react/jsx-runtime` import must not leave its unit
 * unfetched and its specifier unrewritten.
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

describe('acceptance: OP-003 graphs without bareSpecifiers', () => {
  it('OP-003: a unit with bareImports but no bareSpecifiers reaches every unit of the imported package', async () => {
    const RUNTIME_SRC = 'export const runtime = 1;\n';
    const JSX_SRC = 'export const jsx = 1;\n';
    // Older-producer shape: no `bareSpecifiers` recorded anywhere.
    const react = buildGraphFile(
      'react',
      '1.0.0',
      [
        { modulePaths: ['index.js'], source: RUNTIME_SRC },
        { modulePaths: ['jsx-runtime.js'], source: JSX_SRC },
      ],
      'index.js',
      [],
    );
    const DOM_SRC = 'import "react/jsx-runtime";\nexport const d = 1;\n';
    const reactDom = buildGraphFile(
      'react-dom',
      '1.0.0',
      [
        {
          modulePaths: ['index.js'],
          bareImports: ['react'],
          source: DOM_SRC,
        },
      ],
      'index.js',
      ['react'],
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react-dom";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: react.text },
      [`${PUBLIC_PATH}shared/react-dom.graph.json`]: { body: reactDom.text },
      [`${PUBLIC_PATH}${react.unitLocations[0]}`]: { body: RUNTIME_SRC },
      [`${PUBLIC_PATH}${react.unitLocations[1]}`]: { body: JSX_SRC },
      [`${PUBLIC_PATH}${reactDom.unitLocations[0]}`]: { body: DOM_SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const minted = captureMintedSources();
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest(
      [graphSharedDep('react', react), graphSharedDep('react-dom', reactDom)],
      { entryRoots: { './lifecycle': ['react-dom'] } },
    );
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-op003'),
      ).resolves.toBeDefined();
      // The subpath's unit was fetched even though nothing recorded the
      // specifier 'react/jsx-runtime' — bareImports alone cannot say which
      // unit it names.
      expect(router.calls).toContain(
        `${PUBLIC_PATH}${react.unitLocations[1]}`,
      );
      const sources = await minted.sources();
      expect(
        sources.flatMap((s) => unmintedSpecifiers(s)),
      ).toEqual([]);
    } finally {
      minted.restore();
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});
