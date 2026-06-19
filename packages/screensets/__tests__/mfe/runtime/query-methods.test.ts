/**
 * Query Methods Tests (Phase 19.1b)
 *
 * Tests for ScreensetsRegistry query methods:
 * - getExtension
 * - getDomain
 * - getExtensionsForDomain
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultScreensetsRegistry } from '../../../src/mfe/runtime/DefaultScreensetsRegistry';
import { gtsPlugin } from '../../../src/mfe/plugins/gts';
import type { ExtensionDomain, Extension } from '../../../src/mfe/types';
import { MockContainerProvider } from '../test-utils';

describe('ScreensetsRegistry Query Methods', () => {
  let registry: DefaultScreensetsRegistry;
  let mockContainerProvider: MockContainerProvider;

  const testDomain: ExtensionDomain = {
    id: 'gts.frontx.mfes.ext.domain.v1~test.testorg.query.domain.v1',
    sharedProperties: [],
    actions: [],
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

  const testEntry = {
    id: 'gts.frontx.mfes.mfe.entry.v1~test.testorg.query.entry.v1',
    requiredProperties: [],
    optionalProperties: [],
    actions: [],
    domainActions: [],
  };

  const testExtension: Extension = {
    id: 'gts.frontx.mfes.ext.extension.v1~test.testorg.query.extension.v1',
    domain: testDomain.id,
    entry: testEntry.id,
  };

  beforeEach(() => {
    registry = new DefaultScreensetsRegistry({
      typeSystem: gtsPlugin,
    });
    mockContainerProvider = new MockContainerProvider();

    // Register the entry instance with GTS plugin before using it
    gtsPlugin.register(testEntry);
  });

  describe('getExtension', () => {
    it('should return registered extension', async () => {
      // Register domain and extension
      registry.registerDomain(testDomain, mockContainerProvider);
      await registry.registerExtension(testExtension);

      const result = registry.getExtension(testExtension.id);
      expect(result).toBeDefined();
      expect(result?.id).toBe(testExtension.id);
      expect(result?.domain).toBe(testDomain.id);
    });

    it('should return undefined for unregistered extension', () => {
      const result = registry.getExtension('nonexistent');
      expect(result).toBeUndefined();
    });

    it('should return extension with presentation metadata', async () => {
      const extensionWithPresentation: Extension = {
        id: 'gts.frontx.mfes.ext.extension.v1~test.testorg.query.with_presentation.v1',
        domain: testDomain.id,
        entry: testEntry.id,
        presentation: {
          label: 'Test Screen',
          icon: 'test',
          route: '/test',
          order: 10,
        },
      };

      // Register domain and extension
      registry.registerDomain(testDomain, mockContainerProvider);
      await registry.registerExtension(extensionWithPresentation);

      const result = registry.getExtension(extensionWithPresentation.id);
      expect(result).toBeDefined();
      expect(result?.presentation).toEqual({
        label: 'Test Screen',
        icon: 'test',
        route: '/test',
        order: 10,
      });
    });
  });

  describe('getDomain', () => {
    it('should return registered domain', () => {
      registry.registerDomain(testDomain, mockContainerProvider);

      const result = registry.getDomain(testDomain.id);
      expect(result).toBeDefined();
      expect(result?.id).toBe(testDomain.id);
    });

    it('should return undefined for unregistered domain', () => {
      const result = registry.getDomain('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('getExtensionsForDomain', () => {
    it('should return all extensions for a domain', async () => {
      const testExtension2: Extension = {
        id: 'gts.frontx.mfes.ext.extension.v1~test.testorg.query.extension2.v1',
        domain: testDomain.id,
        entry: testEntry.id,
      };

      // Register domain
      registry.registerDomain(testDomain, mockContainerProvider);

      // Register extensions
      await registry.registerExtension(testExtension);
      await registry.registerExtension(testExtension2);

      const result = registry.getExtensionsForDomain(testDomain.id);
      expect(result).toHaveLength(2);
      expect(result.some(ext => ext.id === testExtension.id)).toBe(true);
      expect(result.some(ext => ext.id === testExtension2.id)).toBe(true);
    });

    it('should return empty array for domain with no extensions', () => {
      registry.registerDomain(testDomain, mockContainerProvider);

      const result = registry.getExtensionsForDomain(testDomain.id);
      expect(result).toEqual([]);
    });

    it('should return empty array for unregistered domain', () => {
      const result = registry.getExtensionsForDomain('nonexistent');
      expect(result).toEqual([]);
    });
  });
});
