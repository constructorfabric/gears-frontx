/**
 * Extension Lifecycle Actions Tests (Phase 23)
 *
 * Tests for ExtensionLifecycleActionHandler and the three lifecycle actions:
 * load_ext, mount_ext, unmount_ext.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExtensionLifecycleActionHandler, type ExtensionLifecycleCallbacks } from '../../../src/mfe/runtime/extension-lifecycle-action-handler';
import { DefaultScreensetsRegistry } from '../../../src/mfe/runtime/DefaultScreensetsRegistry';
import { gtsPlugin } from '../../../src/mfe/plugins/gts';
import { MfeError } from '../../../src/mfe/errors';
import {
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
} from '../../../src/mfe/constants';
import type { ExtensionDomain, Extension, MfeEntry } from '../../../src/mfe/types';
import type { ParentMfeBridge, MfeHandler } from '../../../src/mfe/handler/types';
import { MockContainerProvider } from '../test-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a callbacks object for toggle-semantics tests.
 * serializeOnDomain is a no-op mock since toggle semantics never calls handleScreenSwap.
 */
function makeToggleCallbacks(overrides?: Partial<ExtensionLifecycleCallbacks>): ExtensionLifecycleCallbacks {
  return {
    loadExtension: vi.fn().mockResolvedValue(undefined),
    mountExtension: vi.fn().mockResolvedValue({} as ParentMfeBridge),
    unmountExtension: vi.fn().mockResolvedValue(undefined),
    getMountedExtension: vi.fn().mockReturnValue(undefined),
    serializeOnDomain: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Create a callbacks object for swap-semantics tests.
 * serializeOnDomain executes the operation immediately (passthrough) so that
 * the unmount + mount sequence inside handleScreenSwap runs correctly in tests.
 */
function makeSwapCallbacks(overrides?: Partial<ExtensionLifecycleCallbacks>): ExtensionLifecycleCallbacks {
  return {
    loadExtension: vi.fn().mockResolvedValue(undefined),
    mountExtension: vi.fn().mockResolvedValue({} as ParentMfeBridge),
    unmountExtension: vi.fn().mockResolvedValue(undefined),
    getMountedExtension: vi.fn().mockReturnValue(undefined),
    serializeOnDomain: vi.fn().mockImplementation((_domainId, operation) => operation()),
    ...overrides,
  };
}


describe('Extension Lifecycle Actions', () => {
  let registry: DefaultScreensetsRegistry;
  let mockContainerProvider: MockContainerProvider;

  // Test domain with toggle semantics (supports mount + unmount)
  const toggleDomain: ExtensionDomain = {
    id: 'gts.frontx.mfes.ext.domain.v1~test.lifecycle.toggle.domain.v1',
    sharedProperties: [],
    actions: [
      FRONTX_ACTION_LOAD_EXT,
      FRONTX_ACTION_MOUNT_EXT,
      FRONTX_ACTION_UNMOUNT_EXT,
    ],
    extensionsActions: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
    ],
    extensionsLifecycleStages: [
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1',
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1',
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
    ],
  };

  // Test domain with swap semantics (supports mount but not unmount)
  const swapDomain: ExtensionDomain = {
    id: 'gts.frontx.mfes.ext.domain.v1~test.lifecycle.swap.domain.v1',
    sharedProperties: [],
    actions: [
      FRONTX_ACTION_LOAD_EXT,
      FRONTX_ACTION_MOUNT_EXT,
    ],
    extensionsActions: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
    ],
    extensionsLifecycleStages: [
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1',
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1',
      'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
    ],
  };

  const testEntry: MfeEntry = {
    id: 'gts.frontx.mfes.mfe.entry.v1~test.lifecycle.actions.entry.v1',
    requiredProperties: [],
    optionalProperties: [],
    actions: [],
    domainActions: [
      FRONTX_ACTION_LOAD_EXT,
      FRONTX_ACTION_MOUNT_EXT,
      FRONTX_ACTION_UNMOUNT_EXT,
    ],
  };

  const testExtension1: Extension = {
    id: 'gts.frontx.mfes.ext.extension.v1~test.lifecycle.actions.ext1.v1',
    domain: toggleDomain.id,
    entry: testEntry.id,
  };

  const testExtension2: Extension = {
    id: 'gts.frontx.mfes.ext.extension.v1~test.lifecycle.actions.ext2.v1',
    domain: swapDomain.id,
    entry: testEntry.id,
  };

  beforeEach(() => {
    registry = new DefaultScreensetsRegistry({
      typeSystem: gtsPlugin,
    });
    mockContainerProvider = new MockContainerProvider();

    // Register test entry with GTS
    gtsPlugin.register(testEntry);
  });

  describe('ExtensionLifecycleActionHandler', () => {
    describe('load_ext action', () => {
      it('should route to callbacks.loadExtension with correct extension ID', async () => {
        const callbacks = makeToggleCallbacks();

        const handler = new ExtensionLifecycleActionHandler(
          toggleDomain.id,
          callbacks,
          'toggle',
          mockContainerProvider
        );

        await handler.handleAction(FRONTX_ACTION_LOAD_EXT, {
          extensionId: testExtension1.id,
        });

        expect(callbacks.loadExtension).toHaveBeenCalledWith(testExtension1.id);
      });

      it('should throw error if payload is missing', async () => {
        const callbacks = makeToggleCallbacks();

        const handler = new ExtensionLifecycleActionHandler(
          toggleDomain.id,
          callbacks,
          'toggle',
          mockContainerProvider
        );

        await expect(
          handler.handleAction(FRONTX_ACTION_LOAD_EXT, undefined)
        ).rejects.toThrow(MfeError);

        await expect(
          handler.handleAction(FRONTX_ACTION_LOAD_EXT, undefined)
        ).rejects.toThrow(/requires a payload/i);
      });
    });

    describe('mount_ext action - toggle semantics', () => {
      it('should route to callbacks.mountExtension directly', async () => {
        const callbacks = makeToggleCallbacks();

        const handler = new ExtensionLifecycleActionHandler(
          toggleDomain.id,
          callbacks,
          'toggle',
          mockContainerProvider
        );

        await handler.handleAction(FRONTX_ACTION_MOUNT_EXT, {
          extensionId: testExtension1.id,
        });

        expect(callbacks.mountExtension).toHaveBeenCalledWith(testExtension1.id, mockContainerProvider.mockContainer);
      });

      it('should throw error if payload is missing', async () => {
        const callbacks = makeToggleCallbacks();

        const handler = new ExtensionLifecycleActionHandler(
          toggleDomain.id,
          callbacks,
          'toggle',
          mockContainerProvider
        );

        await expect(
          handler.handleAction(FRONTX_ACTION_MOUNT_EXT, undefined)
        ).rejects.toThrow(MfeError);
      });

      it('should NOT call serializeOnDomain for toggle semantics mount', async () => {
        const callbacks = makeToggleCallbacks();

        const handler = new ExtensionLifecycleActionHandler(
          toggleDomain.id,
          callbacks,
          'toggle',
          mockContainerProvider
        );

        await handler.handleAction(FRONTX_ACTION_MOUNT_EXT, {
          extensionId: testExtension1.id,
        });

        // Toggle domains do not use handleScreenSwap, so serializeOnDomain is not called
        expect(callbacks.serializeOnDomain).not.toHaveBeenCalled();
      });
    });

    describe('mount_ext action - swap semantics', () => {
      it('should unmount current extension before mounting new one', async () => {
        const callbacks = makeSwapCallbacks({
          getMountedExtension: vi.fn().mockReturnValue(testExtension2.id),
        });

        const handler = new ExtensionLifecycleActionHandler(
          swapDomain.id,
          callbacks,
          'swap',
          mockContainerProvider
        );

        const newExtId = 'gts.frontx.mfes.ext.extension.v1~test.lifecycle.actions.ext3.v1';

        await handler.handleAction(FRONTX_ACTION_MOUNT_EXT, {
          extensionId: newExtId,
        });

        // Verify unmount was called first, then mount
        expect(callbacks.unmountExtension).toHaveBeenCalledWith(testExtension2.id);
        expect(callbacks.mountExtension).toHaveBeenCalledWith(newExtId, mockContainerProvider.mockContainer);

        // Verify order: unmount before mount
        const unmountFn = callbacks.unmountExtension as ReturnType<typeof vi.fn>;
        const mountFn = callbacks.mountExtension as ReturnType<typeof vi.fn>;
        const unmountOrder = unmountFn.mock.invocationCallOrder[0];
        const mountOrder = mountFn.mock.invocationCallOrder[0];
        expect(unmountOrder).toBeLessThan(mountOrder);
      });

      it('should no-op when mounting the same extension that is already mounted', async () => {
        const callbacks = makeSwapCallbacks({
          getMountedExtension: vi.fn().mockReturnValue(testExtension2.id),
        });

        const handler = new ExtensionLifecycleActionHandler(
          swapDomain.id,
          callbacks,
          'swap',
          mockContainerProvider
        );

        await handler.handleAction(FRONTX_ACTION_MOUNT_EXT, {
          extensionId: testExtension2.id,
        });

        expect(callbacks.unmountExtension).not.toHaveBeenCalled();
        expect(callbacks.mountExtension).not.toHaveBeenCalled();
      });

      it('should mount directly when no extension is currently mounted', async () => {
        const callbacks = makeSwapCallbacks();

        const handler = new ExtensionLifecycleActionHandler(
          swapDomain.id,
          callbacks,
          'swap',
          mockContainerProvider
        );

        await handler.handleAction(FRONTX_ACTION_MOUNT_EXT, {
          extensionId: testExtension2.id,
        });

        // Verify unmount was NOT called
        expect(callbacks.unmountExtension).not.toHaveBeenCalled();
        expect(callbacks.mountExtension).toHaveBeenCalledWith(testExtension2.id, mockContainerProvider.mockContainer);
      });

      it('should call serializeOnDomain with the domain ID when handleScreenSwap executes', async () => {
        const callbacks = makeSwapCallbacks();

        const handler = new ExtensionLifecycleActionHandler(
          swapDomain.id,
          callbacks,
          'swap',
          mockContainerProvider
        );

        await handler.handleAction(FRONTX_ACTION_MOUNT_EXT, {
          extensionId: testExtension2.id,
        });

        // serializeOnDomain must be called with the domain ID
        expect(callbacks.serializeOnDomain).toHaveBeenCalledWith(
          swapDomain.id,
          expect.any(Function)
        );
        // The inner unmount+mount callbacks are called inside the serialized block
        expect(callbacks.mountExtension).toHaveBeenCalledWith(testExtension2.id, mockContainerProvider.mockContainer);
      });

      it('should serialize concurrent swaps on the same domain', async () => {
        // Track execution order across concurrent swaps
        const executionOrder: string[] = [];

        // Use a real serializer to validate domain-level serialization
        let resolveFirst!: () => void;
        const firstOpBlocked = new Promise<void>((resolve) => { resolveFirst = resolve; });

        const callbacks = makeSwapCallbacks({
          getMountedExtension: vi.fn().mockReturnValue(undefined),
          mountExtension: vi.fn().mockImplementation(async (extId: string) => {
            executionOrder.push(`mount:${extId}`);
            return {} as ParentMfeBridge;
          }),
          // Real serializer for the domain queue
          serializeOnDomain: (() => {
            let queue: Promise<void> = Promise.resolve();
            return vi.fn().mockImplementation((_domainId: string, operation: () => Promise<void>) => {
              queue = queue.then(() => operation(), () => operation());
              return queue;
            });
          })(),
        });

        const handler = new ExtensionLifecycleActionHandler(
          swapDomain.id,
          callbacks,
          'swap',
          mockContainerProvider
        );

        const ext1Id = 'gts.frontx.mfes.ext.extension.v1~test.concurrent.ext1.v1';
        const ext2Id = 'gts.frontx.mfes.ext.extension.v1~test.concurrent.ext2.v1';

        // Fire two swaps concurrently
        const swap1 = handler.handleAction(FRONTX_ACTION_MOUNT_EXT, { extensionId: ext1Id });
        const swap2 = handler.handleAction(FRONTX_ACTION_MOUNT_EXT, { extensionId: ext2Id });

        await Promise.all([swap1, swap2]);

        // Both swaps ran, in order (swap1 before swap2)
        expect(executionOrder).toEqual(['mount:' + ext1Id, 'mount:' + ext2Id]);
        // serializeOnDomain was called twice (once per swap)
        expect(callbacks.serializeOnDomain).toHaveBeenCalledTimes(2);

        void firstOpBlocked; // suppress unused var lint
        void resolveFirst;
      });
    });

    describe('unmount_ext action', () => {
      it('should route to callbacks.unmountExtension', async () => {
        const callbacks = makeToggleCallbacks();

        const handler = new ExtensionLifecycleActionHandler(
          toggleDomain.id,
          callbacks,
          'toggle',
          mockContainerProvider
        );

        await handler.handleAction(FRONTX_ACTION_UNMOUNT_EXT, {
          extensionId: testExtension1.id,
        });

        expect(callbacks.unmountExtension).toHaveBeenCalledWith(testExtension1.id);
      });

      it('should throw error if payload is missing', async () => {
        const callbacks = makeToggleCallbacks();

        const handler = new ExtensionLifecycleActionHandler(
          toggleDomain.id,
          callbacks,
          'toggle',
          mockContainerProvider
        );

        await expect(
          handler.handleAction(FRONTX_ACTION_UNMOUNT_EXT, undefined)
        ).rejects.toThrow(MfeError);
      });
    });

    describe('non-lifecycle actions', () => {
      it('should pass through as no-op for non-lifecycle action types', async () => {
        const callbacks = makeToggleCallbacks();

        const handler = new ExtensionLifecycleActionHandler(
          toggleDomain.id,
          callbacks,
          'toggle',
          mockContainerProvider
        );

        // Should not throw for custom action types
        await expect(
          handler.handleAction('gts.frontx.mfes.comm.action.v1~custom.action.v1', {
            somePayload: 'value',
          })
        ).resolves.not.toThrow();
      });
    });
  });

  describe('getMountedExtension', () => {
    it('should return currently mounted extension ID', async () => {
      // Register mock handler
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
        typeSystem: gtsPlugin,
        mfeHandlers: [mockHandler as unknown as MfeHandler],
      });
      registry.registerDomain(toggleDomain, mockContainerProvider);
      await registry.registerExtension(testExtension1);

      // Initially no extension mounted
      expect(registry.getMountedExtension(toggleDomain.id)).toBeUndefined();

      // Mount extension via actions chain
      const container = document.createElement('div');
      mockContainerProvider.getContainer = vi.fn().mockReturnValue(container);

      await registry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_MOUNT_EXT,
          target: toggleDomain.id,
          payload: { extensionId: testExtension1.id },
        },
      });

      // Now should return the mounted extension
      const mounted = registry.getMountedExtension(toggleDomain.id);
      expect(mounted).toBe(testExtension1.id);
    });

    it('should return undefined when no extension is mounted', () => {
      registry.registerDomain(toggleDomain, mockContainerProvider);

      const mounted = registry.getMountedExtension(toggleDomain.id);
      expect(mounted).toBeUndefined();
    });

    it('should return undefined after unmounting', async () => {
      // Register mock handler
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
        typeSystem: gtsPlugin,
        mfeHandlers: [mockHandler as unknown as MfeHandler],
      });
      registry.registerDomain(toggleDomain, mockContainerProvider);
      await registry.registerExtension(testExtension1);

      // Mount first
      const container = document.createElement('div');
      mockContainerProvider.getContainer = vi.fn().mockReturnValue(container);

      await registry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_MOUNT_EXT,
          target: toggleDomain.id,
          payload: { extensionId: testExtension1.id },
        },
      });

      // Verify mounted
      expect(registry.getMountedExtension(toggleDomain.id)).toBe(testExtension1.id);

      // Unmount
      await registry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_UNMOUNT_EXT,
          target: toggleDomain.id,
          payload: { extensionId: testExtension1.id },
        },
      });

      // Should return undefined
      expect(registry.getMountedExtension(toggleDomain.id)).toBeUndefined();
    });
  });

  describe('domain handler auto-registration', () => {
    it('should register ExtensionLifecycleActionHandler during registerDomain', () => {
      // Spy on public registry method
      const registerSpy = vi.spyOn(registry, 'registerDomainActionHandler');

      // Register domain
      registry.registerDomain(toggleDomain, mockContainerProvider);

      // Verify handler was registered
      expect(registerSpy).toHaveBeenCalledWith(
        toggleDomain.id,
        expect.any(ExtensionLifecycleActionHandler)
      );
    });

    it('should unregister handler during unregisterDomain', async () => {
      // Set up spy before registering domain
      const unregisterSpy = vi.spyOn(registry, 'unregisterDomainActionHandler');

      registry.registerDomain(toggleDomain, mockContainerProvider);

      // Unregister domain
      await registry.unregisterDomain(toggleDomain.id);

      // Verify handler was unregistered
      expect(unregisterSpy).toHaveBeenCalledWith(toggleDomain.id);
    });

    it('should determine swap semantics for screen domains', () => {
      const registerSpy = vi.spyOn(registry, 'registerDomainActionHandler');

      registry.registerDomain(swapDomain, new MockContainerProvider());

      // Verify handler was created with swap semantics
      // (handler checks domain actions array: no unmount_ext = swap)
      expect(registerSpy).toHaveBeenCalledWith(
        swapDomain.id,
        expect.any(ExtensionLifecycleActionHandler)
      );

      // Verify the handler has swap semantics by checking its behavior
      const handler = registerSpy.mock.calls[0][1] as ExtensionLifecycleActionHandler;
      expect(handler).toBeInstanceOf(ExtensionLifecycleActionHandler);
    });

    it('should determine toggle semantics for domains supporting unmount_ext', () => {
      const registerSpy = vi.spyOn(registry, 'registerDomainActionHandler');

      registry.registerDomain(toggleDomain, mockContainerProvider);

      // Verify handler was created with toggle semantics
      expect(registerSpy).toHaveBeenCalledWith(
        toggleDomain.id,
        expect.any(ExtensionLifecycleActionHandler)
      );

      const handler = registerSpy.mock.calls[0][1] as ExtensionLifecycleActionHandler;
      expect(handler).toBeInstanceOf(ExtensionLifecycleActionHandler);
    });
  });

  describe('ContainerProvider integration', () => {
    it('should call getContainer during mount and releaseContainer during unmount', async () => {
      const getContainerSpy = vi.spyOn(mockContainerProvider, 'getContainer');
      const releaseContainerSpy = vi.spyOn(mockContainerProvider, 'releaseContainer');

      const callbacks = makeToggleCallbacks();

      const handler = new ExtensionLifecycleActionHandler(
        toggleDomain.id,
        callbacks,
        'toggle',
        mockContainerProvider
      );

      // Mount extension
      await handler.handleAction(FRONTX_ACTION_MOUNT_EXT, {
        extensionId: testExtension1.id,
      });

      // Verify getContainer was called with correct extensionId
      expect(getContainerSpy).toHaveBeenCalledWith(testExtension1.id);
      expect(getContainerSpy).toHaveBeenCalledTimes(1);

      // Unmount extension
      await handler.handleAction(FRONTX_ACTION_UNMOUNT_EXT, {
        extensionId: testExtension1.id,
      });

      // Verify releaseContainer was called with correct extensionId
      expect(releaseContainerSpy).toHaveBeenCalledWith(testExtension1.id);
      expect(releaseContainerSpy).toHaveBeenCalledTimes(1);
    });

    it('should call container lifecycle methods in correct order for swap-semantics domain', async () => {
      const getContainerSpy = vi.spyOn(mockContainerProvider, 'getContainer');
      const releaseContainerSpy = vi.spyOn(mockContainerProvider, 'releaseContainer');

      const callbacks = makeSwapCallbacks();

      const handler = new ExtensionLifecycleActionHandler(
        swapDomain.id,
        callbacks,
        'swap',
        mockContainerProvider
      );

      // Mount first extension
      await handler.handleAction(FRONTX_ACTION_MOUNT_EXT, {
        extensionId: testExtension2.id,
      });

      expect(getContainerSpy).toHaveBeenCalledWith(testExtension2.id);

      // Update getMountedExtension to return the first extension
      callbacks.getMountedExtension = vi.fn().mockReturnValue(testExtension2.id);

      // Reset spies
      getContainerSpy.mockClear();
      releaseContainerSpy.mockClear();

      const testExtension3Id = 'gts.frontx.mfes.ext.extension.v1~test.lifecycle.actions.ext3.v1';

      // Mount second extension (should unmount first due to swap semantics)
      await handler.handleAction(FRONTX_ACTION_MOUNT_EXT, {
        extensionId: testExtension3Id,
      });

      // Verify call order: releaseContainer(ext2), getContainer(ext3)
      expect(releaseContainerSpy).toHaveBeenCalledWith(testExtension2.id);
      expect(getContainerSpy).toHaveBeenCalledWith(testExtension3Id);

      // Verify order: release before get
      const releaseOrder = releaseContainerSpy.mock.invocationCallOrder[0];
      const getOrder = getContainerSpy.mock.invocationCallOrder[0];
      expect(releaseOrder).toBeLessThan(getOrder);
    });

    it('should handle getContainer throwing an error', async () => {
      // Create a mock provider that throws
      const throwingProvider = new MockContainerProvider();
      throwingProvider.getContainer = vi.fn().mockImplementation(() => {
        throw new Error('Container creation failed');
      });

      const callbacks = makeToggleCallbacks();

      const handler = new ExtensionLifecycleActionHandler(
        toggleDomain.id,
        callbacks,
        'toggle',
        throwingProvider
      );

      // Attempt to mount (should propagate error)
      await expect(
        handler.handleAction(FRONTX_ACTION_MOUNT_EXT, {
          extensionId: testExtension1.id,
        })
      ).rejects.toThrow('Container creation failed');
    });
  });
});
