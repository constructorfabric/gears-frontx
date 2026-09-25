/**
 * Non-GTS consumer: manifest references resolved through the registry's plugin.
 *
 * An entry may name its manifest by id instead of carrying the document. The
 * handler that loads it holds no plugin of its own — the host application
 * constructs it (`new MfeHandlerMF(entryBaseTypeId)`) before any registry
 * exists — so the id only resolves if the registry hands the handler its type
 * system at registration. This drives the whole path: a real `MfeHandlerMF`
 * passed through `mfeHandlers`, an entry and a manifest that live only in a
 * deliberately non-GTS plugin, and a mount through the domain's mounter.
 *
 * Chunk fetching is downstream of manifest resolution and out of scope: fetch
 * is rejected so the load fails just after the manifest resolved, and the URL
 * it was called with is derived from that manifest's `publicPath` — which no
 * other source in the test could have supplied.
 */
// @cpt-dod:cpt-frontx-dod-mfe-isolation-manifest-reference-resolution:p1
// @cpt-algo:cpt-frontx-algo-mfe-registry-handler-resolution:p1
import { describe, it, expect, vi, afterEach } from 'vitest';
// @internal — colocated test, direct relative import is permitted.
import { DefaultMfeRegistry } from '../DefaultMfeRegistry';
import { MfeHandlerMF } from '../../handler/mfe-handler-mf/MfeHandlerMF';
import type { TypeSystemPlugin } from '../../type-substrate';
import type { Extension, ExtensionDomain } from '../../types';
import type { MfeEntryMF } from '../../types/mfe-entry-mf';
import type { MfManifest } from '../../manifest/mf-manifest';
import { ExtensionDomainImplementation } from '../ExtensionDomainImplementation';
import { ExtensionDomainImplementationFactory } from '../ExtensionDomainImplementationFactory';
import type { DomainContext } from '../DomainContext';
import { ConcurrentMountStrategy } from '../mount-strategies';
import type { ActionPayload } from '../mount-strategy';
import { ActionHandler } from '../../mediator/types';

// Deliberately NOT the GTS notation: a consumer whose ids live elsewhere is
// exactly the case a literal in the runtime would silently fail.
const FAKE_ACTION_LOAD_EXT = 'cti.example.action~load_ext.v1~';
const FAKE_ACTION_MOUNT_EXT = 'cti.example.action~mount_ext.v1~';
const FAKE_ACTION_UNMOUNT_EXT = 'cti.example.action~unmount_ext.v1~';

const DOMAIN_ID = 'cti.example.domain.widgets.v1';
const ENTRY_BASE_ID = 'cti.example.entry~';
const ENTRY_ID = `${ENTRY_BASE_ID}widget.v1`;
const MANIFEST_ID = 'cti.example.mf_manifest~widget.v1';
const PUBLIC_PATH = 'http://localhost:3099/';

function buildManifest(): MfManifest {
  return {
    id: MANIFEST_ID,
    name: 'widgetMfe',
    metaData: {
      name: 'widgetMfe',
      type: 'app',
      buildInfo: { buildVersion: '1.0.0', buildName: 'widgetMfe' },
      remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' },
      globalName: 'widgetMfe',
      publicPath: PUBLIC_PATH,
    },
    shared: [],
  };
}

/** Entry naming its manifest by id — the document itself is not carried here. */
function buildEntry(): MfeEntryMF {
  return {
    id: ENTRY_ID,
    requiredProperties: [],
    actions: [],
    domainActions: [],
    manifest: MANIFEST_ID,
    exposedModule: './lifecycle',
    exposeAssets: {
      js: { sync: ['assets/lifecycle.js'], async: [] },
      css: { sync: [], async: [] },
    },
  };
}

/**
 * Plugin holding both the entry and the manifest, each under its own id —
 * the arrangement `DefaultExtensionManager.resolveEntry` already relies on,
 * now extended to the manifest the entry names.
 */
function createNonGtsPlugin(): TypeSystemPlugin {
  const registered = new Map<string, unknown>([
    [ENTRY_ID, buildEntry()],
    [MANIFEST_ID, buildManifest()],
  ]);

  return {
    name: 'NonGtsPlugin',
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
    resolveLoadExtActionId: () => FAKE_ACTION_LOAD_EXT,
    resolveMountExtActionId: () => FAKE_ACTION_MOUNT_EXT,
    resolveUnmountExtActionId: () => FAKE_ACTION_UNMOUNT_EXT,
    resolveLifecycleStageInitId: () => 'cti.example.lifecycle.stage~init',
    resolveLifecycleStageActivatedId: () => 'cti.example.lifecycle.stage~activated',
    resolveLifecycleStageDeactivatedId: () => 'cti.example.lifecycle.stage~deactivated',
    resolveLifecycleStageDestroyedId: () => 'cti.example.lifecycle.stage~destroyed',
  };
}

function makeDomain(): ExtensionDomain {
  return {
    id: DOMAIN_ID,
    actions: [FAKE_ACTION_LOAD_EXT, FAKE_ACTION_MOUNT_EXT, FAKE_ACTION_UNMOUNT_EXT],
    extensionsActions: [],
    sharedProperties: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
  };
}

function makeExtension(extensionId: string): Extension {
  return {
    id: extensionId,
    domain: DOMAIN_ID,
    entry: ENTRY_ID,
  } as Extension;
}

/**
 * Domain implementation carrying the one mount strategy `registerDomain`
 * requires. The mount below goes through the domain's mounter directly, so
 * the strategy is never exercised.
 */
class WidgetDomainImpl extends ExtensionDomainImplementation {
  private readonly strategy: ConcurrentMountStrategy;

  constructor(ctx: DomainContext) {
    super();
    this.strategy = new ConcurrentMountStrategy(ctx.mounter, {
      create: () => document.createElement('div'),
      destroy: () => {},
    });
    ctx.registerHandler(
      FAKE_ACTION_MOUNT_EXT,
      ActionHandler.fromFunction((_type, payload) =>
        this.strategy.mount(payload as ActionPayload)
      )
    );
    ctx.registerHandler(
      FAKE_ACTION_UNMOUNT_EXT,
      ActionHandler.fromFunction((_type, payload) =>
        this.strategy.unmount(payload as ActionPayload)
      )
    );
  }

  protected getMountStrategies() {
    return [this.strategy];
  }
}

class WidgetDomainFactory extends ExtensionDomainImplementationFactory {
  build(ctx: DomainContext): WidgetDomainImpl {
    return new WidgetDomainImpl(ctx);
  }
}

async function mountThroughRegistry(
  registry: DefaultMfeRegistry,
  extensionId: string
): Promise<void> {
  registry.registerDomain(makeDomain(), new WidgetDomainFactory());
  await registry.registerExtension(makeExtension(extensionId));

  const mounter = registry.getMounter(DOMAIN_ID);
  mounter.attach(document.createElement('div'));
  await mounter.mount(extensionId, document.createElement('div'));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('non-GTS consumer: an entry naming its manifest by id loads through the registry', () => {
  // inst-manifest-by-id
  it('resolves the manifest from the registry-supplied plugin for a handler that was constructed without one', async () => {
    const plugin = createNonGtsPlugin();
    const getSchemaSpy = vi.spyOn(plugin, 'getSchema');
    // Construction mirrors the templates exactly: an entry base type id and
    // nothing else. Everything the handler needs beyond that arrives when the
    // registry registers it.
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const registry = new DefaultMfeRegistry({ typeSystem: plugin, mfeHandlers: [handler] });

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('network error for test'));

    await expect(
      mountThroughRegistry(registry, 'cti.example.extension~manifest-by-id.v1')
    ).rejects.toThrow();

    expect(getSchemaSpy).toHaveBeenCalledWith(MANIFEST_ID);
    expect(fetchSpy).toHaveBeenCalledWith(`${PUBLIC_PATH}assets/lifecycle.js`);
  });

  // inst-manifest-unresolved-raise
  it('fails the load naming the manifest id when the plugin holds no manifest under it', async () => {
    const plugin = createNonGtsPlugin();
    // The entry stays resolvable — only the manifest it names is absent, so
    // the load reaches manifest resolution and refuses there.
    const originalGetSchema = plugin.getSchema.bind(plugin);
    vi.spyOn(plugin, 'getSchema').mockImplementation((typeId: string) =>
      typeId === MANIFEST_ID ? undefined : originalGetSchema(typeId)
    );
    const handler = new MfeHandlerMF(ENTRY_BASE_ID, { retries: 0 });
    const registry = new DefaultMfeRegistry({ typeSystem: plugin, mfeHandlers: [handler] });

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(
      mountThroughRegistry(registry, 'cti.example.extension~manifest-missing.v1')
    ).rejects.toThrow(MANIFEST_ID);

    // Refusal precedes every network access the manifest would have addressed.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
