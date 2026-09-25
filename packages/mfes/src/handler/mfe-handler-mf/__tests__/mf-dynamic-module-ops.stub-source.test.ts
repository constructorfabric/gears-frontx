/**
 * `buildLazyLoaderStubSource` — byte-identity + runtime-guard tests.
 *
 * This function lives in the audited trust kernel
 * (`mf-dynamic-module-ops.ts`), not on `MfeHandlerMF`, so the kernel stays
 * the sole site that ever writes dynamic-`import()` text (see ADR-0011 /
 * cpt-frontx-adr-mfe-load-isolation). The byte-identity test pins the exact
 * generated string so a future edit that alters the generated source
 * (whitespace, quoting, statement order) fails loudly here instead of only
 * manifesting as a runtime lazy-import bug.
 *
 * The scheme-check clause specifically (`u.startsWith(...)||...`) is NOT
 * hand-hardcoded in the expected string: it is built the same way
 * `buildLazyLoaderStubSource` itself builds it, from
 * `inlineContentSchemes()`. This is deliberate, not an oversight: deriving
 * the clause from `inlineContentSchemes()` rather than hardcoding
 * `"blob:"`/`"data:"` literals means a change to the scheme list cannot
 * leave this test's expectation stale, because both the production code
 * and this test draw the clause from the same source of truth. Every other
 * part of the generated string (the `__id` assignment, the `export const
 * __frontx_lazy=...` wrapper, the trailing `import(u)`) has no shared
 * source of truth to derive from, so it stays hardcoded — a deliberate
 * pin, not the same category of risk.
 */
import { describe, expect, it } from 'vitest';
import { buildLazyLoaderStubSource, inlineContentSchemes } from '../mf-dynamic-module-ops';

describe('buildLazyLoaderStubSource', () => {
  it('produces the exact stub source text for a given loader id', () => {
    const source = buildLazyLoaderStubSource('loader-42');
    const schemeCheck = inlineContentSchemes()
      .map((scheme) => `u.startsWith(${JSON.stringify(scheme)})`)
      .join('||');

    expect(source).toBe(
      `const __id=${JSON.stringify('loader-42')};\n` +
        `export const __frontx_lazy=async(p)=>{` +
        `const u=await globalThis.__FRONTX_LAZY__.resolve(__id,p);` +
        `if(!(${schemeCheck}))throw new TypeError('__frontx_lazy resolved a non-inline-content URL: '+u);` +
        `return import(u);` +
        `};\n`,
    );
  });

  it('generates one startsWith(...) clause per scheme in inlineContentSchemes(), in order — proving the guard is DERIVED, not a second hand-copy', () => {
    const source = buildLazyLoaderStubSource('loader-derived');
    const schemes = inlineContentSchemes();

    // No hand-maintained expectation of what the schemes ARE: this asserts
    // the generated text matches whatever the shared list currently says,
    // so a future change to that list (adding/removing/renaming a scheme)
    // is automatically reflected here rather than requiring this test to be
    // separately updated — the two are structurally the same source of
    // truth, not independently maintained copies.
    const expectedClause = schemes.map((scheme) => `u.startsWith(${JSON.stringify(scheme)})`).join('||');
    expect(source).toContain(`if(!(${expectedClause}))throw`);

    // Sanity: the list is non-empty and every scheme is a `<name>:` form,
    // so this test cannot vacuously pass against an empty/degenerate list.
    expect(schemes.length).toBeGreaterThan(0);
    for (const scheme of schemes) {
      expect(scheme).toMatch(/^[a-z]+:$/);
    }
  });

  it('JSON-stringifies the loader id, escaping characters that could break out of the string literal', () => {
    const source = buildLazyLoaderStubSource('a"b\\c');

    expect(source).toContain(`const __id=${JSON.stringify('a"b\\c')};`);
    // No unescaped quote reaches the emitted literal.
    expect(source).not.toContain('__id="a"b');
  });

  it('the generated stub rejects a resolved URL that is not blob:/data: at runtime', async () => {
    const source = buildLazyLoaderStubSource('loader-guard');

    // Execute the EXACT generated body (not a re-implementation of it) via
    // the Function constructor rather than `import()`-ing it as a real ES
    // module: dynamic `import()` of a `blob:`/`data:` URL is unsupported
    // under vitest's jsdom module loader (see the identical constraint
    // documented in MfeHandlerMF.test.ts's `blobModuleStub`), and this test
    // does not need real module evaluation — only that the runtime guard
    // throws before the trailing `import(u)` statement is ever reached.
    // Swapping `export const __frontx_lazy=` for `return ` turns the same
    // source text into a function body the Function constructor accepts,
    // with no change to the logic between the assignment and the closing
    // `;`.
    const asFunctionBody = source.replace('export const __frontx_lazy=', 'return ');
    const factory = new Function(asFunctionBody) as () => (
      p: string,
    ) => Promise<unknown>;
    const frontxLazy = factory();

    const originalRegistry = (globalThis as Record<string, unknown>).__FRONTX_LAZY__;
    (globalThis as Record<string, unknown>).__FRONTX_LAZY__ = {
      resolve: async () => 'https://example.com/evil.js',
    };
    try {
      await expect(frontxLazy('./whatever')).rejects.toThrow(/non-inline-content URL/);
    } finally {
      (globalThis as Record<string, unknown>).__FRONTX_LAZY__ = originalRegistry;
    }
  });
});
