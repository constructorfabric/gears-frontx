/**
 * Acceptance: manifest data the handler refuses before any request, and the
 * declared specifiers that must not survive a rewrite
 * (`cpt-frontx-flow-mfe-loading-on-demand-load` `inst-if-manifest-invalid`,
 * `cpt-frontx-algo-mfe-isolation-blob-url-chain` `inst-raise-own-bare-specifier`,
 * `cpt-frontx-algo-mfe-isolation-unit-memo-minting` `inst-umm-unresolved-specifiers`).
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

import { newHandler } from '../helpers/registered-manifest';
import { MfeLoadError } from '../../../../errors';
import { RetryableLoadError } from '../../RetryableLoadError';
import { LazyLoaderRegistry } from '../../../../lazy-loader/LazyLoaderRegistry';
import type { MfManifest } from '../../../../manifest/mf-manifest';
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
  jsonManifest,
  listOf,
  PUBLIC_PATH,
  sharedDep,
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

function route(entryBody: string, extra: Record<string, string> = {}) {
  const routes: Record<string, { body: string }> = {
    [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: entryBody },
    [`${PUBLIC_PATH}shared/react/index.abc.js`]: { body: REACT_TEXT },
  };
  for (const [path, body] of Object.entries(extra)) routes[`${PUBLIC_PATH}${path}`] = { body };
  const router = createFetchRouter(routes);
  vi.spyOn(globalThis, 'fetch').mockImplementation(router as typeof fetch);
  return router;
}

const load = (manifest: MfManifest, id = 'ext') =>
  newHandler(ENTRY_BASE_ID, { retries: 0 }).load(buildEntry(manifest), id);

describe('acceptance: a manifest that names lists refuses what they cannot deliver', () => {
  it('rejects, naming the missing key, a manifest with units or lists but no list for the exposed module', async () => {
    const router = route('export default {};');
    const manifest = buildManifest([], { units: [REACT], lists: { './other': listOf([REACT]) } });
    const error = await load(manifest).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MfeLoadError);
    expect(String((error as Error).message)).toContain('./lifecycle');
    expect(error).not.toBeInstanceOf(RetryableLoadError);
    expect(router.calls).toEqual([]);
  });

  it('rejects a manifest with a unit table but no lists at all', async () => {
    const router = route('export default {};');
    const error = await load(buildManifest([], { units: [REACT] })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MfeLoadError);
    expect(String((error as Error).message)).toContain('./lifecycle');
    expect(router.calls).toEqual([]);
  });

  it.each([
    ['an empty ownChunks entry', { ownChunks: [''] }],
    ['a non-string ownChunks entry', { ownChunks: JSON.parse('[42]') }],
  ])('refuses %s of a reachable list before any request', async (_name, rest) => {
    const router = route('export default {};');
    const manifest = buildManifest([], {
      units: [REACT],
      lists: { './lifecycle': listOf([REACT], rest) },
    });
    const error = await load(manifest).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MfeLoadError);
    expect(String((error as Error).message)).toContain('ownChunks');
    expect(error).not.toBeInstanceOf(RetryableLoadError);
    expect(router.calls).toEqual([]);
  });

  it('refuses an empty key a reachable list names, before any request', async () => {
    const router = route('export default {};');
    const manifest = buildManifest([], { units: [REACT] });
    manifest.lists = { './lifecycle': { units: [REACT.contentHash], ownChunks: [], lazy: [''] } };
    const error = await load(manifest).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MfeLoadError);
    expect(String((error as Error).message)).toContain('list key');
    expect(router.calls).toEqual([]);
  });
});

describe('acceptance: a declared specifier that survives a rewrite fails the load', () => {
  const entryImporting = (specifier: string): string =>
    `import { r } from "react";\nimport "${specifier}";\nexport default { mount() { return r; }, unmount() {} };\n`;

  it('fails the load, naming the own chunk, the specifier and the microfrontend, when a declared specifier no list unit delivers survives in an own chunk', async () => {
    // `lodash` is answered by a unit of the table, but the entry's list does not deliver it.
    const LODASH_TEXT = 'export const l = 1;\n';
    const LODASH = unitOf('shared/lodash/index.def.js', LODASH_TEXT, ['lodash']);
    const router = route(entryImporting('lodash'), { 'shared/lodash/index.def.js': LODASH_TEXT });
    const manifest = buildManifest([], {
      units: [REACT, LODASH],
      lists: { './lifecycle': listOf([REACT]) },
    });
    const error = await load(manifest, 'ext-own-survivor').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MfeLoadError);
    const message = String((error as Error).message);
    expect(message).toContain('assets/lifecycle.js');
    expect(message).toContain("'lodash'");
    expect(message).toContain('mock.mfe.entry.v1~test.entry.v1');
    expect(error).not.toBeInstanceOf(RetryableLoadError);
    expect(router.calls.filter((c) => c.endsWith('assets/lifecycle.js'))).toHaveLength(1);
  });

  it('fails the load, naming the unit, the specifier and the microfrontend, when a declared specifier survives in a list item', async () => {
    const LODASH = unitOf('shared/lodash/index.def.js', 'export const l = 1;\n', ['lodash']);
    // The item imports `lodash`, which a table unit answers but the load never delivers.
    const ITEM_TEXT = 'import "lodash";\nexport const i = 1;\n';
    const ITEM = unitOf('shared/item/index.ghi.js', ITEM_TEXT, ['item'], ['lodash']);
    const router = route(entryImporting('item'), { 'shared/item/index.ghi.js': ITEM_TEXT });
    const manifest = buildManifest([], {
      units: [REACT, LODASH, ITEM],
      lists: { './lifecycle': listOf([REACT, ITEM]) },
    });
    const error = await load(manifest, 'ext-item-survivor').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MfeLoadError);
    const message = String((error as Error).message);
    expect(message).toContain('shared/item/index.ghi.js');
    expect(message).toContain("'lodash'");
    expect(message).toContain('mock.mfe.entry.v1~test.entry.v1');
    expect(error).not.toBeInstanceOf(RetryableLoadError);
    expect(router.calls.length).toBeGreaterThan(0);
  });

  it('fails only that lazy import, on the lazy target\'s first use, when a declared specifier survives in a unit the target brings', async () => {
    const LODASH = unitOf('shared/lodash/index.def.js', 'export const l = 1;\n', ['lodash']);
    // The lazy target's unit imports `lodash`, which a table unit answers but no list delivers.
    const LAZY_TEXT = 'import "lodash";\nexport const z = 1;\n';
    const LAZY = unitOf('shared/lazy/index.jkl.js', LAZY_TEXT, ['lazy-unit'], ['lodash']);
    route(
      'import { r } from "react";\nexport const l = () => __frontx_lazy(\'./lazy.js\');\nexport default { mount() { return r; }, unmount() {} };\n',
      { 'shared/lazy/index.jkl.js': LAZY_TEXT, 'assets/lazy.js': 'export const z = 1;\n' }
    );
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    const manifest = buildManifest([], {
      units: [REACT, LODASH, LAZY],
      lists: { './lifecycle': listOf([REACT], { lazy: { 'assets/lazy.js': listOf([LAZY]) } }) },
    });
    await expect(load(manifest, 'ext-lazy-survivor')).resolves.toBeDefined();
    const resolver = register.mock.calls[0]![0];
    const error = await resolver('./lazy.js').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MfeLoadError);
    expect(String((error as Error).message)).toContain('shared/lazy/index.jkl.js');
    expect(String((error as Error).message)).toContain("'lodash'");
  });

  it('does not fail a unit whose text merely contains a declared specifier outside its own imports and outside an import statement', async () => {
    const LODASH = unitOf('shared/lodash/index.def.js', 'export const l = 1;\n', ['lodash']);
    // `lodash` appears in a string and a comment, and is no edge of the unit.
    const ITEM_TEXT = 'const note = \'import "lodash"\'; // from "lodash"\nexport const i = note;\n';
    const ITEM = unitOf('shared/item/index.mno.js', ITEM_TEXT, ['item']);
    route(entryImporting('item'), { 'shared/item/index.mno.js': ITEM_TEXT });
    const manifest = buildManifest([], {
      units: [REACT, LODASH, ITEM],
      lists: { './lifecycle': listOf([REACT, ITEM]) },
    });
    await expect(load(manifest, 'ext-text-only')).resolves.toBeDefined();
  });

  it('warns, naming the chunk, the specifier and the microfrontend, about an undeclared well-formed package specifier in an own chunk and proceeds', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    route(entryImporting('left-pad'));
    const manifest = buildManifest([], {
      units: [REACT],
      lists: { './lifecycle': listOf([REACT]) },
    });
    await expect(load(manifest, 'ext-undeclared')).resolves.toBeDefined();
    const message = warn.mock.calls.map((args) => String(args[0])).find((m) => m.includes('left-pad'));
    expect(message).toBeDefined();
    expect(message).toContain('assets/lifecycle.js');
    expect(message).toContain('mock.mfe.entry.v1~test.entry.v1');
  });
});

describe('acceptance: a whole-package manifest older producers wrote loads unmodified', () => {
  it('registers and loads a shared[] manifest carrying unwrapKey, name, remoteEntry and the metaData extras through the whole-package path', async () => {
    const LIB_TEXT = 'export const lib = 1;\n';
    const manifest = jsonManifest({
      id: 'mock.mfe.mf_manifest.v1~legacy.manifest.v1',
      name: 'legacy',
      remoteEntry: `${PUBLIC_PATH}assets/remoteEntry.js`,
      metaData: {
        publicPath: PUBLIC_PATH,
        name: 'legacy',
        type: 'app',
        globalName: 'legacy',
        buildInfo: { buildVersion: '1.0.0', buildName: 'legacy' },
        remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' },
      },
      shared: [{ ...sharedDep('legacy-lib'), unwrapKey: null }],
    });
    const router = route(
      'import { lib } from "legacy-lib";\nexport default { mount() { return lib; }, unmount() {} };\n',
      { 'shared/legacy-lib.js': LIB_TEXT }
    );
    await expect(load(manifest, 'ext-legacy')).resolves.toBeDefined();
    expect(router.calls.sort()).toEqual(
      [`${PUBLIC_PATH}assets/lifecycle.js`, `${PUBLIC_PATH}shared/legacy-lib.js`].sort()
    );
  });
});

describe('acceptance: a fetch list whose unminted items form an import cycle', () => {
  it('fails the load with an MfeLoadError naming the chunks and the microfrontend, after one attempt', async () => {
    const A_TEXT = 'import "b";\nexport const a = 1;\n';
    const B_TEXT = 'import "a";\nexport const b = 1;\n';
    const A = unitOf('shared/a.js', A_TEXT, ['a'], ['b']);
    const B = unitOf('shared/b.js', B_TEXT, ['b'], ['a']);
    const router = route('import "a";\nexport default {};\n', {
      'shared/a.js': A_TEXT,
      'shared/b.js': B_TEXT,
    });
    const manifest = buildManifest([], { units: [A, B], lists: { './lifecycle': listOf([A, B]) } });
    // Retries are allowed; a cycle is decided by declared data, so none is made.
    const error = await newHandler(ENTRY_BASE_ID, { retries: 2 })
      .load(buildEntry(manifest), 'ext-cycle')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MfeLoadError);
    const message = String((error as Error).message);
    expect(message).toContain('shared/a.js');
    expect(message).toContain('shared/b.js');
    expect(message).toContain('mock.mfe.entry.v1~test.entry.v1');
    expect(error).not.toBeInstanceOf(RetryableLoadError);
    expect(router.calls.filter((c) => c.endsWith('shared/a.js'))).toHaveLength(1);
  });
});

describe('acceptance: sharedBase', () => {
  it('requests the shared units under sharedBase and the entry module, own chunks and stylesheets under publicPath; a relative sharedBase resolves against the publicPath directory', async () => {
    const own = 'import "./own.js";\nimport { r } from "react";\nexport default { mount() { return r; }, unmount() {} };\n';
    // A sharedBase relative to publicPath: its units resolve under `<publicPath>cdn/`.
    const routerShared = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: own },
      [`${PUBLIC_PATH}assets/own.js`]: { body: 'export const o = 1;\n' },
      [`${PUBLIC_PATH}cdn/shared/react/index.abc.js`]: { body: REACT_TEXT },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(routerShared as typeof fetch);
    const manifest = buildManifest([], {
      metaData: { sharedBase: 'cdn/' },
      units: [REACT],
      lists: { './lifecycle': listOf([REACT]) },
    });
    await newHandler(ENTRY_BASE_ID, { retries: 0 }).load(buildEntry(manifest), 'ext-shared-base');
    expect(routerShared.calls.sort()).toEqual(
      [
        `${PUBLIC_PATH}assets/lifecycle.js`,
        `${PUBLIC_PATH}assets/own.js`,
        `${PUBLIC_PATH}cdn/shared/react/index.abc.js`,
      ].sort()
    );
  });
});
