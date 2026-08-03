/**
 * MfeHandlerMF — string manifest reference resolution through the type system.
 *
 * Issue #472: `MfeHandlerMF.resolveManifest` used to consult only its own
 * internal `manifestCache`, ignoring the injected type system. When an entry
 * declared `manifest` as a string (the CTI `cti.reference` pattern, where the
 * manifest is a separately registered type-system instance), the handler
 * threw a "not found" error even though the manifest was right there in the
 * plugin. Issue #505 lists #472 as part of the same umbrella.
 *
 * Coverage here: with a `typeSystem` injected through the constructor config,
 * a string `manifest` reference resolves via `typeSystem.getSchema(ref)`;
 * without one, the legacy behaviour is preserved (diagnostic MfeLoadError).
 */
import { describe, expect, it, vi } from 'vitest';
import { MfeHandlerMF } from '../MfeHandlerMF';
import { MfeLoadError } from '../../errors';
import type { MfeEntryMF } from '../../types/mfe-entry-mf';
import type { MfManifest } from '../../manifest/mf-manifest';
import type { TypeSystemPlugin } from '../../type-substrate';

function buildManifest(publicPath: string): MfManifest {
  return {
    id: 'cti.example.mf_manifest~test.manifest.v1',
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

function buildEntryWithStringManifest(manifestRef: string): MfeEntryMF {
  // Deliberately a STRING manifest reference, not an inline MfManifest object.
  return {
    id: 'cti.example.entry~test.entry.v1',
    requiredProperties: [],
    actions: [],
    domainActions: [],
    manifest: manifestRef,
    exposedModule: './lifecycle',
    exposeAssets: {
      js: { sync: ['assets/lifecycle.js'], async: [] },
      css: { sync: [], async: [] },
    },
  } as unknown as MfeEntryMF;
}

function buildFakeTypeSystem(manifestById: Map<string, MfManifest>): TypeSystemPlugin {
  return {
    name: 'Fake',
    version: '1.0.0',
    registerSchema(): void {},
    getSchema(id: string) {
      return manifestById.get(id) as never;
    },
    register(): void {},
    isTypeOf(): boolean {
      return false;
    },
    validateInstance() {
      return { valid: true, errors: [] };
    },
    resolveLoadExtActionId(): string {
      return 'fake.action~load_ext';
    },
    resolveMountExtActionId(): string {
      return 'fake.action~mount_ext';
    },
    resolveUnmountExtActionId(): string {
      return 'fake.action~unmount_ext';
    },
    resolveLifecycleStageInitId(): string {
      return 'fake.stage~init';
    },
    resolveLifecycleStageActivatedId(): string {
      return 'fake.stage~activated';
    },
    resolveLifecycleStageDeactivatedId(): string {
      return 'fake.stage~deactivated';
    },
    resolveLifecycleStageDestroyedId(): string {
      return 'fake.stage~destroyed';
    },
  };
}

describe('MfeHandlerMF — string manifest reference resolution through the type system (issue #472)', () => {
  it('resolves a string manifest ref via typeSystem.getSchema when constructed with a typeSystem', async () => {
    const manifest = buildManifest('http://localhost:3099/');
    const fakeTypeSystem = buildFakeTypeSystem(
      new Map([['cti.example.mf_manifest~test.manifest.v1', manifest]])
    );
    const getSchemaSpy = vi.spyOn(fakeTypeSystem, 'getSchema');

    const handler = new MfeHandlerMF('cti.example.entry~', {
      typeSystem: fakeTypeSystem,
      retries: 0,
    });
    const entry = buildEntryWithStringManifest('cti.example.mf_manifest~test.manifest.v1');

    // The expose chunk fetch is downstream of manifest resolution and not
    // exercised by this unit test - mock fetch to a controlled rejection so
    // the chain fails after the manifest has already resolved. The proof we
    // care about is that typeSystem.getSchema was consulted.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('network error for test'));

    await expect(handler.load(entry, 'ext-issue-472')).rejects.toThrow(MfeLoadError);

    // The handler MUST consult the type system for the string reference -
    // this is the precise call that was missing pre-fix. After it returns
    // the manifest, the pipeline proceeds to fetch the expose chunk, which
    // is where the controlled rejection lands.
    expect(getSchemaSpy).toHaveBeenCalledWith('cti.example.mf_manifest~test.manifest.v1');
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:3099/assets/lifecycle.js');

    fetchSpy.mockRestore();
  });

  it('throws a diagnostic MfeLoadError on a string ref when no typeSystem is injected (legacy behaviour)', async () => {
    // No `typeSystem` in config - handler must keep the pre-fix behaviour of
    // resolving only from its internal cache, so unbacked refs fail loudly.
    const handler = new MfeHandlerMF('cti.example.entry~', { retries: 0 });
    const entry = buildEntryWithStringManifest('cti.example.mf_manifest~unresolved.v1');

    await expect(handler.load(entry, 'ext-legacy-1')).rejects.toThrow(MfeLoadError);
    await expect(handler.load(entry, 'ext-legacy-2')).rejects.toThrow(
      /cti\.example\.mf_manifest~unresolved\.v1/
    );
  });

  it('falls back to the legacy MfeLoadError when the typeSystem is present but the ref is not registered', async () => {
    const fakeTypeSystem = buildFakeTypeSystem(new Map());
    const getSchemaSpy = vi.spyOn(fakeTypeSystem, 'getSchema');

    const handler = new MfeHandlerMF('cti.example.entry~', {
      typeSystem: fakeTypeSystem,
      retries: 0,
    });
    const entry = buildEntryWithStringManifest('cti.example.mf_manifest~never-registered.v1');

    await expect(handler.load(entry, 'ext-missing-1')).rejects.toThrow(MfeLoadError);
    // Plugin was consulted - it just had nothing for this id.
    expect(getSchemaSpy).toHaveBeenCalledWith('cti.example.mf_manifest~never-registered.v1');
  });
});
