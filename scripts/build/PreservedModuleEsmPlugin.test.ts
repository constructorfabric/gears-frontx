import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, type Plugin } from 'esbuild';
import { afterEach, describe, expect, it } from 'vitest';
import { PreservedModuleEsmPlugin } from './PreservedModuleEsmPlugin';

const roots: string[] = [];

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'preserved-module-esm-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

function listJs(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return listJs(path.join(dir, entry.name), relative);
    return entry.name.endsWith('.js') ? [relative] : [];
  });
}

async function buildFixture(
  root: string,
  format: 'esm' | 'cjs',
  entryPoints: Record<string, string>,
  sourcemap = false,
) {
  return build({
    sourcemap,
    absWorkingDir: root,
    entryPoints,
    bundle: true,
    format,
    platform: 'neutral',
    packages: 'external',
    outdir: path.join(root, 'dist'),
    outExtension: { '.js': format === 'esm' ? '.js' : '.cjs' },
    logLevel: 'silent',
    plugins: [new PreservedModuleEsmPlugin().toEsbuildPlugin() as unknown as Plugin],
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('PreservedModuleEsmPlugin', () => {
  const sources = {
    'src/index.ts': "export { a } from './a';\nexport { b } from './nested/b.js';\nexport type { T } from './types';\n",
    'src/a.ts': "import { b } from './nested/b';\nexport const a = () => b() + 1;\n",
    'src/nested/b.ts': "import { c } from '../contract';\nexport const b = () => c;\n",
    'src/types.ts': 'export type T = number;\n',
    'src/contract/index.ts': "export { c } from './c';\n",
    'src/contract/c.ts': "import { x } from 'some-package/sub';\nexport const c = x;\n",
    'src/unreached.ts': 'export const unreached = 1;\n',
  };

  it('emits one ESM file per reachable source module with relative .js imports', async () => {
    const root = fixture(sources);
    await buildFixture(root, 'esm', { index: 'src/index.ts', contract: 'src/contract/index.ts' });

    expect(listJs(path.join(root, 'dist')).sort()).toEqual(
      ['a.js', 'contract.js', 'contract/c.js', 'index.js', 'nested/b.js'].sort(),
    );
    const read = (file: string) => readFileSync(path.join(root, 'dist', file), 'utf8');
    expect(read('index.js')).toContain('from "./a.js"');
    expect(read('index.js')).toContain('from "./nested/b.js"');
    expect(read('a.js')).toContain('from "./nested/b.js"');
    // A public entry keeps its name; an import of it targets that name.
    expect(read('nested/b.js')).toContain('from "../contract.js"');
    expect(read('contract.js')).toContain('from "./contract/c.js"');
    expect(read('contract/c.js')).toContain('from "some-package/sub"');
  });

  it('lays out linkage first: barrels as plain re-exports, export clauses before bodies', async () => {
    const root = fixture({
      'src/index.ts': "export { a } from './a';\nexport { B, b } from './nested/b';\nexport * from './star';\n",
      'src/a.ts': "import { b } from './nested/b';\nconst url = 'http://example.test/';\nexport const a = () => `${url}${b()}`;\n",
      'src/nested/b.ts': 'export class B {}\nexport function b() { return 2; }\n',
      'src/star.ts': "export const s = '/*';\n",
    });
    await buildFixture(root, 'esm', { index: 'src/index.ts' }, true);
    const read = (file: string) => readFileSync(path.join(root, 'dist', file), 'utf8');

    const barrelStatements = read('index.js')
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.trim().startsWith('//'));
    expect(barrelStatements).toEqual([
      'export { a } from "./a.js";',
      'export { B, b } from "./nested/b.js";',
      'export * from "./star.js";',
    ]);
    const defining = read('a.js');
    expect(defining.indexOf('export { a };')).toBeGreaterThan(defining.indexOf('from "./nested/b.js"'));
    expect(defining.indexOf('export { a };')).toBeLessThan(defining.indexOf('var url'));
    const sourceMap = JSON.parse(read('a.js.map')) as { mappings: string };
    expect(sourceMap.mappings.split(';').length).toBeLessThanOrEqual(defining.split('\n').length);

    const loaded = await import(pathToFileURL(path.join(root, 'dist', 'index.js')).href);
    expect(loaded.a()).toBe('http://example.test/2');
    expect(loaded.s).toBe('/*');
    expect(new loaded.B()).toBeInstanceOf(loaded.B);
  });

  it('leaves the CJS build bundled', async () => {
    const root = fixture(sources);
    await buildFixture(root, 'cjs', { index: 'src/index.ts' });

    expect(readdirSync(path.join(root, 'dist'))).toEqual(['index.cjs']);
  });

  it('fails when one inlined input would be copied into two modules', async () => {
    const root = fixture({
      'src/index.ts': "export { a } from './a';\nexport { b } from './b';\n",
      'src/a.ts': "import data from '../data.json';\nexport const a = data.v;\n",
      'src/b.ts': "import data from '../data.json';\nexport const b = data.v;\n",
      'data.json': '{ "v": 1 }',
    });

    await expect(buildFixture(root, 'esm', { index: 'src/index.ts' })).rejects.toThrow(
      /would inline data\.json into 2 modules/,
    );
  });

  it('fails on a relative import that resolves to nothing', async () => {
    const root = fixture({ 'src/index.ts': "export * from './missing';\n" });

    await expect(buildFixture(root, 'esm', { index: 'src/index.ts' })).rejects.toThrow();
  });

  it('computes output names and specifiers between emitted modules', () => {
    expect(PreservedModuleEsmPlugin.outputNameOf('/p/src', '/p/src/x/y.tsx')).toBe('x/y');
    expect(PreservedModuleEsmPlugin.specifierBetween('x/y', 'z', '.js')).toBe('../z.js');
    expect(PreservedModuleEsmPlugin.specifierBetween('index', 'x/y', '.js')).toBe('./x/y.js');
  });
});
