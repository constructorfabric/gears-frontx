/**
 * MfeHandlerMF — manifest references named by id.
 *
 * An entry may carry its manifest inline or name it by id, the id being a
 * manifest the type system holds. The handler's own cache only answers for
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
import { describe, expect, it, vi } from 'vitest';
import { MfeHandlerMF } from '../MfeHandlerMF';
import { MfeLoadError } from '../../../errors';
import type { MfeEntryMF } from '../../../types/mfe-entry-mf';
import type { MfManifest } from '../../../manifest/mf-manifest';
import type { TypeSystemPlugin } from '../../../type-substrate';

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
    name: 'testMfe',
    metaData: {
      name: 'testMfe',
      type: 'app',
      buildInfo: { buildVersion: '1.0.0', buildName: 'testMfe' },
      remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' },
      globalName: 'testMfe',
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
      js: { sync: ['assets/lifecycle.js'], async: [] },
      css: { sync: [], async: [] },
    },
  };
}

function createFakePlugin(registered: Map<string, unknown>): TypeSystemPlugin {
  return {
    name: 'FakePlugin',
    version: '1.0.0',
    registerSchema(): void {},
    getSchema(typeId: string): unknown {
      return registered.get(typeId);
    },
    register(): void {},
    isTypeOf(typeId: string, baseTypeId: string): boolean {
      return typeId === baseTypeId || typeId.startsWith(baseTypeId);
    },
    validateInstance() {
      return { valid: true, errors: [] };
    },
    resolveLoadExtActionId: () => 'mock.action.v1~load_ext.v1~',
    resolveMountExtActionId: () => 'mock.action.v1~mount_ext.v1~',
    resolveUnmountExtActionId: () => 'mock.action.v1~unmount_ext.v1~',
    resolveLifecycleStageInitId: () => 'mock.stage.v1~init.v1',
    resolveLifecycleStageActivatedId: () => 'mock.stage.v1~activated.v1',
    resolveLifecycleStageDeactivatedId: () => 'mock.stage.v1~deactivated.v1',
    resolveLifecycleStageDestroyedId: () => 'mock.stage.v1~destroyed.v1',
  };
}

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
});
