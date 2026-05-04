/**
 * Entry Type Validation Tests (Phase 32.3)
 *
 * Tests that registerExtension() validates the extension's entry type
 * against registered handlers. If no handler can handle the entry type
 * and handlers are registered, registration should fail early.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultMfeRegistry } from '../../../src/mfe/runtime/DefaultMfeRegistry';
import { GtsPlugin } from '../../../src/mfe/plugins/gts';
import { MfeHandlerMF } from '../../../src/mfe/handler/mf-handler';
import type { ExtensionDomain, Extension, MfeEntry, MfeEntryMF } from '../../../src/mfe/types';
import {
  HAI3_ACTION_LOAD_EXT,
  HAI3_ACTION_MOUNT_EXT,
  HAI3_ACTION_UNMOUNT_EXT,
} from '../../../src/mfe/constants';
import { EntryTypeNotHandledError } from '../../../src/mfe/errors';
import { MockDomainFactory } from '../../../__test-utils__';

describe('Entry Type Validation (Phase 32.3)', () => {
  let gtsPlugin: GtsPlugin;
  let mockContainerProvider: MockDomainFactory;

  const testDomain: ExtensionDomain = {
    id: 'gts.hai3.mfes.ext.domain.v1~test.entryval.reg.domain.v1',
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

  // Entry that does NOT derive from MfeEntryMF (base MfeEntry only)
  const nonMfEntry: MfeEntry = {
    id: 'gts.hai3.mfes.mfe.entry.v1~test.entryval.reg.nonmf.v1',
    requiredProperties: [],
    optionalProperties: [],
    actions: [],
    domainActions: [
      HAI3_ACTION_LOAD_EXT,
      HAI3_ACTION_MOUNT_EXT,
      HAI3_ACTION_UNMOUNT_EXT,
    ],
  };

  // Entry that derives from MfeEntryMF (valid for MfeHandlerMF)
  const mfEntry: MfeEntryMF = {
    id: 'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~test.entryval.reg.mfentry.v1',
    manifest: {
      id: 'gts.hai3.mfes.mfe.mf_manifest.v1~test.entryval.reg.manifest.v1',
      name: 'testRemote',
      metaData: {
        name: 'testRemote',
        type: 'app',
        buildInfo: { buildVersion: '1.0.0', buildName: 'testRemote' },
        remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' },
        globalName: 'testRemote',
        publicPath: 'https://cdn.example.com/',
      },
      shared: [],
    },
    exposedModule: './TestComponent',
    exposeAssets: {
      js: { sync: ['expose-TestComponent.js'], async: [] },
      css: { sync: [], async: [] },
    },
    requiredProperties: [],
    optionalProperties: [],
    actions: [],
    domainActions: [
      HAI3_ACTION_LOAD_EXT,
      HAI3_ACTION_MOUNT_EXT,
      HAI3_ACTION_UNMOUNT_EXT,
    ],
  };

  beforeEach(() => {
    gtsPlugin = new GtsPlugin();

    mockContainerProvider = new MockDomainFactory();

    // Register entries in GTS before using them
    gtsPlugin.register(nonMfEntry);
    gtsPlugin.register(mfEntry);
  });

  it('32.3.2 - should throw EntryTypeNotHandledError when handler cannot handle entry type', async () => {
    // Create registry with MfeHandlerMF registered
    const handler = new MfeHandlerMF('gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~', { timeout: 5000, retries: 0 });
    const registry = new DefaultMfeRegistry({
      typeSystem: gtsPlugin,
      mfeHandlers: [handler],
    });

    // Register domain
    registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));

    // Attempt to register extension with non-MF entry type
    const extension: Extension = {
      id: 'gts.hai3.mfes.ext.extension.v1~test.entryval.reg.extnonmf.v1',
      domain: testDomain.id,
      entry: nonMfEntry.id,
    };

    await expect(registry.registerExtension(extension)).rejects.toThrow(EntryTypeNotHandledError);
    await expect(registry.registerExtension(extension)).rejects.toThrow(
      /No registered handler can handle entry type/
    );
  });

  it('32.3.3 - should succeed when handler can handle the entry type', async () => {
    // Create registry with MfeHandlerMF registered
    const handler = new MfeHandlerMF('gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~', { timeout: 5000, retries: 0 });
    const registry = new DefaultMfeRegistry({
      typeSystem: gtsPlugin,
      mfeHandlers: [handler],
    });

    // Register domain
    registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));

    // Register extension with MfeEntryMF-derived entry type
    const extension: Extension = {
      id: 'gts.hai3.mfes.ext.extension.v1~test.entryval.reg.extmf.v1',
      domain: testDomain.id,
      entry: mfEntry.id,
    };

    // Should succeed without throwing
    await expect(registry.registerExtension(extension)).resolves.not.toThrow();

    // Verify extension was registered
    const registered = registry.getExtension(extension.id);
    expect(registered).toBeDefined();
    expect(registered?.id).toBe(extension.id);
  });

  it('32.3.4 - should succeed when no handlers are registered (validation skipped)', async () => {
    // Create registry with NO handlers
    const registry = new DefaultMfeRegistry({
      typeSystem: gtsPlugin,
      // No mfeHandlers
    });

    // Register domain
    registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));

    // Register extension with non-MF entry type -- should succeed since no handlers
    const extension: Extension = {
      id: 'gts.hai3.mfes.ext.extension.v1~test.entryval.reg.extnohdl.v1',
      domain: testDomain.id,
      entry: nonMfEntry.id,
    };

    // Should succeed without throwing (validation skipped when no handlers)
    await expect(registry.registerExtension(extension)).resolves.not.toThrow();

    // Verify extension was registered
    const registered = registry.getExtension(extension.id);
    expect(registered).toBeDefined();
    expect(registered?.id).toBe(extension.id);
  });
});
