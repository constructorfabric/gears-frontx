/**
 * GTS Package Tracking Tests - Phase 39.6
 *
 * Tests for registry package tracking methods.
 *
 * @packageDocumentation
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultScreensetsRegistry } from '../../../src/mfe/runtime/DefaultScreensetsRegistry';
import { gtsPlugin } from '../../../src/mfe/plugins/gts';
import type { ExtensionDomain, Extension, MfeEntry } from '../../../src/mfe/types';
import {
  FRONTX_ACTION_LOAD_EXT,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_ACTION_UNMOUNT_EXT,
} from '../../../src/mfe/constants';
import { MockContainerProvider } from '../test-utils';

describe('GTS Package Tracking - Phase 39.6', () => {
  let registry: DefaultScreensetsRegistry;
  let mockContainerProvider: MockContainerProvider;

  const testDomain: ExtensionDomain = {
    id: 'gts.frontx.mfes.ext.domain.v1~test.package.tracking.domain.v1',
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

  const testEntry: MfeEntry = {
    id: 'gts.frontx.mfes.mfe.entry.v1~test.package.tracking.entry.v1',
    requiredProperties: [],
    optionalProperties: [],
    actions: [],
    domainActions: [
      FRONTX_ACTION_LOAD_EXT,
      FRONTX_ACTION_MOUNT_EXT,
      FRONTX_ACTION_UNMOUNT_EXT,
    ],
  };

  // Extensions from frontx.demo package
  const demoExtension1: Extension = {
    id: 'gts.frontx.mfes.ext.extension.v1~frontx.demo.screens.ext1.v1',
    domain: testDomain.id,
    entry: testEntry.id,
  };

  const demoExtension2: Extension = {
    id: 'gts.frontx.mfes.ext.extension.v1~frontx.demo.screens.ext2.v1',
    domain: testDomain.id,
    entry: testEntry.id,
  };

  // Extension from frontx.other package
  const otherExtension: Extension = {
    id: 'gts.frontx.mfes.ext.extension.v1~frontx.other.screens.ext1.v1',
    domain: testDomain.id,
    entry: testEntry.id,
  };

  beforeEach(() => {
    registry = new DefaultScreensetsRegistry({
      typeSystem: gtsPlugin,
    });
    mockContainerProvider = new MockContainerProvider();

    // Register the domain and entry instances with GTS plugin before using them
    gtsPlugin.register(testDomain);
    gtsPlugin.register(testEntry);
  });

  describe('getRegisteredPackages', () => {
    it('39.6.5 should return empty array when no extensions registered', () => {
      const packages = registry.getRegisteredPackages();
      expect(packages).toEqual([]);
    });

    it('39.6.6 should return package when extension with frontx.demo is registered', async () => {
      // Register domain first
      registry.registerDomain(testDomain, mockContainerProvider);

      // Register extension from frontx.demo
      await registry.registerExtension(demoExtension1);

      const packages = registry.getRegisteredPackages();
      expect(packages).toEqual(['frontx.demo']);
    });

    it('39.6.7 should return both packages when extensions from different packages are registered', async () => {
      // Register domain first
      registry.registerDomain(testDomain, mockContainerProvider);

      // Register extensions from different packages
      await registry.registerExtension(demoExtension1);
      await registry.registerExtension(otherExtension);

      const packages = registry.getRegisteredPackages();
      expect(packages).toEqual(['frontx.demo', 'frontx.other']);
    });

    it('39.6.8 should return only one entry when 2 extensions from SAME package are registered (deduplication)', async () => {
      // Register domain first
      registry.registerDomain(testDomain, mockContainerProvider);

      // Register 2 extensions from same package
      await registry.registerExtension(demoExtension1);
      await registry.registerExtension(demoExtension2);

      const packages = registry.getRegisteredPackages();
      expect(packages).toEqual(['frontx.demo']);
      expect(packages.length).toBe(1);
    });
  });

  describe('getExtensionsForPackage', () => {
    it('39.6.9 should return only extensions from specified package', async () => {
      // Register domain first
      registry.registerDomain(testDomain, mockContainerProvider);

      // Register extensions from 2 different packages
      await registry.registerExtension(demoExtension1);
      await registry.registerExtension(demoExtension2);
      await registry.registerExtension(otherExtension);

      const demoExtensions = registry.getExtensionsForPackage('frontx.demo');
      expect(demoExtensions).toHaveLength(2);
      expect(demoExtensions.map(e => e.id)).toContain(demoExtension1.id);
      expect(demoExtensions.map(e => e.id)).toContain(demoExtension2.id);

      const otherExtensions = registry.getExtensionsForPackage('frontx.other');
      expect(otherExtensions).toHaveLength(1);
      expect(otherExtensions[0].id).toBe(otherExtension.id);
    });

    it('39.6.10 should return empty array for untracked package', async () => {
      // Register domain first
      registry.registerDomain(testDomain, mockContainerProvider);

      // Register extension from frontx.demo
      await registry.registerExtension(demoExtension1);

      // Query for a package that has no extensions
      const extensions = registry.getExtensionsForPackage('frontx.unknown');
      expect(extensions).toEqual([]);
    });
  });

  describe('unregisterExtension and package cleanup', () => {
    it('39.6.11 should remove extension from package; remove package if last extension', async () => {
      // Register domain first
      registry.registerDomain(testDomain, mockContainerProvider);

      // Register extensions from 2 packages
      await registry.registerExtension(demoExtension1);
      await registry.registerExtension(demoExtension2);
      await registry.registerExtension(otherExtension);

      // Verify initial state
      expect(registry.getRegisteredPackages()).toEqual(['frontx.demo', 'frontx.other']);
      expect(registry.getExtensionsForPackage('frontx.demo')).toHaveLength(2);

      // Unregister one extension from frontx.demo
      await registry.unregisterExtension(demoExtension1.id);

      // Package should still exist with 1 extension
      expect(registry.getRegisteredPackages()).toEqual(['frontx.demo', 'frontx.other']);
      expect(registry.getExtensionsForPackage('frontx.demo')).toHaveLength(1);
      expect(registry.getExtensionsForPackage('frontx.demo')[0].id).toBe(demoExtension2.id);

      // Unregister last extension from frontx.demo
      await registry.unregisterExtension(demoExtension2.id);

      // Package should be removed
      expect(registry.getRegisteredPackages()).toEqual(['frontx.other']);
      expect(registry.getExtensionsForPackage('frontx.demo')).toEqual([]);
    });
  });

  describe('dispose', () => {
    it('39.6.12 should clear packages after dispose', async () => {
      // Register domain first
      registry.registerDomain(testDomain, mockContainerProvider);

      // Register extensions
      await registry.registerExtension(demoExtension1);
      await registry.registerExtension(otherExtension);

      // Verify packages are tracked
      expect(registry.getRegisteredPackages()).toEqual(['frontx.demo', 'frontx.other']);

      // Dispose registry
      registry.dispose();

      // Packages should be cleared
      expect(registry.getRegisteredPackages()).toEqual([]);
    });
  });
});
