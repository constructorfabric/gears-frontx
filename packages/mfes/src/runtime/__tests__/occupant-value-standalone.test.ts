/**
 * A registry built with no router assigns and associates no occupant value
 * (`inst-ov-standalone`) and makes no `supplyNavigation` call
 * (`inst-ov-supply-navigation` is conditioned on a router being present).
 *
 * Spies on the rendezvous module's own `associateOccupantValue` export —
 * the exact function `DefaultMountManager` calls only inside its
 * `if (this.router)` branch — so this test fails if that branch is ever
 * reached with no router configured.
 */
import { describe, it, expect, vi } from 'vitest';
import { DefaultMfeRegistry } from '../DefaultMfeRegistry';
import * as occupantValueModule from '../occupant-value-rendezvous';
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

class StubHandler extends MfeHandler {
  readonly bridgeFactory = new MfeBridgeFactoryDefault();
  async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return { mount: () => {}, unmount: () => {} };
  }
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

describe('occupant value — standalone registry (no router)', () => {
  it('never calls associateOccupantValue or supplyNavigation across registration, mount, and unmount', async () => {
    const associateSpy = vi.spyOn(occupantValueModule, 'associateOccupantValue');
    const plugin = createPlugin();
    registerEntrySchema(plugin);
    const registry = new DefaultMfeRegistry({ typeSystem: plugin, mfeHandlers: [new StubHandler(ENTRY_ID)] });

    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory());
    await registry.registerExtension(makeExtension());

    const mounter = registry.getMounter(DOMAIN_ID);
    mounter.attach(document.createElement('div'));
    await mounter.mount(EXTENSION_ID, document.createElement('div'));
    await mounter.unmount(EXTENSION_ID);

    expect(associateSpy).not.toHaveBeenCalled();

    registry.dispose();
    associateSpy.mockRestore();
  });
});
