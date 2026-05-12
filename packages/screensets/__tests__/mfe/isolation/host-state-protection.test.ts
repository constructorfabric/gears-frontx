/**
 * Host State Protection Integration Tests
 *
 * Verifies host/MFE isolation through the real load -> mount -> unmount path.
 * These tests assert the public runtime boundary instead of reconstructing
 * coordinator state or bridge pairs by hand.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DefaultMfeRegistry } from '../../../src/mfe/runtime/DefaultMfeRegistry';
import { GtsPlugin } from '../../../src/mfe/plugins/gts';
import {
  HAI3_ACTION_LOAD_EXT,
  HAI3_ACTION_MOUNT_EXT,
  HAI3_ACTION_UNMOUNT_EXT,
} from '../../../src/mfe/constants';
import type { Extension, ExtensionDomain, MfeEntry } from '../../../src/mfe/types';
import type {
  ChildMfeBridge,
  MfeEntryLifecycle,
  MfeMountContext,
} from '../../../src/mfe/handler/types';
import type { JSONSchema } from '../../../src/mfe/plugins/types';
import { MockDomainFactory, makeMfeHandlerDouble } from '../../../__test-utils__';

const DOMAIN_ID =
  'gts.hai3.mfes.ext.domain.v1~hai3.test.host_state_protection.domain.v1';
const ENTRY_ID =
  'gts.hai3.mfes.mfe.entry.v1~hai3.test.host_state_protection.entry.v1';
const EXTENSION_ID =
  'gts.hai3.mfes.ext.extension.v1~hai3.test.host_state_protection.ext.v1';
const TEST_PROPERTY_TYPE_ID =
  'gts.hai3.mfes.comm.shared_property.v1~hai3.test.host_state_protection.theme.v1~';
const THEME_DARK = 'dark';

const testPropertySchema: JSONSchema = {
  $id: `gts://${TEST_PROPERTY_TYPE_ID}`,
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  allOf: [{ $ref: 'gts://gts.hai3.mfes.comm.shared_property.v1~' }],
  properties: {
    value: { type: 'string', enum: [THEME_DARK, 'light'] },
  },
};

const testDomain: ExtensionDomain = {
  id: DOMAIN_ID,
  sharedProperties: [TEST_PROPERTY_TYPE_ID],
  actions: [HAI3_ACTION_LOAD_EXT, HAI3_ACTION_MOUNT_EXT, HAI3_ACTION_UNMOUNT_EXT],
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
  id: ENTRY_ID,
  requiredProperties: [],
  optionalProperties: [],
  actions: [],
  domainActions: [HAI3_ACTION_LOAD_EXT, HAI3_ACTION_MOUNT_EXT, HAI3_ACTION_UNMOUNT_EXT],
};

const testExtension: Extension = {
  id: EXTENSION_ID,
  domain: DOMAIN_ID,
  entry: ENTRY_ID,
};

describe('Host State Protection', () => {
  let registry: DefaultMfeRegistry;
  let mockContainerProvider: MockDomainFactory;
  let mockLifecycle: MfeEntryLifecycle<ChildMfeBridge>;
  let capturedBridge: ChildMfeBridge | undefined;
  let capturedMountContext: MfeMountContext | undefined;
  let typeSystem: GtsPlugin;

  beforeEach(() => {
    typeSystem = new GtsPlugin();
    typeSystem.registerSchema(testPropertySchema);
    typeSystem.register(testEntry);

    capturedBridge = undefined;
    capturedMountContext = undefined;
    mockContainerProvider = new MockDomainFactory();
    mockLifecycle = {
      mount: vi.fn(
        async (
          _container: Element | ShadowRoot,
          bridge: ChildMfeBridge,
          mountContext?: MfeMountContext
        ) => {
          capturedBridge = bridge;
          capturedMountContext = mountContext;
        }
      ),
      unmount: vi.fn().mockResolvedValue(undefined),
    };

    const loadMock = vi
      .fn<(entry: MfeEntry) => Promise<MfeEntryLifecycle<ChildMfeBridge>>>()
      .mockResolvedValue(mockLifecycle);
    const mockHandler = makeMfeHandlerDouble({
      handledBaseTypeId: 'gts.hai3.mfes.mfe.entry.v1~',
      priority: 100,
      load: loadMock,
    });

    registry = new DefaultMfeRegistry({
      typeSystem,
      mfeHandlers: [mockHandler],
    });
    registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));
    registry.getMounter(DOMAIN_ID).attach(document.createElement('div'));
  });

  async function mountExtensionThroughPublicApi(): Promise<ChildMfeBridge> {
    await registry.registerExtension(testExtension);

    await registry.executeActionsChain({
      action: {
        type: HAI3_ACTION_LOAD_EXT,
        target: DOMAIN_ID,
        payload: { subject: EXTENSION_ID },
      },
    });

    await registry.executeActionsChain({
      action: {
        type: HAI3_ACTION_MOUNT_EXT,
        target: DOMAIN_ID,
        payload: { subject: EXTENSION_ID },
      },
    });

    expect(capturedBridge).toBeDefined();
    return capturedBridge!;
  }

  it('mounts the MFE with only the public child-bridge boundary', async () => {
    const bridge = await mountExtensionThroughPublicApi();

    expect(mockLifecycle.mount).toHaveBeenCalledOnce();

    const [mountTarget, mountedBridge, mountContext] = vi.mocked(
      mockLifecycle.mount
    ).mock.calls[0];

    expect(mountTarget).toBe(mockContainerProvider.mockContainer.shadowRoot);
    expect(mountTarget).not.toBe(mockContainerProvider.mockContainer);
    expect(mountedBridge).toBe(bridge);
    expect(capturedMountContext).toEqual(mountContext);
    expect(mountContext).toMatchObject({
      extensionId: EXTENSION_ID,
      domainId: DOMAIN_ID,
    });

    const parentBridge = registry.getParentBridge(EXTENSION_ID);
    expect(parentBridge).not.toBeNull();
    expect(bridge).not.toBe(parentBridge);
    expect(parentBridge?.instanceId).toBe(bridge.instanceId);

    expect(typeof bridge.executeActionsChain).toBe('function');
    expect(typeof bridge.subscribeToProperty).toBe('function');
    expect(typeof bridge.getProperty).toBe('function');
    expect(typeof bridge.registerActionHandler).toBe('function');

    expect('hostRuntime' in bridge).toBe(false);
    expect('coordinator' in bridge).toBe(false);
    expect('getParentBridge' in bridge).toBe(false);
  });

  it('delivers host shared state through the mounted bridge contract', async () => {
    const bridge = await mountExtensionThroughPublicApi();
    const onTheme = vi.fn();

    const unsubscribe = bridge.subscribeToProperty(TEST_PROPERTY_TYPE_ID, onTheme);

    expect(bridge.getProperty(TEST_PROPERTY_TYPE_ID)).toBeUndefined();

    registry.updateSharedProperty(TEST_PROPERTY_TYPE_ID, THEME_DARK);

    expect(bridge.getProperty(TEST_PROPERTY_TYPE_ID)).toEqual({
      id: TEST_PROPERTY_TYPE_ID,
      value: THEME_DARK,
    });
    expect(onTheme).toHaveBeenCalledWith({
      id: TEST_PROPERTY_TYPE_ID,
      value: THEME_DARK,
    });
    expect(registry.getDomainProperty(DOMAIN_ID, TEST_PROPERTY_TYPE_ID)).toBe(
      THEME_DARK
    );

    unsubscribe();
  });

  it('cleans up bridge state through the public unmount flow', async () => {
    const bridge = await mountExtensionThroughPublicApi();

    registry.updateSharedProperty(TEST_PROPERTY_TYPE_ID, THEME_DARK);
    expect(bridge.getProperty(TEST_PROPERTY_TYPE_ID)).toEqual({
      id: TEST_PROPERTY_TYPE_ID,
      value: THEME_DARK,
    });

    await registry.executeActionsChain({
      action: {
        type: HAI3_ACTION_UNMOUNT_EXT,
        target: DOMAIN_ID,
        payload: { subject: EXTENSION_ID },
      },
    });

    expect(mockLifecycle.unmount).toHaveBeenCalledOnce();
    expect(registry.getParentBridge(EXTENSION_ID)).toBeNull();
    expect(bridge.getProperty(TEST_PROPERTY_TYPE_ID)).toBeUndefined();
  });
});
