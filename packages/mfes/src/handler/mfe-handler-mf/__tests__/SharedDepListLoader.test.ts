/**
 * Acceptance coverage for the list-driven loader
 * (`cpt-frontx-adr-shared-dep-reuse`):
 *  - one parallel fetch batch per list (no second request round);
 *  - realm text-cache reuse across two loads;
 *  - lazy and pattern dependent lists fetched in one round on first
 *    use, deduplicated, per-load minting isolation.
 */
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

import { SharedDepListLoader } from '../SharedDepListLoader';
import { SharedDepListMinter } from '../SharedDepListMinter';
import type {
  SharedDepFetchList,
  SharedDepFileRef,
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

const item2 = (location: string, text: string, answers: string[] = [], imports: (string | { item: string })[] = []) =>
  ({ location, contentHash: hash(text), answers, imports });

describe('SharedDepListLoader', () => {
  it('fetches every item missing from the realm cache in one parallel batch', async () => {
    const a = item2('chunks/a.js', "export const a=1;", ['pkg-a']);
    const b = item2('chunks/b.js', "export const b=2;", ['pkg-b'], ['pkg-a']);
    const files = new Map([[resolve(a.location), "export const a=1;"], [resolve(b.location), "export const b=2;"]]);
    const { fetchText, calls } = fetchSpy(files);
    const cache = new Map<string, Promise<string>>();
    const l = new SharedDepListLoader(fetchText, 'e', cache as never);
    const ctx = l.createContext();
    await l.loadList(ctx, { items: [a, b], ownChunks: [] }, resolve);
    // One batch: every item fetch issued before any resolved (all
    // dispatched synchronously in one microtask turn).
    expect(calls.sort()).toEqual([resolve(a.location), resolve(b.location)].sort());
    expect(ctx.specifierToBlob.get('pkg-a')).toMatch(/^blob:/);
    expect(ctx.specifierToBlob.get('pkg-b')).toMatch(/^blob:/);
    // Second load through the same realm cache issues no request.
    const { fetchText: fetch2, calls: calls2 } = fetchSpy(files);
    const l2 = new SharedDepListLoader(fetch2, 'e', cache as never);
    const ctx2 = l2.createContext();
    await l2.loadList(ctx2, { items: [a, b], ownChunks: [] }, resolve);
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
    const ctx = l.createContext();
    await l.loadList(ctx, { items: [a], ownChunks: [] }, resolve);
    await expect(cache.get(`chunk:${a.contentHash}`)).resolves.toBe(served);
    expect(ctx.specifierToBlob.get('pkg-a')).toMatch(/^blob:/);
  });

  it('fetches one payload per contentHash when two locations share it; both resolve', async () => {
    const text = 'export const a=1;';
    const a = item2('chunks/a.js', text, ['pkg-a']);
    const twin = item2('other-pkg@1.0.0/chunks/a.js', text);
    const files = new Map([[resolve(a.location), text]]);
    const { fetchText, calls } = fetchSpy(files);
    const l = new SharedDepListLoader(fetchText, 'e', new Map() as never);
    const ctx = l.createContext();
    await l.loadList(ctx, { items: [a, twin], ownChunks: [] }, resolve);
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

  it('fetches a lazy dependent list in one round on first use, deduped', async () => {
    const main = item2('chunks/main.js', "export const m=1;", ['pkg-main']);
    const lazyItem = item2('chunks/lazy.js', "export const l=1;", ['pkg-lazy']);
    const lazyList: SharedDepFetchList = { items: [lazyItem], ownChunks: [] };
    const lazyText = JSON.stringify(lazyList);
    const lazyRef: SharedDepFileRef = { location: 'lists/lazy.json', contentHash: hash(lazyText) };
    const files = new Map([
      [resolve(main.location), "export const m=1;"],
      [resolve(lazyItem.location), "export const l=1;"],
      [resolve(lazyRef.location), lazyText],
    ]);
    const { fetchText, calls } = fetchSpy(files);
    const l = new SharedDepListLoader(fetchText, 'e', new Map() as never);
    const ctx = l.createContext();
    await l.loadList(ctx, { items: [main], ownChunks: [], lazy: { 'chunks/lazy.js': lazyRef } }, resolve);
    const before = calls.length;
    await Promise.all([
      l.resolveDependent(ctx, 'chunks/lazy.js', resolve),
      l.resolveDependent(ctx, 'chunks/lazy.js', resolve),
    ]);
    // One round: list document + its missing item.
    expect(calls.slice(before).sort()).toEqual(
      [resolve('lists/lazy.json'), resolve(lazyItem.location)].sort(),
    );
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
    const enList: SharedDepFetchList = { items: [en], ownChunks: [] };
    const enText = JSON.stringify(enList);
    const enRef: SharedDepFileRef = { location: 'lists/en.json', contentHash: hash(enText) };
    const files = new Map([
      [resolve(main.location), "export const m=1;"],
      [resolve(en.location), "export default {};"],
      [resolve(enRef.location), enText],
    ]);
    const { fetchText, calls } = fetchSpy(files);
    const l = new SharedDepListLoader(fetchText, 'e', new Map() as never);
    const ctx = l.createContext();
    await l.loadList(ctx, { items: [main], ownChunks: [], patterns: { 'locales/en.js': enRef } }, resolve);
    await l.resolveDependent(ctx, 'locales/en.js', resolve);
    expect(calls).toContain(resolve('lists/en.json'));
    expect(ctx.specifierToBlob.get('pkg-locale-en')).toMatch(/^blob:/);
  });

  it('loadList returns the bytes its batch actually transferred; cache joins count nothing', async () => {
    const a = item2('chunks/a.js', "export const a=1;", ['pkg-a']);
    const files = new Map([[resolve(a.location), "export const a=1;"]]);
    const cache = new Map<string, Promise<string>>();
    const { fetchText } = fetchSpy(files);
    const l = new SharedDepListLoader(fetchText, 'e', cache as never);
    const first = await l.loadList(l.createContext(), { items: [a], ownChunks: [] }, resolve);
    expect(first).toBe(new TextEncoder().encode("export const a=1;").length);
    // Second load through the same realm cache issues no request.
    const l2 = new SharedDepListLoader(fetchText, 'e', cache as never);
    const second = await l2.loadList(l2.createContext(), { items: [a], ownChunks: [] }, resolve);
    expect(second).toBe(0);
  });

  it('dependentListKeyCandidates maps an asset-base filename to the shared-base location when sharedBase ≠ publicPath', () => {
    const candidates = SharedDepListLoader.dependentListKeyCandidates(
      'chunks/lazy.js',
      'https://mfe.test/app/',
      'https://mfe.test/shared/',
    );
    expect(candidates).toContain('chunks/lazy.js');
    expect(candidates).toContain('https://mfe.test/app/chunks/lazy.js');
    expect(candidates).toContain('../app/chunks/lazy.js');
    // Same base: the filename is the shared-base location itself.
    const same = SharedDepListLoader.dependentListKeyCandidates(
      'chunks/lazy.js',
      'https://mfe.test/app/',
      'https://mfe.test/app/',
    );
    expect(same).toContain('chunks/lazy.js');
  });

  it('resolves a lazy list keyed by its shared-base location when sharedBase ≠ publicPath', async () => {
    // publicPath base 'https://mfe.test/app/' vs shared base
    // 'https://mfe.test/shared/': the producer keys the lazy record by
    // the chunk's location relative to the shared base.
    const SHARED = 'https://mfe.test/shared/';
    const resolveShared = (location: string): string =>
      new URL(location, SHARED).href;
    const lazyItem = item2('units/lazydep.js', "export const l=1;", ['pkg-lazy']);
    const lazyList: SharedDepFetchList = { items: [lazyItem], ownChunks: [] };
    const lazyText = JSON.stringify(lazyList);
    const lazyRef: SharedDepFileRef = {
      location: 'lists/lazy.json',
      contentHash: hash(lazyText),
    };
    const files = new Map([
      [resolveShared(lazyItem.location), "export const l=1;"],
      [resolveShared(lazyRef.location), lazyText],
    ]);
    const { fetchText, calls } = fetchSpy(files);
    const l = new SharedDepListLoader(fetchText, 'e', new Map() as never);
    const ctx = l.createContext();
    ctx.dependentLists.set('../app/chunks/lazy.js', lazyRef);
    const key = SharedDepListLoader.dependentListKeyCandidates(
      'chunks/lazy.js',
      'https://mfe.test/app/',
      SHARED,
    ).find((candidate) => ctx.dependentLists.has(candidate));
    expect(key).toBe('../app/chunks/lazy.js');
    await l.resolveDependent(ctx, key!, resolveShared);
    expect(calls.sort()).toEqual(
      [resolveShared('lists/lazy.json'), resolveShared(lazyItem.location)].sort(),
    );
    expect(ctx.specifierToBlob.get('pkg-lazy')).toMatch(/^blob:/);
  });

  it('resolves a relative dynamic import to a dependent-list token', () => {
    const record = { item: item2('chunks/main.js', 'x', [], []), text: 'x' };
    const l = new SharedDepListLoader(async () => '', 'e', new Map() as never);
    const ctx = l.createContext();
    ctx.dependentLists.set('chunks/lazy.js', {
      location: 'lists/lazy.json',
      contentHash: 'a'.repeat(64),
    });
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
        l.createContext(),
        { items: [a], ownChunks: ['assets/x.js', 'assets/y.js', 'assets/x.js'] },
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
      const l = new SharedDepListLoader(fetchText, 'e', new Map() as never);
      await expect(
        l.loadList(
          l.createContext(),
          { items: [a], ownChunks: ['assets/x.js'] },
          resolve,
          undefined,
          () => {
            throw new Error('boom');
          },
        ),
      ).rejects.toThrow('boom');
    });

    it('forwards fetchOwnChunk from resolveDependent, fetching the delta\'s own chunks in the delta batch', async () => {
      const lazyItem = item2('chunks/lazy.js', 'export const l=1;', ['pkg-lazy']);
      const lazyList: SharedDepFetchList = { items: [lazyItem], ownChunks: ['assets/lz.js'] };
      const lazyText = JSON.stringify(lazyList);
      const lazyRef: SharedDepFileRef = { location: 'lists/lazy.json', contentHash: hash(lazyText) };
      const { fetchText } = fetchSpy(
        new Map([
          [resolve(lazyItem.location), 'export const l=1;'],
          [resolve(lazyRef.location), lazyText],
        ]),
      );
      const l = new SharedDepListLoader(fetchText, 'e', new Map() as never);
      const ctx = l.createContext();
      ctx.dependentLists.set('chunks/lazy.js', lazyRef);
      const fetchOwn = vi.fn(async (): Promise<unknown> => 'export const o=1;');
      await l.resolveDependent(ctx, 'chunks/lazy.js', resolve, undefined, fetchOwn);
      expect(fetchOwn).toHaveBeenCalledExactlyOnceWith('assets/lz.js');
    });
  });
});
