/**
 * Shadow DOM Mount Pipeline Tests - Phase 42
 *
 * Tests for shadow DOM creation and cleanup in the mount/unmount pipeline.
 *
 * @packageDocumentation
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DefaultMountManager } from '../../../src/mfe/runtime/default-mount-manager';
import { DefaultExtensionManager } from '../../../src/mfe/runtime/default-extension-manager';
import { DefaultRuntimeBridgeFactory } from '../../../src/mfe/runtime/default-runtime-bridge-factory';
import { GtsPlugin } from '../../../src/mfe/plugins/gts';
import type { ExtensionDomain, Extension, MfeEntry } from '../../../src/mfe/types';
import type { ChildMfeBridge, MfeEntryLifecycle } from '../../../src/mfe/handler/types';
import type { RuntimeCoordinator } from '../../../src/mfe/coordination/types';
import type { MfeRegistry } from '../../../src/mfe/runtime/MfeRegistry';
import {
  MockDomainFactory,
  createMinimalMfeRegistryStub,
  makeMfeHandlerDouble,
} from '../../../__test-utils__';
import {
  HAI3_ACTION_LOAD_EXT,
  HAI3_ACTION_MOUNT_EXT,
  HAI3_ACTION_UNMOUNT_EXT,
} from '../../../src/mfe/constants';

describe('Shadow DOM Mount Pipeline', () => {
  let mountManager: DefaultMountManager;
  let extensionManager: DefaultExtensionManager;
  let coordinator: RuntimeCoordinator;
  let mockContainerProvider: MockDomainFactory;
  let mockLifecycle: MfeEntryLifecycle;
  let mockHostRuntime: MfeRegistry;
  let typeSystem: GtsPlugin;

  const testDomain: ExtensionDomain = {
    id: 'gts.hai3.mfes.ext.domain.v1~hai3.test.shadow_dom_test.domain.v1',
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
    id: 'gts.hai3.mfes.mfe.entry.v1~hai3.test.shadow_dom_test.entry.v1',
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
    id: 'gts.hai3.mfes.ext.extension.v1~hai3.test.shadow_dom_test.ext.v1',
    domain: testDomain.id,
    entry: testEntry.id,
  };

  beforeEach(() => {
    // Register test entry with GTS
    typeSystem = new GtsPlugin();
    typeSystem.register(testEntry);

    // Create extension manager with all required callbacks
    extensionManager = new DefaultExtensionManager({
      typeSystem,
      triggerLifecycle: vi.fn().mockResolvedValue(undefined),
      triggerDomainOwnLifecycle: vi.fn().mockResolvedValue(undefined),
      unmountExtension: vi.fn().mockResolvedValue(undefined),
      validateEntryType: vi.fn(),
    });

    // Create mock coordinator
    coordinator = {
      register: vi.fn(),
      unregister: vi.fn(),
      get: vi.fn(),
    };

    // Create mock container provider
    mockContainerProvider = new MockDomainFactory();

    // Create mock lifecycle
    mockLifecycle = {
      mount: vi.fn().mockResolvedValue(undefined),
      unmount: vi.fn().mockResolvedValue(undefined),
    };

    // Create mock host runtime
    mockHostRuntime = createMinimalMfeRegistryStub();

    // Create bridge factory
    const bridgeFactory = new DefaultRuntimeBridgeFactory();

    const loadMock = vi
      .fn<(entry: MfeEntry) => Promise<MfeEntryLifecycle<ChildMfeBridge>>>()
      .mockResolvedValue(mockLifecycle);
    const testHandler = makeMfeHandlerDouble({
      handledBaseTypeId: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~',
      priority: 0,
      load: loadMock,
    });

    // Create mount manager with mock dependencies
    mountManager = new DefaultMountManager({
      extensionManager,
      resolveHandler: () => testHandler,
      coordinator,
      triggerLifecycle: vi.fn().mockResolvedValue(undefined),
      executeActionsChain: vi.fn().mockResolvedValue(undefined),
      hostRuntime: mockHostRuntime,
      registerCatchAllActionHandler: vi.fn(),
      unregisterCatchAllActionHandler: vi.fn(),
      registerExtensionActionHandler: vi.fn(),
      unregisterExtensionActionHandler: vi.fn(),
      bridgeFactory,
    });

    // Register domain
    extensionManager.registerDomain(testDomain);
  });

  describe('42.6.1 - mountExtension creates Shadow DOM on container', () => {
    it('should create a shadow root on the container element', async () => {
      // Register extension
      await extensionManager.registerExtension(testExtension);

      // Get container
      const container = mockContainerProvider.mockContainer as HTMLElement;

      // Verify no shadow root before mount
      expect(container.shadowRoot).toBeNull();

      // Mount extension
      await mountManager.mountExtension(testExtension.id, container);

      // Verify shadow root was created
      expect(container.shadowRoot).not.toBeNull();
      expect(container.shadowRoot?.mode).toBe('open');
    });

    it('should pass shadow root to lifecycle.mount()', async () => {
      // Register extension
      await extensionManager.registerExtension(testExtension);

      // Get container
      const container = mockContainerProvider.mockContainer as HTMLElement;

      // Mount extension
      await mountManager.mountExtension(testExtension.id, container);

      // Verify lifecycle.mount was called with shadow root
      expect(mockLifecycle.mount).toHaveBeenCalled();
      const mountCallArgs = vi.mocked(mockLifecycle.mount).mock.calls[0];
      const mountTarget = mountCallArgs[0];

      // mountTarget should be the shadow root, not the container
      expect(mountTarget).toBe(container.shadowRoot);
      expect(mountTarget).not.toBe(container);
    });
  });

  describe('42.6.2 - mountExtension reuses existing shadow root', () => {
    it('should reuse existing shadow root if already attached', async () => {
      // Register extension
      await extensionManager.registerExtension(testExtension);

      // Get container and attach shadow root manually
      const container = mockContainerProvider.mockContainer as HTMLElement;
      const existingShadowRoot = container.attachShadow({ mode: 'open' });

      // Mount extension
      await mountManager.mountExtension(testExtension.id, container);

      // Verify the existing shadow root was reused
      expect(container.shadowRoot).toBe(existingShadowRoot);

      // Verify lifecycle.mount was called with the existing shadow root
      const mountCallArgs = vi.mocked(mockLifecycle.mount).mock.calls[0];
      const mountTarget = mountCallArgs[0];
      expect(mountTarget).toBe(existingShadowRoot);
    });
  });

  describe('42.6.3 - unmountExtension passes shadow root to lifecycle.unmount()', () => {
    it('should pass shadow root to lifecycle.unmount() if available', async () => {
      // Register extension
      await extensionManager.registerExtension(testExtension);

      // Get container
      const container = mockContainerProvider.mockContainer as HTMLElement;

      // Mount extension (creates shadow root)
      await mountManager.mountExtension(testExtension.id, container);

      // Get the shadow root
      const shadowRoot = container.shadowRoot;
      expect(shadowRoot).not.toBeNull();

      // Unmount extension
      await mountManager.unmountExtension(testExtension.id);

      // Verify lifecycle.unmount was called with shadow root
      expect(mockLifecycle.unmount).toHaveBeenCalled();
      const unmountCallArgs = vi.mocked(mockLifecycle.unmount).mock.calls[0];
      const unmountTarget = unmountCallArgs[0];

      expect(unmountTarget).toBe(shadowRoot);
      expect(unmountTarget).not.toBe(container);
    });

    it('should fallback to container if shadow root is not available', async () => {
      // Register extension
      await extensionManager.registerExtension(testExtension);

      // Get container
      const container = mockContainerProvider.mockContainer as HTMLElement;

      // Mount extension (creates shadow root)
      await mountManager.mountExtension(testExtension.id, container);

      // Manually clear the shadow root reference in extension state
      const extensionState = extensionManager.getExtensionState(testExtension.id);
      if (extensionState) {
        extensionState.shadowRoot = undefined;
      }

      // Unmount extension
      await mountManager.unmountExtension(testExtension.id);

      // Verify lifecycle.unmount was called with container (fallback)
      expect(mockLifecycle.unmount).toHaveBeenCalled();
      const unmountCallArgs = vi.mocked(mockLifecycle.unmount).mock.calls[0];
      const unmountTarget = unmountCallArgs[0];

      expect(unmountTarget).toBe(container);
    });
  });

  describe('42.6.4 - shadow root reference cleared after unmount', () => {
    it('should clear shadow root from extensionState after unmount', async () => {
      // Register extension
      await extensionManager.registerExtension(testExtension);

      // Get container
      const container = mockContainerProvider.mockContainer as HTMLElement;

      // Mount extension
      await mountManager.mountExtension(testExtension.id, container);

      // Verify shadow root is stored in extension state
      const extensionStateBefore = extensionManager.getExtensionState(testExtension.id);
      expect(extensionStateBefore?.shadowRoot).toBeDefined();
      expect(extensionStateBefore?.shadowRoot).toBe(container.shadowRoot);

      // Unmount extension
      await mountManager.unmountExtension(testExtension.id);

      // Verify shadow root reference is cleared
      const extensionStateAfter = extensionManager.getExtensionState(testExtension.id);
      expect(extensionStateAfter?.shadowRoot).toBeUndefined();
    });
  });
});
