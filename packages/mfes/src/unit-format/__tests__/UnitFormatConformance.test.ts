/**
 * `UnitFormatConformance` over list-model producer output: naming rules,
 * content-addressed name hashes, the manifest→entryLists hash chain, and
 * cross-directory byte identity.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { UnitFormatConformance } from '../UnitFormatConformance';

const dirs: string[] = [];
function dir(): string {
  const d = mkdtempSync(join(tmpdir(), 'ufc-'));
  dirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const sha256 = (text: string): string =>
  createHash('sha256').update(text).digest('hex');

function emit(dirPath: string): { chunk: string; list: string; listHash: string } {
  const pkgDir = join(dirPath, 'pkg@1.0.0');
  mkdirSync(pkgDir, { recursive: true });
  const chunkText = 'export const x = 1;\n';
  const chunkHash = sha256(chunkText);
  const chunk = `index.${chunkHash}.js`;
  writeFileSync(join(pkgDir, chunk), chunkText);
  const listText = JSON.stringify({
    items: [
      {
        location: `pkg@1.0.0/${chunk}`,
        contentHash: chunkHash,
        answers: ['pkg'],
        imports: [],
      },
    ],
  });
  const listHash = sha256(listText);
  const list = `pkg.list.${listHash}.json`;
  writeFileSync(join(pkgDir, list), listText);
  return { chunk, list, listHash };
}

describe('UnitFormatConformance (list model)', () => {
  it('accepts conforming list-model output and confirms byte identity', () => {
    const a = dir();
    const b = dir();
    emit(a);
    emit(b);
    expect(new UnitFormatConformance().check(a, b)).toEqual([]);
  });

  it('flags a file matching no naming rule', () => {
    const a = dir();
    emit(a);
    writeFileSync(join(a, 'stray.txt'), 'x');
    const violations = new UnitFormatConformance().check(a, a);
    expect(violations.some((v) => v.rule === 'naming' && v.file.includes('stray.txt'))).toBe(true);
  });

  it('flags a name hash that does not match content', () => {
    const a = dir();
    emit(a);
    const fake = '0'.repeat(64);
    writeFileSync(join(a, 'pkg@1.0.0', `evil.${fake}.js`), 'bad');
    const violations = new UnitFormatConformance().check(a, a);
    expect(violations.some((v) => v.rule === 'hash-chain')).toBe(true);
  });

  it('checks the manifest→entryLists hash chain', () => {
    const a = dir();
    const { list, listHash } = emit(a);
    const manifest = join(dir(), 'mfe-manifest.json');
    writeFileSync(
      manifest,
      JSON.stringify({
        metaData: { sharedBase: a },
        entryLists: { './x': { location: `pkg@1.0.0/${list}`, contentHash: listHash } },
      }),
    );
    expect(new UnitFormatConformance().check(a, a, manifest)).toEqual([]);
    writeFileSync(
      manifest,
      JSON.stringify({
        metaData: { sharedBase: a },
        entryLists: { './x': { location: `pkg@1.0.0/${list}`, contentHash: '0'.repeat(64) } },
      }),
    );
    const violations = new UnitFormatConformance().check(a, a, manifest);
    expect(violations.some((v) => v.rule === 'hash-chain')).toBe(true);
  });
});
