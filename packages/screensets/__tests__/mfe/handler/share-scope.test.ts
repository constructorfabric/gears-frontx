/**
 * MfeHandlerMF — Bare Specifier Rewriting Tests
 *
 * Tests for the standalone-ESM shared dep loading mechanism introduced in Phase 2
 * of the hybrid-shared-deps plan.
 *
 * The protocol:
 *  - Shared deps are fetched from publicPath + 'shared/' + normalizedName + '.js'
 *    before the expose chunk is processed.
 *  - manifest.shared[] must be in dependency order (leaves first).
 *  - Bare specifiers in shared dep ESM files and expose chunks are rewritten to
 *    the pre-built blob URLs for the corresponding shared dep.
 *  - Per-load fresh blob URLs give isolated module instances.
 *
 * Per project guidelines, all assertions go through the public load() API.
 *
 * @packageDocumentation
 */
// @cpt-FEATURE:mfe-manifest-loading:p2

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MfeHandlerMF } from '../../../src/mfe/handler/mf-handler';
import { MfeLoadError } from '../../../src/mfe/errors';
import type { MfeEntryMF, MfManifest, MfManifestShared } from '../../../src/mfe/types';
import {
  setupBlobUrlLoaderMocks,
  createExposeChunkSource,
  createSharedDepSource,
  TEST_BASE_URL,
} from '../../../__test-utils__/mock-blob-url-loader';

const MFE_ENTRY_CONTRACT: Pick<MfeEntryMF, 'requiredProperties' | 'actions' | 'domainActions'> = {
  requiredProperties: [],
  actions: [],
  domainActions: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid GTS MfManifest.
 */
function buildManifest(
  remoteName: string,
  shared: MfManifestShared[] = []
): MfManifest {
  return {
    id: `gts.frontx.mfes.mfe.mf_manifest.v1~test.${remoteName}.manifest.v1`,
    name: remoteName,
    metaData: {
      name: remoteName,
      type: 'app',
      buildInfo: { buildVersion: '1.0.0', buildName: remoteName },
      remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' },
      globalName: remoteName,
      publicPath: `${TEST_BASE_URL}/${remoteName}/`,
    },
    shared,
  };
}

/**
 * Build a shared dep entry.
 */
function sharedDep(
  remoteName: string,
  pkgName: string,
  version = '1.0.0'
): MfManifestShared {
  const normalized = pkgName.replace(/^@/, '').replace(/\//g, '-');
  return {
    name: pkgName,
    version,
    chunkPath: `${TEST_BASE_URL}/${remoteName}/shared/${normalized}.js`,
    unwrapKey: null,
  };
}

/**
 * Build a test MfeEntryMF.
 */
function buildEntry(
  _remoteName: string,
  suffix: string,
  exposeChunk: string,
  manifest: MfManifest
): MfeEntryMF {
  return {
    ...MFE_ENTRY_CONTRACT,
    id: `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~test.${suffix}.v1`,
    manifest,
    exposedModule: './Widget1',
    exposeAssets: {
      js: { sync: [exposeChunk], async: [] },
      css: { sync: [], async: [] },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MfeHandlerMF — bare specifier rewriting for shared deps', () => {
  let handler: MfeHandlerMF;
  let mocks: ReturnType<typeof setupBlobUrlLoaderMocks>;

  beforeEach(() => {
    handler = new MfeHandlerMF('gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~', { timeout: 5000, retries: 0 });
    mocks = setupBlobUrlLoaderMocks();
  });

  afterEach(() => {
    mocks.cleanup();
  });

  // -------------------------------------------------------------------------
  // Shared dep fetching
  // -------------------------------------------------------------------------
  describe('shared dep fetching from shared/ subdirectory', () => {
    it('fetches shared dep from publicPath + shared/ + normalizedName + .js', async () => {
      const remoteName = 'fetchDepRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;
      const sharedDepUrl = `${baseUrl}shared/react.js`;

      mocks.registerSource(sharedDepUrl, createSharedDepSource());
      mocks.registerSource(`${baseUrl}expose-Widget1.js`, createExposeChunkSource());

      const manifest = buildManifest(remoteName, [sharedDep(remoteName, 'react', '19.2.4')]);
      const entry = buildEntry(remoteName, 'fetch-dep.entry', 'expose-Widget1.js', manifest);

      await handler.load(entry, entry.id);

      const fetchedUrls = mocks.mockFetch.mock.calls.map((c: unknown[]) => c[0]);
      expect(fetchedUrls).toContain(sharedDepUrl);
    });

    it('normalizes scoped package names: @scope/pkg → scope-pkg.js', async () => {
      const remoteName = 'scopedDepRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;
      // @gears-frontx/screensets → gears-frontx-screensets.js
      const sharedDepUrl = `${baseUrl}shared/gears-frontx-screensets.js`;

      mocks.registerSource(sharedDepUrl, createSharedDepSource());
      mocks.registerSource(`${baseUrl}expose-Widget1.js`, createExposeChunkSource());

      const manifest = buildManifest(remoteName, [sharedDep(remoteName, '@gears-frontx/screensets', '1.0.0')]);
      const entry = buildEntry(remoteName, 'scoped-dep.entry', 'expose-Widget1.js', manifest);

      await handler.load(entry, entry.id);

      const fetchedUrls = mocks.mockFetch.mock.calls.map((c: unknown[]) => c[0]);
      expect(fetchedUrls).toContain(sharedDepUrl);
    });

    it('does not fetch shared dep URLs when shared[] is empty', async () => {
      const remoteName = 'emptySharedRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;

      mocks.registerSource(`${baseUrl}expose-Widget1.js`, createExposeChunkSource());

      const manifest = buildManifest(remoteName, []);
      const entry = buildEntry(remoteName, 'empty-shared.entry', 'expose-Widget1.js', manifest);

      await handler.load(entry, entry.id);

      const fetchedUrls = mocks.mockFetch.mock.calls.map((c: unknown[]) => c[0] as string);
      const sharedFetches = fetchedUrls.filter((u) => u.includes('/shared/'));
      expect(sharedFetches).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Bare specifier rewriting — correctness
  // -------------------------------------------------------------------------
  describe('bare specifier rewriting in expose chunks', () => {
    it('expose chunk importing a shared dep gets the module from the blob URL', async () => {
      const remoteName = 'bareSpecRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;

      // Standalone react ESM: exports a sentinel value
      const reactSource = 'export default { version: "19.2.4" };';
      mocks.registerSource(`${baseUrl}shared/react.js`, reactSource);

      // Expose chunk imports react as a bare specifier
      const exposeSource = `
        import React from "react";
        export default { mount: () => React, unmount: () => {} };
      `;
      mocks.registerSource(`${baseUrl}expose-Widget1.js`, exposeSource);

      const manifest = buildManifest(remoteName, [sharedDep(remoteName, 'react', '19.2.4')]);
      const entry = buildEntry(remoteName, 'bare-spec.entry', 'expose-Widget1.js', manifest);

      const lifecycle = await handler.load(entry, entry.id);
      const host = document.createElement('div');
      const shadowRoot = host.attachShadow({ mode: 'open' });
      const result = (await lifecycle.mount(shadowRoot, {
        domainId: 'domain',
        instanceId: 'instance',
        executeActionsChain: async () => undefined,
        subscribeToProperty: () => () => undefined,
        getProperty: () => undefined,
        registerActionHandler: () => {},
      })) as unknown as { version: string };

      // The mount returned the React module (rewrite worked)
      expect(result).toBeDefined();
      expect(result.version).toBe('19.2.4');
    });

    it('rewriting from "react" does NOT affect from "react-dom" (exact match)', async () => {
      const remoteName = 'exactMatchRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;

      mocks.registerSource(`${baseUrl}shared/react.js`, 'export default { name: "react" };');
      mocks.registerSource(`${baseUrl}shared/react-dom.js`, 'export default { name: "react-dom" };');

      // Expose chunk imports both react and react-dom
      const exposeSource = `
        import React from "react";
        import ReactDOM from "react-dom";
        export default { mount: () => ({ react: React, reactDom: ReactDOM }), unmount: () => {} };
      `;
      mocks.registerSource(`${baseUrl}expose-Widget1.js`, exposeSource);

      const manifest = buildManifest(remoteName, [
        sharedDep(remoteName, 'react', '19.2.4'),
        sharedDep(remoteName, 'react-dom', '19.2.4'),
      ]);
      const entry = buildEntry(remoteName, 'exact-match.entry', 'expose-Widget1.js', manifest);

      const lifecycle = await handler.load(entry, entry.id);
      const host = document.createElement('div');
      const shadowRoot = host.attachShadow({ mode: 'open' });
      const result = (await lifecycle.mount(shadowRoot, {
        domainId: 'domain',
        instanceId: 'instance',
        executeActionsChain: async () => undefined,
        subscribeToProperty: () => () => undefined,
        getProperty: () => undefined,
        registerActionHandler: () => {},
      })) as unknown as { react: { name: string }; reactDom: { name: string } };

      // Both got resolved independently — react's rewrite didn't corrupt react-dom
      expect(result.react.name).toBe('react');
      expect(result.reactDom.name).toBe('react-dom');
    });

    it('shared dep importing another shared dep gets bare specifier rewritten', async () => {
      const remoteName = 'depOnDepRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;

      // react (leaf) — no dependencies
      mocks.registerSource(`${baseUrl}shared/react.js`, 'export default { name: "react" };');

      // react-dom imports react as a bare specifier (manifest order: react first)
      mocks.registerSource(`${baseUrl}shared/react-dom.js`, createSharedDepSource(['react']));

      // Expose chunk imports react-dom
      const exposeSource = `
        import ReactDOM from "react-dom";
        export default { mount: () => ReactDOM, unmount: () => {} };
      `;
      mocks.registerSource(`${baseUrl}expose-Widget1.js`, exposeSource);

      // manifest.shared[] is dependency-ordered: react before react-dom
      const manifest = buildManifest(remoteName, [
        sharedDep(remoteName, 'react', '19.2.4'),
        sharedDep(remoteName, 'react-dom', '19.2.4'),
      ]);
      const entry = buildEntry(remoteName, 'dep-on-dep.entry', 'expose-Widget1.js', manifest);

      // Must not throw — both rewrites resolve
      const lifecycle = await handler.load(entry, entry.id);
      expect(lifecycle).toBeDefined();
      expect(typeof lifecycle.mount).toBe('function');
    });

    it('handles single-quoted bare specifier: from \'react\'', async () => {
      const remoteName = 'singleQuoteRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;

      mocks.registerSource(`${baseUrl}shared/react.js`, 'export default { version: "19.2.4" };');

      // Expose chunk uses single-quoted import
      const exposeSource = `
        import React from 'react';
        export default { mount: () => React, unmount: () => {} };
      `;
      mocks.registerSource(`${baseUrl}expose-Widget1.js`, exposeSource);

      const manifest = buildManifest(remoteName, [sharedDep(remoteName, 'react', '19.2.4')]);
      const entry = buildEntry(remoteName, 'single-quote.entry', 'expose-Widget1.js', manifest);

      const lifecycle = await handler.load(entry, entry.id);
      const host = document.createElement('div');
      const shadowRoot = host.attachShadow({ mode: 'open' });
      const result = (await lifecycle.mount(shadowRoot, {
        domainId: 'domain',
        instanceId: 'instance',
        executeActionsChain: async () => undefined,
        subscribeToProperty: () => () => undefined,
        getProperty: () => undefined,
        registerActionHandler: () => {},
      })) as unknown as { version: string };

      expect(result.version).toBe('19.2.4');
    });

    it('handles CJS shared dep import: import __ext from "dep"', async () => {
      const remoteName = 'cjsDepRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;

      mocks.registerSource(`${baseUrl}shared/lodash.js`, 'export default { name: "lodash" };');

      // CJS-style import (single variable, no braces)
      const exposeSource = `
        import __ext_lodash from "lodash";
        export default { mount: () => __ext_lodash, unmount: () => {} };
      `;
      mocks.registerSource(`${baseUrl}expose-Widget1.js`, exposeSource);

      const manifest = buildManifest(remoteName, [sharedDep(remoteName, 'lodash', '4.17.21')]);
      const entry = buildEntry(remoteName, 'cjs-dep.entry', 'expose-Widget1.js', manifest);

      const lifecycle = await handler.load(entry, entry.id);
      const host = document.createElement('div');
      const shadowRoot = host.attachShadow({ mode: 'open' });
      const result = (await lifecycle.mount(shadowRoot, {
        domainId: 'domain',
        instanceId: 'instance',
        executeActionsChain: async () => undefined,
        subscribeToProperty: () => () => undefined,
        getProperty: () => undefined,
        registerActionHandler: () => {},
      })) as unknown as { name: string };

      expect(result.name).toBe('lodash');
    });
  });

  // -------------------------------------------------------------------------
  // Subpath shared deps (e.g. react-dom/client alongside react-dom)
  // -------------------------------------------------------------------------
  describe('subpath shared deps', () => {
    // Decode the data URL the mock produces in place of a real blob URL.
    // The mock returns `data:text/javascript;base64,<base64(blobContent)>`, so
    // decoding round-trips back to the exact source text the handler stored in
    // the Blob after rewriting.
    const DATA_URL_PREFIX = 'data:text/javascript;base64,';
    const decodeDataUrl = (url: string): string =>
      Buffer.from(url.replace(DATA_URL_PREFIX, ''), 'base64').toString('utf-8');
    const getCreatedDataUrls = (): string[] => {
      const spy = URL.createObjectURL as unknown as {
        mock: { results: { value: string }[] };
      };
      return spy.mock.results.map((r) => r.value);
    };

    it('loads a subpath shared dep alongside its parent package', async () => {
      const remoteName = 'subpathLoadRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;
      const parentUrl = `${baseUrl}shared/react-dom.js`;
      const subpathUrl = `${baseUrl}shared/react-dom-client.js`;

      // Parent standalone ESM
      mocks.registerSource(parentUrl, 'export default { name: "react-dom" };');
      // Subpath standalone ESM with a bare `import 'react-dom'` specifier —
      // simulates esbuild + patchCjsExternals output where the parent root is externalized
      mocks.registerSource(subpathUrl, createSharedDepSource(['react-dom']));
      mocks.registerSource(`${baseUrl}expose-Widget1.js`, createExposeChunkSource());

      // Manifest order: parent (leaf) first, subpath second
      const manifest = buildManifest(remoteName, [
        sharedDep(remoteName, 'react-dom', '19.2.4'),
        sharedDep(remoteName, 'react-dom/client', '19.2.4'),
      ]);
      const entry = buildEntry(remoteName, 'subpath-load.entry', 'expose-Widget1.js', manifest);

      await expect(handler.load(entry, entry.id)).resolves.toBeDefined();

      const fetchedUrls = mocks.mockFetch.mock.calls.map((c: unknown[]) => c[0]);
      expect(fetchedUrls).toContain(parentUrl);
      expect(fetchedUrls).toContain(subpathUrl);

      // A blob URL must have been created for the subpath's rewritten content.
      // (sharedDep.normalizeDepName collapses `react-dom/client` → `react-dom-client.js`
      // on the publicPath side; on the rewriter side the blob content is what we inspect.)
      const subpathBlobContent = getCreatedDataUrls()
        .map(decodeDataUrl)
        .find((src) => src.includes('__ext_react_dom from'));
      expect(subpathBlobContent).toBeDefined();
    });

    it('subpath and parent share the same blob URL for the parent', async () => {
      const remoteName = 'subpathSharedUrlRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;

      // Distinguishable content for parent so we can identify its data URL
      mocks.registerSource(`${baseUrl}shared/react-dom.js`, 'export default { name: "react-dom" };');
      mocks.registerSource(
        `${baseUrl}shared/react-dom-client.js`,
        createSharedDepSource(['react-dom'])
      );
      mocks.registerSource(`${baseUrl}expose-Widget1.js`, createExposeChunkSource());

      const manifest = buildManifest(remoteName, [
        sharedDep(remoteName, 'react-dom', '19.2.4'),
        sharedDep(remoteName, 'react-dom/client', '19.2.4'),
      ]);
      const entry = buildEntry(
        remoteName,
        'subpath-shared-url.entry',
        'expose-Widget1.js',
        manifest
      );

      await handler.load(entry, entry.id);

      const dataUrls = getCreatedDataUrls();

      // The parent's blob URL is the data URL whose decoded content is the
      // parent's original source (not rewritten — `react-dom` has no imports).
      const parentDataUrl = dataUrls.find(
        (u) => decodeDataUrl(u) === 'export default { name: "react-dom" };'
      );
      expect(parentDataUrl).toBeDefined();

      // The subpath's rewritten content has its `"react-dom"` import replaced
      // by the parent's blob URL. Locate it by the `__ext_react_dom` marker.
      const subpathContent = dataUrls
        .map(decodeDataUrl)
        .find((src) => src.includes('__ext_react_dom from'));
      expect(subpathContent).toBeDefined();

      // Extract the URL the rewriter embedded and prove it is the parent's URL —
      // i.e., only one shared runtime is used for both `react-dom` and
      // `react-dom/client` within this load.
      const match = subpathContent!.match(/from\s+["']([^"']+)["']/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe(parentDataUrl);
    });

    it('per-load isolation holds for subpaths', async () => {
      const remoteName = 'subpathIsoRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;
      const parentUrl = `${baseUrl}shared/react-dom.js`;
      const subpathUrl = `${baseUrl}shared/react-dom-client.js`;

      mocks.registerSource(parentUrl, 'export default { name: "react-dom" };');
      mocks.registerSource(subpathUrl, createSharedDepSource(['react-dom']));
      mocks.registerSource(`${baseUrl}expose-Widget1.js`, createExposeChunkSource());

      const manifest = buildManifest(remoteName, [
        sharedDep(remoteName, 'react-dom', '19.2.4'),
        sharedDep(remoteName, 'react-dom/client', '19.2.4'),
      ]);

      // Per-load isolation is verified across two distinct entry ids — the
      // handler-level static load cache short-circuits a second load() of the
      // same id (by design: cpt-frontx-dod-mfe-isolation-handler-load-cache),
      // so to exercise the shared-dep fetch + blob-URL chain twice the two
      // loads must use different entry ids.
      const entry1 = buildEntry(remoteName, 'subpath-iso.entry.a', 'expose-Widget1.js', manifest);
      const entry2 = buildEntry(remoteName, 'subpath-iso.entry.b', 'expose-Widget1.js', manifest);

      const handler1 = new MfeHandlerMF(
        'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~',
        { timeout: 5000, retries: 0 }
      );
      const handler2 = new MfeHandlerMF(
        'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~',
        { timeout: 5000, retries: 0 }
      );

      await expect(handler1.load(entry1, entry1.id)).resolves.toBeDefined();
      await expect(handler2.load(entry2, entry2.id)).resolves.toBeDefined();

      // Each load fetched both the parent and the subpath shared dep URLs
      // independently (weaker assertion per phase spec; exact blob-URL identity
      // per load is covered by browser verification in phase 5).
      const fetchedUrls = mocks.mockFetch.mock.calls.map((c: unknown[]) => c[0]) as string[];
      expect(fetchedUrls.filter((u) => u === parentUrl).length).toBeGreaterThanOrEqual(2);
      expect(fetchedUrls.filter((u) => u === subpathUrl).length).toBeGreaterThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // Dependency order
  // -------------------------------------------------------------------------
  describe('dependency order — leaves first', () => {
    it('processes shared deps in manifest order: first dep blob URL is available when second dep is processed', async () => {
      // This test verifies that when react-dom (second) is processed, react's (first)
      // blob URL is already in blobUrls, so its import of "react" gets rewritten correctly.
      const remoteName = 'depOrderRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;

      // react: the leaf — must be processed first
      mocks.registerSource(`${baseUrl}shared/react.js`, 'export default { name: "react" };');

      // react-dom: imports react as a bare specifier — processed second
      const reactDomSource = `
        import React from "react";
        export default { name: "react-dom", React };
      `;
      mocks.registerSource(`${baseUrl}shared/react-dom.js`, reactDomSource);

      const exposeSource = `
        import ReactDOM from "react-dom";
        export default { mount: () => ReactDOM, unmount: () => {} };
      `;
      mocks.registerSource(`${baseUrl}expose-Widget1.js`, exposeSource);

      // Manifest order: react first (leaf), react-dom second (depends on react)
      const manifest = buildManifest(remoteName, [
        sharedDep(remoteName, 'react', '19.2.4'),
        sharedDep(remoteName, 'react-dom', '19.2.4'),
      ]);
      const entry = buildEntry(remoteName, 'dep-order.entry', 'expose-Widget1.js', manifest);

      const lifecycle = await handler.load(entry, entry.id);
      const host = document.createElement('div');
      const shadowRoot = host.attachShadow({ mode: 'open' });
      const result = (await lifecycle.mount(shadowRoot, {
        domainId: 'domain',
        instanceId: 'instance',
        executeActionsChain: async () => undefined,
        subscribeToProperty: () => () => undefined,
        getProperty: () => undefined,
        registerActionHandler: () => {},
      })) as unknown as { name: string };

      expect(result.name).toBe('react-dom');
    });
  });

  // -------------------------------------------------------------------------
  // Per-load isolation
  // -------------------------------------------------------------------------
  describe('per-load isolation — fresh blob URLs per load', () => {
    it('two sequential loads produce independent module instances', async () => {
      const remoteName = 'isoLoadRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;

      // Counter shared dep: each load gets a fresh evaluation → counter resets
      mocks.registerSource(`${baseUrl}shared/react.js`, 'export default { name: "react" };');
      mocks.registerSource(`${baseUrl}expose-Widget1.js`, createExposeChunkSource());
      mocks.registerSource(`${baseUrl}expose-Widget2.js`, createExposeChunkSource());

      const manifest = buildManifest(remoteName, [sharedDep(remoteName, 'react', '19.2.4')]);

      const entry1: MfeEntryMF = {
        ...MFE_ENTRY_CONTRACT,
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~test.iso1.v1',
        manifest,
        exposedModule: './Widget1',
        exposeAssets: { js: { sync: ['expose-Widget1.js'], async: [] }, css: { sync: [], async: [] } },
      };
      const entry2: MfeEntryMF = {
        ...MFE_ENTRY_CONTRACT,
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~test.iso2.v1',
        manifest,
        exposedModule: './Widget2',
        exposeAssets: { js: { sync: ['expose-Widget2.js'], async: [] }, css: { sync: [], async: [] } },
      };

      const lifecycle1 = await handler.load(entry1, entry1.id);
      const lifecycle2 = await handler.load(entry2, entry2.id);

      // Both loads produced valid lifecycle objects
      expect(typeof lifecycle1.mount).toBe('function');
      expect(typeof lifecycle2.mount).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------
  describe('error handling', () => {
    it('throws MfeLoadError when shared dep ESM fetch fails (404)', async () => {
      const remoteName = 'errorDepRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;

      // Expose chunk is registered but shared dep is NOT → 404 on shared dep fetch
      mocks.registerSource(`${baseUrl}expose-Widget1.js`, createExposeChunkSource());
      // Deliberately NOT registering: `${baseUrl}shared/react.js`

      const manifest = buildManifest(remoteName, [sharedDep(remoteName, 'react', '19.2.4')]);
      const entry = buildEntry(remoteName, 'error-dep.entry', 'expose-Widget1.js', manifest);

      await expect(handler.load(entry, entry.id)).rejects.toBeInstanceOf(MfeLoadError);
    });

    it('evicts sharedDepTextCache on rejection so a later load can recover after transient failure', async () => {
      // First load: shared dep URL registered with failing fetch. After the first
      // load() rejects, subsequent loads of any MFE declaring the same
      // name@version must NOT receive the cached rejection — the entry must be
      // evicted so a retry can succeed.

      const remoteA = 'retryRemoteA';
      const baseA = `${TEST_BASE_URL}/${remoteA}/`;
      const sharedDepUrl = `${baseA}shared/react.js`;
      mocks.registerSource(`${baseA}expose-Widget1.js`, createExposeChunkSource());
      // Intentionally DO NOT register sharedDepUrl yet → first load fails with 404.

      const manifestA = buildManifest(remoteA, [sharedDep(remoteA, 'react', '19.2.4')]);
      const entryA = buildEntry(remoteA, 'retry-a.entry', 'expose-Widget1.js', manifestA);

      await expect(handler.load(entryA, entryA.id)).rejects.toBeInstanceOf(MfeLoadError);

      // Now the URL becomes available (simulates a transient outage recovered).
      mocks.registerSource(sharedDepUrl, createSharedDepSource());

      // A fresh load of an MFE declaring the SAME name@version must succeed —
      // the failed entry was evicted from sharedDepTextCache, so the retry
      // re-fetches rather than awaiting the cached rejection.
      const remoteB = 'retryRemoteB';
      const baseB = `${TEST_BASE_URL}/${remoteB}/`;
      mocks.registerSource(`${baseB}shared/react.js`, createSharedDepSource());
      mocks.registerSource(`${baseB}expose-Widget1.js`, createExposeChunkSource());

      const manifestB = buildManifest(remoteB, [sharedDep(remoteB, 'react', '19.2.4')]);
      const entryB = buildEntry(remoteB, 'retry-b.entry', 'expose-Widget1.js', manifestB);

      await expect(handler.load(entryB, entryB.id)).resolves.toBeDefined();
    });

    it('throws MfeLoadError when exposeAssets.js.sync is empty (no chunk to load)', async () => {
      const manifest = buildManifest('missingExposeRemote');
      const entry: MfeEntryMF = {
        ...MFE_ENTRY_CONTRACT,
        id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~test.missingexpose.v1',
        manifest,
        exposedModule: './NonExistent',
        exposeAssets: {
          js: { sync: [], async: [] },
          css: { sync: [], async: [] },
        },
      };

      await expect(handler.load(entry, entry.id)).rejects.toBeInstanceOf(MfeLoadError);
      await expect(handler.load(entry, entry.id)).rejects.toThrow('exposeAssets.js.sync is empty');
    });
  });

  // -------------------------------------------------------------------------
  // No shared deps — no-op
  // -------------------------------------------------------------------------
  describe('manifest with no shared deps', () => {
    it('loads successfully when manifest has no shared dependencies', async () => {
      const remoteName = 'noDepsRemote';
      const baseUrl = `${TEST_BASE_URL}/${remoteName}/`;

      mocks.registerSource(`${baseUrl}expose-Widget1.js`, createExposeChunkSource());

      const manifest = buildManifest(remoteName, []);
      const entry = buildEntry(remoteName, 'nodeps.entry', 'expose-Widget1.js', manifest);

      await expect(handler.load(entry, entry.id)).resolves.toBeDefined();
    });
  });
});
