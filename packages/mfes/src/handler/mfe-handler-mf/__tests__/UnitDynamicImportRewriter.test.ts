/**
 * Mint-time rewrite of a shared unit's dynamic imports to the lazy-import
 * ABI: every literal and bounded-pattern call becomes a call naming the
 * calling unit, a fully opaque call stays as emitted
 * (`inst-lai-rewrite-shared-dynamic-imports`).
 */
import { describe, expect, it } from 'vitest';
import { DynamicImportScan } from '../../../unit-format/dynamic-import-scan';
import { UnitDynamicImportRewriter } from '../UnitDynamicImportRewriter';

const STUB = 'blob:stub';

const rewrite = (source: string, loaderUrl: () => string, caller: string): string =>
  UnitDynamicImportRewriter.rewrite(
    source,
    DynamicImportScan.scanCalls(source),
    loaderUrl,
    caller,
  );

describe('UnitDynamicImportRewriter', () => {
  it('rewrites a literal import to a call carrying the caller and the specifier', () => {
    const out = rewrite(
      "export const a = () => import('./a.js');",
      () => STUB,
      'pkg/index.js',
    );
    expect(out).toBe(
      'import{__frontx_lazy}from"blob:stub";\n' +
        'export const a = () => __frontx_lazy("rel:pkg/index.js\\n./a.js");',
    );
  });

  it('rewrites a bounded pattern to a call passing the runtime-computed path', () => {
    const out = rewrite(
      'export const p = (n) => import(`./l/${n}.js`);',
      () => STUB,
      'pkg/index.js',
    );
    expect(out).toContain('__frontx_lazy("rel:pkg/index.js\\n"+(`./l/${n}.js`))');
  });

  it('leaves a fully opaque import untouched and mints no stub for it', () => {
    let stubRequests = 0;
    const source = 'export const o = (x) => import(x);';
    const out = rewrite(
      source,
      () => {
        stubRequests += 1;
        return STUB;
      },
      'pkg/index.js',
    );
    expect(out).toBe(source);
    expect(stubRequests).toBe(0);
  });

  it('binds under a free alias when the unit already spells __frontx_lazy', () => {
    const out = rewrite(
      "const __frontx_lazy = 1; import('./a.js');",
      () => STUB,
      'p.js',
    );
    expect(out).toContain('import{__frontx_lazy as __frontx_lazy_1}');
    expect(out).toContain('__frontx_lazy_1("rel:p.js\\n./a.js")');
  });

  it('keeps an inner call verbatim inside a pattern substitution', () => {
    const out = rewrite(
      'import(`./l/${await import(v)}.js`);',
      () => STUB,
      'p.js',
    );
    expect(out).toContain('+(`./l/${await import(v)}.js`)');
  });

  it('splits an argument back into caller and path', () => {
    const argument = UnitDynamicImportRewriter.callerArgument('a/b.js', './c.js');
    expect(UnitDynamicImportRewriter.splitCallerArgument(argument)).toEqual({
      caller: 'a/b.js',
      path: './c.js',
    });
    expect(UnitDynamicImportRewriter.splitCallerArgument('./c.js')).toBeUndefined();
  });
});
