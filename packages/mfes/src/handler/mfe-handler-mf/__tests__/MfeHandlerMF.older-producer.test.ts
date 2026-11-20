/**
 * MfeHandlerMF — a manifest and an entry written by an older producer.
 *
 * Such a manifest carries the contract's known-but-ignored fields, may carry
 * no `shared`, `units`, `lists` or `sharedBase`, and loads through the
 * whole-package path; none of the ignored fields is read.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const blobModuleStub = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock('../mf-dynamic-module-ops', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../mf-dynamic-module-ops')>();
  return {
    ...actual,
    DynamicModuleOps: class extends actual.DynamicModuleOps {
      static override async importBlobModule(blobUrl: string): Promise<unknown> {
        return blobModuleStub.current !== undefined
          ? Promise.resolve(blobModuleStub.current)
          : super.importBlobModule(blobUrl);
      }
    },
  };
});

import { newHandler, registerManifest } from './helpers/registered-manifest';
import { MfeLoadError } from '../../../errors';
import type { MfeEntryMF } from '../../../types/mfe-entry-mf';
import type { MfManifest } from '../../../manifest/mf-manifest';

const ENTRY_BASE_ID = 'mock.mfe.entry.v1~';
const PUBLIC_PATH = 'http://localhost:3099/';

const olderManifest = (over: Partial<MfManifest> = {}): MfManifest => ({
  id: 'mock.mfe.mf_manifest.v1~older.manifest.v1',
  name: 'olderMfe',
  remoteEntry: `${PUBLIC_PATH}assets/remoteEntry.js`,
  metaData: {
    publicPath: PUBLIC_PATH,
    name: 'olderMfe',
    type: 'app',
    globalName: 'olderMfe',
    buildInfo: { buildVersion: '1.0.0', buildName: 'olderMfe' },
    remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' },
  },
  ...over,
});

const olderEntry = (manifest: string): MfeEntryMF => ({
  id: `${ENTRY_BASE_ID}older.entry.v1`,
  requiredProperties: [],
  actions: [],
  domainActions: [],
  manifest,
  exposedModule: './lifecycle',
  exposeAssets: {
    js: { sync: ['assets/lifecycle.js'], async: ['assets/en.js'] },
    css: { sync: [], async: [] },
  },
});

const jsResponse = (body: string): Response =>
  ({
    ok: true,
    headers: { get: () => 'application/javascript' },
    text: () => Promise.resolve(body),
  }) as unknown as Response;

afterEach(() => {
  blobModuleStub.current = undefined;
  vi.restoreAllMocks();
});

describe('MfeHandlerMF — older-producer manifest', () => {
  it('loads an entry whose manifest has no shared, units or lists, fetching the entry module alone and reading no ignored field', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(((input: string | URL | Request) => {
      urls.push(String(input));
      return Promise.resolve(jsResponse('export default { mount(){}, unmount(){} };'));
    }) as unknown as typeof fetch);
    blobModuleStub.current = { default: { mount: (): void => {}, unmount: (): void => {} } };

    const manifest = olderManifest();
    const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
    const loaded = await handler.load(olderEntry(registerManifest(manifest)), 'ext-older');

    expect(typeof loaded.mount).toBe('function');
    // The entry module only: the asynchronous script list is not read, and no
    // whole-package entry exists to fetch.
    expect(urls).toEqual([`${PUBLIC_PATH}assets/lifecycle.js`]);
  });

  it('loads identically with and without the ignored fields', async () => {
    const fetched: string[][] = [];
    for (const manifest of [olderManifest(), { id: 'mock.mfe.mf_manifest.v1~plain.v1', metaData: { publicPath: PUBLIC_PATH } }]) {
      const urls: string[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(((input: string | URL | Request) => {
        urls.push(String(input));
        return Promise.resolve(jsResponse('export default { mount(){}, unmount(){} };'));
      }) as unknown as typeof fetch);
      blobModuleStub.current = { default: { mount: (): void => {}, unmount: (): void => {} } };
      const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
      await handler.load(olderEntry(registerManifest(manifest)), `ext-${manifest.id}`);
      fetched.push(urls);
      vi.restoreAllMocks();
    }
    expect(fetched[0]).toEqual(fetched[1]);
  });

  it('reports a malformed shared as an unresolved manifest and caches nothing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const manifest = { ...olderManifest(), shared: 'react' } as unknown as MfManifest;
    const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
    await expect(handler.load(olderEntry(registerManifest(manifest)), 'ext-bad-shared')).rejects.toThrow(MfeLoadError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails one load without disturbing a concurrent load of another entry', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(((input: string | URL | Request) => {
      const url = String(input);
      return url.includes('broken')
        ? Promise.reject(new TypeError('network error for test'))
        : Promise.resolve(jsResponse('export default { mount(){}, unmount(){} };'));
    }) as unknown as typeof fetch);
    blobModuleStub.current = { default: { mount: (): void => {}, unmount: (): void => {} } };

    const good = olderManifest();
    const bad = olderManifest({ id: 'mock.mfe.mf_manifest.v1~broken.manifest.v1', metaData: { publicPath: 'http://localhost:3098/broken/' } });
    const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
    const goodEntry = olderEntry(registerManifest(good));
    const badEntry = { ...olderEntry(registerManifest(bad)), id: `${ENTRY_BASE_ID}broken.entry.v1` };

    const [badResult, goodResult] = await Promise.allSettled([
      handler.load(badEntry, 'ext-broken'),
      handler.load(goodEntry, 'ext-good'),
    ]);
    expect(badResult.status).toBe('rejected');
    expect(goodResult.status).toBe('fulfilled');
    // The handler stays usable afterwards.
    const again = await handler.load(goodEntry, 'ext-good-2');
    expect(typeof again.mount).toBe('function');
  });
});
