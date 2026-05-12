/**
 * Dynamic Registration Tests (Phase 19.5)
 *
 * Tests for dynamic registration of extensions and domains at runtime.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DefaultMfeRegistry } from '../../../src/mfe/runtime/DefaultMfeRegistry';
import { MfeRegistry } from '../../../src/mfe/runtime/MfeRegistry';
import { GtsPlugin } from '../../../src/mfe/plugins/gts';
import type { ExtensionDomain, Extension, MfeEntry } from '../../../src/mfe/types';
import {
  HAI3_ACTION_LOAD_EXT,
  HAI3_ACTION_MOUNT_EXT,
  HAI3_ACTION_UNMOUNT_EXT,
} from '../../../src/mfe/constants';
import { MockDomainFactory, makeMfeHandlerDouble, type TestDoubleMfeHandler } from '../../../__test-utils__';

describe('Dynamic Registration', () => {
  let registry: DefaultMfeRegistry;
  let mockContainerProvider: MockDomainFactory;
  let typeSystem: GtsPlugin;

  const testDomain: ExtensionDomain = {
    id: 'gts.hai3.mfes.ext.domain.v1~test.dynamic.reg.domain.v1',
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
    id: 'gts.hai3.mfes.mfe.entry.v1~test.dynamic.reg.entry.v1',
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
    id: 'gts.hai3.mfes.ext.extension.v1~test.dynamic.reg.extension.v1',
    domain: testDomain.id,
    entry: testEntry.id,
  };

  beforeEach(() => {
    typeSystem = new GtsPlugin();
    registry = new DefaultMfeRegistry({
      typeSystem,
    });
    mockContainerProvider = new MockDomainFactory();

    // Register the entry instance with GTS plugin before using it
    typeSystem.register(testEntry);
  });

  describe('factory', () => {
    it('should return an instance of abstract MfeRegistry', () => {
      expect(registry).toBeInstanceOf(MfeRegistry);
    });
  });

  describe('registerExtension', () => {
    it('should register extension after runtime initialization', async () => {
      // Register domain first
      registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));

      // Register extension dynamically
      await registry.registerExtension(testExtension);

      // Verify registration
      const result = registry.getExtension(testExtension.id);
      expect(result).toBeDefined();
      expect(result?.id).toBe(testExtension.id);
    });

    it('should fail if domain not registered', async () => {
      // Try to register extension without domain
      await expect(registry.registerExtension(testExtension)).rejects.toThrow(
        /domain.*not registered|Referenced entity.*not found/i
      );
    });
  });

  describe('unregisterExtension', () => {
    it('should unregister extension', async () => {
      // Register domain and extension
      registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));

      // Register extension properly
      await registry.registerExtension(testExtension);

      // Unregister
      await registry.unregisterExtension(testExtension.id);

      // Verify unregistered
      const result = registry.getExtension(testExtension.id);
      expect(result).toBeUndefined();
    });

    it('should be idempotent', async () => {
      // Unregister non-existent extension should not throw
      await expect(registry.unregisterExtension('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('registerDomain', () => {
    it('should register domain at any time', () => {
      // Register domain
      registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));

      // Verify registration
      const result = registry.getDomain(testDomain.id);
      expect(result).toBeDefined();
      expect(result?.id).toBe(testDomain.id);
    });
  });

  describe('unregisterDomain', () => {
    it('should cascade unregister extensions in domain', async () => {
      // Register domain
      registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));

      // Register extension properly
      await registry.registerExtension(testExtension);

      // Unregister domain
      await registry.unregisterDomain(testDomain.id);

      // Verify domain and extension are unregistered
      expect(registry.getDomain(testDomain.id)).toBeUndefined();
      expect(registry.getExtension(testExtension.id)).toBeUndefined();
    });
  });

  describe('loadExtension and preloadExtension', () => {
    it('should require extension to be registered (19.5.7)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // Extension registration validation IS implemented in MountManager.loadExtension
      // (lines 105-111). This test is skipped because it tests error handling during
      // action chain execution, which is covered by other tests in the suite.
      registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));

      // Try to load non-existent extension via actions chain
      await expect(
        registry.executeActionsChain({
          action: {
            type: HAI3_ACTION_LOAD_EXT,
            target: testDomain.id,
            payload: { subject: 'nonexistent' },
          },
        })
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0]?.[0]).toContain('[MfeRegistry] Actions chain failed:');
      expect(String(errorSpy.mock.calls[0]?.[1])).toMatch(/validation failed/i);
      errorSpy.mockRestore();
    });

    it('should cache bundle for mounting (19.5.8)', async () => {
      // Register handler with lifecycle
      const mockLifecycle = {
        mount: vi.fn().mockResolvedValue(undefined),
        unmount: vi.fn().mockResolvedValue(undefined),
      };
      const mockHandler = makeMfeHandlerDouble({
        handledBaseTypeId: 'gts.hai3.mfes.mfe.entry.v1~',
        priority: 100,
        load: vi.fn().mockResolvedValue(mockLifecycle),
      });
      // Create new registry with handler in config
      registry = new DefaultMfeRegistry({
        typeSystem,
        mfeHandlers: [mockHandler],
      });

      // Register domain
      registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));
      // Attach a mount root — the React slot does this in production; tests must
      // do it explicitly before driving mount/unmount chains.
      registry.getMounter(testDomain.id).attach(document.createElement('div'));

      // Register extension properly
      await registry.registerExtension(testExtension);

      // Mount twice (first mount loads, second mount uses cached bundle)
      const container = document.createElement('div');
      mockContainerProvider.getContainer = vi.fn().mockReturnValue(container);

      await registry.executeActionsChain({
        action: {
          type: HAI3_ACTION_MOUNT_EXT,
          target: testDomain.id,
          payload: { subject: testExtension.id },
        },
      });

      await registry.executeActionsChain({
        action: {
          type: HAI3_ACTION_UNMOUNT_EXT,
          target: testDomain.id,
          payload: { subject: testExtension.id },
        },
      });

      await registry.executeActionsChain({
        action: {
          type: HAI3_ACTION_MOUNT_EXT,
          target: testDomain.id,
          payload: { subject: testExtension.id },
        },
      });

      // Verify handler.load was only called once (bundle cached after first load)
      expect(mockHandler.load).toHaveBeenCalledTimes(1);
    });

    it('should have same behavior as loadExtension for preloadExtension (19.5.9)', async () => {
      // Register handler
      const mockLifecycle = {
        mount: vi.fn().mockResolvedValue(undefined),
        unmount: vi.fn().mockResolvedValue(undefined),
      };
      const mockHandler = makeMfeHandlerDouble({
        handledBaseTypeId: 'gts.hai3.mfes.mfe.entry.v1~',
        priority: 100,
        load: vi.fn().mockResolvedValue(mockLifecycle),
      });
      // Create new registry with handler in config
      registry = new DefaultMfeRegistry({
        typeSystem,
        mfeHandlers: [mockHandler],
      });

      // Register domain
      registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));
      registry.getMounter(testDomain.id).attach(document.createElement('div'));

      // Register extension properly
      await registry.registerExtension(testExtension);

      // Mount (which triggers load)
      const container = document.createElement('div');
      mockContainerProvider.getContainer = vi.fn().mockReturnValue(container);

      await registry.executeActionsChain({
        action: {
          type: HAI3_ACTION_MOUNT_EXT,
          target: testDomain.id,
          payload: { subject: testExtension.id },
        },
      });

      // Verify extension is mounted (load completed successfully)
      expect(registry.getMountedExtensions(testDomain.id)).toEqual([testExtension.id]);
      expect(mockHandler.load).toHaveBeenCalledTimes(1);
    });
  });

  describe('mountExtension and unmountExtension', () => {
    let mockLifecycle: { mount: ReturnType<typeof vi.fn>; unmount: ReturnType<typeof vi.fn> };
    let mockHandler: TestDoubleMfeHandler;

    beforeEach(() => {
      mockLifecycle = {
        mount: vi.fn().mockResolvedValue(undefined),
        unmount: vi.fn().mockResolvedValue(undefined),
      };

      mockHandler = makeMfeHandlerDouble({
        handledBaseTypeId: 'gts.hai3.mfes.mfe.entry.v1~',
        priority: 0,
        load: vi.fn().mockResolvedValue(mockLifecycle),
      });
    });

    it('should auto-load if not loaded (19.5.10)', async () => {
      // Create new registry with handler in config
      registry = new DefaultMfeRegistry({
        typeSystem,
        mfeHandlers: [mockHandler],
      });

      // Register domain
      registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));
      registry.getMounter(testDomain.id).attach(document.createElement('div'));

      // Register extension properly
      await registry.registerExtension(testExtension);

      // Mount without prior explicit load (mount auto-loads)
      const container = document.createElement('div');
      mockContainerProvider.getContainer = vi.fn().mockReturnValue(container);

      await registry.executeActionsChain({
        action: {
          type: HAI3_ACTION_MOUNT_EXT,
          target: testDomain.id,
          payload: { subject: testExtension.id },
        },
      });

      // Verify handler.load was called (auto-load during mount)
      expect(mockHandler.load).toHaveBeenCalledTimes(1);

      // Verify mount was called with shadowRoot (not the raw container)
      // Phase 42: DefaultMountManager creates shadow DOM boundary
      expect(mockLifecycle.mount).toHaveBeenCalledWith(
        container.shadowRoot,
        expect.anything(),
        expect.objectContaining({
          extensionId: testExtension.id,
          domainId: testDomain.id,
        })
      );

      // Verify extension is mounted
      expect(registry.getMountedExtensions(testDomain.id)).toEqual([testExtension.id]);
    });

    it('should require extension to be registered (19.5.11)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // Extension registration validation IS implemented in MountManager.mountExtension
      // (lines 168-174). This test is skipped because it tests error handling during
      // action chain execution, which is covered by other tests in the suite.
      registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));

      // Try to mount non-existent extension via actions chain
      await expect(
        registry.executeActionsChain({
          action: {
            type: HAI3_ACTION_MOUNT_EXT,
            target: testDomain.id,
            payload: { subject: 'nonexistent' },
          },
        })
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0]?.[0]).toContain('[MfeRegistry] Actions chain failed:');
      expect(String(errorSpy.mock.calls[0]?.[1])).toMatch(/validation failed/i);
      errorSpy.mockRestore();
    });

    it('should keep extension registered and bundle loaded after unmount (19.5.12)', async () => {
      // Create new registry with handler in config
      registry = new DefaultMfeRegistry({
        typeSystem,
        mfeHandlers: [mockHandler],
      });

      // Register domain
      registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));
      registry.getMounter(testDomain.id).attach(document.createElement('div'));

      // Register extension properly
      await registry.registerExtension(testExtension);

      // Mount then unmount
      const container = document.createElement('div');
      mockContainerProvider.getContainer = vi.fn().mockReturnValue(container);

      await registry.executeActionsChain({
        action: {
          type: HAI3_ACTION_MOUNT_EXT,
          target: testDomain.id,
          payload: { subject: testExtension.id },
        },
      });

      await registry.executeActionsChain({
        action: {
          type: HAI3_ACTION_UNMOUNT_EXT,
          target: testDomain.id,
          payload: { subject: testExtension.id },
        },
      });

      // Verify extension is still registered after unmount
      const extension = registry.getExtension(testExtension.id);
      expect(extension).toBeDefined();
      expect(extension?.id).toBe(testExtension.id);

      // Verify bundle is still loaded by re-mounting quickly (should not call load again)
      await registry.executeActionsChain({
        action: {
          type: HAI3_ACTION_MOUNT_EXT,
          target: testDomain.id,
          payload: { subject: testExtension.id },
        },
      });

      // Handler.load should only be called once (bundle cached)
      expect(mockHandler.load).toHaveBeenCalledTimes(1);
    });
  });

  describe('unregisterExtension with mounted MFE', () => {
    let mockLifecycle: { mount: ReturnType<typeof vi.fn>; unmount: ReturnType<typeof vi.fn> };
    let mockHandler: TestDoubleMfeHandler;

    beforeEach(() => {
      mockLifecycle = {
        mount: vi.fn().mockResolvedValue(undefined),
        unmount: vi.fn().mockResolvedValue(undefined),
      };

      mockHandler = makeMfeHandlerDouble({
        handledBaseTypeId: 'gts.hai3.mfes.mfe.entry.v1~',
        priority: 0,
        load: vi.fn().mockResolvedValue(mockLifecycle),
      });
    });

    it('should unmount MFE if mounted (19.5.3)', async () => {
      // Create new registry with handler in config
      registry = new DefaultMfeRegistry({
        typeSystem,
        mfeHandlers: [mockHandler],
      });

      // Register domain
      registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));
      registry.getMounter(testDomain.id).attach(document.createElement('div'));

      // Register extension properly
      await registry.registerExtension(testExtension);

      // Mount
      const container = document.createElement('div');
      mockContainerProvider.getContainer = vi.fn().mockReturnValue(container);

      await registry.executeActionsChain({
        action: {
          type: HAI3_ACTION_MOUNT_EXT,
          target: testDomain.id,
          payload: { subject: testExtension.id },
        },
      });

      // Verify mounted
      expect(mockLifecycle.mount).toHaveBeenCalled();
      expect(registry.getMountedExtensions(testDomain.id)).toEqual([testExtension.id]);

      // Unregister - should auto-unmount
      await registry.unregisterExtension(testExtension.id);

      // Verify unmount was called
      expect(mockLifecycle.unmount).toHaveBeenCalled();

      // Verify extension is unregistered
      expect(registry.getExtension(testExtension.id)).toBeUndefined();

      // Verify no longer mounted
      expect(registry.getMountedExtensions(testDomain.id)).toEqual([]);
    });
  });

  describe('hot-swap registration', () => {
    it('should support unregister + register with same ID (19.5.14)', async () => {
      // Register domain
      registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));

      // Register first extension
      await registry.registerExtension(testExtension);

      // Verify first registration
      const firstExtension = registry.getExtension(testExtension.id);
      expect(firstExtension).toBeDefined();
      expect(firstExtension?.id).toBe(testExtension.id);

      // Unregister
      await registry.unregisterExtension(testExtension.id);

      // Create new extension with same ID but different entry
      const newEntry: MfeEntry = {
        id: 'gts.hai3.mfes.mfe.entry.v1~test.dynamic.reg.entry.v2',
        requiredProperties: [],
        optionalProperties: [],
        actions: [],
        domainActions: [
          HAI3_ACTION_LOAD_EXT,
          HAI3_ACTION_MOUNT_EXT,
          HAI3_ACTION_UNMOUNT_EXT,
        ],
      };
      typeSystem.register(newEntry);

      const newExtension: Extension = {
        id: testExtension.id, // Same ID
        domain: testDomain.id,
        entry: newEntry.id, // Different entry
      };

      // Register again with same ID
      await registry.registerExtension(newExtension);

      // Verify new registration
      const secondExtension = registry.getExtension(newExtension.id);
      expect(secondExtension).toBeDefined();
      expect(secondExtension?.id).toBe(newExtension.id);
      expect(secondExtension?.entry).toBe(newEntry.id);
    });
  });
});
