// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { auditProduction } from './audit-production.mjs';

it('rejects missing, extra, modified and foreign tarballs before resolving dependencies', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'frontx-audit-test-'));
  try {
    const packDir = join(rootDir, 'packs');
    const manifest = { name: '@frontx-test/sample', version: '1.0.0' };
    mkdirSync(packDir);
    mkdirSync(join(rootDir, 'packages/sample'), { recursive: true });
    writeFileSync(join(rootDir, 'packages/sample/package.json'), JSON.stringify(manifest));

    const tarball = join(packDir, 'sample.tgz');
    const row = { ...manifest, tarball, sha256: '0'.repeat(64), bundled: [], outputs: {} };
    const run = () => auditProduction({ rootDir, packDir, inventory: [row] });
    expect(run).toThrow(/missing tarball/i);

    writeFileSync(tarball, 'modified');
    expect(run).toThrow(/SHA-256 mismatch/i);
    row.sha256 = createHash('sha256').update(readFileSync(tarball)).digest('hex');
    expect(run).toThrow(/tar -tzf/i);

    mkdirSync(join(rootDir, 'package'));
    writeFileSync(join(rootDir, 'package/package.json'), JSON.stringify({ ...manifest, version: '2.0.0' }));
    execFileSync('tar', ['-czf', tarball, 'package'], { cwd: rootDir });
    row.sha256 = createHash('sha256').update(readFileSync(tarball)).digest('hex');
    expect(run).toThrow(/expected @frontx-test\/sample@1\.0\.0.*found @frontx-test\/sample@2\.0\.0/i);

    writeFileSync(join(rootDir, 'package/package.json'), JSON.stringify(manifest));
    execFileSync('tar', ['-czf', tarball, 'package'], { cwd: rootDir });
    row.sha256 = createHash('sha256').update(readFileSync(tarball)).digest('hex');
    const extra = join(packDir, 'extra.tgz');
    writeFileSync(extra, '');
    expect(run).toThrow(/unexpected tarball/i);
    rmSync(extra);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
