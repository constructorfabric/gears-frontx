/**
 * MfeHandlerMF — manifest references named by id.
 *
 * An entry names its manifest by id, the id being a manifest the type
 * system holds. The handler's own cache only answers for
 * remotes some earlier load already pulled in, so without the type system a
 * first load of an id-referencing entry cannot resolve at all.
 *
 * The plugin reaches the handler through `attachTypeSystem`, which the
 * registry calls at registration — these tests call it directly to cover the
 * handler alone; the registry end of the same seam is covered by
 * `runtime/__tests__/non-gts-manifest-resolution.test.ts`.
 *
 * The fake plugin answers in a notation that is deliberately NOT GTS, and the
 * fixture ids are opaque to the handler — it uses them as cache keys and error
 * context only.
 */
// @cpt-dod:cpt-frontx-dod-mfe-isolation-manifest-reference-resolution:p1
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { MfeHandlerMF } from '../MfeHandlerMF';
import { MfeLoadError } from '../../../errors';
import type { MfeEntryMF } from '../../../types/mfe-entry-mf';
import type { MfManifest } from '../../../manifest/mf-manifest';
import { createFakeTypeSystem } from './helpers/registered-manifest';

const MANIFEST_ID = 'mock.mfe.mf_manifest.v1~test.manifest.v1';
const ENTRY_BASE_ID = 'mock.mfe.entry.v1~';
const ENTRY_ID = `${ENTRY_BASE_ID}test.entry.v1`;
const PUBLIC_PATH = 'http://localhost:3099/';
// A second origin for the same manifest id. The chunk URL a load fetches is
// derived from the resolved manifest's publicPath, which makes the origin the
// observable answer to "which plugin resolved this".
const RIVAL_PUBLIC_PATH = 'http://localhost:4099/';

function buildManifest(publicPath: string = PUBLIC_PATH): MfManifest {
  return {
    id: MANIFEST_ID,
    metaData: {
      publicPath,
    },
    shared: [],
  };
}

/** Entry that names its manifest by id rather than carrying the document. */
function buildEntry(manifestRef: string): MfeEntryMF {
  return {
    id: ENTRY_ID,
    requiredProperties: [],
    actions: [],
    domainActions: [],
    manifest: manifestRef,
    exposedModule: './lifecycle',
    exposeAssets: {
      js: { sync: ['assets/lifecycle.js'] },
      css: { sync: [], async: [] },
    },
  };
}

const createFakePlugin = createFakeTypeSystem;

describe('MfeHandlerMF — manifest named by id', () => {
  it('resolves the manifest from the attached type system when its own cache has never seen the id', async () => {
    const plugin = createFakePlugin(new Map([[MANIFEST_ID, buildManifest()]]));
    const getSchemaSpy = vi.spyOn(plugin, 'getSchema');
    // retries: 0 — the failure below is deterministic and must not be delayed
    // by RetryHandler's backoff.
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    handler.attachTypeSystem(plugin);

    // Chunk fetching is downstream of manifest resolution and out of scope
    // here: a controlled rejection lets the load fail only after the manifest
    // has resolved, and the URL it was called with is derived from that
    // manifest's publicPath — which is the proof the lookup answered.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('network error for test'));

    await expect(handler.load(buildEntry(MANIFEST_ID), 'ext-by-id')).rejects.toThrow(
      MfeLoadError
    );

    expect(getSchemaSpy).toHaveBeenCalledWith(MANIFEST_ID);
    expect(fetchSpy).toHaveBeenCalledWith(`${PUBLIC_PATH}assets/lifecycle.js`);

    fetchSpy.mockRestore();
  });

  it('fails the load naming the reference when no type system was ever attached', async () => {
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(
      handler.load(buildEntry('mock.mfe.mf_manifest.v1~unbacked.v1'), 'ext-no-plugin')
    ).rejects.toThrow(/mock\.mfe\.mf_manifest\.v1~unbacked\.v1/);

    // Resolution fails before anything is fetched.
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('fails the load when the attached type system holds nothing under the referenced id', async () => {
    const plugin = createFakePlugin(new Map());
    const getSchemaSpy = vi.spyOn(plugin, 'getSchema');
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    handler.attachTypeSystem(plugin);

    await expect(
      handler.load(buildEntry('mock.mfe.mf_manifest.v1~never-registered.v1'), 'ext-miss')
    ).rejects.toThrow(MfeLoadError);
    expect(getSchemaSpy).toHaveBeenCalledWith('mock.mfe.mf_manifest.v1~never-registered.v1');
  });

  it('fails the load when the referenced id holds something that is not a manifest', async () => {
    // The plugin's store is keyed by opaque ids across every kind of schema a
    // consumer registered, so an id can legitimately answer with a non-manifest.
    const plugin = createFakePlugin(new Map([[MANIFEST_ID, { id: MANIFEST_ID, kind: 'not-a-manifest' }]]));
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    handler.attachTypeSystem(plugin);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(handler.load(buildEntry(MANIFEST_ID), 'ext-wrong-shape')).rejects.toThrow(
      MfeLoadError
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('refuses a second, different type system and keeps resolving through the first', async () => {
    // Both plugins answer the same id, so nothing in the handler's own caches
    // - keyed by manifest and extension id alone - could tell them apart.
    const firstPlugin = createFakePlugin(new Map([[MANIFEST_ID, buildManifest()]]));
    const secondPlugin = createFakePlugin(
      new Map([[MANIFEST_ID, buildManifest(RIVAL_PUBLIC_PATH)]])
    );
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    handler.attachTypeSystem(firstPlugin);

    expect(() => handler.attachTypeSystem(secondPlugin)).toThrow(
      /already bound to a type system/
    );
    // Re-registering into the same registry must stay a no-op: only a rebind
    // to a different plugin is the error.
    expect(() => handler.attachTypeSystem(firstPlugin)).not.toThrow();

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('network error for test'));

    await expect(handler.load(buildEntry(MANIFEST_ID), 'ext-rebind')).rejects.toThrow(
      MfeLoadError
    );

    expect(fetchSpy).toHaveBeenCalledWith(`${PUBLIC_PATH}assets/lifecycle.js`);
    fetchSpy.mockRestore();
  });

  it('accepts a registry answer that carries only id, metaData and shared', async () => {
    // The closed contract has no manifest `name`: id, metaData and shared are
    // what makes an answer a manifest.
    const answer = {
      id: MANIFEST_ID,
      metaData: { publicPath: PUBLIC_PATH },
      shared: [],
    } satisfies MfManifest;
    const plugin = createFakePlugin(new Map([[MANIFEST_ID, answer]]));
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    handler.attachTypeSystem(plugin);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('network error for test'));

    await expect(handler.load(buildEntry(MANIFEST_ID), 'ext-nameless')).rejects.toThrow(
      MfeLoadError
    );
    expect(fetchSpy).toHaveBeenCalledWith(`${PUBLIC_PATH}assets/lifecycle.js`);
    fetchSpy.mockRestore();
  });

  it('does not cache an answer that is not a manifest, and reads the registry again on the next load', async () => {
    const registered = new Map<string, unknown>([[MANIFEST_ID, { id: MANIFEST_ID, kind: 'not-a-manifest' }]]);
    const plugin = createFakePlugin(registered);
    const getSchemaSpy = vi.spyOn(plugin, 'getSchema');
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    handler.attachTypeSystem(plugin);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('network error for test'));

    const firstError = await handler
      .load(buildEntry(MANIFEST_ID), 'ext-retry-1')
      .then(() => null, (e: unknown) => e);
    expect(firstError).toBeInstanceOf(MfeLoadError);
    expect((firstError as MfeLoadError).message).toContain(MANIFEST_ID);
    expect((firstError as MfeLoadError).message).toMatch(/not registered/);
    expect(getSchemaSpy).toHaveBeenCalledTimes(1);

    // The registry now holds the real manifest: the next load finds it,
    // which it could not had the earlier answer been cached.
    registered.set(MANIFEST_ID, buildManifest());
    await expect(handler.load(buildEntry(MANIFEST_ID), 'ext-retry-2')).rejects.toThrow(
      MfeLoadError
    );
    expect(getSchemaSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenCalledWith(`${PUBLIC_PATH}assets/lifecycle.js`);
    fetchSpy.mockRestore();
  });

  it('fails an entry whose manifest is not registered without advising an inline manifest', async () => {
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    handler.attachTypeSystem(createFakePlugin(new Map()));

    const error = await handler
      .load(buildEntry('mock.mfe.mf_manifest.v1~absent.v1'), 'ext-unregistered')
      .then(() => null, (e: unknown) => e);

    expect(error).toBeInstanceOf(MfeLoadError);
    expect((error as MfeLoadError).message).toContain('mock.mfe.mf_manifest.v1~absent.v1');
    expect((error as MfeLoadError).message).not.toMatch(/inline/i);
  });

  it('type-check lane enforces MfeEntryMF.manifest as a string id, rejecting an inline object', () => {
    // Compile-time assertions only: `type-check:test` fails when the field is
    // anything but `string`.
    expectTypeOf<MfeEntryMF['manifest']>().toEqualTypeOf<string>();
    expectTypeOf<MfManifest>().not.toExtend<MfeEntryMF['manifest']>();
  });

  it('does not retry an unresolved manifest reference: the registry is read once', async () => {
    const plugin = createFakePlugin(new Map());
    const getSchemaSpy = vi.spyOn(plugin, 'getSchema');
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 2 });
    handler.attachTypeSystem(plugin);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const started = Date.now();

    await expect(
      handler.load(buildEntry('mock.mfe.mf_manifest.v1~never.v1'), 'ext-no-retry')
    ).rejects.toThrow(MfeLoadError);

    expect(getSchemaSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    // A retry would wait out RetryHandler's backoff (about a second).
    expect(Date.now() - started).toBeLessThan(500);
    fetchSpy.mockRestore();
  });
});
