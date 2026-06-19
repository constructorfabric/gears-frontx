/**
 * Tests for domain registration with lifecycle validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultScreensetsRegistry } from '../../../src/mfe/runtime/DefaultScreensetsRegistry';
import { GtsPlugin } from '../../../src/mfe/plugins/gts';
import type { ExtensionDomain } from '../../../src/mfe/types';
import { DomainValidationError } from '../../../src/mfe/errors';
import { MockContainerProvider } from '../test-utils';

describe('Domain Registration', () => {
  const plugin = new GtsPlugin();
  let registry: DefaultScreensetsRegistry;
  let mockContainerProvider: MockContainerProvider;

  beforeEach(() => {
    registry = new DefaultScreensetsRegistry({
      typeSystem: plugin,
    });
    mockContainerProvider = new MockContainerProvider();
  });

  describe('registerDomain with GTS validation', () => {
    it('should successfully register a valid domain', () => {
      const domain: ExtensionDomain = {
        id: 'gts.frontx.mfes.ext.domain.v1~test.corp.layout.domain.v1',
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

      expect(() => {
        registry.registerDomain(domain, mockContainerProvider);
      }).not.toThrow();

      // Verify domain is registered
      const domainState = registry.getDomainState(domain.id);
      expect(domainState).toBeDefined();
      expect(domainState?.domain.id).toBe(domain.id);
    });

    it('should validate lifecycle stages are declared in lifecycleStages array', () => {
      // This test ensures domains declare their supported lifecycle stages
      const domain: ExtensionDomain = {
        id: 'gts.frontx.mfes.ext.domain.v1~test.corp.layout.domain_lifecycle.v1',
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

      expect(() => {
        registry.registerDomain(domain, mockContainerProvider);
      }).not.toThrow();

      const domainState = registry.getDomainState(domain.id);
      expect(domainState?.domain.lifecycleStages).toHaveLength(2);
      expect(domainState?.domain.extensionsLifecycleStages).toHaveLength(4);
    });

    it('should throw DomainValidationError for invalid domain schema', () => {
      const invalidDomain = {
        id: 'gts.frontx.mfes.ext.domain.v1~test.corp.layout.invalid.v1',
        // Missing required fields
        sharedProperties: [],
      } as unknown as ExtensionDomain;

      expect(() => {
        registry.registerDomain(invalidDomain, mockContainerProvider);
      }).toThrow(DomainValidationError);
    });

    it('should validate lifecycle hooks reference supported stages', () => {
      // Phase 10 validates that hooks reference supported stages
      // Full test for UnsupportedLifecycleStageError will be in Phase 19 with actual hooks
      const domain: ExtensionDomain = {
        id: 'gts.frontx.mfes.ext.domain.v1~test.corp.layout.custom_stages.v1',
        sharedProperties: [],
        actions: [],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        // Custom lifecycle stages for domain
        lifecycleStages: [
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
        ],
        // Different stages for extensions
        extensionsLifecycleStages: [
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
        ],
      };

      expect(() => {
        registry.registerDomain(domain, mockContainerProvider);
      }).not.toThrow();
    });
  });

  describe('Base Layout Domain Registration', () => {
    it('should successfully register sidebar domain', () => {
      const sidebarDomain: ExtensionDomain = {
        id: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.sidebar.v1',
        sharedProperties: [],
        actions: [
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1',
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1',
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1',
        ],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: [
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
        ],
        extensionsLifecycleStages: [
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
        ],
      };

      expect(() => {
        registry.registerDomain(sidebarDomain, mockContainerProvider);
      }).not.toThrow();

      const domainState = registry.getDomainState(sidebarDomain.id);
      expect(domainState).toBeDefined();
      expect(domainState?.domain.actions).toContain('gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1');
      expect(domainState?.domain.actions).toContain('gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1');
    });

    it('should successfully register screen domain (load_ext only)', () => {
      const screenDomain: ExtensionDomain = {
        id: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1',
        sharedProperties: [],
        actions: [
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1',
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1',
          // Note: NO unmount_ext for screen domain (swap semantics)
        ],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: [
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
        ],
        extensionsLifecycleStages: [
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
        ],
      };

      expect(() => {
        registry.registerDomain(screenDomain, mockContainerProvider);
      }).not.toThrow();

      const domainState = registry.getDomainState(screenDomain.id);
      expect(domainState).toBeDefined();
      expect(domainState?.domain.actions).toContain('gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1');
      expect(domainState?.domain.actions).not.toContain('gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1');
    });

    it('should successfully register popup domain', () => {
      const popupDomain: ExtensionDomain = {
        id: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.popup.v1',
        sharedProperties: [],
        actions: [
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1',
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1',
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1',
        ],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: [
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
        ],
        extensionsLifecycleStages: [
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
        ],
      };

      expect(() => {
        registry.registerDomain(popupDomain, mockContainerProvider);
      }).not.toThrow();
    });

    it('should successfully register overlay domain', () => {
      const overlayDomain: ExtensionDomain = {
        id: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.overlay.v1',
        sharedProperties: [],
        actions: [
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1',
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1',
          'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1',
        ],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: [
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
        ],
        extensionsLifecycleStages: [
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1',
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
        ],
      };

      expect(() => {
        registry.registerDomain(overlayDomain, mockContainerProvider);
      }).not.toThrow();
    });
  });
});
