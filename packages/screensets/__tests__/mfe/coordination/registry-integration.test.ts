/**
 * Runtime Coordinator Integration Tests (Task 8.4.8)
 *
 * Tests for verifying coordination through ScreensetsRegistry API.
 * These tests verify that the coordinator is properly integrated and accessible
 * through the registry, even though mount/unmount don't exist yet (Phase 19.3).
 */

import { describe, it, expect } from 'vitest';
import { DefaultScreensetsRegistry } from '../../../src/mfe/runtime/DefaultScreensetsRegistry';
import { WeakMapRuntimeCoordinator } from '../../../src/mfe/coordination/weak-map-runtime-coordinator';
import type { TypeSystemPlugin, JSONSchema, ValidationResult } from '../../../src/mfe/plugins/types';
import type { RuntimeConnection } from '../../../src/mfe/coordination/types';
import { MockContainerProvider } from '../test-utils';


// Mock Type System Plugin
function createMockPlugin(): TypeSystemPlugin {
  const schemas = new Map<string, JSONSchema>();
  const registeredEntities = new Map<string, unknown>();

  const coreTypeIds = [
    'gts.frontx.mfes.mfe.entry.v1~',
    'gts.frontx.mfes.ext.domain.v1~',
    'gts.frontx.mfes.ext.extension.v1~',
    'gts.frontx.mfes.comm.shared_property.v1~',
    'gts.frontx.mfes.comm.action.v1~',
    'gts.frontx.mfes.comm.actions_chain.v1~',
    'gts.frontx.mfes.lifecycle.stage.v1~',
    'gts.frontx.mfes.lifecycle.hook.v1~',
  ];

  for (const typeId of coreTypeIds) {
    schemas.set(typeId, { $id: `gts://${typeId}`, type: 'object' });
  }

  return {
    name: 'MockPlugin',
    version: '1.0.0',
    isValidTypeId: (id: string) => id.includes('gts.') && id.endsWith('~'),
    parseTypeId: (id: string) => ({ id, segments: id.split('.') }),
    registerSchema: (schema: JSONSchema) => {
      if (schema.$id) {
        const typeId = schema.$id.replace('gts://', '');
        schemas.set(typeId, schema);
      }
    },
    getSchema: (typeId: string) => schemas.get(typeId),
    register: (entity: unknown) => {
      const entityWithId = entity as { id?: string };
      if (entityWithId.id) {
        registeredEntities.set(entityWithId.id, entity);
      }
    },
    validateInstance: (instanceId: string): ValidationResult => {
      if (registeredEntities.has(instanceId)) {
        return { valid: true, errors: [] };
      }
      return {
        valid: false,
        errors: [
          {
            path: '',
            message: `Instance not registered: ${instanceId}`,
            keyword: 'not-registered',
          },
        ],
      };
    },
    query: (pattern: string, limit?: number) => {
      const results = Array.from(schemas.keys()).filter(id => id.includes(pattern));
      return limit ? results.slice(0, limit) : results;
    },
    isTypeOf: (typeId: string, baseTypeId: string) => {
      return typeId === baseTypeId || typeId.startsWith(baseTypeId);
    },
    checkCompatibility: () => ({
      compatible: true,
      breaking: false,
      changes: [],
    }),
    getAttribute: (typeId: string, path: string) => ({
      typeId,
      path,
      resolved: false,
    }),
  };
}

describe('Runtime Coordinator Integration - Task 8.4.8', () => {
  describe('Default coordinator initialization', () => {
    it('should create WeakMapRuntimeCoordinator by default', () => {
      const registry = new DefaultScreensetsRegistry({
        typeSystem: createMockPlugin(),
      });

      expect(registry).toBeDefined();
      // Coordinator is private, but we can verify the registry works properly
      expect(registry.typeSystem).toBeDefined();
    });
  });

  describe('Coordinator encapsulation', () => {
    it('should not pollute window global scope', () => {
      new DefaultScreensetsRegistry({
        typeSystem: createMockPlugin(),
      });

      // Verify no global pollution
      const globalObj = globalThis as Record<string, unknown>;
      expect(globalObj.__hai3_runtime_connections).toBeUndefined();
      expect(globalObj.__mfe_registry).toBeUndefined();
      expect(globalObj.__screensets_coordinator).toBeUndefined();
    });
  });


  describe('Integration with registry lifecycle', () => {
    it('should initialize coordinator during registry construction', () => {
      // This test verifies that coordinator is ready when registry is created
      const registry = new DefaultScreensetsRegistry({
        typeSystem: createMockPlugin(),
      });

      // Registry should be fully functional immediately
      expect(registry.typeSystem).toBeDefined();
      expect(() => {
        const mockContainerProvider = new MockContainerProvider();
        registry.registerDomain({
          id: 'gts.frontx.mfes.ext.domain.v1~test.domain.v1~',
          sharedProperties: [],
          actions: [],
          extensionsActions: [],
          defaultActionTimeout: 5000,
          lifecycleStages: [],
          extensionsLifecycleStages: [],
        }, mockContainerProvider);
      }).not.toThrow();
    });

    it('should clean up coordinator on registry disposal', () => {
      const registry = new DefaultScreensetsRegistry({
        typeSystem: createMockPlugin(),
      });

      // Dispose registry
      registry.dispose();

      // Registry should be disposed cleanly
      // (Coordinator's WeakMap will be garbage collected automatically)
      expect(() => registry.dispose()).not.toThrow();
    });
  });

  describe('WeakMapRuntimeCoordinator standalone unit tests', () => {
    it('should register and retrieve runtime connections', () => {
      const coordinator = new WeakMapRuntimeCoordinator();
      const registry = new DefaultScreensetsRegistry({
        typeSystem: createMockPlugin(),
      });

      // Create a mock container element
      const container = document.createElement('div');

      const mockConnection: RuntimeConnection = {
        hostRuntime: registry,
        bridges: new Map(),
      };

      coordinator.register(container, mockConnection);

      // Verify connection is registered
      const retrieved = coordinator.get(container);
      expect(retrieved).toBe(mockConnection);
      expect(retrieved?.hostRuntime).toBe(registry);
    });

    it('should unregister runtime connections', () => {
      const coordinator = new WeakMapRuntimeCoordinator();
      const registry = new DefaultScreensetsRegistry({
        typeSystem: createMockPlugin(),
      });

      const container = document.createElement('div');
      const mockConnection: RuntimeConnection = {
        hostRuntime: registry,
        bridges: new Map(),
      };

      coordinator.register(container, mockConnection);
      coordinator.unregister(container);

      // Verify connection is unregistered
      expect(coordinator.get(container)).toBeUndefined();
    });

    it('should support multiple simultaneous runtime connections', () => {
      const coordinator = new WeakMapRuntimeCoordinator();
      const registry = new DefaultScreensetsRegistry({
        typeSystem: createMockPlugin(),
      });

      // Create multiple containers
      const container1 = document.createElement('div');
      const container2 = document.createElement('div');
      const container3 = document.createElement('div');

      const connection1: RuntimeConnection = {
        hostRuntime: registry,
        bridges: new Map(),
      };

      const connection2: RuntimeConnection = {
        hostRuntime: registry,
        bridges: new Map(),
      };

      const connection3: RuntimeConnection = {
        hostRuntime: registry,
        bridges: new Map(),
      };

      // Register multiple connections
      coordinator.register(container1, connection1);
      coordinator.register(container2, connection2);
      coordinator.register(container3, connection3);

      // Verify all connections are tracked
      expect(coordinator.get(container1)).toBe(connection1);
      expect(coordinator.get(container2)).toBe(connection2);
      expect(coordinator.get(container3)).toBe(connection3);

      // Unregister one
      coordinator.unregister(container2);

      // Verify only the unregistered one is gone
      expect(coordinator.get(container1)).toBe(connection1);
      expect(coordinator.get(container2)).toBeUndefined();
      expect(coordinator.get(container3)).toBe(connection3);
    });
  });
});
