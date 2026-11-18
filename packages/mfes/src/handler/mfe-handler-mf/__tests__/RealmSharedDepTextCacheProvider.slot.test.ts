/**
 * Realm rendezvous slot handling
 * (`cpt-frontx-algo-unit-format-contract-loader-surface`,
 * `inst-loader-slot-adopt`, `inst-loader-slot-versioned`): an entry whose
 * protocol version or shape this copy does not recognize is left untouched
 * and never shared, the copy proceeds on its own bounded fallback cache, and
 * nothing throws.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealmSharedDepTextCacheProvider } from '../RealmSharedDepTextCacheProvider';
import {
  SHARED_DEP_TEXT_CACHE_SYMBOL,
  resetRealmSharedDepTextCache,
} from './helpers/realm-cache';

const slot = globalThis as Record<symbol, unknown>;

describe('realm slot — unrecognized entries', () => {
  beforeEach(() => {
    resetRealmSharedDepTextCache();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    resetRealmSharedDepTextCache();
    vi.restoreAllMocks();
  });

  it('leaves a foreign protocol version untouched and uses the local fallback cache', () => {
    const foreignCache = new Map<string, Promise<string>>();
    const foreign = { v: 2, cache: foreignCache };
    slot[SHARED_DEP_TEXT_CACHE_SYMBOL] = foreign;

    let cache!: ReturnType<typeof RealmSharedDepTextCacheProvider.getCache>;
    expect(() => {
      cache = RealmSharedDepTextCacheProvider.getCache();
    }).not.toThrow();

    expect(slot[SHARED_DEP_TEXT_CACHE_SYMBOL]).toBe(foreign);
    expect(cache).not.toBe(foreignCache);
    cache.set('chunk:x', Promise.resolve('text'));
    expect(foreignCache.size).toBe(0);
    expect(RealmSharedDepTextCacheProvider.getCache()).toBe(cache);
  });

  it.each([
    ['a string', 'not-an-entry'],
    ['a number', 42],
    ['an object with no cache', { v: 1 }],
    ['an object whose cache lacks the operations', { v: 1, cache: { get: () => undefined } }],
  ])('leaves a malformed slot value (%s) untouched and uses the local fallback cache', (_label, value) => {
    slot[SHARED_DEP_TEXT_CACHE_SYMBOL] = value;

    let cache!: ReturnType<typeof RealmSharedDepTextCacheProvider.getCache>;
    expect(() => {
      cache = RealmSharedDepTextCacheProvider.getCache();
    }).not.toThrow();

    expect(slot[SHARED_DEP_TEXT_CACHE_SYMBOL]).toBe(value);
    expect(typeof cache.get).toBe('function');
    cache.set('chunk:y', Promise.resolve('text'));
    expect(cache.get('chunk:y')).toBeDefined();
  });
});
