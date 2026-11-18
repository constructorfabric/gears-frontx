/**
 * `SharedUnitFetcher`: text is admitted to the realm cache as fetched under
 * the `chunk:<contentHash>` key it derives itself, parallel loads dedupe
 * through the realm cache's in-flight promises, a load joining a fetch that
 * rejects retries once from its own URL, and a rejected fetch is evicted
 * under the identity check.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MfeLoadError } from '../../../errors';
import { RealmSharedDepTextCacheProvider } from '../RealmSharedDepTextCacheProvider';
import { SharedUnitFetcher } from '../SharedUnitFetcher';

const HASH = 'a'.repeat(64);
const KEY = `chunk:${HASH}`;
const TEXT = 'export const a = 1;';

afterEach(() => {
  RealmSharedDepTextCacheProvider.getCache().delete(KEY);
  vi.restoreAllMocks();
});

describe('SharedUnitFetcher', () => {
  it('takes only (fetchFn, label)', () => {
    expect(SharedUnitFetcher.length).toBe(2);
  });

  it('admits text as fetched under chunk:<hash>, whatever its bytes, with no digest', async () => {
    const digest = vi.fn();
    vi.stubGlobal('crypto', { subtle: { digest } });
    try {
      const fetcher = new SharedUnitFetcher(async () => 'different bytes', 'a');
      await expect(fetcher.fetch('https://a.test/f.js', HASH)).resolves.toBe(
        'different bytes',
      );
      await expect(
        RealmSharedDepTextCacheProvider.getCache().get(KEY),
      ).resolves.toBe('different bytes');
      expect(digest).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('two parallel loads fetch each shared file once', async () => {
    const fetchText = vi.fn(async () => TEXT);
    const a = new SharedUnitFetcher(fetchText, 'a');
    const b = new SharedUnitFetcher(fetchText, 'b');
    const [ta, tb] = await Promise.all([
      a.fetch('https://a.test/f.js', HASH),
      b.fetch('https://b.test/f.js', HASH),
    ]);
    expect(ta).toBe(TEXT);
    expect(tb).toBe(TEXT);
    expect(fetchText).toHaveBeenCalledTimes(1);
  });

  it('a load joining a fetch that rejects retries once from its own URL', async () => {
    const urls: string[] = [];
    const fetchA = vi.fn(async (url: string) => {
      urls.push(url);
      throw new Error('network');
    });
    const fetchB = vi.fn(async (url: string) => {
      urls.push(url);
      return TEXT;
    });
    const a = new SharedUnitFetcher(fetchA, 'a');
    const b = new SharedUnitFetcher(fetchB, 'b');
    const first = a.fetch('https://a.test/f.js', HASH);
    const joined = b.fetch('https://b.test/f.js', HASH);
    await expect(first).rejects.toThrow('network');
    await expect(joined).resolves.toBe(TEXT);
    expect(urls).toEqual(['https://a.test/f.js', 'https://b.test/f.js']);
    await expect(
      RealmSharedDepTextCacheProvider.getCache().get(KEY),
    ).resolves.toBe(TEXT);
  });

  it('retries only once: a rejecting retry is surfaced and evicted', async () => {
    const fetchB = vi.fn(async () => {
      throw new Error('second');
    });
    const a = new SharedUnitFetcher(async () => {
      throw new Error('first');
    }, 'a');
    const b = new SharedUnitFetcher(fetchB, 'b');
    const first = a.fetch('https://a.test/f.js', HASH);
    const joined = b.fetch('https://b.test/f.js', HASH);
    await expect(first).rejects.toThrow('first');
    await expect(joined).rejects.toThrow('second');
    expect(fetchB).toHaveBeenCalledTimes(1);
    expect(RealmSharedDepTextCacheProvider.getCache().get(KEY)).toBeUndefined();
  });

  it('a failed fetch rejects with an MfeLoadError carrying the label and naming the file', async () => {
    const fetcher = new SharedUnitFetcher(async () => {
      throw new Error('boom');
    }, 'my-label');
    const error = await fetcher.fetch('https://a.test/f.js', HASH).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MfeLoadError);
    expect((error as MfeLoadError).entryTypeId).toBe('my-label');
    expect((error as MfeLoadError).message).toContain('https://a.test/f.js');
    expect(RealmSharedDepTextCacheProvider.getCache().get(KEY)).toBeUndefined();
  });

  it('wraps a fetchFn MfeLoadError too, under its own label, keeping the original as cause', async () => {
    const original = new MfeLoadError('inner', 'other-label');
    const fetcher = new SharedUnitFetcher(async () => {
      throw original;
    }, 'my-label');
    const error = await fetcher.fetch('https://a.test/f.js', HASH).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MfeLoadError);
    expect(error).not.toBe(original);
    expect((error as MfeLoadError).entryTypeId).toBe('my-label');
    expect((error as MfeLoadError).message).toContain('https://a.test/f.js');
    expect((error as MfeLoadError).cause).toBe(original);
  });

  it('evicts a rejected fetch only while the cache still holds that promise', async () => {
    const cache = RealmSharedDepTextCacheProvider.getCache();
    let rejectFirst: (e: Error) => void = () => undefined;
    const a = new SharedUnitFetcher(
      () => new Promise<string>((_, reject) => { rejectFirst = reject; }),
      'a',
    );
    const pending = a.fetch('https://a.test/f.js', HASH).catch(() => undefined);
    const replacement = Promise.resolve('replacement');
    cache.set(KEY, replacement);
    rejectFirst(new Error('late'));
    await pending;
    expect(cache.get(KEY)).toBe(replacement);
  });
});
