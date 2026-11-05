import { describe, expect, it } from 'vitest';
import { EsmLinkageLayout } from './EsmLinkageLayout';

const lineCount = (text: string) => text.split('\n').length;

describe('EsmLinkageLayout', () => {
  it('rewrites a bundler-rendered barrel into plain re-exports, keeping its import lines', () => {
    const code = [
      '// src/index.ts',
      'import { a, b as local } from "./a.js";',
      'import {',
      '  c',
      '} from "./c.js";',
      'import def from "./d.js";',
      'import * as ns from "./ns.js";',
      'import { unused } from "./effects.js";',
      'export {',
      '  a,',
      '  c,',
      '  def as d,',
      '  local as b,',
      '  ns',
      '};',
      '//# sourceMappingURL=index.js.map',
    ].join('\n');

    const laidOut = EsmLinkageLayout.layout(code);

    expect(laidOut?.insertedLine).toBeUndefined();
    const out = laidOut?.code ?? '';
    // Import lines stay put; only the trailing export clause's lines go.
    expect(out.split('\n')[5]).toBe('export { default as d } from "./d.js";');
    expect(lineCount(out)).toBe(lineCount(code) - 6);
    expect(out).toContain('export { a, b } from "./a.js";');
    expect(out).toContain('export { c } from "./c.js";');
    expect(out).toContain('export { default as d } from "./d.js";');
    expect(out).toContain('export * as ns from "./ns.js";');
    expect(out).toContain('import "./effects.js";');
    expect(out).not.toMatch(/import \{|^export \{\s*$/m);
    expect(out.startsWith('// src/index.ts\n')).toBe(true);
    expect(out.trimEnd().endsWith('//# sourceMappingURL=index.js.map')).toBe(true);
  });

  it('leaves a module that is already plain re-exports alone', () => {
    expect(EsmLinkageLayout.layout('export { a } from "./a.js";\nexport * from "./b.js";\n')).toBeUndefined();
  });

  it('moves a defining module export clause above its body, after the imports', () => {
    const code = [
      '// src/x.ts',
      'import { y } from "./y.js";',
      'var s = "http://example.test/*";',
      'var X = class {',
      '  m() { return `${s}//${y}`; }',
      '};',
      'export {',
      '  X,',
      '  y as again',
      '};',
    ].join('\n');

    const laidOut = EsmLinkageLayout.layout(code);

    expect(laidOut?.insertedLine).toBe(2);
    const lines = (laidOut?.code ?? '').split('\n');
    expect(lines[1]).toBe('import { y } from "./y.js";');
    expect(lines[2]).toBe('export { X, y as again };');
    expect(lines[3]).toBe('var s = "http://example.test/*";');
    expect(lineCount(laidOut?.code ?? '')).toBe(lineCount(code) + 1);
    expect((laidOut?.code ?? '').match(/export \{/g)).toHaveLength(1);
  });

  it('keeps a directive prologue first when a module has no imports', () => {
    const laidOut = EsmLinkageLayout.layout("'use client';\nvar a = 1;\nexport {\n  a\n};\n");

    expect(laidOut?.code.startsWith("'use client';\nexport { a };\nvar a = 1;\n")).toBe(true);
    expect(laidOut?.insertedLine).toBe(1);
  });

  it('inserts at the top of a module with neither imports nor directives', () => {
    const laidOut = EsmLinkageLayout.layout('// src/c.ts\nvar c = 1;\nexport {\n  c\n};\n');

    expect(laidOut?.insertedLine).toBe(0);
    expect(laidOut?.code.startsWith('export { c };\n// src/c.ts\nvar c = 1;\n')).toBe(true);
  });

  it('leaves modules with no or several local export clauses, or already first, alone', () => {
    expect(EsmLinkageLayout.layout('var a = 1;\n')).toBeUndefined();
    expect(EsmLinkageLayout.layout('var a = 1;\nexport { a };\nexport { a as b };\n')).toBeUndefined();
    expect(EsmLinkageLayout.layout('import { y } from "./y.js";\nexport { z };\nvar z = y;\n')).toBeUndefined();
  });

  it('evaluates to the same exports after layout', async () => {
    const code = 'var s = "a//b";\nfunction f() { return s; }\nvar X = class {};\nexport {\n  X,\n  f as default,\n  s\n};\n';
    const laidOut = EsmLinkageLayout.layout(code)?.code ?? '';
    const load = (text: string) => import(`data:text/javascript,${encodeURIComponent(text)}`);
    const [before, after] = await Promise.all([load(code), load(laidOut)]);

    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    expect(after.s).toBe(before.s);
    expect(after.default()).toBe('a//b');
  });

  it('shifts a source map by one empty generated line', () => {
    const map = JSON.stringify({ version: 3, sources: ['a.ts'], mappings: 'AAAA;AACA;AACA', names: [] });

    expect(JSON.parse(EsmLinkageLayout.shiftSourceMap(map, 1)).mappings).toBe('AAAA;;AACA;AACA');
    expect(JSON.parse(EsmLinkageLayout.shiftSourceMap(map, 0)).mappings).toBe(';AAAA;AACA;AACA');
  });
});
