/**
 * Tests for domain registration with lifecycle validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultMfeRegistry } from '../../../src/mfe/runtime/DefaultMfeRegistry';
import { GtsPlugin } from '../../../src/mfe/plugins/gts';
import type { ExtensionDomain } from '../../../src/mfe/types';
import { DomainValidationError } from '../../../src/mfe/errors';
import { HAI3_ACTION_LOAD_EXT, HAI3_ACTION_MOUNT_EXT } from '../../../src/mfe/constants';
import { MockDomainFactory } from '../../../__test-utils__';

/**
 * Deliberately invalid {@link ExtensionDomain} shape for negative tests.
 * Required fields are omitted on purpose; the cast is confined to this helper.
 */
function invalidExtensionDomainFixtureForValidation(): ExtensionDomain {
  return {
    id: 'gts.hai3.mfes.ext.domain.v1~test.corp.layout.invalid.v1',
    sharedProperties: [],
  } as unknown as ExtensionDomain;
}

describe('Domain Registration', () => {
  const plugin = new GtsPlugin();
  let registry: DefaultMfeRegistry;
  let mockContainerProvider: MockDomainFactory;

  beforeEach(() => {
    registry = new DefaultMfeRegistry({
      typeSystem: plugin,
    });
    mockContainerProvider = new MockDomainFactory();
    mockContainerProvider.setRegistry(registry);
  });

  describe('registerDomain with GTS validation', () => {
    it('should successfully register a valid domain', () => {
      const domain: ExtensionDomain = {
        id: 'gts.hai3.mfes.ext.domain.v1~test.corp.layout.domain.v1',
        sharedProperties: [],
        actions: [HAI3_ACTION_LOAD_EXT, HAI3_ACTION_MOUNT_EXT],
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

      expect(() => {
        registry.registerDomain(domain, mockContainerProvider.prepareForDomain(domain));
      }).not.toThrow();

      // Verify domain is registered
      const domainState = registry.getDomainState(domain.id);
      expect(domainState).toBeDefined();
      expect(domainState?.domain.id).toBe(domain.id);
    });

    it('should validate lifecycle stages are declared in lifecycleStages array', () => {
      // This test ensures domains declare their supported lifecycle stages
      const domain: ExtensionDomain = {
        id: 'gts.hai3.mfes.ext.domain.v1~test.corp.layout.domain_lifecycle.v1',
        sharedProperties: [],
        actions: [HAI3_ACTION_LOAD_EXT, HAI3_ACTION_MOUNT_EXT],
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

      expect(() => {
        registry.registerDomain(domain, mockContainerProvider.prepareForDomain(domain));
      }).not.toThrow();

      const domainState = registry.getDomainState(domain.id);
      expect(domainState?.domain.lifecycleStages).toHaveLength(2);
      expect(domainState?.domain.extensionsLifecycleStages).toHaveLength(4);
    });

    it('should throw DomainValidationError for invalid domain schema', () => {
      const invalidDomain = invalidExtensionDomainFixtureForValidation();

      expect(() => {
        registry.registerDomain(invalidDomain, mockContainerProvider.prepareForDomain(invalidDomain));
      }).toThrow(DomainValidationError);
    });

    it('should validate lifecycle hooks reference supported stages', () => {
      // Phase 10 validates that hooks reference supported stages
      // Full test for UnsupportedLifecycleStageError will be in Phase 19 with actual hooks
      const domain: ExtensionDomain = {
        id: 'gts.hai3.mfes.ext.domain.v1~test.corp.layout.custom_stages.v1',
        sharedProperties: [],
        actions: [HAI3_ACTION_LOAD_EXT, HAI3_ACTION_MOUNT_EXT],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        // Custom lifecycle stages for domain
        lifecycleStages: [
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.init.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.destroyed.v1',
        ],
        // Different stages for extensions
        extensionsLifecycleStages: [
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.init.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.activated.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.deactivated.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.destroyed.v1',
        ],
      };

      expect(() => {
        registry.registerDomain(domain, mockContainerProvider.prepareForDomain(domain));
      }).not.toThrow();
    });
  });

  describe('Base Layout Domain Registration', () => {
    it('should successfully register sidebar domain', () => {
      const sidebarDomain: ExtensionDomain = {
        id: 'gts.hai3.mfes.ext.domain.v1~hai3.screensets.layout.sidebar.v1',
        sharedProperties: [],
        actions: [
          'gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.load_ext.v1~',
          'gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.mount_ext.v1~',
          'gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.unmount_ext.v1~',
        ],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: [
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.init.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.activated.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.deactivated.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.destroyed.v1',
        ],
        extensionsLifecycleStages: [
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.init.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.activated.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.deactivated.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.destroyed.v1',
        ],
      };

      expect(() => {
        registry.registerDomain(sidebarDomain, mockContainerProvider.prepareForDomain(sidebarDomain));
      }).not.toThrow();

      const domainState = registry.getDomainState(sidebarDomain.id);
      expect(domainState).toBeDefined();
      expect(domainState?.domain.actions).toContain('gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.load_ext.v1~');
      expect(domainState?.domain.actions).toContain('gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.unmount_ext.v1~');
    });

    it('should successfully register screen domain (load_ext only)', () => {
      const screenDomain: ExtensionDomain = {
        id: 'gts.hai3.mfes.ext.domain.v1~hai3.screensets.layout.screen.v1',
        sharedProperties: [],
        actions: [
          'gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.load_ext.v1~',
          'gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.mount_ext.v1~',
          // Note: NO unmount_ext for screen domain (swap semantics)
        ],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: [
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.init.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.activated.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.deactivated.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.destroyed.v1',
        ],
        extensionsLifecycleStages: [
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.init.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.activated.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.deactivated.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.destroyed.v1',
        ],
      };

      expect(() => {
        registry.registerDomain(screenDomain, mockContainerProvider.prepareForDomain(screenDomain));
      }).not.toThrow();

      const domainState = registry.getDomainState(screenDomain.id);
      expect(domainState).toBeDefined();
      expect(domainState?.domain.actions).toContain('gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.load_ext.v1~');
      expect(domainState?.domain.actions).not.toContain('gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.unmount_ext.v1~');
    });

    it('should successfully register popup domain', () => {
      const popupDomain: ExtensionDomain = {
        id: 'gts.hai3.mfes.ext.domain.v1~hai3.screensets.layout.popup.v1',
        sharedProperties: [],
        actions: [
          'gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.load_ext.v1~',
          'gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.mount_ext.v1~',
          'gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.unmount_ext.v1~',
        ],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: [
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.init.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.activated.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.deactivated.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.destroyed.v1',
        ],
        extensionsLifecycleStages: [
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.init.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.activated.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.deactivated.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.destroyed.v1',
        ],
      };

      expect(() => {
        registry.registerDomain(popupDomain, mockContainerProvider.prepareForDomain(popupDomain));
      }).not.toThrow();
    });

    it('should successfully register overlay domain', () => {
      const overlayDomain: ExtensionDomain = {
        id: 'gts.hai3.mfes.ext.domain.v1~hai3.screensets.layout.overlay.v1',
        sharedProperties: [],
        actions: [
          'gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.load_ext.v1~',
          'gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.mount_ext.v1~',
          'gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.unmount_ext.v1~',
        ],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: [
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.init.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.activated.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.deactivated.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.destroyed.v1',
        ],
        extensionsLifecycleStages: [
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.init.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.activated.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.deactivated.v1',
          'gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.destroyed.v1',
        ],
      };

      expect(() => {
        registry.registerDomain(overlayDomain, mockContainerProvider.prepareForDomain(overlayDomain));
      }).not.toThrow();
    });
  });
});
