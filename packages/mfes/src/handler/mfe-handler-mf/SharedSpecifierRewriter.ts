/**
 * Specifier rewriting for shared-dependency unit and pack sources.
 *
 * One class per file, all members static and pure — a namespace for the
 * rewrite, never instantiated (`runtime_style`).
 *
 * Bare specifiers are rewritten through the trust kernel's
 * `DynamicModuleOps.rewriteBareSpecifier` per known specifier key, so the
 * only interpolated `RegExp` construction stays inside the audited
 * kernel. Relative specifiers inside a unit are rewritten with the fixed
 * literal pattern below — no interpolation, the same standing
 * `SharedDepSpecifierScan` enjoys outside the kernel — resolved against
 * EVERY member module path of the issuing unit (finding F-016: a
 * multi-module SCC unit resolves a relative import against the directory
 * of the member that could issue it, not `modulePaths[0]` alone).
 *
 * @packageDocumentation
 * @internal
 */

import { DynamicModuleOps } from './mf-dynamic-module-ops';

export class SharedSpecifierRewriter {
  protected constructor() {}

  /**
   * Fixed literal matcher for the two import forms the kernel handles —
   * `from "x"` / `import "x"` — capturing the specifier text. No
   * interpolation; safe outside the trust kernel on the same argument
   * `SharedDepSpecifierScan.GENERIC_IMPORT_SPECIFIER_PATTERN` documents.
   */
  private static readonly IMPORT_SPECIFIER_PATTERN =
    /(from|import)(\s*["'])([^"']+)(["'])/g;

  /**
   * Rewrite `source` for minting: bare specifiers via
   * `bareSpecifierToBlob` (one kernel rewrite per key, longest key first
   * so `react/jsx-runtime` wins over `react`), relative specifiers via
   * `relativeToBlob` resolved against every member module path of the
   * issuing unit.
   *
   * A specifier with no resolution is left untouched — survivors among
   * the reached shared deps are diagnosed by the caller's survivor
   * check, never silently here.
   */
  static rewriteUnitSource(
    source: string,
    memberModulePaths: readonly string[],
    bareSpecifierToBlob: ReadonlyMap<string, string>,
    relativeToBlob: (resolvedModulePath: string) => string | undefined,
  ): string {
    let rewritten = source;
    // Longest key first: 'react/jsx-runtime' must not be shadowed by a
    // 'react' rewrite (the kernel pattern is exact-match, so this is
    // belt-and-suspenders ordering rather than a correctness fix).
    const keys = [...bareSpecifierToBlob.keys()].sort(
      (a, b) => b.length - a.length,
    );
    for (const specifier of keys) {
      const blob = bareSpecifierToBlob.get(specifier);
      if (blob !== undefined) {
        rewritten = DynamicModuleOps.rewriteBareSpecifier(
          rewritten,
          specifier,
          blob,
        );
      }
    }
    return rewritten.replace(
      SharedSpecifierRewriter.IMPORT_SPECIFIER_PATTERN,
      (whole, kind: string, gap: string, specifier: string, quote: string) => {
        if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
          return whole as string;
        }
        for (const member of memberModulePaths) {
          const resolved = SharedSpecifierRewriter.resolveRelativeModulePath(
            member,
            specifier,
          );
          const blob = relativeToBlob(resolved);
          if (blob !== undefined) {
            return `${kind}${gap}${blob}${quote}`;
          }
        }
        return whole as string;
      },
    );
  }

  /**
   * Resolve `specifier` ('./x.js', '../x.js') against the directory of
   * `memberModulePath` to a package-relative module path — the same
   * URL-resolution semantics `MfeHandlerMF.resolveRelativePath` uses for
   * chunk filenames.
   */
  static resolveRelativeModulePath(
    memberModulePath: string,
    specifier: string,
  ): string {
    const syntheticBase = 'http://r/';
    const fromUrl = new URL(memberModulePath, syntheticBase);
    return new URL(specifier, fromUrl).pathname.slice(1);
  }

  /**
   * The candidate module paths a subpath specifier like
   * `react/jsx-runtime` (subpath `jsx-runtime`) may name inside its
   * package, most specific first (finding F-017).
   */
  static subpathModulePathCandidates(subpath: string): string[] {
    return [subpath, `${subpath}.js`, `${subpath}/index.js`];
  }
}
