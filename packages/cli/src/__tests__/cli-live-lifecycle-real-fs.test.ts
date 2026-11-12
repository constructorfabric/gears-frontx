// @cpt-flow:cpt-frontx-flow-cli-invocation-run-command:p1
//
// LIVE LIFECYCLE. Drives the freshly BUILT `frontx` executable as a
// subprocess (the only dispatch path a user has) through the supported,
// uncontested part of the command surface, against externally-shaped
// disposable templates (four-field manifest, files, AI bundle under
// `.frontx/ai/<name>/`) in disposable projects. Each step asserts the exit
// code and the `--json` envelope fields named in that step (status, `ok`,
// error code, selected data), plus the specific disk / state evidence named
// there. Filesystem snapshots (`snapshot`) record entry type, raw bytes
// (base64) and symlink targets and fail on any error other than ENOENT; they
// cover only the directories a step snapshots, not the whole project.
// Refusal steps assert no-write on the paths/snapshots they name.
//
// Two lifecycles, deliberately separate: (1) the disjoint-target lifecycle of
// local `path:` fixtures, and (2) the NESTED lifecycles, where a host template
// declares `excludedSubtrees` and a second template sits on the ground the
// entry reserves: (2a) an INSTALLED host (install -> register `github:` ->
// apply, content read from the inventory) with a `path:` guest, and (2b) a
// `path:` host and guest through upgrade, a refused upgrade, restore, delete.
// (2c) an INSTALLED `github:` host upgraded to a local `path:` candidate and
// restored to the recorded `github:` origin (a mixed-origin route).
// Not covered (open, not this suite's to settle): a remote-to-remote upgrade
// of an installed host (the offline hook serves ONE directory for every URL, so
// two remote versions cannot be served in one run; the candidate here is
// `path:`), real GitHub networking or pinning, AI agent/skill/orchestration
// execution (bundles are only copied and removed), non-UTF-8 content bytes.
//
// Covered: install, update-local, list, register (created / noop / refusal),
// assemble preview (writes nothing), apply (two templates, AI bundle copy,
// repeated apply), validate --project, validate <templateDir>, ownership
// add/list/remove, unregister refusal, upgrade (content conflict,
// confirmation required, accepted), upgrade --restore, delete (dry-run,
// confirmation required, accepted), unregister, and the `seed` refusal that
// holds while the official-defaults map is empty.
//
// Deliberately NOT asserted here (open, not this suite's to settle): the fate
// of a repeated `--restore`, crash/interruption guarantees, a host payload file
// inside its own excluded subtree and same-name or same-batch case-variant
// nesting (open defects/rulings, see the ledger), whether `delete` leaves empty
// directory skeletons. Nested guests are spelled in their on-disk case.
//
// Isolation: the project, the inventory (`FRONTX_INVENTORY_ROOT`), the home
// directory and every template live under one `mkdtemp` sandbox removed in
// `afterAll` after ordinary vitest passes/failures; that is best effort and
// gives no guarantee on SIGKILL, host crash or a failed removal. The CLI
// subprocess env is closed, but the one-off `npx tsup` build inherits the
// parent environment, PATH and installed toolchain, so the build is not
// hermetic and not a proof of the published package. The ONLY network seam is the CLI's own TEST-ONLY offline hook `FRONTX_TEST_LOCAL_SOURCE_DIR`
// (served for `install`/`update-local` of a `github:` spec); it is set only
// on those calls, and `GITHUB_TOKEN` is never passed through.
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readdir, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withReviewedDigest } from './support/confirm-upgrade';
import { COORDINATION_DIRECTORY } from '../operations/coordination';

const packageRoot = path.resolve(__dirname, '..', '..');

let buildDir: string;
let sandbox: string;

beforeAll(async () => {
  // Created before the build so `afterAll` can always remove it.
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-live-lifecycle-'));
  // The CLI's per-user mutex lives under HOME, which it never creates.
  await mkdir(path.join(sandbox, 'home'));
  buildDir = path.join(sandbox, 'build');
  execFileSync(
    'npx',
    ['tsup', '--no-config', 'src/cli.ts', '--format', 'esm', '--out-dir', buildDir, '--silent'],
    { cwd: packageRoot, stdio: 'pipe' },
  );
}, 180_000);

afterAll(async () => {
  if (sandbox !== undefined) await rm(sandbox, { recursive: true, force: true });
});

// ---------------------------------------------------------------- harness

interface Envelope {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}
interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
  envelope: Envelope;
}

/** Runs the built CLI with `--json`; `extraEnv` is the only way to add env. */
function frontx(cwd: string, inventory: string, args: string[], extraEnv: Record<string, string> = {}): Run {
  return withReviewedDigest(args, (a) => frontxOnce(cwd, inventory, a, extraEnv));
}

function frontxOnce(cwd: string, inventory: string, args: string[], extraEnv: Record<string, string>): Run {
  const result = spawnSync(process.execPath, [path.join(buildDir, 'cli.js'), ...args, '--json'], {
    cwd,
    encoding: 'utf-8',
    timeout: 60_000,
    // A closed, explicit environment: no inherited GITHUB_TOKEN, no real
    // inventory, no real home.
    env: {
      PATH: process.env.PATH ?? '',
      HOME: path.join(sandbox, 'home'),
      FRONTX_INVENTORY_ROOT: inventory,
      ...extraEnv,
    },
  });
  expect(result.error, `spawn failed: ${String(result.error)}`).toBeUndefined();
  let envelope: Envelope;
  try {
    envelope = JSON.parse(result.stdout.trim()) as Envelope;
  } catch {
    throw new Error(`no JSON envelope for "${args.join(' ')}": exit ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, envelope };
}

/**
 * The two-call `--json` delete protocol: a review (`CONFIRMATION_REQUIRED`,
 * writes nothing), then the confirming call stating that review's `planDigest`.
 */
function confirmDelete(runner: (args: string[]) => Run, target: string): Run {
  const review = runner(['delete', target]);
  expect(review.envelope.error?.code, `review of delete ${target}`).toBe('CONFIRMATION_REQUIRED');
  return runner(['delete', target, '--yes', `--plan-digest=${String(review.envelope.error?.details?.planDigest)}`]);
}

interface Files {
  [relative: string]: string;
}

/** Writes an externally-shaped template: four-field manifest plus `files`. */
async function writeTemplate(
  dir: string,
  name: string,
  version: string,
  files: Files,
  binary: Record<string, Buffer> = {},
  excludedSubtrees: string[] = [],
): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, relative)), { recursive: true });
    await writeFile(path.join(dir, relative), content, 'utf-8');
  }
  for (const [relative, content] of Object.entries(binary)) {
    await mkdir(path.dirname(path.join(dir, relative)), { recursive: true });
    await writeFile(path.join(dir, relative), content);
  }
  await writeFile(
    path.join(dir, 'frontx-template.json'),
    JSON.stringify({ name, version, excludedSubtrees, description: `${name} live fixture` }),
    'utf-8',
  );
}

/** Snapshot of a missing root (distinct from an empty directory). */
const ABSENT = '<absent>';
type Snapshot = Record<string, string> | typeof ABSENT;

/** Encodes a regular file's exact bytes for `snapshot` comparison. */
const file = (content: string | Buffer): string => `file:${Buffer.from(content).toString('base64')}`;

/**
 * Every entry under `root` (relative path → `dir` | `file:<base64 bytes>` |
 * `symlink:<target>` | `other:<kind>`), sorted. Symlinks are recorded, never
 * followed. A missing root is `ABSENT`; any other fs error fails the test.
 */
async function snapshot(root: string): Promise<Snapshot> {
  const out: Record<string, string> = {};
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const key = path.relative(root, full);
      if (entry.isSymbolicLink()) out[key] = `symlink:${await readlink(full)}`;
      else if (entry.isDirectory()) {
        out[key] = 'dir';
        await walk(full);
      } else if (entry.isFile()) out[key] = file(await readFile(full));
      else out[key] = 'other:non-regular';
    }
  }
  let rootStat;
  try {
    rootStat = await lstat(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ABSENT;
    throw error;
  }
  if (!rootStat.isDirectory()) return { '.': rootStat.isSymbolicLink() ? 'symlink-root' : 'other:root-not-a-directory' };
  await walk(root);
  return Object.fromEntries(Object.entries(out).sort(([x], [y]) => x.localeCompare(y)));
}

/**
 * A removed target is absent, or leaves only empty directories: no file,
 * symlink or other entry may remain. (Empty directory skeletons such as
 * `app/src` were observed to remain after `delete`; whether that is intended
 * is not ruled on, so it is tolerated, not asserted.)
 */
async function expectRemoved(root: string, label: string): Promise<void> {
  const snap = await snapshot(root);
  const leftovers = snap === ABSENT ? {} : Object.fromEntries(Object.entries(snap).filter(([, kind]) => kind !== 'dir'));
  expect(leftovers, `${label} left non-directory entries`).toEqual({});
}

// The mutation boundary's reservation directory under the inventory root stays
// behind empty after a released transition; any record left in it still compares.
const withoutCoordination = (snap: Snapshot): Record<string, string> =>
  Object.fromEntries(Object.entries(snap as Record<string, string>).filter(([k, v]) => !(v === 'dir' && k.split(path.sep)[0] === COORDINATION_DIRECTORY)));

const batch = (templates: Record<string, string[]>) => JSON.stringify({ templates });
const read = (project: string, relative: string) => readFile(path.join(project, relative), 'utf-8');
const stateText = (project: string) => read(project, '.frontx/project.json');
interface RecordedEntry {
  origin: string;
  version: string;
  targets: string[];
  previous?: { origin: string; version: string };
}
const entryOf = async (project: string, name: string): Promise<RecordedEntry | undefined> =>
  (JSON.parse(await stateText(project)) as { templates: Record<string, RecordedEntry> }).templates[name];
const sortedPaths = (items: unknown): string[] => (items as string[]).slice().sort();
const opsOf = (plan: unknown) =>
  (plan as { operations: { target: string; path: string; op: string }[] }).operations
    .map((o) => `${o.op} ${o.path}`)
    .sort();

// ------------------------------------------------------- template fixtures

const ALPHA_V1: Files = {
  'README.md': 'alpha readme v1\n',
  'src/main.ts': 'export const main = 1;\n',
  '.frontx/ai/@acme/alpha/guide.md': 'alpha ai guide v1\n',
};
const ALPHA_V2: Files = {
  'src/main.ts': 'export const main = 2;\n',
  'src/extra.ts': 'export const extra = true;\n',
  '.frontx/ai/@acme/alpha/guide.md': 'alpha ai guide v2\n',
};
// Non-text bytes that are still valid UTF-8 (NUL, CRLF, a multi-byte char, no
// trailing newline). Bytes that are NOT valid UTF-8 (e.g. 0xff) were observed
// to come out of `apply` and `install` as U+FFFD replacement bytes: the content
// path reads templates as UTF-8. That is not asserted here (no ruling on it).
const ALPHA_V1_BINARY = { 'assets/blob.bin': Buffer.from([0x00, 0x0d, 0x0a, 0xc3, 0xa9, 0x7f, 0x01]) };
const BETA_V1: Files = { 'index.ts': 'export const beta = 1;\n' };

// =========================================================== lifecycle

describe('live CLI lifecycle: register → assemble → apply → upgrade → restore → delete → unregister', () => {
  let project: string;
  let inventory: string;
  const run = (args: string[]) => frontx(project, inventory, args);

  it('runs the whole lifecycle in one sequential test (steps share state by design)', { timeout: 10_000 }, async () => {
    const step = async (title: string, fn: () => unknown): Promise<void> => {
      try {
        await fn();
      } catch (error) {
        throw new Error(`lifecycle step failed: ${title}\n${(error as Error).message}`, { cause: error });
      }
    };

    project = path.join(sandbox, 'proj');
    inventory = path.join(sandbox, 'inv-lifecycle');
    await mkdir(path.join(project, 'docs'), { recursive: true });
    await writeFile(path.join(project, 'docs', 'notes.md'), 'user notes\n', 'utf-8');
    await writeTemplate(path.join(project, 'vendor', 'alpha-v1'), '@acme/alpha', '1.0.0', ALPHA_V1, ALPHA_V1_BINARY);
    await writeTemplate(path.join(project, 'vendor', 'alpha-v2'), '@acme/alpha', '1.1.0', ALPHA_V2);
    await writeTemplate(path.join(project, 'vendor', 'beta'), '@acme/beta', '1.0.0', BETA_V1);
    // A symlink among the user's own files: snapshots must record it, never follow it.
    await symlink('notes.md', path.join(project, 'docs', 'notes-link.md'));
    const docsBefore = await snapshot(path.join(project, 'docs'));
    expect(docsBefore).toEqual({ 'notes-link.md': 'symlink:notes.md', 'notes.md': file('user notes\n') });
    expect(await snapshot(path.join(project, 'does-not-exist'))).toBe(ABSENT);

    let vendorBefore: Snapshot;
    let appAtV1: Snapshot;

    await step('list on a fresh project is three empty collections', () => {
      const r = run(['list']);
      expect(r.status).toBe(0);
      expect(r.envelope).toEqual({ ok: true, data: { defaults: [], registered: [], installed: [] } });
      expect(existsSync(path.join(project, '.frontx'))).toBe(false);
    });

    await step('register records the origin (created), is idempotent (noop), refuses a missing origin', async () => {
      vendorBefore = await snapshot(path.join(project, 'vendor'));

      const created = run(['register', 'path:vendor/alpha-v1']);
      expect(created.status).toBe(0);
      expect(created.envelope).toMatchObject({
        ok: true,
        data: { outcome: 'created', name: '@acme/alpha', entry: { origin: 'path:vendor/alpha-v1', version: '1.0.0', targets: [] } },
      });
      expect(await entryOf(project, '@acme/alpha')).toMatchObject({ origin: 'path:vendor/alpha-v1', version: '1.0.0', targets: [] });

      const again = run(['register', 'path:vendor/alpha-v1']);
      expect(again.status).toBe(0);
      expect(again.envelope).toMatchObject({ ok: true, data: { outcome: 'noop', name: '@acme/alpha' } });

      const beta = run(['register', 'path:vendor/beta']);
      expect(beta.status).toBe(0);
      expect(beta.envelope).toMatchObject({ ok: true, data: { outcome: 'created', name: '@acme/beta' } });

      const stateBefore = await stateText(project);
      const projectBefore = await snapshot(project);
      const missing = run(['register', 'path:vendor/does-not-exist']);
      expect(missing.status).toBe(1);
      expect(missing.envelope.ok).toBe(false);
      expect(typeof missing.envelope.error?.code).toBe('string');
      expect(await stateText(project)).toBe(stateBefore);
      expect(await snapshot(project)).toEqual(projectBefore);
    });

    await step('list reports both registered templates with no targets yet', () => {
      const r = run(['list']);
      expect(r.status).toBe(0);
      expect(r.envelope.ok).toBe(true);
      const data = r.envelope.data as { registered: { name: string; origin: string; version: string; targets: string[] }[]; installed: unknown[] };
      expect(data.registered.map((t) => t.name).sort()).toEqual(['@acme/alpha', '@acme/beta']);
      expect(data.registered.every((t) => t.targets.length === 0)).toBe(true);
      expect(data.installed).toEqual([]);
    });

    await step('apply of an unregistered name is refused and writes nothing', async () => {
      const projectBefore = await snapshot(project);
      const r = run(['apply', '--input', batch({ '@acme/ghost': ['ghost'] })]);
      expect(r.status).toBe(1);
      expect(r.envelope).toMatchObject({ ok: false, error: { code: 'TEMPLATE_NOT_REGISTERED' } });
      expect(existsSync(path.join(project, 'ghost'))).toBe(false);
      expect(await snapshot(project)).toEqual(projectBefore);
    });

    await step('assemble previews the batch and writes nothing', async () => {
      const stateBefore = await stateText(project);
      const projectBefore = await snapshot(project);
      const r = run(['assemble', '--input', batch({ '@acme/alpha': ['app'], '@acme/beta': ['lib'] })]);
      expect(r.status).toBe(0);
      const entries = (r.envelope.data as { entries: { templateName: string; target: string; installedContentPath: string }[] }).entries;
      expect(entries.map((e) => `${e.templateName}→${e.target}`).sort()).toEqual(['@acme/alpha→app', '@acme/beta→lib']);
      expect(existsSync(path.join(project, 'app'))).toBe(false);
      expect(existsSync(path.join(project, 'lib'))).toBe(false);
      expect(await stateText(project)).toBe(stateBefore);
      expect(await snapshot(project)).toEqual(projectBefore);
    });

    await step('apply writes both targets, copies the AI bundle, records targets; validate --project passes', async () => {
      const r = run(['apply', '--input', batch({ '@acme/alpha': ['app'], '@acme/beta': ['lib'] })]);
      expect(r.status).toBe(0);
      expect(r.envelope).toMatchObject({ ok: true });
      expect(r.envelope.data).toEqual({
        applied: [
          { templateName: '@acme/alpha', target: 'app' },
          { templateName: '@acme/beta', target: 'lib' },
        ],
        noop: [],
        skipped: [],
      });

      expect(await read(project, 'app/README.md')).toBe(ALPHA_V1['README.md']);
      expect(await read(project, 'app/src/main.ts')).toBe(ALPHA_V1['src/main.ts']);
      expect(await readFile(path.join(project, 'app/assets/blob.bin'))).toEqual(ALPHA_V1_BINARY['assets/blob.bin']);
      expect(await read(project, 'lib/index.ts')).toBe(BETA_V1['index.ts']);
      // Manifest and AI bundle are not template content under the target.
      expect(existsSync(path.join(project, 'app', 'frontx-template.json'))).toBe(false);
      expect(existsSync(path.join(project, 'app', '.frontx'))).toBe(false);
      expect(await read(project, '.frontx/ai/@acme/alpha/guide.md')).toBe(ALPHA_V1['.frontx/ai/@acme/alpha/guide.md']);

      expect((await entryOf(project, '@acme/alpha'))?.targets).toEqual(['app']);
      expect((await entryOf(project, '@acme/beta'))?.targets).toEqual(['lib']);

      const v = run(['validate', '--project']);
      expect(v.status).toBe(0);
      expect(v.envelope).toEqual({ ok: true, data: { status: 'PASS' } });

      appAtV1 = await snapshot(path.join(project, 'app'));
    });

    await step('applying the same batch again is a noop that changes nothing', async () => {
      const before = { state: await stateText(project), app: await snapshot(path.join(project, 'app')), lib: await snapshot(path.join(project, 'lib')) };
      const r = run(['apply', '--input', batch({ '@acme/alpha': ['app'], '@acme/beta': ['lib'] })]);
      expect(r.status).toBe(0);
      expect(r.envelope).toMatchObject({ ok: true });
      expect(r.envelope.data).toEqual({
        applied: [],
        noop: [
          { templateName: '@acme/alpha', target: 'app' },
          { templateName: '@acme/beta', target: 'lib' },
        ],
        skipped: [],
      });
      expect({ state: await stateText(project), app: await snapshot(path.join(project, 'app')), lib: await snapshot(path.join(project, 'lib')) }).toEqual(before);
    });

    await step('ownership add/list/remove edit only projectOwnedRoots; a missing path is refused', async () => {
      const targetsBefore = (await entryOf(project, '@acme/alpha'))?.targets;

      const added = run(['ownership', 'add', 'docs']);
      expect(added.status).toBe(0);
      expect(added.envelope).toMatchObject({ ok: true, data: { outcome: 'added', path: 'docs', projectOwnedRoots: ['docs'] } });
      expect(JSON.parse(await stateText(project)).projectOwnedRoots).toEqual(['docs']);

      const noop = run(['ownership', 'add', 'docs']);
      expect(noop.status).toBe(0);
      expect(noop.envelope).toMatchObject({ ok: true, data: { outcome: 'noop', projectOwnedRoots: ['docs'] } });

      {
        const l = run(['ownership', 'list']);
        expect(l.status).toBe(0);
        expect(l.envelope).toEqual({ ok: true, data: { projectOwnedRoots: ['docs'] } });
      }

      const beforeMissing = await snapshot(project);
      const missing = run(['ownership', 'add', 'no-such-dir']);
      expect(missing.status).toBe(1);
      expect(missing.envelope).toMatchObject({ ok: false, error: { code: 'INVALID_PATH' } });
      expect(JSON.parse(await stateText(project)).projectOwnedRoots).toEqual(['docs']);
      expect(await snapshot(project)).toEqual(beforeMissing);

      const removed = run(['ownership', 'remove', 'docs']);
      expect(removed.status).toBe(0);
      expect(removed.envelope).toMatchObject({ ok: true, data: { path: 'docs', projectOwnedRoots: [] } });
      expect(JSON.parse(await stateText(project)).projectOwnedRoots).toEqual([]);
      {
        const l = run(['ownership', 'list']);
        expect(l.status).toBe(0);
        expect(l.envelope).toEqual({ ok: true, data: { projectOwnedRoots: [] } });
      }

      // Marking never touches templates' targets or the user's own file.
      expect((await entryOf(project, '@acme/alpha'))?.targets).toEqual(targetsBefore);
      expect(await snapshot(path.join(project, 'docs'))).toEqual(docsBefore);
    });

    await step('unregister is refused while targets are applied, and nothing changes', async () => {
      const projectBefore = await snapshot(project);
      const stateBefore = await stateText(project);
      const r = run(['unregister', '@acme/alpha']);
      expect(r.status).toBe(1);
      expect(r.envelope).toMatchObject({ ok: false, error: { code: 'TARGETS_EXIST', details: { name: '@acme/alpha', targets: ['app'] } } });
      expect(await stateText(project)).toBe(stateBefore);
      expect(await snapshot(project)).toEqual(projectBefore);
    });

    await step('upgrade refuses a locally edited file with CONTENT_CONFLICT and writes nothing', async () => {
      await writeFile(path.join(project, 'app/README.md'), 'edited by the developer\n', 'utf-8');
      const stateBefore = await stateText(project);
      const appBefore = await snapshot(path.join(project, 'app'));

      for (const args of [
        ['upgrade', '@acme/alpha', 'path:vendor/alpha-v2'],
        ['upgrade', '@acme/alpha', 'path:vendor/alpha-v2', '--yes'],
      ]) {
        const r = run(args);
        expect(r.status).toBe(1);
        expect(r.envelope).toMatchObject({
          ok: false,
          error: { code: 'CONTENT_CONFLICT', details: { conflicts: [{ target: 'app', path: 'app/README.md' }] } },
        });
        expect(await stateText(project)).toBe(stateBefore);
        expect(await snapshot(path.join(project, 'app'))).toEqual(appBefore);
      }

      await writeFile(path.join(project, 'app/README.md'), ALPHA_V1['README.md'], 'utf-8');
      expect(await snapshot(path.join(project, 'app'))).toEqual(appAtV1);
    });

    await step('upgrade without --yes shows the plan, requires confirmation and writes nothing', async () => {
      const stateBefore = await stateText(project);
      const projectBefore = await snapshot(project);
      const r = run(['upgrade', '@acme/alpha', 'path:vendor/alpha-v2']);
      expect(r.status).toBe(1);
      expect(r.envelope).toMatchObject({ ok: false, error: { code: 'CONFIRMATION_REQUIRED' } });
      const plan = r.envelope.error?.details?.plan as {
        from: unknown;
        to: unknown;
        targets: string[];
        skipped: unknown[];
      };
      expect(plan.from).toEqual({ origin: 'path:vendor/alpha-v1', version: '1.0.0' });
      expect(plan.to).toEqual({ origin: 'path:vendor/alpha-v2', version: '1.1.0' });
      expect(plan.targets).toEqual(['app']);
      expect(plan.skipped).toEqual([]);
      expect(opsOf(plan)).toEqual(['ADD app/src/extra.ts', 'REMOVE app/README.md', 'REMOVE app/assets/blob.bin', 'REPLACE app/src/main.ts']);
      expect(await stateText(project)).toBe(stateBefore);
      expect(await snapshot(project)).toEqual(projectBefore);
    });

    await step('upgrade --yes applies the plan: files, recorded version, previous generation', async () => {
      const r = run(['upgrade', '@acme/alpha', 'path:vendor/alpha-v2', '--yes']);
      expect(r.status).toBe(0);
      expect(r.envelope).toMatchObject({ ok: true, data: { outcome: 'success', reclaimedTempPaths: [] } });
      expect(opsOf(r.envelope.data?.plan)).toEqual(['ADD app/src/extra.ts', 'REMOVE app/README.md', 'REMOVE app/assets/blob.bin', 'REPLACE app/src/main.ts']);

      // Directories left empty by REMOVE are not asserted either way; files are exact.
      const upgraded = await snapshot(path.join(project, 'app'));
      expect(upgraded).not.toBe(ABSENT);
      expect(Object.fromEntries(Object.entries(upgraded as Record<string, string>).filter(([, v]) => v !== 'dir'))).toEqual({
        [path.join('src', 'extra.ts')]: file(ALPHA_V2['src/extra.ts']),
        [path.join('src', 'main.ts')]: file(ALPHA_V2['src/main.ts']),
      });
      expect(await entryOf(project, '@acme/alpha')).toMatchObject({
        origin: 'path:vendor/alpha-v2',
        version: '1.1.0',
        targets: ['app'],
        previous: { origin: 'path:vendor/alpha-v1', version: '1.0.0' },
      });
      // The other template is untouched.
      expect(await read(project, 'lib/index.ts')).toBe(BETA_V1['index.ts']);

      const v = run(['validate', '--project']);
      expect(v.status).toBe(0);
      expect(v.envelope).toEqual({ ok: true, data: { status: 'PASS' } });
    });

    await step('upgrade --restore: preview writes nothing, --yes returns to the previous origin and bytes', async () => {
      const stateBefore = await stateText(project);
      const appBefore = await snapshot(path.join(project, 'app'));

      const preview = run(['upgrade', '@acme/alpha', '--restore']);
      expect(preview.status).toBe(1);
      expect(preview.envelope).toMatchObject({ ok: false, error: { code: 'CONFIRMATION_REQUIRED' } });
      expect(await stateText(project)).toBe(stateBefore);
      expect(await snapshot(path.join(project, 'app'))).toEqual(appBefore);

      const r = run(['upgrade', '@acme/alpha', '--restore', '--yes']);
      expect(r.status).toBe(0);
      expect(r.envelope).toMatchObject({ ok: true, data: { outcome: 'success' } });
      const plan = r.envelope.data?.plan as { from: unknown; to: unknown };
      expect(plan.from).toEqual({ origin: 'path:vendor/alpha-v2', version: '1.1.0' });
      expect(plan.to).toEqual({ origin: 'path:vendor/alpha-v1', version: '1.0.0' });

      expect(await snapshot(path.join(project, 'app'))).toEqual(appAtV1);
      expect(await entryOf(project, '@acme/alpha')).toMatchObject({ origin: 'path:vendor/alpha-v1', version: '1.0.0', targets: ['app'] });
      {
        const v = run(['validate', '--project']);
        expect(v.status).toBe(0);
        expect(v.envelope).toEqual({ ok: true, data: { status: 'PASS' } });
      }
    });

    await step('delete: dry-run and missing --yes write nothing; --yes removes the target and its AI bundle', async () => {
      const stateBefore = await stateText(project);
      const appBefore = await snapshot(path.join(project, 'app'));
      const expectedDelete = ['app/README.md', 'app/assets/blob.bin', 'app/src/main.ts'];

      const dry = run(['delete', 'app', '--dry-run']);
      expect(dry.status).toBe(0);
      expect(dry.envelope).toMatchObject({ ok: true, data: { target: 'app', toPreserve: [] } });
      expect(sortedPaths(dry.envelope.data?.toDelete)).toEqual(expectedDelete);
      expect(await snapshot(path.join(project, 'app'))).toEqual(appBefore);
      expect(await stateText(project)).toBe(stateBefore);

      const noYes = run(['delete', 'app']);
      expect(noYes.status).toBe(1);
      expect(noYes.envelope).toMatchObject({ ok: false, error: { code: 'CONFIRMATION_REQUIRED', details: { target: 'app' } } });
      expect(sortedPaths(noYes.envelope.error?.details?.toDelete)).toEqual(expectedDelete);
      expect(await snapshot(path.join(project, 'app'))).toEqual(appBefore);
      expect(await stateText(project)).toBe(stateBefore);

      const done = confirmDelete(run, 'app');
      expect(done.status).toBe(0);
      expect(done.envelope).toMatchObject({ ok: true, data: { target: 'app', templateName: '@acme/alpha', wasLastTarget: true } });
      expect(sortedPaths(done.envelope.data?.toDelete)).toEqual(expectedDelete);
      await expectRemoved(path.join(project, 'app'), 'app');
      expect(await snapshot(path.join(project, '.frontx/ai/@acme/alpha'))).toBe(ABSENT);
      expect((await entryOf(project, '@acme/alpha'))?.targets).toEqual([]);
      // The other template and the user's files survive.
      expect(await read(project, 'lib/index.ts')).toBe(BETA_V1['index.ts']);
      expect(await read(project, 'docs/notes.md')).toBe('user notes\n');
    });

    await step('delete of the last target of the second template, then unregister both, leaves a clean project', async () => {
      const del = confirmDelete(run, 'lib');
      expect(del.status).toBe(0);
      expect(del.envelope).toMatchObject({ ok: true, data: { target: 'lib', templateName: '@acme/beta', wasLastTarget: true } });
      await expectRemoved(path.join(project, 'lib'), 'lib');

      for (const name of ['@acme/alpha', '@acme/beta']) {
        const r = run(['unregister', name]);
        expect(r.status).toBe(0);
        expect(r.envelope).toEqual({ ok: true, data: { name } });
        expect(await entryOf(project, name)).toBeUndefined();
      }
      {
        const l = run(['list']);
        expect(l.status).toBe(0);
        expect(l.envelope).toEqual({ ok: true, data: { defaults: [], registered: [], installed: [] } });
      }
      {
        const v = run(['validate', '--project']);
        expect(v.status).toBe(0);
        expect(v.envelope).toEqual({ ok: true, data: { status: 'PASS' } });
      }

      // Neither the vendored template folders nor the user's file were touched
      // by any command in the whole lifecycle.
      expect(await snapshot(path.join(project, 'vendor'))).toEqual(vendorBefore);
      expect(await snapshot(path.join(project, 'docs'))).toEqual(docsBefore);
    });
  });
});

// ================================================== nested lifecycles

const HOST_ENTRY = 'src/plugins/';
const HOST_V1: Files = { 'README.md': 'host readme v1\n', 'src/main.ts': 'export const host = 1;\n' };
const HOST_V2: Files = { 'src/main.ts': 'export const host = 2;\n', 'src/extra.ts': 'export const hostExtra = true;\n' };
const GUEST_V1: Files = {
  'g.txt': 'guest file\n',
  'sub/deep.txt': 'guest deep\n',
  '.frontx/ai/@acme/guest/guide.md': 'guest ai guide\n',
};
const CONFLICT_SHAPE = { code: 'TARGET_CONFLICT' };
const conflictGrounds = (r: Run): string[] =>
  ((r.envelope.error?.details?.conflicts ?? []) as { ground: string }[]).map((c) => c.ground);

describe('live CLI nested lifecycle A: installed host, path guest', () => {
  it('install → register → assemble → apply (nested) → validate → delete host → delete guest → unregister', async () => {
    const step = async (title: string, fn: () => unknown): Promise<void> => {
      try {
        await fn();
      } catch (error) {
        throw new Error(`nested-A step failed: ${title}\n${(error as Error).message}`, { cause: error });
      }
    };
    const project = path.join(sandbox, 'proj-nested-a');
    const inventory = path.join(sandbox, 'inv-nested-a');
    const hostSource = path.join(sandbox, 'sources-nested-a', 'host-v1');
    const hook = { FRONTX_TEST_LOCAL_SOURCE_DIR: hostSource };
    const run = (args: string[]) => frontx(project, inventory, args);
    // Any command that re-resolves the installed host's `github:` origin needs the hook.
    const runHosted = (args: string[]) => frontx(project, inventory, args, hook);
    const nestedBatch = batch({ '@acme/host': ['app'], '@acme/guest': ['app/src/plugins'] });

    await mkdir(path.join(project, 'docs'), { recursive: true });
    await writeFile(path.join(project, 'docs', 'notes.md'), 'user notes\n', 'utf-8');
    await writeTemplate(hostSource, '@acme/host', '1.0.0', HOST_V1, {}, [HOST_ENTRY]);
    await writeTemplate(path.join(project, 'vendor', 'guest'), '@acme/guest', '1.0.0', GUEST_V1);
    const docsBefore = await snapshot(path.join(project, 'docs'));
    const vendorBefore = await snapshot(path.join(project, 'vendor'));

    await step('install puts the host in the inventory (index entry and content bytes)', async () => {
      const r = runHosted(['install', 'github:acme/host@v1.0.0']);
      expect(r.status).toBe(0);
      expect(r.envelope).toEqual({ ok: true, data: { message: 'Installed @acme/host@v1.0.0' } });
      const index = JSON.parse(await readFile(path.join(inventory, 'index.json'), 'utf-8')) as Record<string, { source: string; status: string }>;
      expect(index['@acme/host']).toMatchObject({ source: 'github:acme/host@v1.0.0', status: 'INSTALLED' });
      expect(await readFile(path.join(inventory, '@acme/host', 'src/main.ts'), 'utf-8')).toBe(HOST_V1['src/main.ts']);
      const l = run(['list']);
      expect(l.status).toBe(0);
      expect(l.envelope.data).toMatchObject({ registered: [], installed: [{ name: '@acme/host', origin: 'github:acme/host@v1.0.0', version: '1.0.0' }] });
    });

    await step('register records the installed host with its declared exclusion; the guest registers by path', async () => {
      const host = runHosted(['register', 'github:acme/host@v1.0.0']);
      expect(host.status).toBe(0);
      expect(host.envelope).toMatchObject({
        ok: true,
        data: { outcome: 'created', name: '@acme/host', entry: { origin: 'github:acme/host@v1.0.0', version: '1.0.0', targets: [], excludedSubtrees: [HOST_ENTRY] } },
      });
      const guest = run(['register', 'path:vendor/guest']);
      expect(guest.status).toBe(0);
      expect(guest.envelope).toMatchObject({ ok: true, data: { outcome: 'created', name: '@acme/guest', entry: { origin: 'path:vendor/guest', targets: [] } } });
      expect(await entryOf(project, '@acme/host')).toMatchObject({ origin: 'github:acme/host@v1.0.0', targets: [], excludedSubtrees: [HOST_ENTRY] });
    });

    await step('a guest on host ground that is NOT the reserved entry is refused identically by assemble and apply; nothing is written', async () => {
      const stateBefore = await stateText(project);
      const projectBefore = await snapshot(project);
      const refused = batch({ '@acme/host': ['app'], '@acme/guest': ['app/src/other'] });
      const a = run(['assemble', '--input', refused]);
      const b = run(['apply', '--input', refused]);
      for (const r of [a, b]) {
        expect(r.status).toBe(1);
        expect(r.envelope).toMatchObject({ ok: false, error: CONFLICT_SHAPE });
        expect(conflictGrounds(r)).toEqual(['app contains app/src/other']);
      }
      expect(b.envelope).toEqual(a.envelope);
      expect(await stateText(project)).toBe(stateBefore);
      expect(await snapshot(project)).toEqual(projectBefore);
    });

    await step('assemble previews the nested batch: the composed reserved ground is in the host exclusion roots; nothing is written', async () => {
      const stateBefore = await stateText(project);
      const projectBefore = await snapshot(project);
      const r = run(['assemble', '--input', nestedBatch]);
      expect(r.status).toBe(0);
      expect(r.envelope.ok).toBe(true);
      const entries = (r.envelope.data as { entries: { templateName: string; target: string; exclusionRoots: string[] }[] }).entries;
      expect(entries.map((e) => `${e.templateName}→${e.target}`).sort()).toEqual(['@acme/guest→app/src/plugins', '@acme/host→app']);
      // Contains, not equals: the list also carries `.frontx`, `.git`, local origin folders ….
      expect(entries.find((e) => e.templateName === '@acme/host')?.exclusionRoots).toContain('app/src/plugins/');
      expect(await stateText(project)).toBe(stateBefore);
      expect(await snapshot(project)).toEqual(projectBefore);
    });

    await step('apply writes the host from INSTALLED content and the guest inside the reserved ground', async () => {
      const r = run(['apply', '--input', nestedBatch]);
      expect(r.status).toBe(0);
      expect(r.envelope).toEqual({
        ok: true,
        data: {
          applied: [
            { templateName: '@acme/host', target: 'app' },
            { templateName: '@acme/guest', target: 'app/src/plugins' },
          ],
          noop: [],
          skipped: [],
        },
      });
      expect(await read(project, 'app/README.md')).toBe(HOST_V1['README.md']);
      expect(await read(project, 'app/src/main.ts')).toBe(HOST_V1['src/main.ts']);
      expect(await read(project, 'app/src/plugins/g.txt')).toBe(GUEST_V1['g.txt']);
      expect(await read(project, 'app/src/plugins/sub/deep.txt')).toBe(GUEST_V1['sub/deep.txt']);
      expect(await read(project, '.frontx/ai/@acme/guest/guide.md')).toBe(GUEST_V1['.frontx/ai/@acme/guest/guide.md']);
      expect(existsSync(path.join(project, 'app', 'frontx-template.json'))).toBe(false);
      expect(existsSync(path.join(project, 'app/src/plugins', 'frontx-template.json'))).toBe(false);
      expect((await entryOf(project, '@acme/host'))?.targets).toEqual(['app']);
      expect((await entryOf(project, '@acme/guest'))?.targets).toEqual(['app/src/plugins']);
      const v = runHosted(['validate', '--project']);
      expect(v.status).toBe(0);
      expect(v.envelope).toEqual({ ok: true, data: { status: 'PASS' } });
    });

    await step('re-applying the nested batch is a noop that changes nothing', async () => {
      const before = { state: await stateText(project), app: await snapshot(path.join(project, 'app')) };
      const r = runHosted(['apply', '--input', nestedBatch]);
      expect(r.status).toBe(0);
      expect(r.envelope).toEqual({
        ok: true,
        data: {
          applied: [],
          noop: [
            { templateName: '@acme/host', target: 'app' },
            { templateName: '@acme/guest', target: 'app/src/plugins' },
          ],
          skipped: [],
        },
      });
      expect({ state: await stateText(project), app: await snapshot(path.join(project, 'app')) }).toEqual(before);
    });

    await step('delete of the host preserves the reserved ground: guest files and a developer file inside it survive', async () => {
      await writeFile(path.join(project, 'app/src/plugins/user.txt'), 'developer file\n', 'utf-8');
      const stateBefore = await stateText(project);
      const appBefore = await snapshot(path.join(project, 'app'));

      const dry = runHosted(['delete', 'app', '--dry-run']);
      expect(dry.status).toBe(0);
      expect(dry.envelope.ok).toBe(true);
      expect(sortedPaths(dry.envelope.data?.toDelete)).toEqual(['app/README.md', 'app/src/main.ts']);
      expect(dry.envelope.data?.toPreserve).toContain('app/src/plugins/');
      expect(await snapshot(path.join(project, 'app'))).toEqual(appBefore);
      expect(await stateText(project)).toBe(stateBefore);

      const noYes = runHosted(['delete', 'app']);
      expect(noYes.status).toBe(1);
      expect(noYes.envelope).toMatchObject({ ok: false, error: { code: 'CONFIRMATION_REQUIRED' } });
      expect(await snapshot(path.join(project, 'app'))).toEqual(appBefore);
      expect(await stateText(project)).toBe(stateBefore);

      const done = confirmDelete(runHosted, 'app');
      expect(done.status).toBe(0);
      expect(done.envelope).toMatchObject({ ok: true, data: { target: 'app', templateName: '@acme/host', wasLastTarget: true } });
      expect(existsSync(path.join(project, 'app/README.md'))).toBe(false);
      expect(existsSync(path.join(project, 'app/src/main.ts'))).toBe(false);
      expect(await read(project, 'app/src/plugins/g.txt')).toBe(GUEST_V1['g.txt']);
      expect(await read(project, 'app/src/plugins/sub/deep.txt')).toBe(GUEST_V1['sub/deep.txt']);
      expect(await read(project, 'app/src/plugins/user.txt')).toBe('developer file\n');
      expect((await entryOf(project, '@acme/host'))?.targets).toEqual([]);
      expect((await entryOf(project, '@acme/guest'))?.targets).toEqual(['app/src/plugins']);
    });

    await step('delete of the guest removes its whole target and its AI bundle', async () => {
      const done = confirmDelete(run, 'app/src/plugins');
      expect(done.status).toBe(0);
      expect(done.envelope).toMatchObject({ ok: true, data: { target: 'app/src/plugins', templateName: '@acme/guest', wasLastTarget: true } });
      await expectRemoved(path.join(project, 'app'), 'app');
      expect(await snapshot(path.join(project, '.frontx/ai/@acme/guest'))).toBe(ABSENT);
      expect((await entryOf(project, '@acme/guest'))?.targets).toEqual([]);
    });

    await step('unregister both; the inventory keeps the installed copy; user and vendor files untouched', async () => {
      for (const name of ['@acme/host', '@acme/guest']) {
        const r = run(['unregister', name]);
        expect(r.status).toBe(0);
        expect(r.envelope).toEqual({ ok: true, data: { name } });
        expect(await entryOf(project, name)).toBeUndefined();
      }
      const l = run(['list']);
      expect(l.status).toBe(0);
      expect(l.envelope.data).toMatchObject({ registered: [], installed: [{ name: '@acme/host' }] });
      const v = run(['validate', '--project']);
      expect(v.status).toBe(0);
      expect(v.envelope).toEqual({ ok: true, data: { status: 'PASS' } });
      expect(await snapshot(path.join(project, 'docs'))).toEqual(docsBefore);
      expect(await snapshot(path.join(project, 'vendor'))).toEqual(vendorBefore);
    });
  });
});

describe('live CLI nested lifecycle B: path host and guest through upgrade, refused upgrade, restore, delete', () => {
  it('upgrade keeps the guest, an upgrade that drops the entry is refused, restore returns to the previous host', async () => {
    const step = async (title: string, fn: () => unknown): Promise<void> => {
      try {
        await fn();
      } catch (error) {
        throw new Error(`nested-B step failed: ${title}\n${(error as Error).message}`, { cause: error });
      }
    };
    const project = path.join(sandbox, 'proj-nested-b');
    const inventory = path.join(sandbox, 'inv-nested-b');
    const run = (args: string[]) => frontx(project, inventory, args);
    const nestedBatch = batch({ '@acme/host': ['app'], '@acme/guest': ['app/src/plugins'] });
    const hostApp = (): Promise<Snapshot> => snapshot(path.join(project, 'app'));
    const withoutGuest = (snap: Snapshot): Record<string, string> =>
      Object.fromEntries(Object.entries(snap as Record<string, string>).filter(([k]) => !k.startsWith(path.join('src', 'plugins'))));
    const files = (snap: Snapshot): Record<string, string> =>
      Object.fromEntries(Object.entries(snap as Record<string, string>).filter(([, v]) => v !== 'dir'));

    await writeTemplate(path.join(project, 'vendor', 'host-v1'), '@acme/host', '1.0.0', HOST_V1, {}, [HOST_ENTRY]);
    await writeTemplate(path.join(project, 'vendor', 'host-v2'), '@acme/host', '1.1.0', HOST_V2, {}, [HOST_ENTRY]);
    await writeTemplate(path.join(project, 'vendor', 'host-v3-drops'), '@acme/host', '1.2.0', HOST_V2, {}, []);
    await writeTemplate(path.join(project, 'vendor', 'guest'), '@acme/guest', '1.0.0', GUEST_V1);
    const vendorBefore = await snapshot(path.join(project, 'vendor'));

    let atV1: Snapshot;
    let guestGround: Snapshot;

    await step('register both and apply the nested batch', async () => {
      for (const [spec, name] of [['path:vendor/host-v1', '@acme/host'], ['path:vendor/guest', '@acme/guest']]) {
        const r = run(['register', spec]);
        expect(r.status).toBe(0);
        expect(r.envelope).toMatchObject({ ok: true, data: { outcome: 'created', name } });
      }
      const r = run(['apply', '--input', nestedBatch]);
      expect(r.status).toBe(0);
      expect(r.envelope).toMatchObject({ ok: true, data: { noop: [] } });
      await writeFile(path.join(project, 'app/src/plugins/user.txt'), 'developer file\n', 'utf-8');
      expect(run(['validate', '--project']).envelope).toEqual({ ok: true, data: { status: 'PASS' } });
      atV1 = await hostApp();
      guestGround = await snapshot(path.join(project, 'app/src/plugins'));
      expect(withoutGuest(atV1)).toMatchObject({ 'README.md': file(HOST_V1['README.md']), [path.join('src', 'main.ts')]: file(HOST_V1['src/main.ts']) });
    });

    await step('upgrade of the host to a version that keeps the entry: plan, confirmation, then success without touching the guest', async () => {
      const stateBefore = await stateText(project);
      const projectBefore = await snapshot(project);
      const plan = run(['upgrade', '@acme/host', 'path:vendor/host-v2']);
      expect(plan.status).toBe(1);
      expect(plan.envelope).toMatchObject({ ok: false, error: { code: 'CONFIRMATION_REQUIRED' } });
      const ops = opsOf(plan.envelope.error?.details?.plan);
      expect(ops).toEqual(['ADD app/src/extra.ts', 'REMOVE app/README.md', 'REPLACE app/src/main.ts']);
      expect(await stateText(project)).toBe(stateBefore);
      expect(await snapshot(project)).toEqual(projectBefore);

      const r = run(['upgrade', '@acme/host', 'path:vendor/host-v2', '--yes']);
      expect(r.status).toBe(0);
      expect(r.envelope).toMatchObject({ ok: true, data: { outcome: 'success', reclaimedTempPaths: [] } });
      expect(opsOf(r.envelope.data?.plan)).toEqual(ops);
      const upgraded = await hostApp();
      expect(files(withoutGuest(upgraded))).toEqual({
        [path.join('src', 'extra.ts')]: file(HOST_V2['src/extra.ts']),
        [path.join('src', 'main.ts')]: file(HOST_V2['src/main.ts']),
      });
      expect(await snapshot(path.join(project, 'app/src/plugins'))).toEqual(guestGround);
      expect(await entryOf(project, '@acme/host')).toMatchObject({
        origin: 'path:vendor/host-v2',
        version: '1.1.0',
        targets: ['app'],
        previous: { origin: 'path:vendor/host-v1', version: '1.0.0' },
      });
      expect((await entryOf(project, '@acme/guest'))?.targets).toEqual(['app/src/plugins']);
      expect(run(['validate', '--project']).envelope).toEqual({ ok: true, data: { status: 'PASS' } });
    });

    await step('an upgrade whose candidate DROPS the entry the guest sits on is refused with TARGET_CONFLICT; nothing is written', async () => {
      const stateBefore = await stateText(project);
      const projectBefore = await snapshot(project);
      for (const args of [
        ['upgrade', '@acme/host', 'path:vendor/host-v3-drops'],
        ['upgrade', '@acme/host', 'path:vendor/host-v3-drops', '--yes'],
      ]) {
        const r = run(args);
        expect(r.status).toBe(1);
        expect(r.envelope).toMatchObject({
          ok: false,
          error: {
            code: 'TARGET_CONFLICT',
            details: { conflicts: [{ target: 'app', contestingTarget: 'app/src/plugins', contestingTemplateName: '@acme/guest' }] },
          },
        });
        expect(await stateText(project)).toBe(stateBefore);
        expect(await snapshot(project)).toEqual(projectBefore);
      }
    });

    await step('upgrade --restore returns the host to the previous origin and bytes; the guest and the developer file are untouched', async () => {
      const preview = run(['upgrade', '@acme/host', '--restore']);
      expect(preview.status).toBe(1);
      expect(preview.envelope).toMatchObject({ ok: false, error: { code: 'CONFIRMATION_REQUIRED' } });
      const r = run(['upgrade', '@acme/host', '--restore', '--yes']);
      expect(r.status).toBe(0);
      expect(r.envelope).toMatchObject({ ok: true, data: { outcome: 'success' } });
      expect(await hostApp()).toEqual(atV1);
      expect(await snapshot(path.join(project, 'app/src/plugins'))).toEqual(guestGround);
      expect(await entryOf(project, '@acme/host')).toMatchObject({ origin: 'path:vendor/host-v1', version: '1.0.0', targets: ['app'] });
      expect(run(['validate', '--project']).envelope).toEqual({ ok: true, data: { status: 'PASS' } });
    });

    await step('delete of the guest takes its whole target (developer file too) and the host keeps its files', async () => {
      const hostBefore = withoutGuest(await hostApp());
      const dry = run(['delete', 'app/src/plugins', '--dry-run']);
      expect(dry.status).toBe(0);
      expect(dry.envelope).toMatchObject({ ok: true, data: { target: 'app/src/plugins', toPreserve: [] } });
      expect(sortedPaths(dry.envelope.data?.toDelete)).toEqual(['app/src/plugins/g.txt', 'app/src/plugins/sub/deep.txt', 'app/src/plugins/user.txt']);
      const done = confirmDelete(run, 'app/src/plugins');
      expect(done.status).toBe(0);
      expect(done.envelope).toMatchObject({ ok: true, data: { target: 'app/src/plugins', templateName: '@acme/guest', wasLastTarget: true } });
      await expectRemoved(path.join(project, 'app/src/plugins'), 'app/src/plugins');
      expect(await snapshot(path.join(project, '.frontx/ai/@acme/guest'))).toBe(ABSENT);
      expect(files(withoutGuest(await hostApp()))).toEqual(files(hostBefore));
    });

    await step('delete the host, unregister both; the vendored templates were never touched', async () => {
      const del = confirmDelete(run, 'app');
      expect(del.status).toBe(0);
      expect(del.envelope).toMatchObject({ ok: true, data: { target: 'app', templateName: '@acme/host', wasLastTarget: true } });
      await expectRemoved(path.join(project, 'app'), 'app');
      for (const name of ['@acme/host', '@acme/guest']) {
        const r = run(['unregister', name]);
        expect(r.status).toBe(0);
        expect(r.envelope).toEqual({ ok: true, data: { name } });
      }
      expect(run(['list']).envelope).toEqual({ ok: true, data: { defaults: [], registered: [], installed: [] } });
      expect(run(['validate', '--project']).envelope).toEqual({ ok: true, data: { status: 'PASS' } });
      expect(await snapshot(path.join(project, 'vendor'))).toEqual(vendorBefore);
    });
  });
});

describe('live CLI nested lifecycle C: installed GitHub host, path candidate upgrade, restore to the installed origin', () => {
  it('upgrade of an installed host to a path candidate keeps the guest, a dropping candidate is refused, restore returns to the recorded github origin', async () => {
    const step = async (title: string, fn: () => unknown): Promise<void> => {
      try {
        await fn();
      } catch (error) {
        throw new Error(`nested-C step failed: ${title}\n${(error as Error).message}`, { cause: error });
      }
    };
    const project = path.join(sandbox, 'proj-nested-c');
    const inventory = path.join(sandbox, 'inv-nested-c');
    const hostSource = path.join(sandbox, 'sources-nested-c', 'host-v1');
    // The offline hook serves ONE directory (host v1) for the recorded `github:`
    // origin. It is set on every call that re-resolves that origin (register,
    // apply, the upgrade baseline, restore). The candidate is a local `path:`
    // directory, so no remote v2 is simulated: this is a mixed-origin route.
    const hook = { FRONTX_TEST_LOCAL_SOURCE_DIR: hostSource };
    const run = (args: string[]) => frontx(project, inventory, args);
    const runHosted = (args: string[]) => frontx(project, inventory, args, hook);
    const nestedBatch = batch({ '@acme/host': ['app'], '@acme/guest': ['app/src/plugins'] });
    const hostApp = (): Promise<Snapshot> => snapshot(path.join(project, 'app'));
    const withoutGuest = (snap: Snapshot): Record<string, string> =>
      Object.fromEntries(Object.entries(snap as Record<string, string>).filter(([k]) => !k.startsWith(path.join('src', 'plugins'))));
    const files = (snap: Snapshot): Record<string, string> =>
      Object.fromEntries(Object.entries(snap as Record<string, string>).filter(([, v]) => v !== 'dir'));
    const indexOf = async (): Promise<Record<string, { status: string }>> =>
      JSON.parse(await readFile(path.join(inventory, 'index.json'), 'utf-8')) as Record<string, { status: string }>;
    const expectInventoryRefreshedOnly = async (): Promise<void> => {
      const strip = (snap: Snapshot): Record<string, string> =>
        Object.fromEntries(Object.entries(snap as Record<string, string>).filter(([k]) => k !== 'index.json'));
      expect(strip(withoutCoordination(await snapshot(inventory)))).toEqual(strip(inventoryBefore));
      const index = await indexOf();
      const before = JSON.parse(Buffer.from((inventoryBefore as Record<string, string>)['index.json'].slice('file:'.length), 'base64').toString('utf-8')) as Record<string, { status: string }>;
      expect(index['@acme/host']).toEqual({ ...before['@acme/host'], status: 'UPDATED' });
    };
    const GITHUB_V1 = 'github:acme/host@v1.0.0';

    await writeTemplate(hostSource, '@acme/host', '1.0.0', HOST_V1, {}, [HOST_ENTRY]);
    await writeTemplate(path.join(project, 'vendor', 'host-v2'), '@acme/host', '1.1.0', HOST_V2, {}, [HOST_ENTRY]);
    await writeTemplate(path.join(project, 'vendor', 'host-v3-drops'), '@acme/host', '1.2.0', HOST_V2, {}, []);
    await writeTemplate(path.join(project, 'vendor', 'guest'), '@acme/guest', '1.0.0', GUEST_V1);
    const vendorBefore = await snapshot(path.join(project, 'vendor'));

    let atV1: Snapshot;
    let guestGround: Snapshot;
    let inventoryBefore: Snapshot;

    await step('install the host from github (offline hook), register it and the guest, apply the nested batch', async () => {
      const inst = runHosted(['install', GITHUB_V1]);
      expect(inst.status).toBe(0);
      expect(inst.envelope).toEqual({ ok: true, data: { message: 'Installed @acme/host@v1.0.0' } });
      const host = runHosted(['register', GITHUB_V1]);
      expect(host.status).toBe(0);
      expect(host.envelope).toMatchObject({ ok: true, data: { outcome: 'created', name: '@acme/host', entry: { origin: GITHUB_V1, version: '1.0.0', targets: [] } } });
      const guest = run(['register', 'path:vendor/guest']);
      expect(guest.status).toBe(0);
      expect(guest.envelope).toMatchObject({ ok: true, data: { outcome: 'created', name: '@acme/guest' } });
      const applied = runHosted(['apply', '--input', nestedBatch]);
      expect(applied.status).toBe(0);
      expect(applied.envelope).toMatchObject({ ok: true, data: { noop: [] } });
      await writeFile(path.join(project, 'app/src/plugins/user.txt'), 'developer file\n', 'utf-8');
      const v = runHosted(['validate', '--project']);
      expect(v.status).toBe(0);
      expect(v.envelope).toEqual({ ok: true, data: { status: 'PASS' } });
      atV1 = await hostApp();
      guestGround = await snapshot(path.join(project, 'app/src/plugins'));
      inventoryBefore = await snapshot(inventory);
      expect(withoutGuest(atV1)).toMatchObject({ 'README.md': file(HOST_V1['README.md']), [path.join('src', 'main.ts')]: file(HOST_V1['src/main.ts']) });
      expect(await entryOf(project, '@acme/host')).toMatchObject({ origin: GITHUB_V1, version: '1.0.0', targets: ['app'] });
    });

    await step('upgrade of the installed host to a path candidate: plan, confirmation, then success; the guest and the inventory are untouched', async () => {
      const stateBefore = await stateText(project);
      const projectBefore = await snapshot(project);
      const plan = runHosted(['upgrade', '@acme/host', 'path:vendor/host-v2']);
      expect(plan.status).toBe(1);
      expect(plan.envelope).toMatchObject({ ok: false, error: { code: 'CONFIRMATION_REQUIRED' } });
      const ops = opsOf(plan.envelope.error?.details?.plan);
      expect(ops).toEqual(['ADD app/src/extra.ts', 'REMOVE app/README.md', 'REPLACE app/src/main.ts']);
      expect(await stateText(project)).toBe(stateBefore);
      expect(await snapshot(project)).toEqual(projectBefore);

      const r = runHosted(['upgrade', '@acme/host', 'path:vendor/host-v2', '--yes']);
      expect(r.status).toBe(0);
      expect(r.envelope).toMatchObject({ ok: true, data: { outcome: 'success', reclaimedTempPaths: [] } });
      expect(opsOf(r.envelope.data?.plan)).toEqual(ops);
      expect(files(withoutGuest(await hostApp()))).toEqual({
        [path.join('src', 'extra.ts')]: file(HOST_V2['src/extra.ts']),
        [path.join('src', 'main.ts')]: file(HOST_V2['src/main.ts']),
      });
      expect(await snapshot(path.join(project, 'app/src/plugins'))).toEqual(guestGround);
      expect(await entryOf(project, '@acme/host')).toMatchObject({
        origin: 'path:vendor/host-v2',
        version: '1.1.0',
        targets: ['app'],
        previous: { origin: GITHUB_V1, version: '1.0.0' },
      });
      expect((await entryOf(project, '@acme/guest'))?.targets).toEqual(['app/src/plugins']);
      expect(withoutCoordination(await snapshot(inventory))).toEqual(inventoryBefore);
      expect(run(['validate', '--project']).envelope).toEqual({ ok: true, data: { status: 'PASS' } });
    });

    await step('a candidate that DROPS the entry the guest sits on is refused with TARGET_CONFLICT; nothing is written', async () => {
      const stateBefore = await stateText(project);
      const projectBefore = await snapshot(project);
      for (const args of [
        ['upgrade', '@acme/host', 'path:vendor/host-v3-drops'],
        ['upgrade', '@acme/host', 'path:vendor/host-v3-drops', '--yes'],
      ]) {
        const r = run(args);
        expect(r.status).toBe(1);
        expect(r.envelope).toMatchObject({
          ok: false,
          error: {
            code: 'TARGET_CONFLICT',
            details: { conflicts: [{ target: 'app', contestingTarget: 'app/src/plugins', contestingTemplateName: '@acme/guest' }] },
          },
        });
        expect(await stateText(project)).toBe(stateBefore);
        expect(await snapshot(project)).toEqual(projectBefore);
      }
    });

    await step('upgrade --restore returns the host to the recorded github origin and the exact v1 bytes; the guest and the developer file are untouched', async () => {
      const stateBefore = await stateText(project);
      const projectBefore = await snapshot(project);
      const preview = runHosted(['upgrade', '@acme/host', '--restore']);
      expect(preview.status).toBe(1);
      expect(preview.envelope).toMatchObject({ ok: false, error: { code: 'CONFIRMATION_REQUIRED' } });
      expect(await stateText(project)).toBe(stateBefore);
      expect(await snapshot(project)).toEqual(projectBefore);
      const r = runHosted(['upgrade', '@acme/host', '--restore', '--yes']);
      expect(r.status).toBe(0);
      expect(r.envelope).toMatchObject({ ok: true, data: { outcome: 'success' } });
      expect(await hostApp()).toEqual(atV1);
      expect(await snapshot(path.join(project, 'app/src/plugins'))).toEqual(guestGround);
      expect(await entryOf(project, '@acme/host')).toMatchObject({ origin: GITHUB_V1, version: '1.0.0', targets: ['app'] });
      expect((await entryOf(project, '@acme/guest'))?.targets).toEqual(['app/src/plugins']);
      // Restore re-resolves the recorded github origin and refreshes the installed
      // copy: the installed bytes and the index entry stay the same except `status`
      // (INSTALLED -> UPDATED), which is existing behaviour, asserted as observed.
      await expectInventoryRefreshedOnly();
      const v = runHosted(['validate', '--project']);
      expect(v.status).toBe(0);
      expect(v.envelope).toEqual({ ok: true, data: { status: 'PASS' } });
    });

    await step('delete guest then host, unregister both; the inventory keeps the installed host; vendor files were never touched', async () => {
      const g = confirmDelete(runHosted, 'app/src/plugins');
      expect(g.status).toBe(0);
      expect(g.envelope).toMatchObject({ ok: true, data: { target: 'app/src/plugins', templateName: '@acme/guest', wasLastTarget: true } });
      await expectRemoved(path.join(project, 'app/src/plugins'), 'app/src/plugins');
      expect(await snapshot(path.join(project, '.frontx/ai/@acme/guest'))).toBe(ABSENT);
      const h = confirmDelete(runHosted, 'app');
      expect(h.status).toBe(0);
      expect(h.envelope).toMatchObject({ ok: true, data: { target: 'app', templateName: '@acme/host', wasLastTarget: true } });
      await expectRemoved(path.join(project, 'app'), 'app');
      for (const name of ['@acme/host', '@acme/guest']) {
        const r = run(['unregister', name]);
        expect(r.status).toBe(0);
        expect(r.envelope).toEqual({ ok: true, data: { name } });
      }
      const l = run(['list']);
      expect(l.status).toBe(0);
      expect(l.envelope.data).toMatchObject({ registered: [], installed: [{ name: '@acme/host', origin: GITHUB_V1, version: '1.0.0' }] });
      await expectInventoryRefreshedOnly();
      expect(await snapshot(path.join(project, 'vendor'))).toEqual(vendorBefore);
    });
  });
});

// ======================================== inventory: install / update-local

describe('live CLI inventory: install and update-local through the offline hook', () => {
  it('installs, lists as installed, updates in place, and refuses an unknown identity', async () => {
    const work = path.join(sandbox, 'proj-inventory');
    const inventory = path.join(sandbox, 'inv-install');
    const sourceV1 = path.join(sandbox, 'sources', 'alpha-v1');
    const sourceV2 = path.join(sandbox, 'sources', 'alpha-v2');
    await mkdir(work, { recursive: true });
    await writeTemplate(sourceV1, '@acme/alpha', '1.0.0', ALPHA_V1, ALPHA_V1_BINARY);
    await writeTemplate(sourceV2, '@acme/alpha', '1.1.0', ALPHA_V2);

    const installed = frontx(work, inventory, ['install', 'github:acme/alpha@v1.0.0'], { FRONTX_TEST_LOCAL_SOURCE_DIR: sourceV1 });
    expect(installed.status).toBe(0);
    expect(installed.envelope).toEqual({ ok: true, data: { message: 'Installed @acme/alpha@v1.0.0' } });
    // The inventory on disk holds the installed content (index entry + content tree).
    const afterInstall = await snapshot(inventory);
    expect(afterInstall).not.toBe(ABSENT);
    const indexV1 = JSON.parse(await readFile(path.join(inventory, 'index.json'), 'utf-8')) as Record<string, { source: string; ref: string; status: string }>;
    expect(indexV1['@acme/alpha']).toMatchObject({ source: 'github:acme/alpha@v1.0.0', ref: 'v1.0.0', status: 'INSTALLED' });
    expect(await readFile(path.join(inventory, '@acme/alpha', 'src/main.ts'), 'utf-8')).toBe(ALPHA_V1['src/main.ts']);
    expect(await readFile(path.join(inventory, '@acme/alpha', 'assets/blob.bin'))).toEqual(ALPHA_V1_BINARY['assets/blob.bin']);

    const listed = frontx(work, inventory, ['list']);
    expect(listed.status).toBe(0);
    expect(listed.envelope.data).toMatchObject({
      defaults: [],
      registered: [],
      installed: [{ name: '@acme/alpha', origin: 'github:acme/alpha@v1.0.0', version: '1.0.0' }],
    });

    const updated = frontx(work, inventory, ['update-local', '@acme/alpha', 'github:acme/alpha@v1.1.0'], {
      FRONTX_TEST_LOCAL_SOURCE_DIR: sourceV2,
    });
    expect(updated.status).toBe(0);
    expect(updated.envelope).toMatchObject({ ok: true, data: { message: expect.stringContaining('@acme/alpha') } });
    const indexV2 = JSON.parse(await readFile(path.join(inventory, 'index.json'), 'utf-8')) as Record<string, { source: string; ref: string }>;
    expect(indexV2['@acme/alpha']).toMatchObject({ source: 'github:acme/alpha@v1.1.0', ref: 'v1.1.0' });
    expect(await readFile(path.join(inventory, '@acme/alpha', 'src/main.ts'), 'utf-8')).toBe(ALPHA_V2['src/main.ts']);
    expect(await readFile(path.join(inventory, '@acme/alpha', 'src/extra.ts'), 'utf-8')).toBe(ALPHA_V2['src/extra.ts']);
    expect(frontx(work, inventory, ['list']).envelope.data).toMatchObject({
      installed: [{ name: '@acme/alpha', origin: 'github:acme/alpha@v1.1.0', version: '1.1.0' }],
    });

    const afterUpdate = await snapshot(inventory);
    const unknown = frontx(work, inventory, ['update-local', '@acme/never-installed', 'github:acme/alpha@v1.1.0'], {
      FRONTX_TEST_LOCAL_SOURCE_DIR: sourceV2,
    });
    expect(unknown.status).toBe(1);
    expect(unknown.envelope).toMatchObject({ ok: false, error: { code: 'TEMPLATE_NOT_REGISTERED' } });
    expect(await snapshot(inventory)).toEqual(afterUpdate);
  });
});

// ============================================== validate <templateDir>

describe('live CLI validate <templateDir>', () => {
  it('passes a well-formed template and rejects a manifest that breaks the contract', async () => {
    const work = path.join(sandbox, 'proj-validate');
    const inventory = path.join(sandbox, 'inv-validate');
    await mkdir(work, { recursive: true });
    await writeTemplate(path.join(work, 'good'), '@acme/good', '1.0.0', { 'a.txt': 'a\n' });
    await mkdir(path.join(work, 'bad'), { recursive: true });
    await writeFile(path.join(work, 'bad', 'a.txt'), 'a\n', 'utf-8');
    // `version` and `description` are absent: not a four-field manifest.
    await writeFile(path.join(work, 'bad', 'frontx-template.json'), JSON.stringify({ name: '@acme/bad' }), 'utf-8');
    await mkdir(path.join(work, 'empty'), { recursive: true });

    const good = frontx(work, inventory, ['validate', 'good']);
    expect(good.status).toBe(0);
    expect(good.envelope).toMatchObject({ ok: true, data: { status: 'PASS' } });

    const bad = frontx(work, inventory, ['validate', 'bad']);
    expect(bad.status).toBe(1);
    expect(bad.envelope.ok).toBe(false);
    expect(bad.envelope).toMatchObject({ ok: false, error: { code: 'INVALID_MANIFEST' } });
    expect((bad.envelope.error?.details?.violations as { field: string }[]).map((v) => v.field).sort()).toEqual(['description', 'excludedSubtrees', 'version']);

    const absent = frontx(work, inventory, ['validate', 'empty']);
    expect(absent.status).toBe(1);
    expect(absent.envelope).toMatchObject({ ok: false, error: { code: 'INVALID_MANIFEST' } });
  });
});

// ========================================================= seed (refusal)

describe('live CLI seed with an empty official-defaults map', () => {
  it('refuses a template that is not an official default and leaves the directory untouched', async () => {
    const work = path.join(sandbox, 'proj-seed');
    const inventory = path.join(sandbox, 'inv-seed');
    const dir = path.join(work, 'fresh');
    await mkdir(dir, { recursive: true });

    // Supported flow today: `list` reports no defaults, so no `seed` can
    // succeed; the success path is skipped (no honest default origin exists).
    expect(frontx(work, inventory, ['list']).envelope.data).toMatchObject({ defaults: [] });

    const workBefore = await snapshot(work);
    const r = frontx(work, inventory, ['seed', dir, '--input', batch({ '@acme/alpha': ['.'] })]);
    expect(r.status).toBe(1);
    expect(r.envelope).toMatchObject({ ok: false, error: { code: 'TEMPLATE_NOT_REGISTERED', details: { name: '@acme/alpha' } } });
    expect(await readdir(dir)).toEqual([]);
    expect(await snapshot(work)).toEqual(workBefore);

    const missingDir = frontx(work, inventory, ['seed', path.join(work, 'nope'), '--input', batch({ '@acme/alpha': ['.'] })]);
    expect(missingDir.status).toBe(1);
    expect(missingDir.envelope).toMatchObject({ ok: false, error: { code: 'INVALID_PATH' } });
    expect(await snapshot(work)).toEqual(workBefore);
  });
});

describe('live CLI nested AI symlink deletion', () => {
  it('shows nested link type in preview and removes links without touching live or dangling targets', async () => {
    const project = path.join(sandbox, 'proj-ai-links');
    const inventory = path.join(sandbox, 'inv-ai-links');
    const template = path.join(project, 'vendor', 'ai-link-template');
    await writeTemplate(template, 'ai-link-template', '1.0.0', { 'src/a.ts': 'export {};' });
    await mkdir(path.join(template, '.frontx/ai/ai-link-template'), { recursive: true });
    await writeFile(path.join(template, '.frontx/ai/ai-link-template/guide.md'), 'guide');
    expect(frontx(project, inventory, ['register', 'path:vendor/ai-link-template']).status).toBe(0);
    expect(frontx(project, inventory, ['apply', '--input', batch({ 'ai-link-template': ['app'] })]).status).toBe(0);

    const bundle = path.join(project, '.frontx/ai/ai-link-template');
    const liveTarget = path.join(project, 'outside-live.txt');
    const danglingTarget = path.join(project, 'outside-missing.txt');
    await writeFile(liveTarget, 'keep this');
    await symlink(liveTarget, path.join(bundle, 'live.md'));
    await symlink(danglingTarget, path.join(bundle, 'dangling.md'));

    const review = frontx(project, inventory, ['delete', 'app']);
    expect(review.status).toBe(1);
    expect(review.envelope.error?.code).toBe('CONFIRMATION_REQUIRED');
    const aiFiles = review.envelope.error?.details?.aiBundle as { tree?: { files?: { path: string; linkTarget?: string }[] } };
    expect(aiFiles.tree?.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'live.md', linkTarget: liveTarget }),
      expect.objectContaining({ path: 'dangling.md', linkTarget: danglingTarget }),
    ]));
    const confirmed = confirmDelete((args) => frontx(project, inventory, args), 'app');
    expect(confirmed.status).toBe(0);
    expect(await readFile(liveTarget, 'utf8')).toBe('keep this');
    expect(await lstat(path.join(bundle, 'live.md')).catch(() => undefined)).toBeUndefined();
    expect(await lstat(path.join(bundle, 'dangling.md')).catch(() => undefined)).toBeUndefined();
  });

  it('returns a JSON conflict envelope when a destination symlink conflicts with a candidate directory', async () => {
    const project = path.join(sandbox, 'proj-ai-link-conflict');
    const inventory = path.join(sandbox, 'inv-ai-link-conflict');
    const v1 = path.join(project, 'vendor', 'ai-conflict-v1');
    const v2 = path.join(project, 'vendor', 'ai-conflict-v2');
    await writeTemplate(v1, 'ai-conflict', '1.0.0', { 'src/a.ts': 'export {};' });
    await writeTemplate(v2, 'ai-conflict', '2.0.0', { 'src/a.ts': 'export {};\n' });
    await mkdir(path.join(v1, '.frontx/ai/ai-conflict'), { recursive: true });
    await writeFile(path.join(v1, '.frontx/ai/ai-conflict/guide.md'), 'guide');
    await mkdir(path.join(v2, '.frontx/ai/ai-conflict/docs'), { recursive: true });
    await writeFile(path.join(v2, '.frontx/ai/ai-conflict/docs/a.md'), 'candidate');
    expect(frontx(project, inventory, ['register', 'path:vendor/ai-conflict-v1']).status).toBe(0);
    expect(frontx(project, inventory, ['apply', '--input', batch({ 'ai-conflict': ['app'] })]).status).toBe(0);

    const bundle = path.join(project, '.frontx/ai/ai-conflict');
    const target = path.join(project, 'owned-docs');
    await mkdir(target);
    await writeFile(path.join(target, 'keep.md'), 'preserve');
    await rm(path.join(bundle, 'guide.md'));
    await symlink(target, path.join(bundle, 'docs'), 'dir');
    const before = await readFile(path.join(target, 'keep.md'), 'utf8');

    const refused = frontx(project, inventory, ['upgrade', 'ai-conflict', 'path:vendor/ai-conflict-v2']);
    expect(refused.status).toBe(1);
    expect(refused.envelope).toMatchObject({ ok: false, error: { code: 'CONTENT_CONFLICT' } });
    expect(refused.stdout.trim().startsWith('{')).toBe(true);
    expect(await readFile(path.join(target, 'keep.md'), 'utf8')).toBe(before);
  });
});
