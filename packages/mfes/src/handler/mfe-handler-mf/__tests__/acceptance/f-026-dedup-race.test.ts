/**
 * Acceptance: F-026 — dedup/race nits: a shared dependency name declared
 * twice on one manifest is fetched once (no duplicate retry/fetch), and
 * an in-flight entry contributes no bytes to eviction pressure.
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
import type { SharedDepTextCache } from '../../RealmSharedDepTextCacheProvider';
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
  PUBLIC_PATH,
} from '../helpers/manifest-builder';
import { createFetchRouter } from '../helpers/fetch-router';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';
import type { MfManifestShared } from '../../../../manifest/mf-manifest';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

function realmCache(handler: MfeHandlerMF): SharedDepTextCache {
  return (
    handler as unknown as { sharedDepTextCache: SharedDepTextCache }
  ).sharedDepTextCache;
}

describe('acceptance: F-026 dedup and race nits', () => {
  it('F-026: a shared name declared twice on one manifest is fetched once, not retried per declaration', async () => {
    const dep: MfManifestShared = {
      name: 'react',
      version: '1.0.0',
      chunkPath: 'shared/react.js',
      unwrapKey: null,
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
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest([dep, { ...dep }]);
    try {
      await handler
        .load(buildEntry(manifest), 'ext-f026-dupe')
        .catch(() => undefined);
      const chunkFetches = router.calls.filter((u) =>
        u.endsWith('shared/react.js'),
      );
      expect(
        chunkFetches.length,
        'the same shared name declared twice must dedup to one fetch',
      ).toBeLessThanOrEqual(1);
    } finally {
      fetchSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });

  it('F-026: an in-flight (unsettled) entry contributes zero bytes — a later large admission must not evict it as if it were sized', async () => {
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, {
      retries: 0,
      sharedDepTextCacheMaxBytes: 64,
    } as ConstructorParameters<typeof MfeHandlerMF>[1]);
    const cache = realmCache(handler);
    let resolveInFlight!: (v: string) => void;
    const inFlight = new Promise<string>((r) => {
      resolveInFlight = r;
    });
    cache.set('pending@1@h1', inFlight);
    cache.set('big@1@h2', Promise.resolve('y'.repeat(100)));
    await new Promise((r) => setTimeout(r, 0));
    resolveInFlight('done');
    expect(
      cache.get('pending@1@h1'),
      'an in-flight entry must not be evicted while it has no bytes yet',
    ).toBeDefined();
  });
});
