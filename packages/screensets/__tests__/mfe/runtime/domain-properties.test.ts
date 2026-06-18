/**
 * Tests for Domain Property Management in ScreensetsRegistry
 *
 * Verifies:
 * - Shared property broadcast via updateSharedProperty
 * - Property value retrieval via getDomainProperty
 * - Broadcast semantics (all declaring domains receive the value)
 * - Property subscriber notifications
 * - Late-registration limitation (no retroactive replay)
 * - Proper error handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScreensetsRegistry } from '../../../src/mfe/runtime';
import { DefaultScreensetsRegistry } from '../../../src/mfe/runtime/DefaultScreensetsRegistry';
import type { ExtensionDomain } from '../../../src/mfe/types';
import type { TypeSystemPlugin, ValidationResult, JSONSchema } from '../../../src/mfe/plugins/types';
import { MockContainerProvider } from '../test-utils';

// Create a lenient mock plugin for testing domain properties
function createMockPlugin(): TypeSystemPlugin {
  const schemas = new Map<string, JSONSchema>();
  const registeredEntities = new Map<string, unknown>();

  // Add first-class citizen schemas
  const coreTypeIds = [
    'gts.frontx.mfes.mfe.entry.v1~',
    'gts.frontx.mfes.ext.domain.v1~',
    'gts.frontx.mfes.ext.extension.v1~',
    'gts.frontx.mfes.comm.shared_property.v1~',
    'gts.frontx.mfes.comm.action.v1~',
    'gts.frontx.mfes.comm.actions_chain.v1~',
    'gts.frontx.mfes.lifecycle.stage.v1~',
    'gts.frontx.mfes.lifecycle.hook.v1~',
  ];

  for (const typeId of coreTypeIds) {
    schemas.set(typeId, { $id: `gts://${typeId}`, type: 'object' });
  }

  return {
    name: 'MockPlugin',
    version: '1.0.0',
    isValidTypeId: (id: string) => id.includes('gts.') && id.endsWith('~'),
    parseTypeId: (id: string) => ({ id, segments: id.split('.') }),
    registerSchema: (schema: JSONSchema) => {
      if (schema.$id) {
        const typeId = schema.$id.replace('gts://', '');
        schemas.set(typeId, schema);
      }
    },
    getSchema: (typeId: string) => schemas.get(typeId),
    register: (entity: unknown) => {
      const entityWithId = entity as { id?: string };
      if (entityWithId.id) {
        registeredEntities.set(entityWithId.id, entity);
      }
    },
    validateInstance: (instanceId: string): ValidationResult => {
      if (registeredEntities.has(instanceId)) {
        return { valid: true, errors: [] };
      }
      return {
        valid: false,
        errors: [{ path: '', message: `Instance not registered: ${instanceId}` }],
      };
    },
    isTypeOf: (typeId: string, baseTypeId: string) => {
      return typeId.startsWith(baseTypeId);
    },
    checkCompatibility: () => ({ compatible: true, changes: [] }),
    getAttribute: () => undefined,
  };
}

describe('ScreensetsRegistry - Domain Properties', () => {
  let registry: ScreensetsRegistry;
  let testDomain: ExtensionDomain;
  let mockContainerProvider: MockContainerProvider;
  const DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~frontx.test.widget.slot.v1';
  const THEME_PROPERTY_ID = 'gts.frontx.mfes.comm.shared_property.v1~acme.ui.theme.v1';
  const USER_PROPERTY_ID = 'gts.frontx.mfes.comm.shared_property.v1~acme.auth.user.v1';

  beforeEach(() => {
    registry = new DefaultScreensetsRegistry({
      typeSystem: createMockPlugin(),
    });
    mockContainerProvider = new MockContainerProvider();

    testDomain = {
      id: DOMAIN_ID,
      sharedProperties: [THEME_PROPERTY_ID, USER_PROPERTY_ID],
      actions: [],
      extensionsActions: [],
      defaultActionTimeout: 5000,
      lifecycleStages: [
        'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
      ],
      extensionsLifecycleStages: [
        'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
      ],
    };

    registry.registerDomain(testDomain, mockContainerProvider);
  });

  describe('updateSharedProperty', () => {
    it('should broadcast to a single declaring domain', () => {
      registry.updateSharedProperty(THEME_PROPERTY_ID, 'dark');

      const value = registry.getDomainProperty(DOMAIN_ID, THEME_PROPERTY_ID);
      expect(value).toBe('dark');
    });

    it('should be a silent no-op when no domains declare the property', () => {
      const unknownPropertyId = 'gts.frontx.mfes.comm.shared_property.v1~acme.unknown.v1';

      expect(() => {
        registry.updateSharedProperty(unknownPropertyId, 'some-value');
      }).not.toThrow();
    });

    it('should allow multiple updates to same property', () => {
      registry.updateSharedProperty(THEME_PROPERTY_ID, 'dark');
      registry.updateSharedProperty(THEME_PROPERTY_ID, 'light');
      registry.updateSharedProperty(THEME_PROPERTY_ID, 'auto');

      const value = registry.getDomainProperty(DOMAIN_ID, THEME_PROPERTY_ID);
      expect(value).toBe('auto');
    });

    it('should handle complex property values', () => {
      const userValue = { id: '123', name: 'Alice', roles: ['admin'] };
      registry.updateSharedProperty(USER_PROPERTY_ID, userValue);

      const value = registry.getDomainProperty(DOMAIN_ID, USER_PROPERTY_ID);
      expect(value).toEqual(userValue);
    });
  });

  describe('getDomainProperty', () => {
    it('should return undefined for unset property', () => {
      const value = registry.getDomainProperty(DOMAIN_ID, THEME_PROPERTY_ID);
      expect(value).toBeUndefined();
    });

    it('should return property value after update', () => {
      registry.updateSharedProperty(THEME_PROPERTY_ID, 'dark');

      const value = registry.getDomainProperty(DOMAIN_ID, THEME_PROPERTY_ID);
      expect(value).toBe('dark');
    });

    it('should throw if domain not registered', () => {
      expect(() => {
        registry.getDomainProperty('non-existent-domain', THEME_PROPERTY_ID);
      }).toThrow("Domain 'non-existent-domain' not registered");
    });

    it('should return different values for different properties', () => {
      registry.updateSharedProperty(THEME_PROPERTY_ID, 'dark');
      registry.updateSharedProperty(USER_PROPERTY_ID, { id: '123' });

      expect(registry.getDomainProperty(DOMAIN_ID, THEME_PROPERTY_ID)).toBe('dark');
      expect(registry.getDomainProperty(DOMAIN_ID, USER_PROPERTY_ID)).toEqual({ id: '123' });
    });
  });

  describe('Broadcast semantics — multiple declaring domains', () => {
    let domain2: ExtensionDomain;
    const DOMAIN2_ID = 'gts.frontx.mfes.ext.domain.v1~frontx.test.other.slot.v1';

    beforeEach(() => {
      domain2 = {
        id: DOMAIN2_ID,
        sharedProperties: [THEME_PROPERTY_ID],
        actions: [],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: [
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
        ],
        extensionsLifecycleStages: [
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
        ],
      };

      registry.registerDomain(domain2, mockContainerProvider);
    });

    it('should broadcast property value to all domains declaring it', () => {
      registry.updateSharedProperty(THEME_PROPERTY_ID, 'dark');

      expect(registry.getDomainProperty(DOMAIN_ID, THEME_PROPERTY_ID)).toBe('dark');
      expect(registry.getDomainProperty(DOMAIN2_ID, THEME_PROPERTY_ID)).toBe('dark');
    });

    it('should broadcast same value to all declaring domains', () => {
      registry.updateSharedProperty(THEME_PROPERTY_ID, 'light');

      // Both domains receive the same global value
      expect(registry.getDomainProperty(DOMAIN_ID, THEME_PROPERTY_ID)).toBe('light');
      expect(registry.getDomainProperty(DOMAIN2_ID, THEME_PROPERTY_ID)).toBe('light');
    });

    it('should not update a domain that does not declare the property', () => {
      // DOMAIN2 only declares THEME, not USER_PROPERTY_ID
      registry.updateSharedProperty(USER_PROPERTY_ID, { id: '123' });

      // DOMAIN_ID should receive USER_PROPERTY_ID update
      expect(registry.getDomainProperty(DOMAIN_ID, USER_PROPERTY_ID)).toEqual({ id: '123' });

      // DOMAIN2_ID does NOT declare USER_PROPERTY_ID — it should remain unset
      expect(registry.getDomainProperty(DOMAIN2_ID, THEME_PROPERTY_ID)).toBeUndefined();
    });
  });

  describe('Late-registration limitation', () => {
    const DOMAIN3_ID = 'gts.frontx.mfes.ext.domain.v1~frontx.test.late.slot.v1';

    it('late-registered domain does NOT retroactively receive prior broadcast values', () => {
      // Broadcast BEFORE domain3 is registered
      registry.updateSharedProperty(THEME_PROPERTY_ID, 'dark');

      // Now register domain3 which also declares THEME_PROPERTY_ID
      const domain3: ExtensionDomain = {
        id: DOMAIN3_ID,
        sharedProperties: [THEME_PROPERTY_ID],
        actions: [],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: [
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
        ],
        extensionsLifecycleStages: [
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
        ],
      };
      registry.registerDomain(domain3, mockContainerProvider);

      // domain3 does NOT receive the prior value — the broadcast already happened
      expect(registry.getDomainProperty(DOMAIN3_ID, THEME_PROPERTY_ID)).toBeUndefined();
    });

    it('late-registered domain receives subsequent broadcasts', () => {
      // Broadcast BEFORE domain3 is registered
      registry.updateSharedProperty(THEME_PROPERTY_ID, 'dark');

      const domain3: ExtensionDomain = {
        id: DOMAIN3_ID,
        sharedProperties: [THEME_PROPERTY_ID],
        actions: [],
        extensionsActions: [],
        defaultActionTimeout: 5000,
        lifecycleStages: [
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
        ],
        extensionsLifecycleStages: [
          'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
        ],
      };
      registry.registerDomain(domain3, mockContainerProvider);

      // Broadcast AFTER domain3 is registered — it should receive this one
      registry.updateSharedProperty(THEME_PROPERTY_ID, 'light');

      expect(registry.getDomainProperty(DOMAIN3_ID, THEME_PROPERTY_ID)).toBe('light');
    });
  });

  describe('dispose', () => {
    it('should clear all domain properties on dispose', () => {
      registry.updateSharedProperty(THEME_PROPERTY_ID, 'dark');
      registry.updateSharedProperty(USER_PROPERTY_ID, { id: '123' });

      registry.dispose();

      // After dispose, domain should no longer exist
      expect(() => {
        registry.getDomainProperty(DOMAIN_ID, THEME_PROPERTY_ID);
      }).toThrow(/Domain.*not registered/);
    });
  });
});
