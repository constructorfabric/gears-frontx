/**
 * Acceptance: the lazy-import ABI on a fetch-list load and on a
 * whole-package load (`cpt-frontx-algo-mfe-loading-lazy-import-abi`,
 * `cpt-frontx-dod-mfe-loading-lazy-abi-isolation`): a lazy target's own
 * chunk, its list's missing units and its list's own chunks go out in one
 * round ahead of any mint, distinct targets download in parallel, every
 * literal and bounded-pattern import of a shared unit reaches the ABI, and
 * a target without a list follows the no-list rule.
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
import type { SharedDepUnit } from '../../../../unit-format/fetch-list';
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
  ENTRY_ID,
  listOf,
  type NestedList,
  PUBLIC_PATH,
  sharedDep,
  sha256Hex,
  unitOf,
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
const OWN_TEXT = 'export const o = 2;\n';

const unit = (
  location: string,
  text: string,
  answers: string[] = [],
): SharedDepUnit => unitOf(location, text, answers);

const REACT = unit(REACT_LOCATION, REACT_TEXT, ['react']);

const entrySource = (...lazyTargets: string[]): string =>
  'import { r } from "react";\n' +
  lazyTargets.map((t) => `export const l_${t.replace(/\W/g, '_')} = () => __frontx_lazy('${t}');\n`).join('') +
  'export default { mount() { return r; }, unmount() {} };\n';

/** The exposed module's list: the react unit plus `extra`. */
const baseList = (extra: Partial<NestedList> = {}): NestedList =>
  listOf([REACT], extra);

function manifestFor(
  units: SharedDepUnit[],
  list: NestedList,
  metaData: Partial<MfManifest['metaData']> = {},
): MfManifest {
  return buildManifest([sharedDep('react')], {
    metaData,
    units,
    lists: { './lifecycle': list },
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
 * Load a fetch-list MFE whose manifest holds `units` and whose expose list
 * is `list`, with entry module `entry`, answering the one round's requests.
 */
async function loadFetchListMfe(
  net: ControlledFetch,
  units: SharedDepUnit[],
  list: NestedList,
  entry: string,
  options: {
    metaData?: Partial<MfManifest['metaData']>;
    items?: Array<[string, string]>;
    ownChunks?: Array<[string, string]>;
  } = {},
): Promise<void> {
  const loading = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
    buildEntry(manifestFor(units, list, options.metaData)),
    nextExtensionId(),
  );
  const items = options.items ?? [[url(REACT_LOCATION), REACT_TEXT]];
  const ownChunks = options.ownChunks ?? [];
  // One round: the entry, the units and the own chunks are all out.
  await issuedAll(net, [ENTRY_URL, ...items.map(([u]) => u), ...ownChunks.map(([u]) => u)]);
  for (const [u, text] of items) net.ok(u, text);
  for (const [u, text] of ownChunks) net.ok(u, text);
  net.ok(ENTRY_URL, entry);
  await loading;
}

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
  it('requests the target\'s own chunk in one round, with no list document', async () => {
    const list = baseList({ lazy: { 'assets/lazy.js': listOf([]) } });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(net, [REACT], list, entrySource('./lazy.js'));
    const [resolve] = registeredResolvers(register);
    const before = net.issued.length;
    const resolving = resolve!('./lazy.js');
    await issuedAll(net, [url('assets/lazy.js')]);
    await settleTurn();
    expect(net.issued.slice(before)).toEqual([url('assets/lazy.js')]);
    net.ok(url('assets/lazy.js'), 'export const z = 1;\n');
    expect(await resolving).toMatch(/^blob:/);
    expect(net.count(url('assets/lazy.js'))).toBe(1);
  });

  it('requests a shared-unit target\'s unit in the one round, with no own chunk and no list document', async () => {
    const lazyText = 'export const s = 1;\n';
    const lazyUnit = unit('shared/react/lazyshared.js', lazyText);
    const reactText = "export const r = 1;\nexport const load = () => import('./lazyshared.js');\n";
    const reactUnit = unit(REACT_LOCATION, reactText, ['react']);
    const list = listOf([reactUnit], {
      lazy: { 'shared/react/lazyshared.js': listOf([lazyUnit]) },
    });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(net, [reactUnit, lazyUnit], list, entrySource(), {
      items: [[url(REACT_LOCATION), reactText]],
    });
    const argument = lazyAbiArguments((await minted.sources()).join('\n'))[0]!;
    const [unitResolver] = registeredResolvers(register);
    const before = net.issued.length;
    const resolving = unitResolver!(argument);
    await issuedAll(net, [url('shared/react/lazyshared.js')]);
    await settleTurn();
    // Only the unit: no own chunk is requested for a shared unit.
    expect(net.issued.slice(before)).toEqual([url('shared/react/lazyshared.js')]);
    net.ok(url('shared/react/lazyshared.js'), lazyText);
    expect(await resolving).toMatch(/^blob:/);
  });

  it('requests the own chunk, every missing shared unit and every ownChunks entry in one unbounded round before any mint', async () => {
    const texts = Array.from({ length: 8 }, (_v, i) => `export const u${String(i)} = ${String(i)};\n`);
    const units = texts.map((t, i) => unit(`shared/u${String(i)}.js`, t, [`pkg-u${String(i)}`]));
    const own = ['assets/d0.js', 'assets/d1.js', 'assets/d2.js'];
    const list = baseList({
      lazy: { 'assets/lazy.js': listOf(units, { ownChunks: own }) },
    });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(net, [REACT, ...units], list, entrySource('./lazy.js'));
    const [resolve] = registeredResolvers(register);
    const resolving = resolve!('./lazy.js');
    const round = [url('assets/lazy.js'), ...units.map((i) => url(i.location)), ...own.map(url)];
    await issuedAll(net, round);
    // The whole round is in flight together, none answered, nothing minted.
    expect(round.length).toBeGreaterThan(6);
    const mintedBefore = (await minted.sources()).length;
    units.forEach((i, n) => net.ok(url(i.location), texts[n]!));
    own.forEach((o) => net.ok(url(o), OWN_TEXT));
    expect((await minted.sources()).length).toBe(mintedBefore);
    net.ok(url('assets/lazy.js'), 'export const z = 1;\n');
    expect(await resolving).toMatch(/^blob:/);
  });

  it('finds an own lazy chunk\'s list under its publicPath-relative location and a shared unit\'s under its sharedBase-relative location', async () => {
    const sharedText = "export const s = 1;\nexport const go = () => import('./deep.js');\n";
    const deepText = 'export const deep = 1;\n';
    const sharedUnit = unit('react/index.abc.js', sharedText, ['react']);
    const deepUnit = unit('react/deep.js', deepText);
    const list = listOf([sharedUnit], {
      lazy: {
        // Own chunk: relative to publicPath. Shared unit: relative to sharedBase.
        'assets/lazy.js': listOf([]),
        'react/deep.js': listOf([deepUnit]),
      },
    });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await loadFetchListMfe(net, [sharedUnit, deepUnit], list, entrySource('./lazy.js'), {
      metaData: { sharedBase: './shared/' },
      items: [[url('shared/react/index.abc.js'), sharedText]],
    });
    const resolvers = registeredResolvers(register);
    const unitArgument = lazyAbiArguments((await minted.sources()).join('\n')).find((a) => a.includes('./deep.js'))!;
    const own = resolvers.at(-1)!;
    const unitResolver = resolvers[0]!;
    const ownResolving = own('./lazy.js');
    await issuedAll(net, [url('assets/lazy.js')]);
    net.ok(url('assets/lazy.js'), 'export const z = 1;\n');
    await ownResolving;
    const unitResolving = unitResolver(unitArgument);
    await issuedAll(net, [url('shared/react/deep.js')]);
    net.ok(url('shared/react/deep.js'), deepText);
    expect(await unitResolving).toMatch(/^blob:/);
    expect(noListWarnings(warn)).toEqual([]);
  });

  it('downloads two distinct lazy targets in parallel and mints their units one at a time', async () => {
    const aUnit = unit('shared/a.js', 'export const a=1;\n', ['pkg-a']);
    const bUnit = unit('shared/b.js', 'export const b=1;\n', ['pkg-b']);
    const list = baseList({
      lazy: {
        'assets/a.js': listOf([aUnit]),
        'assets/b.js': listOf([bUnit]),
      },
    });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(net, [REACT, aUnit, bUnit], list, entrySource('./a.js', './b.js'));
    const [resolve] = registeredResolvers(register);
    const a = resolve!('./a.js');
    const b = resolve!('./b.js');
    // Both targets' requests are in flight at once, no response delivered.
    await issuedAll(net, [
      url('assets/a.js'),
      url('shared/a.js'),
      url('assets/b.js'),
      url('shared/b.js'),
    ]);
    net.ok(url('assets/a.js'), 'export const A = 1;\n');
    net.ok(url('assets/b.js'), 'export const B = 1;\n');
    net.ok(url('shared/b.js'), 'export const b=1;\n');
    net.ok(url('shared/a.js'), 'export const a=1;\n');
    const [blobA, blobB] = await Promise.all([a, b]);
    expect(blobA).not.toBe(blobB);
    // Minting is one synchronous step per target: every minted module
    // exists exactly once, none is minted twice.
    const sources = await minted.sources();
    expect(sources.filter((s) => s === 'export const a=1;\n')).toHaveLength(1);
    expect(sources.filter((s) => s === 'export const b=1;\n')).toHaveLength(1);
  });

  it('issues each request once and mints each unit once for concurrent resolutions of one target', async () => {
    const aUnit = unit('shared/a.js', 'export const a=1;\n', ['pkg-a']);
    const list = baseList({ lazy: { 'assets/a.js': listOf([aUnit]) } });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(net, [REACT, aUnit], list, entrySource('./a.js'));
    const [resolve] = registeredResolvers(register);
    const first = resolve!('./a.js');
    const second = resolve!('./a.js');
    await issuedAll(net, [url('shared/a.js'), url('assets/a.js')]);
    net.ok(url('shared/a.js'), 'export const a=1;\n');
    net.ok(url('assets/a.js'), 'export const A = 1;\n');
    expect(await first).toBe(await second);
    for (const u of ['assets/a.js', 'shared/a.js']) {
      expect(net.count(url(u))).toBe(1);
    }
    const sources = await minted.sources();
    expect(sources.filter((s) => s === 'export const a=1;\n')).toHaveLength(1);
  });

  it('warns once per handler for an own lazy chunk with no list, naming chunk and entry, and loads it', async () => {
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await loadFetchListMfe(net, [REACT], baseList(), entrySource('./nolist.js', './other.js'));
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
    const reactUnit = unit(REACT_LOCATION, reactText, ['react']);
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(net, [reactUnit], listOf([reactUnit]), entrySource(), {
      items: [[url(REACT_LOCATION), reactText]],
    });
    const argument = lazyAbiArguments((await minted.sources()).join('\n'))[0]!;
    const [unitResolver] = registeredResolvers(register);
    const issuedBefore = net.issued.length;
    const mintedBefore = (await minted.sources()).length;
    const error = await unitResolver!(argument).then(
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

  it('rewrites every literal and bounded-pattern import of a list unit and leaves a fully opaque import native, bytes unchanged', async () => {
    const reactText =
      "export const a = () => import('./a.js');\n" +
      'export const p = (n) => import(`./locales/${n}.js`);\n' +
      'export const o = (x) => import(x);\n';
    const reactUnit = unit(REACT_LOCATION, reactText, ['react']);
    const net = controlledFetch();
    await loadFetchListMfe(net, [reactUnit], listOf([reactUnit]), entrySource(), {
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
    const badUnit = unit('shared/bad.js', 'export const bad=1;\n', ['pkg-bad']);
    const list = baseList({ lazy: { 'assets/bad.js': listOf([badUnit]) } });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await loadFetchListMfe(net, [REACT, badUnit], list, entrySource('./bad.js', './good.js'));
    const [resolve] = registeredResolvers(register);
    const bad = resolve!('./bad.js').then(
      () => undefined,
      (e: unknown) => e,
    );
    await issuedAll(net, [url('assets/bad.js'), url('shared/bad.js')]);
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
    const innerText = "export const inner = () => __frontx_lazy('./deep.js');\n";
    const list = baseList({
      ownChunks: ['assets/sub/inner.js'],
      lazy: { 'assets/sub/deep.js': listOf([]) },
    });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(
      net,
      [REACT],
      list,
      'import "./sub/inner.js";\n' + entrySource(),
      { ownChunks: [[url('assets/sub/inner.js'), innerText]] },
    );
    const tag = chunkTag(await minted.sources(), 'inner = ()');
    expect(tag).toBe('rel:assets/sub/inner.js\n');
    const [resolve] = registeredResolvers(register);
    const resolving = resolve!(`${tag}./deep.js`);
    // The list is found under the chunk-relative key and the chunk itself
    // is requested beside its caller.
    await issuedAll(net, [url('assets/sub/deep.js')]);
    net.ok(url('assets/sub/deep.js'), 'export const d = 1;\n');
    expect(await resolving).toMatch(/^blob:/);
  });

  it('requests an own chunk two lazy lists share once and keeps no request for it afterwards', async () => {
    const sharedOwn = url('assets/shared-own.js');
    const withOwn = (): NestedList =>
      listOf([], { ownChunks: ['assets/shared-own.js'] });
    const list = baseList({
      lazy: {
        'assets/a.js': withOwn(),
        'assets/b.js': withOwn(),
        'assets/c.js': withOwn(),
      },
    });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(net, [REACT], list, entrySource('./a.js', './b.js', './c.js'));
    const [resolve] = registeredResolvers(register);
    const a = resolve!('./a.js');
    const b = resolve!('./b.js');
    await issuedAll(net, [url('assets/a.js'), url('assets/b.js'), sharedOwn]);
    const importer = 'import "./shared-own.js";\nexport const x = 1;\n';
    net.ok(sharedOwn, OWN_TEXT);
    net.ok(url('assets/a.js'), importer);
    net.ok(url('assets/b.js'), importer);
    await Promise.all([a, b]);
    // A later list naming the minted chunk requests nothing for it.
    const c = resolve!('./c.js');
    await issuedAll(net, [url('assets/c.js')]);
    net.ok(url('assets/c.js'), importer);
    await c;
    expect(net.count(sharedOwn)).toBe(1);
  });

  it('mints each target\'s units contiguously: no mint of one batch waits on another', async () => {
    const mk = (tag: string): { text: string; it: SharedDepUnit }[] =>
      [1, 2].map((n) => {
        const text = `export const ${tag}${String(n)} = ${String(n)};\n`;
        return { text, it: unit(`shared/${tag}${String(n)}.js`, text, [`pkg-${tag}${String(n)}`]) };
      });
    const aItems = mk('a');
    const bItems = mk('b');
    const list = baseList({
      lazy: {
        'assets/a.js': listOf(aItems.map((i) => i.it)),
        'assets/b.js': listOf(bItems.map((i) => i.it)),
      },
    });
    const all = [...aItems, ...bItems];
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(
      net,
      [REACT, ...all.map((i) => i.it)],
      list,
      entrySource('./a.js', './b.js'),
    );
    const [resolve] = registeredResolvers(register);
    const targets = [resolve!('./a.js'), resolve!('./b.js')];
    await issuedAll(net, [
      url('assets/a.js'),
      url('assets/b.js'),
      ...all.map((i) => url(i.it.location)),
    ]);
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
    const enUnit = unit('shared/react/locales/en.js', enText);
    const reactText =
      'export const load = (n) => import(`./locales/${n}.js`);\n';
    const reactUnit = unit(REACT_LOCATION, reactText, ['react']);
    const list = listOf([reactUnit], {
      patterns: { 'shared/react/locales/en.js': listOf([enUnit]) },
    });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(net, [reactUnit, enUnit], list, entrySource(), {
      items: [[url(REACT_LOCATION), reactText]],
    });
    const prefix = lazyAbiArguments((await minted.sources()).join('\n'))[0]!;
    expect(prefix).toBe('rel:shared/react/index.abc.js\n');
    const [unitResolver] = registeredResolvers(register);
    // The runtime-computed path the rewritten call passes.
    const resolving = unitResolver!(`${prefix}./locales/en.js`);
    await issuedAll(net, [url('shared/react/locales/en.js')]);
    net.ok(url('shared/react/locales/en.js'), enText);
    expect(await resolving).toMatch(/^blob:/);
  });

  it('adds nothing to the per-load map for a failed unit and lets the same target retry', async () => {
    const badText = 'export const bad = 1;\n';
    const badUnit = unit('shared/bad.js', badText, ['pkg-bad']);
    const list = baseList({ lazy: { 'assets/bad.js': listOf([badUnit]) } });
    const net = controlledFetch();
    const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
    await loadFetchListMfe(net, [REACT, badUnit], list, entrySource('./bad.js'));
    const [resolve] = registeredResolvers(register);
    const first = resolve!('./bad.js').then(
      () => undefined,
      (e: unknown) => e,
    );
    await issuedAll(net, [url('assets/bad.js'), url('shared/bad.js')]);
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
