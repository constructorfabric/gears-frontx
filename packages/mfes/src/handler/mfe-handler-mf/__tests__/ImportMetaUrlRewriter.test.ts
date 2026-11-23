/**
 * `import.meta.url` of minted text becomes the file's resolved location,
 * found by token so a string or comment never changes
 * (`inst-rewrite-meta-url`).
 */
import { describe, expect, it } from 'vitest';
import { DynamicImportScan } from '../../../unit-format/dynamic-import-scan';
import { ImportMetaUrlRewriter } from '../ImportMetaUrlRewriter';
import { SourceSplice } from '../SourceSplice';

const FILE = 'https://cdn.test/pkg/dist/index.js';

const rewrite = (source: string): string =>
  SourceSplice.apply(
    source,
    ImportMetaUrlRewriter.edits(DynamicImportScan.scan(source).metaUrls, FILE),
  );

describe('ImportMetaUrlRewriter', () => {
  it('replaces the token sequence with the file URL as a string literal', () => {
    expect(rewrite('const u = new URL("../a.svg", import.meta.url);')).toBe(
      `const u = new URL("../a.svg", ${JSON.stringify(FILE)});`,
    );
  });

  it('makes a relative URL resolve against the unit location', () => {
    const out = rewrite('export const u = new URL("./a.svg", import.meta.url).href;');
    const literal = out.match(/new URL\("\.\/a\.svg", ("[^"]*")\)/)?.[1] as string;
    expect(new URL('./a.svg', JSON.parse(literal) as string).href).toBe(
      'https://cdn.test/pkg/dist/a.svg',
    );
    expect(JSON.parse(literal)).toBe(FILE);
  });

  it('handles spacing and an optional chain', () => {
    expect(rewrite('a = import . meta . url; b = import.meta?.url;')).toBe(
      `a = ${JSON.stringify(FILE)}; b = ${JSON.stringify(FILE)};`,
    );
  });

  it.each([
    'a = "import.meta.url";',
    "// import.meta.url\n",
    'a = import.meta.env;',
    'a = import.meta.urlx;',
    'a = o.import.meta.url;',
  ])('leaves %s as emitted', (source) => {
    expect(rewrite(source)).toBe(source);
  });
});
