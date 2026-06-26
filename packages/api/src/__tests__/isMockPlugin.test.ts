/**
 * Unit tests for isMockPlugin type guard
 *
 * Tests the MOCK_PLUGIN symbol-based identification pattern.
 * Validates OCP compliance - new mock plugins can be identified without modifying isMockPlugin.
 */

import { describe, expect, it } from 'vitest';
import { MOCK_PLUGIN, isMockPlugin, ApiPluginBase } from '../types';
import { RestMockPlugin, SseMockPlugin } from '@gears-frontx/frontx-template-standard';

describe('isMockPlugin', () => {
  describe('built-in mock plugins', () => {
    it('should return true for RestMockPlugin', () => {
      const plugin = new RestMockPlugin({ mockMap: {} });
      expect(isMockPlugin(plugin)).toBe(true);
    });

    it('should return true for SseMockPlugin', () => {
      const plugin = new SseMockPlugin({ mockStreams: {} });
      expect(isMockPlugin(plugin)).toBe(true);
    });
  });

  describe('non-mock plugins', () => {
    it('should return false for plain ApiPluginBase subclass', () => {
      class RegularPlugin extends ApiPluginBase {
        destroy(): void {}
      }
      const plugin = new RegularPlugin();
      expect(isMockPlugin(plugin)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isMockPlugin(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isMockPlugin(undefined)).toBe(false);
    });

    it('should return false for non-object types', () => {
      expect(isMockPlugin('string')).toBe(false);
      expect(isMockPlugin(123)).toBe(false);
      expect(isMockPlugin(true)).toBe(false);
    });

    it('should return false for plain objects', () => {
      expect(isMockPlugin({})).toBe(false);
      expect(isMockPlugin({ onRequest: () => {} })).toBe(false);
    });
  });

  describe('custom mock plugins (OCP compliance)', () => {
    it('should return true for custom plugin with MOCK_PLUGIN symbol', () => {
      class CustomMockPlugin extends ApiPluginBase {
        static readonly [MOCK_PLUGIN] = true;
        destroy(): void {}
      }
      const plugin = new CustomMockPlugin();
      expect(isMockPlugin(plugin)).toBe(true);
    });

    it('should work with inherited mock plugins', () => {
      class BaseMockPlugin extends ApiPluginBase {
        static readonly [MOCK_PLUGIN] = true;
        destroy(): void {}
      }
      class DerivedMockPlugin extends BaseMockPlugin {}

      const basePlugin = new BaseMockPlugin();
      const derivedPlugin = new DerivedMockPlugin();

      expect(isMockPlugin(basePlugin)).toBe(true);
      // Subclass constructor inherits static [MOCK_PLUGIN] from base
      expect(isMockPlugin(derivedPlugin)).toBe(true);
    });
  });

  describe('MOCK_PLUGIN symbol', () => {
    it('should be a Symbol', () => {
      expect(typeof MOCK_PLUGIN).toBe('symbol');
    });

    it('should be registered with Symbol.for for cross-realm compatibility', () => {
      expect(MOCK_PLUGIN).toBe(Symbol.for('frontx:plugin:mock'));
    });

    it('should be present on RestMockPlugin class', () => {
      expect(MOCK_PLUGIN in RestMockPlugin).toBe(true);
      expect(RestMockPlugin[MOCK_PLUGIN]).toBe(true);
    });

    it('should be present on SseMockPlugin class', () => {
      expect(MOCK_PLUGIN in SseMockPlugin).toBe(true);
      expect(SseMockPlugin[MOCK_PLUGIN]).toBe(true);
    });
  });
});
