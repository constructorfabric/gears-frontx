/**
 * The scan reports a literal call and a statically bounded pattern call,
 * and nothing for a fully opaque `import(expr)` or text that only looks
 * like a call (`cpt-frontx-algo-mfe-loading-lazy-import-abi`,
 * `inst-lai-rewrite-shared-dynamic-imports`).
 */
import { describe, expect, it } from 'vitest';
import { DynamicImportScan, type DynamicImportCall } from '../dynamic-import-scan';

const scan = (source: string): DynamicImportCall[] =>
  DynamicImportScan.scanCalls(source);

const patternText = (source: string): string[] =>
  scan(source).flatMap((call) =>
    call.kind === 'pattern' ? [source.slice(call.argStart, call.argEnd)] : [],
  );

const specifiers = (source: string): string[] =>
  scan(source).flatMap((call) => (call.kind === 'literal' ? [call.specifier] : []));

describe('DynamicImportScan literal calls', () => {
  it('reads the specifier of a string literal', () => {
    expect(specifiers("import('./a.js'); import(\"./b.js\");")).toEqual([
      './a.js',
      './b.js',
    ]);
  });

  it('tolerates a second argument and a trailing comma and reads only the first', () => {
    const source =
      "import('./a.json', { with: { type: 'json' } });\nimport('./b.js',);\nimport('./c.js', {},);";
    const calls = scan(source);
    expect(calls.map((c) => (c.kind === 'literal' ? c.specifier : ''))).toEqual([
      './a.json',
      './b.js',
      './c.js',
    ]);
    expect(source[calls[0]!.closeParen]).toBe(')');
    expect(source.slice(calls[0]!.start, calls[0]!.closeParen + 1)).toBe(
      "import('./a.json', { with: { type: 'json' } })",
    );
  });

  it('decodes an escaped string literal to its runtime value', () => {
    expect(specifiers("import('./a\\u002ejs'); import('.\\/b.js'); import('./c\\x2ejs');")).toEqual([
      './a.js',
      './b.js',
      './c.js',
    ]);
  });

  it('leaves a literal with a legacy octal or malformed escape opaque', () => {
    expect(specifiers("import('./a\\1.js'); import('./b\\xZZ.js');")).toEqual([]);
  });

  it('leaves a concatenation, a plain expression and an unterminated call opaque', () => {
    expect(scan("import('./a' + x); import(x); import('./a.js'")).toEqual([]);
  });

  it('does not read a member call such as obj.import(x) as a dynamic import', () => {
    expect(scan("obj.import('./a.js'); obj. import('./b.js'); a\n.import('./c.js');")).toEqual([]);
  });

  it('ignores a call inside a string, comment, regex or template text', () => {
    const source =
      "const a = 'import(\"./a.js\")';\n// import('./b.js')\nconst r = /import('x')/;\nconst t = `import('./c.js')`;";
    expect(scan(source)).toEqual([]);
  });

  it('reads a call after a division that follows a closed template', () => {
    expect(specifiers("const x = `t` / 2; import('./a.js');")).toEqual(['./a.js']);
  });
});

describe('DynamicImportScan pattern calls', () => {
  it('reports a template literal with a fixed prefix and suffix', () => {
    const source = 'const p = (n) => import(`./locales/${n}.js`);';
    expect(patternText(source)).toEqual(['`./locales/${n}.js`']);
  });

  it('reports a pattern with only a prefix or only a suffix', () => {
    expect(patternText('import(`./a/${x}`)')).toEqual(['`./a/${x}`']);
    expect(patternText('import(`${x}.js`)')).toEqual(['`${x}.js`']);
  });

  it('reads past nested strings, templates and braces inside a substitution', () => {
    const source = "import(`./x/${a({ k: '}' }, `${b}`)}.js`)";
    expect(patternText(source)).toEqual(["`./x/${a({ k: '}' }, `${b}`)}.js`"]);
  });

  it('tracks brace depth inside a substitution so an object literal does not end it', () => {
    const source = "import(`./x/${ { a: 'k' }.a }.js`); import('./after.js');";
    expect(patternText(source)).toEqual(["`./x/${ { a: 'k' }.a }.js`"]);
    expect(specifiers(source)).toEqual(['./after.js']);
  });

  it('accepts escapes in the template text, which the runtime evaluates itself', () => {
    expect(patternText('import(`./a\\`/${x}.js`)')).toHaveLength(1);
  });

  it('tolerates import attributes and a trailing comma after a pattern', () => {
    const source = 'import(`./a/${x}.json`, { with: { type: "json" } },)';
    expect(patternText(source)).toHaveLength(1);
    expect(scan(source)[0]!.closeParen).toBe(source.length - 1);
  });

  it('leaves a template with no fixed text, with no substitution, or a plain expression opaque', () => {
    expect(scan('import(`${x}`)')).toEqual([]);
    expect(scan('import(`${x}${y}`)')).toEqual([]);
    expect(scan('import(x)')).toEqual([]);
  });

  it('reads a template with no substitution as a literal', () => {
    expect(specifiers('import(`./a.js`)')).toEqual(['./a.js']);
  });

  it('ignores a pattern call inside a string, comment or template text', () => {
    const source =
      "const a = 'import(`./a/${x}.js`)';\n// import(`./b/${y}.js`)\nconst t = `import(\\`./c/${z}.js\\`)`;";
    expect(scan(source)).toEqual([]);
  });

  it('reports literal and pattern calls together in source order, and a nested call inside a substitution', () => {
    const calls = scan(
      "import('./a.js'); import(`./b/${n}.js`); import(v); import(`./c/${await import('./d.js')}.js`);",
    );
    expect(calls.map((c) => c.kind)).toEqual(['literal', 'pattern', 'pattern', 'literal']);
  });
});
