/**
 * Root-barrel function exports of the dynamic-module operations kernel.
 *
 * `sourceImports`, `rewriteBareSpecifier`, and `importBlobModule` were
 * published from the package root as free functions before the trust
 * kernel (`mf-dynamic-module-ops.ts`) became the static-only class
 * `DynamicModuleOps`. These three functions keep that published surface
 * unchanged — same names, same signatures, same behaviour — by delegating
 * to the class's statics. They hold no logic of their own: no RegExp
 * construction and no dynamic `import()` happen here, so this file needs
 * no trust-kernel residency and the class itself stays off the barrel.
 *
 * @packageDocumentation
 */

import { DynamicModuleOps } from './mf-dynamic-module-ops';

/**
 * Test whether `source` imports the exact package `packageName`, in the
 * `from "pkg"` or `import "pkg"` form. Delegates to
 * `DynamicModuleOps.sourceImports`.
 */
export function sourceImports(source: string, packageName: string): boolean {
  return DynamicModuleOps.sourceImports(source, packageName);
}

/**
 * Rewrite every `from "pkg"` / `import "pkg"` occurrence of the exact
 * package `packageName` in `source` to `replacement`, preserving quote
 * style. Delegates to `DynamicModuleOps.rewriteBareSpecifier`.
 */
export function rewriteBareSpecifier(
  source: string,
  packageName: string,
  replacement: string,
): string {
  return DynamicModuleOps.rewriteBareSpecifier(source, packageName, replacement);
}

/**
 * Dynamically import a `blob:` (or `data:`) URL and return the evaluated
 * module record; any other URL is rejected with a `TypeError`. Delegates
 * to `DynamicModuleOps.importBlobModule`, which holds the scheme guard and
 * the bundler pragmas.
 */
export function importBlobModule(blobUrl: string): Promise<unknown> {
  return DynamicModuleOps.importBlobModule(blobUrl);
}
