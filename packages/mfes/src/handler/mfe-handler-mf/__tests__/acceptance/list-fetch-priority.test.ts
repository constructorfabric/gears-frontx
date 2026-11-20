/**
 * Acceptance: the entry module is requested with high fetch priority — it
 * is the last file an extension's mount waits on — while the units the
 * manifest-held list names keep the default priority.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubbedDynamicModuleOps } from '../helpers/blob-module-stub';

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

import { newHandler } from '../helpers/registered-manifest';
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
  PUBLIC_PATH,
  sharedDep,
  listOf,
  unitOf,
} from '../helpers/manifest-builder';
import { createFetchRouter } from '../helpers/fetch-router';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

const ITEM_TEXT = 'export const r = 1;\n';
const REACT = unitOf('shared/react/index.abc.js', ITEM_TEXT, ['react']);

describe('acceptance: entry module fetch priority', () => {
  it('requests the entry module with priority high and the list units with the default priority', async () => {
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: 'export default {};' },
      [`${PUBLIC_PATH}shared/react/index.abc.js`]: { body: ITEM_TEXT },
    });
    const inits = new Map<string, RequestInit | undefined>();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(((input: string | URL | Request, init?: RequestInit) => {
        inits.set(String(input), init);
        return router(input);
      }) as typeof fetch);
    const manifest = buildManifest([sharedDep('react')], {
      units: [REACT],
      lists: { './lifecycle': listOf([REACT]) },
    });
    try {
      await newHandler(ENTRY_BASE_ID, { retries: 0 })
        .load(buildEntry(manifest), 'ext-priority')
        .catch(() => undefined);
    } finally {
      fetchSpy.mockRestore();
    }
    expect(inits.get(`${PUBLIC_PATH}assets/lifecycle.js`)).toEqual({ priority: 'high' });
    expect(inits.has(`${PUBLIC_PATH}shared/react/index.abc.js`)).toBe(true);
    expect(inits.get(`${PUBLIC_PATH}shared/react/index.abc.js`)).toBeUndefined();
  });
});
