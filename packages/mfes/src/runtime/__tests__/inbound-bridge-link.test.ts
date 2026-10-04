/**
 * Direct coverage of the mount-context rendezvous diagnostics
 * (`inst-registry-is-root`, `inst-no-ambient-bridge`) — the two logged
 * cases `cpt-frontx-adr-action-dispatch-and-chaining`'s Confirmation
 * section names for a registry that cannot adopt an inbound bridge
 * (AC5.12): a mount synchronously in progress whose bridge carries no
 * link at all, and a rendezvous entry tagged with an unrecognized
 * protocol version. Exercised directly against the rendezvous functions
 * rather than through a full mount, since both are narrow, internal
 * conditions of `adoptAmbientInboundBridgeLink` itself.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  pushAmbientMountingBridge,
  popAmbientMountingBridge,
  adoptAmbientInboundBridgeLink,
  registerInboundBridgeLink,
  type InboundBridgeLink,
} from '../inbound-bridge-link';
import type { ChildMfeBridge } from '../../handler/ChildMfeBridge';
import { DefaultMfeRegistry } from '../DefaultMfeRegistry';
import type { TypeSystemPlugin } from '../../type-substrate';
import type { RouterPort } from '../../router/RouterPort';
import type { ExtensionDomain } from '../../types';
import type { DomainContext } from '../DomainContext';
import { ConcurrentMountStrategy } from '../ConcurrentMountStrategy';
import type { ActionPayload } from '../MountStrategy';
import { ActionHandler } from '../../mediator/ActionHandler';
import { ExtensionDomainImplementation } from '../ExtensionDomainImplementation';
import { ExtensionDomainImplementationFactory } from '../ExtensionDomainImplementationFactory';

/** An opaque stand-in bridge — the rendezvous never inspects its shape. */
function makeStubBridge(): ChildMfeBridge {
  return {} as ChildMfeBridge;
}

describe('mount-context rendezvous — diagnostics for a registry that adopts no inbound bridge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Drain any entry a failed assertion left on the rendezvous stack, so
    // one test's leftover state can never leak into the next.
    popAmbientMountingBridge();
  });

  it(
    'a mount synchronously in progress whose bridge carries NO link at all logs a diagnostic and ' +
      'the constructed registry behaves as a root (AC5.12)',
    () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const bridge = makeStubBridge();

      pushAmbientMountingBridge(bridge);
      try {
        // No `registerInboundBridgeLink` call for this bridge: the parent
        // never minted a link for it.
        const adopted = adoptAmbientInboundBridgeLink(() => {});
        expect(adopted).toBeUndefined();
      } finally {
        popAmbientMountingBridge();
      }

      expect(debugSpy).toHaveBeenCalled();
      const logged = debugSpy.mock.calls.some((call: unknown[]) =>
        call.some((arg: unknown) => String(arg).includes('no inbound-bridge'))
      );
      expect(logged).toBe(true);
    }
  );

  it(
    'a rendezvous entry tagged with an unrecognized protocol version logs a diagnostic, not a ' +
      'misattribution, and the constructed registry behaves as a root (AC5.12)',
    () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const bridge = makeStubBridge();
      const link: InboundBridgeLink = {
        edge: bridge,
        propagateAdvertisement: () => true,
        retractAdvertisement: () => {},
        escalate: () => {},
      };
      registerInboundBridgeLink(bridge, link);
      pushAmbientMountingBridge(bridge);

      // Directly corrupt the rendezvous entry's own protocol version —
      // the realm-global stack this module owns — to simulate a peer
      // built from a different release, without duplicating the module's
      // internal Symbol-keyed storage.
      const RENDEZVOUS_KEY = Symbol.for('@gears-frontx/mfes:mount-context:1');
      const stack = (globalThis as unknown as Record<symbol, Array<{ v: number }>>)[RENDEZVOUS_KEY];
      expect(stack).toBeDefined();
      stack![stack!.length - 1]!.v = 999;

      try {
        const adopted = adoptAmbientInboundBridgeLink(() => {});
        expect(adopted).toBeUndefined();
      } finally {
        popAmbientMountingBridge();
      }

      expect(debugSpy).toHaveBeenCalled();
      const logged = debugSpy.mock.calls.some((call: unknown[]) =>
        call.some((arg: unknown) => String(arg).includes('unrecognized'))
      );
      expect(logged).toBe(true);
    }
  );

  it(
    'a rendezvous entry pushed by an alpha.8-era copy (protocol version 2, whose ' +
      '`escalate` returns a Promise rather than void) is treated as unrecognized, not adopted',
    () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const bridge = makeStubBridge();
      const link: InboundBridgeLink = {
        edge: bridge,
        propagateAdvertisement: () => true,
        retractAdvertisement: () => {},
        escalate: () => {},
      };
      registerInboundBridgeLink(bridge, link);

      const RENDEZVOUS_KEY = Symbol.for('@gears-frontx/mfes:mount-context:1');
      const host = globalThis as unknown as Record<
        symbol,
        Array<{ v: number; bridge: ChildMfeBridge; adopters: unknown[] }>
      >;
      let stack = host[RENDEZVOUS_KEY];
      if (!stack) {
        stack = [];
        host[RENDEZVOUS_KEY] = stack;
      }
      // An alpha.8-era copy of this module only ever pushes entries tagged
      // `v: 2`, since that is the only protocol version it knows how to
      // produce — pushed directly, rather than via `pushAmbientMountingBridge`,
      // to simulate the entry as that older copy would have written it.
      stack.push({ v: 2, bridge, adopters: [] });

      try {
        const adopted = adoptAmbientInboundBridgeLink(() => {});
        expect(adopted).toBeUndefined();
      } finally {
        stack.pop();
      }

      expect(debugSpy).toHaveBeenCalled();
      const logged = debugSpy.mock.calls.some((call: unknown[]) =>
        call.some((arg: unknown) => String(arg).includes('unrecognized'))
      );
      expect(logged).toBe(true);
    }
  );
});

function createPlugin(): TypeSystemPlugin {
  return {
    name: 'MockPlugin',
    version: '1.0.0',
    registerSchema() {},
    getSchema() { return undefined; },
    register() {},
    isTypeOf(typeId: string, baseTypeId: string) { return typeId === baseTypeId || typeId.startsWith(baseTypeId); },
    validateInstance() { return { valid: true, errors: [] }; },
    resolveLoadExtActionId: () => 'mock.action~load_ext.v1~',
    resolveMountExtActionId: () => 'mock.action~mount_ext.v1~',
    resolveUnmountExtActionId: () => 'mock.action~unmount_ext.v1~',
    resolveLifecycleStageInitId: () => 'mock.stage~init',
    resolveLifecycleStageActivatedId: () => 'mock.stage~activated',
    resolveLifecycleStageDeactivatedId: () => 'mock.stage~deactivated',
    resolveLifecycleStageDestroyedId: () => 'mock.stage~destroyed',
  };
}

function makeRouter(supplyNavigation: RouterPort['supplyNavigation']): RouterPort {
  return {
    registerDomain: () => {},
    registerExtension: () => {},
    releaseDomain: () => {},
    releaseExtension: () => {},
    assignOccupantValue: () => undefined,
    reportSettled: () => {},
    supplyNavigation,
  };
}

/** A link whose edge exposes the downward-delivery subscription and whose advertisement entry points are observable. */
function makeObservableLink() {
  const unsubscribe = vi.fn();
  const onCrossHopEnvelope = vi.fn(() => unsubscribe);
  const propagateAdvertisement = vi.fn((_targetId: string) => true);
  const bridge = { onCrossHopEnvelope } as unknown as ChildMfeBridge;
  const link: InboundBridgeLink = {
    edge: bridge,
    propagateAdvertisement,
    retractAdvertisement: () => {},
    escalate: () => {},
  };
  return { link, bridge, onCrossHopEnvelope, propagateAdvertisement };
}

const MOUNT_EXT = 'mock.action~mount_ext.v1~';
const UNMOUNT_EXT = 'mock.action~unmount_ext.v1~';

class BareDomainImpl extends ExtensionDomainImplementation {
  private readonly strategy: ConcurrentMountStrategy;

  constructor(ctx: DomainContext) {
    super();
    this.strategy = new ConcurrentMountStrategy(ctx.mounter, {
      create: () => document.createElement('div'),
      destroy: () => {},
    });
    ctx.registerHandler(
      MOUNT_EXT,
      ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as ActionPayload))
    );
    ctx.registerHandler(
      UNMOUNT_EXT,
      ActionHandler.fromFunction((_t, p) => this.strategy.unmount!(p as ActionPayload))
    );
  }

  protected getMountStrategies() {
    return [this.strategy];
  }
}

class BareDomainFactory extends ExtensionDomainImplementationFactory {
  build(ctx: DomainContext): BareDomainImpl {
    return new BareDomainImpl(ctx);
  }
}

function makeBareDomain(id: string): ExtensionDomain {
  return {
    id,
    actions: ['mock.action~load_ext.v1~', MOUNT_EXT, UNMOUNT_EXT],
    extensionsActions: [],
    sharedProperties: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    lifecycle: [],
    extensionsLifecycleStages: [],
    extensionsTypeId: '',
  } as unknown as ExtensionDomain;
}

describe('re-link of a registry that adopted an inbound bridge in a mount window', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    popAmbientMountingBridge();
  });

  it(
    'a registry re-linked through its published callback re-advertises its targets and receives its ' +
      'navigation supply through the new link (inst-relink-repropagate)',
    () => {
      const first = makeObservableLink();
      registerInboundBridgeLink(first.bridge, first.link);
      const supplyNavigation = vi.fn();

      pushAmbientMountingBridge(first.bridge);
      let registry: DefaultMfeRegistry;
      let claimed: ReturnType<typeof popAmbientMountingBridge>;
      try {
        registry = new DefaultMfeRegistry({ typeSystem: createPlugin(), router: makeRouter(supplyNavigation) });
      } finally {
        claimed = popAmbientMountingBridge();
      }

      registry.registerDomain(makeBareDomain('mock.domain.live.v1'), new BareDomainFactory());
      expect(first.propagateAdvertisement).toHaveBeenCalledTimes(1);

      const next = makeObservableLink();
      claimed[0]!(next.link);
      expect(next.onCrossHopEnvelope).toHaveBeenCalledTimes(1);
      expect(next.propagateAdvertisement).toHaveBeenCalledTimes(1);
      expect(next.propagateAdvertisement.mock.calls[0]![0]).toBe('mock.domain.live.v1');
      expect(supplyNavigation).toHaveBeenCalledTimes(2);

      registry.dispose();
    }
  );

  it(
    'a registry constructed outside any mount window stays a root: no inbound bridge, no adoption, no ' +
      'navigation supply, and no diagnostic (inst-no-ambient-bridge)',
    () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const supplyNavigation = vi.fn();

      const registry = new DefaultMfeRegistry({ typeSystem: createPlugin(), router: makeRouter(supplyNavigation) });

      expect(supplyNavigation).not.toHaveBeenCalled();
      expect(debugSpy).not.toHaveBeenCalled();
      registry.dispose();
    }
  );
});
