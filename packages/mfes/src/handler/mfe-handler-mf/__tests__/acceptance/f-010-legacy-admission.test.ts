/**
 * Acceptance: F-010 — the legacy `chunkPath` path must not admit
 * unverified text to the realm cache under a declared `contentHash` key.
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
import type { SharedDepTextCache } from '../../RealmSharedDepTextCacheProvider';
import { MfeLoadError } from '../../../../errors';
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
  PUBLIC_PATH,
  sha256Hex,
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

describe('acceptance: F-010 legacy chunkPath cache admission', () => {
  it('F-010: fetched chunk text that does NOT match the declared contentHash is never admitted under the hash key', async () => {
    const WRONG_TEXT = 'export const react = 1;\n';
    const declaredHash = sha256Hex('export const react = 2; // different bytes');
    const dep: MfManifestShared = {
      name: 'react',
      version: '1.0.0',
      chunkPath: 'shared/react.js',
        contentHash: declaredHash,
    };
    const router = createFetchRouter({
      [`${PUBLIC_PATH}assets/lifecycle.js`]: {
        body: 'import "react";\nexport default {};',
      },
      [`${PUBLIC_PATH}shared/react.js`]: { body: WRONG_TEXT },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    stubSuccessfulImport(blobModuleStub);
    const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest([dep]);

    try {
      // Target behaviour: the text either fails verification (load fails)
      // or is never keyed under the declared hash it did not verify
      // against. The legacy path currently admits it regardless.
      await handler
        .load(buildEntry(manifest), 'ext-f010')
        .then(
          () => undefined,
          (e: unknown) => e,
        )
        .then((outcome) => {
          const key = `react@1.0.0@${declaredHash}`;
          expect(
            realmCache(handler).get(key),
            outcome instanceof MfeLoadError
              ? 'a failed verification must not cache either'
              : 'unverified text must not occupy the declared hash key',
          ).toBeUndefined();
        });
    } finally {
      fetchSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});
