/**
 * `VerifiedUnitFetcher`: parallel loads dedupe through the realm cache's
 * in-flight promises, and a load joining a fetch that rejects retries once
 * from its own URL.
 */
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

import { VerifiedUnitFetcher } from '../VerifiedUnitFetcher';

const hash = (text: string): string =>
  createHash('sha256').update(text).digest('hex');

const TEXT = 'export const a = 1;';
const KEY = 'k';

describe('VerifiedUnitFetcher', () => {
  it('two parallel loads fetch each shared file once', async () => {
    const cache = new Map<string, Promise<string>>();
    const fetchText = vi.fn(async () => TEXT);
    const a = new VerifiedUnitFetcher(fetchText, 'a', cache as never);
    const b = new VerifiedUnitFetcher(fetchText, 'b', cache as never);
    const [ta, tb] = await Promise.all([
      a.fetchVerified('https://a.test/f.js', hash(TEXT), KEY),
      b.fetchVerified('https://b.test/f.js', hash(TEXT), KEY),
    ]);
    expect(ta).toBe(TEXT);
    expect(tb).toBe(TEXT);
    expect(fetchText).toHaveBeenCalledTimes(1);
  });

  it('a load joining a fetch that rejects retries once from its own URL', async () => {
    const cache = new Map<string, Promise<string>>();
    const urls: string[] = [];
    const fetchA = vi.fn(async (url: string) => {
      urls.push(url);
      throw new Error('network');
    });
    const fetchB = vi.fn(async (url: string) => {
      urls.push(url);
      return TEXT;
    });
    const a = new VerifiedUnitFetcher(fetchA, 'a', cache as never);
    const b = new VerifiedUnitFetcher(fetchB, 'b', cache as never);
    const first = a.fetchVerified('https://a.test/f.js', hash(TEXT), KEY);
    const joined = b.fetchVerified('https://b.test/f.js', hash(TEXT), KEY);
    await expect(first).rejects.toThrow('network');
    await expect(joined).resolves.toBe(TEXT);
    expect(urls).toEqual(['https://a.test/f.js', 'https://b.test/f.js']);
    // The successful retry is what the cache now holds.
    await expect(cache.get(KEY)).resolves.toBe(TEXT);
  });

  it('retries only once: a rejecting retry is surfaced', async () => {
    const cache = new Map<string, Promise<string>>();
    const fetchA = vi.fn(async () => {
      throw new Error('first');
    });
    const fetchB = vi.fn(async () => {
      throw new Error('second');
    });
    const a = new VerifiedUnitFetcher(fetchA, 'a', cache as never);
    const b = new VerifiedUnitFetcher(fetchB, 'b', cache as never);
    const first = a.fetchVerified('https://a.test/f.js', hash(TEXT), KEY);
    const joined = b.fetchVerified('https://b.test/f.js', hash(TEXT), KEY);
    await expect(first).rejects.toThrow('first');
    await expect(joined).rejects.toThrow('second');
    expect(fetchB).toHaveBeenCalledTimes(1);
    expect(cache.has(KEY)).toBe(false);
  });
});
