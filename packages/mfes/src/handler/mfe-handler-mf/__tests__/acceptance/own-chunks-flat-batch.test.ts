/**
 * Acceptance: on the fetch-list path the one round holds the entry module,
 * the missing list units and the list's `ownChunks`, all issued from the
 * manifest-held list before any response; own chunks are fetched through
 * the handler source-text cache (never the realm cache), the chain build
 * issues no second request for a listed own chunk, an own chunk missing
 * from `ownChunks` is still fetched when the chain build reaches it, and
 * the fixed limit of six requests in flight applies only on the path
 * without a fetch list (`inst-md-fetch-reachable-units`,
 * `inst-fetch-source`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubbedDynamicModuleOps } from '../helpers/blob-module-stub';

const blobModuleStub = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../../mf-dynamic-module-ops', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../mf-dynamic-module-ops')>();
  return {
    ...actual,
    DynamicModuleOps: stubbedDynamicModuleOps(
      actual.DynamicModuleOps,
      blobModuleStub,
    ),
  };
});

import { newHandler } from '../helpers/registered-manifest';
import { SharedTextAdmission } from '../../SharedTextAdmission';
import { SharedDepListLoader } from '../../SharedDepListLoader';
import { LazyLoaderRegistry } from '../../../../lazy-loader/LazyLoaderRegistry';
import { MfeLoadError } from '../../../../errors';
import type { MfManifest } from '../../../../manifest/mf-manifest';
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
  listOf,
  type NestedList,
  PUBLIC_PATH,
  sharedDep,
  sha256Hex,
  unitOf,
} from '../helpers/manifest-builder';
import { jsResponse } from '../helpers/fetch-router';
import { stubSuccessfulImport } from '../helpers/blob-module-stub';
import {
  realmCacheDiagnostics,
  realmSharedDepTextCache,
  resetRealmSharedDepTextCache,
} from '../helpers/realm-cache';

beforeEach(() => {
  resetRealmSharedDepTextCache();
  stubSuccessfulImport(blobModuleStub);
});
afterEach(() => {
  resetRealmSharedDepTextCache();
  blobModuleStub.current = undefined;
  vi.restoreAllMocks();
});

const ITEM_TEXT = 'export const r = 1;\n';
const ITEM_URL = `${PUBLIC_PATH}shared/react/index.abc.js`;
const ENTRY_URL = `${PUBLIC_PATH}assets/lifecycle.js`;
const own = (name: string): string => `${PUBLIC_PATH}assets/${name}.js`;
const OWN_TEXT = 'export const o = 2;\n';

const REACT = unitOf('shared/react/index.abc.js', ITEM_TEXT, ['react']);

const listWith = (
  ownChunks: string[],
  rest: Partial<NestedList> = {},
): NestedList => listOf([REACT], { ownChunks, ...rest });

function entryText(...imports: string[]): string {
  return (
    imports.map((name) => `import "./${name}.js";\n`).join('') +
    'import { r } from "react";\n' +
    'export default { mount() { return r; }, unmount() {} };\n'
  );
}

function manifestFor(list: NestedList): MfManifest {
  return buildManifest([sharedDep('react')], {
    units: [REACT],
    lists: { './lifecycle': list },
  });
}

/** A fetch whose responses the test delivers by URL, recording issue order. */
function controlledFetch() {
  const issued: string[] = [];
  const pending = new Map<string, Array<(response: Response) => void>>();
  vi.spyOn(globalThis, 'fetch').mockImplementation(((
    input: string | URL | Request,
  ) => {
    const url = String(input);
    issued.push(url);
    return new Promise<Response>((resolve) => {
      pending.set(url, [...(pending.get(url) ?? []), resolve]);
    });
  }) as typeof fetch);
  return {
    issued,
    count: (url: string): number => issued.filter((u) => u === url).length,
    ok: (url: string, body: string): void => {
      const waiting = pending.get(url);
      if (waiting === undefined) throw new Error(`${url} was not requested`);
      for (const resolve of waiting) resolve(jsResponse(body));
    },
    fail: (url: string): void => {
      const waiting = pending.get(url);
      if (waiting === undefined) throw new Error(`${url} was not requested`);
      for (const resolve of waiting) resolve(jsResponse('missing', false));
    },
  };
}
type Net = ReturnType<typeof controlledFetch>;

const turn = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });
async function until(condition: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 3000; i += 1) {
    if (condition()) return;
    await turn();
  }
  throw new Error(`timed out waiting for ${what}`);
}
const issuedAll = (net: Net, urls: string[]): Promise<void> =>
  until(() => urls.every((u) => net.issued.includes(u)), urls.join(', '));

describe('acceptance: own chunks in the one round', () => {
  it('requests the entry module, the list units and every listed own chunk together, before any response', async () => {
    const list = listWith(['assets/a.js', 'assets/b.js']);
    const net = controlledFetch();
    const loading = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
      buildEntry(manifestFor(list)),
      'ext-flat',
    );
    await issuedAll(net, [ENTRY_URL, ITEM_URL, own('a'), own('b')]);
    // One round straight from the manifest: the entry module first, then
    // the list unit and the own chunks in list order, all out before any
    // response, with no list document in between.
    expect(net.issued).toEqual([ENTRY_URL, ITEM_URL, own('a'), own('b')]);
    net.ok(ITEM_URL, ITEM_TEXT);
    net.ok(own('a'), OWN_TEXT);
    net.ok(own('b'), OWN_TEXT);
    net.ok(ENTRY_URL, entryText('a', 'b'));
    await loading;
    // The chain build joined the prefetched text: no second request.
    expect(net.count(own('a'))).toBe(1);
    expect(net.count(own('b'))).toBe(1);
    expect(net.count(ENTRY_URL)).toBe(1);
  });

  it('never admits an own chunk to the realm cache', async () => {
    const net = controlledFetch();
    const loading = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
      buildEntry(manifestFor(listWith(['assets/a.js']))),
      'ext-realm',
    );
    await issuedAll(net, [own('a')]);
    net.ok(ITEM_URL, ITEM_TEXT);
    net.ok(own('a'), OWN_TEXT);
    net.ok(ENTRY_URL, entryText('a'));
    await loading;
    const realm = realmSharedDepTextCache();
    // The realm cache's real key forms: the list unit is admitted; no key
    // form derived from the own chunk's text is.
    expect(realm.get(SharedTextAdmission.chunkKey(sha256Hex(ITEM_TEXT)))).toBeDefined();
    expect(realm.get(SharedTextAdmission.chunkKey(sha256Hex(OWN_TEXT)))).toBeUndefined();
    // Exactly the one shared text is held.
    expect(realmCacheDiagnostics().entries).toBe(1);
  });

  it('accepts an absolute own-chunk URL, and the chain build joins its text', async () => {
    // The absolute spelling of the chunk the entry imports as './a.js'.
    const net = controlledFetch();
    const loading = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
      buildEntry(manifestFor(listWith([own('a')]))),
      'ext-abs',
    );
    await issuedAll(net, [own('a')]);
    net.ok(ITEM_URL, ITEM_TEXT);
    net.ok(own('a'), OWN_TEXT);
    net.ok(ENTRY_URL, entryText('a'));
    await loading;
    expect(net.count(own('a'))).toBe(1);
  });

  it('still fetches an own chunk the list omits when the chain build reaches it', async () => {
    const net = controlledFetch();
    const loading = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
      buildEntry(manifestFor(listWith(['assets/a.js']))),
      'ext-unlisted',
    );
    await issuedAll(net, [own('a')]);
    net.ok(ITEM_URL, ITEM_TEXT);
    net.ok(own('a'), OWN_TEXT);
    net.ok(ENTRY_URL, entryText('a', 'missing'));
    await issuedAll(net, [own('missing')]);
    expect(net.count(own('missing'))).toBe(1);
    net.ok(own('missing'), OWN_TEXT);
    await loading;
    expect(net.count(own('a'))).toBe(1);
  });

  it('fails the load naming the own chunk when a listed own chunk request fails', async () => {
    const net = controlledFetch();
    const loading = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
      buildEntry(manifestFor(listWith(['assets/a.js']))),
      'ext-own-fail',
    );
    await issuedAll(net, [own('a')]);
    net.ok(ITEM_URL, ITEM_TEXT);
    net.fail(own('a'));
    const error = await loading.then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(MfeLoadError);
    expect(String((error as Error).message)).toContain(own('a'));
  });

  it('does not bound the fetch-list chain build to six requests in flight', async () => {
    const names = Array.from({ length: 9 }, (_v, i) => `u${String(i)}`);
    const net = controlledFetch();
    const loading = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
      buildEntry(manifestFor(listWith([]))),
      'ext-unbounded',
    );
    await issuedAll(net, [ITEM_URL]);
    net.ok(ITEM_URL, ITEM_TEXT);
    net.ok(ENTRY_URL, entryText(...names));
    // All nine unlisted siblings are in flight together: none waits on a slot.
    await issuedAll(
      net,
      names.map((n) => own(n)),
    );
    for (const n of names) net.ok(own(n), OWN_TEXT);
    await loading;
  });

  it('issues no own-chunk request once the load has failed', async () => {
    const net = controlledFetch();
    // The entry fails when `loadList` is entered, before its batch.
    const realLoadList = SharedDepListLoader.prototype.loadList;
    vi.spyOn(SharedDepListLoader.prototype, 'loadList').mockImplementation(
      async function (this: SharedDepListLoader, ...args) {
        net.fail(ENTRY_URL);
        await turn();
        await turn();
        return realLoadList.apply(this, args);
      },
    );
    const loading = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
      buildEntry(manifestFor(listWith(['assets/a.js']))),
      'ext-gate',
    );
    const error = await loading.then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(MfeLoadError);
    await turn();
    expect(net.count(own('a'))).toBe(0);
    expect(net.count(ITEM_URL)).toBe(0);
  });

  it('requests a lazy target\'s own chunk, its list\'s own chunks and units in one round, and the lazy chain build joins them', async () => {
    const list = listWith([], {
      lazy: { 'assets/lazy.js': listOf([], { ownChunks: ['assets/lazy-dep.js'] }) },
    });
    const entry =
      'import { r } from "react";\n' +
      "export const l = () => __frontx_lazy('./lazy.js');\n" +
      'export default { mount() { return r; }, unmount() {} };\n';
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    const loading = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
      buildEntry(manifestFor(list)),
      'ext-lazy',
    );
    await issuedAll(net, [ITEM_URL]);
    net.ok(ITEM_URL, ITEM_TEXT);
    net.ok(ENTRY_URL, entry);
    await loading;
    const resolver = register.mock.calls[0]![0];
    const resolving = resolver('./lazy.js');
    // The target's own chunk and its list's own chunk go out together.
    await issuedAll(net, [own('lazy'), own('lazy-dep')]);
    net.ok(own('lazy-dep'), OWN_TEXT);
    net.ok(own('lazy'), 'import "./lazy-dep.js";\nexport const z = 1;\n');
    expect(await resolving).toMatch(/^blob:/);
    expect(net.count(own('lazy-dep'))).toBe(1);
    expect(net.count(own('lazy'))).toBe(1);
  });

  it('fetches each of more than 256 listed own chunks exactly once, despite the shared handler cache bound', async () => {
    const names = Array.from({ length: 300 }, (_v, i) => `c${String(i)}`);
    const net = controlledFetch();
    const loading = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
      buildEntry(manifestFor(listWith(names.map((n) => `assets/${n}.js`)))),
      'ext-many',
    );
    await issuedAll(
      net,
      names.map((n) => own(n)),
    );
    net.ok(ITEM_URL, ITEM_TEXT);
    for (const n of names) net.ok(own(n), OWN_TEXT);
    net.ok(ENTRY_URL, entryText(...names));
    await loading;
    for (const n of names) expect(net.count(own(n))).toBe(1);
  });
});
