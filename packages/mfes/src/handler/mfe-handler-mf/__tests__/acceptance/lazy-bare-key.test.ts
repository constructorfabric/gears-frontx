/**
 * Acceptance: a bare `__frontx_lazy` argument naming a shared package
 * resolves through the lazy list held under that bare specifier, for a call
 * made by a shared unit and by the microfrontend's own code alike
 * (`cpt-frontx-algo-mfe-loading-lazy-import-abi`, `inst-lai-find-target-list`,
 * `inst-lai-resolve-bare-specifier`).
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
import { LazyLoaderRegistry } from '../../../../lazy-loader/LazyLoaderRegistry';
import { MfeLoadError } from '../../../../errors';
import type { SharedDepUnit } from '../../../../unit-format/fetch-list';
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
  listOf,
  PUBLIC_PATH,
  sharedDep,
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

const url = (relative: string): string => `${PUBLIC_PATH}${relative}`;
const ENTRY_URL = url('assets/lifecycle.js');
const KIT_TEXT = 'export const k = 1;\n';
const KIT: SharedDepUnit = unitOf('shared/kit/index.def.js', KIT_TEXT, ['kit']);
const REACT_TEXT =
  "export const r = 1;\nexport const load = () => import('kit');\n";
const REACT: SharedDepUnit = unitOf('shared/react/index.abc.js', REACT_TEXT, ['react']);

let loads = 0;

/**
 * Load a fetch-list MFE whose exposed module's list names `lists` as lazy
 * targets, with `entry` as its entry module; returns the load's resolvers.
 */
async function load(
  net: ControlledFetch,
  lazy: Record<string, ReturnType<typeof listOf>>,
  entry: string,
): Promise<Array<(argument: string) => Promise<string>>> {
  const register = vi.spyOn(LazyLoaderRegistry.prototype, 'register');
  const manifest = buildManifest([sharedDep('react')], {
    units: [REACT, KIT],
    lists: { './lifecycle': listOf([REACT], { lazy }) },
  });
  const loading = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
    buildEntry(manifest),
    `ext-lazy-bare-${String(++loads)}`,
  );
  await issuedAll(net, [ENTRY_URL, url(REACT.location)]);
  net.ok(url(REACT.location), REACT_TEXT);
  net.ok(ENTRY_URL, entry);
  await loading;
  return register.mock.calls.map((call) => call[0]);
}

const entry = (target: string): string =>
  'import { r } from "react";\n' +
  `export const l = () => __frontx_lazy('${target}');\n` +
  'export default { mount() { return r; }, unmount() {} };\n';

describe('acceptance: bare lazy argument resolves through the list under the specifier', () => {
  it('resolves a shared unit\'s bare call in one round with no own chunk, the unit never minted before', async () => {
    const net = controlledFetch();
    const resolvers = await load(net, { kit: listOf([KIT]) }, entry('./other.js'));
    const argument = 'rel:shared/react/index.abc.js\nkit';
    const before = net.issued.length;
    const resolving = resolvers[0]!(argument);
    await issuedAll(net, [url(KIT.location)]);
    await settleTurn();
    expect(net.issued.slice(before)).toEqual([url(KIT.location)]);
    net.ok(url(KIT.location), KIT_TEXT);
    expect(await resolving).toMatch(/^blob:/);
    expect(net.issued.slice(before)).toEqual([url(KIT.location)]);
  });

  it('resolves the microfrontend\'s own bare call through the list, requesting no own chunk', async () => {
    const net = controlledFetch();
    const resolvers = await load(net, { kit: listOf([KIT]) }, entry('kit'));
    const before = net.issued.length;
    const resolving = resolvers.at(-1)!('kit');
    await issuedAll(net, [url(KIT.location)]);
    await settleTurn();
    expect(net.issued.slice(before)).toEqual([url(KIT.location)]);
    net.ok(url(KIT.location), KIT_TEXT);
    expect(await resolving).toMatch(/^blob:/);
    expect(net.count(url('kit'))).toBe(0);
    expect(net.count(url('assets/kit'))).toBe(0);
  });

  it('keeps a relative key\'s behaviour: the own chunk is requested against the asset base', async () => {
    const net = controlledFetch();
    const resolvers = await load(net, { 'assets/lazy.js': listOf([]) }, entry('./lazy.js'));
    const before = net.issued.length;
    const resolving = resolvers.at(-1)!('./lazy.js');
    await issuedAll(net, [url('assets/lazy.js')]);
    await settleTurn();
    expect(net.issued.slice(before)).toEqual([url('assets/lazy.js')]);
    net.ok(url('assets/lazy.js'), 'export const z = 1;\n');
    expect(await resolving).toMatch(/^blob:/);
  });

  it('fails a shared unit\'s bare call with no list and no minted unit, naming the target', async () => {
    const net = controlledFetch();
    const resolvers = await load(net, {}, entry('./other.js'));
    const before = net.issued.length;
    const error = await resolvers[0]!('rel:shared/react/index.abc.js\nkit').then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(MfeLoadError);
    expect((error as Error).message).toContain('kit');
    expect(net.issued).toHaveLength(before);
  });

  it('treats the microfrontend\'s own bare call with no list as an own chunk, warning once', async () => {
    const net = controlledFetch();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const resolvers = await load(net, {}, entry('kit'));
    const before = net.issued.length;
    const resolving = resolvers.at(-1)!('kit');
    await issuedAll(net, [url('assets/kit')]);
    await settleTurn();
    expect(net.issued.slice(before)).toEqual([url('assets/kit')]);
    net.ok(url('assets/kit'), 'export const o = 1;\n');
    expect(await resolving).toMatch(/^blob:/);
    expect(
      warn.mock.calls.filter((c) => String(c[0]).includes('lazy-target fetch list')),
    ).toHaveLength(1);
  });

  it('shares one fetch batch between two concurrent bare calls for the same key', async () => {
    const net = controlledFetch();
    const resolvers = await load(net, { kit: listOf([KIT]) }, entry('kit'));
    const before = net.issued.length;
    const first = resolvers.at(-1)!('kit');
    const second = resolvers.at(-1)!('kit');
    await issuedAll(net, [url(KIT.location)]);
    await settleTurn();
    expect(net.issued.slice(before)).toEqual([url(KIT.location)]);
    net.ok(url(KIT.location), KIT_TEXT);
    const [a, b] = await Promise.all([first, second]);
    expect(a).toMatch(/^blob:/);
    expect(b).toBe(a);
    expect(net.count(url(KIT.location))).toBe(1);
  });

  it('fails a bare call whose listed unit fails to fetch with an MfeLoadError, without hanging, and retries cleanly later', async () => {
    const net = controlledFetch();
    const resolvers = await load(net, { kit: listOf([KIT]) }, entry('kit'));
    const resolve = resolvers.at(-1)!;
    const before = net.issued.length;
    const failing = resolve('kit').then(
      () => undefined,
      (e: unknown) => e,
    );
    await issuedAll(net, [url(KIT.location)]);
    net.fail(url(KIT.location));
    const error = await failing;
    expect(error).toBeInstanceOf(MfeLoadError);
    expect((error as Error).message).toContain(url(KIT.location));
    expect((error as Error).message).toContain('HTTP 404');
    expect(net.issued.slice(before)).toEqual([url(KIT.location)]);

    const retrying = resolve('kit');
    await until(() => net.count(url(KIT.location)) === 2, 'the retry request');
    net.ok(url(KIT.location), KIT_TEXT);
    expect(await retrying).toMatch(/^blob:/);
  });
});
