/**
 * Tests for Bridge Tracking in ScreensetsRegistry
 *
 * Verifies:
 * - Bridge lifecycle is managed by registry
 * - Child bridges are tracked privately
 * - Parent bridge is tracked privately
 * - Dispose properly cleans up bridges
 * - No public access to bridge internals
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScreensetsRegistry } from '../../../src/mfe/runtime';
import { DefaultScreensetsRegistry } from '../../../src/mfe/runtime/DefaultScreensetsRegistry';
import { gtsPlugin } from '../../../src/mfe/plugins/gts';
import type { ExtensionDomain } from '../../../src/mfe/types';
import { MockContainerProvider } from '../test-utils';


describe('ScreensetsRegistry - Bridge Tracking', () => {
  let registry: ScreensetsRegistry;

  beforeEach(() => {
    registry = new DefaultScreensetsRegistry({
      typeSystem: gtsPlugin,
    });
  });


  describe('dispose', () => {
    it('should handle disposal when no bridges present', () => {
      // Should not throw when there are no bridges
      expect(() => registry.dispose()).not.toThrow();
    });

    it('should be idempotent for disposal', () => {
      // First disposal
      registry.dispose();

      // Second disposal should not throw
      expect(() => registry.dispose()).not.toThrow();
    });

    it('should safely dispose after domain registration', () => {
      const testDomain: ExtensionDomain = {
        id: 'gts.frontx.mfes.ext.domain.v1~test.bridge.tracking.domain.v1',
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
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
        ],
      };

      registry.registerDomain(testDomain, new MockContainerProvider());

      // Verify domain is registered before disposal
      expect(registry.getDomain(testDomain.id)).toBeDefined();

      // Dispose should complete without error
      expect(() => registry.dispose()).not.toThrow();
    });
  });

  describe('Bridge lifecycle principles', () => {
    it('should demonstrate that bridges are managed by registry, not exposed', () => {
      // The registry manages bridge lifecycle internally
      // Users interact with the registry API, not directly with bridges

      // This is SOLID: Single Responsibility Principle
      // The registry is responsible for bridge lifecycle

      // Verify that public API does NOT expose bridge management
      const registryPublicAPI = Object.getOwnPropertyNames(Object.getPrototypeOf(registry));

      // Should NOT have public methods for bridge manipulation (except getParentBridge, which was added in Phase 24)
      expect(registryPublicAPI).not.toContain('getChildBridge');
      expect(registryPublicAPI).not.toContain('addChildBridge');
      expect(registryPublicAPI).not.toContain('removeChildBridge');
      expect(registryPublicAPI).not.toContain('setParentBridge');

      // Phase 24 added getParentBridge as a public method
      expect(registryPublicAPI).toContain('getParentBridge');

      // Should NOT have direct lifecycle methods (removed in Phase 24)
      expect(registryPublicAPI).not.toContain('loadExtension');
      expect(registryPublicAPI).not.toContain('preloadExtension');
      expect(registryPublicAPI).not.toContain('mountExtension');
      expect(registryPublicAPI).not.toContain('unmountExtension');

      // Should have domain and property management methods
      expect(registryPublicAPI).toContain('registerDomain');
      expect(registryPublicAPI).toContain('updateSharedProperty');
      expect(registryPublicAPI).toContain('getDomainProperty');
      expect(registryPublicAPI).toContain('executeActionsChain');
      expect(registryPublicAPI).toContain('dispose');

      // Old per-domain write methods must no longer exist
      expect(registryPublicAPI).not.toContain('updateDomainProperty');
      expect(registryPublicAPI).not.toContain('updateDomainProperties');
    });
  });
});
