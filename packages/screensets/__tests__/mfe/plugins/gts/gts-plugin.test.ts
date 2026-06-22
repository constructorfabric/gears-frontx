/**
 * GTS Plugin Tests
 *
 * Tests for the GTS Type System Plugin implementation.
 * These tests verify the TypeSystemPlugin interface implementation
 * using only the core schemas that ship with @gears-frontx/screensets.
 *
 * NOTE: Tests for application-layer derived schemas (theme, language,
 * extension_screen) live in @gears-frontx/framework because those schemas are
 * registered at the application layer, not here at L1.
 *
 * NOTE: Named-instance runtime validation mechanics (register() call shape,
 * ephemeral ID pattern) are tested in property-validation.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { gtsPlugin, GtsPlugin } from '../../../../src/mfe/plugins/gts/index';
import { FRONTX_CORE_TYPE_IDS } from '../../../../src/mfe/init';

describe('GTS Plugin', () => {
  describe('schema registration and validation', () => {
    const plugin = new GtsPlugin();

    it('has all core schemas registered', () => {
      const schema = plugin.getSchema(FRONTX_CORE_TYPE_IDS.mfeEntry);
      expect(schema).toBeDefined();
      expect(schema?.$id).toBe('gts://gts.frontx.mfes.mfe.entry.v1~');
    });

    it('register() accepts a valid instance without throwing', () => {
      // register() validates automatically: a valid instance returns normally.
      const instance = {
        id: 'gts.frontx.mfes.mfe.entry.v1~test.app.mfe.test_entry.v1',
        requiredProperties: [],
        actions: [],
        domainActions: [],
      };
      expect(() => plugin.register(instance)).not.toThrow();
    });

    it('register() throws for invalid instance (missing required field) with rich diagnostics', () => {
      // register() validates automatically: an invalid instance throws an
      // Error whose message carries the instance JSON, schema JSON, and reason.
      const instance = {
        id: 'gts.frontx.mfes.mfe.entry.v1~test.app.mfe.invalid_entry.v1',
        requiredProperties: [],
        // Missing: actions, domainActions
      };
      expect(() => plugin.register(instance)).toThrow(/GTS validation failed/);
      expect(() => plugin.register(instance)).toThrow(/Reason:/);
      expect(() => plugin.register(instance)).toThrow(/Instance:/);
      expect(() => plugin.register(instance)).toThrow(/Schema:/);
      expect(() => plugin.register(instance)).toThrow(
        /gts\.frontx\.mfes\.mfe\.entry\.v1~test\.app\.mfe\.invalid_entry\.v1/
      );
    });

    it('registers vendor schema', () => {
      const vendorSchema = {
        $id: 'gts://gts.acme.analytics.ext.action.v1~',
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          type: { type: 'string' },
          target: { type: 'string' },
          payload: { type: 'object' },
        },
        required: ['type', 'target'],
      };

      plugin.registerSchema(vendorSchema);
      const retrieved = plugin.getSchema('gts.acme.analytics.ext.action.v1~');
      expect(retrieved).toBeDefined();
      expect(retrieved?.$id).toBe('gts://gts.acme.analytics.ext.action.v1~');
    });
  });

  describe('gtsPlugin singleton', () => {
    it('exports singleton instance', () => {
      expect(gtsPlugin).toBeDefined();
      expect(gtsPlugin.name).toBe('gts');
      expect(gtsPlugin.version).toBe('1.0.0');
    });

    it('singleton has all schemas registered', () => {
      const schema = gtsPlugin.getSchema(FRONTX_CORE_TYPE_IDS.mfeEntry);
      expect(schema).toBeDefined();
    });
  });

  describe('isTypeOf - type hierarchy checking', () => {
    const plugin = new GtsPlugin();

    it('same type returns true', () => {
      const result = plugin.isTypeOf(
        'gts.frontx.mfes.mfe.entry.v1~',
        'gts.frontx.mfes.mfe.entry.v1~'
      );
      expect(result).toBe(true);
    });

    it('derived type returns true for base type', () => {
      const result = plugin.isTypeOf(
        'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~',
        'gts.frontx.mfes.mfe.entry.v1~'
      );
      expect(result).toBe(true);
    });

    it('base type returns false for derived type', () => {
      const result = plugin.isTypeOf(
        'gts.frontx.mfes.mfe.entry.v1~',
        'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~'
      );
      expect(result).toBe(false);
    });

    it('different types return false', () => {
      const result = plugin.isTypeOf(
        'gts.frontx.mfes.ext.domain.v1~',
        'gts.frontx.mfes.mfe.entry.v1~'
      );
      expect(result).toBe(false);
    });
  });

  describe('shared property base schema', () => {
    it('base schema has value property (unconstrained)', () => {
      const schema = gtsPlugin.getSchema('gts.frontx.mfes.comm.shared_property.v1~');
      expect(schema).toBeDefined();
      const properties = schema?.properties as Record<string, unknown>;
      expect(properties).toHaveProperty('value');
      expect(properties.value).toEqual({});
    });

    it('base schema does NOT have supportedValues property', () => {
      const schema = gtsPlugin.getSchema('gts.frontx.mfes.comm.shared_property.v1~');
      expect(schema).toBeDefined();
      const properties = schema?.properties as Record<string, unknown>;
      expect(properties).not.toHaveProperty('supportedValues');
    });

    it('base schema requires only id', () => {
      const schema = gtsPlugin.getSchema('gts.frontx.mfes.comm.shared_property.v1~');
      expect(schema).toBeDefined();
      expect(schema?.required).toEqual(['id']);
      expect(schema?.required).not.toContain('supportedValues');
      expect(schema?.required).not.toContain('value');
    });
  });

  describe('extension presentation metadata', () => {
    it('base extension schema does NOT include presentation field', () => {
      const schema = gtsPlugin.getSchema('gts.frontx.mfes.ext.extension.v1~');
      expect(schema).toBeDefined();
      expect(schema?.properties).not.toHaveProperty('presentation');
    });
  });
});
