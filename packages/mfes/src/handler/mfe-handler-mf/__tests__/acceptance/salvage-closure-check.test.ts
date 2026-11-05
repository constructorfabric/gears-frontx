/**
 * Ported salvage suite: shared-dependency `requires` closure check.
 *
 * Covers `inst-md-requires-closure` (issue #718). Ported from
 * `salvage/issue-718-impl-20261105:.../MfeHandlerMF.closure-check.test.ts`
 * onto the shared helpers and the `./unit-format` graph shapes; the
 * `isSharedDepGraphFile` assertions are dropped (the runtime performs no
 * structural validation of graph files).
 *
 * This suite asserts TARGET behaviour and currently FAILS — phase 8
 * drives it green together with the finding acceptance tests.
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

describe('acceptance: ported closure-check (requires closure)', () => {
  it('proceeds when every required package is declared in the manifest shared[] set', async () => {
    const REACT_SRC = 'export const react = 1;\n';
    const REACT_DOM_SRC = 'import "react";\nexport const reactDom = 1;\n';
    const react = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: REACT_SRC }],
      'index.js',
      [],
    );
    const reactDom = buildGraphFile(
      'react-dom',
      '1.0.0',
      [
        {
          modulePaths: ['index.js'],
          bareImports: ['react'],
          source: REACT_DOM_SRC,
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
      [`${PUBLIC_PATH}${react.unitLocations[0]}`]: { body: REACT_SRC },
      [`${PUBLIC_PATH}${reactDom.unitLocations[0]}`]: { body: REACT_DOM_SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    stubSuccessfulImport(blobModuleStub);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest(
      [graphSharedDep('react', react), graphSharedDep('react-dom', reactDom)],
      { entryRoots: { './lifecycle': ['react-dom'] } },
    );
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-closure-ok'),
      ).resolves.toBeDefined();
      const requiresWarning = warnSpy.mock.calls.find((args) =>
        String(args[0]).includes('requires'),
      );
      expect(requiresWarning).toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('fails the load with an MfeLoadError naming the missing package when a graph file requires a package not in shared[]', async () => {
    const REACT_DOM_SRC = 'import "react";\nexport const reactDom = 1;\n';
    const reactDom = buildGraphFile(
      'react-dom',
      '1.0.0',
      [
        {
          modulePaths: ['index.js'],
          bareImports: ['react'],
          source: REACT_DOM_SRC,
        },
      ],
      'index.js',
      ['react'],
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react-dom";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react-dom.graph.json`]: { body: reactDom.text },
      [`${PUBLIC_PATH}${reactDom.unitLocations[0]}`]: { body: REACT_DOM_SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest([graphSharedDep('react-dom', reactDom)], {
      entryRoots: { './lifecycle': ['react-dom'] },
    });
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-closure-miss'),
      ).rejects.toThrow(MfeLoadError);
      await expect(
        handler.load(buildEntry(manifest), 'ext-closure-miss-2'),
      ).rejects.toThrow(/'react'/);
      expect(router.calls).not.toContain(
        `${PUBLIC_PATH}${reactDom.unitLocations[0]}`,
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('emits a warning and proceeds when no fetched graph file declares any requires', async () => {
    const SRC = 'export const r = 1;\n';
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: SRC }],
      'index.js',
      // No requires field at all.
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
      [`${PUBLIC_PATH}${graph.unitLocations[0]}`]: { body: SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest([graphSharedDep('react', graph)], {
      entryRoots: { './lifecycle': ['react'] },
    });
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-closure-heuristic'),
      ).resolves.toBeDefined();
      const warn = warnSpy.mock.calls.find((args) =>
        String(args[0]).includes('requires'),
      );
      expect(warn).toBeDefined();
    } finally {
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('names every missing package when requires from multiple graph files are not covered', async () => {
    const mk = (
      name: string,
      bare: string[],
      requires: string[],
    ): ReturnType<typeof buildGraphFile> =>
      buildGraphFile(
        name,
        '1.0.0',
        [
          {
            modulePaths: ['index.js'],
            bareImports: bare,
            source: `${bare.map((b) => `import "${b}";`).join('\n')}\nexport const x = 1;\n`,
          },
        ],
        'index.js',
        requires,
      );
    const reactDom = mk('react-dom', ['react', 'scheduler'], ['react', 'scheduler']);
    const leftPad = mk('left-pad', ['scheduler'], ['scheduler']);
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: 'export default {};' },
      [`${PUBLIC_PATH}shared/react-dom.graph.json`]: { body: reactDom.text },
      [`${PUBLIC_PATH}shared/left-pad.graph.json`]: { body: leftPad.text },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest(
      [graphSharedDep('react-dom', reactDom), graphSharedDep('left-pad', leftPad)],
      { entryRoots: { './lifecycle': ['react-dom', 'left-pad'] } },
    );
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-closure-multi'),
      ).rejects.toThrow(/react|scheduler/);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('fails the load when a graph file carries a malformed requires (string instead of array)', async () => {
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: 'export const r = 1;\n' }],
      'index.js',
      [],
    );
    const bad = graph.text.replace('"units"', '"requires":"react","units"');
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: 'export default {};' },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: bad },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const dep = graphSharedDep('react', graph);
    dep.graphFile = {
      location: 'shared/react.graph.json',
      contentHash: sha256Hex(bad),
    };
    const manifest: MfManifest = buildManifest([dep], {
      entryRoots: { './lifecycle': ['react'] },
    });
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-closure-malformed'),
      ).rejects.toThrow(MfeLoadError);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('does not emit the cannot-be-checked warning when a graph file declares an explicit requires: []', async () => {
    const SRC = 'export const r = 1;\n';
    const graph = buildGraphFile(
      'react',
      '1.0.0',
      [{ modulePaths: ['index.js'], source: SRC }],
      'index.js',
      [],
    );
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: graph.text },
      [`${PUBLIC_PATH}${graph.unitLocations[0]}`]: { body: SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest([graphSharedDep('react', graph)], {
      entryRoots: { './lifecycle': ['react'] },
    });
    try {
      await handler.load(buildEntry(manifest), 'ext-closure-empty');
      const warn = warnSpy.mock.calls.find((args) =>
        /requires.*check|cannot be checked/i.test(String(args[0])),
      );
      expect(warn).toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});
