/**
 * Acceptance: P13-B — a subpath a package declares through its `exports`
 * map (`@base-ui/react/button` → `esm/button/index.js`) resolves to the
 * unit owning that entry module, read from the graph file's
 * `entryModulePaths`. Before the fix the runtime guessed module paths
 * from the subpath text (`button`, `button.js`, `button/index.js`), so an
 * exports-mapped subpath reached no unit, or the wrong one, and its
 * specifier was never answered by a minted reference.
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
import {
  captureMintedSources,
  unmintedSpecifiers,
} from '../helpers/minted-sources';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

const MAIN_SRC = 'export const root = 1;\n';
const BUTTON_SRC = 'export const Button = 1;\n';

function baseUiGraph() {
  return buildGraphFile(
    '@base-ui/react',
    '1.0.0',
    [
      { modulePaths: ['esm/index.js'], source: MAIN_SRC },
      { modulePaths: ['esm/button/index.js'], source: BUTTON_SRC },
    ],
    'esm/index.js',
    [],
    undefined,
    {
      entryModulePaths: {
        '.': 'esm/index.js',
        './button': 'esm/button/index.js',
      },
    },
  );
}

function baseUiRoutes(baseUi: ReturnType<typeof baseUiGraph>) {
  return {
    [`${PUBLIC_PATH}shared/@base-ui/react.graph.json`]: { body: baseUi.text },
    [`${PUBLIC_PATH}${baseUi.unitLocations[0]}`]: { body: MAIN_SRC },
    [`${PUBLIC_PATH}${baseUi.unitLocations[1]}`]: { body: BUTTON_SRC },
  };
}

describe('acceptance: P13-B exports-mapped subpath entries', () => {
  it('P13-B: an exports-mapped subpath imported by the expose chunk resolves to the unit owning its entry module and is rewritten', async () => {
    const baseUi = baseUiGraph();
    const LIFECYCLE_SRC =
      'import { Button } from "@base-ui/react/button";\nexport default { Button };';
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: LIFECYCLE_SRC },
      ...baseUiRoutes(baseUi),
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const minted = captureMintedSources();
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    // The producer writes a subpath root as a unit identifier.
    const manifest = buildManifest(
      [graphSharedDep('@base-ui/react', baseUi)],
      {
        entryRoots: {
          './lifecycle': [
            { name: '@base-ui/react', version: '1.0.0', modulePaths: ['esm/button/index.js'] },
          ],
        },
      },
    );
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-p13b-expose'),
      ).resolves.toBeDefined();
      expect(router.calls).toContain(`${PUBLIC_PATH}${baseUi.unitLocations[1]}`);
      const lifecycle = (await minted.sources()).find((s) =>
        s.includes('export default { Button }'),
      );
      expect(lifecycle).toBeDefined();
      expect(unmintedSpecifiers(lifecycle as string)).toEqual([]);
    } finally {
      minted.restore();
      fetchSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('P13-B: a shared unit importing an exports-mapped subpath of another package reaches that entry\'s unit and has the import rewritten', async () => {
    const baseUi = baseUiGraph();
    const KIT_SRC =
      'import { Button } from "@base-ui/react/button";\nexport const KitButton = Button;\n';
    const kit = buildGraphFile(
      'kit',
      '1.0.0',
      [
        {
          modulePaths: ['index.js'],
          bareImports: ['@base-ui/react'],
          bareSpecifiers: ['@base-ui/react/button'],
          source: KIT_SRC,
        },
      ],
      'index.js',
      ['@base-ui/react'],
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import { KitButton } from "kit";\nexport default { KitButton };',
      },
      [`${PUBLIC_PATH}shared/kit.graph.json`]: { body: kit.text },
      [`${PUBLIC_PATH}${kit.unitLocations[0]}`]: { body: KIT_SRC },
      ...baseUiRoutes(baseUi),
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const minted = captureMintedSources();
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest(
      [graphSharedDep('@base-ui/react', baseUi), graphSharedDep('kit', kit)],
      { entryRoots: { './lifecycle': ['kit'] } },
    );
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-p13b-unit'),
      ).resolves.toBeDefined();
      expect(router.calls).toContain(`${PUBLIC_PATH}${baseUi.unitLocations[1]}`);
      // Only the button entry is imported; the package's main unit is not.
      expect(router.calls).not.toContain(
        `${PUBLIC_PATH}${baseUi.unitLocations[0]}`,
      );
      const kitSource = (await minted.sources()).find((s) =>
        s.includes('export const KitButton'),
      );
      expect(kitSource).toBeDefined();
      expect(unmintedSpecifiers(kitSource as string)).toEqual([]);
    } finally {
      minted.restore();
      fetchSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('P13-B: a subpath the exports map declares resolves to its declared entry module, never to a module path guessed from the subpath text', async () => {
    const DECLARED_SRC = 'export const client = "declared";\n';
    const DECOY_SRC = 'export const client = "decoy";\n';
    const dom = buildGraphFile(
      'dom',
      '1.0.0',
      [
        { modulePaths: ['index.js'], source: MAIN_SRC },
        // `client.js` is what guessing from "client" would pick.
        { modulePaths: ['client.js'], source: DECOY_SRC },
        { modulePaths: ['cjs/client-entry.js'], source: DECLARED_SRC },
      ],
      'index.js',
      [],
      undefined,
      { entryModulePaths: { '.': 'index.js', './client': 'cjs/client-entry.js' } },
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import { client } from "dom/client";\nexport default { client };',
      },
      [`${PUBLIC_PATH}shared/dom.graph.json`]: { body: dom.text },
      [`${PUBLIC_PATH}${dom.unitLocations[0]}`]: { body: MAIN_SRC },
      [`${PUBLIC_PATH}${dom.unitLocations[1]}`]: { body: DECOY_SRC },
      [`${PUBLIC_PATH}${dom.unitLocations[2]}`]: { body: DECLARED_SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest([graphSharedDep('dom', dom)], {
      entryRoots: { './lifecycle': ['dom/client'] },
    });
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-p13b-declared'),
      ).resolves.toBeDefined();
      expect(router.calls).toContain(`${PUBLIC_PATH}${dom.unitLocations[2]}`);
      expect(router.calls).not.toContain(`${PUBLIC_PATH}${dom.unitLocations[1]}`);
    } finally {
      fetchSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});
