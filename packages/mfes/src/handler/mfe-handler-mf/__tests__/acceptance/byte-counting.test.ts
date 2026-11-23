/**
 * Acceptance: the byte budget counts UTF-8 BYTES, not UTF-16
 * code units.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MfeHandlerMF } from '../../MfeHandlerMF';
import { ENTRY_BASE_ID } from '../helpers/manifest-builder';
import { realmSharedDepTextCache, resetRealmSharedDepTextCache } from '../helpers/realm-cache';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

describe('acceptance: byte accounting', () => {
  it('a multi-byte text is accounted by its UTF-8 byte length, not its UTF-16 length', async () => {
    new MfeHandlerMF(ENTRY_BASE_ID, {
      retries: 0,
      sharedDepTextCacheMaxBytes: 100,
    } as ConstructorParameters<typeof MfeHandlerMF>[1]);
    const cache = realmSharedDepTextCache();
    // 30 emoji = 60 UTF-16 code units but 120 UTF-8 bytes: under UTF-16
    // accounting it fits the 100 budget; under byte accounting it does not.
    const emojiText = '😀'.repeat(30);
    cache.set('a@1@h1', Promise.resolve('x'.repeat(50)));
    await new Promise((r) => setTimeout(r, 0));
    cache.set('b@1@h2', Promise.resolve(emojiText));
    await new Promise((r) => setTimeout(r, 0));
    expect(
      cache.get('b@1@h2'),
      'a text whose UTF-8 size exceeds the budget must not be retained',
    ).toBeUndefined();
    expect(cache.get('a@1@h1')).toBeDefined();
  });
});
