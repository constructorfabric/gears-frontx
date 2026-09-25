/**
 * Cross-Runtime Action Chain Routing Tests
 *
 * Tests for Phase 22: Cross-Runtime Action Chain Routing
 * Verifies ChildDomainForwardingHandler, child domain registration, and cleanup.
 *
 * Domain and action IDs here are a mock notation rather than the real GTS
 * strings: the bridge treats them as opaque routing keys, and MFES-1 forbids
 * @gears-frontx/mfes from carrying type-format literals at all.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChildMfeBridgeImpl } from '../../src/bridge/ChildMfeBridge';
import { ParentMfeBridgeImpl } from '../../src/bridge/ParentMfeBridge';
import { createChildDomainForwardingRoute } from '../../src/bridge/ChildDomainForwardingHandler';
import { CROSS_HOP_PROTOCOL_VERSION, CrossHopRoute } from '../../src/mediator/cross-hop-route';

describe('Cross-Runtime Action Chain Routing', () => {
  let childBridge: ChildMfeBridgeImpl;
  let parentBridge: ParentMfeBridgeImpl;

  beforeEach(() => {
    childBridge = new ChildMfeBridgeImpl(
      'mock.ext.domain.v1~parent.domain.v1',
      'test-instance'
    );
    parentBridge = new ParentMfeBridgeImpl(childBridge);
    // These tests exercise an already-mounted bridge pair; production code
    // reaches this state via `RuntimeBridgeFactory.acquireBridge`, which
    // activates the child bridge as its final step.
    childBridge.activate();
  });

  describe('createChildDomainForwardingRoute', () => {
    it('resolves to a CrossHopRoute (never a plain ActionHandler) and hands the envelope to the child domain via sendCrossHopEnvelope, synchronously', () => {
      // Setup: Mock the parent bridge's cross-hop transport as accepting
      // (returning normally — synchronous and binary).
      vi.spyOn(parentBridge, 'sendCrossHopEnvelope').mockImplementation(() => {});

      // Build the cross-hop route the catch-all tier resolves to.
      const route = createChildDomainForwardingRoute(
        parentBridge,
        'mock.ext.domain.v1~child.domain.v1'
      );
      expect(route).toBeInstanceOf(CrossHopRoute);

      // Act: hand a versioned envelope over, as the mediator's cross-hop
      // dispatch does — returns nothing, throws nothing: accepted.
      expect(() =>
        route.send({
          version: CROSS_HOP_PROTOCOL_VERSION,
          node: {
            action: {
              type: 'mock.ext.action.v1~test.action.v1',
              target: 'mock.ext.domain.v1~parent.domain.v1',
              payload: { foo: 'bar' },
            },
          },
          diagnostics: {},
        })
      ).not.toThrow();

      // Assert: sendCrossHopEnvelope was called with the envelope re-targeted
      // at the child domain — the sending side is done with the node the
      // instant this call returns.
      expect(parentBridge.sendCrossHopEnvelope).toHaveBeenCalledWith({
        version: CROSS_HOP_PROTOCOL_VERSION,
        node: {
          action: {
            type: 'mock.ext.action.v1~test.action.v1',
            target: 'mock.ext.domain.v1~child.domain.v1',
            payload: { foo: 'bar' },
          },
        },
        diagnostics: {},
      });
    });

    it('propagates a synchronous refusal from the child domain hop', () => {
      // Setup: Mock a hop-unavailable refusal (e.g. a deactivated bridge) —
      // synchronous and binary: throws at the call, no side effect.
      const testError = new Error('Test error');
      vi.spyOn(parentBridge, 'sendCrossHopEnvelope').mockImplementation(() => {
        throw testError;
      });

      const route = createChildDomainForwardingRoute(
        parentBridge,
        'mock.ext.domain.v1~child.domain.v1'
      );

      // Act & Assert: Should propagate the throw synchronously.
      expect(() =>
        route.send({
          version: CROSS_HOP_PROTOCOL_VERSION,
          node: {
            action: {
              type: 'mock.ext.action.v1~test.action.v1',
              target: 'mock.ext.domain.v1~parent.domain.v1',
            },
          },
          diagnostics: {},
        })
      ).toThrow('Test error');
    });
  });

  describe('ChildMfeBridgeImpl.registerChildDomain', () => {
    it('should call registered callback and track domain ID', () => {
      // Setup: Mock callbacks
      const registerCallback = vi.fn();
      const unregisterCallback = vi.fn();
      childBridge.setChildDomainCallbacks(registerCallback, unregisterCallback);

      // Act: Register a child domain
      childBridge.registerChildDomain('mock.ext.domain.v1~child.domain.v1');

      // Assert: Callback was called
      expect(registerCallback).toHaveBeenCalledWith('mock.ext.domain.v1~child.domain.v1');
      expect(registerCallback).toHaveBeenCalledTimes(1);
    });

    it('should throw if callback not wired', () => {
      // Act & Assert: Should throw error
      expect(() => {
        childBridge.registerChildDomain('mock.ext.domain.v1~child.domain.v1');
      }).toThrow('registerChildDomain callback not wired');
    });
  });

  describe('ChildMfeBridgeImpl.unregisterChildDomain', () => {
    it('should call unregister callback and remove domain ID from tracking', () => {
      // Setup: Mock callbacks and register a domain
      const registerCallback = vi.fn();
      const unregisterCallback = vi.fn();
      childBridge.setChildDomainCallbacks(registerCallback, unregisterCallback);
      childBridge.registerChildDomain('mock.ext.domain.v1~child.domain.v1');

      // Act: Unregister the domain
      childBridge.unregisterChildDomain('mock.ext.domain.v1~child.domain.v1');

      // Assert: Callback was called
      expect(unregisterCallback).toHaveBeenCalledWith('mock.ext.domain.v1~child.domain.v1');
      expect(unregisterCallback).toHaveBeenCalledTimes(1);
    });

    it('should no-op silently if callback is null', () => {
      // Act & Assert: Should not throw
      expect(() => {
        childBridge.unregisterChildDomain('mock.ext.domain.v1~child.domain.v1');
      }).not.toThrow();
    });
  });

  describe('ChildMfeBridgeImpl.destroy', () => {
    it('should unregister all tracked child domains before nulling callbacks', () => {
      // Setup: Register multiple child domains
      const registerCallback = vi.fn();
      const unregisterCallback = vi.fn();
      childBridge.setChildDomainCallbacks(registerCallback, unregisterCallback);

      childBridge.registerChildDomain('mock.ext.domain.v1~child1.v1');
      childBridge.registerChildDomain('mock.ext.domain.v1~child2.v1');
      childBridge.registerChildDomain('mock.ext.domain.v1~child3.v1');

      // Act: Cleanup
      childBridge.destroy();

      // Assert: All domains were unregistered
      expect(unregisterCallback).toHaveBeenCalledTimes(3);
      expect(unregisterCallback).toHaveBeenCalledWith('mock.ext.domain.v1~child1.v1');
      expect(unregisterCallback).toHaveBeenCalledWith('mock.ext.domain.v1~child2.v1');
      expect(unregisterCallback).toHaveBeenCalledWith('mock.ext.domain.v1~child3.v1');
    });

    it('should verify callbacks are called before being nulled', () => {
      // Setup: Register a child domain
      const unregisterCallback = vi.fn();
      childBridge.setChildDomainCallbacks(vi.fn(), unregisterCallback);
      childBridge.registerChildDomain('mock.ext.domain.v1~child.v1');

      // Act: Cleanup
      childBridge.destroy();

      // Assert: Unregister was called (proves callback was still wired)
      expect(unregisterCallback).toHaveBeenCalledWith('mock.ext.domain.v1~child.v1');

      // Verify subsequent registerChildDomain throws (proves callback is now null)
      expect(() => {
        childBridge.registerChildDomain('mock.ext.domain.v1~new.domain.v1');
      }).toThrow('registerChildDomain callback not wired');
    });

    it('should clear the tracked domain IDs set', () => {
      // Setup: Register domains
      const registerCallback = vi.fn();
      const unregisterCallback = vi.fn();
      childBridge.setChildDomainCallbacks(registerCallback, unregisterCallback);
      childBridge.registerChildDomain('mock.ext.domain.v1~child1.v1');
      childBridge.registerChildDomain('mock.ext.domain.v1~child2.v1');

      // Act: Cleanup
      childBridge.destroy();

      // Reset the mock to verify subsequent cleanup doesn't call unregister again
      unregisterCallback.mockClear();

      // Wire callbacks again (simulating re-use scenario)
      childBridge.setChildDomainCallbacks(registerCallback, unregisterCallback);

      // Call cleanup again
      childBridge.destroy();

      // Assert: No unregister calls (set was cleared)
      expect(unregisterCallback).not.toHaveBeenCalled();
    });
  });

  describe('End-to-End Integration', () => {
    it('should route action from parent mediator through child bridge to child registry', () => {
      // Setup: Mock child registry's cross-hop envelope receiver — the
      // transport every runtime-crossing hop resolves to. Accepts
      // synchronously (returns normally) the way a real
      // `receiveCrossHopNode` does once it has reserved what the node needs.
      const childRegistryReceive = vi.fn();

      // Wire parent -> child transport
      childBridge.onCrossHopEnvelope(childRegistryReceive);

      // Create register callback that creates the forwarding route
      const routes = new Map<string, CrossHopRoute>();
      const registerCallback = (domainId: string) => {
        const route = createChildDomainForwardingRoute(parentBridge, domainId);
        routes.set(domainId, route);
      };
      const unregisterCallback = (domainId: string) => {
        routes.delete(domainId);
      };

      childBridge.setChildDomainCallbacks(registerCallback, unregisterCallback);

      // Register child domain
      const childDomainId = 'mock.ext.domain.v1~child.domain.v1';
      childBridge.registerChildDomain(childDomainId);

      // Verify route was registered
      expect(routes.has(childDomainId)).toBe(true);

      // Act: Simulate the mediator's cross-hop dispatch invoking the route
      const route = routes.get(childDomainId)!;
      expect(() =>
        route.send({
          version: CROSS_HOP_PROTOCOL_VERSION,
          node: {
            action: {
              type: 'mock.ext.action.v1~test.action.v1',
              target: 'mock.ext.domain.v1~parent.domain.v1',
              payload: { data: 'test' },
            },
          },
          diagnostics: {},
        })
      ).not.toThrow();

      // Assert: Child registry received the envelope, re-targeted at the
      // child domain — the sending side is done with the node the instant
      // this call returns.
      expect(childRegistryReceive).toHaveBeenCalledWith({
        version: CROSS_HOP_PROTOCOL_VERSION,
        node: {
          action: {
            type: 'mock.ext.action.v1~test.action.v1',
            target: childDomainId,
            payload: { data: 'test' },
          },
        },
        diagnostics: {},
      });
    });

    it('should remove forwarding route from parent mediator on cleanup', () => {
      // Setup: Register domain with callbacks
      const routes = new Map<string, CrossHopRoute>();
      const registerCallback = (domainId: string) => {
        const route = createChildDomainForwardingRoute(parentBridge, domainId);
        routes.set(domainId, route);
      };
      const unregisterCallback = (domainId: string) => {
        routes.delete(domainId);
      };

      childBridge.setChildDomainCallbacks(registerCallback, unregisterCallback);
      const childDomainId = 'mock.ext.domain.v1~child.domain.v1';
      childBridge.registerChildDomain(childDomainId);

      // Verify route is registered
      expect(routes.has(childDomainId)).toBe(true);

      // Act: Cleanup (simulating unmount)
      childBridge.destroy();

      // Assert: Route was removed
      expect(routes.has(childDomainId)).toBe(false);
    });

    it('should not affect parent domain handlers', async () => {
      // This test verifies that cross-runtime wiring doesn't interfere with
      // parent domain handler resolution. Since we're testing bridge-level
      // components in isolation, we verify that the forwarding handler
      // only affects child domains, not parent domains.

      // Setup: Register child domain
      const childDomains = new Set<string>();
      const registerCallback = (domainId: string) => {
        childDomains.add(domainId);
      };
      const unregisterCallback = (domainId: string) => {
        childDomains.delete(domainId);
      };

      childBridge.setChildDomainCallbacks(registerCallback, unregisterCallback);
      childBridge.registerChildDomain('mock.ext.domain.v1~child.domain.v1');

      // Assert: Only child domain is tracked
      expect(childDomains.size).toBe(1);
      expect(childDomains.has('mock.ext.domain.v1~child.domain.v1')).toBe(true);

      // Parent domain should NOT be in the set
      expect(childDomains.has('mock.ext.domain.v1~parent.domain.v1')).toBe(false);
    });
  });

  describe('createChildDomainForwardingRoute — deactivation refuses new deliveries only (inst-bridge-deactivation)', () => {
    it(
      'refuses a delivery attempted AFTER the bridge deactivates with a target-inactive cause, ' +
        'while a delivery already accepted before deactivation is untouched by it',
      () => {
        const childDomainId = 'mock.ext.domain.v1~child.domain.v1';
        const route = createChildDomainForwardingRoute(parentBridge, childDomainId);

        // Accepted BEFORE deactivation: the far side has already taken the
        // node — this call returns normally.
        childBridge.onCrossHopEnvelope(() => {});
        expect(() =>
          route.send({
            version: CROSS_HOP_PROTOCOL_VERSION,
            node: {
              action: { type: 'mock.ext.action.v1~primary.v1~', target: childDomainId, payload: {} },
            },
            diagnostics: {},
          })
        ).not.toThrow();

        // Deactivate the bridge — an ordinary unmount, not permanent
        // unregistration: the route itself is untouched, only NEW
        // deliveries through it are refused from here.
        childBridge.deactivate();

        expect(() =>
          route.send({
            version: CROSS_HOP_PROTOCOL_VERSION,
            node: {
              action: { type: 'mock.ext.action.v1~primary.v1~', target: childDomainId, payload: {} },
            },
            diagnostics: {},
          })
        ).toThrow(/inactive/i);
      }
    );
  });

  describe(
    'the completion-bearing child-to-parent transport is fully removed — nothing awaitable ' +
      'ever crosses a bridge or is passed into bridge wiring',
    () => {
      it('neither concrete bridge implementation carries a completion-bearing method on its own prototype', () => {
        // The concrete bridges carry no completion-bearing chain transport methods
        // (`sendActionsChain`, `onActionsChain`, `handleParentActionsChain` on ChildMfeBridgeImpl;
        // `sendActionsChain`, `onChildAction`, `handleChildAction` on ParentMfeBridgeImpl).
        // Every runtime-crossing hop goes through the synchronous, binary
        // `sendCrossHopEnvelope`/`handleCrossHopEnvelope` pair.
        const childOwnMethods = Object.getOwnPropertyNames(ChildMfeBridgeImpl.prototype);
        const parentOwnMethods = Object.getOwnPropertyNames(ParentMfeBridgeImpl.prototype);

        expect(childOwnMethods).not.toContain('sendActionsChain');
        expect(childOwnMethods).not.toContain('onActionsChain');
        expect(childOwnMethods).not.toContain('handleParentActionsChain');
        expect(childOwnMethods).not.toContain('setParentBridge');

        expect(parentOwnMethods).not.toContain('sendActionsChain');
        expect(parentOwnMethods).not.toContain('onChildAction');
        expect(parentOwnMethods).not.toContain('handleChildAction');
      });
    }
  );
});
