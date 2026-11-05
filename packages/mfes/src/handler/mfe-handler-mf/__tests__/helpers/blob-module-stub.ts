/**
 * Shared blob-module stub kernel for `mfe-handler-mf` test suites.
 *
 * Dynamic `import()` of a `blob:` URL is unsupported under jsdom/vitest's
 * module loader, so every suite that drives a full `handler.load()` stubs
 * `DynamicModuleOps.importBlobModule` through `vi.mock`. `vi.mock` is
 * hoisted per test file and its module specifier must be a literal, so the
 * mock registration itself cannot live here — what lives here is everything
 * the per-file registration needs: the hoisted stub record and the subclass
 * that honours it.
 */
import type { DynamicModuleOps } from '../../mf-dynamic-module-ops';

/**
 * The stub record each suite creates inside `vi.hoisted`:
 *
 * ```ts
 * const blobModuleStub = vi.hoisted(() => createBlobModuleStub());
 * vi.mock('../../mf-dynamic-module-ops', async (importOriginal) => {
 *   const actual = await importOriginal<typeof import('../../mf-dynamic-module-ops')>();
 *   return { ...actual, DynamicModuleOps: stubbedDynamicModuleOps(actual.DynamicModuleOps, blobModuleStub) };
 * });
 * ```
 */
export interface BlobModuleStub {
  current: unknown;
}

/** Create the hoisted stub record. Use inside `vi.hoisted(...)`. */
export function createBlobModuleStub(): BlobModuleStub {
  return { current: undefined as unknown };
}

/**
 * Arm the stub with a canned module record that satisfies the lifecycle
 * contract (`default.mount`/`default.unmount`), so a `load()` that reaches
 * the import step resolves instead of rejecting.
 */
export function stubSuccessfulImport(stub: BlobModuleStub): void {
  stub.current = {
    default: { mount: (): void => {}, unmount: (): void => {} },
  };
}

/**
 * Build the `DynamicModuleOps` replacement for a `vi.mock` factory: a
 * subclass that delegates `importBlobModule` to `stub` when armed and to
 * the real implementation otherwise. Every other static member is
 * inherited unchanged, so the mock cannot drift from the kernel's real
 * surface.
 */
export function stubbedDynamicModuleOps(
  base: typeof DynamicModuleOps,
  stub: BlobModuleStub,
): typeof DynamicModuleOps {
  return class extends base {
    static override async importBlobModule(blobUrl: string): Promise<unknown> {
      return stub.current !== undefined
        ? Promise.resolve(stub.current)
        : super.importBlobModule(blobUrl);
    }
  };
}
