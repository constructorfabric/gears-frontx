/**
 * Tests for application-layer derived GTS schemas
 *
 * Verifies that the derived GTS schemas exported from @gears-frontx/framework correctly
 * constrain property values via the GTS validation mechanism:
 * - Theme schema permits any non-empty string and rejects empty values
 * - Language schema permits the 36 supported locales and rejects others
 * - Extension screen schema defines the required presentation structure
 *
 * These tests live at L2 (framework) because the derived schemas encode
 * application-level decisions. The core GTS type system at L1 (@gears-frontx/screensets)
 * only knows about the base shared_property schema — it does not constrain
 * which specific themes or languages are valid.
 *
 * @packageDocumentation
 */

import { describe, it, expect } from 'vitest';
import { GtsPlugin } from '@gears-frontx/screensets/plugins/gts';
import { FRONTX_SHARED_PROPERTY_THEME, FRONTX_SHARED_PROPERTY_LANGUAGE } from '@gears-frontx/screensets';
import { themeSchema, languageSchema, extensionScreenSchema } from '../../../src/gts';

/**
 * Build a fresh GtsPlugin instance with the application-layer derived schemas registered.
 * Using a fresh instance per describe block keeps tests isolated from singleton state.
 */
function buildPluginWithDerivedSchemas(): GtsPlugin {
  const plugin = new GtsPlugin();
  plugin.registerSchema(themeSchema);
  plugin.registerSchema(languageSchema);
  plugin.registerSchema(extensionScreenSchema);
  return plugin;
}

describe('application-layer derived GTS schemas', () => {
  describe('theme schema', () => {
    const plugin = buildPluginWithDerivedSchemas();

    it('is accessible via getSchema using the theme property type ID', () => {
      const schema = plugin.getSchema(FRONTX_SHARED_PROPERTY_THEME);
      expect(schema).toBeDefined();
      expect(schema?.$id).toBe(`gts://${FRONTX_SHARED_PROPERTY_THEME}`);
    });

    it('constrains value to non-empty string (minLength: 1)', () => {
      const schema = plugin.getSchema(FRONTX_SHARED_PROPERTY_THEME);
      const properties = schema?.properties as Record<string, { type?: string; minLength?: number }>;
      expect(properties?.value?.type).toBe('string');
      expect(properties?.value?.minLength).toBe(1);
    });

    it('uses allOf derivation from base shared_property schema', () => {
      const schema = plugin.getSchema(FRONTX_SHARED_PROPERTY_THEME);
      expect(Array.isArray((schema as Record<string, unknown>).allOf)).toBe(true);
    });

    it('valid theme value "dark" passes validation via named instance pattern', () => {
      const ephemeralId = `${FRONTX_SHARED_PROPERTY_THEME}frontx.mfes.comm.runtime.v1`;
      plugin.register({ id: ephemeralId, value: 'dark' });
      const result = plugin.validateInstance(ephemeralId);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('accepts any non-empty string as valid theme value', () => {
      const ephemeralId = `${FRONTX_SHARED_PROPERTY_THEME}frontx.mfes.comm.runtime.v1`;
      plugin.register({ id: ephemeralId, value: 'my-custom-theme' });
      const result = plugin.validateInstance(ephemeralId);
      expect(result.valid).toBe(true);
    });

    it('empty string theme value fails validation', () => {
      const ephemeralId = `${FRONTX_SHARED_PROPERTY_THEME}frontx.mfes.comm.runtime.empty.v1`;
      plugin.register({ id: ephemeralId, value: '' });
      const result = plugin.validateInstance(ephemeralId);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('language schema', () => {
    const plugin = buildPluginWithDerivedSchemas();

    it('is accessible via getSchema using the language property type ID', () => {
      const schema = plugin.getSchema(FRONTX_SHARED_PROPERTY_LANGUAGE);
      expect(schema).toBeDefined();
      expect(schema?.$id).toBe(`gts://${FRONTX_SHARED_PROPERTY_LANGUAGE}`);
    });

    it('constrains value to 36 enum strings', () => {
      const schema = plugin.getSchema(FRONTX_SHARED_PROPERTY_LANGUAGE);
      const properties = schema?.properties as Record<string, { type?: string; enum?: string[] }>;
      expect(properties?.value?.type).toBe('string');
      expect(properties?.value?.enum).toHaveLength(36);
    });

    it('uses allOf derivation from base shared_property schema', () => {
      const schema = plugin.getSchema(FRONTX_SHARED_PROPERTY_LANGUAGE);
      expect(Array.isArray((schema as Record<string, unknown>).allOf)).toBe(true);
    });

    it('valid language value "en" passes validation via named instance pattern', () => {
      const ephemeralId = `${FRONTX_SHARED_PROPERTY_LANGUAGE}frontx.mfes.comm.runtime.v1`;
      plugin.register({ id: ephemeralId, value: 'en' });
      const result = plugin.validateInstance(ephemeralId);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('valid language value "fr" passes validation', () => {
      const ephemeralId = `${FRONTX_SHARED_PROPERTY_LANGUAGE}frontx.mfes.comm.runtime.v1`;
      plugin.register({ id: ephemeralId, value: 'fr' });
      const result = plugin.validateInstance(ephemeralId);
      expect(result.valid).toBe(true);
    });

    it('invalid language value "klingon" fails validation', () => {
      const ephemeralId = `${FRONTX_SHARED_PROPERTY_LANGUAGE}frontx.mfes.comm.runtime.klingon.v1`;
      plugin.register({ id: ephemeralId, value: 'klingon' });
      const result = plugin.validateInstance(ephemeralId);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('invalid language value "invalid-lang" fails validation', () => {
      const ephemeralId = `${FRONTX_SHARED_PROPERTY_LANGUAGE}frontx.mfes.comm.runtime.invalid.v1`;
      plugin.register({ id: ephemeralId, value: 'invalid-lang' });
      const result = plugin.validateInstance(ephemeralId);
      expect(result.valid).toBe(false);
    });
  });

  describe('extension_screen schema', () => {
    const plugin = buildPluginWithDerivedSchemas();

    it('has $id identifying it as a derived Extension type for the screen domain', () => {
      expect(extensionScreenSchema.$id).toBe(
        'gts://gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~'
      );
    });

    it('is accessible via getSchema after registration', () => {
      const schema = plugin.getSchema('gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~');
      expect(schema).toBeDefined();
      expect(schema?.$id).toBe('gts://gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~');
    });

    it('requires presentation property', () => {
      expect(extensionScreenSchema.required).toContain('presentation');
    });

    it('presentation has required label and route fields', () => {
      const presentation = (extensionScreenSchema.properties as Record<string, {
        type?: string;
        required?: string[];
        properties?: Record<string, unknown>;
      }>)?.['presentation'];
      expect(presentation?.type).toBe('object');
      expect(presentation?.required).toContain('label');
      expect(presentation?.required).toContain('route');
      expect(presentation?.properties).toHaveProperty('label');
      expect(presentation?.properties).toHaveProperty('route');
      expect(presentation?.properties).toHaveProperty('icon');
      expect(presentation?.properties).toHaveProperty('order');
    });

    it('uses allOf derivation from base extension schema', () => {
      expect(Array.isArray(extensionScreenSchema.allOf)).toBe(true);
    });
  });
});
