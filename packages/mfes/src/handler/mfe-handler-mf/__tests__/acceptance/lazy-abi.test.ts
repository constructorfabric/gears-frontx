/**
 * Acceptance: the lazy-import ABI on a fetch-list load and on a
 * whole-package load (`cpt-frontx-algo-mfe-loading-lazy-import-abi`,
 * `cpt-frontx-dod-mfe-loading-lazy-abi-isolation`): a lazy target's list
 * document and own chunk go out together, the list's second round is one
 * flat batch ahead of any mint, distinct targets download in parallel,
 * every literal and bounded-pattern import of a shared unit reaches the
 * ABI, and a target without a list follows the no-list rule.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
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
import { RealmSharedDepTextCacheProvider } from '../../RealmSharedDepTextCacheProvider';
import { SharedTextAdmission } from '../../SharedTextAdmission';
import { LazyLoaderRegistry } from '../../../../lazy-loader/LazyLoaderRegistry';
import { MfeLoadError } from '../../../../errors';
import type { MfManifest } from '../../../../manifest/mf-manifest';
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
  ENTRY_ID,
  PUBLIC_PATH,
  sharedDep,
  sha256Hex,
} from '../helpers/manifest-builder';
import { stubSuccessfulImport } from '../helpers/blob-module-stub';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';
import { captureMintedSources, type MintedSources } from '../helpers/minted-sources';
import {
  controlledFetch,
  issuedAll,
  settleTurn,
  until,
  type ControlledFetch,
} from '../helpers/controlled-fetch';

let minted: MintedSources;
beforeEach(() => {
  resetRealmSharedDepTextCache();
  stubSuccessfulImport(blobModuleStub);
  minted = captureMintedSources();
});
afterEach(() => {
  minted.restore();
  resetRealmSharedDepTextCache();
  blobModuleStub.current = undefined;
  vi.restoreAllMocks();
});

const REACT_TEXT = 'export const r = 1;\n';
const REACT_LOCATION = 'shared/react/index.abc.js';
const url = (relative: string): string => `${PUBLIC_PATH}${relative}`;
const ENTRY_URL = url('assets/lifecycle.js');
const LIST_URL = url('shared/react.list.json');
const OWN_TEXT = 'export const o = 2;\n';

interface ListItem {
  location: string;
  contentHash: string;
  answers: string[];
  imports: string[];
}

const item = (
  location: string,
  text: string,
  answers: string[] = [],
): ListItem => ({
  location,
  contentHash: sha256Hex(text),
  answers,
  imports: [],
});

const ref = (location: string, doc: string) => ({
  location,
  contentHash: sha256Hex(doc),
});

/** A fetch-list document, serialised with the producer's fields. */
const listDocument = (fields: {
  items?: ListItem[];
  ownChunks?: string[];
  lazy?: Record<string, { location: string; contentHash: string }>;
  patterns?: Record<string, { location: string; contentHash: string }>;
}): string =>
  JSON.stringify({ items: [], ownChunks: [], ...fields });

const entrySource = (...lazyTargets: string[]): string =>
  'import { r } from "react";\n' +
  lazyTargets.map((t) => `export const l_${t.replace(/\W/g, '_')} = () => __frontx_lazy('${t}');\n`).join('') +
  'export default { mount() { return r; }, unmount() {} };\n';

function manifestFor(
  doc: string,
  metaData: Partial<MfManifest['metaData']> = {},
): MfManifest {
  return buildManifest([sharedDep('react')], {
    metaData,
    entryLists: { './lifecycle': ref('shared/react.list.json', doc) },
  });
}

let loads = 0;
/** An extension id no earlier test of the file used (the handler memoises loads by it). */
const nextExtensionId = (): string => `ext-lazy-abi-${String(++loads)}`;

type Resolver = (argument: string) => Promise<string>;

/** The resolvers registered since `spy` started, in registration order. */
const registeredResolvers = (
  spy: MockInstance<LazyLoaderRegistry['register']>,
): Resolver[] => spy.mock.calls.map((call) => call[0]);

/**
 * Load a fetch-list MFE whose expose list is `doc` and whose entry module
 * is `entry`, answering the first-round and second-round requests.
 */
async function loadFetchListMfe(
  net: ControlledFetch,
  doc: string,
  entry: string,
  options: {
    metaData?: Partial<MfManifest['metaData']>;
    items?: Array<[string, string]>;
    ownChunks?: Array<[string, string]>;
  } = {},
): Promise<void> {
  const loading = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
    buildEntry(manifestFor(doc, options.metaData)),
    nextExtensionId(),
  );
  await issuedAll(net, [ENTRY_URL]);
  net.ok(LIST_URL, doc);
  const items = options.items ?? [[url(REACT_LOCATION), REACT_TEXT]];
  await issuedAll(net, items.map(([u]) => u));
  for (const [u, text] of items) net.ok(u, text);
  const ownChunks = options.ownChunks ?? [];
  await issuedAll(net, ownChunks.map(([u]) => u));
  for (const [u, text] of ownChunks) net.ok(u, text);
  net.ok(ENTRY_URL, entry);
  await loading;
}

const baseDoc = (extra: Parameters<typeof listDocument>[0] = {}): string =>
  listDocument({
    items: [item(REACT_LOCATION, REACT_TEXT, ['react'])],
    ...extra,
  });

/** The no-list warnings among `warn`'s calls (the load diagnostic is not one). */
const noListWarnings = (warn: { mock: { calls: unknown[][] } }): string[] =>
  warn.mock.calls
    .map((call) => String(call[0]))
    .filter((message) => message.includes('lazy-target fetch list'));

const lazyAbiArguments = (source: string): string[] =>
  [...source.matchAll(/__frontx_lazy(?:_\d+)?\(("(?:[^"\\]|\\.)*")/g)].map(
    (m) => JSON.parse(m[1]!) as string,
  );

describe('acceptance: lazy target first use on a fetch-list load', () => {
  it('requests the target\'s list document and its own chunk before either arrives', async () => {
    const lazyDoc = listDocument({});
    const doc = baseDoc({
      lazy: { 'assets/lazy.js': ref('shared/lazy.list.json', lazyDoc) },
    });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(net, doc, entrySource('./lazy.js'));
    const [resolve] = registeredResolvers(register);
    const resolving = resolve!('./lazy.js');
    await issuedAll(net, [url('shared/lazy.list.json'), url('assets/lazy.js')]);
    net.ok(url('shared/lazy.list.json'), lazyDoc);
    net.ok(url('assets/lazy.js'), 'export const z = 1;\n');
    expect(await resolving).toMatch(/^blob:/);
    expect(net.count(url('assets/lazy.js'))).toBe(1);
  });

  it('requests a shared-unit target\'s list alone first and its list item with the second round', async () => {
    const lazyText = 'export const s = 1;\n';
    const lazyItem = item('shared/react/lazyshared.js', lazyText);
    const lazyDoc = listDocument({ items: [lazyItem] });
    const reactText = "export const r = 1;\nexport const load = () => import('./lazyshared.js');\n";
    const doc = listDocument({
      items: [item(REACT_LOCATION, reactText, ['react'])],
      lazy: {
        'shared/react/lazyshared.js': ref('shared/lazyshared.list.json', lazyDoc),
      },
    });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(net, doc, entrySource(), {
      items: [[url(REACT_LOCATION), reactText]],
    });
    const argument = lazyAbiArguments((await minted.sources()).join('\n'))[0]!;
    const [unitResolver] = registeredResolvers(register);
    const before = net.issued.length;
    const resolving = unitResolver!(argument);
    await issuedAll(net, [url('shared/lazyshared.list.json')]);
    await settleTurn();
    // Only the list document: no own chunk is requested for a shared unit.
    expect(net.issued.slice(before)).toEqual([url('shared/lazyshared.list.json')]);
    net.ok(url('shared/lazyshared.list.json'), lazyDoc);
    await issuedAll(net, [url('shared/react/lazyshared.js')]);
    net.ok(url('shared/react/lazyshared.js'), lazyText);
    expect(await resolving).toMatch(/^blob:/);
  });

  it('requests every missing shared unit and every ownChunks entry in one unbounded batch before any mint', async () => {
    const texts = Array.from({ length: 8 }, (_v, i) => `export const u${String(i)} = ${String(i)};\n`);
    const items = texts.map((t, i) => item(`shared/u${String(i)}.js`, t, [`pkg-u${String(i)}`]));
    const own = ['assets/d0.js', 'assets/d1.js', 'assets/d2.js'];
    const lazyDoc = listDocument({ items, ownChunks: own });
    const doc = baseDoc({
      lazy: { 'assets/lazy.js': ref('shared/lazy.list.json', lazyDoc) },
    });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(net, doc, entrySource('./lazy.js'));
    const [resolve] = registeredResolvers(register);
    const resolving = resolve!('./lazy.js');
    await issuedAll(net, [url('shared/lazy.list.json'), url('assets/lazy.js')]);
    net.ok(url('shared/lazy.list.json'), lazyDoc);
    const batch = [...items.map((i) => url(i.location)), ...own.map(url)];
    await issuedAll(net, batch);
    // The whole batch is in flight together, none answered, nothing minted.
    expect(batch.length).toBeGreaterThan(6);
    const mintedBefore = (await minted.sources()).length;
    items.forEach((i, n) => net.ok(url(i.location), texts[n]!));
    own.forEach((o) => net.ok(url(o), OWN_TEXT));
    expect((await minted.sources()).length).toBe(mintedBefore);
    net.ok(url('assets/lazy.js'), 'export const z = 1;\n');
    expect(await resolving).toMatch(/^blob:/);
  });

  it('finds an own lazy chunk\'s list under its publicPath-relative location and a shared unit\'s under its sharedBase-relative location', async () => {
    const lazyDoc = listDocument({});
    const sharedText = "export const s = 1;\nexport const go = () => import('./deep.js');\n";
    const deepText = 'export const deep = 1;\n';
    const deepDoc = listDocument({ items: [item('react/deep.js', deepText)] });
    const doc = listDocument({
      items: [item('react/index.abc.js', sharedText, ['react'])],
      lazy: {
        // Own chunk: relative to publicPath. Shared unit: relative to sharedBase.
        'assets/lazy.js': ref('lazy.list.json', lazyDoc),
        'react/deep.js': ref('deep.list.json', deepDoc),
      },
    });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sharedBaseManifest = buildManifest([sharedDep('react')], {
      metaData: { sharedBase: './shared/' },
      entryLists: { './lifecycle': ref('react.list.json', doc) },
    });
    const loading = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
      buildEntry(sharedBaseManifest),
      nextExtensionId(),
    );
    await issuedAll(net, [ENTRY_URL, url('shared/react.list.json')]);
    net.ok(url('shared/react.list.json'), doc);
    await issuedAll(net, [url('shared/react/index.abc.js')]);
    net.ok(url('shared/react/index.abc.js'), sharedText);
    net.ok(ENTRY_URL, entrySource('./lazy.js'));
    await loading;
    const resolvers = registeredResolvers(register);
    const unitArgument = lazyAbiArguments((await minted.sources()).join('\n')).find((a) => a.includes('./deep.js'))!;
    const own = resolvers.at(-1)!;
    const unit = resolvers[0]!;
    const ownResolving = own('./lazy.js');
    await issuedAll(net, [url('shared/lazy.list.json'), url('assets/lazy.js')]);
    net.ok(url('shared/lazy.list.json'), lazyDoc);
    net.ok(url('assets/lazy.js'), 'export const z = 1;\n');
    await ownResolving;
    const unitResolving = unit(unitArgument);
    await issuedAll(net, [url('shared/deep.list.json')]);
    net.ok(url('shared/deep.list.json'), deepDoc);
    await issuedAll(net, [url('shared/react/deep.js')]);
    net.ok(url('shared/react/deep.js'), deepText);
    expect(await unitResolving).toMatch(/^blob:/);
    expect(noListWarnings(warn)).toEqual([]);
  });

  it('downloads two distinct lazy targets in parallel and mints their units one at a time', async () => {
    const aDoc = listDocument({ items: [item('shared/a.js', 'export const a=1;\n', ['pkg-a'])] });
    const bDoc = listDocument({ items: [item('shared/b.js', 'export const b=1;\n', ['pkg-b'])] });
    const doc = baseDoc({
      lazy: {
        'assets/a.js': ref('shared/a.list.json', aDoc),
        'assets/b.js': ref('shared/b.list.json', bDoc),
      },
    });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(net, doc, entrySource('./a.js', './b.js'));
    const [resolve] = registeredResolvers(register);
    const a = resolve!('./a.js');
    const b = resolve!('./b.js');
    // Both targets' requests are in flight at once, no response delivered.
    await issuedAll(net, [
      url('shared/a.list.json'),
      url('assets/a.js'),
      url('shared/b.list.json'),
      url('assets/b.js'),
    ]);
    net.ok(url('shared/b.list.json'), bDoc);
    net.ok(url('shared/a.list.json'), aDoc);
    await issuedAll(net, [url('shared/a.js'), url('shared/b.js')]);
    net.ok(url('assets/a.js'), 'export const A = 1;\n');
    net.ok(url('assets/b.js'), 'export const B = 1;\n');
    net.ok(url('shared/a.js'), 'export const a=1;\n');
    net.ok(url('shared/b.js'), 'export const b=1;\n');
    const [blobA, blobB] = await Promise.all([a, b]);
    expect(blobA).not.toBe(blobB);
    // Minting is one synchronous step per target: every minted module
    // exists exactly once, none is minted twice.
    const sources = await minted.sources();
    expect(sources.filter((s) => s === 'export const a=1;\n')).toHaveLength(1);
    expect(sources.filter((s) => s === 'export const b=1;\n')).toHaveLength(1);
  });

  it('issues each request once and mints each unit once for concurrent resolutions of one target', async () => {
    const lazyDoc = listDocument({ items: [item('shared/a.js', 'export const a=1;\n', ['pkg-a'])] });
    const doc = baseDoc({
      lazy: { 'assets/a.js': ref('shared/a.list.json', lazyDoc) },
    });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(net, doc, entrySource('./a.js'));
    const [resolve] = registeredResolvers(register);
    const first = resolve!('./a.js');
    const second = resolve!('./a.js');
    await issuedAll(net, [url('shared/a.list.json'), url('assets/a.js')]);
    net.ok(url('shared/a.list.json'), lazyDoc);
    await issuedAll(net, [url('shared/a.js')]);
    net.ok(url('shared/a.js'), 'export const a=1;\n');
    net.ok(url('assets/a.js'), 'export const A = 1;\n');
    expect(await first).toBe(await second);
    for (const u of ['shared/a.list.json', 'assets/a.js', 'shared/a.js']) {
      expect(net.count(url(u))).toBe(1);
    }
    const sources = await minted.sources();
    expect(sources.filter((s) => s === 'export const a=1;\n')).toHaveLength(1);
  });

  it('warns once per handler for an own lazy chunk with no list, naming chunk and entry, and loads it', async () => {
    const doc = baseDoc();
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await loadFetchListMfe(net, doc, entrySource('./nolist.js', './other.js'));
    const [resolve] = registeredResolvers(register);
    const before = net.issued.length;
    const resolving = resolve!('./nolist.js');
    await issuedAll(net, [url('assets/nolist.js')]);
    await settleTurn();
    // No fetch-list round: only the chunk itself is requested.
    expect(net.issued.slice(before)).toEqual([url('assets/nolist.js')]);
    net.ok(url('assets/nolist.js'), 'export const n = 1;\n');
    expect(await resolving).toMatch(/^blob:/);
    expect(noListWarnings(warn)).toHaveLength(1);
    const message = noListWarnings(warn)[0]!;
    expect(message).toContain('assets/nolist.js');
    expect(message).toContain(ENTRY_ID);
    // The same chunk again is answered from the load: still one warning.
    await resolve!('./nolist.js');
    expect(noListWarnings(warn)).toHaveLength(1);
  });

  it('fails a shared unit\'s lazy call with no list naming target and entry, minting and fetching nothing', async () => {
    const reactText = "export const r = 1;\nexport const load = () => import('./missing.js');\n";
    const doc = listDocument({
      items: [item(REACT_LOCATION, reactText, ['react'])],
    });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(net, doc, entrySource(), {
      items: [[url(REACT_LOCATION), reactText]],
    });
    const argument = lazyAbiArguments((await minted.sources()).join('\n'))[0]!;
    const [unit] = registeredResolvers(register);
    const issuedBefore = net.issued.length;
    const mintedBefore = (await minted.sources()).length;
    const error = await unit!(argument).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(MfeLoadError);
    const message = (error as Error).message;
    expect(message).toContain('shared/react/missing.js');
    expect(message).toContain(ENTRY_ID);
    expect(net.issued).toHaveLength(issuedBefore);
    expect((await minted.sources()).length).toBe(mintedBefore);
  });

  it('rewrites every literal and bounded-pattern import of a list item and leaves a fully opaque import native, bytes unchanged', async () => {
    const reactText =
      "export const a = () => import('./a.js');\n" +
      'export const p = (n) => import(`./locales/${n}.js`);\n' +
      'export const o = (x) => import(x);\n';
    const doc = listDocument({
      items: [item(REACT_LOCATION, reactText, ['react'])],
    });
    const net = controlledFetch();
    await loadFetchListMfe(net, doc, entrySource(), {
      items: [[url(REACT_LOCATION), reactText]],
    });
    const source = (await minted.sources()).find((s) => s.includes('./locales/'))!;
    expect(source).toContain('__frontx_lazy("rel:shared/react/index.abc.js\\n./a.js")');
    expect(source).toContain(
      '__frontx_lazy("rel:shared/react/index.abc.js\\n"+(`./locales/${n}.js`))',
    );
    expect(source).toContain('import(x)');
    expect(source).not.toContain("import('./a.js')");
    // The cached bytes are the fetched bytes.
    const cached = RealmSharedDepTextCacheProvider.getCache().get(
      SharedTextAdmission.chunkKey(sha256Hex(reactText)),
    );
    expect(await cached).toBe(reactText);
  });

  it('fails a lazily reached unit\'s import without blocking a later independent lazy import', async () => {
    const badDoc = listDocument({ items: [item('shared/bad.js', 'export const bad=1;\n', ['pkg-bad'])] });
    const doc = baseDoc({
      lazy: { 'assets/bad.js': ref('shared/bad.list.json', badDoc) },
    });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await loadFetchListMfe(net, doc, entrySource('./bad.js', './good.js'));
    const [resolve] = registeredResolvers(register);
    const bad = resolve!('./bad.js').then(
      () => undefined,
      (e: unknown) => e,
    );
    await issuedAll(net, [url('shared/bad.list.json'), url('assets/bad.js')]);
    net.ok(url('shared/bad.list.json'), badDoc);
    await issuedAll(net, [url('shared/bad.js')]);
    net.ok(url('assets/bad.js'), 'export const b = 1;\n');
    net.fail(url('shared/bad.js'));
    expect(await bad).toBeInstanceOf(MfeLoadError);
    const good = resolve!('./good.js');
    await issuedAll(net, [url('assets/good.js')]);
    net.ok(url('assets/good.js'), 'export const g = 1;\n');
    expect(await good).toMatch(/^blob:/);
  });
});

describe('acceptance: lazy targets on a whole-package load', () => {
  const REACT_URL = url('shared/react.js');
  const reactSource =
    'export const r = 1;\n' +
    "export const lazyUnit = () => import('./react-lazy.js');\n" +
    "export const packed = () => import('./chunks/pack.js');\n" +
    'export const pattern = (n) => import(`./locales/${n}.js`);\n';

  async function loadWholePackage(
    net: ControlledFetch,
    chunkPath = 'shared/react.js'
  ): Promise<void> {
    const manifest = buildManifest([
      sharedDep('react', { chunkPath, contentHash: sha256Hex(reactSource) }),
    ]);
    const loading = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
      buildEntry(manifest),
      nextExtensionId(),
    );
    await issuedAll(net, [REACT_URL]);
    net.ok(REACT_URL, reactSource);
    await issuedAll(net, [ENTRY_URL]);
    net.ok(ENTRY_URL, entrySource('./own-lazy.js'));
    await loading;
  }

  it('walks the chunk graph from a lazy target with at most six requests in flight, binding to the whole-package units, with no no-list warning or failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadWholePackage(net);
    const deps = Array.from({ length: 9 }, (_v, i) => `w${String(i)}`);
    const target =
      deps.map((d) => `import './${d}.js';\n`).join('') +
      'import { r } from "react";\nexport const t = r;\n';
    const resolvers = registeredResolvers(register);
    const own = resolvers.at(-1)!;
    const resolving = own('./own-lazy.js');
    await issuedAll(net, [url('assets/own-lazy.js')]);
    net.ok(url('assets/own-lazy.js'), target);
    await until(
      () => deps.filter((d) => net.issued.includes(url(`assets/${d}.js`))).length === 6,
      'six in flight',
    );
    await settleTurn();
    expect(deps.filter((d) => net.issued.includes(url(`assets/${d}.js`)))).toHaveLength(6);
    for (const d of deps.slice(0, 6)) net.ok(url(`assets/${d}.js`), OWN_TEXT);
    await issuedAll(net, deps.map((d) => url(`assets/${d}.js`)));
    for (const d of deps.slice(6)) net.ok(url(`assets/${d}.js`), OWN_TEXT);
    expect(await resolving).toMatch(/^blob:/);
    // Its bare specifier bound to the whole-package unit already minted.
    const targetSource = (await minted.sources()).find((s) => s.includes('export const t = r'))!;
    expect(targetSource).not.toMatch(/from\s*["']react["']/);
    expect(noListWarnings(warn)).toEqual([]);
  });

  it('resolves a call made by a whole-package entry by walking the graph from its target', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadWholePackage(net);
    const mintedSource = (await minted.sources()).find((source) =>
      source.includes('react-lazy.js'),
    )!;
    // The whole-package entry's literal import reaches the ABI.
    expect(mintedSource).not.toContain("import('./react-lazy.js')");
    const argument = lazyAbiArguments(mintedSource)[0]!;
    expect(argument).toBe(`rel:${REACT_URL}\n./react-lazy.js`);
    const [unit] = registeredResolvers(register);
    const resolving = unit!(argument);
    // The call resolves against the entry's chunkPath under the asset base.
    await issuedAll(net, [url('shared/react-lazy.js')]);
    net.ok(url('shared/react-lazy.js'), 'export const z = 1;\n');
    expect(await resolving).toMatch(/^blob:/);
    expect(noListWarnings(warn)).toEqual([]);
  });
});

/** The `__frontx_lazy` binding a compiled chunk of the load was given, as its tag prefix. */
const chunkTag = (sources: string[], marker: string): string => {
  const source = sources.find((s) => s.includes(marker));
  if (source === undefined) throw new Error(`no minted source carries ${marker}`);
  const match = /const __frontx_lazy=\(p\)=>\w+\(("(?:[^"\\]|\\.)*")\+p\)/.exec(source);
  if (match === null) throw new Error('no caller-tagged binding in the minted source');
  return JSON.parse(match[1]!) as string;
};

describe('acceptance: the calling chunk\'s base and the load\'s retained state', () => {
  it('resolves an own chunk\'s lazy call against that chunk\'s directory, not the entry\'s', async () => {
    const lazyDoc = listDocument({});
    const innerText = "export const inner = () => __frontx_lazy('./deep.js');\n";
    const doc = baseDoc({
      ownChunks: ['assets/sub/inner.js'],
      lazy: { 'assets/sub/deep.js': ref('shared/deep.list.json', lazyDoc) },
    });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(
      net,
      doc,
      'import "./sub/inner.js";\n' + entrySource(),
      { ownChunks: [[url('assets/sub/inner.js'), innerText]] },
    );
    const tag = chunkTag(await minted.sources(), 'inner = ()');
    expect(tag).toBe('rel:assets/sub/inner.js\n');
    const [resolve] = registeredResolvers(register);
    const resolving = resolve!(`${tag}./deep.js`);
    // The list is found under the chunk-relative key and the chunk itself
    // is requested beside its caller.
    await issuedAll(net, [url('shared/deep.list.json'), url('assets/sub/deep.js')]);
    net.ok(url('shared/deep.list.json'), lazyDoc);
    net.ok(url('assets/sub/deep.js'), 'export const d = 1;\n');
    expect(await resolving).toMatch(/^blob:/);
  });

  it('requests an own chunk two lazy deltas share once and keeps no request for it afterwards', async () => {
    const sharedOwn = url('assets/shared-own.js');
    const deltaFor = (name: string): string =>
      listDocument({ ownChunks: ['assets/shared-own.js'], items: [] }).replace(
        '"ownChunks"',
        `"note":"${name}","ownChunks"`,
      );
    const aDoc = deltaFor('a');
    const bDoc = deltaFor('b');
    const cDoc = deltaFor('c');
    const doc = baseDoc({
      lazy: {
        'assets/a.js': ref('shared/a.list.json', aDoc),
        'assets/b.js': ref('shared/b.list.json', bDoc),
        'assets/c.js': ref('shared/c.list.json', cDoc),
      },
    });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(net, doc, entrySource('./a.js', './b.js', './c.js'));
    const [resolve] = registeredResolvers(register);
    const a = resolve!('./a.js');
    const b = resolve!('./b.js');
    await issuedAll(net, [url('shared/a.list.json'), url('shared/b.list.json')]);
    net.ok(url('shared/a.list.json'), aDoc);
    net.ok(url('shared/b.list.json'), bDoc);
    await issuedAll(net, [sharedOwn]);
    const importer = 'import "./shared-own.js";\nexport const x = 1;\n';
    net.ok(sharedOwn, OWN_TEXT);
    net.ok(url('assets/a.js'), importer);
    net.ok(url('assets/b.js'), importer);
    await Promise.all([a, b]);
    // A later delta naming the minted chunk requests nothing for it.
    const c = resolve!('./c.js');
    await issuedAll(net, [url('shared/c.list.json')]);
    net.ok(url('shared/c.list.json'), cDoc);
    net.ok(url('assets/c.js'), importer);
    await c;
    expect(net.count(sharedOwn)).toBe(1);
  });

  it('mints each target\'s items contiguously: no mint of one batch waits on another', async () => {
    const mk = (tag: string): { text: string; it: ListItem }[] =>
      [1, 2].map((n) => {
        const text = `export const ${tag}${String(n)} = ${String(n)};\n`;
        return { text, it: item(`shared/${tag}${String(n)}.js`, text, [`pkg-${tag}${String(n)}`]) };
      });
    const aItems = mk('a');
    const bItems = mk('b');
    const aDoc = listDocument({ items: aItems.map((i) => i.it) });
    const bDoc = listDocument({ items: bItems.map((i) => i.it) });
    const doc = baseDoc({
      lazy: {
        'assets/a.js': ref('shared/a.list.json', aDoc),
        'assets/b.js': ref('shared/b.list.json', bDoc),
      },
    });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(net, doc, entrySource('./a.js', './b.js'));
    const [resolve] = registeredResolvers(register);
    const targets = [resolve!('./a.js'), resolve!('./b.js')];
    await issuedAll(net, [url('shared/a.list.json'), url('shared/b.list.json')]);
    net.ok(url('shared/a.list.json'), aDoc);
    net.ok(url('shared/b.list.json'), bDoc);
    const all = [...aItems, ...bItems];
    await issuedAll(net, all.map((i) => url(i.it.location)));
    net.ok(url('assets/a.js'), 'export const A = 1;\n');
    net.ok(url('assets/b.js'), 'export const B = 1;\n');
    for (const i of all) net.ok(url(i.it.location), i.text);
    await Promise.all(targets);
    const sources = await minted.sources();
    const positions = (items: { text: string }[]): number[] =>
      items.map((i) => sources.indexOf(i.text));
    for (const group of [positions(aItems), positions(bItems)]) {
      expect(Math.max(...group) - Math.min(...group)).toBe(group.length - 1);
    }
  });

  it('resolves a shared unit\'s pattern call through the patterns record', async () => {
    const enText = 'export const en = 1;\n';
    const enDoc = listDocument({ items: [item('shared/react/locales/en.js', enText)] });
    const reactText =
      'export const load = (n) => import(`./locales/${n}.js`);\n';
    const doc = listDocument({
      items: [item(REACT_LOCATION, reactText, ['react'])],
      patterns: {
        'shared/react/locales/en.js': ref('shared/en.list.json', enDoc),
      },
    });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(net, doc, entrySource(), {
      items: [[url(REACT_LOCATION), reactText]],
    });
    const prefix = lazyAbiArguments((await minted.sources()).join('\n'))[0]!;
    expect(prefix).toBe('rel:shared/react/index.abc.js\n');
    const [unit] = registeredResolvers(register);
    // The runtime-computed path the rewritten call passes.
    const resolving = unit!(`${prefix}./locales/en.js`);
    await issuedAll(net, [url('shared/en.list.json')]);
    net.ok(url('shared/en.list.json'), enDoc);
    await issuedAll(net, [url('shared/react/locales/en.js')]);
    net.ok(url('shared/react/locales/en.js'), enText);
    expect(await resolving).toMatch(/^blob:/);
  });

  it('adds nothing to the per-load map for a failed unit and lets the same target retry', async () => {
    const badText = 'export const bad = 1;\n';
    const badDoc = listDocument({ items: [item('shared/bad.js', badText, ['pkg-bad'])] });
    const doc = baseDoc({
      lazy: { 'assets/bad.js': ref('shared/bad.list.json', badDoc) },
    });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(net, doc, entrySource('./bad.js'));
    const [resolve] = registeredResolvers(register);
    const first = resolve!('./bad.js').then(
      () => undefined,
      (e: unknown) => e,
    );
    await issuedAll(net, [url('shared/bad.list.json'), url('assets/bad.js')]);
    net.ok(url('shared/bad.list.json'), badDoc);
    await issuedAll(net, [url('shared/bad.js')]);
    net.ok(url('assets/bad.js'), 'export const b = 1;\n');
    net.fail(url('shared/bad.js'));
    expect(await first).toBeInstanceOf(MfeLoadError);
    // The failed unit was not minted into the load.
    expect((await minted.sources()).some((s) => s === badText)).toBe(false);
    // The same target, asked again, requests the failed unit afresh.
    const retry = resolve!('./bad.js');
    await until(() => net.count(url('shared/bad.js')) === 2, 'the unit re-requested');
    net.ok(url('shared/bad.js'), badText);
    expect(await retry).toMatch(/^blob:/);
    expect((await minted.sources()).filter((s) => s === badText)).toHaveLength(1);
  });
});

describe('acceptance: whole-package walks stay inside the load\'s graph', () => {
  const reactSource =
    "export const packed = () => import('./chunks/pack.js');\n" +
    'export const pattern = (n) => import(`./locales/${n}.js`);\n';
  const REACT_URL = url('shared/react.js');

  async function loadWith(net: ControlledFetch, chunkPath: string): Promise<void> {
    const manifest = buildManifest([
      sharedDep('react', { chunkPath, contentHash: sha256Hex(reactSource) }),
    ]);
    const loading = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
      buildEntry(manifest),
      nextExtensionId(),
    );
    await issuedAll(net, [REACT_URL]);
    net.ok(REACT_URL, reactSource);
    await issuedAll(net, [ENTRY_URL]);
    net.ok(ENTRY_URL, entrySource());
    await loading;
  }

  it('rewrites a nested literal import of a chunk the walk reaches, resolving it against that chunk', async () => {
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadWith(net, 'shared/react.js');
    const [unit] = registeredResolvers(register);
    const resolving = unit!(`rel:${REACT_URL}\n./chunks/pack.js`);
    await issuedAll(net, [url('shared/chunks/pack.js')]);
    net.ok(
      url('shared/chunks/pack.js'),
      "export const nested = () => import('./nested.js');\n",
    );
    expect(await resolving).toMatch(/^blob:/);
    const sources = await minted.sources();
    const pack = sources.find((s) => s.includes('nested = ()'))!;
    expect(pack).not.toContain("import('./nested.js')");
    expect(pack).toContain('__frontx_lazy("./nested.js")');
    const tag = chunkTag(sources, 'nested = ()');
    expect(tag).toBe('rel:shared/chunks/pack.js\n');
    // The nested call resolves against the pack chunk's directory.
    const chain = registeredResolvers(register)[1]!;
    const nested = chain(`${tag}./nested.js`);
    await issuedAll(net, [url('shared/chunks/nested.js')]);
    net.ok(url('shared/chunks/nested.js'), 'export const n = 1;\n');
    expect(await nested).toMatch(/^blob:/);
  });

  it('rewrites a bounded pattern import of a whole-package entry', async () => {
    const net = controlledFetch();
    await loadWith(net, 'shared/react.js');
    const entry = (await minted.sources()).find((s) => s.includes('locales/'))!;
    expect(entry).toContain(`__frontx_lazy("rel:${REACT_URL}\\n"+(\`./locales/\${n}.js\`))`);
  });

  it('resolves a whole-package entry\'s calls against the URL its leading-slash chunkPath names', async () => {
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadWith(net, '/shared/react.js');
    const [unit] = registeredResolvers(register);
    // The first call the entry's mint rewrote: `import('./chunks/pack.js')`.
    const argument = lazyAbiArguments((await minted.sources()).join('\n'))[0]!;
    expect(argument).toBe(`rel:${REACT_URL}\n./chunks/pack.js`);
    const resolving = unit!(argument);
    await issuedAll(net, [url('shared/chunks/pack.js')]);
    net.ok(url('shared/chunks/pack.js'), 'export const p = 1;\n');
    expect(await resolving).toMatch(/^blob:/);
  });
});
