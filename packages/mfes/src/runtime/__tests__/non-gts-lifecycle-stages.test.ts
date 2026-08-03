/**
 * Non-GTS consumer lifecycle stage resolution (issue #505 umbrella proof).
 *
 * The runtime used to spell GTS literals for the four well-known lifecycle
 * stages (init/activated/deactivated/destroyed) in three runtime files. After
 * the fix, each stage fires through `typeSystem.resolveLifecycleStage*Id()`,
 * so a consumer that registers stages in its own notation is matched.
 *
 * This file exercises a fake plugin whose resolver methods return mock
 * notation that is deliberately NOT the GTS namespace - if any runtime path
 * still held a `gts.frontx.mfes.lifecycle.stage.v1~...` literal, the spy
 * would never be called and the assertion would fail.
 *
 * The init/destroyed pair is asserted through DefaultMfeRegistry's domain
 * lifecycle; the activated/deactivated pair is asserted through
 * DefaultMountManager in isolation, since driving the full mount pipeline
 * from the registry needs a working MFE handler fixture unrelated to the
 * stage-resolution question.
 */
import { describe, it, expect, vi } from 'vitest';
// @internal — colocated test, direct relative import is permitted.
import { DefaultMfeRegistry } from '../DefaultMfeRegistry';
import { DefaultMountManager } from '../default-mount-manager';
import type { MfeRegistryConfig } from '../config';
import type { TypeSystemPlugin } from '../../type-substrate';
import type { ExtensionDomain } from '../../types';
import { ExtensionDomainImplementation } from '../ExtensionDomainImplementation';
import { ExtensionDomainImplementationFactory } from '../ExtensionDomainImplementationFactory';
import type { DomainContext } from '../DomainContext';
import { ConcurrentMountStrategy } from '../mount-strategies';
import type { ContainerHooks, ActionPayload } from '../mount-strategy';
import { ActionHandler } from '../../mediator/types';

// Fake non-GTS notation for the four lifecycle stages. Deliberately NOT in
// the GTS namespace - if the runtime resolved any stage through a literal
// instead of the plugin, the resolver spies would not fire.
const FAKE_STAGE_INIT = 'cti.example.lifecycle.stage~init';
const FAKE_STAGE_ACTIVATED = 'cti.example.lifecycle.stage~activated';
const FAKE_STAGE_DEACTIVATED = 'cti.example.lifecycle.stage~deactivated';
const FAKE_STAGE_DESTROYED = 'cti.example.lifecycle.stage~destroyed';
const FAKE_ACTION_LOAD_EXT = 'cti.example.action~load_ext.v1~';
const FAKE_ACTION_MOUNT_EXT = 'cti.example.action~mount_ext.v1~';
const FAKE_ACTION_UNMOUNT_EXT = 'cti.example.action~unmount_ext.v1~';

function createNonGtsPlugin(): TypeSystemPlugin {
  return {
    name: 'NonGtsPlugin',
    version: '1.0.0',
    registerSchema(): void {},
    getSchema(): undefined {
      return undefined;
    },
    register(): void {},
    isTypeOf(typeId: string, baseTypeId: string): boolean {
      return typeId === baseTypeId || typeId.startsWith(baseTypeId);
    },
    validateInstance() {
      return { valid: true, errors: [] };
    },
    resolveLoadExtActionId(): string {
      return FAKE_ACTION_LOAD_EXT;
    },
    resolveMountExtActionId(): string {
      return FAKE_ACTION_MOUNT_EXT;
    },
    resolveUnmountExtActionId(): string {
      return FAKE_ACTION_UNMOUNT_EXT;
    },
    resolveLifecycleStageInitId(): string {
      return FAKE_STAGE_INIT;
    },
    resolveLifecycleStageActivatedId(): string {
      return FAKE_STAGE_ACTIVATED;
    },
    resolveLifecycleStageDeactivatedId(): string {
      return FAKE_STAGE_DEACTIVATED;
    },
    resolveLifecycleStageDestroyedId(): string {
      return FAKE_STAGE_DESTROYED;
    },
  };
}

// ─── Domain + factory fakes (real ExtensionDomainImplementation) ────────────

const DOMAIN_ID = 'cti.example.domain.concurrent.v1';

function makeDomain(): ExtensionDomain {
  return {
    id: DOMAIN_ID,
    actions: [FAKE_ACTION_LOAD_EXT, FAKE_ACTION_MOUNT_EXT, FAKE_ACTION_UNMOUNT_EXT],
    extensionsActions: [],
    sharedProperties: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
    extensionsTypeId: '',
  } as unknown as ExtensionDomain;
}

class TestHooks implements ContainerHooks {
  create(_extensionId: string): Element {
    return document.createElement('div');
  }
  destroy(_extensionId: string): void {}
}

class ConcurrentDomainImpl extends ExtensionDomainImplementation {
  private readonly strategy: ConcurrentMountStrategy;

  constructor(ctx: DomainContext) {
    super();
    const hooks = new TestHooks();
    this.strategy = new ConcurrentMountStrategy(ctx.mounter, hooks);
    ctx.registerHandler(
      FAKE_ACTION_MOUNT_EXT,
      ActionHandler.fromFunction(() => this.strategy.mount({ extensionId: 'stub' } as ActionPayload))
    );
    ctx.registerHandler(
      FAKE_ACTION_UNMOUNT_EXT,
      ActionHandler.fromFunction(() => this.strategy.unmount!({ extensionId: 'stub' } as ActionPayload))
    );
  }

  protected getMountStrategies() {
    return [this.strategy];
  }
}

class ConcurrentDomainFactory extends ExtensionDomainImplementationFactory {
  build(ctx: DomainContext): ConcurrentDomainImpl {
    return new ConcurrentDomainImpl(ctx);
  }
}

// ─── Domain lifecycle: init and destroyed stages ───────────────────────────

describe('non-GTS consumer: domain lifecycle resolves init/destroyed stages through the plugin', () => {
  it('fires init via plugin.resolveLifecycleStageInitId when a domain is registered', () => {
    const plugin = createNonGtsPlugin();
    const initSpy = vi.spyOn(plugin, 'resolveLifecycleStageInitId');
    const registry = new DefaultMfeRegistry({
      typeSystem: plugin,
    } as unknown as MfeRegistryConfig);

    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory());

    // Domain registration fires the init stage fire-and-forget. The call
    // into the resolver happens before registerDomain returns - the promise
    // is internal and only the post-trigger .catch is async.
    expect(initSpy).toHaveBeenCalledWith();
  });

  it('fires destroyed via plugin.resolveLifecycleStageDestroyedId when a domain is unregistered', async () => {
    const plugin = createNonGtsPlugin();
    const destroyedSpy = vi.spyOn(plugin, 'resolveLifecycleStageDestroyedId');
    const registry = new DefaultMfeRegistry({
      typeSystem: plugin,
    } as unknown as MfeRegistryConfig);

    registry.registerDomain(makeDomain(), new ConcurrentDomainFactory());
    await registry.unregisterDomain(DOMAIN_ID);

    expect(destroyedSpy).toHaveBeenCalledWith();
  });
});

// ─── MountManager: activated and deactivated stages ────────────────────────
//
// DefaultMountManager in isolation. The extensionManager and coordinator are
// stubbed to let mountExtension/unmountExtension reach the triggerLifecycle
// call without driving the full MFE load pipeline.

class StubExtensionManager {
  // Persists across calls so DefaultMountManager's mount/unmount mutations
  // (extensionState.mountState = 'mounted' / 'unmounted') survive between
  // the mount and unmount invocations of getExtensionState().
  private readonly state = {
    extension: { domain: 'cti.example.domain.v1' },
    entry: { id: 'cti.example.entry.v1', domainActions: [] },
    loadState: 'loaded',
    mountState: 'unmounted',
    lifecycle: { mount: async () => {}, unmount: async () => {} },
    bridge: null as null | { dispose(): void },
    container: null as null | Element,
    shadowRoot: undefined as undefined | ShadowRoot,
    error: undefined as unknown,
  };

  getExtensionState() {
    return this.state;
  }
  getDomainState() {
    return {
      domain: { id: 'cti.example.domain.v1' },
      implementation: {},
    };
  }
}

class StubCoordinator {
  get() {
    return undefined;
  }
  register() {}
  unregister() {}
}

class StubBridgeFactory {
  createBridge() {
    const bridge = {
      instanceId: 'stub',
      dispose() {},
      domainId: 'stub',
      executeActionsChain: async () => {},
      subscribeToProperty: () => () => {},
      getProperty: () => undefined,
      registerActionHandler: () => {},
    };
    return { parentBridge: bridge, childBridge: bridge };
  }
  disposeBridge() {}
}

function buildStubMountManagerConfig(plugin: TypeSystemPlugin, triggeredStages: string[]) {
  return {
    extensionManager: new StubExtensionManager(),
    resolveHandler: () => undefined,
    coordinator: new StubCoordinator(),
    typeSystem: plugin,
    triggerLifecycle: async (_extId: string, stageId: string) => {
      triggeredStages.push(stageId);
    },
    executeActionsChain: async () => {},
    hostRuntime: {},
    registerCatchAllActionHandler: () => {},
    unregisterCatchAllActionHandler: () => {},
    registerExtensionActionHandler: () => {},
    unregisterExtensionActionHandler: () => {},
    bridgeFactory: new StubBridgeFactory(),
  };
}

describe('non-GTS consumer: mount lifecycle resolves activated/deactivated stages through the plugin', () => {
  it('fires activated via plugin.resolveLifecycleStageActivatedId when an extension mounts', async () => {
    const plugin = createNonGtsPlugin();
    const activatedSpy = vi.spyOn(plugin, 'resolveLifecycleStageActivatedId');
    const triggeredStages: string[] = [];

    const manager = new DefaultMountManager(
      buildStubMountManagerConfig(plugin, triggeredStages) as never
    );

    await manager.mountExtension('cti.example.extension.v1', document.createElement('div'));

    expect(activatedSpy).toHaveBeenCalledWith();
    expect(triggeredStages).toContain(FAKE_STAGE_ACTIVATED);
  });

  it('fires deactivated via plugin.resolveLifecycleStageDeactivatedId when an extension unmounts', async () => {
    const plugin = createNonGtsPlugin();
    const deactivatedSpy = vi.spyOn(plugin, 'resolveLifecycleStageDeactivatedId');
    const triggeredStages: string[] = [];

    const manager = new DefaultMountManager(
      buildStubMountManagerConfig(plugin, triggeredStages) as never
    );

    // Mount first so the extension's state flips to 'mounted' for the
    // unmount path's early-return guard.
    await manager.mountExtension('cti.example.extension.v1', document.createElement('div'));
    triggeredStages.length = 0;
    await manager.unmountExtension('cti.example.extension.v1');

    expect(deactivatedSpy).toHaveBeenCalledWith();
    expect(triggeredStages).toContain(FAKE_STAGE_DEACTIVATED);
  });
});
