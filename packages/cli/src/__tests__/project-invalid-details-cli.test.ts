// @cpt-flow:cpt-frontx-flow-composed-provenance-validate-project:p1
//
// Review r23 (Q23-3, Q23-4, Q23-2): the structured `PROJECT_INVALID` answer
// carries the same `details` whichever command noticed the unusable state, a
// refused spelling says truthfully what can be done about it, and a
// `RETAINED_GROUND` skip names the ground that holds the path. Drives the BUILT
// executable.
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { withReviewedDigest } from './support/confirm-upgrade';

const packageRoot = path.resolve(__dirname, '..', '..');
let buildDir: string;
let sandbox: string | undefined;

beforeAll(async () => {
  buildDir = await mkdtemp(path.join(tmpdir(), 'frontx-cli-build-'));
  execFileSync('npx', ['tsup', '--no-config', 'src/cli.ts', '--format', 'esm', '--out-dir', buildDir, '--silent'], {
    cwd: packageRoot,
    stdio: 'pipe',
  });
}, 120_000);

afterAll(async () => {
  await rm(buildDir, { recursive: true, force: true });
});

afterEach(async () => {
  if (sandbox !== undefined) await rm(sandbox, { recursive: true, force: true });
  sandbox = undefined;
});

type Envelope = {
  ok: boolean;
  data: { plan?: { skipped: { path: string; reason: string }[] }; registered?: Record<string, unknown>[] };
  error: { code: string; message: string; details?: Record<string, unknown> };
};

function run(project: string, input: string | undefined, ...args: string[]): { status: number | null; stdout: string } {
  const result = spawnSync(process.execPath, [path.join(buildDir, 'cli.js'), ...args], {
    cwd: project,
    encoding: 'utf-8',
    ...(input !== undefined ? { input } : {}),
    timeout: 60_000,
  });
  return { status: result.status, stdout: result.stdout };
}
const cli = (project: string, ...args: string[]) =>
  withReviewedDigest(args, (a) => {
    const out = run(project, undefined, ...a, '--json');
    return { status: out.status, envelope: JSON.parse(out.stdout) as Envelope };
  });

async function template(project: string, folder: string, name: string, version: string, excluded: string[], files: Record<string, string>) {
  await mkdir(path.join(project, folder), { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(project, folder, relative)), { recursive: true });
    await writeFile(path.join(project, folder, relative), content, 'utf-8');
  }
  await writeFile(
    path.join(project, folder, 'frontx-template.json'),
    JSON.stringify({ name, version, excludedSubtrees: excluded, description: 'fixture' }),
    'utf-8',
  );
}

const statePath = (project: string) => path.join(project, '.frontx', 'project.json');
async function editState(project: string, edit: (state: { templates: Record<string, Record<string, unknown>>; projectOwnedRoots: string[] }) => void) {
  const state = JSON.parse(await readFile(statePath(project), 'utf-8'));
  edit(state);
  await writeFile(statePath(project), JSON.stringify(state, null, 2), 'utf-8');
}

async function appliedProject(): Promise<string> {
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-cli-invalid-'));
  const project = sandbox;
  await template(project, 't1', '@x/t', '1.0.0', [], { 't.txt': 'T1' });
  await template(project, 't2', '@x/t', '2.0.0', [], { 't.txt': 'T2' });
  expect(cli(project, 'register', 'path:t1').envelope.ok).toBe(true);
  expect(cli(project, 'apply', '--input', JSON.stringify({ templates: { '@x/t': ['app'] } })).envelope.ok).toBe(true);
  return project;
}

describe('PROJECT_INVALID details do not depend on the command (built CLI)', () => {
  it('names the offending target the same way in every command, with a truthful repair', async () => {
    const project = await appliedProject();
    await mkdir(path.join(project, 'src'), { recursive: true });
    await editState(project, (state) => {
      state.templates['@x/t'].targets = ['x/../app'];
    });
    const attempts: string[][] = [
      ['validate', '--project'],
      ['list'],
      ['apply', '--input', JSON.stringify({ templates: { '@x/t': ['other'] } })],
      ['delete', 'app', '--yes'],
      ['upgrade', '@x/t', 'path:t2', '--yes'],
      ['unregister', '@x/t'],
      ['ownership', 'add', 'src'],
      ['register', 'path:t2', '--replace'],
    ];
    for (const args of attempts) {
      const { status, envelope } = cli(project, ...args);
      expect(status, args.join(' ')).toBe(1);
      expect(envelope.error.code, args.join(' ')).toBe('PROJECT_INVALID');
      expect(envelope.error.details, args.join(' ')).toMatchObject({ name: '@x/t', target: 'x/../app', suggested: 'app' });
    }
    const message = cli(project, 'unregister', '@x/t').envelope.error.message;
    expect(message).toContain('No frontx command can correct it');
    expect(message).toContain('replace "x/../app" with "app"');
  });

  it('names an aliased ownership root in apply, delete and upgrade as validate does', async () => {
    const project = await appliedProject();
    await mkdir(path.join(project, 'real', 'src'), { recursive: true });
    await symlink('real', path.join(project, 'link'));
    await editState(project, (state) => {
      state.projectOwnedRoots = ['link/src'];
    });
    const attempts: string[][] = [
      ['validate', '--project'],
      ['apply', '--input', JSON.stringify({ templates: { '@x/t': ['other'] } })],
      ['delete', 'app', '--yes'],
      ['upgrade', '@x/t', 'path:t2', '--yes'],
    ];
    for (const args of attempts) {
      const { envelope } = cli(project, ...args);
      expect(envelope.error.code, args.join(' ')).toBe('PROJECT_INVALID');
      expect(envelope.error.details, args.join(' ')).toEqual({ path: 'link/src' });
    }
  });

  it('gives a spelling with no safe normalisation a repair that decides nothing for the person', async () => {
    const project = await appliedProject();
    await editState(project, (state) => {
      state.templates['@x/t'].targets = ['../outside'];
    });
    const { envelope } = cli(project, 'list');
    expect(envelope.error.details).toEqual({ name: '@x/t', target: '../outside' });
    expect(envelope.error.message).toContain('Edit .frontx/project.json by hand so the entry names a location inside the project');
  });
});

describe('RETAINED_GROUND names its holder (built CLI)', () => {
  async function markedProject(): Promise<string> {
    sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-cli-holder-'));
    const project = sandbox;
    await template(project, 'h1', '@x/h', '1.0.0', [], { 'h.txt': 'H', 'extra/e.txt': 'E' });
    await template(project, 'h2', '@x/h', '2.0.0', ['extra/'], { 'h.txt': 'H' });
    await template(project, 'k1', '@x/k', '1.0.0', [], { 'k.txt': 'K1' });
    await template(project, 'k2', '@x/k', '2.0.0', [], { 'k.txt': 'K2' });
    for (const origin of ['h1', 'k1']) expect(cli(project, 'register', `path:${origin}`).envelope.ok).toBe(true);
    expect(cli(project, 'apply', '--input', JSON.stringify({ templates: { '@x/h': ['app'] } })).envelope.ok).toBe(true);
    expect(cli(project, 'upgrade', '@x/h', 'path:h2', '--yes').envelope.ok).toBe(true);
    expect(cli(project, 'apply', '--input', JSON.stringify({ templates: { '@x/k': ['app/extra'] } }), '--adopt-existing').envelope.ok).toBe(true);
    return project;
  }

  it('reports the holding template and ground in --json and in the human note', async () => {
    const project = await markedProject();
    const preview = cli(project, 'upgrade', '@x/k', 'path:k2');
    expect(preview.envelope.error.details).toMatchObject({
      plan: {
        skipped: [{ path: 'app/extra/k.txt', reason: 'RETAINED_GROUND' }],
        retainedGround: [{ template: '@x/h', ground: 'app/extra' }],
      },
    });
    const human = run(project, 'n\n', 'upgrade', '@x/k', 'path:k2');
    expect(human.stdout).toContain('The ground is recorded by @x/h at app/extra');
  });

  it('lists the mark and the retained ground of a registered entry', async () => {
    const project = await markedProject();
    const listed = cli(project, 'list');
    const host = listed.envelope.data.registered?.find((entry) => entry.name === '@x/h');
    expect(host).toMatchObject({ exclusionsBackfilled: true, relinquishedGround: ['app/extra'] });
  });
});
