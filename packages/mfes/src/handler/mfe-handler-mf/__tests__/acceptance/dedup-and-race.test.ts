/**
 * Acceptance: dedup/race nits: a shared dependency name declared
 * twice on one manifest is refused before any request, and an in-flight
 * entry contributes no bytes to eviction pressure.
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
import { newHandler } from '../helpers/registered-manifest';
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
  PUBLIC_PATH,
} from '../helpers/manifest-builder';
import { createFetchRouter } from '../helpers/fetch-router';
import { realmSharedDepTextCache, resetRealmSharedDepTextCache } from '../helpers/realm-cache';
import type { MfManifestShared } from '../../../../manifest/mf-manifest';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

describe('acceptance: dedup and race nits', () => {
  it('a shared name declared twice on one manifest is refused before any fetch', async () => {
    const dep: MfManifestShared = {
      name: 'react',
      version: '1.0.0',
      chunkPath: 'shared/react.js',
        contentHash:
        'a'.repeat(64),
    };
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react.js`]: {
        body: 'export const r = 1;\n',
      },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    stubSuccessfulImport(blobModuleStub);
    const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest([dep, { ...dep }]);
    try {
      await expect(
        handler.load(buildEntry(manifest), 'ext-f026-dupe'),
      ).rejects.toThrow(/declares 'react' more than once/);
      const chunkFetches = router.calls.filter((u) =>
        u.endsWith('shared/react.js'),
      );
      expect(
        chunkFetches.length,
        'a duplicate shared name is refused before any request',
      ).toBe(0);
    } finally {
      fetchSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('an in-flight (unsettled) entry contributes zero bytes — eviction pressure from fulfilled text must skip it', async () => {
    newHandler(ENTRY_BASE_ID, {
      retries: 0,
      sharedDepTextCacheMaxBytes: 64,
    } as ConstructorParameters<typeof MfeHandlerMF>[1]);
    const cache = realmSharedDepTextCache();
    let resolveInFlight!: (v: string) => void;
    const inFlight = new Promise<string>((r) => {
      resolveInFlight = r;
    });
    // The in-flight entry is the oldest, so it is the first candidate the
    // eviction loop meets; the two fulfilled texts together exceed the
    // budget, each fitting on its own.
    cache.set('pending@1@h1', inFlight);
    cache.set('first@1@h2', Promise.resolve('x'.repeat(40)));
    cache.set('second@1@h3', Promise.resolve('y'.repeat(40)));
    await new Promise((r) => setTimeout(r, 0));
    expect(
      cache.get('pending@1@h1'),
      'an in-flight entry must not be evicted while it has no bytes yet',
    ).toBe(inFlight);
    expect(
      cache.get('first@1@h2'),
      'the least-recently-used fulfilled entry is the one evicted',
    ).toBeUndefined();
    expect(cache.get('second@1@h3')).toBeDefined();
    resolveInFlight('done');
  });
});
