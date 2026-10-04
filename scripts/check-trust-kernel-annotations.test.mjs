// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(__dirname, 'check-trust-kernel-annotations.mjs');

/** @type {string[]} */
const dirsToClean = [];

afterEach(async () => {
  await Promise.all(dirsToClean.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/**
 * @param {string} source
 * @returns {Promise<string>}
 */
async function writeFixture(source) {
  const dir = await mkdtemp(path.join(tmpdir(), 'trust-kernel-annotations-'));
  dirsToClean.push(dir);
  const fixturePath = path.join(dir, 'fixture.ts');
  await writeFile(fixturePath, source, 'utf8');
  return fixturePath;
}

/**
 * Runs the checker's CLI, passing `fixturePath` as argv[2] when given, or
 * with no extra argv at all (so the checker falls back to its own default
 * kernel-file path) when omitted.
 * @param {string} [fixturePath]
 * @returns {{ status: number, stderr: string, stdout: string }}
 */
function runChecker(fixturePath) {
  const args = fixturePath === undefined ? [scriptPath] : [scriptPath, fixturePath];
  try {
    const stdout = execFileSync(process.execPath, args, { encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      status: /** @type {{ status: number }} */ (error).status,
      stdout: /** @type {{ stdout: string }} */ (error).stdout ?? '',
      stderr: /** @type {{ stderr: string }} */ (error).stderr ?? '',
    };
  }
}

describe('check-trust-kernel-annotations', () => {
  it('fails an exported object literal that holds a function (never assumed not-function-valued)', async () => {
    const fixturePath = await writeFixture('export const o = { f: () => 1 };\n');
    const result = runChecker(fixturePath);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unsupported export form');
  });

  it('fails an exported array literal that holds a function (never assumed not-function-valued)', async () => {
    const fixturePath = await writeFixture('export const a = [() => 1];\n');
    const result = runChecker(fixturePath);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unsupported export form');
  });

  it('passes a named export listed before the annotated function it names', async () => {
    const fixturePath = await writeFixture(
      [
        'export { f };',
        '',
        '/**',
        ' * @safety-reviewed reviewed by trust-kernel-annotations test fixture',
        ' * @why exercises the forward-reference resolution path',
        ' */',
        'function f() {',
        '  return 1;',
        '}',
        '',
      ].join('\n'),
    );
    const result = runChecker(fixturePath);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Trust-kernel annotation check passed');
  });

  it('passes the real kernel file with no fixture argument', () => {
    const result = runChecker();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Trust-kernel annotation check passed');
  });
});
