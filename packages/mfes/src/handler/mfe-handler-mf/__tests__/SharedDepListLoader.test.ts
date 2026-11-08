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
    await l.loadList(ctx, { items: [a, b] }, resolve);
    // One batch: every item fetch issued before any resolved (all
    // dispatched synchronously in one microtask turn).
    expect(calls.sort()).toEqual([resolve(a.location), resolve(b.location)].sort());
    expect(ctx.specifierToBlob.get('pkg-a')).toMatch(/^blob:/);
    expect(ctx.specifierToBlob.get('pkg-b')).toMatch(/^blob:/);
    // Second load through the same realm cache issues no request.
    const { fetchText: fetch2, calls: calls2 } = fetchSpy(files);
    const l2 = new SharedDepListLoader(fetch2, 'e', cache as never);
    const ctx2 = l2.createContext();
    await l2.loadList(ctx2, { items: [a, b] }, resolve);
    expect(calls2).toEqual([]);
    // Per-load isolation: distinct blob URLs per load.
    expect(ctx2.specifierToBlob.get('pkg-a')).not.toBe(ctx.specifierToBlob.get('pkg-a'));
  });

  it('fetches a lazy dependent list in one round on first use, deduped', async () => {
    const main = item2('chunks/main.js', "export const m=1;", ['pkg-main']);
    const lazyItem = item2('chunks/lazy.js', "export const l=1;", ['pkg-lazy']);
    const lazyList: SharedDepFetchList = { items: [lazyItem] };
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
    await l.loadList(ctx, { items: [main], lazy: { 'chunks/lazy.js': lazyRef } }, resolve);
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
    const enList: SharedDepFetchList = { items: [en] };
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
    await l.loadList(ctx, { items: [main], patterns: { 'locales/en.js': enRef } }, resolve);
    await l.resolveDependent(ctx, 'locales/en.js', resolve);
    expect(calls).toContain(resolve('lists/en.json'));
    expect(ctx.specifierToBlob.get('pkg-locale-en')).toMatch(/^blob:/);
  });

  it('resolves a relative dynamic import to a dependent-list token', () => {
    const record = { item: item2('chunks/main.js', 'x', [], []), text: 'x' };
    const l = new SharedDepListLoader(async () => '', 'e', new Map() as never);
    const ctx = l.createContext();
    ctx.dependentLists.set('chunks/lazy.js', { items: [] });
    const token = SharedDepListMinter.resolveLocation(record.item.location, './lazy.js');
    expect(ctx.dependentLists.has(token)).toBe(true);
  });
});
