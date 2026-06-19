/**
 * Extension Type Validation Tests
 *
 * Tests for validateExtensionType() function which validates that extensions
 * use derived types when domains specify extensionsTypeId.
 */

import { describe, it, expect } from 'vitest';
import type { TypeSystemPlugin } from '../../../src/mfe/plugins/types';
import { validateExtensionType } from '../../../src/mfe/validation/extension-type';
import type { Extension } from '../../../src/mfe/types/extension';
import type { ExtensionDomain } from '../../../src/mfe/types/extension-domain';

/**
 * Mock plugin that simulates GTS type hierarchy behavior
 */
function createMockPlugin(
  typeHierarchy: Record<string, string[]> = {},
  validationErrors: Record<string, { valid: boolean; errors: Array<{ path: string; message: string; keyword: string }> }> = {}
): TypeSystemPlugin {
  // Store registered entities for validation
  const registeredEntities = new Map<string, unknown>();

  return {
    name: 'mock',
    version: '1.0.0',

    isValidTypeId: () => true,
    parseTypeId: (id: string) => ({ id }),
    registerSchema: () => {},
    getSchema: () => undefined,
    query: () => [],

    // GTS-native register method
    register: (entity: unknown) => {
      const entityWithId = entity as { id?: string };
      if (entityWithId.id) {
        registeredEntities.set(entityWithId.id, entity);
      }
    },

    // GTS-native validateInstance by ID only
    validateInstance: (instanceId: string) => {
      // Return custom validation errors if configured
      if (validationErrors[instanceId]) {
        return validationErrors[instanceId];
      }
      // Default: return valid if entity is registered
      if (registeredEntities.has(instanceId)) {
        return { valid: true, errors: [] };
      }
      return {
        valid: false,
        errors: [
          {
            path: '',
            message: `Instance not registered: ${instanceId}`,
            keyword: 'not-registered',
          },
        ],
      };
    },

    // Mock isTypeOf to check if typeId starts with baseTypeId (GTS derivation pattern)
    isTypeOf: (typeId: string, baseTypeId: string) => {
      // Support explicit hierarchy map for test control
      if (typeHierarchy[typeId]) {
        return typeHierarchy[typeId].includes(baseTypeId);
      }
      // Default GTS behavior: derived types include base type as prefix
      return typeId.startsWith(baseTypeId) || typeId === baseTypeId;
    },

    checkCompatibility: () => ({ compatible: true, breaking: false, changes: [] }),
    getAttribute: () => ({
      typeId: '',
      path: '',
      resolved: false,
    }),
  };
}

describe('validateExtensionType', () => {
  // Schema/Type IDs (end with ~) - used for extensionsTypeId references
  const DERIVED_WIDGET_EXTENSION_TYPE =
    'gts.frontx.screensets.ext.extension.v1~acme.dashboard.ext.widget_extension.v1~';

  // Instance IDs (do NOT end with ~)
  const WIDGET_EXTENSION_INSTANCE =
    'gts.frontx.screensets.ext.extension.v1~acme.dashboard.ext.widget_extension.v1~acme.analytics.v1';
  const DOMAIN_ID = 'gts.frontx.screensets.ext.domain.v1~acme.dashboard.layout.widget_slot.v1';
  const ENTRY_ID =
    'gts.frontx.screensets.mfe.entry.v1~frontx.screensets.mfe.entry_mf.v1~acme.analytics.mfe.chart.v1';
  const BASE_EXTENSION_INSTANCE = 'gts.frontx.screensets.ext.extension.v1~acme.generic.extension.v1';

  describe('successful validation scenarios', () => {
    it('should pass when domain does not specify extensionsTypeId', () => {
      const plugin = createMockPlugin();

      const domain: ExtensionDomain = {
        id: DOMAIN_ID,
        sharedProperties: [],
        actions: [],
        extensionsActions: [],
        // No extensionsTypeId specified
        defaultActionTimeout: 30000,
        lifecycleStages: [],
        extensionsLifecycleStages: [],
      };

      const extension: Extension = {
        id: BASE_EXTENSION_INSTANCE, // Using base type instance is fine when domain doesn't require specific type
        domain: DOMAIN_ID,
        entry: ENTRY_ID,
      };

      const result = validateExtensionType(plugin, domain, extension);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass when extension type derives from domain extensionsTypeId', () => {
      const plugin = createMockPlugin();

      const domain: ExtensionDomain = {
        id: DOMAIN_ID,
        sharedProperties: [],
        actions: [],
        extensionsActions: [],
        extensionsTypeId: DERIVED_WIDGET_EXTENSION_TYPE,
        defaultActionTimeout: 30000,
        lifecycleStages: [],
        extensionsLifecycleStages: [],
      };

      const extension: Extension = {
        id: WIDGET_EXTENSION_INSTANCE, // Derives from DERIVED_WIDGET_EXTENSION_TYPE
        domain: DOMAIN_ID,
        entry: ENTRY_ID,
      };

      const result = validateExtensionType(plugin, domain, extension);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass when extension type exactly matches domain extensionsTypeId', () => {
      const plugin = createMockPlugin();

      const domain: ExtensionDomain = {
        id: DOMAIN_ID,
        sharedProperties: [],
        actions: [],
        extensionsActions: [],
        extensionsTypeId: DERIVED_WIDGET_EXTENSION_TYPE,
        defaultActionTimeout: 30000,
        lifecycleStages: [],
        extensionsLifecycleStages: [],
      };

      const extension: Extension = {
        id: WIDGET_EXTENSION_INSTANCE, // Instance of exact required type (DERIVED_WIDGET_EXTENSION_TYPE)
        domain: DOMAIN_ID,
        entry: ENTRY_ID,
      };

      const result = validateExtensionType(plugin, domain, extension);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('type hierarchy failure scenarios', () => {
    it('should fail when extension type does not derive from domain extensionsTypeId', () => {
      const plugin = createMockPlugin();

      // Instance ID for an extension that derives from an unrelated type (not widget_extension)
      const UNRELATED_EXTENSION_INSTANCE =
        'gts.frontx.screensets.ext.extension.v1~acme.other.ext.unrelated.v1~acme.other.instance.v1';

      const domain: ExtensionDomain = {
        id: DOMAIN_ID,
        sharedProperties: [],
        actions: [],
        extensionsActions: [],
        extensionsTypeId: DERIVED_WIDGET_EXTENSION_TYPE,
        defaultActionTimeout: 30000,
        lifecycleStages: [],
        extensionsLifecycleStages: [],
      };

      const extension: Extension = {
        id: UNRELATED_EXTENSION_INSTANCE, // Does not derive from DERIVED_WIDGET_EXTENSION_TYPE
        domain: DOMAIN_ID,
        entry: ENTRY_ID,
      };

      const result = validateExtensionType(plugin, domain, extension);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        path: 'id',
        keyword: 'x-gts-ref',
      });
      expect(result.errors[0].message).toContain('must derive from');
      expect(result.errors[0].message).toContain(DERIVED_WIDGET_EXTENSION_TYPE);
    });

    it('should fail when extension uses base Extension type but domain requires derived type', () => {
      const plugin = createMockPlugin();

      const domain: ExtensionDomain = {
        id: DOMAIN_ID,
        sharedProperties: [],
        actions: [],
        extensionsActions: [],
        extensionsTypeId: DERIVED_WIDGET_EXTENSION_TYPE,
        defaultActionTimeout: 30000,
        lifecycleStages: [],
        extensionsLifecycleStages: [],
      };

      const extension: Extension = {
        id: BASE_EXTENSION_INSTANCE, // Instance of base type, but domain requires derived type
        domain: DOMAIN_ID,
        entry: ENTRY_ID,
      };

      const result = validateExtensionType(plugin, domain, extension);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        path: 'id',
        keyword: 'x-gts-ref',
      });
    });
  });

  describe('error handling', () => {
    it('should handle case where derived Extension type is not registered', () => {
      // Plugin that throws "not found" error
      const plugin = createMockPlugin();
      plugin.isTypeOf = () => {
        throw new Error('Type not found in registry');
      };

      const domain: ExtensionDomain = {
        id: DOMAIN_ID,
        sharedProperties: [],
        actions: [],
        extensionsActions: [],
        extensionsTypeId: DERIVED_WIDGET_EXTENSION_TYPE,
        defaultActionTimeout: 30000,
        lifecycleStages: [],
        extensionsLifecycleStages: [],
      };

      const extension: Extension = {
        id: WIDGET_EXTENSION_INSTANCE,
        domain: DOMAIN_ID,
        entry: ENTRY_ID,
      };

      const result = validateExtensionType(plugin, domain, extension);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        path: 'id',
        keyword: 'type-not-found',
      });
      expect(result.errors[0].message).toContain('may not be registered');
    });

    it('should handle generic validation errors', () => {
      // Plugin that throws generic error
      const plugin = createMockPlugin();
      plugin.isTypeOf = () => {
        throw new Error('Something went wrong');
      };

      const domain: ExtensionDomain = {
        id: DOMAIN_ID,
        sharedProperties: [],
        actions: [],
        extensionsActions: [],
        extensionsTypeId: DERIVED_WIDGET_EXTENSION_TYPE,
        defaultActionTimeout: 30000,
        lifecycleStages: [],
        extensionsLifecycleStages: [],
      };

      const extension: Extension = {
        id: WIDGET_EXTENSION_INSTANCE,
        domain: DOMAIN_ID,
        entry: ENTRY_ID,
      };

      const result = validateExtensionType(plugin, domain, extension);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        path: 'id',
        keyword: 'validation-error',
      });
      expect(result.errors[0].message).toContain('Something went wrong');
    });
  });

  describe('domain-specific fields validation', () => {
    it('validates all fields via GTS-native validateInstance', () => {
      // This test documents that validateExtensionType() uses GTS-native validation:
      // 1. plugin.register(extension) - registers the instance
      // 2. plugin.validateInstance(extension.id) - validates by ID (includes all fields)
      // 3. plugin.isTypeOf() - checks type hierarchy if domain requires it
      //
      // Domain-specific fields (title, icon, size, etc.) are validated natively by GTS
      // when plugin.validateInstance(extension.id) is called.

      const plugin = createMockPlugin();

      const domain: ExtensionDomain = {
        id: DOMAIN_ID,
        sharedProperties: [],
        actions: [],
        extensionsActions: [],
        extensionsTypeId: DERIVED_WIDGET_EXTENSION_TYPE,
        defaultActionTimeout: 30000,
        lifecycleStages: [],
        extensionsLifecycleStages: [],
      };

      // Extension with domain-specific fields (defined in derived schema)
      const extension: Extension = {
        id: WIDGET_EXTENSION_INSTANCE,
        domain: DOMAIN_ID,
        entry: ENTRY_ID,
        // Domain-specific fields would be here (validated by GTS-native validateInstance):
        // title: 'Analytics Dashboard',
        // icon: 'chart-line',
        // size: 'large',
      };

      // validateExtensionType uses GTS-native validation:
      // 1. Registers extension
      // 2. Validates by ID (all fields including domain-specific)
      // 3. Checks type hierarchy
      const result = validateExtensionType(plugin, domain, extension);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns validation errors from GTS-native validateInstance', () => {
      // Test that field validation errors from gts-ts are properly returned

      const plugin = createMockPlugin(
        {},
        {
          [WIDGET_EXTENSION_INSTANCE]: {
            valid: false,
            errors: [
              {
                path: 'title',
                message: 'title is required',
                keyword: 'required',
              },
            ],
          },
        }
      );

      const domain: ExtensionDomain = {
        id: DOMAIN_ID,
        sharedProperties: [],
        actions: [],
        extensionsActions: [],
        extensionsTypeId: DERIVED_WIDGET_EXTENSION_TYPE,
        defaultActionTimeout: 30000,
        lifecycleStages: [],
        extensionsLifecycleStages: [],
      };

      const extension: Extension = {
        id: WIDGET_EXTENSION_INSTANCE,
        domain: DOMAIN_ID,
        entry: ENTRY_ID,
        // Missing required 'title' field
      };

      const result = validateExtensionType(plugin, domain, extension);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        path: 'title',
        keyword: 'required',
      });
      expect(result.errors[0].message).toContain('title is required');
    });
  });
});
