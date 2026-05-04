/**
 * GTS Package Tracking Tests - Phase 39.6
 *
 * Tests for registry package tracking methods.
 *
 * @packageDocumentation
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultMfeRegistry } from '../../../src/mfe/runtime/DefaultMfeRegistry';
import { GtsPlugin } from '../../../src/mfe/plugins/gts';
import type { ExtensionDomain, Extension, MfeEntry } from '../../../src/mfe/types';
import {
  HAI3_ACTION_LOAD_EXT,
  HAI3_ACTION_MOUNT_EXT,
  HAI3_ACTION_UNMOUNT_EXT,
} from '../../../src/mfe/constants';
import { MockDomainFactory } from '../../../__test-utils__';

describe('GTS Package Tracking - Phase 39.6', () => {
  let registry: DefaultMfeRegistry;
  let mockContainerProvider: MockDomainFactory;
  let typeSystem: GtsPlugin;

  const testDomain: ExtensionDomain = {
    id: 'gts.hai3.mfes.ext.domain.v1~test.package.tracking.domain.v1',
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
    id: 'gts.hai3.mfes.mfe.entry.v1~test.package.tracking.entry.v1',
    requiredProperties: [],
    optionalProperties: [],
    actions: [],
    domainActions: [
      HAI3_ACTION_LOAD_EXT,
      HAI3_ACTION_MOUNT_EXT,
      HAI3_ACTION_UNMOUNT_EXT,
    ],
  };

  // Extensions from hai3.demo package
  const demoExtension1: Extension = {
    id: 'gts.hai3.mfes.ext.extension.v1~hai3.demo.screens.ext1.v1',
    domain: testDomain.id,
    entry: testEntry.id,
  };

  const demoExtension2: Extension = {
    id: 'gts.hai3.mfes.ext.extension.v1~hai3.demo.screens.ext2.v1',
    domain: testDomain.id,
    entry: testEntry.id,
  };

  // Extension from hai3.other package
  const otherExtension: Extension = {
    id: 'gts.hai3.mfes.ext.extension.v1~hai3.other.screens.ext1.v1',
    domain: testDomain.id,
    entry: testEntry.id,
  };

  beforeEach(() => {
    typeSystem = new GtsPlugin();
    registry = new DefaultMfeRegistry({
      typeSystem,
    });
    mockContainerProvider = new MockDomainFactory();

    // Register the domain and entry instances with GTS plugin before using them
    typeSystem.register(testDomain);
    typeSystem.register(testEntry);
  });

  describe('getRegisteredPackages', () => {
    it('39.6.5 should return empty array when no extensions registered', () => {
      const packages = registry.getRegisteredPackages();
      expect(packages).toEqual([]);
    });

    it('39.6.6 should return package when extension with hai3.demo is registered', async () => {
      // Register domain first
      registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));

      // Register extension from hai3.demo
      await registry.registerExtension(demoExtension1);

      const packages = registry.getRegisteredPackages();
      expect(packages).toEqual(['hai3.demo']);
    });

    it('39.6.7 should return both packages when extensions from different packages are registered', async () => {
      // Register domain first
      registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));

      // Register extensions from different packages
      await registry.registerExtension(demoExtension1);
      await registry.registerExtension(otherExtension);

      const packages = registry.getRegisteredPackages();
      expect(packages).toEqual(['hai3.demo', 'hai3.other']);
    });

    it('39.6.8 should return only one entry when 2 extensions from SAME package are registered (deduplication)', async () => {
      // Register domain first
      registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));

      // Register 2 extensions from same package
      await registry.registerExtension(demoExtension1);
      await registry.registerExtension(demoExtension2);

      const packages = registry.getRegisteredPackages();
      expect(packages).toEqual(['hai3.demo']);
      expect(packages.length).toBe(1);
    });
  });

  describe('getExtensionsForPackage', () => {
    it('39.6.9 should return only extensions from specified package', async () => {
      // Register domain first
      registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));

      // Register extensions from 2 different packages
      await registry.registerExtension(demoExtension1);
      await registry.registerExtension(demoExtension2);
      await registry.registerExtension(otherExtension);

      const demoExtensions = registry.getExtensionsForPackage('hai3.demo');
      expect(demoExtensions).toHaveLength(2);
      expect(demoExtensions.map(e => e.id)).toContain(demoExtension1.id);
      expect(demoExtensions.map(e => e.id)).toContain(demoExtension2.id);

      const otherExtensions = registry.getExtensionsForPackage('hai3.other');
      expect(otherExtensions).toHaveLength(1);
      expect(otherExtensions[0].id).toBe(otherExtension.id);
    });

    it('39.6.10 should return empty array for untracked package', async () => {
      // Register domain first
      registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));

      // Register extension from hai3.demo
      await registry.registerExtension(demoExtension1);

      // Query for a package that has no extensions
      const extensions = registry.getExtensionsForPackage('hai3.unknown');
      expect(extensions).toEqual([]);
    });
  });

  describe('unregisterExtension and package cleanup', () => {
    it('39.6.11 should remove extension from package; remove package if last extension', async () => {
      // Register domain first
      registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));

      // Register extensions from 2 packages
      await registry.registerExtension(demoExtension1);
      await registry.registerExtension(demoExtension2);
      await registry.registerExtension(otherExtension);

      // Verify initial state
      expect(registry.getRegisteredPackages()).toEqual(['hai3.demo', 'hai3.other']);
      expect(registry.getExtensionsForPackage('hai3.demo')).toHaveLength(2);

      // Unregister one extension from hai3.demo
      await registry.unregisterExtension(demoExtension1.id);

      // Package should still exist with 1 extension
      expect(registry.getRegisteredPackages()).toEqual(['hai3.demo', 'hai3.other']);
      expect(registry.getExtensionsForPackage('hai3.demo')).toHaveLength(1);
      expect(registry.getExtensionsForPackage('hai3.demo')[0].id).toBe(demoExtension2.id);

      // Unregister last extension from hai3.demo
      await registry.unregisterExtension(demoExtension2.id);

      // Package should be removed
      expect(registry.getRegisteredPackages()).toEqual(['hai3.other']);
      expect(registry.getExtensionsForPackage('hai3.demo')).toEqual([]);
    });
  });

  describe('dispose', () => {
    it('39.6.12 should clear packages after dispose', async () => {
      // Register domain first
      registry.registerDomain(testDomain, mockContainerProvider.prepareForDomain(testDomain));

      // Register extensions
      await registry.registerExtension(demoExtension1);
      await registry.registerExtension(otherExtension);

      // Verify packages are tracked
      expect(registry.getRegisteredPackages()).toEqual(['hai3.demo', 'hai3.other']);

      // Dispose registry
      registry.dispose();

      // Packages should be cleared
      expect(registry.getRegisteredPackages()).toEqual([]);
    });
  });
});
