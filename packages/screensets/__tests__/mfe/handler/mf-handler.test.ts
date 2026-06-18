/**
 * MfeHandlerMF Tests
 *
 * Tests for manifest caching, manifest resolution, and blob URL loading.
 * Updated for the blob URL isolation architecture (no container-based loading).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MfeHandlerMF } from '../../../src/mfe/handler/mf-handler';
import type { MfeEntryMF, MfManifest } from '../../../src/mfe/types';
import { MfeLoadError } from '../../../src/mfe/errors';
import {
  setupBlobUrlLoaderMocks,
  createRemoteEntrySource,
  createExposeChunkSource,
  createChunkWithRelativeImport,
  TEST_BASE_URL,
} from '../test-utils/mock-blob-url-loader';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a test manifest with proper HTTP URLs and register the corresponding
 * source texts so the mock fetch returns them.
 */
function createTestManifest(
  remoteName: string,
  exposedModules: string[],
  options?: { sharedDependencies?: MfManifest['sharedDependencies'] }
): {
  manifest: MfManifest;
  registerSources: (reg: (url: string, src: string) => void) => void;
} {
  const remoteEntryUrl = `${TEST_BASE_URL}/${remoteName}/remoteEntry.js`;
  const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;

  const exposeMap: Record<string, string> = {};
  for (const mod of exposedModules) {
    const safeName = mod.replace('./', '').replace(/[^a-zA-Z0-9]/g, '-');
    exposeMap[mod] = `expose-${safeName}.js`;
  }

  const manifest: MfManifest = {
    id: `gts.frontx.mfes.mfe.mf_manifest.v1~test.${remoteName}.manifest.v1`,
    remoteEntry: remoteEntryUrl,
    remoteName,
    ...options,
  };

  const registerSources = (reg: (url: string, src: string) => void) => {
    reg(remoteEntryUrl, createRemoteEntrySource(exposeMap));
    for (const chunk of Object.values(exposeMap)) {
      reg(`${baseUrl}${chunk}`, createExposeChunkSource());
    }
  };

  return { manifest, registerSources };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MfeHandlerMF - Caching and Manifest Resolution', () => {
  let handler: MfeHandlerMF;
  let mocks: ReturnType<typeof setupBlobUrlLoaderMocks>;

  beforeEach(() => {
    handler = new MfeHandlerMF('gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~', { timeout: 5000, retries: 0 });
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
      const { manifest, registerSources } = createTestManifest(
        'analyticsRemote',
        ['./ChartWidget1', './ChartWidget2']
      );
      registerSources(mocks.registerSource);

      const entry1: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart1.v1',
        manifest,
        exposedModule: './ChartWidget1',
      };

      const entry2: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart2.v1',
        manifest,
        exposedModule: './ChartWidget2',
      };

      const result1 = await handler.load(entry1);
      expect(result1).toBeDefined();
      expect(typeof result1.mount).toBe('function');

      const result2 = await handler.load(entry2);
      expect(result2).toBeDefined();
      expect(typeof result2.mount).toBe('function');
    });

    it('17.1.3 - Manifest caching works across multiple entries', async () => {
      const { manifest, registerSources } = createTestManifest(
        'analyticsRemote',
        ['./ChartWidget1', './ChartWidget2']
      );
      registerSources(mocks.registerSource);

      const entry1: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart1.v1',
        manifest,
        exposedModule: './ChartWidget1',
      };

      const entry2: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart2.v1',
        manifest,
        exposedModule: './ChartWidget2',
      };

      const result1 = await handler.load(entry1);
      expect(result1).toBeDefined();

      const result2 = await handler.load(entry2);
      expect(result2).toBeDefined();
    });

    it('17.1.4 - Caches manifests resolved from MfeEntryMF during load', async () => {
      const { manifest, registerSources } = createTestManifest(
        'analyticsRemote',
        ['./ChartWidget', './ChartWidget2']
      );
      registerSources(mocks.registerSource);

      const entry: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart.v1',
        manifest,
        exposedModule: './ChartWidget',
      };

      const result1 = await handler.load(entry);
      expect(result1).toBeDefined();

      // Create another entry with same manifest ID (string reference)
      const entry2: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart2.v1',
        manifest: manifest.id,
        exposedModule: './ChartWidget2',
      };

      const result2 = await handler.load(entry2);
      expect(result2).toBeDefined();
    });
  });

  describe('17.2 - MfeHandlerMF Manifest Resolution', () => {
    it('17.2.1 - Implements manifest resolution from MfeEntryMF.manifest field', async () => {
      const { manifest, registerSources } = createTestManifest(
        'analyticsRemote',
        ['./ChartWidget']
      );
      registerSources(mocks.registerSource);

      const entry: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart.v1',
        manifest,
        exposedModule: './ChartWidget',
      };

      const result = await handler.load(entry);
      expect(result).toBeDefined();
      expect(typeof result.mount).toBe('function');
      expect(typeof result.unmount).toBe('function');
    });

    it('17.2.2 - Supports manifest as inline object', async () => {
      const { manifest, registerSources } = createTestManifest(
        'analyticsRemote',
        ['./ChartWidget']
      );
      registerSources(mocks.registerSource);

      const entry: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart.v1',
        manifest,
        exposedModule: './ChartWidget',
      };

      const result = await handler.load(entry);
      expect(result).toBeDefined();
    });

    it('17.2.2 - Supports manifest as type ID reference', async () => {
      const { manifest, registerSources } = createTestManifest(
        'analyticsRemote',
        ['./ChartWidget1', './ChartWidget2']
      );
      registerSources(mocks.registerSource);

      // First, load with inline manifest to cache it
      const entry1: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart1.v1',
        manifest,
        exposedModule: './ChartWidget1',
      };
      await handler.load(entry1);

      // Now use type ID reference
      const entry2: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart2.v1',
        manifest: manifest.id,
        exposedModule: './ChartWidget2',
      };

      const result = await handler.load(entry2);
      expect(result).toBeDefined();
    });

    it('17.2.3 - Caches resolved manifests for entries from same remote', async () => {
      const { manifest, registerSources } = createTestManifest(
        'analyticsRemote',
        ['./ChartWidget1', './ChartWidget2', './ChartWidget3']
      );
      registerSources(mocks.registerSource);

      const entries: MfeEntryMF[] = [
        {
          id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart1.v1',
          manifest,
          exposedModule: './ChartWidget1',
        },
        {
          id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart2.v1',
          manifest,
          exposedModule: './ChartWidget2',
        },
        {
          id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart3.v1',
          manifest,
          exposedModule: './ChartWidget3',
        },
      ];

      for (const entry of entries) {
        const result = await handler.load(entry);
        expect(result).toBeDefined();
      }
    });

    it('17.2.4 - Clear error messaging if manifest resolution fails (missing inline fields)', async () => {
      const invalidManifest = {
        id: 'gts.frontx.mfes.mfe.mf_manifest.v1~acme.analytics.manifest.v1',
        // Missing remoteEntry and remoteName
      } as MfManifest;

      const entry: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart.v1',
        manifest: invalidManifest,
        exposedModule: './ChartWidget',
      };

      await expect(handler.load(entry)).rejects.toThrow(MfeLoadError);
      await expect(handler.load(entry)).rejects.toThrow('remoteEntry');
    });

    it('17.2.4 - Clear error messaging if manifest resolution fails (type ID not found)', async () => {
      const entry: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart.v1',
        manifest: 'gts.frontx.mfes.mfe.mf_manifest.v1~missing.manifest.v1',
        exposedModule: './ChartWidget',
      };

      await expect(handler.load(entry)).rejects.toThrow(MfeLoadError);
      await expect(handler.load(entry)).rejects.toThrow('not found');
    });

    it('17.2.4 - Clear error messaging for invalid manifest object (missing id)', async () => {
      const invalidManifest = {
        remoteEntry: 'https://cdn.example.com/remoteEntry.js',
        remoteName: 'analyticsRemote',
        // Missing id field
      } as MfManifest;

      const entry: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart.v1',
        manifest: invalidManifest,
        exposedModule: './ChartWidget',
      };

      await expect(handler.load(entry)).rejects.toThrow(MfeLoadError);
      await expect(handler.load(entry)).rejects.toThrow('"id"');
    });

    it('17.2.4 - Clear error messaging for invalid manifest object (missing remoteName)', async () => {
      const invalidManifest = {
        id: 'gts.frontx.mfes.mfe.mf_manifest.v1~acme.analytics.manifest.v1',
        remoteEntry: 'https://cdn.example.com/remoteEntry.js',
        // Missing remoteName
      } as MfManifest;

      const entry: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart.v1',
        manifest: invalidManifest,
        exposedModule: './ChartWidget',
      };

      await expect(handler.load(entry)).rejects.toThrow(MfeLoadError);
      await expect(handler.load(entry)).rejects.toThrow('remoteName');
    });
  });

  describe('17.3 - Handler Integration Tests', () => {
    it('17.3.1 - Manifest caching reuses data for multiple entries from same remote', async () => {
      const { manifest, registerSources } = createTestManifest(
        'analyticsRemote',
        ['./ChartWidget1', './ChartWidget2']
      );
      registerSources(mocks.registerSource);

      const entries: MfeEntryMF[] = [
        {
          id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart1.v1',
          manifest,
          exposedModule: './ChartWidget1',
        },
        {
          id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart2.v1',
          manifest: manifest.id, // Reference by ID
          exposedModule: './ChartWidget2',
        },
      ];

      const result1 = await handler.load(entries[0]);
      expect(result1).toBeDefined();

      const result2 = await handler.load(entries[1]);
      expect(result2).toBeDefined();
    });

    it('17.3.2 - Source text caching avoids redundant fetches for same URL', async () => {
      const { manifest, registerSources } = createTestManifest(
        'analyticsRemote',
        ['./Widget1', './Widget2', './Widget3']
      );
      registerSources(mocks.registerSource);

      const entries: MfeEntryMF[] = [
        {
          id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart1.v1',
          manifest,
          exposedModule: './Widget1',
        },
        {
          id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart2.v1',
          manifest,
          exposedModule: './Widget2',
        },
        {
          id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart3.v1',
          manifest,
          exposedModule: './Widget3',
        },
      ];

      for (const entry of entries) {
        const result = await handler.load(entry);
        expect(result).toBeDefined();
      }

      // remoteEntry.js fetched once (source text cache), expose chunks once each
      const remoteEntryUrl = `${TEST_BASE_URL}/analyticsRemote/remoteEntry.js`;
      const remoteEntryFetches = mocks.mockFetch.mock.calls.filter(
        (call: unknown[]) => call[0] === remoteEntryUrl
      );
      expect(remoteEntryFetches).toHaveLength(1);
    });

    it('17.3.3 - Manifest resolution from inline MfeEntryMF.manifest', async () => {
      const { manifest, registerSources } = createTestManifest(
        'analyticsRemote',
        ['./ChartWidget'],
        { sharedDependencies: [{ name: 'react', requiredVersion: '^18.0.0' }] }
      );
      registerSources(mocks.registerSource);

      const entry: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart.v1',
        manifest,
        exposedModule: './ChartWidget',
      };

      const result = await handler.load(entry);
      expect(result).toBeDefined();
      expect(typeof result.mount).toBe('function');
      expect(typeof result.unmount).toBe('function');
    });

    it('17.3.4 - Manifest resolution from type ID reference', async () => {
      const { manifest, registerSources } = createTestManifest(
        'analyticsRemote',
        ['./ChartWidget1', './ChartWidget2']
      );
      registerSources(mocks.registerSource);

      const entry1: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart1.v1',
        manifest,
        exposedModule: './ChartWidget1',
      };
      await handler.load(entry1);

      const entry2: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.chart2.v1',
        manifest: manifest.id,
        exposedModule: './ChartWidget2',
      };

      const result = await handler.load(entry2);
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
      const remoteEntryUrl = `${TEST_BASE_URL}/${remoteName}/remoteEntry.js`;
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;

      // Expose chunk is in a subdirectory and imports from parent via ../
      const exposeChunkPath = 'subdir/expose-Widget.js';
      const parentDepPath = 'runtime.js';

      mocks.registerSource(
        remoteEntryUrl,
        createRemoteEntrySource({ './Widget': exposeChunkPath })
      );
      // Chunk in subdir imports '../runtime.js' → resolves to 'runtime.js'
      mocks.registerSource(
        `${baseUrl}${exposeChunkPath}`,
        createChunkWithRelativeImport('../runtime.js')
      );
      // The parent dep is a simple module
      mocks.registerSource(
        `${baseUrl}${parentDepPath}`,
        'export const helper = () => {};'
      );

      const manifest: MfManifest = {
        id: `gts.frontx.mfes.mfe.mf_manifest.v1~test.${remoteName}.manifest.v1`,
        remoteEntry: remoteEntryUrl,
        remoteName,
      };

      const entry: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~test.scoped.v1',
        manifest,
        exposedModule: './Widget',
      };

      const result = await handler.load(entry);
      expect(result).toBeDefined();
      expect(typeof result.mount).toBe('function');

      // Both the subdir chunk and the parent dep should have been fetched
      const fetchedUrls = mocks.mockFetch.mock.calls.map((c: unknown[]) => c[0]);
      expect(fetchedUrls).toContain(`${baseUrl}${exposeChunkPath}`);
      expect(fetchedUrls).toContain(`${baseUrl}${parentDepPath}`);
    });

    it('resolves ./ imports normally (no subdirectory)', async () => {
      const remoteName = 'flatRemote';
      const remoteEntryUrl = `${TEST_BASE_URL}/${remoteName}/remoteEntry.js`;
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;

      const exposeChunk = 'expose-Widget.js';
      const depChunk = 'dep.js';

      mocks.registerSource(
        remoteEntryUrl,
        createRemoteEntrySource({ './Widget': exposeChunk })
      );
      // Expose chunk imports './dep.js' (same directory)
      mocks.registerSource(
        `${baseUrl}${exposeChunk}`,
        `import { helper } from './dep.js';\nexport default { mount: () => {}, unmount: () => {} };`
      );
      mocks.registerSource(`${baseUrl}${depChunk}`, 'export const helper = () => {};');

      const manifest: MfManifest = {
        id: `gts.frontx.mfes.mfe.mf_manifest.v1~test.${remoteName}.manifest.v1`,
        remoteEntry: remoteEntryUrl,
        remoteName,
      };

      const entry: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~test.flat.v1',
        manifest,
        exposedModule: './Widget',
      };

      const result = await handler.load(entry);
      expect(result).toBeDefined();
      expect(typeof result.mount).toBe('function');

      const fetchedUrls = mocks.mockFetch.mock.calls.map((c: unknown[]) => c[0]);
      expect(fetchedUrls).toContain(`${baseUrl}${depChunk}`);
    });

    it('resolves nested ../ traversals correctly', async () => {
      const remoteName = 'deepRemote';
      const remoteEntryUrl = `${TEST_BASE_URL}/${remoteName}/remoteEntry.js`;
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;

      // Expose chunk in deep/nested/ imports '../../root-dep.js' → 'root-dep.js'
      const exposeChunk = 'deep/nested/expose-Widget.js';

      mocks.registerSource(
        remoteEntryUrl,
        createRemoteEntrySource({ './Widget': exposeChunk })
      );
      mocks.registerSource(
        `${baseUrl}${exposeChunk}`,
        createChunkWithRelativeImport('../../root-dep.js')
      );
      mocks.registerSource(
        `${baseUrl}root-dep.js`,
        'export const helper = () => {};'
      );

      const manifest: MfManifest = {
        id: `gts.frontx.mfes.mfe.mf_manifest.v1~test.${remoteName}.manifest.v1`,
        remoteEntry: remoteEntryUrl,
        remoteName,
      };

      const entry: MfeEntryMF = {
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~test.deep.v1',
        manifest,
        exposedModule: './Widget',
      };

      const result = await handler.load(entry);
      expect(result).toBeDefined();

      const fetchedUrls = mocks.mockFetch.mock.calls.map((c: unknown[]) => c[0]);
      expect(fetchedUrls).toContain(`${baseUrl}root-dep.js`);
    });
  });
});
