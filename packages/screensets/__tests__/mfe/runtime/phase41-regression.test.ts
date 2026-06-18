/**
 * Phase 41 Regression Tests
 *
 * Tests for:
 * - Action schema target validation (oneOf with x-gts-ref for domain/extension)
 * - executeActionsChain error logging
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefaultScreensetsRegistry } from '../../../src/mfe/runtime/DefaultScreensetsRegistry';
import { GtsPlugin } from '../../../src/mfe/plugins/gts';
import { MockContainerProvider } from '../test-utils';
import type { ExtensionDomain, Extension, MfeEntry } from '../../../src/mfe/types';
import {
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
} from '../../../src/mfe/constants';

describe('Phase 41 Regression Tests', () => {
  let gtsPlugin: GtsPlugin;
  let registry: DefaultScreensetsRegistry;
  let mockContainerProvider: MockContainerProvider;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  const testDomain: ExtensionDomain = {
    id: 'gts.frontx.mfes.ext.domain.v1~frontx.test.phase41.domain.v1',
    sharedProperties: [],
    actions: [
      FRONTX_ACTION_LOAD_EXT,
      FRONTX_ACTION_MOUNT_EXT,
      FRONTX_ACTION_UNMOUNT_EXT,
    ],
    extensionsActions: [],
    defaultActionTimeout: 3000,
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
    id: 'gts.frontx.mfes.mfe.entry.v1~frontx.test.phase41.entry.v1',
    entryType: 'frontx.mfes.entry.module_federation',
    remoteUrl: 'http://localhost:3001/remoteEntry.js',
    exposedModule: './TestComponent',
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
    id: 'gts.frontx.mfes.ext.extension.v1~frontx.test.phase41.ext.v1',
    domain: testDomain.id,
    entry: testEntry.id,
  };

  beforeEach(() => {
    gtsPlugin = new GtsPlugin();

    registry = new DefaultScreensetsRegistry({
      typeSystem: gtsPlugin,
    });

    mockContainerProvider = new MockContainerProvider();

    // Register domain and entry with GTS
    gtsPlugin.register(testDomain);
    gtsPlugin.register(testEntry);

    // Spy on console.error
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('41.5.1 - Action with domain target passes schema validation', () => {
    it('should validate action with domain target successfully', async () => {
      // Register domain with registry
      registry.registerDomain(testDomain, mockContainerProvider);

      // Create action targeting the domain
      const actionInstanceId = 'gts.frontx.mfes.comm.action.v1~frontx.test.phase41.action_to_domain.v1';
      const actionInstance = {
        id: actionInstanceId,
        type: actionInstanceId,
        target: testDomain.id,
        payload: {},
      };

      // Register action instance with GTS
      gtsPlugin.register(actionInstance);

      // Validate the action instance
      const result = gtsPlugin.validateInstance(actionInstanceId);

      // Assert validation passes
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('41.5.2 - Action with extension target passes schema validation', () => {
    it('should validate action with extension target successfully', async () => {
      // Register domain and extension with registry
      registry.registerDomain(testDomain, mockContainerProvider);
      await registry.registerExtension(testExtension);

      // Create action targeting the extension
      const actionInstanceId = 'gts.frontx.mfes.comm.action.v1~frontx.test.phase41.action_to_ext.v1';
      const actionInstance = {
        id: actionInstanceId,
        type: actionInstanceId,
        target: testExtension.id,
        payload: {},
      };

      // Register action instance with GTS
      gtsPlugin.register(actionInstance);

      // Validate the action instance
      const result = gtsPlugin.validateInstance(actionInstanceId);

      // Assert validation passes
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('41.5.3 - executeActionsChain logs error on chain failure', () => {
    it('should log console.error when actions chain fails', async () => {
      // Register domain with registry
      registry.registerDomain(testDomain, mockContainerProvider);

      // Execute actions chain that will fail (target non-existent extension)
      const nonExistentExtensionId = 'gts.frontx.mfes.ext.extension.v1~frontx.test.phase41.nonexistent.v1';

      await registry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_MOUNT_EXT,
          target: testDomain.id,
          payload: { extensionId: nonExistentExtensionId },
        },
      });

      // Assert console.error was called with failure message
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorCall = consoleErrorSpy.mock.calls[0];
      expect(errorCall[0]).toContain('[ScreensetsRegistry] Actions chain failed:');
    });

    it('should not throw when actions chain fails', async () => {
      // Register domain with registry
      registry.registerDomain(testDomain, mockContainerProvider);

      // Execute actions chain that will fail
      const nonExistentExtensionId = 'gts.frontx.mfes.ext.extension.v1~frontx.test.phase41.nonexistent.v1';

      // Assert the promise resolves (does not reject)
      await expect(
        registry.executeActionsChain({
          action: {
            type: FRONTX_ACTION_MOUNT_EXT,
            target: testDomain.id,
            payload: { extensionId: nonExistentExtensionId },
          },
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('41.5.4 - executeActionsChain does not log on successful chain', () => {
    it('should not log console.error when actions chain succeeds', async () => {
      // Create a custom action type and register it with GTS
      const customActionId = 'gts.frontx.mfes.comm.action.v1~frontx.test.phase41.custom_action.v1';
      gtsPlugin.register({
        id: customActionId,
        type: customActionId,
        target: testDomain.id,
        payload: {},
      });

      // Register domain with a custom action
      const customDomain: ExtensionDomain = {
        id: 'gts.frontx.mfes.ext.domain.v1~frontx.test.phase41.custom_domain.v1',
        sharedProperties: [],
        actions: [customActionId],
        extensionsActions: [],
        defaultActionTimeout: 3000,
        lifecycleStages: [
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
        ],
        extensionsLifecycleStages: [
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
        ],
      };
      gtsPlugin.register(customDomain);
      registry.registerDomain(customDomain, mockContainerProvider);

      // Execute successful actions chain with a mocked domain handler
      // The domain handler will be automatically created by the registry for the domain
      // We just need to execute an action that the domain can handle
      await registry.executeActionsChain({
        action: {
          type: customActionId,
          target: customDomain.id,
          payload: {},
        },
      });

      // Assert console.error was NOT called (chain succeeded)
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
