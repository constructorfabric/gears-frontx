/**
 * Acceptance: the realm shared-dependency text cache budget
 * (`cpt-frontx-dod-mfe-isolation-realm-shared-dep-text-cache`,
 * `cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous`): the
 * 4 MiB default, a configured replacement, the first publisher's budget
 * applying to every later handler, a single text larger than the budget
 * not retained, and every test that touches the realm slot clearing it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MfeHandlerMF } from '../../MfeHandlerMF';
import type { SharedDepTextCache } from '../../RealmSharedDepTextCacheProvider';
import { ENTRY_BASE_ID } from '../helpers/manifest-builder';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';

beforeEach(resetRealmSharedDepTextCache);
afterEach(resetRealmSharedDepTextCache);

const cacheOf = (handler: MfeHandlerMF): SharedDepTextCache =>
  (handler as unknown as { sharedDepTextCache: SharedDepTextCache }).sharedDepTextCache;
const handlerWith = (maxBytes?: number): MfeHandlerMF =>
  new MfeHandlerMF(ENTRY_BASE_ID, {
    retries: 0,
    ...(maxBytes !== undefined ? { sharedDepTextCacheMaxBytes: maxBytes } : {}),
  } as ConstructorParameters<typeof MfeHandlerMF>[1]);
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('acceptance: the realm cache byte budget', () => {
  it('enforces the default of 4,194,304 bytes: a text of exactly that size stays, one byte more is not retained', async () => {
    const cache = cacheOf(handlerWith());
    cache.set('fits@1@h', Promise.resolve('a'.repeat(4_194_304)));
    await settle();
    expect(cache.get('fits@1@h')).toBeDefined();
    cache.set('over@1@h', Promise.resolve('a'.repeat(4_194_305)));
    await settle();
    expect(cache.get('over@1@h')).toBeUndefined();
  });

  it('evicts least-recently-used entries until the retained UTF-8 bytes fit', async () => {
    const cache = cacheOf(handlerWith(100));
    for (const key of ['a', 'b', 'c']) {
      cache.set(key, Promise.resolve(key.repeat(40)));
      await settle();
    }
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeDefined();
    expect(cache.get('c')).toBeDefined();
  });

  it('counts UTF-8 bytes, not characters', async () => {
    const cache = cacheOf(handlerWith(10));
    // Five two-byte characters: ten bytes fit, one more character does not.
    cache.set('fits', Promise.resolve('é'.repeat(5)));
    await settle();
    expect(cache.get('fits')).toBeDefined();
    cache.set('over', Promise.resolve('é'.repeat(6)));
    await settle();
    expect(cache.get('over')).toBeUndefined();
  });

  it('applies the budget of the first handler that publishes the cache; a later handler with another budget adopts it unchanged', async () => {
    const first = cacheOf(handlerWith(64));
    const second = cacheOf(handlerWith(10_000));
    expect(second).toBe(first);
    second.set('a', Promise.resolve('x'.repeat(40)));
    await settle();
    second.set('b', Promise.resolve('y'.repeat(40)));
    await settle();
    // The second handler's larger budget changed nothing: the first's 64 bytes still bound it.
    expect(second.get('a')).toBeUndefined();
    expect(second.get('b')).toBeDefined();
  });

  it('does not retain a single text larger than the whole budget, and the caller still receives it', async () => {
    const cache = cacheOf(handlerWith(8));
    const text = 'x'.repeat(64);
    const admitted = Promise.resolve(text);
    cache.set('big', admitted);
    await settle();
    expect(cache.get('big')).toBeUndefined();
    await expect(admitted).resolves.toBe(text);
  });
});

describe('acceptance: tests that touch the realm slot clear it', () => {
  const root = join(__dirname, '..', '..', '..', '..');
  const testFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory()
        ? testFiles(path)
        : name.endsWith('.test.ts')
          ? [path]
          : [];
    });
  // A test touches the slot when it reads, seeds or resets the realm cache itself:
  // it imports the provider as a value, the slot's symbol, or reaches the handler's cache.
  const touchesSlot = /import\s+\{[^}]*\bRealmSharedDepTextCacheProvider\b[^}]*\}\s+from|SHARED_DEP_TEXT_CACHE_SYMBOL|\bsharedDepTextCache\b/;
  const hooks = {
    beforeEach: /beforeEach\([\s\S]{0,300}?resetRealmSharedDepTextCache/,
    afterEach: /afterEach\([\s\S]{0,300}?resetRealmSharedDepTextCache/,
  };
  const clears = (source: string, hook: 'beforeEach' | 'afterEach'): boolean => hooks[hook].test(source);

  it('clears the slot before and after every test of a file that touches it', () => {
    const offenders = testFiles(root)
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        // `import type` never touches the slot.
        const valueSource = source.replace(/import\s+type\s+\{[^}]*\}\s+from\s+'[^']*';/g, '');
        return touchesSlot.test(valueSource) && !(clears(source, 'beforeEach') && clears(source, 'afterEach'));
      });
    expect(offenders).toEqual([]);
  });
});
