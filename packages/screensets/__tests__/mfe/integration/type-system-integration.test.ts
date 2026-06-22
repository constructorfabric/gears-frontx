import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultMfeRegistry } from '../../../src/mfe/runtime/DefaultMfeRegistry';
import { GtsPlugin } from '../../../src/mfe/plugins/gts';
import type { TypeSystemPlugin, JSONSchema } from '../../../src/mfe/plugins/types';
import type { MfeRegistry } from '../../../src/mfe/runtime';
import { FRONTX_SCREEN_EXTENSION_TYPE } from '../../../src/mfe/constants';

// This suite exercises the GTS type-system plugin wired into
// DefaultMfeRegistry entirely in-memory — no real DOM, no network,
// no external MFE processes.  "Integration" here means the registry and plugin
// interact end-to-end, not that it is a browser/E2E test.
describe('In-memory type-system integration (DefaultMfeRegistry + GTS plugin)', () => {
  let runtime: MfeRegistry;
  let typeSystem: GtsPlugin;

  beforeEach(() => {
    typeSystem = new GtsPlugin();
    runtime = new DefaultMfeRegistry({
      typeSystem,
    });
  });

  describe('12.1.1: Registry initialisation with GTS plugin', () => {
    it('should initialise runtime with GTS plugin', () => {
      expect(runtime).toBeDefined();
      expect(runtime.typeSystem).toBeDefined();
      expect(runtime.typeSystem.name).toBe('gts');
      expect(runtime.typeSystem.version).toBe('1.0.0');
    });

  });

  describe('12.1.2: Type-system operations', () => {
    it('should check type hierarchy relationships', () => {
      // Base type matches itself
      expect(runtime.typeSystem.isTypeOf(
        'gts.frontx.mfes.mfe.entry.v1~',
        'gts.frontx.mfes.mfe.entry.v1~'
      )).toBe(true);

      // Derived type matches base
      expect(runtime.typeSystem.isTypeOf(
        'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~',
        'gts.frontx.mfes.mfe.entry.v1~'
      )).toBe(true);

      // Base type does not match derived
      expect(runtime.typeSystem.isTypeOf(
        'gts.frontx.mfes.mfe.entry.v1~',
        'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~'
      )).toBe(false);
    });

    it('should access schema information', () => {
      // First-class schemas should be available. The registry's typeSystem is
      // schema-agnostic (TypeSystemPlugin<unknown>); this suite wires the GTS
      // plugin, so view the schemas as JSONSchema for the GTS-specific assertions.
      const entrySchema = runtime.typeSystem.getSchema('gts.frontx.mfes.mfe.entry.v1~') as JSONSchema | undefined;
      expect(entrySchema).toBeDefined();
      expect(entrySchema?.$id).toContain('gts.frontx.mfes.mfe.entry.v1~');

      const domainSchema = runtime.typeSystem.getSchema('gts.frontx.mfes.ext.domain.v1~') as JSONSchema | undefined;
      expect(domainSchema).toBeDefined();
      expect(domainSchema?.$id).toContain('gts.frontx.mfes.ext.domain.v1~');
    });
  });


  describe('12.1.4: Type-system correctness under repeated calls', () => {
    // Intentionally reduced from the original 1 000 iterations: the goal is
    // to catch regressions from repeated invocations, not to benchmark
    // throughput.  A handful of iterations is sufficient to expose any
    // stateful side-effects without making the suite slow on CI.
    it('should return consistent results across repeated isTypeOf calls', () => {
      const iterations = 50;

      for (let i = 0; i < iterations; i++) {
        expect(
          runtime.typeSystem.isTypeOf(
            'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~',
            'gts.frontx.mfes.mfe.entry.v1~'
          )
        ).toBe(true);
      }
    });
  });

  describe('12.1.5: Custom TypeSystemPlugin wrapper', () => {
    it('should work with custom TypeSystemPlugin wrapper', () => {
      // Create a custom plugin that wraps GTS
      const customPlugin: TypeSystemPlugin<JSONSchema> = {
        name: 'custom-test',
        version: '1.0.0',
        registerSchema: (schema) => {
          typeSystem.registerSchema(schema);
        },
        getSchema: (typeId: string) => typeSystem.getSchema(typeId),
        register: (entity: unknown) => { typeSystem.register(entity); },
        validateInstance: (instanceId: string) => typeSystem.validateInstance(instanceId),
        isTypeOf: (typeId: string, baseTypeId: string) => typeSystem.isTypeOf(typeId, baseTypeId),
      };

      const customRuntime = new DefaultMfeRegistry({
        typeSystem: customPlugin,
      });

      // Verify custom plugin is used
      expect(customRuntime.typeSystem.name).toBe('custom-test');
      expect(customRuntime.typeSystem.version).toBe('1.0.0');

      // Standard operations should still work
      const schema = customRuntime.typeSystem.getSchema('gts.frontx.mfes.ext.domain.v1~');
      expect(schema).toBeDefined();
    });
  });

  describe('Phase 37: Screen Extension Derived Type - Type Hierarchy', () => {
    // NOTE: The extension_screen.v1 schema is NOT a built-in L1 schema.
    // It lives in @gears-frontx/framework and is registered at the application layer.
    // Schema content tests are in packages/framework/__tests__/plugins/microfrontends/property-validation.test.ts.
    // Only the string-based type hierarchy check (isTypeOf) is tested here
    // because it does not require schema registration.

    it('should check type hierarchy for screen extension derived type', () => {
      // Screen extension type derives from base extension type
      // This check uses string prefix matching — no schema registration needed
      expect(
        runtime.typeSystem.isTypeOf(
          FRONTX_SCREEN_EXTENSION_TYPE,
          'gts.frontx.mfes.ext.extension.v1~'
        )
      ).toBe(true);

      // Base extension type does NOT derive from screen extension type
      expect(
        runtime.typeSystem.isTypeOf(
          'gts.frontx.mfes.ext.extension.v1~',
          FRONTX_SCREEN_EXTENSION_TYPE
        )
      ).toBe(false);
    });

    it('should have base extension schema without presentation field', () => {
      // Verify base extension schema does NOT have presentation
      const baseSchema = runtime.typeSystem.getSchema('gts.frontx.mfes.ext.extension.v1~') as JSONSchema | undefined;
      expect(baseSchema).toBeDefined();

      // Base schema should NOT have presentation in required or properties
      const hasPresentation =
        baseSchema?.required?.includes('presentation') ||
        baseSchema?.properties?.presentation !== undefined;
      expect(hasPresentation).toBe(false);
    });
  });
});
