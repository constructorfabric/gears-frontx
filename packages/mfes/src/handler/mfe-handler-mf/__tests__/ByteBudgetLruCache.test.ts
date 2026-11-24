/**
 * The byte-budget cache orders an entry by when its text arrives, so a slow
 * fetch is not evicted ahead of older text the moment it lands.
 */
import { describe, expect, it } from 'vitest';
import { ByteBudgetLruCache } from '../ByteBudgetLruCache';

interface Deferred {
  readonly promise: Promise<string>;
  readonly resolve: (text: string) => void;
}

function deferred(): Deferred {
  let resolve!: (text: string) => void;
  const promise = new Promise<string>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('ByteBudgetLruCache recency', () => {
  it('keeps the text that just arrived and evicts the older fulfilled entry', async () => {
    const cache = new ByteBudgetLruCache(100);
    const a = deferred();
    const b = deferred();
    const c = deferred();
    cache.set('a', a.promise);
    cache.set('b', b.promise);
    cache.set('c', c.promise);

    b.resolve('b'.repeat(40));
    c.resolve('c'.repeat(40));
    await settle();
    a.resolve('a'.repeat(50));
    await settle();

    expect(cache.get('a'), 'the slow text that just arrived survives').toBeDefined();
    expect(cache.get('b'), 'the least recently arrived text is evicted').toBeUndefined();
    expect(cache.get('c')).toBeDefined();
    expect(cache.getDiagnostics()).toEqual({
      bytes: 90,
      entries: 2,
      budget: 100,
      evictions: 1,
    });
  });
});
