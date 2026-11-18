/**
 * Acceptance: a whole-package entry's text is admitted to the realm cache
 * as fetched, under the key its declared `contentHash` fixes.
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
import {
  buildEntry,
  buildManifest,
  sharedDep,
  ENTRY_BASE_ID,
  PUBLIC_PATH,
  sha256Hex,
} from '../helpers/manifest-builder';
import { createFetchRouter, jsResponse } from '../helpers/fetch-router';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';
import type { MfManifestShared } from '../../../../manifest/mf-manifest';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

function realmCache(handler: MfeHandlerMF): SharedDepTextCache {
  return (
    handler as unknown as { sharedDepTextCache: SharedDepTextCache }
  ).sharedDepTextCache;
}

describe('acceptance: whole-package entries are admitted as fetched', () => {
  it('chunk text is admitted under the declared contentHash key whatever its bytes', async () => {
    const FETCHED_TEXT = 'export const react = 1;\n';
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
      [`${PUBLIC_PATH}shared/react.js`]: { body: FETCHED_TEXT },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(router as typeof fetch);
    const digest = vi.fn();
    vi.stubGlobal('crypto', { subtle: { digest } });
    stubSuccessfulImport(blobModuleStub);
    const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
    const manifest = buildManifest([dep]);

    try {
      await handler.load(buildEntry(manifest), 'ext-as-fetched');
      // The declared identity is the sharing key; the text is admitted as
      // fetched and nothing is digested.
      await expect(
        realmCache(handler).get(`react@1.0.0@${declaredHash}`),
      ).resolves.toBe(FETCHED_TEXT);
      expect(digest).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      fetchSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  });
});

describe('acceptance: a whole-package fetch joined by another load', () => {
  let runs = 0;
  const HASH = sha256Hex('declared');
  const DEP_TEXT = 'export const dep = 1;\n';
  const turn = (): Promise<void> =>
    new Promise((resolve) => {
      setImmediate(resolve);
    });

  async function run(retryServesText: boolean) {
    // Distinct origins and load ids per run: loads are keyed by their id and
    // must not carry over from another run.
    runs += 1;
    const PATH_A = `http://a${String(runs)}.test/mfe/`;
    const PATH_B = `http://b${String(runs)}.test/mfe/`;
    const fetched: string[] = [];
    let rejectA: (e: Error) => void = () => undefined;
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(((input: string | URL | Request) => {
        const url = String(input);
        fetched.push(url);
        if (url.endsWith('assets/lifecycle.js')) {
          return Promise.resolve(
            jsResponse('import "dep";\nexport default {};'),
          );
        }
        if (url === `${PATH_A}shared/dep.js`) {
          return new Promise<Response>((_, reject) => {
            rejectA = reject;
          });
        }
        if (url === `${PATH_B}shared/dep.js`) {
          return retryServesText
            ? Promise.resolve(jsResponse(DEP_TEXT))
            : Promise.reject(new TypeError('b offline'));
        }
        return Promise.reject(new TypeError(`unmocked fetch: ${url}`));
      }) as typeof fetch);
    stubSuccessfulImport(blobModuleStub);
    const manifest = (publicPath: string) =>
      buildManifest([sharedDep('dep', { contentHash: HASH })], {
        metaData: { publicPath },
      });
    try {
      const loadA = newHandler(ENTRY_BASE_ID, { retries: 0 })
        .load(buildEntry(manifest(PATH_A)), `ext-join-a-${String(runs)}`)
        .then(() => undefined, (e: unknown) => e);
      for (let i = 0; i < 50 && !fetched.includes(`${PATH_A}shared/dep.js`); i++) {
        await turn();
      }
      const loadB = newHandler(ENTRY_BASE_ID, { retries: 0 })
        .load(buildEntry(manifest(PATH_B)), `ext-join-b-${String(runs)}`)
        .then(() => undefined, (e: unknown) => e);
      // B has joined A's in-flight fetch: it issued no dep request of its own.
      for (let i = 0; i < 10; i++) await turn();
      expect(fetched).not.toContain(`${PATH_B}shared/dep.js`);
      rejectA(new TypeError('a offline'));
      const [errA, errB] = [await loadA, await loadB];
      return { fetched, errA, errB, PATH_B };
    } finally {
      fetchSpy.mockRestore();
      blobModuleStub.current = undefined;
    }
  }

  it('retries once from its own URL when the joined fetch rejects, and succeeds', async () => {
    const { fetched, errA, errB, PATH_B } = await run(true);
    expect(errA).toBeDefined();
    expect(errB).toBeUndefined();
    expect(fetched.filter((u) => u === `${PATH_B}shared/dep.js`)).toHaveLength(1);
  });

  it('surfaces the retry failure and retries no more', async () => {
    const { fetched, errA, errB, PATH_B } = await run(false);
    expect(errA).toBeDefined();
    expect(errB).toBeDefined();
    expect(fetched.filter((u) => u === `${PATH_B}shared/dep.js`)).toHaveLength(1);
  });
});
