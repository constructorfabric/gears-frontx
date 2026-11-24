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
 * Call sites arrive as the comment/string/template-aware
 * `DynamicImportScan`'s records, so an `import(` inside a string, comment,
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

import type { DynamicImportCall } from '../../unit-format/dynamic-import-scan';
import { SourceSplice, type SourceEdit } from './SourceSplice';

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
   * `source` with the edits applied and every literal and bounded pattern
   * dynamic import of `calls` rewritten for the unit located at `caller`,
   * all in one splice over the original offsets. `loaderUrl` supplies the
   * per-load loader-stub blob URL; it is invoked only when at least one
   * call is rewritten, so the stub is minted on first use and never for a
   * unit without dynamic imports.
   */
  static rewrite(
    source: string,
    calls: readonly DynamicImportCall[],
    loaderUrl: () => string,
    caller: string,
    edits: readonly SourceEdit[] = [],
  ): string {
    if (calls.length === 0) return SourceSplice.apply(source, edits);
    const local = UnitDynamicImportRewriter.freeName(
      source,
      UnitDynamicImportRewriter.ABI_NAME,
    );
    const rewritten = SourceSplice.apply(source, [
      ...edits,
      ...UnitDynamicImportRewriter.callEdits(calls, local, caller),
    ]);
    const binding =
      local === UnitDynamicImportRewriter.ABI_NAME
        ? local
        : `${UnitDynamicImportRewriter.ABI_NAME} as ${local}`;
    return `import{${binding}}from${JSON.stringify(loaderUrl())};\n${rewritten}`;
  }

  /**
   * The edits that rewrite every literal and bounded pattern dynamic
   * import of `calls` to a call of `local`, without importing the binding.
   * With a `caller` the call's argument names it (the form
   * {@link callerArgument} builds); without one the argument is the bare
   * path, for a chunk whose binding already tags its calls with the
   * chunk's own location. A pattern call keeps its template verbatim, so
   * an edit inside the template still applies; its discarded tail
   * (attributes) is replaced with the closing parentheses.
   */
  static callEdits(
    calls: readonly DynamicImportCall[],
    local: string,
    caller?: string,
  ): SourceEdit[] {
    const prefix =
      caller === undefined
        ? undefined
        : JSON.stringify(UnitDynamicImportRewriter.callerPrefix(caller));
    const edits: SourceEdit[] = [];
    // Source order, dropping a call nested inside the text an earlier
    // call's replacement discards: all of a literal call, the attribute
    // tail of a pattern call. A call inside a pattern's template stays
    // in the kept text, so it is rewritten too.
    let discardedFrom = -1;
    let discardedTo = -1;
    for (const call of calls) {
      if (call.start >= discardedFrom && call.start < discardedTo) continue;
      if (call.kind === 'literal') {
        discardedFrom = call.start;
        discardedTo = call.closeParen + 1;
      } else {
        discardedFrom = call.argEnd;
        discardedTo = call.closeParen + 1;
      }
      if (call.kind === 'literal') {
        const argument = JSON.stringify(
          caller === undefined
            ? call.specifier
            : UnitDynamicImportRewriter.callerArgument(caller, call.specifier),
        );
        edits.push({
          start: call.start,
          end: call.closeParen + 1,
          text: `${local}(${argument})`,
        });
      } else {
        edits.push(
          {
            start: call.start,
            end: call.argStart,
            text: prefix === undefined ? `${local}(` : `${local}(${prefix}+(`,
          },
          {
            start: call.argEnd,
            end: call.closeParen + 1,
            text: prefix === undefined ? ')' : '))',
          },
        );
      }
    }
    return edits;
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
