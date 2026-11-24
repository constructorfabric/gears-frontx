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

describe('DynamicImportScan pattern text with a regex literal', () => {
  it('reports a pattern call whose substitution holds a regex with a `//` inside', () => {
    const source = 'import(`./l/${p.replace(/\\.\\.\\//g,"")}.js`);';
    expect(patternText(source)).toEqual(['`./l/${p.replace(/\\.\\.\\//g,"")}.js`']);
  });

  it('reads a `/` after an operand inside a substitution as division', () => {
    const source = 'import(`./l/${a / b / c}.js`); import("./x.js");';
    expect(scan(source)).toHaveLength(2);
  });
});

describe('DynamicImportScan regex and division', () => {
  it('reads a `/` after a postfix ++ or -- as division', () => {
    expect(specifiers('let n = i++ / 2; import("./a.js"); /* a / b */')).toEqual(['./a.js']);
    expect(specifiers('let n = i-- / 2 / 3; import("./a.js"); // x / y')).toEqual(['./a.js']);
  });

  it('reads a `/` after a prefix ++ or -- operand list as a regex opener', () => {
    expect(scan('x = ++/import("./fake.js")/.lastIndex;')).toEqual([]);
  });

  it.each([
    'typeof',
    'void',
    'delete',
    'in',
    'instanceof',
    'else',
    'case',
    'do',
    'throw',
    'new',
    'yield',
    'await',
    'return',
  ])('reads a `/` after the keyword %s as a regex', (keyword) => {
    expect(scan(`${keyword} /import("./fake.js")/.test(s);`)).toEqual([]);
  });

  it('reads a `/` after `of` inside a for head as a regex', () => {
    expect(scan('for (const m of /import("./fake.js")/g.exec(s)) {}')).toEqual([]);
  });

  it('reads a `/` after `of` and after the head of a `for await` as a regex', () => {
    expect(
      specifiers("for await (const x of /'/g.exec(y)) {} import('./b.js');"),
    ).toEqual(['./b.js']);
    expect(
      specifiers('for await (const x of xs) /import("fake")/.test(s); import("./c.js");'),
    ).toEqual(['./c.js']);
  });

  it('reads `of` outside a for head as an identifier, so a following `/` divides', () => {
    expect(specifiers('let a = of / 2 / 3; import("./a.js");')).toEqual(['./a.js']);
    expect(specifiers('for (const x of xs) { y = of / 2; import("./b.js"); }')).toEqual(['./b.js']);
    expect(specifiers('for (const x of f(of / 2)) {} import("./c.js");')).toEqual(['./c.js']);
  });

  it('reads a `/` after the closing paren of an if, while, for or with head as a regex', () => {
    for (const head of ['if (a)', 'while (a)', 'for (;;)', 'with (o)']) {
      expect(scan(`${head} /import("./fake.js")/.test(s);`)).toEqual([]);
    }
  });

  it('reads a `/` after any other closing paren or a member named like a keyword as division', () => {
    expect(specifiers('f(1) / 2; import("./a.js"); // /')).toEqual(['./a.js']);
    expect(specifiers('x = o.in / 2; import("./a.js"); // /')).toEqual(['./a.js']);
    expect(specifiers('x = (if_ / 2); import("./a.js"); // /')).toEqual(['./a.js']);
  });
});

describe('DynamicImportScan static imports', () => {
  const imports = (source: string): string[] =>
    DynamicImportScan.scanImports(source).map((record) => record.specifier);

  it('reads every static import and re-export form', () => {
    const source = [
      'import "side";',
      'import d from "def";',
      'import {a, b as c} from "named";',
      "import * as ns from 'star';",
      'import d2, {e} from "both";',
      'export * from "all";',
      'export * as ns2 from "all-ns";',
      'export {f, g as h} from "re";',
      'export{i}from"tight";',
    ].join('\n');
    expect(imports(source)).toEqual([
      'side',
      'def',
      'named',
      'star',
      'both',
      'all',
      'all-ns',
      're',
      'tight',
    ]);
  });

  it('reads a specifier separated from its keyword by a newline or comments', () => {
    expect(imports('import\n"nl";')).toEqual(['nl']);
    expect(imports('import {\n  a,\n  b\n}\nfrom\n"multi";')).toEqual(['multi']);
    expect(imports('import /* c */ "c1"; export * /* c */ from // c\n "c2";')).toEqual([
      'c1',
      'c2',
    ]);
  });

  it('reports the literal quotes and bounds of the specifier', () => {
    const source = "import x from 'abc';";
    const [record] = DynamicImportScan.scanImports(source);
    expect(source.slice(record.start, record.end)).toBe("'abc'");
    expect(record.kind).toBe('import');
  });

  it.each([
    'export const NAME="react";',
    'export function f(x){return x==="react"}',
    'export default function(){return"react"}',
    ';import("react")',
    '}import("react")',
    'const s = "from \\"react\\""; const t = \'import "react"\';',
    '// import "react"\n/* export * from "react" */',
    'const t = `import "react" from "react"`;',
    'x = import.meta.url + "react";',
    'o.import("react"); o.export("react");',
    'export {a}\nconst b = "react";',
  ])('reports no specifier for text that only looks like an import: %s', (source) => {
    expect(imports(source)).toEqual([]);
  });

  it('reads a static import that follows an export declaration', () => {
    expect(imports('export const a = 1;\nimport "x";')).toEqual(['x']);
  });
});

describe('DynamicImportScan — import.meta.url records and private members', () => {
  const metaTexts = (source: string): string[] =>
    DynamicImportScan.scan(source).metaUrls.map((r) => source.slice(r.start, r.end));

  it('records the token sequence, spaced, commented or optional-chained', () => {
    expect(metaTexts('a = import.meta.url;')).toEqual(['import.meta.url']);
    expect(metaTexts('a = import . meta . url;')).toEqual(['import . meta . url']);
    expect(metaTexts('a = import /*x*/ .meta\n.url;')).toEqual(['import /*x*/ .meta\n.url']);
    expect(metaTexts('a = import.meta?.url;')).toEqual(['import.meta?.url']);
    expect(metaTexts('a = `${import.meta.url}x`;')).toEqual(['import.meta.url']);
  });

  it.each([
    'a = import.meta.env;',
    'a = import.meta.urlx;',
    'a = import.meta.xurl;',
    'a = o.import.meta.url;',
    'a = "import.meta.url";',
    "a = 'import.meta.url';",
    'a = `import.meta.url`;',
    '// import.meta.url\n/* import.meta.url */',
    'a = /import.meta.url/.test(b);',
    'a = import.metaurl;',
  ])('records nothing for %s', (source) => {
    expect(metaTexts(source)).toEqual([]);
  });

  it('keeps a member in force across a private-name #', () => {
    expect(scan('o.#import("x");')).toEqual([]);
    expect(DynamicImportScan.scanImports('o.#import "x";')).toEqual([]);
    expect(metaTexts('o.#import.meta.url;')).toEqual([]);
  });

  it('reports every record kind from one walk', () => {
    const source = 'import "a"; const u = import.meta.url; const m = import("b");';
    const result = DynamicImportScan.scan(source);
    expect(result.imports.map((r) => r.specifier)).toEqual(['a']);
    expect(result.metaUrls).toHaveLength(1);
    expect(result.calls).toHaveLength(1);
  });
});
