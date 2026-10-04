/**
 * `unregisterExtension` of a MOUNTED extension
 * (`cpt-frontx-state-mfe-registry-entry-lifecycle:p2:inst-state-el-09`).
 *
 * The instruction requires that unregistering a mounted extension first
 * unmounts it exactly as an ordinary unmount unmounts it — including
 * destroying its container once, through the container hooks of the mount
 * strategy that created it — and only once that unmount has settled does
 * the `destroyed` lifecycle stage fire; the extension is removed after
 * that.
 *
 * The extension under test is mounted through a REAL `ConcurrentMountStrategy`
 * dispatched via `registry.executeActionsChain` (the same route the
 * `mount_ext` action takes in production), never via `mounter.mount()`
 * directly — a direct `mounter.mount()` call bypasses the strategy and
 * never calls `ExtensionReleaserProvider.for(mounter).registerDestroy(...)`,
 * so it could never observe the container-destroy this suite pins.
 *
 * Every recorded event is pushed into one shared, ordered log — the
 * lifecycle's own `unmount`, the strategy's container `destroy`, and the
 * `destroyed` stage probe — so completion order is observed directly
 * rather than inferred from call counts. No `setTimeout`, no polling: the
 * one asynchronous edge in this suite (waiting for the mount to actually
 * finish) is observed via a probe action chained with `next`, exactly as
 * `mount-ext-prologue-integration.test.ts` does.
 */
import { describe, it, expect } from 'vitest';
import { DefaultMfeRegistry } from '../DefaultMfeRegistry';
import type { TypeSystemPlugin } from '../../type-substrate';
import type { ActionsChain, Extension, ExtensionDomain, MfeEntry } from '../../types';
import { MfeHandler, type MfeEntryLifecycle } from '../../handler/MfeHandler';
import type { ChildMfeBridge } from '../../handler/ChildMfeBridge';
import { MfeBridgeFactoryDefault } from '../../bridge/MfeBridgeFactoryDefault';
import { ExtensionDomainImplementation } from '../ExtensionDomainImplementation';
import { ExtensionDomainImplementationFactory } from '../ExtensionDomainImplementationFactory';
import type { DomainContext } from '../DomainContext';
import { ConcurrentMountStrategy } from '../ConcurrentMountStrategy';
import type { ContainerHooks } from '../MountStrategy';
import { ActionHandler } from '../../mediator/ActionHandler';
import type { DefaultActionsChainsMediator } from '../../mediator/DefaultActionsChainsMediator';

const ACTION_LOAD_EXT = 'cti.example.action~load_ext.v1~';
const ACTION_MOUNT_EXT = 'cti.example.action~mount_ext.v1~';
const ACTION_UNMOUNT_EXT = 'cti.example.action~unmount_ext.v1~';
const STAGE_INIT = 'cti.example.lifecycle.stage~init';
const STAGE_DESTROYED = 'cti.example.lifecycle.stage~destroyed';
const ACTION_DESTROYED_PROBE = 'cti.example.action~destroyed_probe.v1~';

const ENTRY_BASE_ID = 'cti.example.entry~';
const ENTRY_ID = `${ENTRY_BASE_ID}widget.v1`;
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
    register() { /* accept everything */ },
    isTypeOf(typeId, baseTypeId) { return typeId === baseTypeId || typeId.startsWith(baseTypeId); },
    validateInstance() { return { valid: true, errors: [] }; },
    resolveLoadExtActionId: () => ACTION_LOAD_EXT,
    resolveMountExtActionId: () => ACTION_MOUNT_EXT,
    resolveUnmountExtActionId: () => ACTION_UNMOUNT_EXT,
    resolveLifecycleStageInitId: () => STAGE_INIT,
    resolveLifecycleStageActivatedId: () => 'cti.example.lifecycle.stage~activated',
    resolveLifecycleStageDeactivatedId: () => 'cti.example.lifecycle.stage~deactivated',
    resolveLifecycleStageDestroyedId: () => STAGE_DESTROYED,
  };
}

function registerEntrySchema(plugin: TypeSystemPlugin<MockSchema>): void {
  const entry: MfeEntry & MockSchema = {
    $id: ENTRY_ID,
    id: ENTRY_ID,
    requiredProperties: [],
    actions: [],
    domainActions: [],
  };
  plugin.registerSchema(entry as unknown as MockSchema);
}

function makeDomain(): ExtensionDomain {
  return {
    id: DOMAIN_ID,
    actions: [ACTION_LOAD_EXT, ACTION_MOUNT_EXT, ACTION_UNMOUNT_EXT, ACTION_DESTROYED_PROBE],
    extensionsActions: [],
    sharedProperties: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    lifecycle: [],
    extensionsLifecycleStages: [STAGE_DESTROYED],
  } as unknown as ExtensionDomain;
}

function makeExtension(): Extension {
  return {
    id: EXTENSION_ID,
    domain: DOMAIN_ID,
    entry: ENTRY_ID,
    lifecycle: [
      {
        stage: STAGE_DESTROYED,
        actions_chain: {
          action: { type: ACTION_DESTROYED_PROBE, target: DOMAIN_ID, payload: {} },
        } as ActionsChain,
      },
    ],
  } as Extension;
}

/**
 * Handler whose lifecycle's `mount`/`unmount` push into a shared, ordered
 * log — the lifecycle-level (not container-level) half of what a real
 * unmount does.
 */
class RecordingHandler extends MfeHandler {
  readonly bridgeFactory = new MfeBridgeFactoryDefault();
  constructor(private readonly log: string[]) {
    super(ENTRY_BASE_ID);
  }
  async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return {
      mount: () => { this.log.push('lifecycle-mount'); },
      unmount: () => { this.log.push('lifecycle-unmount'); },
    };
  }
}

/** Container hooks whose `destroy` pushes into the same shared, ordered log. */
class RecordingContainerHooks implements ContainerHooks {
  constructor(private readonly log: string[]) {}
  create(_extensionId: string): Element {
    return document.createElement('div');
  }
  destroy(_extensionId: string): void {
    this.log.push('container-destroy');
  }
}

class ConcurrentDomainImpl extends ExtensionDomainImplementation {
  readonly strategy: ConcurrentMountStrategy;
  constructor(ctx: DomainContext, hooks: ContainerHooks, log: string[]) {
    super();
    this.strategy = new ConcurrentMountStrategy(ctx.mounter, hooks);
    ctx.registerHandler(
      ACTION_MOUNT_EXT,
      ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as { subject: string }))
    );
    ctx.registerHandler(
      ACTION_UNMOUNT_EXT,
      ActionHandler.fromFunction((_t, p) => this.strategy.unmount!(p as { subject: string }))
    );
    ctx.registerHandler(
      ACTION_DESTROYED_PROBE,
      ActionHandler.fromFunction(async () => { log.push('destroyed-stage'); })
    );
  }
  protected getMountStrategies() {
    return [this.strategy];
  }
}

class ConcurrentDomainFactory extends ExtensionDomainImplementationFactory {
  readonly hooks: RecordingContainerHooks;
  strategy!: ConcurrentMountStrategy;
  constructor(private readonly log: string[]) {
    super();
    this.hooks = new RecordingContainerHooks(log);
  }
  build(ctx: DomainContext): ConcurrentDomainImpl {
    const impl = new ConcurrentDomainImpl(ctx, this.hooks, this.log);
    this.strategy = impl.strategy;
    return impl;
  }
}

/** Register a one-off domain-scoped probe action whose handler resolves the returned promise. */
function wireProbe(registry: DefaultMfeRegistry, domainId: string, actionType: string): Promise<void> {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  const mediator = (registry as unknown as { mediator: DefaultActionsChainsMediator }).mediator;
  mediator.registerHandler(domainId, actionType, ActionHandler.fromFunction(async () => { resolve(); }));
  return promise;
}

function freshRegistry(plugin: TypeSystemPlugin<MockSchema>, handler: MfeHandler): DefaultMfeRegistry {
  registerEntrySchema(plugin);
  return new DefaultMfeRegistry({ typeSystem: plugin, mfeHandlers: [handler] });
}

describe('unregisterExtension of a MOUNTED extension', () => {
  it('unmounts through the mount strategy — lifecycle unmount, then container destroy, then destroyed stage — exactly once, in that order', async () => {
    const log: string[] = [];
    const plugin = createPlugin();
    const registry = freshRegistry(plugin, new RecordingHandler(log));
    const factory = new ConcurrentDomainFactory(log);
    registry.registerDomain(makeDomain(), factory);
    await registry.registerExtension(makeExtension());

    const mounter = registry.getMounter(DOMAIN_ID);
    mounter.attach(document.createElement('div'));

    // Mount through the REAL strategy — the same route `mount_ext` takes in
    // production — so `ConcurrentMountStrategy.mount` runs and registers
    // its container destroy via `ExtensionReleaserProvider`. A direct
    // `mounter.mount()` call would bypass the strategy and register no
    // destroy at all.
    const mountNextFired = wireProbe(registry, DOMAIN_ID, 'mount-next-probe');
    registry.executeActionsChain({
      action: { type: ACTION_MOUNT_EXT, target: DOMAIN_ID, payload: { subject: EXTENSION_ID } },
      next: { action: { type: 'mount-next-probe', target: DOMAIN_ID, payload: {} } },
    });
    await mountNextFired;

    expect(registry.getMountedExtensions(DOMAIN_ID)).toContain(EXTENSION_ID);
    log.length = 0;

    await registry.unregisterExtension(EXTENSION_ID);

    expect(factory.hooks).toBeDefined();
    expect(log).toEqual(['lifecycle-unmount', 'container-destroy', 'destroyed-stage']);

    registry.dispose();
  });
});
