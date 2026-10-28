// @cpt-dod:cpt-frontx-dod-template-resolution-bundle-key-validity:p1
//
// Real-filesystem, whole-CLI coverage for the bundle-key validity rule: a key
// of a fetched template's file map (a tar entry name, once the tarball is
// unpacked) that is not a safe template-relative path must be refused before
// anything is written, at EVERY command that acquires a template —
// `register`, `install`, `update-local`, and `upgrade`.
//
// Reproduced live before the fix, with a crafted tarball served through the
// real GitHub fetch adapter:
//
//   register  key `../../index.json`  => the inventory index was replaced, so
//                                        every later `list`/`register` failed
//   register  key `../../@victim/lib/src/lib.ts`
//                                     => another installed template's file
//                                        was overwritten
//   upgrade   key `../other/x.txt`, target `app`
//                                     => `other/x.txt` written into the
//                                        project, outside the target
//   upgrade   key `src/../.frontx/injected.json`
//                                     => written into the CLI's own namespace
//
// A key SET is judged too: keys that are each safe but cannot all be written —
// a file that is also a directory of another key (`src` and `src/index.ts`), or
// two keys that name one location once Unicode normalisation and, on a volume
// that folds case, letter case are folded — used to crash the store write with a
// raw `EISDIR`/`EEXIST` and no envelope (exit 2) leaving a half-written
// inventory slot, or to be written and silently collapse into one file.
//
// The guard that does fire elsewhere (`assertWithinRoot` against the
// INVENTORY root, `assertPathWithinProjectRoot` against the project root) never
// saw these keys as wrong, because each one resolves inside the root it checks.
// Each case therefore snapshots the whole sandbox — project, inventory, and a
// sibling directory — before and after, and requires the two to be identical:
// a refusal that still left a directory or a file behind is not a refusal.
import path from 'node:path';
import { lstat, mkdir, mkdtemp, readdir, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run, createRealDeps } from '../cli';
import type { CliDeps } from '../cli';
import { createGithubFetchFn } from '../adapters/github-fetch';
import { isVolumeCaseInsensitive } from '../paths/volume-case';
import { craftTarball, tarballFetch } from './support/crafted-tarball';
import type { CraftedTarball } from './support/crafted-tarball';

const SHA_V1 = '1111111111111111111111111111111111111111';
const SHA_V2 = '2222222222222222222222222222222222222222';
const SHA_VICTIM = '3333333333333333333333333333333333333333';

const manifestOf = (name: string, version: string): string =>
  JSON.stringify({ name, version, excludedSubtrees: [], description: `${name} fixture` });

// One row is one bad bundle: the whole file map the template's tarball carries
// (the manifest and `src/index.ts` are what make it otherwise a valid template),
// and what the refusal message must name. A key's spelling is the whole point of
// each key row, so those are written out literally; the absolute key is built per
// sandbox, because it must name a location this test owns.
interface Row {
  label: string;
  files: (sandbox: string) => Record<string, string>;
  named: (sandbox: string) => string[];
  // Whether this bundle is refused on the volume the test runs on. A case-only
  // collision is a collision only where the volume folds case (the rule follows
  // `foldForIdentity`); everywhere else both files are legitimate and the
  // template installs. Evaluated inside the test, never at collection, because
  // the volume is probed in the sandbox the test runs in.
  refused?: () => boolean;
}

const manifestFile = (): Record<string, string> => ({
  'frontx-template.json': manifestOf('@probe/tpl', '2.0.0'),
  'src/index.ts': "export const v = '2.0.0';\n",
});

const keyRow = (label: string, key: (sandbox: string) => string): Row => ({
  label: `a key that ${label}`,
  files: (sandbox) => ({ ...manifestFile(), [key(sandbox)]: 'PWNED-BY-KEY' }),
  named: (sandbox) => [JSON.stringify(key(sandbox))],
});

const NFC = 'caf\u00e9.ts';
const NFD = 'cafe\u0301.ts';

const ROWS: Row[] = [
  keyRow('climbs out of the template via an interior `..`', () => 'src/../../outside.txt'),
  keyRow('starts with `..`', () => '../outside.txt'),
  keyRow('is absolute', (sandbox) => path.join(sandbox, 'abs', 'outside.txt')),
  keyRow('is a backslash-separated traversal', () => 'src\\..\\..\\outside.txt'),
  keyRow('lands in a sibling directory of the target', () => '../other/x.txt'),
  keyRow('lands in the CLI-owned namespace via an interior `..`', () => 'src/../.frontx/injected.json'),
  keyRow('overwrites another installed template', () => '../../@victim/lib/src/lib.ts'),
  keyRow('replaces the inventory index', () => '../../index.json'),
  keyRow('names a Windows drive', () => 'C:/outside.txt'),
  keyRow('carries a colon in an ordinary file name', () => 'docs/a:b.md'),
  keyRow('carries an empty segment', () => 'src//outside.txt'),
  keyRow('has leading whitespace', () => ' src/outside.txt'),
  keyRow('carries a control character', () => 'src/a\u0001b.txt'),
  {
    label: 'a file listed AFTER a key it is a directory of (`src/index.ts`, then `src`)',
    files: () => ({ ...manifestFile(), src: 'FILE' }),
    named: () => ['"src"', '"src/index.ts"'],
  },
  {
    label: 'a file listed BEFORE a key it is a directory of (`src`, then `src/index.ts`)',
    files: () => ({ 'frontx-template.json': manifestOf('@probe/tpl', '2.0.0'), src: 'FILE', 'src/index.ts': 'x' }),
    named: () => ['"src"', '"src/index.ts"'],
  },
  {
    label: 'a file that is a directory of a deeper key',
    files: () => ({ ...manifestFile(), 'src/a/b.ts': 'x', 'src/a': 'FILE' }),
    named: () => ['"src/a"', '"src/a/b.ts"'],
  },
  {
    label: 'two keys differing only in Unicode normalisation (precomposed and decomposed e-acute)',
    files: () => ({ ...manifestFile(), [NFC]: 'NFC', [NFD]: 'NFD' }),
    named: () => [JSON.stringify(NFD), JSON.stringify(NFC)],
  },
  {
    label: 'two keys differing only in case (`README.md`, `readme.md`)',
    files: () => ({ ...manifestFile(), 'README.md': 'a', 'readme.md': 'b' }),
    named: () => ['"readme.md"', '"README.md"'],
    refused: isVolumeCaseInsensitive,
  },
  {
    label: 'a second manifest differing only in case, naming another template',
    files: () => ({ ...manifestFile(), 'FRONTX-TEMPLATE.JSON': manifestOf('@victim/lib', '6.6.6') }),
    named: () => ['"FRONTX-TEMPLATE.JSON"', '"frontx-template.json"'],
    refused: isVolumeCaseInsensitive,
  },
];

// Every entry — file, directory, symlink — under `dir`, with the bytes of each
// file, so two snapshots are equal exactly when nothing was created, removed,
// or modified in between. Directories are entries too: a refused key whose
// parent directories had already been created is a partial write.
async function snapshot(dir: string, relative = ''): Promise<Record<string, string>> {
  const entries: Record<string, string> = {};
  for (const name of (await readdir(path.join(dir, relative))).sort()) {
    const entryRelative = relative === '' ? name : `${relative}/${name}`;
    const absolute = path.join(dir, entryRelative);
    const stats = await lstat(absolute);
    if (stats.isDirectory()) {
      entries[`${entryRelative}/`] = '';
      Object.assign(entries, await snapshot(dir, entryRelative));
    } else if (stats.isSymbolicLink()) {
      entries[entryRelative] = `-> ${await readlink(absolute)}`;
    } else {
      entries[entryRelative] = (await readFile(absolute)).toString('utf-8');
    }
  }
  return entries;
}

interface Envelope {
  ok: boolean;
  error?: { code: string; message: string };
}

let sandbox: string;
let project: string;
let inventory: string;
let originalCwd: string;
let originalInventoryRoot: string | undefined;
let originalLocalSource: string | undefined;

beforeEach(async () => {
  originalCwd = process.cwd();
  originalInventoryRoot = process.env.FRONTX_INVENTORY_ROOT;
  originalLocalSource = process.env.FRONTX_TEST_LOCAL_SOURCE_DIR;
  delete process.env.FRONTX_TEST_LOCAL_SOURCE_DIR;
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-bundle-key-'));
  project = path.join(sandbox, 'proj');
  inventory = path.join(sandbox, 'inv');
  await mkdir(project);
  await mkdir(inventory);
  await mkdir(path.join(sandbox, 'abs'));
  process.env.FRONTX_INVENTORY_ROOT = inventory;
  process.chdir(project);
});

afterEach(async () => {
  process.chdir(originalCwd);
  if (originalInventoryRoot === undefined) delete process.env.FRONTX_INVENTORY_ROOT;
  else process.env.FRONTX_INVENTORY_ROOT = originalInventoryRoot;
  if (originalLocalSource === undefined) delete process.env.FRONTX_TEST_LOCAL_SOURCE_DIR;
  else process.env.FRONTX_TEST_LOCAL_SOURCE_DIR = originalLocalSource;
  await rm(sandbox, { recursive: true, force: true });
});

// The real deps with only the network swapped for tarballs the test crafted:
// everything after the fetch — unpack, resolve, store, project state — is the
// production code path.
function depsServing(tarballs: Record<string, CraftedTarball>): CliDeps {
  return { ...createRealDeps(), fetchFn: createGithubFetchFn({ fetchImpl: tarballFetch(tarballs) }) };
}

async function invoke(argv: string[], tarballs: Record<string, CraftedTarball>): Promise<{ exitCode: number; envelope: Envelope }> {
  const outcome = await run([...argv, '--json'], depsServing(tarballs));
  return { exitCode: outcome.exitCode, envelope: JSON.parse(outcome.stdout ?? '') as Envelope };
}

function cleanTemplate(version: string, sha: string): CraftedTarball {
  return craftTarball(
    { 'frontx-template.json': manifestOf('@probe/tpl', version), 'src/index.ts': `export const v = '${version}';\n` },
    sha,
  );
}

function craftedTemplate(files: Record<string, string>): CraftedTarball {
  return craftTarball(files, SHA_V2);
}

// A bundle that is refused: ONE envelope, a code from ADR-0042, exit 1, the
// message names every path it is about, and the whole sandbox is byte-for-byte
// what it was. A bundle that is not refused on this volume (a case-only
// collision on a case-sensitive one) is an ordinary template and must go through.
async function expectOutcome(
  row: Row,
  result: { exitCode: number; envelope: Envelope },
  before: Record<string, string>,
  code: 'INVALID_PATH' | 'ORIGIN_UNAVAILABLE',
): Promise<void> {
  if (row.refused !== undefined && !row.refused()) {
    expect(result.exitCode).toBe(0);
    expect(result.envelope.ok).toBe(true);
    return;
  }
  expect(result.exitCode).toBe(1);
  expect(result.envelope.ok).toBe(false);
  expect(result.envelope.error?.code).toBe(code);
  for (const named of row.named(sandbox)) expect(result.envelope.error?.message).toContain(named);
  expect(await snapshot(sandbox)).toEqual(before);
}

describe('a bundle whose keys cannot be written as they stand is refused before anything is written', () => {
  for (const row of ROWS) {
    describe(row.label, () => {
      it('register: INVALID_PATH, exit 1, and the sandbox is byte-for-byte unchanged', async () => {
        const tarballs = { v2: craftedTemplate(row.files(sandbox)) };
        const before = await snapshot(sandbox);

        await expectOutcome(row, await invoke(['register', 'github:acme/tpl@v2'], tarballs), before, 'INVALID_PATH');
      });

      it('install: INVALID_PATH, exit 1, and the sandbox is byte-for-byte unchanged', async () => {
        const tarballs = { v2: craftedTemplate(row.files(sandbox)) };
        const before = await snapshot(sandbox);

        await expectOutcome(row, await invoke(['install', 'github:acme/tpl@v2'], tarballs), before, 'INVALID_PATH');
      });

      it('update-local: INVALID_PATH, exit 1, and the installed template and index are untouched', async () => {
        const tarballs = { v1: cleanTemplate('1.0.0', SHA_V1), v2: craftedTemplate(row.files(sandbox)) };
        expect((await invoke(['install', 'github:acme/tpl@v1'], tarballs)).exitCode).toBe(0);
        const before = await snapshot(sandbox);

        await expectOutcome(row, await invoke(['update-local', '@probe/tpl', 'github:acme/tpl@v2'], tarballs), before, 'INVALID_PATH');
      });

      it('upgrade: refused (ORIGIN_UNAVAILABLE, the code an origin whose content cannot be taken earns), exit 1, and the project and inventory are untouched', async () => {
        const tarballs = { v1: cleanTemplate('1.0.0', SHA_V1), v2: craftedTemplate(row.files(sandbox)) };
        expect((await invoke(['register', 'github:acme/tpl@v1'], tarballs)).exitCode).toBe(0);
        expect((await invoke(['apply', '--input', '{"templates":{"@probe/tpl":["app"]}}'], tarballs)).exitCode).toBe(0);
        const before = await snapshot(sandbox);

        await expectOutcome(row, await invoke(['upgrade', '@probe/tpl', 'github:acme/tpl@v2', '--yes'], tarballs), before, 'ORIGIN_UNAVAILABLE');
      });
    });
  }
});

describe('cross-template poisoning of the inventory', () => {
  it('a template registered after another cannot overwrite that template or the index, and the inventory stays usable', async () => {
    const victim = craftTarball(
      { 'frontx-template.json': manifestOf('@victim/lib', '1.0.0'), 'src/lib.ts': 'VICTIM-ORIGINAL\n' },
      SHA_VICTIM,
    );
    const evil = craftTarball(
      {
        'frontx-template.json': manifestOf('@probe/tpl', '1.0.0'),
        'src/index.ts': 'ok\n',
        '../../@victim/lib/src/lib.ts': 'VICTIM-OVERWRITTEN\n',
        '../../index.json': '{"overwritten":true}',
      },
      SHA_V1,
    );
    const tarballs = { victim, evil };
    expect((await invoke(['register', 'github:acme/vic@victim'], tarballs)).exitCode).toBe(0);
    const before = await snapshot(sandbox);

    const { exitCode, envelope } = await invoke(['register', 'github:acme/evil@evil'], tarballs);

    expect(exitCode).toBe(1);
    expect(envelope.error?.code).toBe('INVALID_PATH');
    expect(await readFile(path.join(inventory, '@victim', 'lib', 'src', 'lib.ts'), 'utf-8')).toBe('VICTIM-ORIGINAL\n');
    expect(await snapshot(sandbox)).toEqual(before);
    expect((await invoke(['list'], tarballs)).exitCode).toBe(0);
  });
});

describe('a bundle whose keys are all safe still installs, registers, applies and upgrades', () => {
  const bundle = (version: string): Record<string, string> => ({
    'frontx-template.json': manifestOf('@probe/tpl', version),
    'src/App.tsx': `export const App = '${version}';\n`,
    'src/nested/deep/file.ts': 'export {};\n',
    '.frontx/ai/probe-tpl/note.md': `note ${version}\n`,
  });

  it('install and update-local write every key under the installed content path', async () => {
    const tarballs = { v1: craftTarball(bundle('1.0.0'), SHA_V1), v2: craftTarball(bundle('2.0.0'), SHA_V2) };

    expect((await invoke(['install', 'github:acme/tpl@v1'], tarballs)).exitCode).toBe(0);
    expect((await invoke(['update-local', '@probe/tpl', 'github:acme/tpl@v2'], tarballs)).exitCode).toBe(0);

    const installed = path.join(inventory, '@probe', 'tpl');
    expect(await readFile(path.join(installed, 'src', 'App.tsx'), 'utf-8')).toBe("export const App = '2.0.0';\n");
    expect(await readFile(path.join(installed, 'src', 'nested', 'deep', 'file.ts'), 'utf-8')).toBe('export {};\n');
    expect(await readFile(path.join(installed, '.frontx', 'ai', 'probe-tpl', 'note.md'), 'utf-8')).toBe('note 2.0.0\n');
    expect(await readFile(path.join(installed, 'frontx-template.json'), 'utf-8')).toBe(manifestOf('@probe/tpl', '2.0.0'));
  });

  it('register, apply and upgrade carry every key through to the project', async () => {
    const tarballs = { v1: craftTarball(bundle('1.0.0'), SHA_V1), v2: craftTarball(bundle('2.0.0'), SHA_V2) };

    expect((await invoke(['register', 'github:acme/tpl@v1'], tarballs)).exitCode).toBe(0);
    expect((await invoke(['apply', '--input', '{"templates":{"@probe/tpl":["app"]}}'], tarballs)).exitCode).toBe(0);
    expect(await readFile(path.join(project, 'app', 'src', 'App.tsx'), 'utf-8')).toBe("export const App = '1.0.0';\n");

    const upgraded = await invoke(['upgrade', '@probe/tpl', 'github:acme/tpl@v2', '--yes'], tarballs);

    expect(upgraded.exitCode).toBe(0);
    expect(upgraded.envelope.ok).toBe(true);
    expect(await readFile(path.join(project, 'app', 'src', 'App.tsx'), 'utf-8')).toBe("export const App = '2.0.0';\n");
    expect(await readFile(path.join(project, 'app', 'src', 'nested', 'deep', 'file.ts'), 'utf-8')).toBe('export {};\n');
  });
});

// The pre-publish gate and the install path answer to the same rule: a template
// directory that passes `validate` must not be one every remote install refuses.
describe('validate <templateDir> applies the same key rule to the files it lists', () => {
  async function templateDir(files: Record<string, string>): Promise<string> {
    const dir = path.join(sandbox, 'tpl');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'frontx-template.json'), manifestOf('@probe/tpl', '1.0.0'));
    for (const [name, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
      await writeFile(path.join(dir, name), text);
    }
    return dir;
  }

  async function validate(dir: string): Promise<{ exitCode: number; envelope: Envelope & { error?: { details?: { violations?: { field: string; message: string }[] } } } }> {
    const outcome = await run(['validate', dir, '--json'], createRealDeps());
    return { exitCode: outcome.exitCode, envelope: JSON.parse(outcome.stdout ?? '') };
  }

  it('fails a template that lists a file whose name carries a colon, naming the file and the rule', async () => {
    const { exitCode, envelope } = await validate(await templateDir({ 'src/index.ts': 'x', 'docs/a:b.md': 'x' }));

    expect(exitCode).toBe(1);
    expect(envelope.ok).toBe(false);
    const violation = envelope.error?.details?.violations?.find((v) => v.field === 'docs/a:b.md');
    expect(violation?.message).toContain('colon');
  });

  it('fails a template that lists a file whose name has leading whitespace', async () => {
    const { exitCode, envelope } = await validate(await templateDir({ ' src/index.ts': 'x' }));

    expect(exitCode).toBe(1);
    expect(envelope.error?.details?.violations?.[0]?.field).toBe(' src/index.ts');
  });

  it('the same file set, served as a remote template, is refused by install — the two gates agree', async () => {
    const tarballs = { v2: craftedTemplate({ ...manifestFile(), 'docs/a:b.md': 'x' }) };

    const { exitCode, envelope } = await invoke(['install', 'github:acme/tpl@v2'], tarballs);

    expect(exitCode).toBe(1);
    expect(envelope.error?.code).toBe('INVALID_PATH');
  });

  it('passes a template whose files are a sound set of keys', async () => {
    const { exitCode, envelope } = await validate(await templateDir({ 'src/index.ts': 'x', '.gitignore': 'x', 'docs/a b.md': 'x' }));

    expect(exitCode).toBe(0);
    expect(envelope.ok).toBe(true);
  });
});
