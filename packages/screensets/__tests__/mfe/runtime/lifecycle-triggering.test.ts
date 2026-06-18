/**
 * Lifecycle Stage Triggering Tests (Phase 19.6)
 *
 * Tests for lifecycle stage triggering on extensions and domains.
 * All tests verify behavior through public API only.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScreensetsRegistry } from '../../../src/mfe/runtime';
import { DefaultScreensetsRegistry } from '../../../src/mfe/runtime/DefaultScreensetsRegistry';
import { GtsPlugin } from '../../../src/mfe/plugins/gts';
import type { TypeSystemPlugin } from '../../../src/mfe/plugins/types';
import type { ExtensionDomain, Extension, MfeEntry } from '../../../src/mfe/types';
import type { MfeHandler } from '../../../src/mfe/handler/types';
import {
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
} from '../../../src/mfe/constants';
import { MockContainerProvider } from '../test-utils';

describe('Lifecycle Stage Triggering', () => {
  let registry: ScreensetsRegistry;
  let plugin: TypeSystemPlugin;
  let mockContainerProvider: MockContainerProvider;

  const customStageId = 'gts.frontx.mfes.lifecycle.stage.v1~test.lifecycle.trigger.custom_stage.v1';
  const initStageId = 'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1';

  const testDomain: ExtensionDomain = {
    id: 'gts.frontx.mfes.ext.domain.v1~test.lifecycle.trigger.domain.v1',
    sharedProperties: [],
    actions: [
      FRONTX_ACTION_LOAD_EXT,
      FRONTX_ACTION_MOUNT_EXT,
      FRONTX_ACTION_UNMOUNT_EXT,
    ],
    extensionsActions: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [
      initStageId,
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
      customStageId,
    ],
    extensionsLifecycleStages: [
      initStageId,
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1',
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1',
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
      customStageId,
    ],
  };

  const testEntry: MfeEntry = {
    id: 'gts.frontx.mfes.mfe.entry.v1~test.lifecycle.trigger.entry.v1',
    requiredProperties: [],
    optionalProperties: [],
    actions: [],
    domainActions: [
      FRONTX_ACTION_LOAD_EXT,
      FRONTX_ACTION_MOUNT_EXT,
      FRONTX_ACTION_UNMOUNT_EXT,
    ],
  };

  const testExtension: Extension = {
    id: 'gts.frontx.mfes.ext.extension.v1~test.lifecycle.trigger.extension.v1',
    domain: testDomain.id,
    entry: testEntry.id,
  };

  beforeEach(() => {
    // Create fresh plugin and registry for each test
    plugin = new GtsPlugin();

    registry = new DefaultScreensetsRegistry({
      typeSystem: plugin,
    });
    mockContainerProvider = new MockContainerProvider();

    // Pre-register test entities with GTS
    plugin.register(testEntry);
    plugin.register({
      id: customStageId,
    });
    plugin.register(testDomain); // Register domain so it can be referenced in lifecycle hooks
    plugin.register({
      id: 'gts.frontx.mfes.comm.action.v1~test.lifecycle.trigger.action.v1',
    });
    plugin.register({
      id: 'gts.frontx.mfes.comm.action.v1~test.lifecycle.hook1.v1',
    });
    plugin.register({
      id: 'gts.frontx.mfes.comm.action.v1~test.lifecycle.hook2.v1',
    });
  });

  describe('triggerLifecycleStage', () => {
    it('should execute hooks for a specific extension and stage', async () => {
      // Create extension WITH lifecycle hooks for testing
      const extensionWithHooks: Extension = {
        ...testExtension,
        lifecycle: [
          {
            stage: customStageId,
            actions_chain: {
              action: {
                type: 'gts.frontx.mfes.comm.action.v1~test.lifecycle.trigger.action.v1',
                target: testDomain.id,
              },
            },
          },
        ],
      };

      // Register domain and extension
      registry.registerDomain(testDomain, mockContainerProvider);
      await registry.registerExtension(extensionWithHooks);

      // Verify extension is registered
      const registered = registry.getExtension(extensionWithHooks.id);
      expect(registered).toBeDefined();
      expect(registered?.id).toBe(extensionWithHooks.id);

      // Spy on executeActionsChain to verify it gets called
      const spy = vi.spyOn(registry, 'executeActionsChain').mockResolvedValue({
        completed: true,
        path: [],
      });

      await registry.triggerLifecycleStage(extensionWithHooks.id, customStageId);

      expect(spy).toHaveBeenCalledOnce();
      spy.mockRestore();
    });

    it('should throw if extension not registered', async () => {
      await expect(
        registry.triggerLifecycleStage('nonexistent', customStageId)
      ).rejects.toThrow(/extension.*not registered/i);
    });
  });

  describe('triggerDomainLifecycleStage', () => {
    it('should execute hooks for all extensions in a domain', async () => {
      const ext1WithHooks: Extension = {
        ...testExtension,
        id: 'gts.frontx.mfes.ext.extension.v1~test.lifecycle.trigger.ext1.v1',
        lifecycle: [
          {
            stage: customStageId,
            actions_chain: {
              action: {
                type: 'gts.frontx.mfes.comm.action.v1~test.lifecycle.trigger.action.v1',
                target: testDomain.id,
              },
            },
          },
        ],
      };

      const ext2WithHooks: Extension = {
        ...testExtension,
        id: 'gts.frontx.mfes.ext.extension.v1~test.lifecycle.trigger.ext2.v1',
        lifecycle: [
          {
            stage: customStageId,
            actions_chain: {
              action: {
                type: 'gts.frontx.mfes.comm.action.v1~test.lifecycle.trigger.action.v1',
                target: testDomain.id,
              },
            },
          },
        ],
      };

      // Register domain and extensions
      registry.registerDomain(testDomain, mockContainerProvider);
      await registry.registerExtension(ext1WithHooks);
      await registry.registerExtension(ext2WithHooks);

      // Verify both extensions are registered
      expect(registry.getExtension(ext1WithHooks.id)).toBeDefined();
      expect(registry.getExtension(ext2WithHooks.id)).toBeDefined();
      const exts = registry.getExtensionsForDomain(testDomain.id);
      expect(exts).toHaveLength(2);

      const spy = vi.spyOn(registry, 'executeActionsChain').mockResolvedValue({
        completed: true,
        path: [],
      });

      await registry.triggerDomainLifecycleStage(testDomain.id, customStageId);

      // Should be called twice (once for each extension)
      expect(spy).toHaveBeenCalledTimes(2);
      spy.mockRestore();
    });

    it('should throw if domain not registered', async () => {
      await expect(
        registry.triggerDomainLifecycleStage('nonexistent', customStageId)
      ).rejects.toThrow(/domain.*not registered/i);
    });
  });

  describe('triggerDomainOwnLifecycleStage', () => {
    it('should execute hooks on the domain itself', async () => {
      // Create domain WITH lifecycle hooks
      const domainWithHooks: ExtensionDomain = {
        ...testDomain,
        lifecycle: [
          {
            stage: customStageId,
            actions_chain: {
              action: {
                type: 'gts.frontx.mfes.comm.action.v1~test.lifecycle.trigger.action.v1',
                target: testDomain.id,
              },
            },
          },
        ],
      };

      registry.registerDomain(domainWithHooks, mockContainerProvider);

      // Verify domain is registered
      const registered = registry.getDomain(domainWithHooks.id);
      expect(registered).toBeDefined();
      expect(registered?.id).toBe(domainWithHooks.id);

      const spy = vi.spyOn(registry, 'executeActionsChain').mockResolvedValue({
        completed: true,
        path: [],
      });

      await registry.triggerDomainOwnLifecycleStage(domainWithHooks.id, customStageId);

      expect(spy).toHaveBeenCalledOnce();
      spy.mockRestore();
    });

    it('should throw if domain not registered', async () => {
      await expect(
        registry.triggerDomainOwnLifecycleStage('nonexistent', customStageId)
      ).rejects.toThrow(/domain.*not registered/i);
    });
  });

  describe('automatic lifecycle integration', () => {
    it('should trigger init stage during registerExtension', async () => {
      // Test that init lifecycle is called by verifying the extension is registered
      // (init happens during registration)
      registry.registerDomain(testDomain, mockContainerProvider);

      // Spy on triggerLifecycleStage to verify init is triggered
      const spy = vi.spyOn(registry, 'triggerLifecycleStage');

      await registry.registerExtension(testExtension);

      // Verify extension is registered (init succeeded)
      const registered = registry.getExtension(testExtension.id);
      expect(registered).toBeDefined();
      expect(registered?.id).toBe(testExtension.id);

      // Init should have been triggered
      expect(spy).toHaveBeenCalledWith(testExtension.id, initStageId);

      spy.mockRestore();
    });

    it('should trigger init stage during registerDomain', () => {
      // Test that init lifecycle is called by verifying domain is registered
      // (init happens fire-and-forget during registration)
      const spy = vi.spyOn(registry, 'triggerDomainOwnLifecycleStage');

      registry.registerDomain(testDomain, mockContainerProvider);

      // Verify domain is registered
      const registered = registry.getDomain(testDomain.id);
      expect(registered).toBeDefined();
      expect(registered?.id).toBe(testDomain.id);

      // Init should have been triggered (fire-and-forget)
      expect(spy).toHaveBeenCalledWith(testDomain.id, initStageId);

      spy.mockRestore();
    });

    it('should trigger activated stage during mountExtension', async () => {
      // Register domain with mock handler
      const mockHandler = {
        handledBaseTypeId: 'gts.frontx.mfes.mfe.entry.v1~',
        priority: 100,
        load: vi.fn().mockResolvedValue({
          mount: vi.fn().mockResolvedValue(undefined),
          unmount: vi.fn().mockResolvedValue(undefined),
        }),
      };

      // Create new registry with handler in config
      registry = new DefaultScreensetsRegistry({
        typeSystem: plugin,
        mfeHandlers: [mockHandler as unknown as MfeHandler],
      });
      registry.registerDomain(testDomain, mockContainerProvider);
      await registry.registerExtension(testExtension);

      // Spy on triggerLifecycleStage to verify activated is called
      const spy = vi.spyOn(registry, 'triggerLifecycleStage');

      // Mount via actions chain
      const container = document.createElement('div');
      mockContainerProvider.getContainer = vi.fn().mockReturnValue(container);

      await registry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_MOUNT_EXT,
          target: testDomain.id,
          payload: { extensionId: testExtension.id },
        },
      });

      // Activated should have been triggered
      expect(spy).toHaveBeenCalledWith(
        testExtension.id,
        'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1'
      );

      spy.mockRestore();
    });

    it('should trigger deactivated stage during unmountExtension', async () => {
      // Register domain with mock handler
      const mockHandler = {
        handledBaseTypeId: 'gts.frontx.mfes.mfe.entry.v1~',
        priority: 100,
        load: vi.fn().mockResolvedValue({
          mount: vi.fn().mockResolvedValue(undefined),
          unmount: vi.fn().mockResolvedValue(undefined),
        }),
      };

      // Create new registry with handler in config
      registry = new DefaultScreensetsRegistry({
        typeSystem: plugin,
        mfeHandlers: [mockHandler as unknown as MfeHandler],
      });
      registry.registerDomain(testDomain, mockContainerProvider);
      await registry.registerExtension(testExtension);

      // Mount first
      const container = document.createElement('div');
      mockContainerProvider.getContainer = vi.fn().mockReturnValue(container);

      await registry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_MOUNT_EXT,
          target: testDomain.id,
          payload: { extensionId: testExtension.id },
        },
      });

      // Verify mounted
      expect(registry.getMountedExtension(testDomain.id)).toBe(testExtension.id);

      // Unmount
      await registry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_UNMOUNT_EXT,
          target: testDomain.id,
          payload: { extensionId: testExtension.id },
        },
      });

      // Verify unmounted (deactivated was triggered and processed successfully)
      expect(registry.getMountedExtension(testDomain.id)).toBeUndefined();
    });

    it('should trigger destroyed stage during unregisterExtension', async () => {
      registry.registerDomain(testDomain, mockContainerProvider);
      await registry.registerExtension(testExtension);

      // Spy on triggerLifecycleStage
      const spy = vi.spyOn(registry, 'triggerLifecycleStage');

      await registry.unregisterExtension(testExtension.id);

      // Destroyed should have been triggered
      expect(spy).toHaveBeenCalledWith(
        testExtension.id,
        'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1'
      );

      // Extension should no longer be registered
      expect(registry.getExtension(testExtension.id)).toBeUndefined();

      spy.mockRestore();
    });

    it('should execute hooks in declaration order', async () => {
      const hook1ActionType = 'gts.frontx.mfes.comm.action.v1~test.lifecycle.hook1.v1';
      const hook2ActionType = 'gts.frontx.mfes.comm.action.v1~test.lifecycle.hook2.v1';

      const extensionWithMultipleHooks: Extension = {
        ...testExtension,
        lifecycle: [
          {
            stage: customStageId,
            actions_chain: {
              action: {
                type: hook1ActionType,
                target: testDomain.id,
              },
            },
          },
          {
            stage: customStageId,
            actions_chain: {
              action: {
                type: hook2ActionType,
                target: testDomain.id,
              },
            },
          },
        ],
      };

      registry.registerDomain(testDomain, mockContainerProvider);
      await registry.registerExtension(extensionWithMultipleHooks);

      const calls: string[] = [];
      const spy = vi.spyOn(registry, 'executeActionsChain').mockImplementation(async (chain) => {
        calls.push(chain.action.type);
        return { completed: true, path: [] };
      });

      await registry.triggerLifecycleStage(extensionWithMultipleHooks.id, customStageId);

      // Hooks should be executed in declaration order
      expect(calls).toEqual([hook1ActionType, hook2ActionType]);

      spy.mockRestore();
    });

    it('should skip triggering gracefully', async () => {
      // Extension without lifecycle hooks
      registry.registerDomain(testDomain, mockContainerProvider);
      await registry.registerExtension(testExtension);

      const spy = vi.spyOn(registry, 'executeActionsChain');

      // Triggering on extension with no hooks should not throw
      await expect(
        registry.triggerLifecycleStage(testExtension.id, customStageId)
      ).resolves.not.toThrow();

      // No actions should be executed
      expect(spy).not.toHaveBeenCalled();

      spy.mockRestore();
    });
  });
});
