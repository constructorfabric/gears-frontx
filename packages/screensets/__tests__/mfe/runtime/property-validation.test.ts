/**
 * Tests for Runtime Property Value Validation in updateSharedProperty
 *
 * Verifies the structural mechanics of GTS validation in updateSharedProperty:
 * - Validation uses the named instance pattern: register({ id, value })
 *   where `id` is a chained GTS instance ID (same pattern as actions chains)
 *   and the schema is extracted automatically from the chained ID — no `type` field
 * - Re-registration with the same deterministic ephemeralId overwrites the previous
 *   instance (no store accumulation)
 * - Validation occurs once per call (before any domain receives the value)
 *
 * NOTE: Tests that verify enum-level constraints (e.g. "dark" is valid, "neon" is invalid)
 * require application-specific derived schemas (theme.v1, language.v1). Those schemas
 * live in @gears-frontx/framework and are tested in framework/property-validation tests.
 *
 * This file uses a simple inline-registered test schema to keep the structural
 * tests self-contained and free of L1→L2 dependencies.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DefaultScreensetsRegistry } from '../../../src/mfe/runtime/DefaultScreensetsRegistry';
import { GtsPlugin } from '../../../src/mfe/plugins/gts/index';
import type { JSONSchema } from '../../../src/mfe/plugins/types';
import type { ExtensionDomain } from '../../../src/mfe/types';
import { MockContainerProvider } from '../test-utils';

/**
 * Minimal derived shared-property schema for testing.
 * Only permits "allowed-value" — used to verify the structural mechanics
 * of updateSharedProperty without requiring the application-layer derived schemas.
 */
const TEST_PROPERTY_TYPE_ID = 'gts.frontx.mfes.comm.shared_property.v1~frontx.test.prop.color.v1~';
const testPropertySchema: JSONSchema = {
  $id: `gts://${TEST_PROPERTY_TYPE_ID}`,
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  allOf: [{ $ref: 'gts://gts.frontx.mfes.comm.shared_property.v1~' }],
  properties: {
    value: { type: 'string', enum: ['allowed-value', 'other-allowed'] },
  },
};

describe('updateSharedProperty - GTS runtime validation mechanics', () => {
  let registry: DefaultScreensetsRegistry;
  let gtsPlugin: GtsPlugin;
  let testDomain: ExtensionDomain;
  let mockContainerProvider: MockContainerProvider;

  const DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~frontx.test.validation.slot.v1';

  beforeEach(() => {
    gtsPlugin = new GtsPlugin();
    // Register a simple inline test schema so updateSharedProperty can validate
    // without requiring the application-layer derived schemas from @gears-frontx/framework.
    gtsPlugin.registerSchema(testPropertySchema);

    registry = new DefaultScreensetsRegistry({ typeSystem: gtsPlugin });
    mockContainerProvider = new MockContainerProvider();

    testDomain = {
      id: DOMAIN_ID,
      sharedProperties: [TEST_PROPERTY_TYPE_ID],
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

  describe('ephemeral instance re-registration', () => {
    it('multiple valid updates overwrite the previous ephemeral instance', () => {
      registry.updateSharedProperty(TEST_PROPERTY_TYPE_ID, 'allowed-value');
      registry.updateSharedProperty(TEST_PROPERTY_TYPE_ID, 'other-allowed');
      registry.updateSharedProperty(TEST_PROPERTY_TYPE_ID, 'allowed-value');

      // Latest value should be stored
      expect(registry.getDomainProperty(DOMAIN_ID, TEST_PROPERTY_TYPE_ID)).toBe('allowed-value');
    });
  });

  describe('named instance pattern — register() call shape', () => {
    it('calls register() with named instance: chained GTS ID, no type field, value only', () => {
      const registerSpy = vi.spyOn(gtsPlugin, 'register');

      registry.updateSharedProperty(TEST_PROPERTY_TYPE_ID, 'allowed-value');

      // The register call must use the named instance pattern:
      // - id: chained GTS instance ID (schema extracted automatically by gts-ts)
      // - value: the raw value
      // - NO type field
      expect(registerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: `${TEST_PROPERTY_TYPE_ID}frontx.mfes.comm.runtime.v1`,
          value: 'allowed-value',
        })
      );

      // Confirm no `type` field is present
      const callArg = registerSpy.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(callArg).not.toHaveProperty('type');

      registerSpy.mockRestore();
    });

    it('ephemeral id encodes schema info as a chained GTS instance ID', () => {
      const registerSpy = vi.spyOn(gtsPlugin, 'register');

      registry.updateSharedProperty(TEST_PROPERTY_TYPE_ID, 'allowed-value');

      const callArg = registerSpy.mock.calls[0]?.[0] as Record<string, unknown>;
      // The id must use the named instance suffix "frontx.mfes.comm.runtime.v1"
      expect(String(callArg.id)).toContain('frontx.mfes.comm.runtime.v1');
      // The id must NOT use the old anonymous instance suffix "__runtime"
      expect(String(callArg.id)).not.toMatch(/__runtime$/);

      registerSpy.mockRestore();
    });

    it('validation is performed once per call even with multiple declaring domains', () => {
      // Register a second domain that also declares the property
      const domain2: ExtensionDomain = {
        id: 'gts.frontx.mfes.ext.domain.v1~frontx.test.validation2.slot.v1',
        sharedProperties: [TEST_PROPERTY_TYPE_ID],
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

      const validateSpy = vi.spyOn(gtsPlugin, 'validateInstance');

      registry.updateSharedProperty(TEST_PROPERTY_TYPE_ID, 'allowed-value');

      // validateInstance should be called exactly once — not once per matching domain
      const validationCallsForProp = validateSpy.mock.calls.filter(
        ([id]) => String(id).includes('frontx.mfes.comm.runtime.v1')
      );
      expect(validationCallsForProp).toHaveLength(1);

      validateSpy.mockRestore();
    });
  });
});
