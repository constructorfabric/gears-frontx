/**
 * Acceptance: the entry's list document is requested with high fetch
 * priority — it opens the critical path to an extension's mount, so the
 * lists of every extension loading at startup are requested together and
 * first — while the items the list names keep the default priority.
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

import { MfeHandlerMF } from '../../MfeHandlerMF';
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
  PUBLIC_PATH,
  sharedDep,
  sha256Hex,
} from '../helpers/manifest-builder';
import { createFetchRouter } from '../helpers/fetch-router';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

const ITEM_TEXT = 'export const r = 1;\n';
const LIST_DOC = JSON.stringify({
  items: [
    {
      location: 'shared/react/index.abc.js',
      contentHash: sha256Hex(ITEM_TEXT),
      answers: ['react'],
      imports: [],
    },
  ],
});

describe('acceptance: list-document fetch priority', () => {
  it('requests the entry list document with priority high and the items with the default priority', async () => {
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: { body: 'export default {};' },
      [`${PUBLIC_PATH}shared/react.list.json`]: { body: LIST_DOC },
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
      entryLists: {
        './lifecycle': {
          location: 'shared/react.list.json',
          contentHash: sha256Hex(LIST_DOC),
        },
      },
    });
    try {
      await new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 })
        .load(buildEntry(manifest), 'ext-priority')
        .catch(() => undefined);
    } finally {
      fetchSpy.mockRestore();
    }
    expect(inits.get(`${PUBLIC_PATH}shared/react.list.json`)).toEqual({ priority: 'high' });
    expect(inits.has(`${PUBLIC_PATH}shared/react/index.abc.js`)).toBe(true);
    expect(inits.get(`${PUBLIC_PATH}shared/react/index.abc.js`)).toBeUndefined();
  });
});
