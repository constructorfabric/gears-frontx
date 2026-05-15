import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// @cpt-dod:cpt-frontx-dod-framework-composition-reexports:p1

// @cpt-begin:cpt-frontx-dod-framework-composition-reexports:p1:inst-bootstrap-mfe-contract-types
type TestManifest = {
  manifest: Record<string, unknown>;
  entries: Array<Record<string, unknown>>;
  extensions: Array<Record<string, unknown>>;
  schemas?: Array<Record<string, unknown>>;
};

/**
 * Arguments passed to a custom {@link BootstrapMfeTestSpecOptions.resolveModule}.
 */
export type BootstrapMfeResolveArgs = {
  specifier: string;
  callerUrl: string | undefined;
};

export type BootstrapMfeTestSpecOptions = {
  suiteName: string;
  /**
   * Specifier of the bootstrap module under test.
   *
   * - With the default resolver, this is a relative specifier (e.g.
   *   `./bootstrap.ts`) that gets resolved against `callerUrl` to an
   *   absolute filesystem path — which is how Vitest keys its module graph
   *   for file-backed modules.
   * - With a custom `resolveModule`, this may be any string your resolver
   *   understands (absolute path, `file://` URL, Vite alias, virtual id).
   */
  bootstrapModulePath: string;
  /**
   * Specifier of the generated manifests module. Must resolve to the exact
   * module key the SUT's `import` statement produces in the test's module
   * graph — otherwise `vi.doMock` will silently miss and the SUT will load
   * the real manifest.
   */
  manifestsModulePath: string;
  /**
   * Caller's `import.meta.url`. Required by the default resolver; unused
   * when a custom `resolveModule` is supplied.
   */
  callerUrl?: string;
  /**
   * Override module-key resolution. Provide this when the SUT imports
   * through a Vite alias, a virtual module, or any other mechanism where
   * `fileURLToPath(new URL(specifier, callerUrl))` would not produce the
   * key Vitest uses internally.
   *
   * The returned value is passed verbatim to both `vi.doMock` and the
   * dynamic `import()` of the bootstrap module, so it MUST be identical
   * (===) to the key the SUT's import graph resolves to.
   */
  resolveModule?: (args: BootstrapMfeResolveArgs) => string;
  /**
   * Optional exact module key used by the bootstrap module when importing the
   * React bridge helpers. Defaults to `@cyberfabric/react`.
   */
  reactModulePath?: string;
};
// @cpt-end:cpt-frontx-dod-framework-composition-reexports:p1:inst-bootstrap-mfe-contract-types

// @cpt-begin:cpt-frontx-dod-framework-composition-reexports:p1:inst-bootstrap-mfe-contract-resolve
function defaultResolve({ specifier, callerUrl }: BootstrapMfeResolveArgs): string {
  if (callerUrl === undefined) {
    throw new Error(
      `describeBootstrapMfeContract: 'callerUrl' is required when no 'resolveModule' is provided (specifier: '${specifier}').`,
    );
  }
  // Resolve the specifier relative to the caller to an absolute filesystem
  // path (not a file:// URL). Vitest's module graph keys file-backed modules
  // by their resolved absolute path, so supplying an absolute path for both
  // `vi.doMock` and the dynamic `import()` avoids subtle
  // file://-vs-absolute-path mismatches that let a mock silently miss in
  // ESM-only setups.
  return fileURLToPath(new URL(specifier, callerUrl));
}
// @cpt-end:cpt-frontx-dod-framework-composition-reexports:p1:inst-bootstrap-mfe-contract-resolve

// @cpt-begin:cpt-frontx-dod-framework-composition-reexports:p1:inst-bootstrap-mfe-contract-suite
export function describeBootstrapMfeContract(options: BootstrapMfeTestSpecOptions): void {
  const resolve = options.resolveModule ?? defaultResolve;
  const reactModulePath = options.reactModulePath ?? '@cyberfabric/react';
  const bootstrapModulePath = resolve({
    specifier: options.bootstrapModulePath,
    callerUrl: options.callerUrl,
  });
  const manifestsModulePath = resolve({
    specifier: options.manifestsModulePath,
    callerUrl: options.callerUrl,
  });

  const mockBootstrapMfeDomains = vi.fn();
  const currentManifests: TestManifest[] = [];

  describe(options.suiteName, () => {
    beforeEach(() => {
      vi.resetModules();
      currentManifests.splice(0, currentManifests.length);
      mockBootstrapMfeDomains.mockReset();

      vi.doMock(reactModulePath, () => ({
        bootstrapMfeDomains: (...args: unknown[]) => mockBootstrapMfeDomains(...args),
      }));

      vi.doMock(manifestsModulePath, () => ({
        __esModule: true,
        default: currentManifests,
        MFE_MANIFESTS: currentManifests,
      }));
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.doUnmock(reactModulePath);
      vi.doUnmock(manifestsModulePath);
    });

    // @cpt-begin:cpt-frontx-dod-framework-composition-reexports:p1:inst-bootstrap-mfe-contract-it-empty
    it('warns and returns no screens when no manifests exist', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const registry = {
        typeSystem: {
          register: vi.fn(),
          registerSchema: vi.fn(),
        },
        registerExtension: vi.fn(),
      };
      mockBootstrapMfeDomains.mockResolvedValue(registry);
      const { bootstrapMFE } = await import(bootstrapModulePath);

      await expect(bootstrapMFE({} as never, { current: null })).resolves.toEqual([]);

      // If vi.doMock for @cyberfabric/react silently missed, the SUT would call
      // the real bootstrapMfeDomains instead of our mock and this count would
      // be 0. Asserting a positive call count keeps a mock-miss from producing
      // a misleading downstream failure.
      expect(mockBootstrapMfeDomains).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain('No MFE manifests found');
      expect(registry.typeSystem.register).not.toHaveBeenCalled();
      expect(registry.typeSystem.registerSchema).not.toHaveBeenCalled();
      expect(registry.registerExtension).not.toHaveBeenCalled();
    });
    // @cpt-end:cpt-frontx-dod-framework-composition-reexports:p1:inst-bootstrap-mfe-contract-it-empty

    // @cpt-begin:cpt-frontx-dod-framework-composition-reexports:p1:inst-bootstrap-mfe-contract-it-screens
    it('registers manifests and entries and only returns screen extensions', async () => {
      const register = vi.fn();
      const registerSchema = vi.fn();
      const registerExtension = vi.fn().mockResolvedValue(undefined);
      const registry = {
        typeSystem: {
          register,
          registerSchema,
        },
        registerExtension,
      };
      const manifest = { $id: 'manifest.demo' };
      const entry = { id: 'entry.demo', actions: [], domainActions: [] };
      const screenExtension = { id: 'screen.demo', presentation: { route: '/demo' } };
      const helperExtension = { id: 'helper.demo' };
      currentManifests.push({
        manifest,
        entries: [entry],
        extensions: [screenExtension, helperExtension],
      });
      mockBootstrapMfeDomains.mockResolvedValue(registry);
      const { bootstrapMFE } = await import(bootstrapModulePath);

      await expect(bootstrapMFE({} as never, { current: null })).resolves.toEqual([screenExtension]);

      // Positive call-count assertion proves both mocks were applied: the react
      // mock (bootstrapMfeDomains reaches our fn) and the manifests mock (the
      // SUT iterated the injected currentManifests, producing the register /
      // registerExtension call sequences asserted below).
      expect(mockBootstrapMfeDomains).toHaveBeenCalledTimes(1);
      expect(registerSchema).not.toHaveBeenCalled();
      expect(register).toHaveBeenNthCalledWith(1, manifest);
      expect(register).toHaveBeenNthCalledWith(2, { ...entry, manifest });
      expect(registerExtension).toHaveBeenNthCalledWith(1, screenExtension);
      expect(registerExtension).toHaveBeenNthCalledWith(2, helperExtension);
    });
    // @cpt-end:cpt-frontx-dod-framework-composition-reexports:p1:inst-bootstrap-mfe-contract-it-screens

    // @cpt-begin:cpt-frontx-dod-framework-composition-reexports:p1:inst-bootstrap-mfe-contract-it-schemas
    it('registers MFE-carried schemas before manifests and entries', async () => {
      const callOrder: string[] = [];
      const register = vi.fn(() => {
        callOrder.push('register');
      });
      const registerSchema = vi.fn(() => {
        callOrder.push('registerSchema');
      });
      const registerExtension = vi.fn().mockResolvedValue(undefined);
      const registry = {
        typeSystem: {
          register,
          registerSchema,
        },
        registerExtension,
      };
      const manifest = { $id: 'manifest.demo' };
      const entry = { id: 'entry.demo', actions: ['schema.demo.a'], domainActions: ['schema.demo.b'] };
      const schemaA = { $id: 'schema.demo.a' };
      const schemaB = { $id: 'schema.demo.b' };
      currentManifests.push({
        manifest,
        entries: [entry],
        extensions: [],
        schemas: [schemaA, schemaB],
      });
      mockBootstrapMfeDomains.mockResolvedValue(registry);
      const { bootstrapMFE } = await import(bootstrapModulePath);

      await bootstrapMFE({} as never, { current: null });

      expect(mockBootstrapMfeDomains).toHaveBeenCalledTimes(1);
      expect(registerSchema).toHaveBeenNthCalledWith(1, schemaA);
      expect(registerSchema).toHaveBeenNthCalledWith(2, schemaB);
      expect(callOrder).toEqual(['registerSchema', 'registerSchema', 'register', 'register']);
    });
    // @cpt-end:cpt-frontx-dod-framework-composition-reexports:p1:inst-bootstrap-mfe-contract-it-schemas

    // @cpt-begin:cpt-frontx-dod-framework-composition-reexports:p1:inst-bootstrap-mfe-contract-it-warn
    it('warns when no screen extensions are available after registration', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const register = vi.fn();
      const registerSchema = vi.fn();
      const registerExtension = vi.fn().mockResolvedValue(undefined);
      const manifest = { $id: 'manifest.demo' };
      const entry = { id: 'entry.demo', actions: [], domainActions: [] };
      const helperExtension = { id: 'helper.demo' };
      const registry = {
        typeSystem: {
          register,
          registerSchema,
        },
        registerExtension,
      };
      currentManifests.push({
        manifest,
        entries: [entry],
        extensions: [helperExtension],
      });
      mockBootstrapMfeDomains.mockResolvedValue(registry);
      const { bootstrapMFE } = await import(bootstrapModulePath);

      await expect(bootstrapMFE({} as never, { current: null })).resolves.toEqual([]);

      expect(mockBootstrapMfeDomains).toHaveBeenCalledTimes(1);
      expect(register).toHaveBeenNthCalledWith(1, manifest);
      expect(register).toHaveBeenNthCalledWith(2, { ...entry, manifest });
      expect(registerSchema).not.toHaveBeenCalled();
      expect(registerExtension).toHaveBeenCalledWith(helperExtension);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain('No screen extensions available');
    });
    // @cpt-end:cpt-frontx-dod-framework-composition-reexports:p1:inst-bootstrap-mfe-contract-it-warn
  });
}
// @cpt-end:cpt-frontx-dod-framework-composition-reexports:p1:inst-bootstrap-mfe-contract-suite
