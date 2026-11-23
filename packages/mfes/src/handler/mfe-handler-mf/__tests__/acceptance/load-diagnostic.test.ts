/**
 * Acceptance: a load on the fetch-list path writes exactly one diagnostic at
 * `console.warn` level naming the manifest, once its listed units are
 * fetched and minted, with the bytes of the units it fetched itself and the
 * realm cache's own figures — or a statement that they are unavailable when
 * the adopted cache has no `getDiagnostics`
 * (`cpt-frontx-flow-mfe-isolation-load`, `inst-emit-load-diagnostic`;
 * `cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous`,
 * `inst-rsdc-adopt`).
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
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
  listOf,
  PUBLIC_PATH,
  unitOf,
} from '../helpers/manifest-builder';
import { createFetchRouter } from '../helpers/fetch-router';
import { stubSuccessfulImport } from '../helpers/blob-module-stub';
import {
  realmCacheDiagnostics,
  resetRealmSharedDepTextCache,
  SHARED_DEP_TEXT_CACHE_SYMBOL,
} from '../helpers/realm-cache';

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
const ENTRY_BODY =
  'import { r } from "react";\nexport default { mount() { return r; }, unmount() {} };\n';
const OWN_TEXT = `export const own = "${'x'.repeat(500)}";\n`;

const diagnosticsOf = (warn: { mock: { calls: unknown[][] } }): string[] =>
  warn.mock.calls
    .map((args) => String(args[0]))
    .filter((message) => message.includes('shared-dependency diagnostics'));

const load = (manifest: ReturnType<typeof buildManifest>, id: string) =>
  newHandler(ENTRY_BASE_ID, { retries: 0 }).load(buildEntry(manifest), id);

describe('acceptance: the per-load shared-dependency diagnostic', () => {
  it('is written once, names the manifest, counts the unit bytes the load fetched and not its own code, and reports the realm cache figures', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: `import "./own.js";\n${ENTRY_BODY}` },
      [`${PUBLIC_PATH}assets/own.js`]: { body: OWN_TEXT },
      [`${PUBLIC_PATH}shared/react/index.abc.js`]: { body: REACT_TEXT },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(router as typeof fetch);
    const manifest = buildManifest([], {
      units: [REACT],
      lists: { './lifecycle': listOf([REACT], { ownChunks: ['assets/own.js'] }) },
    });
    await load(manifest, 'ext-diagnostic');

    const [message, ...others] = diagnosticsOf(warn);
    expect(others).toEqual([]);
    expect(message).toContain(`'${manifest.id}'`);
    expect(message).toContain(`fetched ${new TextEncoder().encode(REACT_TEXT).length} bytes`);
    const figures = realmCacheDiagnostics();
    expect(message).toContain(
      `realm cache holds ${figures.bytes} bytes in ${figures.entries} entries ` +
        `(budget ${figures.budget}, evictions ${figures.evictions})`,
    );
  });

  it('is not written by a load whose unit fails before its listed units are minted, and is kept by a load whose own chunk fails afterwards', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failingUnit = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: ENTRY_BODY },
      [`${PUBLIC_PATH}shared/react/index.abc.js`]: { body: 'missing', notFound: true },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(failingUnit as typeof fetch);
    const manifest = buildManifest([], { units: [REACT], lists: { './lifecycle': listOf([REACT]) } });
    await expect(load(manifest, 'ext-unit-fails')).rejects.toThrow();
    expect(diagnosticsOf(warn)).toEqual([]);

    resetRealmSharedDepTextCache();
    vi.restoreAllMocks();
    const warnAgain = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failingOwn = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: `import "./unlisted.js";\n${ENTRY_BODY}` },
      [`${PUBLIC_PATH}assets/unlisted.js`]: { body: 'missing', notFound: true },
      [`${PUBLIC_PATH}shared/react/index.abc.js`]: { body: REACT_TEXT },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(failingOwn as typeof fetch);
    await expect(load(manifest, 'ext-own-fails')).rejects.toThrow();
    expect(diagnosticsOf(warnAgain)).toHaveLength(1);
  });

  it('states that the figures are unavailable when the adopted realm cache has no getDiagnostics, and the load completes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // An entry another copy published: `get`, `set` and `delete`, no `getDiagnostics`.
    Reflect.set(globalThis, SHARED_DEP_TEXT_CACHE_SYMBOL, {
      v: 1,
      cache: new Map<string, Promise<string>>(),
    });
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: ENTRY_BODY },
      [`${PUBLIC_PATH}shared/react/index.abc.js`]: { body: REACT_TEXT },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(router as typeof fetch);
    const manifest = buildManifest([], { units: [REACT], lists: { './lifecycle': listOf([REACT]) } });

    await expect(load(manifest, 'ext-adopted-no-diagnostics')).resolves.toBeDefined();
    const [message, ...others] = diagnosticsOf(warn);
    expect(others).toEqual([]);
    expect(message).toContain('unavailable');
  });
});
