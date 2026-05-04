/**
 * Tests for Runtime Bridge Factory
 *
 * Verifies:
 * - Bridge creation with property subscription
 * - Property subscriber cleanup on disposal (memory leak prevention)
 * - Domain subscriber tracking
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultRuntimeBridgeFactory } from '../../../src/mfe/runtime/default-runtime-bridge-factory';
import type { ExtensionDomainState } from '../../../src/mfe/runtime/extension-manager';
import type { ExtensionDomain, SharedProperty } from '../../../src/mfe/types';
import { ParentMfeBridgeImpl } from '../../../src/mfe/bridge/ParentMfeBridge';

describe('Runtime Bridge Factory', () => {
  let domainState: ExtensionDomainState;
  let bridgeFactory: DefaultRuntimeBridgeFactory;

  beforeEach(() => {
    const domain: ExtensionDomain = {
      id: 'gts.hai3.mfes.ext.domain.v1~test.domain',
      sharedProperties: ['prop1', 'prop2', 'prop3'],
      actions: [],
      extensionsActions: [],
      defaultActionTimeout: 5000,
      lifecycleStages: [],
      extensionsLifecycleStages: [],
    };

    domainState = {
      domain,
      properties: new Map<string, unknown>([
        ['prop1', 'value1'],
        ['prop2', 'value2'],
      ]),
      extensions: new Set(),
      propertySubscribers: new Map(),
      mountedExtensions: [],
      mounter: null,
      lifecycleTrigger: null,
      implementation: null,
    };

    bridgeFactory = new DefaultRuntimeBridgeFactory();
  });

  describe('createBridge', () => {
    it('should create parent and child bridges', () => {
      const { parentBridge, childBridge } = bridgeFactory.createBridge(
        domainState,
        'test-extension',
        'gts.hai3.mfes.mfe.entry.v1~test.entry',
        [],
        async () => {},
        () => {},
        () => {},
        () => {},
        () => {}
      );

      expect(parentBridge).toBeDefined();
      expect(childBridge).toBeDefined();
      expect(childBridge.domainId).toBe('gts.hai3.mfes.ext.domain.v1~test.domain');
      expect(childBridge.instanceId).toContain('test-extension');
    });

    it('should populate child bridge with initial properties', () => {
      const { childBridge } = bridgeFactory.createBridge(
        domainState,
        'test-extension',
        'gts.hai3.mfes.mfe.entry.v1~test.entry',
        [],
        async () => {},
        () => {},
        () => {},
        () => {},
        () => {}
      );

      const prop1 = childBridge.getProperty('prop1');
      expect(prop1).toEqual({ id: 'prop1', value: 'value1' });

      const prop2 = childBridge.getProperty('prop2');
      expect(prop2).toEqual({ id: 'prop2', value: 'value2' });
    });

    it('should subscribe to domain property updates', () => {
      const { parentBridge } = bridgeFactory.createBridge(
        domainState,
        'test-extension',
        'gts.hai3.mfes.mfe.entry.v1~test.entry',
        [],
        async () => {},
        () => {},
        () => {},
        () => {},
        () => {}
      );

      // Verify subscribers were added to domain
      expect(domainState.propertySubscribers.size).toBe(3);
      expect(domainState.propertySubscribers.get('prop1')?.size).toBe(1);
      expect(domainState.propertySubscribers.get('prop2')?.size).toBe(1);
      expect(domainState.propertySubscribers.get('prop3')?.size).toBe(1);

      // Verify subscribers are tracked in parent bridge
      const trackedSubscribers = (parentBridge as ParentMfeBridgeImpl).getPropertySubscribers();
      expect(trackedSubscribers.size).toBe(3);
      expect(trackedSubscribers.has('prop1')).toBe(true);
      expect(trackedSubscribers.has('prop2')).toBe(true);
      expect(trackedSubscribers.has('prop3')).toBe(true);
    });

    it('should forward property updates from domain to child', () => {
      const { childBridge } = bridgeFactory.createBridge(
        domainState,
        'test-extension',
        'gts.hai3.mfes.mfe.entry.v1~test.entry',
        [],
        async () => {},
        () => {},
        () => {},
        () => {},
        () => {}
      );

      // Subscribe to property updates on child (child receives SharedProperty)
      const updates: SharedProperty[] = [];
      childBridge.subscribeToProperty('prop1', (value) => updates.push(value));

      // Simulate domain property update by notifying subscribers with (propertyTypeId, value)
      const subscribers = domainState.propertySubscribers.get('prop1');
      if (subscribers) {
        for (const subscriber of subscribers) {
          subscriber('prop1', 'new-value1');
        }
      }

      // Child should receive the update wrapped as SharedProperty
      expect(updates).toHaveLength(1);
      expect(updates[0]).toEqual({ id: 'prop1', value: 'new-value1' });
    });
  });

  describe('disposeBridge', () => {
    it('should remove property subscribers from domain', () => {
      const { parentBridge } = bridgeFactory.createBridge(
        domainState,
        'test-extension',
        'gts.hai3.mfes.mfe.entry.v1~test.entry',
        [],
        async () => {},
        () => {},
        () => {},
        () => {},
        () => {}
      );

      // Verify subscribers exist
      expect(domainState.propertySubscribers.get('prop1')?.size).toBe(1);
      expect(domainState.propertySubscribers.get('prop2')?.size).toBe(1);
      expect(domainState.propertySubscribers.get('prop3')?.size).toBe(1);

      // Dispose bridge
      bridgeFactory.disposeBridge(domainState, parentBridge);

      // Subscribers should be removed from domain
      expect(domainState.propertySubscribers.get('prop1')?.size).toBe(0);
      expect(domainState.propertySubscribers.get('prop2')?.size).toBe(0);
      expect(domainState.propertySubscribers.get('prop3')?.size).toBe(0);
    });

    it('should dispose the bridge', () => {
      const { parentBridge } = bridgeFactory.createBridge(
        domainState,
        'test-extension',
        'gts.hai3.mfes.mfe.entry.v1~test.entry',
        [],
        async () => {},
        () => {},
        () => {},
        () => {},
        () => {}
      );

      // Dispose bridge
      bridgeFactory.disposeBridge(domainState, parentBridge);

      // Bridge should be disposed
      const trackedSubscribers = (parentBridge as ParentMfeBridgeImpl).getPropertySubscribers();
      expect(trackedSubscribers.size).toBe(0);
    });

    it('should prevent memory leaks across multiple mount/unmount cycles', () => {
      // Simulate multiple mount/unmount cycles
      for (let i = 0; i < 10; i++) {
        const { parentBridge } = bridgeFactory.createBridge(
          domainState,
          `test-extension-${i}`,
          'gts.hai3.mfes.mfe.entry.v1~test.entry',
          [],
          async () => {},
          () => {},
          () => {},
          () => {},
          () => {}
        );

        // Each bridge should add subscribers (size = 1 since we dispose after each iteration)
        expect(domainState.propertySubscribers.get('prop1')?.size).toBe(1);

        // Dispose bridge
        bridgeFactory.disposeBridge(domainState, parentBridge);

        // Subscribers should be removed
        expect(domainState.propertySubscribers.get('prop1')?.size).toBe(0);
      }

      // After 10 mount/unmount cycles, no subscribers should remain
      expect(domainState.propertySubscribers.get('prop1')?.size).toBe(0);
      expect(domainState.propertySubscribers.get('prop2')?.size).toBe(0);
      expect(domainState.propertySubscribers.get('prop3')?.size).toBe(0);
    });

    it('should handle disposal when property subscribers are missing', () => {
      const { parentBridge } = bridgeFactory.createBridge(
        domainState,
        'test-extension',
        'gts.hai3.mfes.mfe.entry.v1~test.entry',
        [],
        async () => {},
        () => {},
        () => {},
        () => {},
        () => {}
      );

      // Clear property subscribers manually (simulate corrupted state)
      domainState.propertySubscribers.clear();

      // Should not throw
      expect(() => {
        bridgeFactory.disposeBridge(domainState, parentBridge);
      }).not.toThrow();
    });
  });

  describe('Multiple bridges on same domain', () => {
    it('should manage multiple bridges independently', () => {
      const { parentBridge: bridge1 } = bridgeFactory.createBridge(
        domainState,
        'extension-1',
        'gts.hai3.mfes.mfe.entry.v1~test.entry',
        [],
        async () => {},
        () => {},
        () => {},
        () => {},
        () => {}
      );

      const { parentBridge: bridge2 } = bridgeFactory.createBridge(
        domainState,
        'extension-2',
        'gts.hai3.mfes.mfe.entry.v1~test.entry',
        [],
        async () => {},
        () => {},
        () => {},
        () => {},
        () => {}
      );

      // Both bridges should add subscribers
      expect(domainState.propertySubscribers.get('prop1')?.size).toBe(2);

      // Dispose first bridge
      bridgeFactory.disposeBridge(domainState, bridge1);

      // First bridge's subscribers should be removed, second bridge's should remain
      expect(domainState.propertySubscribers.get('prop1')?.size).toBe(1);

      // Dispose second bridge
      bridgeFactory.disposeBridge(domainState, bridge2);

      // All subscribers should be removed
      expect(domainState.propertySubscribers.get('prop1')?.size).toBe(0);
    });
  });
});
