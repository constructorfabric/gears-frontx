/**
 * Acceptance: the realm shared-dep text cache byte budget is
 * host-configurable through `MfeLoaderConfig` (ADR-0035), not a fixed
 * mapping count.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MfeHandlerMF } from '../../MfeHandlerMF';
import { ENTRY_BASE_ID } from '../helpers/manifest-builder';
import { realmSharedDepTextCache, resetRealmSharedDepTextCache } from '../helpers/realm-cache';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

describe('acceptance: byte budget via MfeLoaderConfig', () => {
  it('a configured byte budget evicts least-recently-used fulfilled text when admission would exceed it', async () => {
    new MfeHandlerMF(ENTRY_BASE_ID, {
      retries: 0,
      sharedDepTextCacheMaxBytes: 64,
    } as ConstructorParameters<typeof MfeHandlerMF>[1]);
    const cache = realmSharedDepTextCache();
    cache.set('a@1@h1', Promise.resolve('x'.repeat(40)));
    await Promise.resolve();
    cache.set('b@1@h2', Promise.resolve('y'.repeat(40)));
    // Let fulfillment-time byte accounting settle.
    await new Promise((r) => setTimeout(r, 0));
    expect(
      cache.get('a@1@h1'),
      'the least-recently-used entry must be evicted when the byte budget is exceeded',
    ).toBeUndefined();
    expect(cache.get('b@1@h2')).toBeDefined();
  });

  it('without a configured budget the realm cache still enforces the default byte budget, not a mapping count', async () => {
    new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const cache = realmSharedDepTextCache();
    const big = 'z'.repeat(1024 * 1024 * 8);
    cache.set('big@1@h', Promise.resolve(big));
    await new Promise((r) => setTimeout(r, 0));
    // A single text larger than the whole default budget is handled
    // deliberately (not silently retained past the bound).
    expect(cache.get('big@1@h')).toBeUndefined();
  });
});
