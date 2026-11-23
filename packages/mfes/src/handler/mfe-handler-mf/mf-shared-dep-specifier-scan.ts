/**
 * Specifier scans over the text of a minted shared unit or own chunk: the
 * survivor check and the undeclared-specifier diagnostic.
 *
 * Both read the records the comment/string/template/regex-aware
 * `DynamicImportScan` reported for the text — only the specifier literals
 * of real static `import "x"`, `import ... from "x"` and
 * `export ... from "x"` statements — less those a rewrite replaced. A string literal, a comment, an `import(...)` call or
 * `import.meta` that merely contains such text is never reported, so
 * neither scan can mistake ordinary code for an import.
 *
 * This is deliberately NOT part of the audited trust kernel
 * (`mf-dynamic-module-ops.ts`): it generates no module and builds no
 * pattern, so it carries no trust-kernel residency requirement (see the
 * kernel file's header comment and `cpt-frontx-adr-mfe-load-isolation`).
 *
 * The undeclared-specifier scan is a diagnostic and MUST NEVER be able to
 * fail a load: its only callers pass its result to `console.warn` and
 * continue the load unconditionally. The survivor check
 * (`findSurvivingDeclared`) is the one member that can fail a load, and
 * only for the specifiers the caller names (the unit's own `imports`
 * edges, or the declared names a chunk could import).
 *
 * @packageDocumentation
 */

import type { StaticImportRecord } from '../../unit-format/dynamic-import-scan';

/**
 * The specifier scans. All members are static and pure — the class is a
 * namespace for the scans, never instantiated.
 */
export class SharedDepSpecifierScan {
  protected constructor() {}

  /**
   * A specifier text is well-formed as a package module specifier when it
   * matches the grammar: an optional `@scope/` prefix (scope starting with
   * alphanumeric), a package name (starting with alphanumeric), and zero or
   * more `/`-separated subpath segments, where each segment uses only the
   * characters npm package names permit (letters, digits, `.`, `_`, `-`, `~`).
   * Already-rewritten `blob:`/`data:` specifiers fail this grammar because
   * they contain a colon, as does a relative specifier.
   */
  private static readonly WELL_FORMED_MODULE_SPECIFIER_PATTERN =
    /^(@[a-zA-Z0-9][a-zA-Z0-9._~-]*\/)?[a-zA-Z0-9][a-zA-Z0-9._~-]*(?:\/[a-zA-Z0-9._~-]+)*$/;

  /**
   * The first of `specifiers` that a surviving static import or re-export
   * record still names — a declared specifier that survived a rewrite.
   */
  static findSurvivingDeclared(
    records: readonly StaticImportRecord[],
    specifiers: ReadonlySet<string>,
  ): string | undefined {
    for (const record of records) {
      if (specifiers.has(record.specifier)) return record.specifier;
    }
    return undefined;
  }

  /**
   * The first relative specifier (`./` or `../`) that a surviving static
   * import or re-export record still names — one no blob URL replaced.
   */
  static findSurvivingRelative(
    records: readonly StaticImportRecord[],
  ): string | undefined {
    for (const { specifier } of records) {
      if (specifier.startsWith('./') || specifier.startsWith('../')) return specifier;
    }
    return undefined;
  }

  // @cpt-begin:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-if-undeclared-specifier
  /**
   * Find every specifier of a surviving static import or re-export record
   * that is well-formed as a package module specifier and is NOT one of
   * `declaredNames`. Duplicates are reported once. Returns an empty array when
   * there is nothing to warn about.
   *
   * This function never throws for any input; a caller may use its result
   * only for diagnostics.
   */
  static findUndeclaredWellFormedSpecifiers(
    records: readonly StaticImportRecord[],
    declaredNames: ReadonlySet<string>,
  ): string[] {
    const found = new Set<string>();
    for (const { specifier } of records) {
      if (
        !declaredNames.has(specifier) &&
        SharedDepSpecifierScan.WELL_FORMED_MODULE_SPECIFIER_PATTERN.test(specifier)
      ) {
        found.add(specifier);
      }
    }
    return [...found];
  }
}
// @cpt-end:cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls:p1:inst-if-undeclared-specifier
