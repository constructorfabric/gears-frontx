/**
 * Acceptance: F-017 — subpath bare specifiers (`react/jsx-runtime`) in
 * shared-dep units are rewritten to the package's resolved unit, not left
 * dangling into a broken blob.
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

describe('acceptance: F-017 subpath bare specifier rewrite', () => {
  it('F-017: a unit importing "react/jsx-runtime" resolves to the react package unit for that module path', async () => {
    const JSX_SRC = 'export const jsx = 1;\n';
    const RUNTIME_SRC = 'export const runtime = 1;\n';
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
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest(
      [graphSharedDep('react', react), graphSharedDep('react-dom', reactDom)],
      {
        entryRoots: {
          './lifecycle': ['react', 'react-dom', 'react/jsx-runtime'],
        },
      },
    );
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-f017'),
      ).resolves.toBeDefined();
      // The jsx-runtime unit was reached through the subpath specifier.
      expect(router.calls).toContain(
        `${PUBLIC_PATH}${react.unitLocations[1]}`,
      );
    } finally {
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});
