/**
 * Tests for the lazy-import ABI runtime resolver half of ADR-0022
 * (`cpt-frontx-dod-mfe-isolation-lazy-import-abi`).
 *
 * Verifies that `MfeHandlerMF` injects a per-load `__hai3_lazy` loader stub
 * into chunks that reference the identifier, that the stub closes over the
 * load's resolver, and that the resolver fetches + rewrites + blob-URLs
 * lazy chunks against the parent load's `sharedDepBlobUrls`.
 */
// @cpt-FEATURE:mfe-manifest-loading:p1
// @cpt-dod:cpt-frontx-dod-mfe-isolation-lazy-import-abi:p1

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MfeHandlerMF } from '../../../src/mfe/handler/mf-handler';
import type {
  MfeEntryMF,
  MfManifest,
  MfManifestAssets,
} from '../../../src/mfe/types';
import {
  setupBlobUrlLoaderMocks,
  TEST_BASE_URL,
} from '../../../__test-utils__/mock-blob-url-loader';

/**
 * Decode a `data:text/javascript;base64,...` URL minted by the mock
 * `URL.createObjectURL` back to its source text.
 */
function decodeDataUrl(url: string): string {
  const base64 = url.replace(/^data:[^,]+;base64,/, '');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Retrieve every blob source the handler minted during the load — useful
 * for asserting on the loader-stub source, the entry-chunk source, and
 * the lazy-chunk source independently without depending on URL identity.
 */
function allBlobContents(): string[] {
  const mockResults = (
    URL.createObjectURL as unknown as { mock: { results: { value: string }[] } }
  ).mock.results;
  return mockResults.map((r) => decodeDataUrl(r.value));
}

function buildManifest(): MfManifest {
  return {
    id: 'gts.hai3.mfes.mfe.mf_manifest.v1~test.lazyremote.manifest.v1',
    name: 'lazyRemote',
    metaData: {
      name: 'lazyRemote',
      type: 'app',
      buildInfo: { buildVersion: '1.0.0', buildName: 'lazyRemote' },
      remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' },
      globalName: 'lazyRemote',
      publicPath: `${TEST_BASE_URL}/lazyRemote/`,
    },
    shared: [],
  };
}

function buildExposeAssets(chunkFilename: string): MfManifestAssets {
  return {
    js: { sync: [chunkFilename], async: [] },
    css: { sync: [], async: [] },
  };
}

describe('MfeHandlerMF — lazy-import runtime resolver (ADR-0022)', () => {
  let handler: MfeHandlerMF;
  let mocks: ReturnType<typeof setupBlobUrlLoaderMocks>;
  const baseUrl = `${TEST_BASE_URL}/lazyRemote/`;

  beforeEach(() => {
    handler = new MfeHandlerMF(
      'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~',
      { timeout: 5000, retries: 0 }
    );
    mocks = setupBlobUrlLoaderMocks();
  });

  afterEach(() => {
    mocks.cleanup();
    vi.clearAllMocks();
  });

  it('injects a per-load __hai3_lazy loader stub when a chunk references the identifier', async () => {
    const entryChunkFilename = 'expose-lazy-entry.js';
    const entrySource = [
      // The build plugin's renderChunk transform converts every
      // `import('./X')` to `__hai3_lazy('./X')` in compiled chunks; we
      // ship that exact post-transform shape into the handler under test.
      `const loadLazy = () => __hai3_lazy('./LazyChunk-abc.js');`,
      `void loadLazy;`,
      `export default { mount: () => {}, unmount: () => {} };`,
    ].join('\n');

    mocks.registerSource(`${baseUrl}${entryChunkFilename}`, entrySource);

    const manifest = buildManifest();
    const entry: MfeEntryMF = {
      id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.lazy.entry.v1',
      manifest,
      exposedModule: './lifecycle-lazy',
      exposeAssets: buildExposeAssets(entryChunkFilename),
      requiredProperties: [],
      actions: [],
      domainActions: [],
    };

    const lifecycle = await handler.load(entry, entry.id);
    expect(lifecycle).toBeDefined();
    expect(typeof lifecycle.mount).toBe('function');

    const blobs = allBlobContents();
    const stubSource = blobs.find((s) => s.includes('__HAI3_LAZY__'));
    expect(stubSource).toBeDefined();
    expect(stubSource).toContain('export const __hai3_lazy');
    expect(stubSource).toContain('globalThis.__HAI3_LAZY__.resolve');

    const entryFinal = blobs.find(
      (s) =>
        s.includes(`__hai3_lazy('./LazyChunk-abc.js')`) &&
        s.startsWith('import{__hai3_lazy}from"data:')
    );
    expect(entryFinal).toBeDefined();
  });

  it('does NOT inject the loader stub when the chunk has no __hai3_lazy call', async () => {
    const entryChunkFilename = 'expose-plain-entry.js';
    const entrySource = `export default { mount: () => {}, unmount: () => {} };`;
    mocks.registerSource(`${baseUrl}${entryChunkFilename}`, entrySource);

    const manifest = buildManifest();
    const entry: MfeEntryMF = {
      id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.plain.entry.v1',
      manifest,
      exposedModule: './lifecycle-plain',
      exposeAssets: buildExposeAssets(entryChunkFilename),
      requiredProperties: [],
      actions: [],
      domainActions: [],
    };

    await handler.load(entry, entry.id);

    const blobs = allBlobContents();
    const stubSource = blobs.find((s) => s.includes('__HAI3_LAZY__'));
    expect(stubSource).toBeUndefined();
  });

  it('resolves a lazy chunk via __hai3_lazy: fetches, rewrites bare specifiers, mints a blob URL', async () => {
    const entryChunkFilename = 'expose-uikit-like.js';
    const lazyChunkFilename = 'LazyKit-xyz.js';
    // The lazy chunk imports a shared dep as a bare specifier — the same
    // failure mode the parent plan's QA verdict surfaced for UIKit Elements
    // (lazy chunk loaded from origin with unrewritten `import "react"`).
    // The resolver MUST rewrite this against the parent load's
    // `sharedDepBlobUrls` before minting the blob URL.
    const lazyChunkSource = [
      `import * as React from "react";`,
      `export const useLazy = () => React;`,
    ].join('\n');
    const entrySource = [
      `const Lazy = () => __hai3_lazy('./${lazyChunkFilename}');`,
      `void Lazy;`,
      `export default { mount: () => {}, unmount: () => {} };`,
    ].join('\n');

    // Register a shared `react` standalone ESM so the lazy chunk's bare
    // specifier resolves against the parent load's blob URL — this is the
    // round-trip ADR-0022 promises.
    mocks.registerSource(
      `${baseUrl}shared/react.js`,
      `export default { isMockReact: true };`
    );
    mocks.registerSource(`${baseUrl}${entryChunkFilename}`, entrySource);
    mocks.registerSource(`${baseUrl}${lazyChunkFilename}`, lazyChunkSource);

    const manifest: MfManifest = {
      ...buildManifest(),
      shared: [
        {
          name: 'react',
          version: '19.0.0',
          chunkPath: 'shared/react.js',
          unwrapKey: null,
        },
      ],
    };
    const entry: MfeEntryMF = {
      id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.lazy.uikit.v1',
      manifest,
      exposedModule: './lifecycle-lazy-kit',
      exposeAssets: buildExposeAssets(entryChunkFilename),
      requiredProperties: [],
      actions: [],
      domainActions: [],
    };

    const lifecycle = await handler.load(entry, entry.id);
    expect(lifecycle).toBeDefined();

    // Drive the lazy resolution by triggering `__hai3_lazy('./LazyKit-xyz.js')`
    // via the loader stub — the stub is the public ABI vendor MFE code calls.
    // We grab the stub URL by reading the entry chunk's prepended import line.
    const blobs = allBlobContents();
    const entryFinal = blobs.find((s) =>
      s.startsWith('import{__hai3_lazy}from"data:')
    );
    expect(entryFinal).toBeDefined();
    const stubUrlMatch = entryFinal!.match(/from"(data:[^"]+)"/);
    expect(stubUrlMatch).not.toBeNull();
    const stubUrl = stubUrlMatch![1];

    // Import the stub to obtain `__hai3_lazy`, then invoke it for the lazy
    // chunk relative path the entry would have called at runtime.
    const stubMod = (await import(/* @vite-ignore */ stubUrl)) as {
      __hai3_lazy: (path: string) => Promise<unknown>;
    };
    const lazyMod = (await stubMod.__hai3_lazy(`./${lazyChunkFilename}`)) as {
      useLazy: () => unknown;
    };
    expect(typeof lazyMod.useLazy).toBe('function');

    // The lazy chunk's source must have had its bare `react` import rewritten
    // to a blob URL — verify the rewritten lazy-chunk blob exists.
    const blobsAfterLazy = allBlobContents();
    const lazyFinal = blobsAfterLazy.find(
      (s) =>
        s.includes('export const useLazy') &&
        // bare `import * as React from "react"` was rewritten to a data URL
        /from\s*"data:[^"]+"/.test(s) &&
        !/from\s*"react"/.test(s)
    );
    expect(lazyFinal).toBeDefined();
  });

  it('caches the lazy chunk blob URL: repeat __hai3_lazy calls for the same path reuse one blob', async () => {
    const entryChunkFilename = 'expose-cache-entry.js';
    const lazyChunkFilename = 'CachedLazy-1.js';
    const lazyChunkSource = `export const v = 1;`;
    const entrySource = [
      `const Lazy = () => __hai3_lazy('./${lazyChunkFilename}');`,
      `void Lazy;`,
      `export default { mount: () => {}, unmount: () => {} };`,
    ].join('\n');

    mocks.registerSource(`${baseUrl}${entryChunkFilename}`, entrySource);
    mocks.registerSource(`${baseUrl}${lazyChunkFilename}`, lazyChunkSource);

    const entry: MfeEntryMF = {
      id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.lazy.cache.v1',
      manifest: buildManifest(),
      exposedModule: './lifecycle-lazy-cache',
      exposeAssets: buildExposeAssets(entryChunkFilename),
      requiredProperties: [],
      actions: [],
      domainActions: [],
    };

    await handler.load(entry, entry.id);

    const blobs = allBlobContents();
    const entryFinal = blobs.find((s) =>
      s.startsWith('import{__hai3_lazy}from"data:')
    );
    const stubUrl = entryFinal!.match(/from"(data:[^"]+)"/)![1];
    const stubMod = (await import(/* @vite-ignore */ stubUrl)) as {
      __hai3_lazy: (path: string) => Promise<{ v: number }>;
    };

    const fetchCallsBeforeFirstLazy = mocks.mockFetch.mock.calls.length;
    const m1 = await stubMod.__hai3_lazy(`./${lazyChunkFilename}`);
    const fetchCallsAfterFirstLazy = mocks.mockFetch.mock.calls.length;
    const m2 = await stubMod.__hai3_lazy(`./${lazyChunkFilename}`);
    const fetchCallsAfterSecondLazy = mocks.mockFetch.mock.calls.length;

    expect(m1).toBe(m2);
    expect(fetchCallsAfterFirstLazy).toBeGreaterThan(fetchCallsBeforeFirstLazy);
    // Second call must not refetch the lazy chunk — `blobUrlMap` short-circuits
    // and the source-text cache holds the URL key. This satisfies the DoD's
    // "per-load isolation preserved" + "sourceTextCache reuse" properties.
    expect(fetchCallsAfterSecondLazy).toBe(fetchCallsAfterFirstLazy);
  });
});
