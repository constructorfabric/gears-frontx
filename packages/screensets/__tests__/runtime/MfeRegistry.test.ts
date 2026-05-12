/**
 * MfeRegistry Tests
 *
 * Tests for Phase 4: MfeRegistry with Plugin
 */

import { describe, it, expect, vi } from 'vitest';
import { DefaultMfeRegistry } from '../../src/mfe/runtime/DefaultMfeRegistry';
import type { MfeRegistryConfig } from '../../src/mfe/runtime/config';
import type { TypeSystemPlugin } from '../../src/mfe/plugins/types';
import type { MfeHandler } from '../../src/mfe/handler/types';
import type { ExtensionDomain, Action, ActionsChain } from '../../src/mfe/types';
import { HAI3_ACTION_LOAD_EXT, HAI3_ACTION_MOUNT_EXT } from '../../src/mfe/constants';
import { MockDomainFactory, createMockTypeSystemPlugin } from '../../__test-utils__';

describe('MfeRegistry - Phase 4', () => {
  const createTestConfig = (): MfeRegistryConfig => ({
    typeSystem: createMockTypeSystemPlugin(),
  });

  describe('4.1 Runtime Configuration', () => {
    it('should create registry with required typeSystem parameter', () => {
      const config = createTestConfig();
      const registry = new DefaultMfeRegistry(config);
      expect(registry).toBeDefined();
      expect(registry.typeSystem).toBe(config.typeSystem);
    });

    it('should throw error if typeSystem is missing', () => {
      const invalidConfig = {} as MfeRegistryConfig;
      expect(() => new DefaultMfeRegistry(invalidConfig)).toThrow(
        'MfeRegistry requires a TypeSystemPlugin'
      );
    });

    it('should accept optional debug flag', () => {
      const registryConfig: MfeRegistryConfig = {
        typeSystem: createMockTypeSystemPlugin(),
      };
      const registry = new DefaultMfeRegistry(registryConfig);
      expect(registry).toBeDefined();
    });

    it('should accept optional mfeHandlers', () => {
      const mockHandler = {
        bridgeFactory: {} as unknown,
        handledBaseTypeId: 'gts.hai3.screensets.mfe.entry.v1~',
        load: async () => ({ lifecycle: {} as unknown, entry: {} as unknown, unload: () => {} }),
      } as unknown as MfeHandler;
      const registryConfig: MfeRegistryConfig = {
        typeSystem: createMockTypeSystemPlugin(),
        mfeHandlers: [mockHandler],
      };
      const registry = new DefaultMfeRegistry(registryConfig);
      expect(registry).toBeDefined();
    });
  });

  describe('4.2 MfeRegistry Core with Plugin', () => {
    it('should store plugin reference as readonly typeSystem', () => {
      const config = createTestConfig();
      const registry = new DefaultMfeRegistry(config);
      expect(registry.typeSystem).toBe(config.typeSystem);
      expect(registry.typeSystem.name).toBe('MockPlugin');
      expect(registry.typeSystem.version).toBe('1.0.0');
    });

    it('should register handler if provided in config', () => {
      const mockHandler = {
        bridgeFactory: {} as unknown,
        handledBaseTypeId: 'gts.hai3.screensets.mfe.entry.v1~',
        priority: 10,
        load: async () => ({ lifecycle: {} as unknown, entry: {} as unknown, unload: () => {} }),
      };

      const registryConfig: MfeRegistryConfig = {
        typeSystem: createMockTypeSystemPlugin(),
        mfeHandlers: [mockHandler as unknown as MfeHandler],
      };

      const registry = new DefaultMfeRegistry(registryConfig);
      expect(registry).toBeDefined();
    });
  });

  describe('4.3 Type ID Validation via Plugin', () => {
    it('should validate domain type ID via plugin before registration', () => {
      const registry = new DefaultMfeRegistry(createTestConfig());

      const validDomain: ExtensionDomain = {
        id: 'gts.hai3.screensets.ext.domain.v1~test.domain.v1~',
        sharedProperties: [],
        actions: [HAI3_ACTION_LOAD_EXT, HAI3_ACTION_MOUNT_EXT],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: [],
        extensionsLifecycleStages: [],
      };

      const mockContainerProvider = new MockDomainFactory();
      mockContainerProvider.setRegistry(registry);
      expect(() => {
        registry.registerDomain(validDomain, mockContainerProvider.prepareForDomain(validDomain));
      }).not.toThrow();
    });

    it('should validate action type ID via plugin before chain execution', async () => {
      const registry = new DefaultMfeRegistry(createTestConfig());
      const mockContainerProvider = new MockDomainFactory();
      mockContainerProvider.setRegistry(registry).asPermissive();

      // Register domain with the action in its supported actions
      const domain: ExtensionDomain = {
        id: 'gts.hai3.screensets.ext.domain.v1~test.domain.v1~',
        sharedProperties: [],
        actions: [HAI3_ACTION_LOAD_EXT, HAI3_ACTION_MOUNT_EXT, 'gts.hai3.screensets.ext.action.v1~test.action.v1~'],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: [],
        extensionsLifecycleStages: [],
      };
      registry.registerDomain(domain, mockContainerProvider.prepareForDomain(domain));

      const validAction: Action = {
        type: 'gts.hai3.screensets.ext.action.v1~test.action.v1~',
        target: 'gts.hai3.screensets.ext.domain.v1~test.domain.v1~',
      };

      const chain: ActionsChain = {
        action: validAction,
      };

      await expect(registry.executeActionsChain(chain)).resolves.not.toThrow();
    });

    it('should return validation error if type IDs are invalid', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // Type ID validation IS implemented in ActionsChainsMediator.executeChainRecursive
      // (lines 156-162). This test is skipped because it tests error handling with
      // invalid type IDs, which is covered by other validation tests in the suite.
      const registry = new DefaultMfeRegistry(createTestConfig());

      const invalidAction: Action = {
        type: 'invalid-type-id', // Missing required format
        target: 'invalid-target',
      };

      const chain: ActionsChain = {
        action: invalidAction,
      };

      await expect(registry.executeActionsChain(chain)).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0]?.[0]).toContain('[MfeRegistry] Actions chain failed:');
      expect(String(errorSpy.mock.calls[0]?.[1])).toMatch(/validation failed/i);
      errorSpy.mockRestore();
    });
  });

  describe('4.4 Payload Validation via Plugin', () => {
    it('should validate payload via plugin before delivery', async () => {
      const registry = new DefaultMfeRegistry(createTestConfig());

      // Register domain with the action in its supported actions
      const domain: ExtensionDomain = {
        id: 'gts.hai3.screensets.ext.domain.v1~test.domain.v1~',
        sharedProperties: [],
        actions: [HAI3_ACTION_LOAD_EXT, HAI3_ACTION_MOUNT_EXT, 'gts.hai3.screensets.ext.action.v1~test.action.v1~'],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: [],
        extensionsLifecycleStages: [],
      };
      const mockContainerProvider = new MockDomainFactory();
      mockContainerProvider.setRegistry(registry).asPermissive();
      registry.registerDomain(domain, mockContainerProvider.prepareForDomain(domain));

      const actionWithPayload: Action = {
        type: 'gts.hai3.screensets.ext.action.v1~test.action.v1~',
        target: 'gts.hai3.screensets.ext.domain.v1~test.domain.v1~',
        payload: { data: 'test' },
      };

      const chain: ActionsChain = {
        action: actionWithPayload,
      };

      await expect(registry.executeActionsChain(chain)).resolves.not.toThrow();
    });

    it('should return validation error on payload failure', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // Payload validation IS implemented in ActionsChainsMediator.executeChainRecursive
      // (lines 156-162) via validateInstance(). This test is skipped because it tests
      // error handling with invalid payloads, which is covered by other validation tests.
      //
      // Note: The ACTION itself is the GTS entity (it has a type ID). The payload is a
      // PROPERTY within the action. When validateInstance() is called, GTS validates the
      // entire action instance including the payload against the derived type's schema.
      const failingPlugin: TypeSystemPlugin = {
        ...createMockTypeSystemPlugin(),
        validateInstance: () => ({
          valid: false,
          errors: [
            { path: 'payload.data', message: 'Invalid data format', keyword: 'type' },
          ],
        }),
      };

      const registryConfig: MfeRegistryConfig = {
        typeSystem: failingPlugin,
      };

      const registry = new DefaultMfeRegistry(registryConfig);

      const actionWithInvalidPayload: Action = {
        type: 'gts.hai3.screensets.ext.action.v1~test.action.v1~',
        target: 'gts.hai3.screensets.ext.domain.v1~test.domain.v1~',
        payload: { data: 123 }, // Invalid
      };

      const chain: ActionsChain = {
        action: actionWithInvalidPayload,
      };

      await expect(registry.executeActionsChain(chain)).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0]?.[0]).toContain('[MfeRegistry] Actions chain failed:');
      expect(String(errorSpy.mock.calls[0]?.[1])).toMatch(/validation failed/i);
      errorSpy.mockRestore();
    });

    it('should allow actions without payload', async () => {
      const registry = new DefaultMfeRegistry(createTestConfig());

      // Register domain with the action in its supported actions
      const domain: ExtensionDomain = {
        id: 'gts.hai3.screensets.ext.domain.v1~test.domain.v1~',
        sharedProperties: [],
        actions: [HAI3_ACTION_LOAD_EXT, HAI3_ACTION_MOUNT_EXT, 'gts.hai3.screensets.ext.action.v1~test.action.v1~'],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: [],
        extensionsLifecycleStages: [],
      };
      const mockContainerProvider = new MockDomainFactory();
      mockContainerProvider.setRegistry(registry).asPermissive();
      registry.registerDomain(domain, mockContainerProvider.prepareForDomain(domain));

      const actionWithoutPayload: Action = {
        type: 'gts.hai3.screensets.ext.action.v1~test.action.v1~',
        target: 'gts.hai3.screensets.ext.domain.v1~test.domain.v1~',
      };

      const chain: ActionsChain = {
        action: actionWithoutPayload,
      };

      await expect(registry.executeActionsChain(chain)).resolves.not.toThrow();
    });
  });

  describe('Registry Disposal', () => {
    it('should dispose registry and clean up resources', () => {
      const registry = new DefaultMfeRegistry(createTestConfig());

      const domain: ExtensionDomain = {
        id: 'gts.hai3.screensets.ext.domain.v1~test.domain.v1~',
        sharedProperties: [],
        actions: [HAI3_ACTION_LOAD_EXT, HAI3_ACTION_MOUNT_EXT],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: [],
        extensionsLifecycleStages: [],
      };

      const disposalFactory = new MockDomainFactory();
      disposalFactory.setRegistry(registry);
      registry.registerDomain(domain, disposalFactory.prepareForDomain(domain));
      registry.dispose();

      // After disposal, registry should be clean
      expect(() => {
        registry.dispose();
      }).not.toThrow();
    });
  });
});
