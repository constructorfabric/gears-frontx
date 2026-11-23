/**
 * A rejected registration or a failed load disables only its own extension.
 *
 * The type system rejects one extension at registration, and one entry's
 * handler fails its load; in both cases the registry, the other registered
 * extensions and domain, and a concurrent load of another extension keep
 * working.
 */
import { describe, expect, it } from 'vitest';
import { DefaultMfeRegistry } from '../DefaultMfeRegistry';
import type { TypeSystemPlugin } from '../../type-substrate';
import type { Extension, ExtensionDomain, MfeEntry } from '../../types';
import { MfeHandler, type MfeEntryLifecycle } from '../../handler/MfeHandler';
import type { ChildMfeBridge } from '../../handler/ChildMfeBridge';
import { MfeBridgeFactoryDefault } from '../../bridge/MfeBridgeFactoryDefault';
import { ExtensionDomainImplementation } from '../ExtensionDomainImplementation';
import { ExtensionDomainImplementationFactory } from '../ExtensionDomainImplementationFactory';
import type { DomainContext } from '../DomainContext';
import { ConcurrentMountStrategy } from '../ConcurrentMountStrategy';
import type { ContainerHooks } from '../MountStrategy';
import { ActionHandler } from '../../mediator/ActionHandler';
import { mountedIn } from './helpers/mounted-in';
import { extensionStateOf } from './helpers/extension-state';

const ACTION_LOAD_EXT = 'cti.example.action~load_ext.v1~';
const ACTION_MOUNT_EXT = 'cti.example.action~mount_ext.v1~';
const ACTION_UNMOUNT_EXT = 'cti.example.action~unmount_ext.v1~';
const STAGE = 'cti.example.lifecycle.stage~';
const ENTRY_GOOD = 'cti.example.entry~good.v1';
const ENTRY_BAD = 'cti.example.entry~bad.v1';
const ENTRY_NO_HANDLER = 'cti.other.entry~nohandler.v1';
const ENTRY_NEEDS_PROPERTY = 'cti.example.entry~needs.v1';
const DOMAIN_ID = 'cti.example.domain.concurrent.v1';

interface MockSchema {
  $id?: string;
  id?: string;
  requiredProperties?: string[];
  actions?: string[];
  domainActions?: string[];
}

function createPlugin(rejects: ReadonlySet<string>): TypeSystemPlugin<MockSchema> {
  const schemas = new Map<string, MockSchema>();
  return {
    name: 'MockPlugin',
    version: '1.0.0',
    registerSchema(schema) { if (schema.$id) schemas.set(schema.$id, schema); },
    getSchema(typeId) { return schemas.get(typeId); },
    register(entity) {
      const id = (entity as { id?: string }).id;
      if (id !== undefined && rejects.has(id)) throw new Error(`rejected ${id}`);
    },
    isTypeOf(typeId, baseTypeId) { return typeId === baseTypeId || typeId.startsWith(baseTypeId); },
    validateInstance() { return { valid: true, errors: [] }; },
    resolveLoadExtActionId: () => ACTION_LOAD_EXT,
    resolveMountExtActionId: () => ACTION_MOUNT_EXT,
    resolveUnmountExtActionId: () => ACTION_UNMOUNT_EXT,
    resolveLifecycleStageInitId: () => `${STAGE}init`,
    resolveLifecycleStageActivatedId: () => `${STAGE}activated`,
    resolveLifecycleStageDeactivatedId: () => `${STAGE}deactivated`,
    resolveLifecycleStageDestroyedId: () => `${STAGE}destroyed`,
  };
}

const domain = (): ExtensionDomain => ({
  id: DOMAIN_ID,
  actions: [ACTION_LOAD_EXT, ACTION_MOUNT_EXT, ACTION_UNMOUNT_EXT],
  extensionsActions: [],
  sharedProperties: [],
  defaultActionTimeout: 5000,
  lifecycleStages: [],
  extensionsLifecycleStages: [],
});

const extension = (id: string, entry: string): Extension => ({ id, domain: DOMAIN_ID, entry }) as Extension;

/** Loads every entry but `ENTRY_BAD`, whose load rejects. */
class SelectiveHandler extends MfeHandler {
  readonly bridgeFactory = new MfeBridgeFactoryDefault();
  constructor() { super('cti.example.entry~'); }
  async load(entry: MfeEntry): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    if (entry.id === ENTRY_BAD) throw new Error('load of the bad entry fails');
    return { mount: () => {}, unmount: () => {} };
  }
}

class Hooks implements ContainerHooks {
  create(): Element { return document.createElement('div'); }
  destroy(): void {}
}

class Impl extends ExtensionDomainImplementation {
  readonly strategy: ConcurrentMountStrategy;
  constructor(ctx: DomainContext) {
    super();
    this.strategy = new ConcurrentMountStrategy(ctx.mounter, new Hooks());
    ctx.registerHandler(ACTION_MOUNT_EXT, ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as { subject: string })));
    ctx.registerHandler(ACTION_UNMOUNT_EXT, ActionHandler.fromFunction((_t, p) => this.strategy.unmount!(p as { subject: string })));
  }
  protected getMountStrategies() { return [this.strategy]; }
}

class Factory extends ExtensionDomainImplementationFactory {
  build(ctx: DomainContext): Impl { return new Impl(ctx); }
}

function setup(rejects: string[] = []) {
  const plugin = createPlugin(new Set(rejects));
  for (const id of [ENTRY_GOOD, ENTRY_BAD, ENTRY_NO_HANDLER]) {
    plugin.registerSchema({ $id: id, id, requiredProperties: [], actions: [], domainActions: [] });
  }
  // Requires a shared property the domain does not offer: contract matching refuses it.
  plugin.registerSchema({
    $id: ENTRY_NEEDS_PROPERTY,
    id: ENTRY_NEEDS_PROPERTY,
    requiredProperties: ['cti.example.property~missing.v1'],
    actions: [],
    domainActions: [],
  });
  const registry = new DefaultMfeRegistry({ typeSystem: plugin, mfeHandlers: [new SelectiveHandler()] });
  registry.registerDomain(domain(), new Factory());
  const mounter = registry.getMounter(DOMAIN_ID);
  mounter.attach(document.createElement('div'));
  return { registry, mounter };
}

describe('a rejected registration disables only its own extension', () => {
  it('leaves the registry, the other extensions and later registrations working', async () => {
    const { registry, mounter } = setup(['ext.rejected']);
    await registry.registerExtension(extension('ext.first', ENTRY_GOOD));

    await expect(registry.registerExtension(extension('ext.rejected', ENTRY_GOOD))).rejects.toThrow('rejected ext.rejected');
    expect(registry.getExtension('ext.rejected')).toBeUndefined();

    await mounter.mount('ext.first', document.createElement('div'));
    await registry.registerExtension(extension('ext.later', ENTRY_GOOD));
    await mounter.mount('ext.later', document.createElement('div'));
    expect(mountedIn(registry, DOMAIN_ID)).toEqual(['ext.first', 'ext.later']);

    await mounter.unmount('ext.first');
    expect(mountedIn(registry, DOMAIN_ID)).toEqual(['ext.later']);
    await registry.dispose();
  });
});

describe.each([
  ['handler resolution', ENTRY_NO_HANDLER, /./],
  ['contract matching', ENTRY_NEEDS_PROPERTY, /Contract validation failed/],
])('a registration rejected by %s disables only its own extension', (_cause, entry, message) => {
  it('stores nothing of it and leaves the registry, the other extensions and later registrations working', async () => {
    const { registry, mounter } = setup();
    await registry.registerExtension(extension('ext.first', ENTRY_GOOD));

    await expect(registry.registerExtension(extension('ext.refused', entry))).rejects.toThrow(message);
    expect(registry.getExtension('ext.refused')).toBeUndefined();
    expect(registry.getExtensionsForDomain(DOMAIN_ID).map((e) => e.id)).toEqual(['ext.first']);

    await mounter.mount('ext.first', document.createElement('div'));
    await registry.registerExtension(extension('ext.later', ENTRY_GOOD));
    await mounter.mount('ext.later', document.createElement('div'));
    expect(mountedIn(registry, DOMAIN_ID)).toEqual(['ext.first', 'ext.later']);
    await registry.dispose();
  });
});

describe('a failed load disables only its own extension', () => {
  it('fails that mount and leaves another extension loading at the same time, and the registry, working', async () => {
    const { registry, mounter } = setup();
    await registry.registerExtension(extension('ext.bad', ENTRY_BAD));
    await registry.registerExtension(extension('ext.good', ENTRY_GOOD));

    const [bad, good] = await Promise.allSettled([
      mounter.mount('ext.bad', document.createElement('div')),
      mounter.mount('ext.good', document.createElement('div')),
    ]);

    expect(bad.status).toBe('rejected');
    const stateOf = (id: string) => extensionStateOf(registry, id)?.loadState;
    expect(stateOf('ext.bad')).toBe('error');
    expect(stateOf('ext.good')).toBe('loaded');
    expect(good.status).toBe('fulfilled');
    expect(mountedIn(registry, DOMAIN_ID)).toEqual(['ext.good']);
    await registry.registerExtension(extension('ext.after', ENTRY_GOOD));
    await mounter.mount('ext.after', document.createElement('div'));
    expect(mountedIn(registry, DOMAIN_ID)).toEqual(['ext.good', 'ext.after']);
    await registry.dispose();
  });
});

describe('the entry state machine over loadState and mountState', () => {
  /** A handler whose load is held until released and fails while `failing` is set. */
  class ControlledHandler extends MfeHandler {
    readonly bridgeFactory = new MfeBridgeFactoryDefault();
    failing = true;
    loads = 0;
    release: (() => void) | undefined;
    constructor() { super('cti.example.entry~'); }
    async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
      this.loads += 1;
      await new Promise<void>((resolve) => { this.release = resolve; });
      if (this.failing) throw new Error('load fails');
      return { mount: () => {}, unmount: () => {} };
    }
  }

  it('moves idle to loading to error and back to loading on a later request that issues its load afresh, then loaded, mounted, unmounted, and removed on unregistration', async () => {
    const plugin = createPlugin(new Set());
    plugin.registerSchema({ $id: ENTRY_GOOD, id: ENTRY_GOOD, requiredProperties: [], actions: [], domainActions: [] });
    const handler = new ControlledHandler();
    const registry = new DefaultMfeRegistry({ typeSystem: plugin, mfeHandlers: [handler] });
    registry.registerDomain(domain(), new Factory());
    const mounter = registry.getMounter(DOMAIN_ID);
    mounter.attach(document.createElement('div'));
    const state = (id: string) => extensionStateOf(registry, id);
    const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

    await registry.registerExtension(extension('ext.cycle', ENTRY_GOOD));
    expect(state('ext.cycle')?.loadState).toBe('idle');

    // idle -> loading, and it stays loading while the attempt runs.
    const first = mounter.mount('ext.cycle', document.createElement('div')).catch((e: unknown) => e);
    await turn();
    expect(state('ext.cycle')?.loadState).toBe('loading');
    handler.release!();
    expect(await first).toBeInstanceOf(Error);
    // loading -> error; the extension stays registered with the error recorded.
    expect(state('ext.cycle')?.loadState).toBe('error');
    expect(registry.getExtension('ext.cycle')).toBeDefined();

    // error -> loading: the later request issues its load afresh.
    handler.failing = false;
    const second = mounter.mount('ext.cycle', document.createElement('div'));
    await turn();
    expect(state('ext.cycle')?.loadState).toBe('loading');
    expect(handler.loads).toBe(2);
    handler.release!();
    await second;
    expect(state('ext.cycle')?.loadState).toBe('loaded');
    expect(state('ext.cycle')?.mountState).toBe('mounted');
    expect(mountedIn(registry, DOMAIN_ID)).toEqual(['ext.cycle']);

    await mounter.unmount('ext.cycle');
    expect(state('ext.cycle')?.mountState).toBe('unmounted');
    expect(registry.getExtension('ext.cycle')).toBeDefined();

    await registry.unregisterExtension('ext.cycle');
    expect(registry.getExtension('ext.cycle')).toBeUndefined();
    await registry.dispose();
  });
});
