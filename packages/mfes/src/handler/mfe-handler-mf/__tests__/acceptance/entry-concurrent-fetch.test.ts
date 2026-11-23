/**
 * Acceptance: for a fetch-list load, the entry module's source (high
 * priority) and the list's missing units are requested together in one
 * round straight from the manifest-held list, before any response; a
 * failure of either request fails the load with the request's own error,
 * discards the other outcome and issues no further request for the load,
 * the entry text is downloaded once per load and is never requested again
 * while resident, and the entry is minted and evaluated only after the
 * shared units it reaches (`inst-md-fetch-entry-concurrent`,
 * `inst-md-concurrent-failure`).
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

import { SOURCE_TEXT_CACHE_CAPACITY } from '../../MfeHandlerMF';
import { newHandler } from '../helpers/registered-manifest';
import { DynamicModuleOps } from '../../mf-dynamic-module-ops';
import { RealmSharedDepTextCacheProvider } from '../../RealmSharedDepTextCacheProvider';
import { SharedDepListLoader } from '../../SharedDepListLoader';
import { MfeLoadError } from '../../../../errors';
import type { MfManifest } from '../../../../manifest/mf-manifest';
import type { MfeEntryMF } from '../../../../types/mfe-entry-mf';
import type { SharedDepUnit } from '../../../../unit-format/fetch-list';
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
  ENTRY_ID,
  PUBLIC_PATH,
  sharedDep,
  listOf,
  sha256Hex,
  unitOf,
} from '../helpers/manifest-builder';
import { jsResponse } from '../helpers/fetch-router';
import { stubSuccessfulImport } from '../helpers/blob-module-stub';
import { captureMintedSources } from '../helpers/minted-sources';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';

beforeEach(() => {
  resetRealmSharedDepTextCache();
  stubSuccessfulImport(blobModuleStub);
});
afterEach(() => {
  vi.useRealTimers();
  resetRealmSharedDepTextCache();
  blobModuleStub.current = undefined;
  vi.restoreAllMocks();
});

const ITEM_TEXT = 'export const r = 1;\n';
const ENTRY_TEXT =
  'import { r } from "react";\nexport default { mount() { return r; }, unmount() {} };\n';
const REACT = unitOf('shared/react/index.abc.js', ITEM_TEXT, ['react']);
const ITEM_URL = `${PUBLIC_PATH}shared/react/index.abc.js`;
const ENTRY_URL = `${PUBLIC_PATH}assets/lifecycle.js`;

interface Deferred {
  resolve(response: Response): void;
  reject(error: Error): void;
}

/**
 * A fetch whose responses are settled by the test. Every request of a URL
 * is kept, so a test can settle an earlier request of a URL after a later
 * one was issued; settling a URL nobody requested fails by name.
 */
function controlledFetch() {
  const issued: string[] = [];
  const inits = new Map<string, RequestInit | undefined>();
  const requests = new Map<string, Deferred[]>();
  const auto = new Map<string, string>();
  const spy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      issued.push(url);
      inits.set(url, init);
      return new Promise<Response>((resolve, reject) => {
        const body = auto.get(url);
        if (body !== undefined) {
          resolve(jsResponse(body));
          return;
        }
        requests.set(url, [...(requests.get(url) ?? []), { resolve, reject }]);
      });
    }) as typeof fetch);
  const request = (url: string, index?: number): Deferred => {
    const all = requests.get(url);
    if (all === undefined || all.length === 0) {
      throw new Error(`test expected ${url} to have been requested`);
    }
    const found = all[index ?? all.length - 1];
    if (found === undefined) {
      throw new Error(`test expected request #${String(index)} of ${url}`);
    }
    return found;
  };
  return {
    issued,
    inits,
    spy,
    count: (url: string): number => issued.filter((u) => u === url).length,
    respondAlways: (url: string, body: string): void => {
      auto.set(url, body);
    },
    ok: (url: string, body: string, index?: number): void =>
      request(url, index).resolve(jsResponse(body)),
    status404: (url: string, index?: number): void =>
      request(url, index).resolve(jsResponse('missing', false)),
    fail: (url: string, error: Error, index?: number): void =>
      request(url, index).reject(error),
  };
}
type Net = ReturnType<typeof controlledFetch>;

/** A macrotask turn: every microtask continuation has run once it resolves. */
const turn = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

/** Wait, by turns (immune to faked timers), until `condition` holds. */
async function until(condition: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 3000; i += 1) {
    if (condition()) return;
    await turn();
  }
  throw new Error(`timed out waiting for ${what}`);
}

const issuedUrl = (net: Net, url: string): Promise<void> =>
  until(() => net.issued.includes(url), `${url} to be requested`);

/**
 * Let the continuation of a delivered response run: the work a load does
 * after a response is pure continuation of it, so once a few turns passed,
 * any request it was going to issue was.
 */
async function drained() {
  await turn();
  await turn();
}

/**
 * Fail the entry after the load went on to its unit batch, but before the
 * batch's requests are issued: the entry's failure is delivered when
 * `loadList` is entered, and `loadList` proceeds only once the load has
 * recorded it. The batch it then issues is the failed load's gated one.
 */
function failEntryBeforeItemBatch(net: Net): void {
  const realLoadList = SharedDepListLoader.prototype.loadList;
  vi.spyOn(SharedDepListLoader.prototype, 'loadList').mockImplementation(
    async function (this: SharedDepListLoader, ...args) {
      net.status404(ENTRY_URL);
      await turn();
      return realLoadList.apply(this, args);
    },
  );
}

function listManifest(
  units: SharedDepUnit[] = [REACT],
  shared = [sharedDep('react')],
) {
  return buildManifest(shared, {
    units,
    lists: { './lifecycle': listOf(units) },
  });
}

function entryWith(manifest: MfManifest, jsSync: string[]): MfeEntryMF {
  return {
    ...buildEntry(manifest),
    exposeAssets: {
      js: { sync: jsSync },
      css: { sync: [], async: [] },
    },
  };
}

/** Narrow a settled load's error to `MfeLoadError`, failing the test otherwise. */
function asLoadError(error: unknown): MfeLoadError {
  if (!(error instanceof MfeLoadError)) throw new Error('expected an MfeLoadError');
  return error;
}

const settle = (loading: Promise<unknown>): Promise<unknown> =>
  loading.then(
    () => undefined,
    (error: unknown) => error,
  );

describe('acceptance: concurrent entry module request', () => {
  it('requests the entry at high priority together with the unit, before any response, and mints the entry after its units', async () => {
    const net = controlledFetch();
    const minted = captureMintedSources();
    const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
    const loading = handler.load(buildEntry(listManifest()), 'ext-a');

    await until(() => net.issued.length === 2, 'both round requests');
    // One round, out before either resolves, with no list document.
    expect(net.issued).toEqual([ENTRY_URL, ITEM_URL]);
    expect(net.inits.get(ENTRY_URL)).toEqual({ priority: 'high' });
    expect(net.inits.get(ITEM_URL)).toBeUndefined();
    expect(await minted.sources()).toEqual([]);

    net.ok(ENTRY_URL, ENTRY_TEXT);
    await turn();
    // The entry response alone mints nothing: its unit is still unminted.
    expect(await minted.sources()).toEqual([]);

    net.ok(ITEM_URL, ITEM_TEXT);
    await loading;
    const sources = await minted.sources();
    minted.restore();
    expect(net.issued).toEqual([ENTRY_URL, ITEM_URL]);
    expect(sources[0]).toBe(ITEM_TEXT);
    expect(sources[sources.length - 1]).toMatch(/from\s*["']blob:/);
    expect(sources[sources.length - 1]).not.toMatch(/from\s*["']react["']/);
  });

  it('mints a multi-unit list dependency-first and evaluates the entry after the last mint, requesting only items missing from the realm cache, once each', async () => {
    const depText = 'export const a = 1;\n';
    const pkgBText = 'import { a } from "dep-a";\nexport const b = a;\n';
    const pkgCText = 'export const c = 3;\n';
    const units = [
      unitOf('shared/b/index.js', pkgBText, ['pkg-b'], ['dep-a']),
      unitOf('shared/a/index.js', depText, ['dep-a']),
      unitOf('shared/c/index.js', pkgCText, ['pkg-c']),
    ];
    const entryText =
      'import { b } from "pkg-b";\nimport { c } from "pkg-c";\n' +
      'export default { mount() { return [b, c]; }, unmount() {} };\n';
    const A_URL = `${PUBLIC_PATH}shared/a/index.js`;
    const B_URL = `${PUBLIC_PATH}shared/b/index.js`;
    const C_URL = `${PUBLIC_PATH}shared/c/index.js`;
    // `pkg-c` is already resident in the realm cache.
    RealmSharedDepTextCacheProvider.getCache().set(
      `chunk:${sha256Hex(pkgCText)}`,
      Promise.resolve(pkgCText),
    );
    const net = controlledFetch();
    const minted = captureMintedSources();
    let mintedAtImport: Promise<string[]> | undefined;
    vi.spyOn(DynamicModuleOps, 'importBlobModule').mockImplementation(
      (): Promise<unknown> => {
        mintedAtImport = minted.sources();
        return Promise.resolve(blobModuleStub.current);
      },
    );
    const loading = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
      buildEntry(listManifest(units)),
      'ext-multi',
    );
    await until(
      () => net.issued.includes(A_URL) && net.issued.includes(B_URL),
      'the unit batch',
    );
    net.ok(B_URL, pkgBText);
    net.ok(ENTRY_URL, entryText);
    net.ok(A_URL, depText);
    await loading;
    const sources = await minted.sources();
    minted.restore();

    // The batch holds only the missing units, each once.
    expect(net.issued.filter((u) => u.includes('/shared/')).sort()).toEqual(
      [A_URL, B_URL].sort(),
    );
    expect(net.count(C_URL)).toBe(0);
    // Dependency first, then its dependent, and the entry last.
    const at = (needle: string): number =>
      sources.findIndex((s) => s.includes(needle));
    expect(at('export const a = 1')).toBeGreaterThanOrEqual(0);
    expect(at('export const a = 1')).toBeLessThan(at('export const b = a'));
    expect(sources[sources.length - 1]).toContain('mount()');
    // The entry is evaluated only after the last mint.
    expect(mintedAtImport).toBeDefined();
    expect(await mintedAtImport).toHaveLength(sources.length);
  });

  it('requests only the entry when every shared text is resident', async () => {
    const net = controlledFetch();
    const first = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
      buildEntry(listManifest()),
      'ext-b1',
    );
    await until(() => net.issued.length === 2, 'both round requests');
    // The entry request is out and still unanswered when the unit goes out.
    expect(net.issued).toEqual([ENTRY_URL, ITEM_URL]);
    net.ok(ITEM_URL, ITEM_TEXT);
    net.ok(ENTRY_URL, ENTRY_TEXT);
    await first;

    // A second handler: the unit is resident in the realm cache, so only
    // the entry is requested; nothing is fetched twice.
    const before = net.issued.length;
    const second = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
      buildEntry(listManifest()),
      'ext-b2',
    );
    await until(() => net.issued.length > before, 'the second entry request');
    expect(net.issued.slice(before)).toEqual([ENTRY_URL]);
    net.ok(ENTRY_URL, ENTRY_TEXT);
    await second;
    expect(net.issued.slice(before)).toEqual([ENTRY_URL]);
  });

  it('requests no entry again on the same handler while its text is resident, and never admits the entry to the realm cache', async () => {
    const net = controlledFetch();
    net.respondAlways(ENTRY_URL, ENTRY_TEXT);
    net.respondAlways(ITEM_URL, ITEM_TEXT);
    const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
    await handler.load(buildEntry(listManifest()), 'ext-s1');
    const afterFirst = [...net.issued];
    expect(afterFirst.filter((u) => u === ENTRY_URL)).toHaveLength(1);

    await handler.load(buildEntry(listManifest()), 'ext-s2');
    expect(net.issued).toEqual(afterFirst);

    // The entry is never admitted to the realm cache: a second handler
    // finds the unit resident, yet still requests the entry.
    expect(
      RealmSharedDepTextCacheProvider.getCache().get(
        `chunk:${sha256Hex(ENTRY_TEXT)}`,
      ),
    ).toBeUndefined();
    const before = net.issued.length;
    await newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
      buildEntry(listManifest()),
      'ext-s3',
    );
    expect(net.issued.slice(before)).toEqual([ENTRY_URL]);
  });

  it('mints each load its own blob instances', async () => {
    const net = controlledFetch();
    const minted = captureMintedSources();
    const run = async (id: string): Promise<void> => {
      const before = net.issued.length;
      const loading = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
        buildEntry(listManifest()),
        id,
      );
      await until(() => net.issued.length > before, `${id} first request`);
      if (net.issued.slice(before).includes(ITEM_URL)) {
        net.ok(ITEM_URL, ITEM_TEXT);
      }
      net.ok(ENTRY_URL, ENTRY_TEXT);
      await loading;
    };
    await run('ext-c1');
    // Run 2: the unit is resident, so it issues only the entry.
    const before = net.issued.length;
    await run('ext-c2');
    expect(net.issued.slice(before)).toEqual([ENTRY_URL]);
    const sources = await minted.sources();
    minted.restore();
    const entrySources = sources.filter((s) => s.includes('mount()'));
    expect(entrySources).toHaveLength(2);
    expect(entrySources[0]).not.toBe(entrySources[1]);
  });

  it('downloads the entry once even when the load inserts more texts than the source-text cache holds', async () => {
    // More texts than the handler's source-text cache holds, so the entry's
    // own cache entry is evicted while the load is still running.
    const count = SOURCE_TEXT_CACHE_CAPACITY + 20;
    expect(count).toBeGreaterThan(SOURCE_TEXT_CACHE_CAPACITY);
    const items = Array.from({ length: count }, (_, i) => ({
      text: `export const v${String(i)} = ${String(i)};\n`,
      location: `shared/many/${String(i)}.js`,
    }));
    const units = items.map((item, i) =>
      unitOf(item.location, item.text, [`many-${String(i)}`]),
    );
    const net = controlledFetch();
    net.respondAlways(ENTRY_URL, 'export default { mount() {}, unmount() {} };\n');
    for (const item of items) {
      net.respondAlways(`${PUBLIC_PATH}${item.location}`, item.text);
    }
    await newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
      buildEntry(listManifest(units)),
      'ext-many',
    );
    expect(net.count(ENTRY_URL)).toBe(1);
  });

  it('requests an absolute entry URL once, as-is, and completes the load', async () => {
    const absolute = 'https://cdn.example.test/assets/lifecycle.js';
    const net = controlledFetch();
    const loading = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
      entryWith(listManifest(), [absolute]),
      'ext-abs',
    );
    await issuedUrl(net, ITEM_URL);
    net.ok(ITEM_URL, ITEM_TEXT);
    net.ok(absolute, ENTRY_TEXT);
    await loading;
    expect(net.count(absolute)).toBe(1);
    expect(net.issued).not.toContain(`${PUBLIC_PATH}${absolute}`);
  });

  it('refuses an empty exposeAssets.js.sync before any fetch, without a retry', async () => {
    // Faked timers that are never advanced: a retry's backoff or an attempt
    // timer would leave the load pending, so the refusal settling at all
    // proves it was neither retried nor raced.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const net = controlledFetch();
    const handler = newHandler(ENTRY_BASE_ID, { retries: 2 });
    const error = await settle(
      handler.load(entryWith(listManifest(), []), 'ext-empty'),
    );
    expect(error).toBeInstanceOf(MfeLoadError);
    expect(asLoadError(error).message).toContain('exposeAssets.js.sync is empty');
    expect(asLoadError(error).entryTypeId).toBe(ENTRY_ID);
    expect(net.issued).toEqual([]);
  });

  it('issues no early entry request for a legacy chunkPath manifest', async () => {
    const SHARED_URL = `${PUBLIC_PATH}shared/react.js`;
    const net = controlledFetch();
    const loading = newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
      buildEntry(buildManifest([sharedDep('react')])),
      'ext-legacy',
    );
    await issuedUrl(net, SHARED_URL);
    await turn();
    expect(net.issued).toEqual([SHARED_URL]);
    net.ok(SHARED_URL, ITEM_TEXT);
    await issuedUrl(net, ENTRY_URL);
    net.ok(ENTRY_URL, 'export default { mount() {}, unmount() {} };\n');
    await loading;
    expect(net.count(ENTRY_URL)).toBe(1);
  });

  it('does not keep the entry request on the per-load state once the entry chunk was built', async () => {
    const net = controlledFetch();
    net.respondAlways(ENTRY_URL, ENTRY_TEXT);
    net.respondAlways(ITEM_URL, ITEM_TEXT);
    const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
    type LoadState = { entrySource?: Promise<string> };
    type Chain = (state: LoadState, ...rest: unknown[]) => Promise<void>;
    const states: LoadState[] = [];
    const chain: Chain = Reflect.get(handler, 'createBlobUrlChain');
    Reflect.set(handler, 'createBlobUrlChain', (state: LoadState, ...rest: unknown[]) => {
      states.push(state);
      expect(state.entrySource).toBeInstanceOf(Promise);
      return chain.call(handler, state, ...rest);
    });
    await handler.load(buildEntry(listManifest()), 'ext-state');
    expect(states).toHaveLength(1);
    expect(states[0].entrySource).toBeUndefined();
  });

  describe('retry and timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });

    it('retries once when the entry fails on attempt 1, requesting the entry again and joining the in-flight unit', async () => {
      const net = controlledFetch();
      const loading = newHandler(ENTRY_BASE_ID, { retries: 1 }).load(
        buildEntry(listManifest()),
        'ext-retry',
      );
      await until(() => net.issued.length === 2, 'both round requests');
      net.status404(ENTRY_URL);
      await vi.advanceTimersByTimeAsync(1000);
      await until(() => net.count(ENTRY_URL) === 2, 'the retried entry request');
      expect(net.count(ITEM_URL)).toBe(1);
      net.ok(ENTRY_URL, ENTRY_TEXT);
      net.ok(ITEM_URL, ITEM_TEXT);
      await loading;
      expect(net.count(ENTRY_URL)).toBe(2);
      expect(net.count(ITEM_URL)).toBe(1);
    });

    it('fails an attempt whose entry hangs with the timeout error and releases the entry so a later load requests it again', async () => {
      const net = controlledFetch();
      const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
      const settled = settle(handler.load(buildEntry(listManifest()), 'ext-hang'));
      await until(() => net.issued.length === 2, 'both round requests');
      await vi.advanceTimersByTimeAsync(30001);
      const error = await settled;
      expect(error).toBeInstanceOf(MfeLoadError);
      expect(asLoadError(error).message).toContain('timed out');
      expect(asLoadError(error).entryTypeId).toBe(ENTRY_ID);

      void handler.load(buildEntry(listManifest()), 'ext-hang-2');
      await until(() => net.count(ENTRY_URL) === 2, 'the entry requested again');
    });

    it('does not let a late rejection of an abandoned attempt evict the retry\'s entry', async () => {
      const net = controlledFetch();
      const handler = newHandler(ENTRY_BASE_ID, { retries: 1 });
      const loading = handler.load(buildEntry(listManifest()), 'ext-late');
      await until(() => net.issued.length === 2, 'both round requests');
      await vi.advanceTimersByTimeAsync(30001);
      await vi.advanceTimersByTimeAsync(1000);
      await until(() => net.count(ENTRY_URL) === 2, 'the retried entry request');
      // The abandoned attempt's request fails late.
      net.fail(ENTRY_URL, new TypeError('late'), 0);
      await turn();
      net.ok(ENTRY_URL, ENTRY_TEXT, 1);
      await until(() => net.count(ITEM_URL) >= 2, 'the retried unit request');
      net.ok(ITEM_URL, ITEM_TEXT, 1);
      await loading;

      // The retry's entry stays resident: a later load requests nothing
      // (an answer is armed so a duplicate request shows as one, not a hang).
      net.respondAlways(ENTRY_URL, ENTRY_TEXT);
      const issued = net.issued.length;
      await handler.load(buildEntry(listManifest()), 'ext-late-2');
      expect(net.issued.length).toBe(issued);
      expect(net.count(ENTRY_URL)).toBe(2);
    });
  });

  describe('failure of either request of the round', () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    beforeEach(() => {
      unhandled.length = 0;
      process.on('unhandledRejection', onUnhandled);
    });
    afterEach(() => {
      process.off('unhandledRejection', onUnhandled);
    });

    it('fails with the entry request error, issues no further request and discards the unit outcome', async () => {
      const net = controlledFetch();
      const settled = settle(
        newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
          buildEntry(listManifest()),
          'ext-d',
        ),
      );
      await until(() => net.issued.length === 2, 'both round requests');
      net.status404(ENTRY_URL);
      const error = await settled;
      expect(error).toBeInstanceOf(MfeLoadError);
      expect(asLoadError(error).message).toContain(ENTRY_URL);
      expect(asLoadError(error).entryTypeId).toBe(ENTRY_URL);
      // The unit resolving afterwards is discarded.
      net.ok(ITEM_URL, ITEM_TEXT);
      await drained();
      expect(net.issued).toEqual([ENTRY_URL, ITEM_URL]);
      expect(unhandled).toEqual([]);
    });

    it('fails with the entry network error arriving after the unit arrived', async () => {
      const net = controlledFetch();
      const settled = settle(
        newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
          buildEntry(listManifest()),
          'ext-e',
        ),
      );
      await until(() => net.issued.length === 2, 'both round requests');
      net.ok(ITEM_URL, ITEM_TEXT);
      await drained();
      net.fail(ENTRY_URL, new TypeError('offline'));
      const error = await settled;
      expect(error).toBeInstanceOf(MfeLoadError);
      expect(asLoadError(error).message).toContain(ENTRY_URL);
      expect(asLoadError(error).entryTypeId).toBe(ENTRY_URL);
      expect(net.issued).toEqual([ENTRY_URL, ITEM_URL]);
      expect(unhandled).toEqual([]);
    });

    it('fails with the entry error when the entry fails last, after the unit completed and minted', async () => {
      const net = controlledFetch();
      const settled = settle(
        newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
          buildEntry(listManifest()),
          'ext-last',
        ),
      );
      await until(() => net.issued.length === 2, 'both round requests');
      const minted = captureMintedSources();
      net.ok(ITEM_URL, ITEM_TEXT);
      await drained();
      // The unit is minted: the list completed.
      expect(await minted.sources()).toEqual([ITEM_TEXT]);
      net.status404(ENTRY_URL);
      const error = await settled;
      minted.restore();
      expect(error).toBeInstanceOf(MfeLoadError);
      expect(asLoadError(error).message).toContain(ENTRY_URL);
      expect(asLoadError(error).entryTypeId).toBe(ENTRY_URL);
      expect(unhandled).toEqual([]);
    });

    it('fails with an error naming the unit and discards the entry outcome', async () => {
      const net = controlledFetch();
      const settled = settle(
        newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
          buildEntry(listManifest()),
          'ext-f',
        ),
      );
      await until(() => net.issued.length === 2, 'both round requests');
      net.status404(ITEM_URL);
      const error = await settled;
      expect(error).toBeInstanceOf(MfeLoadError);
      expect(asLoadError(error).message).toContain(ITEM_URL);
      expect(asLoadError(error).entryTypeId).toBe(ITEM_URL);
      net.fail(ENTRY_URL, new TypeError('offline'));
      await turn();
      expect(net.issued).toEqual([ENTRY_URL, ITEM_URL]);
      expect(unhandled).toEqual([]);
    });

    it('names the request that failed first when both fail', async () => {
      const entryFirst = controlledFetch();
      const a = settle(
        newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
          buildEntry(listManifest()),
          'ext-both-1',
        ),
      );
      await until(() => entryFirst.issued.length === 2, 'both round requests');
      entryFirst.status404(ENTRY_URL);
      await drained();
      entryFirst.status404(ITEM_URL);
      expect(asLoadError(await a).entryTypeId).toBe(ENTRY_URL);
      vi.restoreAllMocks();

      const unitFirst = controlledFetch();
      const b = settle(
        newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
          buildEntry(listManifest()),
          'ext-both-2',
        ),
      );
      await until(() => unitFirst.issued.length === 2, 'both round requests');
      unitFirst.status404(ITEM_URL);
      await drained();
      unitFirst.status404(ENTRY_URL);
      expect(asLoadError(await b).entryTypeId).toBe(ITEM_URL);
      expect(unhandled).toEqual([]);
    });

    it('issues no unit request when the entry fails before the unit batch', async () => {
      const net = controlledFetch();
      failEntryBeforeItemBatch(net);
      const settled = settle(
        newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
          buildEntry(listManifest()),
          'ext-drain',
        ),
      );
      const error = await settled;
      await turn();
      expect(error).toBeInstanceOf(MfeLoadError);
      expect(asLoadError(error).entryTypeId).toBe(ENTRY_URL);
      expect(net.issued).toEqual([ENTRY_URL]);
    });

    it('issues no retry request for a joined fetch that rejects after the load failed', async () => {
      // Load A (its own handler) issues the unit; load B joins A's in-flight
      // unit through the realm cache, then fails on its entry. A's unit
      // rejecting afterwards must not make B re-request it.
      const net = controlledFetch();
      const a = settle(
        newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
          buildEntry(listManifest()),
          'ext-join-a',
        ),
      );
      await until(() => net.issued.length === 2, 'load A round requests');

      const b = settle(
        newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
          buildEntry(listManifest()),
          'ext-join-b',
        ),
      );
      await until(() => net.count(ENTRY_URL) === 2, 'load B entry request');
      net.status404(ENTRY_URL, 1);
      expect(asLoadError(await b).entryTypeId).toBe(ENTRY_URL);

      net.fail(ITEM_URL, new TypeError('offline'));
      await a;
      await turn();
      expect(net.count(ITEM_URL)).toBe(1);
      expect(unhandled).toEqual([]);
    });

    it.each([
      ['entry first', [ENTRY_URL, ITEM_URL]],
      ['unit first', [ITEM_URL, ENTRY_URL]],
    ])(
      'names one error when both requests fail in the same drain (%s), the one recorded first',
      async (_order, delivery) => {
        const net = controlledFetch();
        const settled = settle(
          newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
            buildEntry(listManifest()),
            'ext-tie',
          ),
        );
        await until(() => net.issued.length === 2, 'both round requests');
        // Both responses are delivered in one synchronous burst, so both
        // rejections settle within the same drain.
        for (const url of delivery) net.status404(url);
        const error = asLoadError(await settled);
        await turn();
        expect(error).toBeInstanceOf(MfeLoadError);
        // One error names the load: the failure recorded first.
        expect([ENTRY_URL, ITEM_URL]).toContain(error.entryTypeId);
        expect(error.message).toContain(error.entryTypeId);
        expect(net.issued).toEqual([ENTRY_URL, ITEM_URL]);
        expect(unhandled).toEqual([]);
      },
    );

    it('never publishes a failed load\'s gated unit request to the realm cache', async () => {
      const net = controlledFetch();
      const published: string[] = [];
      const realm = RealmSharedDepTextCacheProvider.getCache();
      const realSet = realm.set.bind(realm);
      failEntryBeforeItemBatch(net);
      vi.spyOn(realm, 'set').mockImplementation((key, value) => {
        published.push(key);
        realSet(key, value);
      });
      const settled = settle(
        newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
          buildEntry(listManifest()),
          'ext-gate',
        ),
      );
      const error = await settled;
      await turn();
      expect(error).toBeInstanceOf(MfeLoadError);
      expect(net.issued).toEqual([ENTRY_URL]);
      expect(published).not.toContain(`chunk:${sha256Hex(ITEM_TEXT)}`);
    });

    it('fails two loads sharing one in-flight entry request with the same error and issues no further request', async () => {
      const net = controlledFetch();
      const handler = newHandler(ENTRY_BASE_ID, { retries: 0 });
      const a = settle(handler.load(buildEntry(listManifest()), 'ext-share-a'));
      await until(() => net.issued.length === 2, 'load A requests');
      const b = settle(handler.load(buildEntry(listManifest()), 'ext-share-b'));
      await turn();
      net.status404(ENTRY_URL);
      const [errA, errB] = [await a, await b];
      await turn();
      expect(errA).toBeInstanceOf(MfeLoadError);
      expect(errB).toBe(errA);
      expect(net.count(ENTRY_URL)).toBe(1);
      expect(net.issued).toEqual([ENTRY_URL, ITEM_URL]);
      expect(unhandled).toEqual([]);
    });

    it('fails with an error naming the unit when the entry succeeded and the unit fails', async () => {
      const net = controlledFetch();
      const settled = settle(
        newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
          buildEntry(listManifest()),
          'ext-unit-last',
        ),
      );
      await until(() => net.issued.length === 2, 'both round requests');
      net.ok(ENTRY_URL, ENTRY_TEXT);
      await turn();
      net.status404(ITEM_URL);
      const error = asLoadError(await settled);
      await turn();
      expect(error).toBeInstanceOf(MfeLoadError);
      expect(error.message).toContain(ITEM_URL);
      expect(error.entryTypeId).toBe(ITEM_URL);
      expect(net.issued).toEqual([ENTRY_URL, ITEM_URL]);
      expect(unhandled).toEqual([]);
    });
  });
});
