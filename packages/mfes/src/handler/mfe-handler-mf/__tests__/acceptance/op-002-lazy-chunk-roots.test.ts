/**
 * Acceptance: OP-002 — `lazyChunkRoots` are honoured: a lazy chunk's
 * declared roots reach units the entry never fetched, those units are
 * fetched and minted when the lazy chunk resolves, and the load's unit
 * map is extended — never rewritten.
 *
 * The acceptance test drives `handler.load()` and a real lazy resolve
 * through the `__FRONTX_LAZY__` ABI (the loader id captured from
 * `LazyLoaderRegistry.register`) — no private-method casts — so a dropped
 * `sharedDepUnits` context fails the test.
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
import { LazyLoaderRegistry } from '../../../../lazy-loader/LazyLoaderRegistry';
import {
  buildEntry,
  buildGraphFile,
  buildManifest,
  ENTRY_BASE_ID,
  graphSharedDep,
  PUBLIC_PATH,
} from '../helpers/manifest-builder';
import { createFetchRouter } from '../helpers/fetch-router';
import { captureMintedSources } from '../helpers/minted-sources';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

const lazyGlobal = (): { resolve(id: string, path: string): Promise<string> } =>
  (globalThis as unknown as {
    __FRONTX_LAZY__: { resolve(id: string, path: string): Promise<string> };
  }).__FRONTX_LAZY__;

describe('acceptance: OP-002 lazy chunk reachability', () => {
  it('OP-002: units reached only through lazyChunkRoots are fetched and minted when the lazy chunk resolves through the real ABI', async () => {
    const MAIN_SRC = 'export const main = 1;\n';
    const LAZY_ONLY_SRC = 'export const lazyOnly = 1;\n';
    const react = buildGraphFile(
      'react',
      '1.0.0',
      [
        { modulePaths: ['index.js'], source: MAIN_SRC },
        { modulePaths: ['lazy-only.js'], source: LAZY_ONLY_SRC },
      ],
      'index.js',
      [],
    );
    const dep = graphSharedDep('react', react);
    const manifest = buildManifest([dep], {
      entryRoots: { './lifecycle': ['react'] },
      lazyChunkRoots: { 'assets/lazy.js': ['react/lazy-only'] },
    });
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nconst l = __frontx_lazy(\'./lazy.js\');\nexport default {};',
      },
      [`${PUBLIC_PATH}assets/lazy.js`]: {
        body: 'import "react/lazy-only";\nexport const l = 1;',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: react.text },
      [`${PUBLIC_PATH}${react.unitLocations[0]}`]: { body: MAIN_SRC },
      [`${PUBLIC_PATH}${react.unitLocations[1]}`]: { body: LAZY_ONLY_SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const registerSpy = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-op002'),
      ).resolves.toBeDefined();
      // A real lazy resolve through the exposed ABI: the entry chunk's
      // `__frontx_lazy(` call minted the loader stub, whose resolver id
      // routes back to this load's shared-dep unit context.
      expect(registerSpy).toHaveBeenCalled();
      const loaderId = registerSpy.mock.results[0].value as string;
      const blobUrl = await lazyGlobal().resolve(loaderId, './lazy.js');
      expect(blobUrl).toMatch(/^blob:/);
      // The lazily reached unit was fetched — a dropped sharedDepUnits
      // context would leave it unfetched and its specifier unrewritten.
      expect(router.calls).toContain(
        `${PUBLIC_PATH}${react.unitLocations[1]}`,
      );
    } finally {
      registerSpy.mockRestore();
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('OP-002/RF-001: a lazy unit relative-imports a unit the entry mint already delivered — the import rewrites to the existing blob', async () => {
    const MAIN_SRC = 'export const main = 1;\n';
    const LAZY_SRC = 'import "./index.js";\nexport const lazyOnly = 1;\n';
    const react = buildGraphFile(
      'react',
      '1.0.0',
      [
        { modulePaths: ['index.js'], source: MAIN_SRC },
        {
          modulePaths: ['lazy-only.js'],
          relativeImports: ['./index.js'],
          source: LAZY_SRC,
        },
      ],
      'index.js',
      [],
    );
    const dep = graphSharedDep('react', react);
    const manifest = buildManifest([dep], {
      entryRoots: { './lifecycle': ['react'] },
      lazyChunkRoots: { 'assets/lazy.js': ['react/lazy-only'] },
    });
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nconst l = __frontx_lazy(\'./lazy.js\');\nexport default {};',
      },
      [`${PUBLIC_PATH}assets/lazy.js`]: {
        body: 'import "react/lazy-only";\nexport const l = 1;',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: react.text },
      [`${PUBLIC_PATH}${react.unitLocations[0]}`]: { body: MAIN_SRC },
      [`${PUBLIC_PATH}${react.unitLocations[1]}`]: { body: LAZY_SRC },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const registerSpy = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    const minted = captureMintedSources();
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    try {
      await handler.load(buildEntry(manifest), 'ext-op002-rel');
      const loaderId = registerSpy.mock.results[0].value as string;
      await lazyGlobal().resolve(loaderId, './lazy.js');
      const sources = await minted.sources();
      const lazyUnit = sources.find((s) => s.includes('lazyOnly'));
      expect(lazyUnit).toBeDefined();
      // The relative import to the already-minted entry unit resolved to
      // that unit's blob — never left as the raw './index.js' specifier.
      expect(lazyUnit).toContain('import "blob:');
      expect(lazyUnit).not.toContain('"./index.js"');
    } finally {
      minted.restore();
      registerSpy.mockRestore();
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('OP-002/RF-002: a failed lazy unit build marks nothing minted and a later resolve retries', async () => {
    const MAIN_SRC = 'export const main = 1;\n';
    const LAZY_SRC = 'export const lazyOnly = 1;\n';
    const react = buildGraphFile(
      'react',
      '1.0.0',
      [
        { modulePaths: ['index.js'], source: MAIN_SRC },
        { modulePaths: ['lazy-only.js'], source: LAZY_SRC },
      ],
      'index.js',
      [],
    );
    const dep = graphSharedDep('react', react);
    const manifest = buildManifest([dep], {
      entryRoots: { './lifecycle': ['react'] },
      lazyChunkRoots: { 'assets/lazy.js': ['react/lazy-only'] },
    });
    // The lazy unit's first fetch fails; the second serves it.
    let lazyUnitCalls = 0;
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nconst l = __frontx_lazy(\'./lazy.js\');\nexport default {};',
      },
      [`${PUBLIC_PATH}assets/lazy.js`]: {
        body: 'import "react/lazy-only";\nexport const l = 1;',
      },
      [`${PUBLIC_PATH}shared/react.graph.json`]: { body: react.text },
      [`${PUBLIC_PATH}${react.unitLocations[0]}`]: { body: MAIN_SRC },
    });
    const baseImpl = router;
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(((input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith(react.unitLocations[1])) {
          lazyUnitCalls += 1;
          if (lazyUnitCalls === 1) {
            return Promise.reject(new TypeError('network error for test'));
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => 'application/javascript' },
            text: () => Promise.resolve(LAZY_SRC),
          } as unknown as Response);
        }
        return baseImpl(input);
      }) as typeof fetch);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const registerSpy = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    stubSuccessfulImport(blobModuleStub);
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    try {
      await handler.load(buildEntry(manifest), 'ext-op002-retry');
      const loaderId = registerSpy.mock.results[0].value as string;
      // First lazy resolve fails mid-build; the rejection must not latch.
      await expect(
        lazyGlobal().resolve(loaderId, './lazy.js'),
      ).rejects.toThrow(MfeLoadError);
      // The retry refetches the unit (the rejected build was evicted from
      // `pending`, and no key was wrongly marked minted) and succeeds.
      const blobUrl = await lazyGlobal().resolve(loaderId, './lazy.js');
      expect(blobUrl).toMatch(/^blob:/);
      expect(lazyUnitCalls).toBeGreaterThanOrEqual(2);
    } finally {
      registerSpy.mockRestore();
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});
