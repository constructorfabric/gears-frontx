/**
 * Acceptance: the handler source-text cache holds only the microfrontend's
 * own code — its entry module and the own chunks of a fetch list — while
 * list units and whole-package entries reach the realm cache alone, so the
 * realm byte budget bounds all retained shared text
 * (`cpt-frontx-dod-mfe-isolation-handler-source-text-cache`,
 * `inst-whole-package-bypass-handler-cache`).
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
import type { LruCache } from '../../LruCache';
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
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

const ENTRY_URL = `${PUBLIC_PATH}assets/lifecycle.js`;
const ENTRY_BODY =
  'import "./own.js";\nimport { r } from "react";\nexport default { mount() { return r; }, unmount() {} };\n';
const REACT_TEXT = 'export const r = 1;\n';

const handlerCacheOf = (handler: object): LruCache<string, Promise<string>> =>
  Reflect.get(handler, 'sourceTextCache');

describe('acceptance: what the handler source-text cache holds', () => {
  it('holds the entry module and the listed own chunk, and neither a list unit nor its text', async () => {
    const REACT = unitOf('shared/react/index.abc.js', REACT_TEXT, ['react']);
    const router = createFetchRouter({
      [ENTRY_URL]: { body: ENTRY_BODY },
      [`${PUBLIC_PATH}assets/own.js`]: { body: 'export const o = 2;\n' },
      [`${PUBLIC_PATH}shared/react/index.abc.js`]: { body: REACT_TEXT },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(router as typeof fetch);
    const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest([], {
      units: [REACT],
      lists: { './lifecycle': listOf([REACT], { ownChunks: ['assets/own.js'] }) },
    });
    await handler.load(buildEntry(manifest), 'ext-list-cache');

    const cache = handlerCacheOf(handler);
    expect(cache.has(ENTRY_URL)).toBe(true);
    expect(cache.has(`${PUBLIC_PATH}assets/own.js`)).toBe(true);
    expect(cache.has(`${PUBLIC_PATH}shared/react/index.abc.js`)).toBe(false);
    expect(router.calls).toContain(`${PUBLIC_PATH}shared/react/index.abc.js`);
  });

  it('holds the entry module and an own chunk, and no whole-package entry', async () => {
    const router = createFetchRouter({
      [ENTRY_URL]: { body: ENTRY_BODY },
      [`${PUBLIC_PATH}assets/own.js`]: { body: 'export const o = 2;\n' },
      [`${PUBLIC_PATH}shared/react.js`]: { body: REACT_TEXT },
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(router as typeof fetch);
    const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
    await handler.load(buildEntry(buildManifest([sharedDep('react')])), 'ext-whole-package-cache');

    const cache = handlerCacheOf(handler);
    expect(cache.has(ENTRY_URL)).toBe(true);
    expect(cache.has(`${PUBLIC_PATH}assets/own.js`)).toBe(true);
    expect(cache.has(`${PUBLIC_PATH}shared/react.js`)).toBe(false);
    expect(router.calls).toContain(`${PUBLIC_PATH}shared/react.js`);
  });
});
