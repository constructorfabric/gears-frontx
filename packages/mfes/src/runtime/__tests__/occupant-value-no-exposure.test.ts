/**
 * Occupant-value non-exposure (AC6.1,
 * `cpt-frontx-dod-mfe-host-communication-occupant-value-not-exposed`).
 *
 * A router test double's `assignOccupantValue` returns a unique sentinel
 * object kept only in a closure (never assigned to any property anywhere).
 * After a real mount through `DefaultMfeRegistry`, this test recursively
 * walks every own+inherited, string+symbol-keyed, enumerable-or-not property
 * reachable from the registry, the child bridge handed to `mount`, the
 * mount context, and the lifecycle `mount`/`unmount` arguments, and asserts
 * the sentinel appears nowhere — then confirms the sentinel IS reachable
 * through the internal rendezvous accessor keyed by that exact child bridge.
 */
import { describe, it, expect, vi } from 'vitest';
import { DefaultMfeRegistry } from '../DefaultMfeRegistry';
import { readOccupantValue } from '../occupant-value-rendezvous';
import type { TypeSystemPlugin } from '../../type-substrate';
import type { Extension, ExtensionDomain, MfeEntry } from '../../types';
import { MfeHandler, type MfeEntryLifecycle, type MfeMountContext } from '../../handler/MfeHandler';
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
  readonly hooks: ContainerHooks = {
    create: () => document.createElement('div'),
    destroy: () => {},
  };
  build(ctx: DomainContext): ConcurrentDomainImpl {
    return new ConcurrentDomainImpl(ctx, this.hooks);
  }
}

/**
 * Recursively collects every value reachable from `root` through own and
 * inherited, string- and symbol-keyed, enumerable-or-not properties of
 * plain objects and arrays — bounded against cycles via a `seen` set, and
 * against unrelated native/DOM depth via a max-depth guard (the sentinel
 * check only cares about structures this package's own code could place a
 * value into).
 */
function collectReachable(root: unknown, seen = new Set<unknown>(), depth = 0): unknown[] {
  const found: unknown[] = [];
  if (root === null || (typeof root !== 'object' && typeof root !== 'function')) {
    return found;
  }
  if (seen.has(root) || depth > 6) {
    return found;
  }
  seen.add(root);
  found.push(root);

  let proto: object | null = root as object;
  while (proto && proto !== Object.prototype && proto !== Function.prototype) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === 'constructor') continue;
      let value: unknown;
      try {
        value = (root as Record<string, unknown>)[key];
      } catch {
        continue;
      }
      if (typeof value === 'function') continue; // methods, not data
      found.push(...collectReachable(value, seen, depth + 1));
    }
    for (const sym of Object.getOwnPropertySymbols(proto)) {
      let value: unknown;
      try {
        value = (root as Record<symbol, unknown>)[sym];
      } catch {
        continue;
      }
      found.push(...collectReachable(value, seen, depth + 1));
    }
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  return found;
}

describe('occupant value — no exposure on any interface', () => {
  it('a sentinel assigned by the router is reachable only through the internal rendezvous accessor, never through any surface handed to extension or host code', async () => {
    const sentinel = { marker: 'occupant-value-sentinel' };
    const capturedArgs: { container?: unknown; bridge?: ChildMfeBridge; mountContext?: MfeMountContext } = {};

    class CapturingHandler extends MfeHandler {
      readonly bridgeFactory = new MfeBridgeFactoryDefault();
      async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
        return {
          mount: (container, bridge, mountContext) => {
            capturedArgs.container = container;
            capturedArgs.bridge = bridge;
            capturedArgs.mountContext = mountContext;
          },
          unmount: () => {},
        };
      }
    }

    const assignOccupantValue = vi.fn(() => sentinel);
    const router: RouterPort = {
      registerDomain: () => {},
      registerExtension: () => {},
      releaseDomain: () => {},
      releaseExtension: () => {},
      assignOccupantValue,
      reportSettled: () => {},
      supplyNavigation: () => {},
    };

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

    expect(capturedArgs.bridge).toBeDefined();
    // Called with the registered domain, the registered extension, and the
    // enclosing value — `undefined` for this root registry, which holds no
    // inbound bridge.
    expect(assignOccupantValue).toHaveBeenCalledWith({
      domain: expect.objectContaining({ id: DOMAIN_ID }),
      extension: expect.objectContaining({ id: EXTENSION_ID }),
      enclosingValue: undefined,
    });

    // Walk every reachable surface the runtime handed to extension/host code.
    const surfaces: unknown[] = [
      registry,
      capturedArgs.bridge,
      capturedArgs.mountContext,
      capturedArgs.container,
      registry.getParentBridge(EXTENSION_ID),
    ];

    const allReachable = surfaces.flatMap((s) => collectReachable(s));
    expect(allReachable).not.toContain(sentinel);

    // The sentinel IS reachable through the internal accessor keyed by the
    // exact child bridge the extension received.
    expect(readOccupantValue(capturedArgs.bridge)).toBe(sentinel);

    registry.dispose();
  });
});
