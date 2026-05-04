/**
 * Mount Context Lifecycle Tests
 *
 * Verifies:
 * - Runtime identity metadata is always attached to lifecycle.mount()
 *
 * @cpt-FEATURE:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2
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

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const DOMAIN_ID = 'gts.hai3.mfes.ext.domain.v1~hai3.test.mount_context.domain.v1';
const ENTRY_ID = 'gts.hai3.mfes.mfe.entry.v1~hai3.test.mount_context.entry.v1';
const EXT_ID = 'gts.hai3.mfes.ext.extension.v1~hai3.test.mount_context.ext.v1';
const testDomain: ExtensionDomain = {
  id: DOMAIN_ID,
  sharedProperties: [],
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
  id: EXT_ID,
  domain: DOMAIN_ID,
  entry: ENTRY_ID,
};

// @cpt-begin:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-test-mount-manager-context
describe('DefaultMountManager — mount context forwarding', () => {
  let mountManager: DefaultMountManager;
  let extensionManager: DefaultExtensionManager;
  let mockContainerProvider: MockDomainFactory;
  let mockLifecycle: MfeEntryLifecycle;
  let typeSystem: GtsPlugin;
  beforeEach(() => {
    typeSystem = new GtsPlugin();
    typeSystem.register(testEntry);

    extensionManager = new DefaultExtensionManager({
      typeSystem,
      triggerLifecycle: vi.fn().mockResolvedValue(undefined),
      triggerDomainOwnLifecycle: vi.fn().mockResolvedValue(undefined),
      unmountExtension: vi.fn().mockResolvedValue(undefined),
      validateEntryType: vi.fn(),
    });

    mockContainerProvider = new MockDomainFactory();
    mockLifecycle = {
      mount: vi.fn().mockResolvedValue(undefined),
      unmount: vi.fn().mockResolvedValue(undefined),
    };

    const coordinator: RuntimeCoordinator = {
      register: vi.fn(),
      unregister: vi.fn(),
      get: vi.fn(),
    };

    const bridgeFactory = new DefaultRuntimeBridgeFactory();
    const loadMock = vi
      .fn<(entry: MfeEntry) => Promise<MfeEntryLifecycle<ChildMfeBridge>>>()
      .mockResolvedValue(mockLifecycle);
    const testHandler = makeMfeHandlerDouble({
      handledBaseTypeId: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~',
      priority: 0,
      load: loadMock,
    });
    mountManager = new DefaultMountManager({
      extensionManager,
      resolveHandler: () => testHandler,
      coordinator,
      triggerLifecycle: vi.fn().mockResolvedValue(undefined),
      executeActionsChain: vi.fn().mockResolvedValue(undefined),
      hostRuntime: createMinimalMfeRegistryStub(),
      registerCatchAllActionHandler: vi.fn(),
      unregisterCatchAllActionHandler: vi.fn(),
      registerExtensionActionHandler: vi.fn(),
      unregisterExtensionActionHandler: vi.fn(),
      bridgeFactory,
    });

    extensionManager.registerDomain(testDomain);
  });

  it('passes runtime identity metadata to lifecycle.mount()', async () => {
    await extensionManager.registerExtension(testExtension);

    const container = mockContainerProvider.mockContainer as HTMLElement;
    await mountManager.mountExtension(EXT_ID, container);

    expect(mockLifecycle.mount).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(mockLifecycle.mount).mock.calls[0];
    expect(callArgs[2]).toMatchObject({
      extensionId: EXT_ID,
      domainId: DOMAIN_ID,
    });
  });
});
// @cpt-end:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-test-mount-manager-context
