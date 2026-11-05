/**
 * Acceptance: P13-A — a shared unit (or pack) importing another shared
 * package's SUBPATH (`react/jsx-runtime`, `react-dom/client`) reaches the
 * unit that subpath names and has the import rewritten to that unit's
 * minted reference. Before the fix a unit's bare imports were followed by
 * package name only — to the package's main unit — so the subpath's unit
 * was never fetched and the import survived as a dangling bare specifier.
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
  sha256Hex,
} from '../helpers/manifest-builder';
import { createFetchRouter } from '../helpers/fetch-router';
import {
  captureMintedSources,
  unmintedSpecifiers,
} from '../helpers/minted-sources';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

const REACT_MAIN_SRC = 'export const createElement = 1;\n';
const JSX_RUNTIME_SRC = 'export const jsx = 1;\n';

function reactGraph() {
  return buildGraphFile(
    'react',
    '1.0.0',
    [
      { modulePaths: ['index.js'], source: REACT_MAIN_SRC },
      { modulePaths: ['jsx-runtime.js'], source: JSX_RUNTIME_SRC },
    ],
    'index.js',
    [],
  );
}

describe('acceptance: P13-A shared subpath imports between shared packages', () => {
  it('P13-A: a shared unit importing another shared package\'s subpath reaches that subpath\'s unit and has the import rewritten', async () => {
    const react = reactGraph();
    const DOM_SRC =
      'import { jsx } from "react/jsx-runtime";\nexport const render = jsx;\n';
    const reactDom = buildGraphFile(
      'react-dom',
      '1.0.0',
      [
        {
          modulePaths: ['index.js'],
          bareImports: ['react'],
          bareSpecifiers: ['react/jsx-runtime'],
          source: DOM_SRC,
        },
      ],
      'index.js',
      ['react'],
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import { render } from "react-dom";\nexport default { render };',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: react.text },
      [`${PUBLIC_PATH}shared/react-dom.graph.json`]: { body: reactDom.text },
      [`${PUBLIC_PATH}${react.unitLocations[0]}`]: { body: REACT_MAIN_SRC },
      [`${PUBLIC_PATH}${react.unitLocations[1]}`]: { body: JSX_RUNTIME_SRC },
      [`${PUBLIC_PATH}${reactDom.unitLocations[0]}`]: { body: DOM_SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const minted = captureMintedSources();
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    // Only react-dom is a root: the jsx-runtime unit is reachable solely
    // through react-dom's own subpath import.
    const manifest = buildManifest(
      [graphSharedDep('react', react), graphSharedDep('react-dom', reactDom)],
      { entryRoots: { './lifecycle': ['react-dom'] } },
    );
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-p13a-unit'),
      ).resolves.toBeDefined();
      expect(router.calls).toContain(`${PUBLIC_PATH}${react.unitLocations[1]}`);
      const domSource = (await minted.sources()).find((s) =>
        s.includes('export const render'),
      );
      expect(domSource).toBeDefined();
      expect(unmintedSpecifiers(domSource as string)).toEqual([]);
    } finally {
      minted.restore();
      fetchSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('P13-A: a pack importing another shared package\'s subpath delivers that subpath\'s unit with it', async () => {
    const react = reactGraph();
    const PACK_SRC =
      'import { jsx } from "react/jsx-runtime";\nexport const Button = jsx;\n';
    const UNIT_SRC = 'export const Button = 1;\n';
    const packHash = sha256Hex(PACK_SRC);
    const kit = buildGraphFile(
      'kit',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: UNIT_SRC }],
      'index.js',
      ['react'],
      undefined,
      {
        pack: {
          contentHash: packHash,
          location: `shared/kit/pack.${packHash}.js`,
          bareImports: ['react'],
          bareSpecifiers: ['react/jsx-runtime'],
        },
      },
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import { Button } from "kit";\nexport default { Button };',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: react.text },
      [`${PUBLIC_PATH}shared/kit.graph.json`]: { body: kit.text },
      [`${PUBLIC_PATH}${react.unitLocations[0]}`]: { body: REACT_MAIN_SRC },
      [`${PUBLIC_PATH}${react.unitLocations[1]}`]: { body: JSX_RUNTIME_SRC },
      [`${PUBLIC_PATH}${kit.unitLocations[0]}`]: { body: UNIT_SRC },
      [`${PUBLIC_PATH}${kit.packLocation}`]: { body: PACK_SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const minted = captureMintedSources();
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, {
      retries: 0,
      packFallbackBudgetMs: 0,
    } as ConstructorParameters<typeof MfeHandlerMF>[1]);
    const manifest = buildManifest(
      [graphSharedDep('react', react), graphSharedDep('kit', kit)],
      { entryRoots: { './lifecycle': ['kit'] } },
    );
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-p13a-pack'),
      ).resolves.toBeDefined();
      expect(router.calls).toContain(`${PUBLIC_PATH}${kit.packLocation}`);
      expect(router.calls).toContain(`${PUBLIC_PATH}${react.unitLocations[1]}`);
      const packSource = (await minted.sources()).find((s) =>
        s.includes('export const Button = jsx'),
      );
      expect(packSource).toBeDefined();
      expect(unmintedSpecifiers(packSource as string)).toEqual([]);
    } finally {
      minted.restore();
      fetchSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});
