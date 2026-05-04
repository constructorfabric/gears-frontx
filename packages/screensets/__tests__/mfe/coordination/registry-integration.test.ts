/**
 * Runtime Coordinator Registry Integration Tests
 *
 * Verifies the registry constructs and wires its internal runtime coordinator
 * during mount/unmount flows, while coordinator storage behavior remains covered
 * by focused unit tests below.
 */

import { describe, it, expect, vi } from 'vitest';
import { DefaultMfeRegistry } from '../../../src/mfe/runtime/DefaultMfeRegistry';
import { WeakMapRuntimeCoordinator } from '../../../src/mfe/coordination/weak-map-runtime-coordinator';
import type { RuntimeConnection, RuntimeCoordinator } from '../../../src/mfe/coordination/types';
import { GtsPlugin } from '../../../src/mfe/plugins/gts';
import {
  HAI3_ACTION_LOAD_EXT,
  HAI3_ACTION_MOUNT_EXT,
  HAI3_ACTION_UNMOUNT_EXT,
} from '../../../src/mfe/constants';
import type { Extension, ExtensionDomain, MfeEntry } from '../../../src/mfe/types';
import { MockDomainFactory, createMockTypeSystemPlugin, makeMfeHandlerDouble } from '../../../__test-utils__';

const toggleDomain: ExtensionDomain = {
  id: 'gts.hai3.mfes.ext.domain.v1~test.coordinator.integration.domain.v1',
  sharedProperties: [],
  actions: [
    HAI3_ACTION_LOAD_EXT,
    HAI3_ACTION_MOUNT_EXT,
    HAI3_ACTION_UNMOUNT_EXT,
  ],
  extensionsActions: [],
  defaultActionTimeout: 5000,
  lifecycleStages: [
    'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.init.v1',
    'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.destroyed.v1',
  ],
  extensionsLifecycleStages: [
    'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.init.v1',
    'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.activated.v1',
    'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.deactivated.v1',
    'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.destroyed.v1',
  ],
};

const testEntry: MfeEntry = {
  id: 'gts.hai3.mfes.mfe.entry.v1~test.coordinator.integration.entry.v1',
  requiredProperties: [],
  optionalProperties: [],
  actions: [],
  domainActions: [
    HAI3_ACTION_LOAD_EXT,
    HAI3_ACTION_MOUNT_EXT,
    HAI3_ACTION_UNMOUNT_EXT,
  ],
};

const testExtension: Extension = {
  id: 'gts.hai3.mfes.ext.extension.v1~test.coordinator.integration.extension.v1',
  domain: toggleDomain.id,
  entry: testEntry.id,
};

function getInternalCoordinator(registry: DefaultMfeRegistry): RuntimeCoordinator {
  return Reflect.get(registry, 'coordinator') as RuntimeCoordinator;
}

describe('Runtime Coordinator Integration - Task 8.4.8', () => {
  describe('Registry coordinator wiring', () => {
    it('creates a WeakMapRuntimeCoordinator internally', () => {
      const registry = new DefaultMfeRegistry({
        typeSystem: createMockTypeSystemPlugin(),
      });

      expect(getInternalCoordinator(registry)).toBeInstanceOf(WeakMapRuntimeCoordinator);
    });

    it('registers and unregisters mounted bridges in the internal coordinator', async () => {
      const typeSystem = new GtsPlugin();
      typeSystem.register(testEntry);

      const registry = new DefaultMfeRegistry({
        typeSystem,
        mfeHandlers: [
          makeMfeHandlerDouble({
            handledBaseTypeId: 'gts.hai3.mfes.mfe.entry.v1~',
            priority: 100,
          }),
        ],
      });
      const containerProvider = new MockDomainFactory();
      const container = document.createElement('div');
      containerProvider.getContainer = vi.fn().mockReturnValue(container);

      registry.registerDomain(toggleDomain, containerProvider.prepareForDomain(toggleDomain));
      await registry.registerExtension(testExtension);

      await registry.executeActionsChain({
        action: {
          type: HAI3_ACTION_MOUNT_EXT,
          target: toggleDomain.id,
          payload: { subject: testExtension.id },
        },
      });

      const coordinator = getInternalCoordinator(registry);
      const connection = coordinator.get(container);
      const bridge = registry.getParentBridge(testExtension.id);

      expect(connection?.hostRuntime).toBe(registry);
      expect(connection?.bridges.get(testExtension.id)).toBe(bridge);
      expect(bridge?.instanceId).toContain(testExtension.id);

      await registry.executeActionsChain({
        action: {
          type: HAI3_ACTION_UNMOUNT_EXT,
          target: toggleDomain.id,
          payload: { subject: testExtension.id },
        },
      });

      expect(coordinator.get(container)).toBeUndefined();
      expect(registry.getParentBridge(testExtension.id)).toBeNull();
    });
  });

  describe('Coordinator encapsulation', () => {
    it('should not pollute window global scope', () => {
      new DefaultMfeRegistry({
        typeSystem: createMockTypeSystemPlugin(),
      });

      // Verify no global pollution
      const globalObj = globalThis as Record<string, unknown>;
      expect(globalObj.__hai3_runtime_connections).toBeUndefined();
      expect(globalObj.__mfe_registry).toBeUndefined();
      expect(globalObj.__screensets_coordinator).toBeUndefined();
    });
  });
  describe('Registry lifecycle cleanup', () => {
    it('should clean up coordinator on registry disposal', () => {
      const registry = new DefaultMfeRegistry({
        typeSystem: createMockTypeSystemPlugin(),
      });

      // Dispose registry
      registry.dispose();

      // Registry should be disposed cleanly
      // (Coordinator's WeakMap will be garbage collected automatically)
      expect(() => {
        registry.dispose();
      }).not.toThrow();
    });
  });

  describe('WeakMapRuntimeCoordinator standalone unit tests', () => {
    it('should register and retrieve runtime connections', () => {
      const coordinator = new WeakMapRuntimeCoordinator();
      const registry = new DefaultMfeRegistry({
        typeSystem: createMockTypeSystemPlugin(),
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
      const registry = new DefaultMfeRegistry({
        typeSystem: createMockTypeSystemPlugin(),
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
      const registry = new DefaultMfeRegistry({
        typeSystem: createMockTypeSystemPlugin(),
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
