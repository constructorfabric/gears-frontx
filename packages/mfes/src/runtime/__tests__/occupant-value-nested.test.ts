/**
 * Occupant-value propagation across nesting and failure handling
 * (`cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous`
 * `inst-ov-assign-failure`, `inst-ov-release-with-bridge`,
 * `inst-ov-supply-navigation`, `inst-ov-enclosing-value`).
 */
import { describe, it, expect, vi } from 'vitest';
import { DefaultMfeRegistry } from '../DefaultMfeRegistry';
import { readOccupantValue } from '../occupant-value-rendezvous';
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
import type { RouterPort } from '../../router/RouterPort';

const ACTION_LOAD_EXT = 'cti.example.action~load_ext.v1~';
const ACTION_MOUNT_EXT = 'cti.example.action~mount_ext.v1~';
const ACTION_UNMOUNT_EXT = 'cti.example.action~unmount_ext.v1~';
const STAGE_INIT = 'cti.example.lifecycle.stage~init';
const STAGE_ACTIVATED = 'cti.example.lifecycle.stage~activated';
const STAGE_DEACTIVATED = 'cti.example.lifecycle.stage~deactivated';
const STAGE_DESTROYED = 'cti.example.lifecycle.stage~destroyed';

const ENTRY_ID = 'cti.example.entry~widget.v1';
const EXTENSION_ID = 'cti.example.extension~widget.v1';
const DOMAIN_ID = 'cti.example.domain.concurrent.v1';

interface MockSchema { $id?: string }

function createPlugin(): TypeSystemPlugin<MockSchema> {
  const schemas = new Map<string, MockSchema>();
  return {
    name: 'MockPlugin',
    version: '1.0.0',
    registerSchema(schema) { if (schema.$id) schemas.set(schema.$id, schema); },
    getSchema(typeId) { return schemas.get(typeId); },
    register() {},
    isTypeOf(typeId, baseTypeId) { return typeId === baseTypeId || typeId.startsWith(baseTypeId); },
    validateInstance() { return { valid: true, errors: [] }; },
    resolveLoadExtActionId: () => ACTION_LOAD_EXT,
    resolveMountExtActionId: () => ACTION_MOUNT_EXT,
    resolveUnmountExtActionId: () => ACTION_UNMOUNT_EXT,
    resolveLifecycleStageInitId: () => STAGE_INIT,
    resolveLifecycleStageActivatedId: () => STAGE_ACTIVATED,
    resolveLifecycleStageDeactivatedId: () => STAGE_DEACTIVATED,
    resolveLifecycleStageDestroyedId: () => STAGE_DESTROYED,
  };
}

function registerEntrySchema(plugin: TypeSystemPlugin<MockSchema>): void {
  const entry: MfeEntry & MockSchema = {
    $id: ENTRY_ID, id: ENTRY_ID, requiredProperties: [], actions: [], domainActions: [],
  };
  plugin.registerSchema(entry as unknown as MockSchema);
}

function makeDomain(): ExtensionDomain {
  return {
    id: DOMAIN_ID,
    actions: [ACTION_LOAD_EXT, ACTION_MOUNT_EXT, ACTION_UNMOUNT_EXT],
    extensionsActions: [], sharedProperties: [], defaultActionTimeout: 5000,
    lifecycleStages: [], extensionsLifecycleStages: [],
  } as unknown as ExtensionDomain;
}

function makeExtension(): Extension {
  return { id: EXTENSION_ID, domain: DOMAIN_ID, entry: ENTRY_ID } as Extension;
}

class ConcurrentDomainImpl extends ExtensionDomainImplementation {
  readonly strategy: ConcurrentMountStrategy;
  constructor(ctx: DomainContext, hooks: ContainerHooks) {
    super();
    this.strategy = new ConcurrentMountStrategy(ctx.mounter, hooks);
    ctx.registerHandler(ACTION_MOUNT_EXT, ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as { subject: string })));
    ctx.registerHandler(ACTION_UNMOUNT_EXT, ActionHandler.fromFunction((_t, p) => this.strategy.unmount!(p as { subject: string })));
  }
  protected getMountStrategies() { return [this.strategy]; }
}

class ConcurrentDomainFactory extends ExtensionDomainImplementationFactory {
  readonly hooks: ContainerHooks = { create: () => document.createElement('div'), destroy: () => {} };
  build(ctx: DomainContext): ConcurrentDomainImpl {
    return new ConcurrentDomainImpl(ctx, this.hooks);
  }
}

function fakeRouter(overrides: Partial<RouterPort> = {}): RouterPort {
  return {
    registerDomain: () => {},
    registerExtension: () => {},
    releaseDomain: () => {},
    releaseExtension: () => {},
    assignOccupantValue: () => undefined,
    reportSettled: () => {},
    supplyNavigation: () => {},
    ...overrides,
  };
}

describe('occupant value — failure, release, and nested supplyNavigation', () => {
  it('a throwing assignOccupantValue fails the mount before lifecycle.mount runs, and the mount is handled as any other failed mount', async () => {
    let lifecycleMountCalls = 0;
    class RecordingHandler extends MfeHandler {
      readonly bridgeFactory = new MfeBridgeFactoryDefault();
      async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
        return {
          mount: () => { lifecycleMountCalls += 1; },
          unmount: () => {},
        };
      }
    }
    const router = fakeRouter({
      assignOccupantValue: () => { throw new Error('router refuses to assign'); },
    });

    const plugin = createPlugin();
    registerEntrySchema(plugin);
    const registry = new DefaultMfeRegistry({
      typeSystem: plugin,
      mfeHandlers: [new RecordingHandler(ENTRY_ID)],
      router,
    });
    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory());
    await registry.registerExtension(makeExtension());

    const mounter = registry.getMounter(DOMAIN_ID);
    mounter.attach(document.createElement('div'));

    await expect(mounter.mount(EXTENSION_ID, document.createElement('div'))).rejects.toThrow(
      'router refuses to assign'
    );

    expect(lifecycleMountCalls).toBe(0);
    expect(registry.getMountedExtensions(DOMAIN_ID)).not.toContain(EXTENSION_ID);

    registry.dispose();
  });

  it('the occupant-value association is released when the extension is permanently unregistered', async () => {
    const assignedValue = { marker: 'released-on-unregister' };
    let capturedBridge: ChildMfeBridge | undefined;
    class CapturingHandler extends MfeHandler {
      readonly bridgeFactory = new MfeBridgeFactoryDefault();
      async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
        return {
          mount: (_c, bridge) => { capturedBridge = bridge; },
          unmount: () => {},
        };
      }
    }
    const router = fakeRouter({ assignOccupantValue: () => assignedValue });

    const plugin = createPlugin();
    registerEntrySchema(plugin);
    const registry = new DefaultMfeRegistry({
      typeSystem: plugin,
      mfeHandlers: [new CapturingHandler(ENTRY_ID)],
      router,
    });
    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory());
    await registry.registerExtension(makeExtension());
    const mounter = registry.getMounter(DOMAIN_ID);
    mounter.attach(document.createElement('div'));
    await mounter.mount(EXTENSION_ID, document.createElement('div'));

    expect(readOccupantValue(capturedBridge)).toBe(assignedValue);

    await registry.unregisterExtension(EXTENSION_ID);

    expect(readOccupantValue(capturedBridge)).toBeUndefined();

    registry.dispose();
  });

  it('a registry built with a router that adopts an inbound bridge calls supplyNavigation once, with a reader returning the current occupant value', async () => {
    const parentAssignedValue = 'parent-assigned-value';
    const nestedSupplyNavigation = vi.fn();
    let nestedRegistry: DefaultMfeRegistry | undefined;

    class HostExtensionHandler extends MfeHandler {
      readonly bridgeFactory = new MfeBridgeFactoryDefault();
      async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
        return {
          // Constructs a NESTED registry synchronously inside `mount`, the
          // exact window the ambient inbound-bridge rendezvous scopes to —
          // this nested registry automatically adopts the host extension's
          // own child bridge as its inbound bridge.
          mount: () => {
            const nestedPlugin = createPlugin();
            nestedRegistry = new DefaultMfeRegistry({
              typeSystem: nestedPlugin,
              router: fakeRouter({ supplyNavigation: nestedSupplyNavigation }),
            });
          },
          unmount: () => {},
        };
      }
    }

    const router = fakeRouter({ assignOccupantValue: () => parentAssignedValue });
    const plugin = createPlugin();
    registerEntrySchema(plugin);
    const registry = new DefaultMfeRegistry({
      typeSystem: plugin,
      mfeHandlers: [new HostExtensionHandler(ENTRY_ID)],
      router,
    });
    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory());
    await registry.registerExtension(makeExtension());
    const mounter = registry.getMounter(DOMAIN_ID);
    mounter.attach(document.createElement('div'));
    await mounter.mount(EXTENSION_ID, document.createElement('div'));

    expect(nestedSupplyNavigation).toHaveBeenCalledTimes(1);
    const reader = nestedSupplyNavigation.mock.calls[0][0] as () => unknown;
    expect(reader()).toBe(parentAssignedValue);

    nestedRegistry?.dispose();
    registry.dispose();
  });
});
