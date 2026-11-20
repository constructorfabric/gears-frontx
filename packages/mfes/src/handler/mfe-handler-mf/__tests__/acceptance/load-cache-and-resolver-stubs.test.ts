/**
 * Acceptance: the load cache and the per-load lazy resolver
 * (`cpt-frontx-state-mfe-isolation-module-lifecycle` `inst-remount`,
 * `cpt-frontx-flow-mfe-isolation-load` `inst-check-cache`,
 * `cpt-frontx-algo-mfe-loading-lazy-import-abi` `inst-lai-register-resolver`):
 * re-loading an extension instance reuses its entry and mints no blob, no blob
 * URL is ever revoked, a call from one load routes to that load's resolver, a
 * manifest without fetch lists walks its own chunk graph, and a registry answer
 * without `shared` is cached under its `id`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubbedDynamicModuleOps } from '../helpers/blob-module-stub';

const blobModuleStub = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../../mf-dynamic-module-ops', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../mf-dynamic-module-ops')>();
  return {
    ...actual,
    DynamicModuleOps: stubbedDynamicModuleOps(actual.DynamicModuleOps, blobModuleStub),
  };
});

import { newHandler, registerManifest } from '../helpers/registered-manifest';
import { LazyLoaderRegistry } from '../../../../lazy-loader/LazyLoaderRegistry';
import type { MfManifest } from '../../../../manifest/mf-manifest';
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
  listOf,
  unitOf,
} from '../helpers/manifest-builder';
import { createFetchRouter } from '../helpers/fetch-router';
import { stubSuccessfulImport } from '../helpers/blob-module-stub';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';

beforeEach(() => {
  resetRealmSharedDepTextCache();
  stubSuccessfulImport(blobModuleStub);
});
afterEach(() => {
  resetRealmSharedDepTextCache();
  blobModuleStub.current = undefined;
  vi.restoreAllMocks();
});

const REACT_TEXT = 'export const r = 1;\n';
const REACT = unitOf('shared/react/index.abc.js', REACT_TEXT, ['react']);
const entryWithLazy = (target: string): string =>
  'import { r } from "react";\n' +
  `export const l = () => __frontx_lazy('${target}');\n` +
  'export default { mount() { return r; }, unmount() {} };\n';

function manifestAt(publicPath: string, name: string): MfManifest {
  const manifest = buildManifest([], {
    metaData: { publicPath },
    units: [REACT],
    lists: { './lifecycle': listOf([REACT], { lazy: { 'assets/lazy.js': listOf([]) } }) },
  });
  return { ...manifest, id: `mock.mfe.mf_manifest.v1~${name}.v1` };
}

function routeFor(publicPaths: string[]) {
  const routes: Record<string, { body: string }> = {};
  for (const base of publicPaths) {
    routes[`${base}assets/lifecycle.js`] = { body: entryWithLazy('./lazy.js') };
    routes[`${base}shared/react/index.abc.js`] = { body: REACT_TEXT };
    routes[`${base}assets/lazy.js`] = { body: 'export const z = 1;\n' };
  }
  const router = createFetchRouter(routes);
  vi.spyOn(globalThis, 'fetch').mockImplementation(router as typeof fetch);
  return router;
}

describe('acceptance: the load cache', () => {
  it('reuses the load-cache entry of an extension instance on a later load: no request, no new blob URL, no revoke', async () => {
    const base = 'http://cache.test/';
    const router = routeFor([base]);
    const create = vi.spyOn(URL, 'createObjectURL');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
    const entry = buildEntry(manifestAt(base, 'cache'));

    const first = await handler.load(entry, 'ext-load-cache-reuse');
    const requests = router.calls.length;
    const blobs = create.mock.calls.length;
    expect(blobs).toBeGreaterThan(0);

    // A re-load, an unmount and re-mount, and a re-registration all load the same instance again.
    const again = await handler.load(entry, 'ext-load-cache-reuse');
    const fromAnotherHandler = await newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
      entry,
      'ext-load-cache-reuse'
    );

    expect(again).toBe(first);
    expect(fromAnotherHandler).toBe(first);
    expect(router.calls.length).toBe(requests);
    expect(create.mock.calls.length).toBe(blobs);
    expect(revoke).not.toHaveBeenCalled();
  });

  it('keeps the entry of one instance when many other instances load: nothing evicts it for capacity', async () => {
    const base = 'http://cache-many.test/';
    const router = routeFor([base]);
    const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
    const entry = buildEntry(manifestAt(base, 'cache-many'));
    const first = await handler.load(entry, 'ext-load-cache-keep');
    for (let i = 0; i < 300; i += 1) await handler.load(entry, `ext-load-cache-filler-${String(i)}`);
    const requests = router.calls.length;
    expect(await handler.load(entry, 'ext-load-cache-keep')).toBe(first);
    expect(router.calls.length).toBe(requests);
  });
});

describe('acceptance: a call from one load routes to that load\'s resolver', () => {
  it('registers a distinct resolver per load and routes a lazy call by loader id to its own load', async () => {
    const a = 'http://load-a.test/';
    const b = 'http://load-b.test/';
    const router = routeFor([a, b]);
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
    await handler.load(buildEntry(manifestAt(a, 'load-a')), 'ext-resolver-a');
    await handler.load(buildEntry(manifestAt(b, 'load-b')), 'ext-resolver-b');
    expect(register).toHaveBeenCalledTimes(2);
    const ids = register.mock.results.map((r) => String(r.value));
    expect(new Set(ids).size).toBe(2);

    const globalRegistry = (globalThis as unknown as {
      __FRONTX_LAZY__: { resolve(id: string, path: string): Promise<string> };
    }).__FRONTX_LAZY__;
    const before = router.calls.length;
    // The call names load A's id: only A's own lazy chunk is requested.
    const blob = await globalRegistry.resolve(ids[0]!, './lazy.js');
    expect(blob).toMatch(/^blob:/);
    const requested = router.calls.slice(before);
    expect(requested.some((u) => u.startsWith(a))).toBe(true);
    expect(requested.some((u) => u.startsWith(b))).toBe(false);
  });
});

describe('acceptance: a manifest without fetch lists', () => {
  it('walks the chunk graph of its own chunks and fetches no whole-package entry', async () => {
    const base = 'http://walk.test/';
    const router = createFetchRouter({
      [`${base}assets/lifecycle.js`]: {
        body: 'import "./dep-a.js";\nexport default { mount() {}, unmount() {} };\n',
      },
      [`${base}assets/dep-a.js`]: { body: 'import "./dep-b.js";\nexport const a = 1;\n' },
      [`${base}assets/dep-b.js`]: { body: 'export const b = 2;\n' },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(router as typeof fetch);
    const manifest = {
      id: 'mock.mfe.mf_manifest.v1~walk.v1',
      metaData: { publicPath: base },
    } as MfManifest;
    await newHandler(ENTRY_BASE_ID, { retries: 0 }).load(buildEntry(manifest), 'ext-walk');
    expect(router.calls.sort()).toEqual(
      [`${base}assets/lifecycle.js`, `${base}assets/dep-a.js`, `${base}assets/dep-b.js`].sort()
    );
  });
});

describe('acceptance: the manifest the registry answers', () => {
  it('accepts an object with a string id and an object metaData and no shared, and caches it under its id', async () => {
    const base = 'http://cached-manifest.test/';
    const router = createFetchRouter({
      [`${base}assets/lifecycle.js`]: { body: 'export default { mount() {}, unmount() {} };\n' },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(router as typeof fetch);
    const manifest = { id: 'mock.mfe.mf_manifest.v1~cached.v1', metaData: { publicPath: base } } as MfManifest;
    const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
    const entry = buildEntry(manifest);
    await handler.load(entry, 'ext-cached-1');
    // The registry no longer answers for the id: a second extension of the same manifest
    // is served from the handler's cache under that id.
    registerManifest({ id: manifest.id } as unknown as MfManifest);
    await expect(handler.load(entry, 'ext-cached-2')).resolves.toBeDefined();
  });
});
