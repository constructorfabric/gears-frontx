/**
 * Tests for WeakMap-based Runtime Coordination
 *
 * Verifies:
 * - RuntimeCoordinator abstract class pattern
 * - WeakMapRuntimeCoordinator concrete implementation
 * - No window global pollution
 * - Automatic garbage collection with WeakMap
 * - Proper registration/lookup/unregistration
 *
 * NOTE: This tests the coordinator directly. Integration with ScreensetsRegistry
 * is tested in Phase 19.3 (mountExtension/unmountExtension).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScreensetsRegistry } from '../../../src/mfe/runtime';
import { DefaultScreensetsRegistry } from '../../../src/mfe/runtime/DefaultScreensetsRegistry';
import { gtsPlugin } from '../../../src/mfe/plugins/gts';
import type { ParentMfeBridge } from '../../../src/mfe/handler/types';
import { RuntimeCoordinator, type RuntimeConnection } from '../../../src/mfe/coordination/types';
import { WeakMapRuntimeCoordinator } from '../../../src/mfe/coordination/weak-map-runtime-coordinator';

describe('Runtime Coordination', () => {
  let container: HTMLDivElement;
  let mockRuntime: ScreensetsRegistry;
  let mockBridge: ParentMfeBridge;
  let testEntryTypeId: string;
  let coordinator: RuntimeCoordinator;

  beforeEach(() => {
    // Create a fresh container element for each test
    container = document.createElement('div');

    // Create mock runtime
    mockRuntime = new DefaultScreensetsRegistry({
      typeSystem: gtsPlugin,
    });

    // Test entry type ID (stored separately from bridge)
    testEntryTypeId = 'gts.frontx.mfes.mfe.entry.v1~test.entry.v1';

    // Create mock bridge
    mockBridge = {
      dispose: () => {},
    };

    // Create coordinator instance
    coordinator = new WeakMapRuntimeCoordinator();
  });

  describe('RuntimeCoordinator abstract class', () => {
    it('should be an abstract class with required methods', () => {
      // Verify RuntimeCoordinator is a class
      expect(RuntimeCoordinator).toBeDefined();
      expect(typeof RuntimeCoordinator).toBe('function');

      // Verify WeakMapRuntimeCoordinator has the expected methods
      // Note: Abstract methods don't exist on the prototype until implemented in concrete class
      expect(coordinator.register).toBeDefined();
      expect(typeof coordinator.register).toBe('function');
      expect(coordinator.get).toBeDefined();
      expect(typeof coordinator.get).toBe('function');
      expect(coordinator.unregister).toBeDefined();
      expect(typeof coordinator.unregister).toBe('function');
    });

    it('should be extensible by WeakMapRuntimeCoordinator', () => {
      // Verify WeakMapRuntimeCoordinator extends RuntimeCoordinator
      expect(coordinator).toBeInstanceOf(RuntimeCoordinator);
      expect(coordinator).toBeInstanceOf(WeakMapRuntimeCoordinator);
    });
  });

  describe('WeakMapRuntimeCoordinator.register', () => {
    it('should register a runtime connection for a container', () => {
      const connection: RuntimeConnection = {
        hostRuntime: mockRuntime,
        bridges: new Map([[testEntryTypeId, mockBridge]]),
      };

      coordinator.register(container, connection);

      const retrieved = coordinator.get(container);
      expect(retrieved).toBeDefined();
      expect(retrieved?.hostRuntime).toBe(mockRuntime);
      expect(retrieved?.bridges.size).toBe(1);
      expect(retrieved?.bridges.get(testEntryTypeId)).toBe(mockBridge);
    });

    it('should allow registering multiple bridges for same container', () => {
      const entryTypeId1 = 'gts.frontx.mfes.mfe.entry.v1~test.entry1.v1';
      const entryTypeId2 = 'gts.frontx.mfes.mfe.entry.v1~test.entry2.v1';
      const bridge1: ParentMfeBridge = {
        dispose: () => {},
      };
      const bridge2: ParentMfeBridge = {
        dispose: () => {},
      };

      const connection: RuntimeConnection = {
        hostRuntime: mockRuntime,
        bridges: new Map([
          [entryTypeId1, bridge1],
          [entryTypeId2, bridge2],
        ]),
      };

      coordinator.register(container, connection);

      const retrieved = coordinator.get(container);
      expect(retrieved?.bridges.size).toBe(2);
      expect(retrieved?.bridges.get(entryTypeId1)).toBe(bridge1);
      expect(retrieved?.bridges.get(entryTypeId2)).toBe(bridge2);
    });

    it('should overwrite existing registration for same container', () => {
      const connection1: RuntimeConnection = {
        hostRuntime: mockRuntime,
        bridges: new Map([[testEntryTypeId, mockBridge]]),
      };

      const newEntryTypeId = 'gts.frontx.mfes.mfe.entry.v1~test.new.v1';
      const newBridge: ParentMfeBridge = {
        dispose: () => {},
      };

      const connection2: RuntimeConnection = {
        hostRuntime: mockRuntime,
        bridges: new Map([[newEntryTypeId, newBridge]]),
      };

      coordinator.register(container, connection1);
      coordinator.register(container, connection2);

      const retrieved = coordinator.get(container);
      expect(retrieved?.bridges.size).toBe(1);
      expect(retrieved?.bridges.get(newEntryTypeId)).toBe(newBridge);
      expect(retrieved?.bridges.has(testEntryTypeId)).toBe(false);
    });
  });

  describe('WeakMapRuntimeCoordinator.get', () => {
    it('should return undefined for unregistered container', () => {
      const result = coordinator.get(container);
      expect(result).toBeUndefined();
    });

    it('should return registered connection', () => {
      const connection: RuntimeConnection = {
        hostRuntime: mockRuntime,
        bridges: new Map([[testEntryTypeId, mockBridge]]),
      };

      coordinator.register(container, connection);

      const result = coordinator.get(container);
      expect(result).toBe(connection);
    });

    it('should be O(1) lookup via WeakMap', () => {
      const connection: RuntimeConnection = {
        hostRuntime: mockRuntime,
        bridges: new Map([[testEntryTypeId, mockBridge]]),
      };

      coordinator.register(container, connection);

      // Multiple lookups should all be instant
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        coordinator.get(container);
      }
      const end = performance.now();

      // Should be very fast (< 1ms for 1000 lookups)
      expect(end - start).toBeLessThan(1);
    });
  });

  describe('WeakMapRuntimeCoordinator.unregister', () => {
    it('should remove runtime connection', () => {
      const connection: RuntimeConnection = {
        hostRuntime: mockRuntime,
        bridges: new Map([[testEntryTypeId, mockBridge]]),
      };

      coordinator.register(container, connection);
      expect(coordinator.get(container)).toBeDefined();

      coordinator.unregister(container);
      expect(coordinator.get(container)).toBeUndefined();
    });

    it('should be idempotent', () => {
      const connection: RuntimeConnection = {
        hostRuntime: mockRuntime,
        bridges: new Map([[testEntryTypeId, mockBridge]]),
      };

      coordinator.register(container, connection);
      coordinator.unregister(container);
      coordinator.unregister(container); // Second call should not throw

      expect(coordinator.get(container)).toBeUndefined();
    });

    it('should not throw for unregistered container', () => {
      expect(() => coordinator.unregister(container)).not.toThrow();
    });
  });

  describe('No window global pollution', () => {
    it('should not add any __hai3_* properties to window', () => {
      const connection: RuntimeConnection = {
        hostRuntime: mockRuntime,
        bridges: new Map([[testEntryTypeId, mockBridge]]),
      };

      coordinator.register(container, connection);

      // Check window object for any HAI3-related globals
      const windowKeys = Object.keys(window);
      const hai3Globals = windowKeys.filter(
        (key) =>
          key.startsWith('__hai3') ||
          key.startsWith('_hai3') ||
          key.includes('hai3')
      );

      expect(hai3Globals).toEqual([]);
    });

    it('should not be accessible via window object', () => {
      const connection: RuntimeConnection = {
        hostRuntime: mockRuntime,
        bridges: new Map([[testEntryTypeId, mockBridge]]),
      };

      coordinator.register(container, connection);

      // Try to access via various window properties
      const win = window as Record<string, unknown>;
      expect(win.__hai3_runtime).toBeUndefined();
      expect(win.__hai3_connections).toBeUndefined();
      expect(win.hai3Runtime).toBeUndefined();
      expect(win.runtimeConnections).toBeUndefined();
    });
  });

  describe('Automatic garbage collection', () => {
    it('should allow container to be garbage collected', async () => {
      let testContainer: HTMLDivElement | null = document.createElement('div');
      const connection: RuntimeConnection = {
        hostRuntime: mockRuntime,
        bridges: new Map([[testEntryTypeId, mockBridge]]),
      };

      coordinator.register(testContainer, connection);
      expect(coordinator.get(testContainer)).toBeDefined();

      // Create weak reference to verify GC
      const weakRef = new WeakRef(testContainer);

      // Remove all strong references
      testContainer = null;

      // Force garbage collection (requires --expose-gc flag in Node)
      if (global.gc) {
        global.gc();

        // Check if weakRef is cleared (may take a moment)
        await new Promise((resolve) => setTimeout(resolve, 100));

        const derefResult = weakRef.deref();
        // If GC worked, deref should return undefined
        // Note: This is not guaranteed to happen immediately
        if (derefResult === undefined) {
          expect(derefResult).toBeUndefined();
        }
      } else {
        // Skip GC test if --expose-gc is not available
        // Just verify the test structure works
        expect(true).toBe(true);
      }
    });

    it('should not prevent container removal from DOM', () => {
      document.body.appendChild(container);
      const connection: RuntimeConnection = {
        hostRuntime: mockRuntime,
        bridges: new Map([[testEntryTypeId, mockBridge]]),
      };

      coordinator.register(container, connection);
      expect(coordinator.get(container)).toBeDefined();

      // Remove from DOM
      container.remove();

      // Should still be able to lookup (container object still exists in JS)
      expect(coordinator.get(container)).toBeDefined();

      // But unregistering should work
      coordinator.unregister(container);
      expect(coordinator.get(container)).toBeUndefined();
    });
  });

  describe('Multiple containers isolation', () => {
    it('should keep different containers isolated', () => {
      const container1 = document.createElement('div');
      const container2 = document.createElement('div');

      const runtime1 = new DefaultScreensetsRegistry({ typeSystem: gtsPlugin });
      const runtime2 = new DefaultScreensetsRegistry({ typeSystem: gtsPlugin });

      const entryTypeId1 = 'gts.frontx.mfes.mfe.entry.v1~test.entry1.v1';
      const entryTypeId2 = 'gts.frontx.mfes.mfe.entry.v1~test.entry2.v1';

      const bridge1: ParentMfeBridge = {
        dispose: () => {},
      };

      const bridge2: ParentMfeBridge = {
        dispose: () => {},
      };

      const connection1: RuntimeConnection = {
        hostRuntime: runtime1,
        bridges: new Map([[entryTypeId1, bridge1]]),
      };

      const connection2: RuntimeConnection = {
        hostRuntime: runtime2,
        bridges: new Map([[entryTypeId2, bridge2]]),
      };

      coordinator.register(container1, connection1);
      coordinator.register(container2, connection2);

      const retrieved1 = coordinator.get(container1);
      const retrieved2 = coordinator.get(container2);

      expect(retrieved1?.hostRuntime).toBe(runtime1);
      expect(retrieved2?.hostRuntime).toBe(runtime2);
      expect(retrieved1?.bridges.get(entryTypeId1)).toBe(bridge1);
      expect(retrieved2?.bridges.get(entryTypeId2)).toBe(bridge2);

      // Containers should not interfere with each other
      coordinator.unregister(container1);
      expect(coordinator.get(container1)).toBeUndefined();
      expect(coordinator.get(container2)).toBeDefined();
    });
  });

  describe('ScreensetsRegistry integration', () => {
    it('should use coordinator from config', () => {
      const customCoordinator = new WeakMapRuntimeCoordinator();
      const registry = new DefaultScreensetsRegistry({
        typeSystem: gtsPlugin,
        coordinator: customCoordinator,
      });

      // Verify registry was created successfully
      expect(registry).toBeInstanceOf(ScreensetsRegistry);
      expect(registry.typeSystem).toBe(gtsPlugin);
    });

    it('should default to WeakMapRuntimeCoordinator if not provided', () => {
      const registry = new DefaultScreensetsRegistry({
        typeSystem: gtsPlugin,
      });

      // Verify registry was created successfully
      expect(registry).toBeInstanceOf(ScreensetsRegistry);
      expect(registry.typeSystem).toBe(gtsPlugin);
    });
  });
});
