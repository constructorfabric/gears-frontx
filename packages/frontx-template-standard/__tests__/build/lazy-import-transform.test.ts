// @vitest-environment node

/**
 * Tests for the lazy-import AST transform half of ADR-0022
 * (`cpt-frontx-dod-mfe-isolation-lazy-import-abi`).
 *
 * The transform is a pure function (string in → string out) that rewrites
 * dynamic `import('<rel>')` calls to `__frontx_lazy('<rel>')` in compiled MFE
 * chunks. Tests verify shape coverage (string literal, template literal,
 * concatenation), build-time error on non-static patterns, and no-op fast
 * path when the chunk has no dynamic imports.
 */
// @cpt-FEATURE:frontx-mf-gts-plugin:p1
// @cpt-dod:cpt-frontx-dod-mfe-isolation-lazy-import-abi:p1

import { describe, it, expect } from 'vitest';
import { parse as acornParse } from 'acorn';
import { transformLazyImports } from '../../src/build/mf-gts';

function parse(code: string): unknown {
  return acornParse(code, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  });
}

function neverError(message: string): never {
  throw new Error(`unexpected build-time error: ${message}`);
}

describe('transformLazyImports (ADR-0022 plugin half)', () => {
  it('rewrites string-literal dynamic import to __frontx_lazy', () => {
    const code = `const x = import('./X.js');`;
    const result = transformLazyImports(code, parse, neverError, 'chunk.js');
    expect(result).not.toBeNull();
    expect(result!.code).toBe(`const x = __frontx_lazy('./X.js');`);
    expect(result!.count).toBe(1);
  });

  it('rewrites constant template-literal dynamic import', () => {
    const code = 'const x = import(`./X.js`);';
    const result = transformLazyImports(code, parse, neverError, 'chunk.js');
    expect(result).not.toBeNull();
    expect(result!.code).toBe('const x = __frontx_lazy(`./X.js`);');
    expect(result!.count).toBe(1);
  });

  it('rewrites multiple dynamic imports in a single chunk', () => {
    const code = [
      `const a = import('./A.js');`,
      `const b = import('./B.js');`,
      `const c = import('./C.js');`,
    ].join('\n');
    const result = transformLazyImports(code, parse, neverError, 'chunk.js');
    expect(result).not.toBeNull();
    expect(result!.count).toBe(3);
    expect(result!.code).toContain(`__frontx_lazy('./A.js')`);
    expect(result!.code).toContain(`__frontx_lazy('./B.js')`);
    expect(result!.code).toContain(`__frontx_lazy('./C.js')`);
    expect(result!.code).not.toContain(`import('./A.js')`);
  });

  it('returns null when the chunk has no dynamic imports (fast skip)', () => {
    const code = `export const foo = 1;\nimport { x } from './static.js';`;
    const result = transformLazyImports(code, parse, neverError, 'chunk.js');
    expect(result).toBeNull();
  });

  it('emits a build-time error for non-statically-resolvable dynamic imports', () => {
    const code = `const x = import(somePath);`;
    let captured: string | undefined;
    expect(() =>
      transformLazyImports(
        code,
        parse,
        (message: string) => {
          captured = message;
          throw new Error('build-time-error');
        },
        'bad-chunk.js'
      )
    ).toThrow('build-time-error');
    expect(captured).toBeDefined();
    expect(captured).toMatch(/Non-statically-resolvable dynamic import/);
    expect(captured).toContain('bad-chunk.js');
  });

  it('leaves static `import {x} from "./Y"` declarations alone', () => {
    const code = [
      `import { y } from './Y.js';`,
      `const lazy = import('./Z.js');`,
    ].join('\n');
    const result = transformLazyImports(code, parse, neverError, 'chunk.js');
    expect(result).not.toBeNull();
    expect(result!.code).toContain(`import { y } from './Y.js';`);
    expect(result!.code).toContain(`__frontx_lazy('./Z.js')`);
    expect(result!.count).toBe(1);
  });

  it('rewrites constant string-concatenation paths', () => {
    const code = `const x = import('./' + 'X' + '.js');`;
    const result = transformLazyImports(code, parse, neverError, 'chunk.js');
    expect(result).not.toBeNull();
    expect(result!.code).toBe(`const x = __frontx_lazy('./' + 'X' + '.js');`);
    expect(result!.count).toBe(1);
  });

  it('is idempotent — running the transform on its own output is a no-op', () => {
    const code = `const x = import('./X.js');`;
    const first = transformLazyImports(code, parse, neverError, 'chunk.js');
    expect(first).not.toBeNull();
    const second = transformLazyImports(first!.code, parse, neverError, 'chunk.js');
    expect(second).toBeNull();
  });
});
