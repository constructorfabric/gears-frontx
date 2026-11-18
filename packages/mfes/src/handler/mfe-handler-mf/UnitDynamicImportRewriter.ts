/**
 * Mint-time rewrite of the dynamic imports in shared-unit source — a list
 * item or a whole-package entry — to the lazy-import ABI
 * (`cpt-frontx-algo-mfe-loading-lazy-import-abi`, `inst-lai-rewrite-shared-dynamic-imports`).
 *
 * Every literal `import('<specifier>')` and every statically bounded
 * pattern `import(`prefix${expr}suffix`)` becomes a `__frontx_lazy` call
 * whose argument names the calling unit and the requested path, so the
 * per-load resolver resolves the path against the base the calling unit
 * resolves against and finds the target's fetch list or whole-package
 * graph at run time (ADR-0022). A literal passes its specifier; a pattern
 * passes its runtime-computed path. The unit's fetched and cached bytes
 * are never touched. A fully opaque `import(expr)` — neither a literal
 * nor a bounded pattern — is left exactly as emitted, native and outside
 * the load's isolated graph.
 *
 * Call sites are located by the comment/string/template-aware
 * `DynamicImportScan`, so an `import(` inside a string, comment,
 * template text or regex is never touched; the trust kernel's own
 * `import(blobUrl)` shape is a non-literal call and stays as emitted.
 * When at least one call is rewritten, the `__frontx_lazy` binding is
 * imported from the per-load loader stub via a line prepended to the
 * source — under a local alias when the unit already spells
 * `__frontx_lazy`, so the injected binding never collides with one of the
 * unit's own identifiers; the stub URL is requested lazily so a unit
 * without dynamic imports mints no stub.
 *
 * One class per file (`runtime_style`).
 *
 * @packageDocumentation
 * @internal
 */

import { DynamicImportScan, type DynamicImportCall } from '../../unit-format/dynamic-import-scan';

export class UnitDynamicImportRewriter {
  /** The loader stub's exported lazy-import binding (ADR-0022). */
  private static readonly ABI_NAME = '__frontx_lazy';

  protected constructor() {}

  /**
   * The argument a rewritten call passes for a path requested by the unit
   * `caller`: the caller's location (against the base it resolves against)
   * and the path, which the resolver splits apart again.
   */
  static callerArgument(caller: string, path: string): string {
    return `${UnitDynamicImportRewriter.callerPrefix(caller)}${path}`;
  }

  /** The caller-naming prefix of a rewritten call's argument. */
  private static callerPrefix(caller: string): string {
    return `rel:${caller}\n`;
  }

  /**
   * Split an argument built by {@link callerArgument} back into the
   * calling unit's location and the requested path; `undefined` for an
   * argument that does not carry the prefix.
   */
  static splitCallerArgument(
    argument: string,
  ): { caller: string; path: string } | undefined {
    if (!argument.startsWith('rel:')) return undefined;
    const newline = argument.indexOf('\n');
    if (newline < 0) return undefined;
    return {
      caller: argument.slice('rel:'.length, newline),
      path: argument.slice(newline + 1),
    };
  }

  /**
   * Rewrite every literal and every bounded pattern dynamic import in
   * `source` for the unit located at `caller`. `loaderUrl` supplies the
   * per-load loader-stub blob URL; it is invoked only when at least one
   * call is rewritten, so the stub is minted on first use and never for a
   * unit without dynamic imports.
   */
  static rewrite(
    source: string,
    loaderUrl: () => string,
    caller: string,
  ): string {
    const local = UnitDynamicImportRewriter.localBindingName(source);
    const rewritten = UnitDynamicImportRewriter.rewriteCalls(source, local, caller);
    if (rewritten === source) return source;
    const binding =
      local === UnitDynamicImportRewriter.ABI_NAME
        ? local
        : `${UnitDynamicImportRewriter.ABI_NAME} as ${local}`;
    return `import{${binding}}from${JSON.stringify(loaderUrl())};\n${rewritten}`;
  }

  /**
   * Rewrite every literal and bounded pattern dynamic import in `source`
   * to a call of `local`, without importing the binding. With a `caller`
   * the call's argument names it (the form {@link callerArgument}
   * builds); without one the argument is the bare path, for a chunk whose
   * binding already tags its calls with the chunk's own location.
   */
  static rewriteCalls(source: string, local: string, caller?: string): string {
    const prefix =
      caller === undefined
        ? undefined
        : JSON.stringify(UnitDynamicImportRewriter.callerPrefix(caller));
    // Source order, dropping a call nested inside an earlier call's span:
    // the outer replacement keeps the inner text verbatim.
    const selected: DynamicImportCall[] = [];
    let lastEnd = -1;
    for (const call of DynamicImportScan.scanCalls(source)) {
      if (call.start < lastEnd) continue;
      selected.push(call);
      lastEnd = call.closeParen + 1;
    }
    let out = source;
    // Back to front so earlier replacements never shift a later site's
    // recorded offsets.
    for (const call of selected.reverse()) {
      const template =
        call.kind === 'pattern' ? source.slice(call.argStart, call.argEnd) : '';
      let argument: string;
      if (call.kind === 'literal') {
        argument = JSON.stringify(
          caller === undefined
            ? call.specifier
            : UnitDynamicImportRewriter.callerArgument(caller, call.specifier),
        );
      } else {
        argument = prefix === undefined ? template : `${prefix}+(${template})`;
      }
      out =
        out.slice(0, call.start) +
        `${local}(${argument})` +
        out.slice(call.closeParen + 1);
    }
    return out;
  }

  /**
   * The lines that give a compiled chunk of this load its `__frontx_lazy`
   * binding: the per-load loader stub imported under a name no identifier
   * of the chunk spells, and a `__frontx_lazy` function that tags every
   * call with the chunk's own `caller` location, so the resolver resolves
   * the path against the base that chunk resolves against.
   */
  static callerBinding(source: string, stubUrl: string, caller: string): string {
    const stub = UnitDynamicImportRewriter.freeName(source, '__frontx_lazy_stub');
    const tag = JSON.stringify(UnitDynamicImportRewriter.callerPrefix(caller));
    return (
      `import{${UnitDynamicImportRewriter.ABI_NAME} as ${stub}}from${JSON.stringify(stubUrl)};\n` +
      `const ${UnitDynamicImportRewriter.ABI_NAME}=(p)=>${stub}(${tag}+p);\n`
    );
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
    return UnitDynamicImportRewriter.freeName(
      source,
      UnitDynamicImportRewriter.ABI_NAME,
    );
  }

  /**
   * `base` itself when the unit never spells it, else the first free
   * `<base>_<n>`.
   */
  private static freeName(source: string, base: string): string {
    // Every whole-identifier `<base>` / `<base>_<n>` the unit spells (an
    // identifier character on either side means a longer, unrelated
    // identifier).
    const taken = new Set<string>();
    for (const match of source.matchAll(
      /(?<![\w$\u0080-\uffff])__frontx_lazy(?:_stub)?(?:_\d+)?(?![\w$\u0080-\uffff])/g,
    )) {
      taken.add(match[0]);
    }
    if (!taken.has(base)) return base;
    for (let n = 1; ; n++) {
      const candidate = `${base}_${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  }
}
