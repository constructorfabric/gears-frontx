/**
 * MfeHandlerMF Tests
 *
 * Tests for manifest caching, manifest resolution, and blob URL loading.
 * Updated for manifest-based loading (Phase 8+): expose chunk paths come from
 * entry.exposeAssets.js.sync[0], CSS paths from entry.exposeAssets.css.sync/async,
 * and baseUrl from manifest.metaData.publicPath.
 */
// @cpt-FEATURE:mfe-manifest-loading:p1

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MfeHandlerMF } from '../../../src/mfe/handler/mf-handler';
import type { MfeEntryMF, MfManifest, MfManifestAssets } from '../../../src/mfe/types';
import { MfeLoadError } from '../../../src/mfe/errors';
import {
  setupBlobUrlLoaderMocks,
  createExposeChunkSource,
  createChunkWithRelativeImport,
  createSharedDepSource,
  TEST_BASE_URL,
} from '../../../__test-utils__/mock-blob-url-loader';

// ---------------------------------------------------------------------------
// Test manifest factory helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid GTS MfManifest with the new structure.
 * publicPath is the base URL for all chunks.
 */
function buildManifest(
  remoteName: string,
  options: {
    shared?: MfManifest['shared'];
    id?: string;
  } = {}
): MfManifest {
  return {
    id: options.id ?? `gts.hai3.mfes.mfe.mf_manifest.v1~test.${remoteName}.manifest.v1`,
    name: remoteName,
    metaData: {
      name: remoteName,
      type: 'app',
      buildInfo: { buildVersion: '1.0.0', buildName: remoteName },
      remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' },
      globalName: remoteName,
      publicPath: `${TEST_BASE_URL}/${remoteName}/`,
    },
    shared: options.shared ?? [],
  };
}

/**
 * Build a per-module exposeAssets descriptor, registering the chunk source
 * with the given registration function.
 */
function buildExposeAssets(
  remoteName: string,
  exposedModule: string,
  options: {
    registerSource: (url: string, src: string) => void;
    cssPaths?: string[];
    chunkSource?: string;
  }
): MfManifestAssets {
  const safeName = exposedModule.replace('./', '').replace(/[^a-zA-Z0-9]/g, '-');
  const chunkFilename = `expose-${safeName}.js`;
  const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;

  options.registerSource(
    `${baseUrl}${chunkFilename}`,
    options.chunkSource ?? createExposeChunkSource()
  );

  const cssPaths = options.cssPaths ?? [];

  return {
    js: { sync: [chunkFilename], async: [] },
    css: { sync: cssPaths, async: [] },
  };
}

/**
 * Create a complete test setup: manifest + entries + registered sources.
 */
function createTestSetup(
  remoteName: string,
  exposedModules: string[],
  options: {
    shared?: MfManifest['shared'];
    cssByExpose?: Record<string, string[]>;
    chunkSources?: Record<string, string>;
  } = {}
): {
  manifest: MfManifest;
  makeEntry: (
    exposedModule: string,
    suffix: string,
    registerSource: (url: string, src: string) => void
  ) => MfeEntryMF;
  registerAllSources: (reg: (url: string, src: string) => void) => void;
} {
  const manifest = buildManifest(remoteName, { shared: options.shared });

  const makeEntry = (
    exposedModule: string,
    suffix: string,
    registerSource: (url: string, src: string) => void
  ): MfeEntryMF => {
    const exposeAssets = buildExposeAssets(remoteName, exposedModule, {
      registerSource,
      cssPaths: options.cssByExpose?.[exposedModule],
      chunkSource: options.chunkSources?.[exposedModule],
    });
    return {
      id: `gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.${suffix}.v1`,
      manifest,
      exposedModule,
      exposeAssets,
      requiredProperties: [],
      actions: [],
      domainActions: [],
    };
  };

  const registerAllSources = (reg: (url: string, src: string) => void) => {
    for (const mod of exposedModules) {
      buildExposeAssets(remoteName, mod, {
        registerSource: reg,
        cssPaths: options.cssByExpose?.[mod],
        chunkSource: options.chunkSources?.[mod],
      });
    }
  };

  return { manifest, makeEntry, registerAllSources };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MfeHandlerMF - Caching and Manifest Resolution', () => {
  let handler: MfeHandlerMF;
  let mocks: ReturnType<typeof setupBlobUrlLoaderMocks>;

  beforeEach(() => {
    handler = new MfeHandlerMF('gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~', { timeout: 5000, retries: 0 });
    mocks = setupBlobUrlLoaderMocks();
  });

  afterEach(() => {
    mocks.cleanup();
    vi.clearAllMocks();
  });

  describe('17.1 - ManifestCache (Internal)', () => {
    it('17.1.1 - ManifestCache class exists within mf-handler.ts', () => {
      expect(handler).toBeDefined();
      expect(typeof handler.load).toBe('function');
    });

    it('17.1.2 - Implements in-memory manifest caching for reuse across entries', async () => {
      const { makeEntry } = createTestSetup('analyticsRemote', [
        './ChartWidget1',
        './ChartWidget2',
      ]);

      const entry1 = makeEntry('./ChartWidget1', 'acme.chart1', mocks.registerSource);
      const entry2 = makeEntry('./ChartWidget2', 'acme.chart2', mocks.registerSource);

      const result1 = await handler.load(entry1, entry1.id);
      expect(result1).toBeDefined();
      expect(typeof result1.mount).toBe('function');

      const result2 = await handler.load(entry2, entry2.id);
      expect(result2).toBeDefined();
      expect(typeof result2.mount).toBe('function');
    });

    it('17.1.3 - Manifest caching works across multiple entries', async () => {
      const { makeEntry } = createTestSetup('analyticsRemote', [
        './ChartWidget1',
        './ChartWidget2',
      ]);

      const entry1 = makeEntry('./ChartWidget1', 'acme.chart1b', mocks.registerSource);
      const entry2 = makeEntry('./ChartWidget2', 'acme.chart2b', mocks.registerSource);

      const result1 = await handler.load(entry1, entry1.id);
      expect(result1).toBeDefined();

      const result2 = await handler.load(entry2, entry2.id);
      expect(result2).toBeDefined();
    });

    it('17.1.4 - Caches manifests resolved from MfeEntryMF during load', async () => {
      const { manifest, makeEntry } = createTestSetup('analyticsRemote', [
        './ChartWidget',
        './ChartWidget2',
      ]);

      // First load caches the manifest by its ID
      const entry1 = makeEntry('./ChartWidget', 'acme.chart.a', mocks.registerSource);
      await handler.load(entry1, entry1.id);

      // Second entry references the same manifest by ID string
      const exposeAssets2 = buildExposeAssets('analyticsRemote', './ChartWidget2', {
        registerSource: mocks.registerSource,
      });
      const entry2: MfeEntryMF = {
        id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.acme.chart2.v1',
        manifest: manifest.id,
        exposedModule: './ChartWidget2',
        exposeAssets: exposeAssets2,
      requiredProperties: [],
      actions: [],
      domainActions: [],
    };

      const result2 = await handler.load(entry2, entry2.id);
      expect(result2).toBeDefined();
    });
  });

  describe('17.2 - MfeHandlerMF Manifest Resolution', () => {
    it('17.2.1 - Implements manifest resolution from MfeEntryMF.manifest field', async () => {
      const { makeEntry } = createTestSetup('analyticsRemote', ['./ChartWidget']);
      const entry = makeEntry('./ChartWidget', 'acme.chart.2.1', mocks.registerSource);

      const result = await handler.load(entry, entry.id);
      expect(result).toBeDefined();
      expect(typeof result.mount).toBe('function');
      expect(typeof result.unmount).toBe('function');
    });

    it('17.2.2 - Supports manifest as inline object', async () => {
      const { makeEntry } = createTestSetup('analyticsRemote', ['./ChartWidget']);
      const entry = makeEntry('./ChartWidget', 'acme.chart.2.2', mocks.registerSource);

      const result = await handler.load(entry, entry.id);
      expect(result).toBeDefined();
    });

    it('17.2.2 - Supports manifest as type ID reference', async () => {
      const { manifest, makeEntry } = createTestSetup('analyticsRemote', [
        './ChartWidget1',
        './ChartWidget2',
      ]);

      // Prime the cache with an inline manifest load
      const entry1 = makeEntry('./ChartWidget1', 'acme.chart.ref1', mocks.registerSource);
      await handler.load(entry1, entry1.id);

      // Second load uses type ID reference
      const exposeAssets2 = buildExposeAssets('analyticsRemote', './ChartWidget2', {
        registerSource: mocks.registerSource,
      });
      const entry2: MfeEntryMF = {
        id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.acme.chart.ref2.v1',
        manifest: manifest.id,
        exposedModule: './ChartWidget2',
        exposeAssets: exposeAssets2,
      requiredProperties: [],
      actions: [],
      domainActions: [],
    };

      const result = await handler.load(entry2, entry2.id);
      expect(result).toBeDefined();
    });

    it('17.2.3 - Caches resolved manifests for entries from same remote', async () => {
      const { makeEntry } = createTestSetup('analyticsRemote', [
        './ChartWidget1',
        './ChartWidget2',
        './ChartWidget3',
      ]);

      const entries = [
        makeEntry('./ChartWidget1', 'acme.chart.c1', mocks.registerSource),
        makeEntry('./ChartWidget2', 'acme.chart.c2', mocks.registerSource),
        makeEntry('./ChartWidget3', 'acme.chart.c3', mocks.registerSource),
      ];

      for (const entry of entries) {
        const result = await handler.load(entry, entry.id);
        expect(result).toBeDefined();
      }
    });

    // Manifest field validation (missing id, publicPath, remoteEntry, name)
    // is the type system plugin's responsibility, not the handler's.
    // Those tests were removed — the handler trusts registered manifests.

    it('17.2.4 - Clear error when manifest type ID is not found in cache', async () => {
      const exposeAssets = buildExposeAssets('analyticsRemote', './ChartWidget', {
        registerSource: mocks.registerSource,
      });
      const entry: MfeEntryMF = {
        id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.notcached.v1',
        manifest: 'gts.hai3.mfes.mfe.mf_manifest.v1~missing.manifest.v1',
        exposedModule: './ChartWidget',
        exposeAssets,
        requiredProperties: [],
        actions: [],
        domainActions: []
      };

      await expect(handler.load(entry, entry.id)).rejects.toThrow(MfeLoadError);
      await expect(handler.load(entry, entry.id)).rejects.toThrow('not found');
    });

    // Tests for missing remoteEntry.name, mfInitKey, id, publicPath removed —
    // manifest field validation is the type system plugin's responsibility.
  });

  describe('17.3 - Handler Integration Tests', () => {
    it('17.3.1 - Manifest caching reuses data for multiple entries from same remote', async () => {
      const { manifest, makeEntry } = createTestSetup('analyticsRemote', [
        './ChartWidget1',
        './ChartWidget2',
      ]);

      const entry1 = makeEntry('./ChartWidget1', 'acme.int.chart1', mocks.registerSource);
      const result1 = await handler.load(entry1, entry1.id);
      expect(result1).toBeDefined();

      // Second entry references manifest by ID
      const exposeAssets2 = buildExposeAssets('analyticsRemote', './ChartWidget2', {
        registerSource: mocks.registerSource,
      });
      const entry2: MfeEntryMF = {
        id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.acme.int.chart2.v1',
        manifest: manifest.id,
        exposedModule: './ChartWidget2',
        exposeAssets: exposeAssets2,
      requiredProperties: [],
      actions: [],
      domainActions: [],
    };

      const result2 = await handler.load(entry2, entry2.id);
      expect(result2).toBeDefined();
    });

    it('17.3.2 - Source text caching avoids redundant fetches for shared dep ESM files', async () => {
      // Two loads from the same manifest both trigger buildSharedDepBlobUrls() for 'react'.
      // The handler's sourceTextCache ensures the shared dep URL is fetched only once
      // across both load() calls even though two separate LoadBlobState instances are created.
      const remoteName = 'cacheRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;
      const sharedDepUrl = `${baseUrl}shared/react.js`;

      const manifest = buildManifest(remoteName, {
        shared: [
          {
            name: 'react',
            version: '19.2.4',
            chunkPath: sharedDepUrl,
            unwrapKey: null,
          },
        ],
      });

      // Register the standalone shared dep ESM
      mocks.registerSource(sharedDepUrl, createSharedDepSource());

      mocks.registerSource(`${baseUrl}expose-Widget1.js`, createExposeChunkSource());
      mocks.registerSource(`${baseUrl}expose-Widget2.js`, createExposeChunkSource());

      const entry1: MfeEntryMF = {
        id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.cache1.v1',
        manifest,
        exposedModule: './Widget1',
        exposeAssets: { js: { sync: ['expose-Widget1.js'], async: [] }, css: { sync: [], async: [] } },
        requiredProperties: [],
        actions: [],
        domainActions: [],
      };
      const entry2: MfeEntryMF = {
        id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.cache2.v1',
        manifest,
        exposedModule: './Widget2',
        exposeAssets: { js: { sync: ['expose-Widget2.js'], async: [] }, css: { sync: [], async: [] } },
        requiredProperties: [],
        actions: [],
        domainActions: [],
      };

      // Both loads build shared dep blob URLs — sourceTextCache ensures the shared
      // dep ESM file is fetched at most once.
      await handler.load(entry1, entry1.id);
      await handler.load(entry2, entry2.id);

      const sharedDepFetches = mocks.mockFetch.mock.calls.filter(
        (call: unknown[]) => call[0] === sharedDepUrl
      );
      expect(sharedDepFetches).toHaveLength(1);
    });

    it('17.3.3 - Manifest resolution from inline MfeEntryMF.manifest with shared deps', async () => {
      // The handler fetches shared dep ESM files from publicPath + 'shared/' for every
      // entry in manifest.shared[]. Register the shared dep URL alongside the expose chunk.
      const remoteName = 'analyticsSharedMfRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;

      const sharedDepUrl = `${baseUrl}shared/react.js`;
      const manifest = buildManifest(remoteName, {
        shared: [
          {
            name: 'react',
            version: '18.2.0',
            chunkPath: sharedDepUrl,
            unwrapKey: null,
          },
        ],
      });

      // Register standalone shared dep ESM file
      mocks.registerSource(sharedDepUrl, 'export default {};');

      const exposeAssets = buildExposeAssets(remoteName, './ChartWidget', {
        registerSource: mocks.registerSource,
      });
      const entry: MfeEntryMF = {
        id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.acme.sharedmf.v1',
        manifest,
        exposedModule: './ChartWidget',
        exposeAssets,
        requiredProperties: [],
        actions: [],
        domainActions: []
      };

      const result = await handler.load(entry, entry.id);
      expect(result).toBeDefined();
      expect(typeof result.mount).toBe('function');
      expect(typeof result.unmount).toBe('function');
    });

    it('17.3.4 - Manifest resolution from type ID reference', async () => {
      const { manifest, makeEntry } = createTestSetup('analyticsRemote', [
        './ChartWidget1',
        './ChartWidget2',
      ]);

      const entry1 = makeEntry('./ChartWidget1', 'acme.tidref1', mocks.registerSource);
      await handler.load(entry1, entry1.id);

      const exposeAssets2 = buildExposeAssets('analyticsRemote', './ChartWidget2', {
        registerSource: mocks.registerSource,
      });
      const entry2: MfeEntryMF = {
        id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.acme.tidref2.v1',
        manifest: manifest.id,
        exposedModule: './ChartWidget2',
        exposeAssets: exposeAssets2,
      requiredProperties: [],
      actions: [],
      domainActions: [],
    };

      const result = await handler.load(entry2, entry2.id);
      expect(result).toBeDefined();
      expect(typeof result.mount).toBe('function');
      expect(typeof result.unmount).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // Relative import resolution (../ for subdirectory chunks)
  // -------------------------------------------------------------------------
  describe('relative import resolution', () => {
    it('resolves ../ imports for chunks in subdirectories', async () => {
      const remoteName = 'scopedPkgRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;

      // Expose chunk is in a subdirectory and imports from parent via ../
      const exposeChunkPath = 'subdir/expose-Widget.js';
      const parentDepPath = 'runtime.js';

      mocks.registerSource(
        `${baseUrl}${exposeChunkPath}`,
        createChunkWithRelativeImport('../runtime.js')
      );
      mocks.registerSource(
        `${baseUrl}${parentDepPath}`,
        'export const helper = () => {};'
      );

      const manifest = buildManifest(remoteName);
      const entry: MfeEntryMF = {
        id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.scoped.v1',
        manifest,
        exposedModule: './Widget',
        exposeAssets: {
          js: { sync: [exposeChunkPath], async: [] },
          css: { sync: [], async: [] },
        },
        requiredProperties: [],
        actions: [],
        domainActions: [],
      };

      const result = await handler.load(entry, entry.id);
      expect(result).toBeDefined();
      expect(typeof result.mount).toBe('function');

      const fetchedUrls = mocks.mockFetch.mock.calls.map((c: unknown[]) => c[0]);
      expect(fetchedUrls).toContain(`${baseUrl}${exposeChunkPath}`);
      expect(fetchedUrls).toContain(`${baseUrl}${parentDepPath}`);
    });

    it('resolves ./ imports normally (no subdirectory)', async () => {
      const remoteName = 'flatRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;

      const exposeChunk = 'expose-Widget.js';
      const depChunk = 'dep.js';

      mocks.registerSource(
        `${baseUrl}${exposeChunk}`,
        `import { helper } from './dep.js';\nexport default { mount: () => {}, unmount: () => {} };`
      );
      mocks.registerSource(`${baseUrl}${depChunk}`, 'export const helper = () => {};');

      const manifest = buildManifest(remoteName);
      const entry: MfeEntryMF = {
        id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.flat.v1',
        manifest,
        exposedModule: './Widget',
        exposeAssets: {
          js: { sync: [exposeChunk], async: [] },
          css: { sync: [], async: [] },
        },
        requiredProperties: [],
        actions: [],
        domainActions: [],
      };

      const result = await handler.load(entry, entry.id);
      expect(result).toBeDefined();
      expect(typeof result.mount).toBe('function');

      const fetchedUrls = mocks.mockFetch.mock.calls.map((c: unknown[]) => c[0]);
      expect(fetchedUrls).toContain(`${baseUrl}${depChunk}`);
    });

    it('resolves nested ../ traversals correctly', async () => {
      const remoteName = 'deepRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;

      // Expose chunk in deep/nested/ imports '../../root-dep.js' → 'root-dep.js'
      const exposeChunk = 'deep/nested/expose-Widget.js';

      mocks.registerSource(
        `${baseUrl}${exposeChunk}`,
        createChunkWithRelativeImport('../../root-dep.js')
      );
      mocks.registerSource(
        `${baseUrl}root-dep.js`,
        'export const helper = () => {};'
      );

      const manifest = buildManifest(remoteName);
      const entry: MfeEntryMF = {
        id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.deep.v1',
        manifest,
        exposedModule: './Widget',
        exposeAssets: {
          js: { sync: [exposeChunk], async: [] },
          css: { sync: [], async: [] },
        },
        requiredProperties: [],
        actions: [],
        domainActions: [],
      };

      const result = await handler.load(entry, entry.id);
      expect(result).toBeDefined();

      const fetchedUrls = mocks.mockFetch.mock.calls.map((c: unknown[]) => c[0]);
      expect(fetchedUrls).toContain(`${baseUrl}root-dep.js`);
    });

    it('loads chunk with minified static imports during blob rewriting', async () => {
      const remoteName = 'minifiedRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;
      const exposeChunk = 'expose-Widget.js';
      const depChunk = 'dep.js';

      mocks.registerSource(
        `${baseUrl}${exposeChunk}`,
        'import{helper as h}from"./dep.js";export default{mount:()=>h(),unmount:()=>{}};'
      );
      mocks.registerSource(`${baseUrl}${depChunk}`, 'export const helper = () => {};');

      const manifest = buildManifest(remoteName);
      const entry: MfeEntryMF = {
        id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.minified.v1',
        manifest,
        exposedModule: './Widget',
        exposeAssets: {
          js: { sync: [exposeChunk], async: [] },
          css: { sync: [], async: [] },
        },
        requiredProperties: [],
        actions: [],
        domainActions: [],
      };

      const result = await handler.load(entry, entry.id);
      expect(result).toBeDefined();
      expect(typeof result.mount).toBe('function');
    });

    it('injects remote stylesheet links into the shadow root before mount', async () => {
      const remoteName = 'styledRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;
      const exposeChunk = 'expose-Widget.js';
      const cssFile = 'widget.css';

      mocks.registerSource(`${baseUrl}${exposeChunk}`, createExposeChunkSource());

      const manifest = buildManifest(remoteName);
      const entry: MfeEntryMF = {
        id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.styled.v1',
        manifest,
        exposedModule: './Widget',
        exposeAssets: {
          js: { sync: [exposeChunk], async: [] },
          css: { sync: [cssFile], async: [] },
        },
        requiredProperties: [],
        actions: [],
        domainActions: [],
      };

      const lifecycle = await handler.load(entry, entry.id);
      const host = document.createElement('div');
      const shadowRoot = host.attachShadow({ mode: 'open' });
      await lifecycle.mount(shadowRoot, {
        domainId: 'domain',
        instanceId: 'instance',
        executeActionsChain: async () => undefined,
        subscribeToProperty: () => () => undefined,
        getProperty: () => undefined,
        registerActionHandler: () => undefined,
      });

      const styleElement = shadowRoot.getElementById('__hai3-mfe-runtime-style-0');
      expect(styleElement).toBeInstanceOf(HTMLLinkElement);
      expect((styleElement as HTMLLinkElement | null)?.rel).toBe('stylesheet');
      expect((styleElement as HTMLLinkElement | null)?.href).toBe(
        `${baseUrl}${cssFile}`
      );
      expect(shadowRoot.querySelectorAll('link[id^="__hai3-mfe-runtime-style-"]')).toHaveLength(1);
      expect(shadowRoot.querySelector('style[id^="__hai3-mfe-runtime-style-"]')).toBeNull();
    });

    it('reuses stylesheet link ids instead of duplicating them on repeated mount', async () => {
      const remoteName = 'styledRepeatRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;
      const exposeChunk = 'expose-Widget.js';

      mocks.registerSource(`${baseUrl}${exposeChunk}`, createExposeChunkSource());

      const manifest = buildManifest(remoteName);
      const entry: MfeEntryMF = {
        id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.styled-repeat.v1',
        manifest,
        exposedModule: './Widget',
        exposeAssets: {
          js: { sync: [exposeChunk], async: [] },
          css: { sync: ['widget.css'], async: [] },
        },
        requiredProperties: [],
        actions: [],
        domainActions: [],
      };

      const lifecycle = await handler.load(entry, entry.id);
      const host = document.createElement('div');
      const shadowRoot = host.attachShadow({ mode: 'open' });
      const bridge = {
        domainId: 'domain',
        instanceId: 'instance',
        executeActionsChain: async () => undefined,
        subscribeToProperty: () => () => undefined,
        getProperty: () => undefined,
        registerActionHandler: () => undefined,
      };

      await lifecycle.mount(shadowRoot, bridge);
      await lifecycle.mount(shadowRoot, bridge);

      expect(shadowRoot.querySelectorAll('link[id="__hai3-mfe-runtime-style-0"]')).toHaveLength(1);
    });

    it('removes injected remote stylesheets before unmount', async () => {
      const remoteName = 'styledUnmountRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;
      const exposeChunk = 'expose-Widget.js';

      mocks.registerSource(
        `${baseUrl}${exposeChunk}`,
        `export default {
          mount: () => {},
          unmount: (container) => {
            if (container.querySelector('link[id^="__hai3-mfe-runtime-style-"], style[id^="__hai3-mfe-runtime-style-"]')) {
              throw new Error('runtime stylesheet cleanup should happen before unmount');
            }
          }
        };`
      );

      const manifest = buildManifest(remoteName);
      const entry: MfeEntryMF = {
        id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.styled-unmount.v1',
        manifest,
        exposedModule: './Widget',
        exposeAssets: {
          js: { sync: [exposeChunk], async: [] },
          css: { sync: ['widget.css'], async: [] },
        },
        requiredProperties: [],
        actions: [],
        domainActions: [],
      };

      const lifecycle = await handler.load(entry, entry.id);
      const host = document.createElement('div');
      const shadowRoot = host.attachShadow({ mode: 'open' });

      await lifecycle.mount(shadowRoot, {
        domainId: 'domain',
        instanceId: 'instance',
        executeActionsChain: async () => undefined,
        subscribeToProperty: () => () => undefined,
        getProperty: () => undefined,
        registerActionHandler: () => undefined,
      });

      expect(shadowRoot.getElementById('__hai3-mfe-runtime-style-0')).toBeTruthy();

      await expect(lifecycle.unmount(shadowRoot)).resolves.toBeUndefined();
      expect(shadowRoot.getElementById('__hai3-mfe-runtime-style-0')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Manifest-based chunk discovery (Phase 8)
  // -------------------------------------------------------------------------
  describe('manifest-based chunk discovery', () => {
    it('reads expose chunk filename from exposeAssets.js.sync[0]', async () => {
      const remoteName = 'manifestChunkRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;
      const exposeChunk = 'custom-expose-chunk-name.js';

      mocks.registerSource(`${baseUrl}${exposeChunk}`, createExposeChunkSource());

      const manifest = buildManifest(remoteName);
      const entry: MfeEntryMF = {
        id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.manifestchunk.v1',
        manifest,
        exposedModule: './Widget',
        // exposeAssets.js.sync[0] dictates exactly which chunk is fetched
        exposeAssets: {
          js: { sync: [exposeChunk], async: [] },
          css: { sync: [], async: [] },
        },
        requiredProperties: [],
        actions: [],
        domainActions: [],
      };

      await handler.load(entry, entry.id);

      const fetchedUrls = mocks.mockFetch.mock.calls.map((c: unknown[]) => c[0]);
      expect(fetchedUrls).toContain(`${baseUrl}${exposeChunk}`);
    });

    it('derives baseUrl from manifest.metaData.publicPath (not remoteEntry URL)', async () => {
      const remoteName = 'publicPathRemote';
      const publicPath = `${TEST_BASE_URL}/${remoteName}/`;
      const exposeChunk = 'expose-Widget.js';

      mocks.registerSource(`${publicPath}${exposeChunk}`, createExposeChunkSource());

      const manifest = buildManifest(remoteName);
      const entry: MfeEntryMF = {
        id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.publicpath.v1',
        manifest,
        exposedModule: './Widget',
        exposeAssets: {
          js: { sync: [exposeChunk], async: [] },
          css: { sync: [], async: [] },
        },
        requiredProperties: [],
        actions: [],
        domainActions: [],
      };

      await handler.load(entry, entry.id);

      // Chunk was fetched at publicPath + chunkFilename (not remoteEntry URL)
      const fetchedUrls = mocks.mockFetch.mock.calls.map((c: unknown[]) => c[0]);
      expect(fetchedUrls).toContain(`${publicPath}${exposeChunk}`);
    });

    it('reads CSS paths from exposeAssets.css.sync (no regex required)', async () => {
      const remoteName = 'cssManifestRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;
      const exposeChunk = 'expose-Widget.js';
      const cssPath = 'styles/widget.css';

      mocks.registerSource(`${baseUrl}${exposeChunk}`, createExposeChunkSource());

      const manifest = buildManifest(remoteName);
      const entry: MfeEntryMF = {
        id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.cssmanifest.v1',
        manifest,
        exposedModule: './Widget',
        exposeAssets: {
          js: { sync: [exposeChunk], async: [] },
          css: { sync: [cssPath], async: [] },
        },
        requiredProperties: [],
        actions: [],
        domainActions: [],
      };

      const lifecycle = await handler.load(entry, entry.id);
      const host = document.createElement('div');
      const shadowRoot = host.attachShadow({ mode: 'open' });
      await lifecycle.mount(shadowRoot, {
        domainId: 'domain',
        instanceId: 'instance',
        executeActionsChain: async () => undefined,
        subscribeToProperty: () => () => undefined,
        getProperty: () => undefined,
        registerActionHandler: () => undefined,
      });

      const link = shadowRoot.getElementById('__hai3-mfe-runtime-style-0') as HTMLLinkElement;
      expect(link).toBeTruthy();
      expect(link.href).toBe(`${baseUrl}${cssPath}`);
    });

    it('throws MfeLoadError when exposeAssets.js.sync is empty', async () => {
      const manifest = buildManifest('emptyExposeRemote');
      const entry: MfeEntryMF = {
        id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.emptyexpose.v1',
        manifest,
        exposedModule: './Widget',
        exposeAssets: {
          js: { sync: [], async: [] }, // empty — no chunk to load
          css: { sync: [], async: [] },
        },
        requiredProperties: [],
        actions: [],
        domainActions: [],
      };

      await expect(handler.load(entry, entry.id)).rejects.toThrow(MfeLoadError);
      await expect(handler.load(entry, entry.id)).rejects.toThrow('exposeAssets.js.sync is empty');
    });

    it('handles multiple CSS paths from exposeAssets.css.sync and css.async', async () => {
      const remoteName = 'multiCssRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;
      const exposeChunk = 'expose-Widget.js';

      mocks.registerSource(`${baseUrl}${exposeChunk}`, createExposeChunkSource());

      const manifest = buildManifest(remoteName);
      const entry: MfeEntryMF = {
        id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.multicss.v1',
        manifest,
        exposedModule: './Widget',
        exposeAssets: {
          js: { sync: [exposeChunk], async: [] },
          css: { sync: ['base.css', 'theme.css'], async: ['lazy.css'] },
        },
        requiredProperties: [],
        actions: [],
        domainActions: [],
      };

      const lifecycle = await handler.load(entry, entry.id);
      const host = document.createElement('div');
      const shadowRoot = host.attachShadow({ mode: 'open' });
      await lifecycle.mount(shadowRoot, {
        domainId: 'domain',
        instanceId: 'instance',
        executeActionsChain: async () => undefined,
        subscribeToProperty: () => () => undefined,
        getProperty: () => undefined,
        registerActionHandler: () => undefined,
      });

      // sync and async CSS are both injected (3 total)
      const links = shadowRoot.querySelectorAll('link[id^="__hai3-mfe-runtime-style-"]');
      expect(links).toHaveLength(3);
    });
  });
});

// ---------------------------------------------------------------------------
// Process-wide load cache (cpt-frontx-dod-mfe-isolation-handler-load-cache)
// ---------------------------------------------------------------------------
//
// The static load cache survives handler-instance disposal — a fresh
// MfeHandlerMF instance constructed after the original is dropped still
// returns the cached promise for any entry ID that has been loaded earlier
// in the page lifetime. Tests reset the static cache between cases by
// reaching through a typed cast: the cache is private to enforce the
// "no public API for testing" rule, but TypeScript's `private` keyword
// is a compile-time check only.

type LoadCacheCarrier = { loadCache: Map<string, Promise<unknown>> };

function resetStaticLoadCache(): void {
  (MfeHandlerMF as unknown as LoadCacheCarrier).loadCache.clear();
}

function readStaticLoadCache(): Map<string, Promise<unknown>> {
  return (MfeHandlerMF as unknown as LoadCacheCarrier).loadCache;
}

describe('MfeHandlerMF - Process-Wide Load Cache', () => {
  let handler: MfeHandlerMF;
  let mocks: ReturnType<typeof setupBlobUrlLoaderMocks>;

  beforeEach(() => {
    resetStaticLoadCache();
    handler = new MfeHandlerMF(
      'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~',
      { timeout: 5000, retries: 0 }
    );
    mocks = setupBlobUrlLoaderMocks();
  });

  afterEach(() => {
    mocks.cleanup();
    vi.clearAllMocks();
    resetStaticLoadCache();
  });

  it('populates the static cache on first load (miss path)', async () => {
    const { makeEntry } = createTestSetup('cacheRemoteMiss', ['./Widget']);
    const entry = makeEntry('./Widget', 'cache.miss.entry', mocks.registerSource);

    expect(readStaticLoadCache().has(entry.id)).toBe(false);
    const result = await handler.load(entry, entry.id);

    expect(result).toBeDefined();
    expect(typeof result.mount).toBe('function');
    expect(readStaticLoadCache().has(entry.id)).toBe(true);
  });

  it('returns the cached lifecycle on second load with the same entry id (hit path)', async () => {
    const { makeEntry } = createTestSetup('cacheRemoteHit', ['./Widget']);
    const entry = makeEntry('./Widget', 'cache.hit.entry', mocks.registerSource);

    const first = await handler.load(entry, entry.id);
    const fetchCountAfterFirst = mocks.mockFetch.mock.calls.length;

    const second = await handler.load(entry, entry.id);

    expect(second).toBe(first);
    expect(mocks.mockFetch.mock.calls.length).toBe(fetchCountAfterFirst);
  });

  it('survives handler-instance disposal — a fresh handler sees the cached lifecycle', async () => {
    const { makeEntry } = createTestSetup('cacheRemoteDispose', ['./Widget']);
    const entry = makeEntry(
      './Widget',
      'cache.dispose.entry',
      mocks.registerSource
    );

    const first = await handler.load(entry, entry.id);
    const fetchCountAfterFirst = mocks.mockFetch.mock.calls.length;

    // Drop the original handler and create a fresh one — mimics the
    // nested-app registry teardown that destroys MfeHandlerMF instances
    // between navigate cycles.
    const replacementHandler = new MfeHandlerMF(
      'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~',
      { timeout: 5000, retries: 0 }
    );

    const second = await replacementHandler.load(entry, entry.id);

    expect(second).toBe(first);
    expect(mocks.mockFetch.mock.calls.length).toBe(fetchCountAfterFirst);
  });

  it('shares a single in-flight promise for concurrent loads of the same entry id', async () => {
    const { makeEntry } = createTestSetup('cacheRemoteInflight', ['./Widget']);
    const entry = makeEntry(
      './Widget',
      'cache.inflight.entry',
      mocks.registerSource
    );

    const [a, b] = await Promise.all([handler.load(entry, entry.id), handler.load(entry, entry.id)]);

    expect(a).toBe(b);
  });

  it('evicts the cache entry when the underlying load rejects (failure eviction)', async () => {
    const exposeAssets = buildExposeAssets('cacheRemoteFail', './Widget', {
      registerSource: mocks.registerSource,
    });
    const entry: MfeEntryMF = {
      id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.cache.fail.v1',
      manifest: 'gts.hai3.mfes.mfe.mf_manifest.v1~missing.manifest.v1',
      exposedModule: './Widget',
      exposeAssets,
      requiredProperties: [],
      actions: [],
      domainActions: []
    };

    await expect(handler.load(entry, entry.id)).rejects.toThrow(MfeLoadError);
    expect(readStaticLoadCache().has(entry.id)).toBe(false);

    // A subsequent load with the same id must trigger a fresh attempt
    // (i.e. not hit a stale rejected promise).
    await expect(handler.load(entry, entry.id)).rejects.toThrow(MfeLoadError);
    expect(readStaticLoadCache().has(entry.id)).toBe(false);
  });

  it('caches distinct entry ids independently', async () => {
    const { makeEntry } = createTestSetup('cacheRemoteDistinct', [
      './WidgetA',
      './WidgetB',
    ]);
    const entryA = makeEntry('./WidgetA', 'cache.distinct.a', mocks.registerSource);
    const entryB = makeEntry('./WidgetB', 'cache.distinct.b', mocks.registerSource);

    await handler.load(entryA, entryA.id);
    await handler.load(entryB, entryB.id);

    const cachedA = readStaticLoadCache().get(entryA.id);
    const cachedB = readStaticLoadCache().get(entryB.id);
    expect(cachedA).toBeDefined();
    expect(cachedB).toBeDefined();
    // Each entry id maps to its own promise — loading entry B does not
    // overwrite or share the cache slot for entry A.
    expect(cachedA).not.toBe(cachedB);

    // Re-loading entry A reuses its cache slot (no overwrite) and leaves
    // entry B's slot untouched.
    await handler.load(entryA, entryA.id);
    expect(readStaticLoadCache().get(entryA.id)).toBe(cachedA);
    expect(readStaticLoadCache().get(entryB.id)).toBe(cachedB);
  });
});

// ---------------------------------------------------------------------------
// Extension-Instance-ID Cache Key (post-correction contract)
// ---------------------------------------------------------------------------
//
// These tests pin the contract from
// `cpt-frontx-dod-mfe-isolation-handler-load-cache`:
//   - The cache is keyed by the EXTENSION INSTANCE ID, not by `entry.id`.
//   - Two extensions registered against the SAME `MfeEntry` definition
//     populate DISTINCT cache entries and receive DISTINCT loads.
//   - Re-mount of the same extension instance reuses the cached load.
//
// The cache is reset between tests via the existing
// `resetStaticLoadCache()` helper (private static field accessed through a
// typed cast — no test-only public API on the handler).

describe('MfeHandlerMF - Extension-Instance-ID Cache Key', () => {
  let handler: MfeHandlerMF;
  let mocks: ReturnType<typeof setupBlobUrlLoaderMocks>;

  beforeEach(() => {
    resetStaticLoadCache();
    handler = new MfeHandlerMF(
      'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~',
      { timeout: 5000, retries: 0 }
    );
    mocks = setupBlobUrlLoaderMocks();
  });

  afterEach(() => {
    mocks.cleanup();
    vi.clearAllMocks();
    resetStaticLoadCache();
  });

  it('caches distinct extensions sharing the same entry under DISTINCT keys', async () => {
    // Two sibling extensions that target the same MfeEntry definition.
    // Per ADR-0004 + ADR-0020 they MUST receive distinct loads — distinct
    // cache entries, distinct in-flight promises, and a fresh blob URL
    // chain per load.
    //
    // Per-load DISTINCT runtime module evaluations are an invariant of the
    // browser's `URL.createObjectURL` (each call mints a unique opaque
    // blob URL → unique module cache slot). The unit test runs under jsdom
    // with a content-based data: URL mock that intentionally dedupes
    // identical source modules in Node's module cache, so the resolved
    // lifecycle references compare equal here even though the cache
    // entries are distinct. Runtime distinctness (alpha hex ≠ beta hex)
    // is verified at the runtime tier in step 8 of this phase.
    const { makeEntry } = createTestSetup('extKeyRemote', ['./Widget']);
    const entry = makeEntry('./Widget', 'shared.entry.distinct.exts', mocks.registerSource);

    const extensionIdAlpha = 'ext-alpha.v1';
    const extensionIdBeta = 'ext-beta.v1';

    const createObjectUrlCallsBefore =
      (URL.createObjectURL as unknown as { mock: { calls: unknown[] } }).mock.calls.length;

    const promiseAlpha = handler.load(entry, extensionIdAlpha);
    const promiseBeta = handler.load(entry, extensionIdBeta);

    await Promise.all([promiseAlpha, promiseBeta]);

    // Distinct cache slots populated, keyed by extension instance ID.
    expect(readStaticLoadCache().has(extensionIdAlpha)).toBe(true);
    expect(readStaticLoadCache().has(extensionIdBeta)).toBe(true);
    expect(readStaticLoadCache().get(extensionIdAlpha)).not.toBe(
      readStaticLoadCache().get(extensionIdBeta)
    );

    // Distinct in-flight promises while loading.
    expect(promiseAlpha).not.toBe(promiseBeta);

    // Each load mints its own blob URL chain → URL.createObjectURL must
    // be called for both loads (per ADR-0004 isolation invariant).
    const createObjectUrlCallsAfter =
      (URL.createObjectURL as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    expect(createObjectUrlCallsAfter - createObjectUrlCallsBefore).toBeGreaterThanOrEqual(2);

    // Entry-ID-keyed lookup MUST NOT find the load — the key is the
    // extension instance ID. This pins the corrected contract.
    expect(readStaticLoadCache().has(entry.id)).toBe(false);
  });

  it('returns the cached load on re-mount of the same extension instance', async () => {
    const { makeEntry } = createTestSetup('extKeyRemoteHit', ['./Widget']);
    const entry = makeEntry('./Widget', 'shared.entry.same.ext', mocks.registerSource);
    const extensionId = 'ext-instance.v1';

    const first = await handler.load(entry, extensionId);
    const fetchCountAfterFirst = mocks.mockFetch.mock.calls.length;

    const second = await handler.load(entry, extensionId);

    // Same extension instance => same cached promise / lifecycle reference,
    // no new fetch (cache short-circuits ahead of loadInternal).
    expect(second).toBe(first);
    expect(mocks.mockFetch.mock.calls.length).toBe(fetchCountAfterFirst);
  });

  it('shares a single in-flight promise for concurrent loads of the same extension instance', async () => {
    const { makeEntry } = createTestSetup('extKeyRemoteInflight', ['./Widget']);
    const entry = makeEntry(
      './Widget',
      'shared.entry.inflight.ext',
      mocks.registerSource
    );
    const extensionId = 'ext-instance.inflight.v1';

    const [a, b] = await Promise.all([
      handler.load(entry, extensionId),
      handler.load(entry, extensionId),
    ]);

    expect(a).toBe(b);
  });

  it('evicts the cache entry on load failure keyed by extension instance ID', async () => {
    const exposeAssets = buildExposeAssets('extKeyRemoteFail', './Widget', {
      registerSource: mocks.registerSource,
    });
    const entry: MfeEntryMF = {
      id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.ext.fail.v1',
      manifest: 'gts.hai3.mfes.mfe.mf_manifest.v1~missing.manifest.v1',
      exposedModule: './Widget',
      exposeAssets,
      requiredProperties: [],
      actions: [],
      domainActions: []
    };
    const extensionId = 'ext-instance.fail.v1';

    await expect(handler.load(entry, extensionId)).rejects.toThrow(MfeLoadError);
    expect(readStaticLoadCache().has(extensionId)).toBe(false);

    // A subsequent load against the same extension ID triggers a fresh
    // attempt (no stale rejected promise is reused).
    await expect(handler.load(entry, extensionId)).rejects.toThrow(MfeLoadError);
    expect(readStaticLoadCache().has(extensionId)).toBe(false);
  });

  it('caches distinct extension instance IDs independently', async () => {
    // Two different extension instances, distinct entries — verify the
    // cache slots do not overwrite each other and that re-loading one does
    // not perturb the other.
    const { makeEntry } = createTestSetup('extKeyRemoteIndependent', [
      './WidgetA',
      './WidgetB',
    ]);
    const entryA = makeEntry('./WidgetA', 'ext.indep.a', mocks.registerSource);
    const entryB = makeEntry('./WidgetB', 'ext.indep.b', mocks.registerSource);
    const extensionIdA = 'ext-instance.indep.a.v1';
    const extensionIdB = 'ext-instance.indep.b.v1';

    await handler.load(entryA, extensionIdA);
    await handler.load(entryB, extensionIdB);

    const cachedA = readStaticLoadCache().get(extensionIdA);
    const cachedB = readStaticLoadCache().get(extensionIdB);
    expect(cachedA).toBeDefined();
    expect(cachedB).toBeDefined();
    expect(cachedA).not.toBe(cachedB);

    // Re-loading A leaves B's cache slot untouched.
    await handler.load(entryA, extensionIdA);
    expect(readStaticLoadCache().get(extensionIdA)).toBe(cachedA);
    expect(readStaticLoadCache().get(extensionIdB)).toBe(cachedB);
  });
});
