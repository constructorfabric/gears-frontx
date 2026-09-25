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
import type { ChildMfeBridge } from '../../handler/types';

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
});
