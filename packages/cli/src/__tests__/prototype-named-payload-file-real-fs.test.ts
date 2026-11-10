// @cpt-flow:cpt-frontx-flow-cli-invocation-run-command:p1
//
// A template payload file whose path is exactly `__proto__` (or `constructor`,
// `toString`) must travel through every path-keyed bundle map like any other
// file. A bare `map[path] = text` assignment rewires the prototype for
// `__proto__` instead of storing an entry, so the file silently vanished from
// the acquired bundle and `upgrade` reported `success` while leaving that
// file at its old content.
//
// Drives the freshly BUILT executable on a real filesystem (apply, upgrade,
// restore), and checks the narrowed-subtree and local-fetch bundle builders
// directly. A nested `dir/__proto__` was never affected (the key is the whole
// path); only a top-level file is.
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLocalFetchFn } from '../adapters/local-fetch';
import { BUNDLE_MARKER } from '../bundle/envelope';
import { narrowBundleToSubtree } from '../resolver/narrow-subtree';
import { withReviewedDigest } from './support/confirm-upgrade';

const packageRoot = path.resolve(__dirname, '..', '..');
const PROTO_NAMES = ['__proto__', 'constructor', 'toString'] as const;

let sandbox: string;
let buildDir: string;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-proto-payload-'));
  // The CLI's per-user mutex lives under HOME, which it never creates.
  await mkdir(path.join(sandbox, 'home'));
  buildDir = path.join(sandbox, 'build');
  execFileSync('npx', ['tsup', '--no-config', 'src/cli.ts', '--format', 'esm', '--out-dir', buildDir, '--silent'], {
    cwd: packageRoot,
    stdio: 'pipe',
  });
}, 180_000);

afterAll(async () => {
  if (sandbox !== undefined) await rm(sandbox, { recursive: true, force: true });
});

async function writeTemplate(dir: string, version: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'frontx-template.json'),
    JSON.stringify({ name: '@x/t', version, excludedSubtrees: [], description: 't' }),
    'utf-8',
  );
  await writeFile(path.join(dir, 'a.txt'), `A${version}`, 'utf-8');
  for (const name of PROTO_NAMES) await writeFile(path.join(dir, name), `${name}-${version}`, 'utf-8');
}

describe('top-level prototype-named payload files', () => {
  it('apply, upgrade and restore carry every such file (built CLI)', async () => {
    const project = path.join(sandbox, 'project');
    await mkdir(project, { recursive: true });
    await writeTemplate(path.join(project, 'tpl1'), '1.0.0');
    await writeTemplate(path.join(project, 'tpl2'), '2.0.0');
    const run = (args: string[]) => withReviewedDigest(args, (args) => {
      const r = spawnSync(process.execPath, [path.join(buildDir, 'cli.js'), ...args, '--json'], {
        cwd: project,
        encoding: 'utf-8',
        env: { PATH: process.env.PATH ?? '', HOME: path.join(sandbox, 'home'), FRONTX_INVENTORY_ROOT: path.join(sandbox, 'inv') },
      });
      return JSON.parse(r.stdout.trim()) as { ok: boolean; data?: Record<string, unknown> };
    });
    const read = (name: string) => readFile(path.join(project, 'app', name), 'utf-8');

    expect(run(['register', 'path:tpl1']).ok).toBe(true);
    expect(run(['apply', '--input', JSON.stringify({ templates: { '@x/t': ['app'] } })]).ok).toBe(true);
    for (const name of PROTO_NAMES) expect(await read(name)).toBe(`${name}-1.0.0`);

    const up = run(['upgrade', '@x/t', 'path:tpl2', '--yes']);
    expect(up.ok).toBe(true);
    expect(up.data?.outcome).toBe('success');
    expect(await read('a.txt')).toBe('A2.0.0');
    for (const name of PROTO_NAMES) expect(await read(name), `${name} after upgrade`).toBe(`${name}-2.0.0`);

    expect(run(['upgrade', '@x/t', '--restore', '--yes']).ok).toBe(true);
    for (const name of PROTO_NAMES) expect(await read(name), `${name} after restore`).toBe(`${name}-1.0.0`);
  }, 120_000);

  it('the local fetcher keeps them as own entries of the bundle', async () => {
    const dir = path.join(sandbox, 'fetch');
    await writeTemplate(dir, '1.0.0');
    const envelope = JSON.parse(await createLocalFetchFn(dir)('ignored')) as Record<string, Record<string, string>>;
    const files = envelope[BUNDLE_MARKER]!;
    for (const name of PROTO_NAMES) expect(Object.prototype.hasOwnProperty.call(files, name), name).toBe(true);
    expect(Object.keys(files).sort()).toEqual(['__proto__', 'a.txt', 'constructor', 'frontx-template.json', 'toString']);
  });

  it('a narrowed subtree keeps a re-rooted top-level prototype-named file', () => {
    const files = JSON.parse('{"sub/__proto__":"P","sub/constructor":"C","sub/ok.txt":"O"}') as Record<string, string>;
    const content = JSON.stringify({ [BUNDLE_MARKER]: files });
    const narrowed = narrowBundleToSubtree(content, 'sub');
    expect(narrowed.ok).toBe(true);
    if (!narrowed.ok) return;
    const out = JSON.parse(narrowed.content) as Record<string, Record<string, string>>;
    const map = out[BUNDLE_MARKER]!;
    expect(Object.prototype.hasOwnProperty.call(map, '__proto__')).toBe(true);
    expect(Object.keys(map).sort()).toEqual(['__proto__', 'constructor', 'ok.txt']);
  });
});
