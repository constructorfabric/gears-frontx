/**
 * Extension Type Validation Tests
 *
 * Tests for `validateExtensionType()` — verifies that an extension's type
 * derives from the domain's required `extensionsTypeId`. The function only
 * performs the hierarchy check and throws on mismatch; schema validation is
 * handled by the GTS plugin's `register()` before this helper is called.
 */

import { describe, it, expect } from 'vitest';
import type { TypeSystemPlugin } from '../../../src/mfe/plugins/types';
import { validateExtensionType } from '../../../src/mfe/validation/extension-type';
import { ExtensionTypeError } from '../../../src/mfe/errors';
import type { Extension } from '../../../src/mfe/types/extension';
import type { ExtensionDomain } from '../../../src/mfe/types/extension-domain';

function createMockPlugin(typeHierarchy: Record<string, string[]> = {}): TypeSystemPlugin {
  return {
    name: 'mock',
    version: '1.0.0',
    registerSchema: () => {},
    getSchema: () => undefined,
    register: () => {},
    validateInstance: () => ({ valid: true, errors: [] }),
    isTypeOf: (typeId: string, baseTypeId: string) => {
      if (typeHierarchy[typeId]) {
        return typeHierarchy[typeId].includes(baseTypeId);
      }
      return typeId.startsWith(baseTypeId) || typeId === baseTypeId;
    },
  };
}

describe('validateExtensionType', () => {
  const DERIVED_WIDGET_EXTENSION_TYPE =
    'gts.frontx.screensets.ext.extension.v1~acme.dashboard.ext.widget_extension.v1~';
  const WIDGET_EXTENSION_INSTANCE =
    'gts.frontx.screensets.ext.extension.v1~acme.dashboard.ext.widget_extension.v1~acme.analytics.v1';
  const DOMAIN_ID = 'gts.frontx.screensets.ext.domain.v1~acme.dashboard.layout.widget_slot.v1';
  const ENTRY_ID =
    'gts.frontx.screensets.mfe.entry.v1~frontx.screensets.mfe.entry_mf.v1~acme.analytics.mfe.chart.v1';
  const BASE_EXTENSION_INSTANCE = 'gts.frontx.screensets.ext.extension.v1~acme.generic.extension.v1';

  const baseDomain = (extensionsTypeId?: string): ExtensionDomain => ({
    id: DOMAIN_ID,
    sharedProperties: [],
    actions: [],
    extensionsActions: [],
    ...(extensionsTypeId ? { extensionsTypeId } : {}),
    defaultActionTimeout: 30000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
  });

  describe('successful scenarios', () => {
    it('returns without throwing when domain does not specify extensionsTypeId', () => {
      const plugin = createMockPlugin();
      const domain = baseDomain();
      const extension: Extension = {
        id: BASE_EXTENSION_INSTANCE,
        domain: DOMAIN_ID,
        entry: ENTRY_ID,
      };

      expect(() => validateExtensionType(plugin, domain, extension)).not.toThrow();
    });

    it('returns without throwing when extension type derives from required base', () => {
      const plugin = createMockPlugin();
      const domain = baseDomain(DERIVED_WIDGET_EXTENSION_TYPE);
      const extension: Extension = {
        id: WIDGET_EXTENSION_INSTANCE,
        domain: DOMAIN_ID,
        entry: ENTRY_ID,
      };

      expect(() => validateExtensionType(plugin, domain, extension)).not.toThrow();
    });
  });

  describe('hierarchy failure scenarios', () => {
    it('throws ExtensionTypeError when extension type does not derive from required base', () => {
      const plugin = createMockPlugin();
      const domain = baseDomain(DERIVED_WIDGET_EXTENSION_TYPE);
      const unrelatedId =
        'gts.frontx.screensets.ext.extension.v1~acme.other.ext.unrelated.v1~acme.other.instance.v1';
      const extension: Extension = {
        id: unrelatedId,
        domain: DOMAIN_ID,
        entry: ENTRY_ID,
      };

      expect(() => validateExtensionType(plugin, domain, extension)).toThrow(
        ExtensionTypeError
      );

      try {
        validateExtensionType(plugin, domain, extension);
      } catch (err) {
        expect(err).toBeInstanceOf(ExtensionTypeError);
        const typed = err as ExtensionTypeError;
        expect(typed.code).toBe('EXTENSION_TYPE_ERROR');
        expect(typed.extensionTypeId).toBe(unrelatedId);
        expect(typed.requiredBaseTypeId).toBe(DERIVED_WIDGET_EXTENSION_TYPE);
        expect(typed.message).toContain('does not derive from');
        expect(typed.message).toContain(DERIVED_WIDGET_EXTENSION_TYPE);
      }
    });

    it('throws ExtensionTypeError when extension uses base type but domain requires derived type', () => {
      const plugin = createMockPlugin();
      const domain = baseDomain(DERIVED_WIDGET_EXTENSION_TYPE);
      const extension: Extension = {
        id: BASE_EXTENSION_INSTANCE,
        domain: DOMAIN_ID,
        entry: ENTRY_ID,
      };

      expect(() => validateExtensionType(plugin, domain, extension)).toThrow(
        ExtensionTypeError
      );
    });
  });
});
