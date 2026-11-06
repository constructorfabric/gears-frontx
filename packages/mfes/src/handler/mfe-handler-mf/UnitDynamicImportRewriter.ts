/**
 * Mint-time rewrite of literal dynamic `import('<specifier>')` calls in
 * shared-dependency unit source.
 *
 * A unit MAY carry a dynamic `import(...)` (the contract no longer bans
 * it): each literal call whose specifier resolves to a unit — a relative
 * module of the same package or a shared package/subpath — is rewritten
 * to `__frontx_lazy('<token>')`, the same lazy-import ABI the compiled
 * chunk path uses (ADR-0022). The token routes through the per-load
 * resolver registered in `LazyLoaderRegistry`, which fetches, verifies
 * and mints the target unit on demand and returns its blob URL to the
 * generated loader stub's guarded `import(u)` — keeping the trust
 * kernel (`mf-dynamic-module-ops.ts`) the sole site that ever writes
 * dynamic-import text or executes one.
 *
 * Call sites are located by the comment/string/template-aware
 * `DynamicImportScan`, so an `import(` inside a string, comment,
 * template text or regex is never touched, and a non-literal call such
 * as `import(someVariable)` — the trust kernel's own `import(blobUrl)`
 * shape — is left exactly as emitted. When at least one call is
 * rewritten, the `__frontx_lazy` binding is imported from the per-load
 * loader stub via a line prepended to the source — under a local alias
 * when the unit already spells `__frontx_lazy`, so the injected binding
 * never collides with one of the unit's own identifiers; the stub URL is
 * requested lazily so a unit without dynamic imports mints no stub.
 *
 * One class per file (`runtime_style`).
 *
 * @packageDocumentation
 * @internal
 */

import { DynamicImportScan } from '../../unit-format/dynamic-import-scan';

export class UnitDynamicImportRewriter {
  /** The loader stub's exported lazy-import binding (ADR-0022). */
  private static readonly ABI_NAME = '__frontx_lazy';

  protected constructor() {}

  /**
   * Rewrite every resolvable literal `import('<specifier>')` in `source`.
   *
   * `tokenFor` maps a literal specifier to the resolver token the
   * rewritten call passes to `__frontx_lazy`, or returns `undefined` to
   * leave the call untouched (a specifier naming no reachable unit).
   * `loaderUrl` supplies the per-load loader-stub blob URL; it is
   * invoked only when at least one call is rewritten, so the stub is
   * minted on first use and never for a unit without dynamic imports.
   */
  static rewrite(
    source: string,
    loaderUrl: () => string,
    tokenFor: (specifier: string) => string | undefined,
  ): string {
    let out = source;
    let rewroteAny = false;
    const local = UnitDynamicImportRewriter.localBindingName(source);
    // Back to front so earlier replacements never shift a later site's
    // recorded offsets.
    for (const call of DynamicImportScan.literalCalls(source).reverse()) {
      const token = tokenFor(call.specifier);
      if (token === undefined) continue;
      out =
        out.slice(0, call.start) +
        `${local}(${JSON.stringify(token)})` +
        out.slice(call.closeParen + 1);
      rewroteAny = true;
    }
    if (rewroteAny) {
      const binding =
        local === UnitDynamicImportRewriter.ABI_NAME
          ? local
          : `${UnitDynamicImportRewriter.ABI_NAME} as ${local}`;
      out = `import{${binding}}from${JSON.stringify(loaderUrl())};\n${out}`;
    }
    return out;
  }

  /**
   * A local name for the imported ABI binding that collides with no
   * identifier in `source`: `__frontx_lazy` itself when the unit never
   * spells it, else the first free `__frontx_lazy_<n>`. The check is
   * deliberately conservative — any whole-identifier occurrence counts,
   * even inside a string or comment — since an over-avoided name costs
   * nothing while a shadowed or redeclared one breaks the module.
   */
  private static localBindingName(source: string): string {
    // Every whole-identifier `__frontx_lazy` / `__frontx_lazy_<n>` the
    // unit spells (an identifier character on either side means a longer,
    // unrelated identifier).
    const taken = new Set<string>();
    for (const match of source.matchAll(
      /(?<![\w$\u0080-\uffff])__frontx_lazy(?:_\d+)?(?![\w$\u0080-\uffff])/g,
    )) {
      taken.add(match[0]);
    }
    const base = UnitDynamicImportRewriter.ABI_NAME;
    if (!taken.has(base)) return base;
    for (let n = 1; ; n++) {
      const candidate = `${base}_${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  }
}
