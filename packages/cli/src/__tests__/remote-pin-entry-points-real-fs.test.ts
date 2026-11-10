// @cpt-dod:cpt-frontx-dod-template-resolution-install-by-spec:p1
//
// Every write path that persists a newly resolved remote origin, driven through
// `run()` with the real GitHub adapter over crafted archives, stores the full
// 40-hex commit the archive states — never the typed `@ref` — and a refused
// archive writes nothing and never echoes the token.
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import zlib from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run, createRealDeps } from '../cli';
import { createGithubFetchFn } from '../adapters/github-fetch';
import { craftTarball, tarballFetch } from './support/crafted-tarball';
import type { CraftedTarball } from './support/crafted-tarball';
import { withReviewedDigestAsync } from './support/confirm-upgrade';

const SHA_V1 = 'a'.repeat(40);
const SHA_V2 = 'b'.repeat(40);
const TOKEN = 'SECRET-T';
const NAME = '@probe/tpl';

const template = (version: string, sha: string): CraftedTarball =>
  craftTarball(
    {
      'frontx-template.json': JSON.stringify({ name: NAME, version, excludedSubtrees: [], description: 'pin fixture' }),
      'src/index.ts': `export const v = '${version}';\n`,
    },
    sha,
  );

let sandbox: string;
let project: string;
let inventory: string;
let originalCwd: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(async () => {
  originalCwd = process.cwd();
  for (const key of ['FRONTX_INVENTORY_ROOT', 'FRONTX_TEST_LOCAL_SOURCE_DIR']) savedEnv[key] = process.env[key];
  delete process.env.FRONTX_TEST_LOCAL_SOURCE_DIR;
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-remote-pin-'));
  project = path.join(sandbox, 'proj');
  inventory = path.join(sandbox, 'inv');
  await mkdir(project);
  await mkdir(inventory);
  process.env.FRONTX_INVENTORY_ROOT = inventory;
  process.chdir(project);
});

afterEach(async () => {
  process.chdir(originalCwd);
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(sandbox, { recursive: true, force: true });
});

async function invoke(argv: string[], fetchImpl: typeof fetch) {
  return withReviewedDigestAsync(argv, (a) => invokeOnce(a, fetchImpl));
}

async function invokeOnce(argv: string[], fetchImpl: typeof fetch) {
  const outcome = await run([...argv, '--json'], { ...createRealDeps(), fetchFn: createGithubFetchFn({ fetchImpl, token: TOKEN }) });
  const stdout = outcome.stdout ?? '';
  expect(stdout + (outcome.stderr ?? '')).not.toContain(TOKEN);
  return { exitCode: outcome.exitCode, envelope: JSON.parse(stdout) as { ok: boolean; error?: { code: string } } };
}

const state = async () =>
  JSON.parse(await readFile(path.join(project, '.frontx', 'project.json'), 'utf-8')) as {
    templates: Record<string, { origin: string; previous?: { origin: string } }>;
  };
const indexText = () => readFile(path.join(inventory, 'index.json'), 'utf-8');

// Serves `refs` by the last URL segment; anything else is a 404.
function serving(refs: Record<string, Buffer>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const bytes = refs[String(url).split('/').pop() ?? ''];
    return bytes ? new Response(new Uint8Array(bytes), { status: 200 }) : new Response('nf', { status: 404, statusText: 'Not Found' });
  }) as typeof fetch;
}
// A gzipped archive with no global PAX header: the adapter refuses it.
const unpinnable = zlib.gzipSync(Buffer.alloc(1024));

describe('a newly resolved remote origin is persisted as the full PAX commit', () => {
  it('C6. register: typed branch → full SHA; same commit is a noop; a moved branch conflicts', async () => {
    const first = await invoke(['register', 'github:acme/tpl@main'], tarballFetch({ main: template('1.0.0', SHA_V1) }));
    expect(first.exitCode).toBe(0);
    expect((await state()).templates[NAME]!.origin).toBe(`github:acme/tpl@${SHA_V1}`);

    const again = await invoke(['register', 'github:acme/tpl@main'], tarballFetch({ main: template('1.0.0', SHA_V1) }));
    expect(again.exitCode).toBe(0);
    expect((await state()).templates[NAME]!.origin).toBe(`github:acme/tpl@${SHA_V1}`);

    const moved = await invoke(['register', 'github:acme/tpl@main'], tarballFetch({ main: template('1.0.0', SHA_V2) }));
    expect(moved.envelope.error?.code).toBe('REGISTRATION_CONFLICT');
    expect((await state()).templates[NAME]!.origin).toBe(`github:acme/tpl@${SHA_V1}`);
  });

  it('C1. update-local: the index source becomes the full SHA', async () => {
    const tarballs = { v1: template('1.0.0', SHA_V1), v2: template('2.0.0', SHA_V2) };
    expect((await invoke(['install', 'github:acme/tpl@v1'], tarballFetch(tarballs))).exitCode).toBe(0);
    expect(await indexText()).toContain(`github:acme/tpl@${SHA_V1}`);
    expect((await invoke(['update-local', NAME, 'github:acme/tpl@v2'], tarballFetch(tarballs))).exitCode).toBe(0);
    expect(await indexText()).toContain(`github:acme/tpl@${SHA_V2}`);
    expect(await indexText()).not.toContain('@v2');
  });

  it('C2/C3/C4. upgrade, promotion and restore all record full SHAs', async () => {
    const fetchImpl = tarballFetch({ v1: template('1.0.0', SHA_V1), v2: template('2.0.0', SHA_V2) });
    expect((await invoke(['register', 'github:acme/tpl@v1'], fetchImpl)).exitCode).toBe(0);
    expect((await invoke(['apply', '--input', `{"templates":{"${NAME}":["app"]}}`], fetchImpl)).exitCode).toBe(0);

    const upgraded = await invoke(['upgrade', NAME, 'github:acme/tpl@v2', '--yes'], fetchImpl);
    expect(upgraded.exitCode).toBe(0);
    const afterUpgrade = (await state()).templates[NAME]!;
    expect(afterUpgrade.origin).toBe(`github:acme/tpl@${SHA_V2}`);
    expect(afterUpgrade.previous?.origin).toBe(`github:acme/tpl@${SHA_V1}`);
    // C4: promotion moved the inventory slot to the committed full SHA.
    expect(await indexText()).toContain(`github:acme/tpl@${SHA_V2}`);

    const restored = await invoke(['upgrade', NAME, '--restore', '--yes'], fetchImpl);
    expect(restored.exitCode).toBe(0);
    expect((await state()).templates[NAME]!.origin).toBe(`github:acme/tpl@${SHA_V1}`);
  });
});

describe('a refused archive writes nothing', () => {
  it('register: ORIGIN_UNAVAILABLE, no project state', async () => {
    const refused = await invoke(['register', 'github:acme/tpl@main'], serving({ main: unpinnable }));
    expect(refused.exitCode).toBe(1);
    expect(refused.envelope.error?.code).toBe('ORIGIN_UNAVAILABLE');
    await expect(readFile(path.join(project, '.frontx', 'project.json'))).rejects.toThrow();
  });

  it('upgrade: candidate refused → ORIGIN_UNAVAILABLE, state unchanged', async () => {
    const v1 = template('1.0.0', SHA_V1).bytes;
    const fetchImpl = serving({ v1, [SHA_V1]: v1, v2: unpinnable });
    expect((await invoke(['register', 'github:acme/tpl@v1'], fetchImpl)).exitCode).toBe(0);
    expect((await invoke(['apply', '--input', `{"templates":{"${NAME}":["app"]}}`], fetchImpl)).exitCode).toBe(0);
    const before = await readFile(path.join(project, '.frontx', 'project.json'), 'utf-8');

    const refused = await invoke(['upgrade', NAME, 'github:acme/tpl@v2', '--yes'], fetchImpl);
    expect(refused.exitCode).toBe(1);
    expect(refused.envelope.error?.code).toBe('ORIGIN_UNAVAILABLE');
    expect(await readFile(path.join(project, '.frontx', 'project.json'), 'utf-8')).toBe(before);
  });

  it('C5. promotion uses the reviewed candidate bytes after commit', async () => {
    const v1 = template('1.0.0', SHA_V1).bytes;
    // Promotion must reuse the reviewed candidate instead of fetching the pinned SHA again.
    const fetchImpl = serving({ v1, [SHA_V1]: v1, v2: template('2.0.0', SHA_V2).bytes, [SHA_V2]: unpinnable });
    expect((await invoke(['register', 'github:acme/tpl@v1'], fetchImpl)).exitCode).toBe(0);
    expect((await invoke(['apply', '--input', `{"templates":{"${NAME}":["app"]}}`], fetchImpl)).exitCode).toBe(0);
    const indexBefore = await indexText();

    const outcome = await invoke(['upgrade', NAME, 'github:acme/tpl@v2', '--yes'], fetchImpl);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.envelope.ok).toBe(true);
    expect((await state()).templates[NAME]!.origin).toBe(`github:acme/tpl@${SHA_V2}`);
    expect(await indexText()).not.toBe(indexBefore);
    expect(await indexText()).toContain(`github:acme/tpl@${SHA_V2}`);
  });
});
