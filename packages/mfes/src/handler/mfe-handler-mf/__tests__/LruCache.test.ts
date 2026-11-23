/**
 * `LruCache` holds at most its capacity of evictable entries, evicting the
 * least recently used, and never evicts an entry its predicate refuses — the
 * handler source-text cache refuses an in-flight request
 * (`cpt-frontx-dod-mfe-isolation-handler-source-text-cache`).
 */
import { describe, expect, it } from 'vitest';

import { LruCache } from '../LruCache';

describe('LruCache', () => {
  it('evicts the least recently used entry at capacity', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    expect([cache.has('a'), cache.has('b'), cache.has('c')]).toEqual([true, false, true]);
  });

  it('never evicts an entry its predicate refuses, and evicts the oldest one it allows', () => {
    const settled = new Set<string>();
    const cache = new LruCache<string, string>(2, (value) => settled.has(value));
    cache.set('in-flight-1', 'in-flight-1');
    cache.set('settled', 'settled');
    settled.add('settled');
    cache.set('in-flight-2', 'in-flight-2');
    // The oldest entry is in flight; the oldest settled one goes instead.
    expect(cache.has('in-flight-1')).toBe(true);
    expect(cache.has('settled')).toBe(false);
    expect(cache.has('in-flight-2')).toBe(true);
  });

  it('holds more than its capacity while every entry is in flight', () => {
    const cache = new LruCache<string, string>(2, () => false);
    for (const key of ['a', 'b', 'c', 'd']) cache.set(key, key);
    expect(['a', 'b', 'c', 'd'].map((key) => cache.has(key))).toEqual([true, true, true, true]);
  });

  it('returns to its capacity on the first insert after entries held in flight settle', () => {
    const settled = new Set<string>();
    const cache = new LruCache<string, string>(3, (value) => settled.has(value));
    const keys = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (const key of keys) cache.set(key, key);
    expect(keys.filter((key) => cache.has(key))).toHaveLength(6);

    for (const key of keys) settled.add(key);
    cache.set('g', 'g');
    settled.add('g');

    const held = [...keys, 'g'].filter((key) => cache.has(key));
    expect(held.length).toBeLessThanOrEqual(3);
    expect(held).toEqual(['e', 'f', 'g']);
  });
});
