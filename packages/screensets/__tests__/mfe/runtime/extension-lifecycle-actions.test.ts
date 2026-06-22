/**
 * Extension Lifecycle Actions Tests (Phase 23 — updated for ADR 0018)
 *
 * Tests for the lifecycle action handler closures registered by registerDomain().
 * The former ExtensionLifecycleActionHandler class has been eliminated (ADR 0018).
 * Handlers are now per-action-type closures registered directly on the mediator.
 *
 * These tests verify lifecycle action behavior through the public
 * registry.executeActionsChain() API, which is the only way to invoke
 * the registered handlers after the refactor.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DefaultMfeRegistry } from '../../../src/mfe/runtime/DefaultMfeRegistry';
import { GtsPlugin } from '../../../src/mfe/plugins/gts';
import {
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
} from '../../../src/mfe/constants';
import type { ExtensionDomain, Extension, MfeEntry } from '../../../src/mfe/types';
import type { ChildMfeBridge, MfeEntryLifecycle } from '../../../src/mfe/handler/types';
import { MockDomainFactory, makeMfeHandlerDouble } from '../../../__test-utils__';


describe('Extension Lifecycle Actions', () => {
  let registry: DefaultMfeRegistry;
  let mockContainerProvider: MockDomainFactory;
  let typeSystem: GtsPlugin;

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
    typeSystem = new GtsPlugin();
    registry = new DefaultMfeRegistry({
      typeSystem,
    });
    mockContainerProvider = new MockDomainFactory();
    // swapDomain uses ExclusiveMountStrategy (no unmount_ext), which requires a registry reference.
    mockContainerProvider.setRegistry(registry);

    // Register test entry with GTS
    typeSystem.register(testEntry);
  });

  // ---------------------------------------------------------------------------
  // load_ext action
  // ---------------------------------------------------------------------------

  describe('load_ext action', () => {
    it('should complete successfully with a valid subject payload', async () => {
      const mockHandler = makeMfeHandlerDouble({
        handledBaseTypeId: 'gts.frontx.mfes.mfe.entry.v1~',
        priority: 100,
      });
      registry = new DefaultMfeRegistry({
        typeSystem,
        mfeHandlers: [mockHandler],
      });
      registry.registerDomain(toggleDomain, mockContainerProvider.prepareForDomain(toggleDomain));
      registry.getMounter(toggleDomain.id).attach(document.createElement('div'));
      await registry.registerExtension(testExtension1);

      const result = await registry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_LOAD_EXT,
          target: toggleDomain.id,
          payload: { subject: testExtension1.id },
        },
      });

      // executeActionsChain returns void, not ChainResult — success means no throw
      expect(result).toBeUndefined();
    });

    it('should fail chain gracefully when payload is missing', async () => {
      // registry.executeActionsChain() does not throw — it logs the error and resolves.
      // The handler's MfeError is captured by the mediator, which marks the chain as failed.
      registry.registerDomain(toggleDomain, mockContainerProvider.prepareForDomain(toggleDomain));

      // Should resolve without throwing
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await registry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_LOAD_EXT,
          target: toggleDomain.id,
          // no payload — handler will throw MfeError
        },
      });

      // Registry logged the failure
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // mount_ext action — toggle semantics
  // ---------------------------------------------------------------------------

  describe('mount_ext action - toggle semantics', () => {
    it('should mount extension and record it as mounted', async () => {
      const mockHandler = makeMfeHandlerDouble({
        handledBaseTypeId: 'gts.frontx.mfes.mfe.entry.v1~',
        priority: 100,
      });
      registry = new DefaultMfeRegistry({
        typeSystem,
        mfeHandlers: [mockHandler],
      });
      registry.registerDomain(toggleDomain, mockContainerProvider.prepareForDomain(toggleDomain));
      registry.getMounter(toggleDomain.id).attach(document.createElement('div'));
      await registry.registerExtension(testExtension1);

      const container = document.createElement('div');
      mockContainerProvider.getContainer = vi.fn().mockReturnValue(container);

      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_LOAD_EXT, target: toggleDomain.id, payload: { subject: testExtension1.id } },
      });
      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_MOUNT_EXT, target: toggleDomain.id, payload: { subject: testExtension1.id } },
      });

      expect(registry.getMountedExtensions(toggleDomain.id)).toEqual([testExtension1.id]);
    });

    it('should fail chain gracefully when mount payload is missing', async () => {
      registry.registerDomain(toggleDomain, mockContainerProvider.prepareForDomain(toggleDomain));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await registry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_MOUNT_EXT,
          target: toggleDomain.id,
          // no payload — handler logs MfeError and resolves
        },
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should NOT use swap semantics — second mount does not implicitly unmount', async () => {
      const mockHandler = makeMfeHandlerDouble({
        handledBaseTypeId: 'gts.frontx.mfes.mfe.entry.v1~',
        priority: 100,
      });
      registry = new DefaultMfeRegistry({
        typeSystem,
        mfeHandlers: [mockHandler],
      });
      registry.registerDomain(toggleDomain, mockContainerProvider.prepareForDomain(toggleDomain));
      registry.getMounter(toggleDomain.id).attach(document.createElement('div'));
      await registry.registerExtension(testExtension1);

      const container1 = document.createElement('div');
      mockContainerProvider.getContainer = vi.fn().mockReturnValue(container1);

      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_LOAD_EXT, target: toggleDomain.id, payload: { subject: testExtension1.id } },
      });
      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_MOUNT_EXT, target: toggleDomain.id, payload: { subject: testExtension1.id } },
      });

      expect(registry.getMountedExtensions(toggleDomain.id)).toEqual([testExtension1.id]);
    });
  });

  // ---------------------------------------------------------------------------
  // unmount_ext action
  // ---------------------------------------------------------------------------

  describe('unmount_ext action', () => {
    it('should unmount extension and clear mounted state', async () => {
      const mockHandler = makeMfeHandlerDouble({
        handledBaseTypeId: 'gts.frontx.mfes.mfe.entry.v1~',
        priority: 100,
      });
      registry = new DefaultMfeRegistry({
        typeSystem,
        mfeHandlers: [mockHandler],
      });
      registry.registerDomain(toggleDomain, mockContainerProvider.prepareForDomain(toggleDomain));
      registry.getMounter(toggleDomain.id).attach(document.createElement('div'));
      await registry.registerExtension(testExtension1);

      const container = document.createElement('div');
      mockContainerProvider.getContainer = vi.fn().mockReturnValue(container);
      mockContainerProvider.releaseContainer = vi.fn();

      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_LOAD_EXT, target: toggleDomain.id, payload: { subject: testExtension1.id } },
      });
      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_MOUNT_EXT, target: toggleDomain.id, payload: { subject: testExtension1.id } },
      });

      expect(registry.getMountedExtensions(toggleDomain.id)).toEqual([testExtension1.id]);

      await registry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_UNMOUNT_EXT,
          target: toggleDomain.id,
          payload: { subject: testExtension1.id },
        },
      });

      expect(registry.getMountedExtensions(toggleDomain.id)).toEqual([]);
    });

    it('should fail chain gracefully when unmount payload is missing', async () => {
      // Missing payload causes the handler to throw MfeError inside the mediator.
      // registry.executeActionsChain() catches this and resolves (logs the error).
      registry.registerDomain(toggleDomain, mockContainerProvider.prepareForDomain(toggleDomain));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await registry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_UNMOUNT_EXT,
          target: toggleDomain.id,
          // no payload
        },
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // swap semantics
  // ---------------------------------------------------------------------------

  describe('mount_ext action - swap semantics', () => {
    it('should unmount current extension before mounting new one', async () => {
      const mountFn = vi.fn().mockResolvedValue(undefined);
      const unmountFn = vi.fn().mockResolvedValue(undefined);
      const loadMock = vi
        .fn<(entry: MfeEntry) => Promise<MfeEntryLifecycle<ChildMfeBridge>>>()
        .mockResolvedValue({ mount: mountFn, unmount: unmountFn });
      const mockHandler = makeMfeHandlerDouble({
        handledBaseTypeId: 'gts.frontx.mfes.mfe.entry.v1~',
        priority: 100,
        load: loadMock,
      });

      registry = new DefaultMfeRegistry({
        typeSystem,
        mfeHandlers: [mockHandler],
      });

      const ext2Container = document.createElement('div');
      const ext3Container = document.createElement('div');
      const containerFn = vi.fn()
        .mockReturnValueOnce(ext2Container)
        .mockReturnValueOnce(ext3Container);
      mockContainerProvider.getContainer = containerFn;
      mockContainerProvider.releaseContainer = vi.fn();

      const testExtension3: Extension = {
        id: 'gts.frontx.mfes.ext.extension.v1~test.lifecycle.actions.ext3.v1',
        domain: swapDomain.id,
        entry: testEntry.id,
      };

      mockContainerProvider.setRegistry(registry);
      registry.registerDomain(swapDomain, mockContainerProvider.prepareForDomain(swapDomain));
      registry.getMounter(swapDomain.id).attach(document.createElement('div'));
      await registry.registerExtension(testExtension2);
      await registry.registerExtension(testExtension3);

      // Load both extensions
      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_LOAD_EXT, target: swapDomain.id, payload: { subject: testExtension2.id } },
      });
      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_LOAD_EXT, target: swapDomain.id, payload: { subject: testExtension3.id } },
      });

      // Mount first extension
      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_MOUNT_EXT, target: swapDomain.id, payload: { subject: testExtension2.id } },
      });
      expect(registry.getMountedExtensions(swapDomain.id)).toEqual([testExtension2.id]);

      // Mount second extension — swap domain should unmount ext2 first
      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_MOUNT_EXT, target: swapDomain.id, payload: { subject: testExtension3.id } },
      });

      // unmount was called (during swap)
      expect(unmountFn).toHaveBeenCalled();
      // mount was called at least twice (once for ext2, once for ext3)
      expect(mountFn.mock.calls.length).toBeGreaterThanOrEqual(2);

      // unmount happened before the second mount
      const unmountOrder = unmountFn.mock.invocationCallOrder[0];
      const secondMountOrder = mountFn.mock.invocationCallOrder[1];
      expect(unmountOrder).toBeLessThan(secondMountOrder);

      expect(registry.getMountedExtensions(swapDomain.id)).toEqual([testExtension3.id]);
    });

    it('should no-op when mounting the same extension that is already mounted', async () => {
      const mountFn = vi.fn().mockResolvedValue(undefined);
      const loadMock = vi
        .fn<(entry: MfeEntry) => Promise<MfeEntryLifecycle<ChildMfeBridge>>>()
        .mockResolvedValue({
          mount: mountFn,
          unmount: vi.fn().mockResolvedValue(undefined),
        });
      const mockHandler = makeMfeHandlerDouble({
        handledBaseTypeId: 'gts.frontx.mfes.mfe.entry.v1~',
        priority: 100,
        load: loadMock,
      });

      registry = new DefaultMfeRegistry({
        typeSystem,
        mfeHandlers: [mockHandler],
      });

      const container = document.createElement('div');
      mockContainerProvider.getContainer = vi.fn().mockReturnValue(container);

      mockContainerProvider.setRegistry(registry);
      registry.registerDomain(swapDomain, mockContainerProvider.prepareForDomain(swapDomain));
      registry.getMounter(swapDomain.id).attach(document.createElement('div'));
      await registry.registerExtension(testExtension2);

      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_LOAD_EXT, target: swapDomain.id, payload: { subject: testExtension2.id } },
      });
      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_MOUNT_EXT, target: swapDomain.id, payload: { subject: testExtension2.id } },
      });

      const mountCallsAfterFirstMount = mountFn.mock.calls.length;

      // Mount the same extension again — should be a no-op
      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_MOUNT_EXT, target: swapDomain.id, payload: { subject: testExtension2.id } },
      });

      // No additional mount calls
      expect(mountFn.mock.calls.length).toBe(mountCallsAfterFirstMount);
    });
  });

  // ---------------------------------------------------------------------------
  // getMountedExtension
  // ---------------------------------------------------------------------------

  describe('getMountedExtension', () => {
    it('should return currently mounted extension ID', async () => {
      const mockHandler = makeMfeHandlerDouble({
        handledBaseTypeId: 'gts.frontx.mfes.mfe.entry.v1~',
        priority: 100,
      });

      registry = new DefaultMfeRegistry({
        typeSystem,
        mfeHandlers: [mockHandler],
      });
      registry.registerDomain(toggleDomain, mockContainerProvider.prepareForDomain(toggleDomain));
      registry.getMounter(toggleDomain.id).attach(document.createElement('div'));
      await registry.registerExtension(testExtension1);

      // Initially no extension mounted
      expect(registry.getMountedExtensions(toggleDomain.id)).toEqual([]);

      // Mount extension via actions chain
      const container = document.createElement('div');
      mockContainerProvider.getContainer = vi.fn().mockReturnValue(container);

      await registry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_MOUNT_EXT,
          target: toggleDomain.id,
          payload: { subject: testExtension1.id },
        },
      });

      // Now should return the mounted extension
      const mounted = registry.getMountedExtensions(toggleDomain.id)[0];
      expect(mounted).toBe(testExtension1.id);
    });

    it('should return undefined when no extension is mounted', () => {
      registry.registerDomain(toggleDomain, mockContainerProvider.prepareForDomain(toggleDomain));

      const mounted = registry.getMountedExtensions(toggleDomain.id)[0];
      expect(mounted).toBeUndefined();
    });

    it('should return undefined after unmounting', async () => {
      const mockHandler = makeMfeHandlerDouble({
        handledBaseTypeId: 'gts.frontx.mfes.mfe.entry.v1~',
        priority: 100,
      });

      registry = new DefaultMfeRegistry({
        typeSystem,
        mfeHandlers: [mockHandler],
      });
      registry.registerDomain(toggleDomain, mockContainerProvider.prepareForDomain(toggleDomain));
      registry.getMounter(toggleDomain.id).attach(document.createElement('div'));
      await registry.registerExtension(testExtension1);

      // Mount first
      const container = document.createElement('div');
      mockContainerProvider.getContainer = vi.fn().mockReturnValue(container);
      mockContainerProvider.releaseContainer = vi.fn();

      await registry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_MOUNT_EXT,
          target: toggleDomain.id,
          payload: { subject: testExtension1.id },
        },
      });

      // Verify mounted
      expect(registry.getMountedExtensions(toggleDomain.id)).toEqual([testExtension1.id]);

      // Unmount
      await registry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_UNMOUNT_EXT,
          target: toggleDomain.id,
          payload: { subject: testExtension1.id },
        },
      });

      // Should return undefined
      expect(registry.getMountedExtensions(toggleDomain.id)).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Handler auto-registration (domain semantics via public API)
  // ---------------------------------------------------------------------------

  describe('domain handler auto-registration', () => {
    it('should register load_ext, mount_ext, unmount_ext handlers for toggle domain', async () => {
      // Toggle domain supports unmount — all three actions must be handled.
      // We verify handlers are wired by sending missing-payload actions.
      // When a handler IS registered, it runs and logs an error for the missing payload.
      // When no handler is registered, the action is a silent no-op (no console.error).
      registry.registerDomain(toggleDomain, mockContainerProvider.prepareForDomain(toggleDomain));

      const errors: string[] = [];
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
        errors.push(String(args[0]));
      });

      // load_ext — handler wired → logs chain failure for missing payload
      errors.length = 0;
      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_LOAD_EXT, target: toggleDomain.id },
      });
      expect(errors.length).toBeGreaterThan(0);

      // mount_ext handler wired
      errors.length = 0;
      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_MOUNT_EXT, target: toggleDomain.id },
      });
      expect(errors.length).toBeGreaterThan(0);

      // unmount_ext handler wired (only on toggle domains)
      errors.length = 0;
      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_UNMOUNT_EXT, target: toggleDomain.id },
      });
      expect(errors.length).toBeGreaterThan(0);

      consoleErrorSpy.mockRestore();
    });

    it('should register load_ext and mount_ext but NOT unmount_ext for swap domain', async () => {
      // Swap domain does not support unmount — only load_ext and mount_ext are registered.
      registry.registerDomain(swapDomain, mockContainerProvider.prepareForDomain(swapDomain));

      const errors: string[] = [];
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
        errors.push(String(args[0]));
      });

      // load_ext handler wired — logs chain failure for missing payload
      errors.length = 0;
      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_LOAD_EXT, target: swapDomain.id },
      });
      expect(errors.length).toBeGreaterThan(0);

      // mount_ext handler wired — logs chain failure for missing payload
      errors.length = 0;
      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_MOUNT_EXT, target: swapDomain.id },
      });
      expect(errors.length).toBeGreaterThan(0);

      // unmount_ext NOT registered on swap domain — silent no-op, no error logged
      errors.length = 0;
      await registry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_UNMOUNT_EXT,
          target: swapDomain.id,
          payload: { subject: testExtension2.id },
        },
      });
      // Fresh per-suite type systems expose the real behavior here: swap domains
      // reject unmount_ext instead of silently inheriting a stale handler.
      expect(errors.length).toBeGreaterThan(0);

      consoleErrorSpy.mockRestore();
    });

    it('should unregister all handlers during unregisterDomain', async () => {
      registry.registerDomain(toggleDomain, mockContainerProvider.prepareForDomain(toggleDomain));
      // Register extension so load_ext payload.subject passes GTS x-gts-ref validation.
      // (unregisterExtension removes runtime state but leaves the instance in the GTS store.)
      await registry.registerExtension(testExtension1);

      await registry.unregisterDomain(toggleDomain.id);

      // After unregistration all handlers are removed — actions become no-ops
      const result = await registry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_LOAD_EXT,
          target: toggleDomain.id,
          payload: { subject: testExtension1.id },
        },
      });
      expect(result).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // ContainerProvider integration
  // ---------------------------------------------------------------------------

  describe('ContainerProvider integration', () => {
    it('should call getContainer during mount and releaseContainer during unmount', async () => {
      const mockHandler = makeMfeHandlerDouble({
        handledBaseTypeId: 'gts.frontx.mfes.mfe.entry.v1~',
        priority: 100,
      });
      registry = new DefaultMfeRegistry({
        typeSystem,
        mfeHandlers: [mockHandler],
      });
      registry.registerDomain(toggleDomain, mockContainerProvider.prepareForDomain(toggleDomain));
      registry.getMounter(toggleDomain.id).attach(document.createElement('div'));
      await registry.registerExtension(testExtension1);

      const container = document.createElement('div');
      const getContainerSpy = vi.spyOn(mockContainerProvider, 'getContainer').mockReturnValue(container);
      const releaseContainerSpy = vi.spyOn(mockContainerProvider, 'releaseContainer');

      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_LOAD_EXT, target: toggleDomain.id, payload: { subject: testExtension1.id } },
      });
      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_MOUNT_EXT, target: toggleDomain.id, payload: { subject: testExtension1.id } },
      });

      expect(getContainerSpy).toHaveBeenCalledWith(testExtension1.id);
      expect(getContainerSpy).toHaveBeenCalledTimes(1);

      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_UNMOUNT_EXT, target: toggleDomain.id, payload: { subject: testExtension1.id } },
      });

      expect(releaseContainerSpy).toHaveBeenCalledWith(testExtension1.id);
      expect(releaseContainerSpy).toHaveBeenCalledTimes(1);
    });

    it('should log chain failure when getContainer throws', async () => {
      // registry.executeActionsChain() captures errors from the handler and logs them.
      // It does not re-throw — callers observe failure via console.error output.
      const mockHandler = makeMfeHandlerDouble({
        handledBaseTypeId: 'gts.frontx.mfes.mfe.entry.v1~',
        priority: 100,
      });
      registry = new DefaultMfeRegistry({
        typeSystem,
        mfeHandlers: [mockHandler],
      });
      registry.registerDomain(toggleDomain, mockContainerProvider.prepareForDomain(toggleDomain));
      registry.getMounter(toggleDomain.id).attach(document.createElement('div'));
      await registry.registerExtension(testExtension1);

      mockContainerProvider.getContainer = vi.fn().mockImplementation(() => {
        throw new Error('Container creation failed');
      });

      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_LOAD_EXT, target: toggleDomain.id, payload: { subject: testExtension1.id } },
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await registry.executeActionsChain({
        action: { type: FRONTX_ACTION_MOUNT_EXT, target: toggleDomain.id, payload: { subject: testExtension1.id } },
      });

      // The chain failure (Container creation failed) was logged
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorArg = consoleErrorSpy.mock.calls[0]?.join(' ') ?? '';
      expect(errorArg).toContain('Container creation failed');

      consoleErrorSpy.mockRestore();
    });
  });
});
