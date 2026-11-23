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
    const l = new SharedDepListLoader(fetchText, 'e', cache);
    const ctx = l.createContext([a, b], {}, resolve);
    await l.loadList(ctx, listOf([a, b]), resolve);
    // One batch: every item fetch issued before any resolved (all
    // dispatched synchronously in one microtask turn).
    expect(calls.sort()).toEqual([resolve(a.location), resolve(b.location)].sort());
    expect(ctx.specifierToBlob.get('pkg-a')).toMatch(/^blob:/);
    expect(ctx.specifierToBlob.get('pkg-b')).toMatch(/^blob:/);
    // Second load through the same realm cache issues no request.
    const { fetchText: fetch2, calls: calls2 } = fetchSpy(files);
    const l2 = new SharedDepListLoader(fetch2, 'e', cache);
    const ctx2 = l2.createContext([a, b], {}, resolve);
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
    const l = new SharedDepListLoader(fetchText, 'e', cache);
    const ctx = l.createContext([a], {}, resolve);
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
    const ctx = l.createContext([a, twin], {}, resolve);
    await l.loadList(ctx, listOf([a, twin]), resolve);
    // One fetch for the shared content identity, not one per location.
    expect(calls).toEqual([resolve(a.location)]);
    // Both locations stay registered and resolve to the minted blob.
    expect(ctx.itemByUrl.get(resolve(a.location))?.contentHash).toBe(a.contentHash);
    expect(ctx.itemByUrl.get(resolve(twin.location))?.contentHash).toBe(a.contentHash);
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
    const ctx = l.createContext([main, lazyItem], lists, resolve);
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
    const ctx = l.createContext([main, en], lists, resolve);
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
    const ctx = l.createContext([a, twin], {}, resolve);
    await l.loadList(ctx, listOf([a]), resolve);
    expect(calls).toEqual([resolve(a.location)]);
    expect(ctx.specifierToBlob.get('pkg-a')).toMatch(/^blob:/);
    expect(ctx.specifierToBlob.get('pkg-b')).toBe(ctx.specifierToBlob.get('pkg-a'));
  });

  it('mints byte-identical units in different directories per directory when their relative edges bind different siblings', async () => {
    // One importer text, two directories: the unhashed relative specifier
    // `./sib.js` resolves to a different sibling in each.
    const importerText = "import './sib.js';\nexport const x = 1;\n";
    const sibP = item2('p@1/sib.js', 'export const s = "p";');
    const sibQ = item2('q@1/sib.js', 'export const s = "q";');
    const impP = item2('p@1/importer.js', importerText, ['pkg-p'], [{ unit: sibP.contentHash }]);
    const impQ = item2('q@1/importer.js', importerText, ['pkg-q'], [{ unit: sibQ.contentHash }]);
    const files = new Map([
      [resolve(impP.location), importerText],
      [resolve(sibP.location), 'export const s = "p";'],
      [resolve(sibQ.location), 'export const s = "q";'],
    ]);
    const { fetchText, calls } = fetchSpy(files);
    const l = new SharedDepListLoader(fetchText, 'e', new Map<string, Promise<string>>());
    const ctx = l.createContext([impP, impQ, sibP, sibQ], {}, resolve);
    const bodies = new Map<string, string>();
    const original = URL.createObjectURL;
    let n = 0;
    URL.createObjectURL = ((blob: Blob) => {
      const url = `blob:test/${n++}`;
      // jsdom's Blob has no `text()`, so the text comes back through FileReader.
      const reader = new FileReader();
      reader.onload = () => bodies.set(url, String(reader.result));
      reader.readAsText(blob);
      return url;
    }) as typeof URL.createObjectURL;
    try {
      await l.loadList(ctx, listOf([impP, sibP, sibQ]), resolve);
    } finally {
      URL.createObjectURL = original;
    }
    await new Promise((r) => setTimeout(r, 20));
    // The importer text is fetched once, minted once per directory.
    expect(calls.filter((c) => c === resolve(impP.location))).toHaveLength(1);
    const blobP = l.blobForKey(ctx, impP.location)!;
    const blobQ = l.blobForKey(ctx, impQ.location)!;
    expect(blobP).not.toBe(blobQ);
    expect(bodies.get(blobP)).toContain(l.blobForKey(ctx, sibP.location)!);
    expect(bodies.get(blobQ)).toContain(l.blobForKey(ctx, sibQ.location)!);
  });

  describe('twin units that mint per directory', () => {
    const importerText = "import './sib.js';\nexport const x = 1;\n";
    const sibP = item2('p@1/sib.js', 'export const s = "p";');
    const sibQ = item2('q@1/sib.js', 'export const s = "q";');
    const impP = item2('p@1/importer.js', importerText, ['pkg-p'], [{ unit: sibP.contentHash }]);
    const impQ = item2('q@1/importer.js', importerText, ['pkg-q'], [{ unit: sibQ.contentHash }]);
    const files = new Map([
      [resolve(impP.location), importerText],
      [resolve(sibP.location), 'export const s = "p";'],
      [resolve(sibQ.location), 'export const s = "q";'],
    ]);
    const bodies = new Map<string, string>();
    let restore: () => void;
    const capture = (): void => {
      const original = URL.createObjectURL;
      let n = 0;
      URL.createObjectURL = ((blob: Blob) => {
        const url = `blob:twin/${n++}`;
        const reader = new FileReader();
        reader.onload = () => bodies.set(url, String(reader.result));
        reader.readAsText(blob);
        return url;
      }) as typeof URL.createObjectURL;
      restore = () => {
        URL.createObjectURL = original;
      };
    };
    const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 20));

    it('publishes each twin\'s own answers, not the combined set', async () => {
      bodies.clear();
      capture();
      const l = new SharedDepListLoader(fetchSpy(files).fetchText, 'e', new Map<string, Promise<string>>());
      const ctx = l.createContext([impP, impQ, sibP, sibQ], {}, resolve);
      try {
        await l.loadList(ctx, listOf([impP, sibP, sibQ]), resolve);
      } finally {
        restore();
      }
      expect(ctx.specifierToBlob.get('pkg-p')).toBe(l.blobForKey(ctx, impP.location));
      expect(ctx.specifierToBlob.get('pkg-q')).toBe(l.blobForKey(ctx, impQ.location));
      expect(ctx.specifierToBlob.get('pkg-p')).not.toBe(ctx.specifierToBlob.get('pkg-q'));
    });

    it('defers a twin whose own sibling no list has delivered yet, and mints it with the later list', async () => {
      bodies.clear();
      capture();
      const l = new SharedDepListLoader(fetchSpy(files).fetchText, 'e', new Map<string, Promise<string>>());
      const ctx = l.createContext([impP, impQ, sibP, sibQ], {}, resolve);
      try {
        await l.loadList(ctx, listOf([impP, sibP]), resolve);
        await settle();
        // q's twin waits: nothing half-rewritten was minted for it.
        expect(l.blobForKey(ctx, impQ.location)).toBeUndefined();
        expect(ctx.specifierToBlob.has('pkg-q')).toBe(false);
        const first = l.blobForKey(ctx, impP.location)!;
        expect(bodies.get(first)).toContain(l.blobForKey(ctx, sibP.location)!);

        await l.loadList(ctx, listOf([impQ, sibQ]), resolve);
        await settle();
      } finally {
        restore();
      }
      const second = l.blobForKey(ctx, impQ.location)!;
      expect(second).toBeDefined();
      expect(bodies.get(second)).toContain(l.blobForKey(ctx, sibQ.location)!);
      expect(bodies.get(second)).not.toContain('./sib.js');
    });
  });

  it('loadList returns the bytes its batch actually transferred; cache joins count nothing', async () => {
    const a = item2('chunks/a.js', "export const a=1;", ['pkg-a']);
    const files = new Map([[resolve(a.location), "export const a=1;"]]);
    const cache = new Map<string, Promise<string>>();
    const { fetchText } = fetchSpy(files);
    const l = new SharedDepListLoader(fetchText, 'e', cache);
    const first = await l.loadList(l.createContext([a], {}, resolve), listOf([a]), resolve);
    expect(first).toBe(new TextEncoder().encode("export const a=1;").length);
    // Second load through the same realm cache issues no request.
    const l2 = new SharedDepListLoader(fetchText, 'e', cache);
    const second = await l2.loadList(l2.createContext([a], {}, resolve), listOf([a]), resolve);
    expect(second).toBe(0);
  });

  it('resolves a relative specifier to the location a dependent list is keyed by', () => {
    const record = { item: item2('chunks/main.js', 'x', [], []), text: 'x' };
    const l = new SharedDepListLoader(async () => '', 'e', new Map<string, Promise<string>>());
    const ctx = l.createContext([], {}, resolve);
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
      const l = new SharedDepListLoader(fetchText, 'e', cache);
      const ownCalls: string[] = [];
      const fetchOwn = vi.fn(async (location: string): Promise<unknown> => {
        ownCalls.push(location);
        return 'export const o=1;';
      });
      const pending = l.loadList(
        l.createContext([a], {}, resolve),
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
          l.createContext([a], {}, resolve),
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
      const ctx = l.createContext([lazyItem], {}, resolve);
      ctx.dependentLists.set('chunks/lazy.js', listOf([lazyItem], { ownChunks: ['assets/lz.js'] }));
      const fetchOwn = vi.fn(async (): Promise<unknown> => 'export const o=1;');
      await l.resolveDependent(ctx, 'chunks/lazy.js', resolve, undefined, fetchOwn);
      expect(fetchOwn).toHaveBeenCalledExactlyOnceWith('assets/lz.js');
    });
  });
});
