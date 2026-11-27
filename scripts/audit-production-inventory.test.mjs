// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { packProductionPackage, recordTsupInventory } from './audit-production-inventory.mjs';

it('binds embedded versions and rejects unowned inputs, lock drift, and unrecorded files', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'frontx-inventory-'));
  const packageDir = join(rootDir, 'packages/demo');
  const packDir = join(rootDir, 'packs');
  /** @param {string} file @param {unknown} value */
  const json = (file, value) => writeFileSync(file, JSON.stringify(value));
  try {
    mkdirSync(join(packageDir, 'dist'), { recursive: true });
    mkdirSync(join(rootDir, 'node_modules/embedded'), { recursive: true });
    json(join(packageDir, 'package.json'), {
      name: '@gears-frontx/demo', version: '1.0.0', main: 'dist/index.cjs',
      module: 'dist/index.js', files: ['dist'],
    });
    json(join(rootDir, 'package-lock.json'), {
      packages: { 'node_modules/embedded': { version: '1.2.3', integrity: 'sha512-test', resolved: 'https://registry.npmjs.org/embedded/-/embedded-1.2.3.tgz' } },
    });
    const embedded = join(rootDir, 'node_modules/embedded');
    json(join(embedded, 'package.json'), { name: 'embedded', version: '1.2.3' });
    writeFileSync(join(embedded, 'index.js'), 'module.exports = 1;');
    /** @param {string} input @param {string} [localImport] */
    const generateMetadata = (input, localImport) => {
      for (const [format, ext] of [['cjs', 'cjs'], ['esm', 'js']]) {
        const output = `dist/index.${ext}`;
        writeFileSync(join(packageDir, output), '/* built */');
        const inputs = { [input]: { bytesInOutput: 1 } };
        const imports = format === 'esm' && localImport ? [{ path: localImport, external: true }] : [];
        const outputs = { [output]: { inputs, imports } };
        if (format === 'esm') {
          writeFileSync(join(packageDir, 'dist/linked.js'), '/* linked output */');
          outputs['dist/linked.js'] = { inputs: {}, imports: [] };
        }
        json(join(packageDir, `dist/metafile-${format}.json`), { outputs });
      }
    };
    const input = '../../node_modules/embedded/index.js';
    const pack = () => packProductionPackage({ rootDir, packageDir, packDir });
    for (const badImport of ['./missing.js', '../package.json']) {
      generateMetadata(input, badImport);
      recordTsupInventory(packageDir);
      expect(pack).toThrow(/unverified local output import/i);
    }
    generateMetadata(input, './linked.js');
    recordTsupInventory(packageDir);
    const result = pack();
    expect(result.bundled).toEqual([{ name: 'embedded', version: '1.2.3' }]);
    expect(Object.keys(result.outputs)).toContain('dist/index.js');
    writeFileSync(join(packageDir, 'dist/index.js'), '/* changed after build */');
    expect(pack).toThrow(/packed output hash mismatch.*index\.js/i);
    rmSync(join(packageDir, 'dist/index.js'));
    expect(pack).toThrow(/missing packed target.*index\.js/i);
    generateMetadata('../../node_modules/embedded/index.js');
    recordTsupInventory(packageDir);
    writeFileSync(join(packageDir, 'dist/surprise.js'), '/* unknown */');
    expect(pack).toThrow(/unrecorded.*surprise\.js/i);
    rmSync(join(packageDir, 'dist/surprise.js'));
    json(join(embedded, 'package.json'), { name: 'embedded', version: '9.9.9' });
    expect(pack).toThrow(/lock.*embedded/i);
    generateMetadata('\0unregistered-virtual-input');
    expect(() => recordTsupInventory(packageDir)).toThrow(/unknown.*input/i);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}, 60_000);
