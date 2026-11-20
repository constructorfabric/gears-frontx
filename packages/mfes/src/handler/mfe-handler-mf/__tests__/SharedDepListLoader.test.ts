/**
 * Acceptance coverage for the list-driven loader
 * (`cpt-frontx-adr-shared-dep-reuse`):
 *  - one parallel fetch batch per list, over the manifest's unit table
 *    (no list document, no second request round);
 *  - realm text-cache reuse across two loads;
 *  - lazy and pattern nested lists fetched in one round on first
 *    use, deduplicated, per-load minting isolation.
 */
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

import { SharedDepListLoader } from '../SharedDepListLoader';
import { SharedDepListMinter } from '../SharedDepListMinter';
import type {
  SharedDepFetchList,
  SharedDepUnit,
} from '../../../unit-format/fetch-list';

const hash = (text: string): string =>
  createHash('sha256').update(text).digest('hex');

const BASE = 'https://mfe.test/shared/';
const resolve = (location: string): string => new URL(location, BASE).href;

function fetchSpy(files: Map<string, string>) {
  const calls: string[] = [];
  const fetchText = vi.fn(async (url: string): Promise<string> => {
    calls.push(url);
    const text = files.get(url);
    if (text === undefined) throw new Error(`404 ${url}`);
    return text;
  });
  return { fetchText, calls };
}

const item2 = (
  location: string,
  text: string,
  answers: string[] = [],
  imports: (string | { unit: string })[] = [],
): SharedDepUnit => ({ location, contentHash: hash(text), answers, imports });

const listOf = (
  units: readonly SharedDepUnit[],
  rest: Partial<SharedDepFetchList> = {},
): SharedDepFetchList => ({
  units: units.map((u) => u.contentHash),
  ownChunks: [],
  ...rest,
});

describe('SharedDepListLoader', () => {
  it('fetches every item missing from the realm cache in one parallel batch', async () => {
    const a = item2('chunks/a.js', "export const a=1;", ['pkg-a']);
    const b = item2('chunks/b.js', "export const b=2;", ['pkg-b'], ['pkg-a']);
    const files = new Map([[resolve(a.location), "export const a=1;"], [resolve(b.location), "export const b=2;"]]);
    const { fetchText, calls } = fetchSpy(files);
    const cache = new Map<string, Promise<string>>();
    const l = new SharedDepListLoader(fetchText, 'e', cache as never);
    const ctx = l.createContext([a, b], {});
    await l.loadList(ctx, listOf([a, b]), resolve);
    // One batch: every item fetch issued before any resolved (all
    // dispatched synchronously in one microtask turn).
    expect(calls.sort()).toEqual([resolve(a.location), resolve(b.location)].sort());
    expect(ctx.specifierToBlob.get('pkg-a')).toMatch(/^blob:/);
    expect(ctx.specifierToBlob.get('pkg-b')).toMatch(/^blob:/);
    // Second load through the same realm cache issues no request.
    const { fetchText: fetch2, calls: calls2 } = fetchSpy(files);
    const l2 = new SharedDepListLoader(fetch2, 'e', cache as never);
    const ctx2 = l2.createContext([a, b], {});
    await l2.loadList(ctx2, listOf([a, b]), resolve);
    expect(calls2).toEqual([]);
    // Per-load isolation: distinct blob URLs per load.
    expect(ctx2.specifierToBlob.get('pkg-a')).not.toBe(ctx.specifierToBlob.get('pkg-a'));
  });

  it('admits fetched item text as fetched under its declared identity, whatever its bytes', async () => {
    const a = item2('chunks/a.js', 'export const a=1;', ['pkg-a']);
    const served = 'export const a=2; // not the bytes the hash names';
    const files = new Map([[resolve(a.location), served]]);
    const { fetchText } = fetchSpy(files);
    const cache = new Map<string, Promise<string>>();
    const l = new SharedDepListLoader(fetchText, 'e', cache as never);
    const ctx = l.createContext([a], {});
    await l.loadList(ctx, listOf([a]), resolve);
    await expect(cache.get(`chunk:${a.contentHash}`)).resolves.toBe(served);
    expect(ctx.specifierToBlob.get('pkg-a')).toMatch(/^blob:/);
  });

  it('fetches one payload per contentHash when two locations share it; both resolve', async () => {
    const text = 'export const a=1;';
    const a = item2('chunks/a.js', text, ['pkg-a']);
    const twin = item2('other-pkg@1.0.0/chunks/a.js', text);
    const files = new Map([[resolve(a.location), text]]);
    const { fetchText, calls } = fetchSpy(files);
    const l = new SharedDepListLoader(fetchText, 'e', new Map<string, Promise<string>>());
    const ctx = l.createContext([a, twin], {});
    await l.loadList(ctx, listOf([a, twin]), resolve);
    // One fetch for the shared content identity, not one per location.
    expect(calls).toEqual([resolve(a.location)]);
    // Both locations stay registered and resolve to the minted blob.
    expect(ctx.itemByLocation.get(a.location)?.contentHash).toBe(a.contentHash);
    expect(ctx.itemByLocation.get(twin.location)?.contentHash).toBe(a.contentHash);
    expect(l.blobForKey(ctx, twin.location)).toBe(
      ctx.itemBlobByHash.get(a.contentHash),
    );
    expect(ctx.specifierToBlob.get('pkg-a')).toMatch(/^blob:/);
  }, 30000);

  it('fetches a lazy nested list in one round on first use, deduped', async () => {
    const main = item2('chunks/main.js', "export const m=1;", ['pkg-main']);
    const lazyItem = item2('chunks/lazy.js', "export const l=1;", ['pkg-lazy']);
    const files = new Map([
      [resolve(main.location), "export const m=1;"],
      [resolve(lazyItem.location), "export const l=1;"],
    ]);
    const { fetchText, calls } = fetchSpy(files);
    const l = new SharedDepListLoader(fetchText, 'e', new Map<string, Promise<string>>());
    const lists = { main: listOf([main], { lazy: ['chunks/lazy.js'] }), 'chunks/lazy.js': listOf([lazyItem]) };
    const ctx = l.createContext([main, lazyItem], lists);
    await l.loadList(ctx, lists.main, resolve);
    const before = calls.length;
    await Promise.all([
      l.resolveDependent(ctx, 'chunks/lazy.js', resolve),
      l.resolveDependent(ctx, 'chunks/lazy.js', resolve),
    ]);
    // One round: the nested list's missing unit, with no list document.
    expect(calls.slice(before)).toEqual([resolve(lazyItem.location)]);
    expect(ctx.specifierToBlob.get('pkg-lazy')).toMatch(/^blob:/);
    expect(l.blobForKey(ctx, 'chunks/lazy.js')).toBe(ctx.itemBlobByHash.get(lazyItem.contentHash));
    // Second resolution costs nothing.
    const afterFirst = calls.length;
    await l.resolveDependent(ctx, 'chunks/lazy.js', resolve);
    expect(calls.length).toBe(afterFirst);
  });

  it('pattern imports resolve their matching file list like a lazy target', async () => {
    const main = item2('chunks/main.js', "export const m=1;", ['pkg-main']);
    const en = item2('locales/en.js', "export default {};", ['pkg-locale-en']);
    const files = new Map([
      [resolve(main.location), "export const m=1;"],
      [resolve(en.location), "export default {};"],
    ]);
    const { fetchText, calls } = fetchSpy(files);
    const l = new SharedDepListLoader(fetchText, 'e', new Map<string, Promise<string>>());
    const lists = { main: listOf([main], { patterns: ['locales/en.js'] }), 'locales/en.js': listOf([en]) };
    const ctx = l.createContext([main, en], lists);
    await l.loadList(ctx, lists.main, resolve);
    await l.resolveDependent(ctx, 'locales/en.js', resolve);
    expect(calls).toContain(resolve(en.location));
    expect(ctx.specifierToBlob.get('pkg-locale-en')).toMatch(/^blob:/);
  });

  it('publishes the answers of every table unit carrying a minted content identity', async () => {
    const text = 'export const a=1;';
    const a = item2('chunks/a.js', text, ['pkg-a']);
    const twin = item2('other-pkg@1.0.0/chunks/a.js', text, ['pkg-b']);
    const { fetchText, calls } = fetchSpy(new Map([[resolve(a.location), text]]));
    const l = new SharedDepListLoader(fetchText, 'e', new Map<string, Promise<string>>());
    // The list names the content identity once, however many table units carry it.
    const ctx = l.createContext([a, twin], {});
    await l.loadList(ctx, listOf([a]), resolve);
    expect(calls).toEqual([resolve(a.location)]);
    expect(ctx.specifierToBlob.get('pkg-a')).toMatch(/^blob:/);
    expect(ctx.specifierToBlob.get('pkg-b')).toBe(ctx.specifierToBlob.get('pkg-a'));
  });

  it('loadList returns the bytes its batch actually transferred; cache joins count nothing', async () => {
    const a = item2('chunks/a.js', "export const a=1;", ['pkg-a']);
    const files = new Map([[resolve(a.location), "export const a=1;"]]);
    const cache = new Map<string, Promise<string>>();
    const { fetchText } = fetchSpy(files);
    const l = new SharedDepListLoader(fetchText, 'e', cache as never);
    const first = await l.loadList(l.createContext([a], {}), listOf([a]), resolve);
    expect(first).toBe(new TextEncoder().encode("export const a=1;").length);
    // Second load through the same realm cache issues no request.
    const l2 = new SharedDepListLoader(fetchText, 'e', cache as never);
    const second = await l2.loadList(l2.createContext([a], {}), listOf([a]), resolve);
    expect(second).toBe(0);
  });

  it('resolves a relative specifier to the location a dependent list is keyed by', () => {
    const record = { item: item2('chunks/main.js', 'x', [], []), text: 'x' };
    const l = new SharedDepListLoader(async () => '', 'e', new Map<string, Promise<string>>());
    const ctx = l.createContext([], {});
    ctx.dependentLists.set('chunks/lazy.js', { units: [], ownChunks: [] });
    const token = SharedDepListMinter.resolveLocation(record.item.location, './lazy.js');
    expect(ctx.dependentLists.has(token)).toBe(true);
  });

  describe('own chunks', () => {
    it('issues every distinct ownChunks entry in the same synchronous turn as the item requests, once each, outside the realm cache and the byte count', async () => {
      const a = item2('chunks/a.js', 'export const a=1;', ['pkg-a']);
      const files = new Map([[resolve(a.location), 'export const a=1;']]);
      const { fetchText, calls } = fetchSpy(files);
      const cache = new Map<string, Promise<string>>();
      const l = new SharedDepListLoader(fetchText, 'e', cache as never);
      const ownCalls: string[] = [];
      const fetchOwn = vi.fn(async (location: string): Promise<unknown> => {
        ownCalls.push(location);
        return 'export const o=1;';
      });
      const pending = l.loadList(
        l.createContext([a], {}),
        listOf([a], { ownChunks: ['assets/x.js', 'assets/y.js', 'assets/x.js'] }),
        resolve,
        undefined,
        fetchOwn,
      );
      // Everything of the batch is requested before any response is awaited.
      expect(calls).toHaveLength(1);
      expect(ownCalls).toEqual(['assets/x.js', 'assets/y.js']);
      const bytes = await pending;
      expect(fetchOwn).toHaveBeenCalledTimes(2);
      expect([...cache.keys()]).toEqual([`chunk:${hash('export const a=1;')}`]);
      expect(bytes).toBe(new TextEncoder().encode('export const a=1;').length);
    });

    it('fails the load with the own chunk\'s error, and a synchronous throw of the request becomes a rejection', async () => {
      const a = item2('chunks/a.js', 'export const a=1;', ['pkg-a']);
      const { fetchText } = fetchSpy(new Map([[resolve(a.location), 'export const a=1;']]));
      const l = new SharedDepListLoader(fetchText, 'e', new Map<string, Promise<string>>());
      await expect(
        l.loadList(
          l.createContext([a], {}),
          listOf([a], { ownChunks: ['assets/x.js'] }),
          resolve,
          undefined,
          () => {
            throw new Error('boom');
          },
        ),
      ).rejects.toThrow('boom');
    });

    it('forwards fetchOwnChunk from resolveDependent, fetching the nested list\'s own chunks in its round', async () => {
      const lazyItem = item2('chunks/lazy.js', 'export const l=1;', ['pkg-lazy']);
      const { fetchText } = fetchSpy(new Map([[resolve(lazyItem.location), 'export const l=1;']]));
      const l = new SharedDepListLoader(fetchText, 'e', new Map<string, Promise<string>>());
      const ctx = l.createContext([lazyItem], {});
      ctx.dependentLists.set('chunks/lazy.js', listOf([lazyItem], { ownChunks: ['assets/lz.js'] }));
      const fetchOwn = vi.fn(async (): Promise<unknown> => 'export const o=1;');
      await l.resolveDependent(ctx, 'chunks/lazy.js', resolve, undefined, fetchOwn);
      expect(fetchOwn).toHaveBeenCalledExactlyOnceWith('assets/lz.js');
    });
  });
});
