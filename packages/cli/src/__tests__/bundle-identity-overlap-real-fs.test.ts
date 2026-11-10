// @cpt-flow:cpt-frontx-flow-cli-invocation-run-command:p1
//
// BUNDLE-IDENTITY OVERLAP. A template's AI bundle is materialized at
// `.frontx/ai/<name>/`, and the bundle step clears and removes that directory
// recursively and BY NAME. Two registered names whose directories coincide or
// nest (`@x/a` and `@x/a/b`; on a case-insensitive volume `@x/a` and `@x/A`)
// therefore let one template's delete / upgrade / restore destroy the other's
// materialized bundle while it stays registered and applied.
//
// Drives the freshly BUILT `frontx` executable (the only dispatch path a user
// has) against externally-shaped disposable templates on a real filesystem:
//   - registration is refused in BOTH orders, writing nothing;
//   - the SAME batch is judged over the prospective state: two names in one
//     `apply`/`assemble` whose directories nest are refused before any write,
//     in either order, whether or not either carries a bundle or a target;
//   - a state that already holds an overlap is refused FAIL-CLOSED before any
//     destructive step by delete, upgrade, restore and apply — in BOTH
//     directions, because a parent bundle may itself ship files inside the
//     nested name's directory (`@x/a` shipping `b/parent.md`), which the
//     nested name's clear would destroy — with every bundle byte untouched;
//   - `validate --project` diagnoses that state and states the remedy that is
//     actually available (unregister a name with no applied target; otherwise
//     the state is reconciled outside the CLI — nothing is repaired silently);
//   - an unrelated template's bundle survives every step.
// The overlapping state is CONSTRUCTED here (a rename on disk after two
// disjoint registrations): this build's sequential `register` cannot create
// it, and no claim is made that it is a state a released build wrote.
// The case-only variant is asserted through the same filesystem-identity
// contract the rest of the CLI uses (`isVolumeCaseInsensitive`): refused where
// the volume folds case, accepted where it does not. This suite takes no
// position on a portable case policy (pending ruling).
//
// Isolation: every project, inventory and home directory lives under one
// `mkdtemp` sandbox (inside `TMPDIR`) removed in `afterAll`; the one-off tsup
// build writes into it too.
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isVolumeCaseInsensitive } from '../paths/volume-case';
import { withReviewedDigest } from './support/confirm-upgrade';

const packageRoot = path.resolve(__dirname, '..', '..');

let buildDir: string;
let sandbox: string;
let counter = 0;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-bundle-overlap-'));
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

interface Envelope {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}
interface Run {
  status: number | null;
  envelope: Envelope;
}

function frontx(project: string, inventory: string, args: string[]): Run {
  return withReviewedDigest(args, (a) => frontxOnce(project, inventory, a));
}

function frontxOnce(project: string, inventory: string, args: string[]): Run {
  const result = spawnSync(process.execPath, [path.join(buildDir, 'cli.js'), ...args, '--json'], {
    cwd: project,
    encoding: 'utf-8',
    timeout: 60_000,
    env: { PATH: process.env.PATH ?? '', HOME: path.join(sandbox, 'home'), FRONTX_INVENTORY_ROOT: inventory },
  });
  expect(result.error, `spawn failed: ${String(result.error)}`).toBeUndefined();
  let envelope: Envelope;
  try {
    envelope = JSON.parse(result.stdout.trim()) as Envelope;
  } catch {
    throw new Error(`no JSON envelope for "${args.join(' ')}": exit ${result.status}\n${result.stdout}\n${result.stderr}`);
  }
  return { status: result.status, envelope };
}

/** A template folder with one payload file and an AI bundle carrying its own name. */
async function writeTemplate(
  dir: string,
  name: string,
  version: string,
  options: { bundle?: boolean; extraBundleFiles?: Record<string, string> } = {},
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 't.txt'), `${name} ${version}\n`, 'utf-8');
  if (options.bundle !== false) {
    await mkdir(path.join(dir, '.frontx', 'ai', name), { recursive: true });
    await writeFile(path.join(dir, '.frontx', 'ai', name, 'SKILL.md'), `bundle of ${name} ${version}\n`, 'utf-8');
    for (const [rel, text] of Object.entries(options.extraBundleFiles ?? {})) {
      await mkdir(path.dirname(path.join(dir, '.frontx', 'ai', name, rel)), { recursive: true });
      await writeFile(path.join(dir, '.frontx', 'ai', name, rel), text, 'utf-8');
    }
  }
  await writeFile(
    path.join(dir, 'frontx-template.json'),
    JSON.stringify({ name, version, excludedSubtrees: [], description: `${name} fixture` }),
    'utf-8',
  );
}

/** The two-call delete protocol: review (writes nothing), then confirm with the reviewed plan's digest. */
function confirmDelete(f: { run: (args: string[]) => Run }, target: string): Run {
  const review = f.run(['delete', target]);
  expect(review.envelope.error?.code, `review of delete ${target}`).toBe('CONFIRMATION_REQUIRED');
  return f.run(['delete', target, '--yes', `--plan-digest=${String(review.envelope.error?.details?.planDigest)}`]);
}

interface Fixture {
  project: string;
  run: (args: string[]) => Run;
  state: () => Promise<{ templates: Record<string, { origin: string; version: string; targets: string[] }> }>;
  bundle: (name: string) => Promise<string | null>;
}

async function fixture(): Promise<Fixture> {
  const root = path.join(sandbox, `case-${(counter += 1)}`);
  const project = path.join(root, 'project');
  const inventory = path.join(root, 'inventory');
  await mkdir(project, { recursive: true });
  const run = (args: string[]) => frontx(project, inventory, args);
  return {
    project,
    run,
    state: async () => JSON.parse(await readFile(path.join(project, '.frontx', 'project.json'), 'utf-8')),
    bundle: async (name) => {
      try {
        return await readFile(path.join(project, '.frontx', 'ai', name, 'SKILL.md'), 'utf-8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
  };
}

const batch = (templates: Record<string, string[]>) => JSON.stringify({ templates });

async function tree(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(`${path.relative(root, full)}=${(await readFile(full)).toString('base64')}`);
    }
  }
  try {
    await lstat(root);
  } catch {
    return [];
  }
  await walk(root);
  return out.sort();
}

const PARENT_NESTED = 'parent managed bytes\n';

/**
 * A CONSTRUCTED state: `@x/a` (target `pa`) and the nested `@x/a/b` (target
 * `pb`), plus an unrelated `@x/c` (target `pc`). Built through the real CLI
 * under non-overlapping names, then the second name is renamed on disk (state
 * key, bundle directory, vendored manifest) — no code path in this build can
 * create it. `parentNested` makes the parent's own bundle ship
 * `b/parent.md`, i.e. bytes inside the nested name's directory (the parent
 * applied last, so they are on disk). `childApplied: false` leaves the nested
 * name registered with no target.
 */
async function overlappedProject(
  options: { parentNested?: boolean; childApplied?: boolean } = {},
): Promise<Fixture> {
  const childApplied = options.childApplied !== false;
  const f = await fixture();
  const v = (name: string) => path.join(f.project, 'vendor', name);
  const parentExtra = options.parentNested ? { 'b/parent.md': PARENT_NESTED } : undefined;
  await writeTemplate(v('a'), '@x/a', '1.0.0', { extraBundleFiles: parentExtra });
  await writeTemplate(v('a2'), '@x/a', '1.1.0', { extraBundleFiles: parentExtra });
  await writeTemplate(v('b'), '@x/b-temp', '1.0.0');
  await writeTemplate(v('c'), '@x/c', '1.0.0');
  for (const origin of ['a', 'b', 'c']) expect(f.run(['register', `path:vendor/${origin}`]).envelope.ok).toBe(true);
  const applied: Record<string, string[]> = { '@x/a': ['pa'], '@x/c': ['pc'] };
  if (childApplied) applied['@x/b-temp'] = ['pb'];
  expect(f.run(['apply', '--input', batch(applied)]).envelope.ok).toBe(true);

  const stateFile = path.join(f.project, '.frontx', 'project.json');
  const doc = JSON.parse(await readFile(stateFile, 'utf-8')) as { templates: Record<string, unknown> };
  doc.templates['@x/a/b'] = doc.templates['@x/b-temp'];
  delete doc.templates['@x/b-temp'];
  await writeFile(stateFile, JSON.stringify(doc, null, 2), 'utf-8');
  if (childApplied) {
    // Child bundle moved under the parent's directory; the parent, applied last, keeps its own nested bytes.
    const parentDir = path.join(f.project, '.frontx', 'ai', '@x', 'a');
    await mkdir(parentDir, { recursive: true });
    await rm(path.join(parentDir, 'b'), { recursive: true, force: true });
    await rename(path.join(f.project, '.frontx', 'ai', '@x', 'b-temp'), path.join(parentDir, 'b'));
    await writeFile(path.join(parentDir, 'b', 'SKILL.md'), 'bundle of @x/a/b 1.0.0\n', 'utf-8');
    if (options.parentNested) await writeFile(path.join(parentDir, 'b', 'parent.md'), PARENT_NESTED, 'utf-8');
  }
  // The vendored folder of the renamed template now declares its new name.
  await rm(v('b'), { recursive: true });
  await writeTemplate(v('b'), '@x/a/b', '1.0.0');
  expect(await f.bundle('@x/a')).toBe('bundle of @x/a 1.0.0\n');
  if (childApplied) expect(await f.bundle('@x/a/b')).toBe('bundle of @x/a/b 1.0.0\n');
  return f;
}

describe('NFC/NFD template identity collision', () => {
  it('refuses second registration without changing state or the first AI bundle; distinct names remain valid', async () => {
    const f = await fixture();
    await writeTemplate(path.join(f.project, 'vendor', 'one'), 'caf\u00e9', '1.0.0');
    await writeTemplate(path.join(f.project, 'vendor', 'two'), 'cafe\u0301', '1.0.0');
    await writeTemplate(path.join(f.project, 'vendor', 'three'), 'cafe', '1.0.0');
    expect(f.run(['register', 'path:vendor/one']).envelope.ok).toBe(true);
    const before = await readFile(path.join(f.project, '.frontx', 'project.json'), 'utf-8');
    const bundleBefore = await f.bundle('caf\u00e9');
    const refused = f.run(['register', 'path:vendor/two']);
    expect(refused.envelope.error?.code).toBe('REGISTRATION_CONFLICT');
    expect(await readFile(path.join(f.project, '.frontx', 'project.json'), 'utf-8')).toBe(before);
    expect(await f.bundle('caf\u00e9')).toBe(bundleBefore);
    expect(f.run(['register', 'path:vendor/three']).envelope.ok).toBe(true);
    expect(await f.bundle('caf\u00e9')).toBe(bundleBefore);
  });
});

describe('registration refuses overlapping bundle identities, in both orders', () => {
  for (const [first, second] of [
    ['@x/a', '@x/a/b'],
    ['@x/a/b', '@x/a'],
  ] as const) {
    it(`${first} then ${second}: the second is refused and nothing is written`, async () => {
      const f = await fixture();
      await writeTemplate(path.join(f.project, 'vendor', 'one'), first, '1.0.0');
      await writeTemplate(path.join(f.project, 'vendor', 'two'), second, '1.0.0');
      expect(f.run(['register', 'path:vendor/one']).envelope.ok).toBe(true);
      const before = await readFile(path.join(f.project, '.frontx', 'project.json'), 'utf-8');

      const refused = f.run(['register', 'path:vendor/two']);
      expect(refused.status).not.toBe(0);
      expect(refused.envelope.ok).toBe(false);
      expect(refused.envelope.error?.code).toBe('REGISTRATION_CONFLICT');
      expect(refused.envelope.error?.details).toMatchObject({ name: second, overlapping: [first] });
      expect(await readFile(path.join(f.project, '.frontx', 'project.json'), 'utf-8')).toBe(before);
      expect(Object.keys((await f.state()).templates)).toEqual([first]);
    });
  }

  it('a disjoint sibling name (@x/ab) is still registered', async () => {
    const f = await fixture();
    await writeTemplate(path.join(f.project, 'vendor', 'one'), '@x/a', '1.0.0');
    await writeTemplate(path.join(f.project, 'vendor', 'two'), '@x/ab', '1.0.0');
    expect(f.run(['register', 'path:vendor/one']).envelope.ok).toBe(true);
    expect(f.run(['register', 'path:vendor/two']).envelope.ok).toBe(true);
  });

  it('a case-only variant follows the filesystem identity contract of the volume', async () => {
    const f = await fixture();
    await writeTemplate(path.join(f.project, 'vendor', 'one'), '@x/a', '1.0.0');
    await writeTemplate(path.join(f.project, 'vendor', 'two'), '@x/A', '1.0.0');
    expect(f.run(['register', 'path:vendor/one']).envelope.ok).toBe(true);
    const second = f.run(['register', 'path:vendor/two']);
    if (isVolumeCaseInsensitive(f.project)) {
      expect(second.envelope.error?.code).toBe('REGISTRATION_CONFLICT');
      expect(Object.keys((await f.state()).templates)).toEqual(['@x/a']);
    } else {
      expect(second.envelope.ok).toBe(true);
    }
  });

  it('register --replace of a registered name is refused when it overlaps another registered name', async () => {
    // `@x/a/b` carries no target (TARGETS_EXIST would answer first otherwise).
    const f = await overlappedProject({ childApplied: false });
    // A different origin for the same name (the same origin would be a no-op, which writes no bundle).
    await writeTemplate(path.join(f.project, 'vendor', 'b2'), '@x/a/b', '1.1.0');
    const replace = f.run(['register', 'path:vendor/b2', '--replace']);
    expect(replace.envelope.ok).toBe(false);
    expect(replace.envelope.error?.code).toBe('REGISTRATION_CONFLICT');
    expect((await f.state()).templates['@x/a/b']?.version).toBe('1.0.0');
  });
});

describe('an already-overlapping state fails closed before any destructive step', () => {
  it('delete of the parent is refused; both bundles and the unrelated one are untouched', async () => {
    const f = await overlappedProject();
    const before = await tree(path.join(f.project, '.frontx', 'ai'));
    const stateBefore = await readFile(path.join(f.project, '.frontx', 'project.json'), 'utf-8');
    const payloadBefore = await tree(path.join(f.project, 'pa'));

    for (const args of [['delete', 'pa'], ['delete', 'pa', '--dry-run'], ['delete', 'pa', '--yes']]) {
      const r = f.run(args);
      expect(r.status, args.join(' ')).not.toBe(0);
      expect(r.envelope.error?.code, args.join(' ')).toBe('REGISTRATION_CONFLICT');
      expect(r.envelope.error?.details).toMatchObject({ name: '@x/a', overlapping: ['@x/a/b'] });
    }
    expect(await tree(path.join(f.project, '.frontx', 'ai'))).toEqual(before);
    expect(await readFile(path.join(f.project, '.frontx', 'project.json'), 'utf-8')).toBe(stateBefore);
    expect(await tree(path.join(f.project, 'pa'))).toEqual(payloadBefore);
  });

  it('upgrade and restore of the parent are refused before any plan or write', async () => {
    const f = await overlappedProject();
    const before = await tree(path.join(f.project, '.frontx', 'ai'));
    const stateBefore = await readFile(path.join(f.project, '.frontx', 'project.json'), 'utf-8');

    for (const args of [
      ['upgrade', '@x/a', 'path:vendor/a2'],
      ['upgrade', '@x/a', 'path:vendor/a2', '--yes'],
      ['upgrade', '@x/a', '--restore'],
      ['upgrade', '@x/a', '--restore', '--yes'],
    ]) {
      const r = f.run(args);
      expect(r.status, args.join(' ')).not.toBe(0);
      expect(r.envelope.error?.code, args.join(' ')).toBe('REGISTRATION_CONFLICT');
    }
    expect(await tree(path.join(f.project, '.frontx', 'ai'))).toEqual(before);
    expect(await readFile(path.join(f.project, '.frontx', 'project.json'), 'utf-8')).toBe(stateBefore);
  });

  it('apply of a name whose bundle directory contains an applied template is refused', async () => {
    const f = await overlappedProject();
    expect(f.run(['delete', 'pa', '--dry-run']).envelope.ok).toBe(false); // sanity: still overlapped
    // `@x/a` is applied, so a second target for it would rewrite its bundle directory.
    const before = await tree(path.join(f.project, '.frontx', 'ai'));
    const r = f.run(['apply', '--input', batch({ '@x/a': ['pa2'] })]);
    expect(r.envelope.error?.code).toBe('REGISTRATION_CONFLICT');
    expect(await tree(path.join(f.project, '.frontx', 'ai'))).toEqual(before);
    await expect(lstat(path.join(f.project, 'pa2'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('validate --project diagnoses the overlap', async () => {
    const f = await overlappedProject();
    const r = f.run(['validate', '--project']);
    expect(r.status).not.toBe(0);
    expect(r.envelope.ok).toBe(false);
    expect(r.envelope.error?.code).toBe('PROJECT_INVALID');
    expect(r.envelope.error?.details).toMatchObject({ names: ['@x/a', '@x/a/b'] });
  });

  it('delete of the nested template is refused too: the parent may hold bytes inside its directory', async () => {
    const f = await overlappedProject({ parentNested: true });
    const parentNestedFile = path.join(f.project, '.frontx', 'ai', '@x', 'a', 'b', 'parent.md');
    expect(await readFile(parentNestedFile, 'utf-8')).toBe(PARENT_NESTED);
    const before = await tree(path.join(f.project, '.frontx', 'ai'));
    const stateBefore = await readFile(path.join(f.project, '.frontx', 'project.json'), 'utf-8');

    for (const args of [['delete', 'pb'], ['delete', 'pb', '--dry-run'], ['delete', 'pb', '--yes']]) {
      const r = f.run(args);
      expect(r.status, args.join(' ')).not.toBe(0);
      expect(r.envelope.error?.code, args.join(' ')).toBe('REGISTRATION_CONFLICT');
      expect(r.envelope.error?.details).toMatchObject({ name: '@x/a/b', overlapping: ['@x/a'] });
    }
    expect(await readFile(parentNestedFile, 'utf-8')).toBe(PARENT_NESTED);
    expect(await tree(path.join(f.project, '.frontx', 'ai'))).toEqual(before);
    expect(await readFile(path.join(f.project, '.frontx', 'project.json'), 'utf-8')).toBe(stateBefore);
  });

  it('upgrade and restore of the nested template are refused: its clear would destroy the parent bytes', async () => {
    const f = await overlappedProject({ parentNested: true });
    await writeTemplate(path.join(f.project, 'vendor', 'b2'), '@x/a/b', '1.1.0');
    const before = await tree(path.join(f.project, '.frontx', 'ai'));
    for (const args of [
      ['upgrade', '@x/a/b', 'path:vendor/b2', '--yes'],
      ['upgrade', '@x/a/b', '--restore', '--yes'],
    ]) {
      const r = f.run(args);
      expect(r.envelope.error?.code, args.join(' ')).toBe('REGISTRATION_CONFLICT');
    }
    expect(await tree(path.join(f.project, '.frontx', 'ai'))).toEqual(before);
  });

  it('with no recorded target on the nested name, apply of the PARENT stays possible; apply of the nested one is refused', async () => {
    const f = await overlappedProject({ childApplied: false, parentNested: true });
    const parentNestedFile = path.join(f.project, '.frontx', 'ai', '@x', 'a', 'b', 'parent.md');
    expect(await readFile(parentNestedFile, 'utf-8')).toBe(PARENT_NESTED);
    // The nested name would clear `.frontx/ai/@x/a/b/`, which holds the applied parent's bytes.
    const refused = f.run(['apply', '--input', batch({ '@x/a/b': ['pb'] })]);
    expect(refused.envelope.error?.code).toBe('REGISTRATION_CONFLICT');
    expect(await readFile(parentNestedFile, 'utf-8')).toBe(PARENT_NESTED);
    await expect(lstat(path.join(f.project, 'pb'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('safe exit while the nested name has no applied target: unregister it, then everything proceeds', async () => {
    const f = await overlappedProject({ childApplied: false, parentNested: true });
    expect(f.run(['validate', '--project']).envelope.error?.code).toBe('PROJECT_INVALID');
    expect(f.run(['unregister', '@x/a/b']).envelope.ok).toBe(true);
    expect(f.run(['validate', '--project']).envelope.ok).toBe(true);
    const parentNestedFile = path.join(f.project, '.frontx', 'ai', '@x', 'a', 'b', 'parent.md');
    expect(await readFile(parentNestedFile, 'utf-8')).toBe(PARENT_NESTED);
    expect(confirmDelete(f, 'pa').envelope.ok).toBe(true);
  });

  it('the validate remedy names what is available and does not advise a refused step', async () => {
    const f = await overlappedProject();
    const message = f.run(['validate', '--project']).envelope.error?.message ?? '';
    expect(message).toContain('unregister it');
    expect(message).toContain('outside the CLI');
    expect(message).not.toMatch(/Unregister or delete one of them/);
  });

  it('an unrelated template deletes, upgrades and restores normally next to an overlapped pair', async () => {
    const f = await overlappedProject();
    await writeTemplate(path.join(f.project, 'vendor', 'c2'), '@x/c', '1.1.0');
    const up = f.run(['upgrade', '@x/c', 'path:vendor/c2', '--yes']);
    expect(up.envelope.ok).toBe(true);
    expect(await f.bundle('@x/c')).toBe('bundle of @x/c 1.1.0\n');
    expect(f.run(['upgrade', '@x/c', '--restore', '--yes']).envelope.ok).toBe(true);
    expect(await f.bundle('@x/c')).toBe('bundle of @x/c 1.0.0\n');
    expect(confirmDelete(f, 'pc').envelope.ok).toBe(true);
    expect(await f.bundle('@x/c')).toBeNull();
    expect(await f.bundle('@x/a')).toBe('bundle of @x/a 1.0.0\n');
    expect(await f.bundle('@x/a/b')).toBe('bundle of @x/a/b 1.0.0\n');
  });
});

/** Two registered, NEVER applied names that nest — constructed like `overlappedProject`. */
async function unappliedPair(options: { bundle: boolean }): Promise<Fixture> {
  const f = await fixture();
  const v = (name: string) => path.join(f.project, 'vendor', name);
  await writeTemplate(v('a'), '@x/a', '1.0.0', { bundle: options.bundle });
  await writeTemplate(v('b'), '@x/b-temp', '1.0.0', { bundle: options.bundle });
  for (const origin of ['a', 'b']) expect(f.run(['register', `path:vendor/${origin}`]).envelope.ok).toBe(true);
  const stateFile = path.join(f.project, '.frontx', 'project.json');
  const doc = JSON.parse(await readFile(stateFile, 'utf-8')) as { templates: Record<string, unknown> };
  doc.templates['@x/a/b'] = doc.templates['@x/b-temp'];
  delete doc.templates['@x/b-temp'];
  await writeFile(stateFile, JSON.stringify(doc, null, 2), 'utf-8');
  await rm(v('b'), { recursive: true });
  await writeTemplate(v('b'), '@x/a/b', '1.0.0', { bundle: options.bundle });
  return f;
}

describe('the same batch is judged over the prospective state', () => {
  for (const bundle of [true, false]) {
    const orders: Array<[string, Record<string, string[]>]> = [
      ['child then parent', { '@x/a/b': ['pb'], '@x/a': ['pa'] }],
      ['parent then child', { '@x/a': ['pa'], '@x/a/b': ['pb'] }],
    ];
    for (const [label, input] of orders) {
      for (const command of ['apply', 'assemble']) {
        it(`${command}, ${label}, ${bundle ? 'with' : 'without'} bundles: refused before any write`, async () => {
          const f = await unappliedPair({ bundle });
          const stateBefore = await readFile(path.join(f.project, '.frontx', 'project.json'), 'utf-8');
          const r = f.run([command, '--input', batch(input)]);
          expect(r.status).not.toBe(0);
          expect(r.envelope.error?.code).toBe('REGISTRATION_CONFLICT');
          const details = r.envelope.error?.details as { name: string; overlapping: string[] };
          expect(details.overlapping).toHaveLength(1);
          expect(new Set([details.name, ...details.overlapping])).toEqual(new Set(['@x/a', '@x/a/b']));
          expect(await readFile(path.join(f.project, '.frontx', 'project.json'), 'utf-8')).toBe(stateBefore);
          expect(await tree(path.join(f.project, '.frontx', 'ai'))).toEqual([]);
          for (const dir of ['pa', 'pb']) {
            await expect(lstat(path.join(f.project, dir))).rejects.toMatchObject({ code: 'ENOENT' });
          }
        });
      }
    }
  }

  it('each of the pair can still be applied on its own while the other has no applied target', async () => {
    const f = await unappliedPair({ bundle: true });
    expect(f.run(['apply', '--input', batch({ '@x/a': ['pa'] })]).envelope.ok).toBe(true);
    expect(await f.bundle('@x/a')).toBe('bundle of @x/a 1.0.0\n');
    // …but the other is now refused: its bundle directory lies inside the applied parent's.
    const refused = f.run(['apply', '--input', batch({ '@x/a/b': ['pb'] })]);
    expect(refused.envelope.error?.code).toBe('REGISTRATION_CONFLICT');
    expect(await f.bundle('@x/a')).toBe('bundle of @x/a 1.0.0\n');
  });
});

describe('NFC/NFD target collision', () => {
  it('refuses batch before writes while allowing distinct target names', async () => {
    const f = await fixture();
    await writeTemplate(path.join(f.project, 'vendor', 'one'), '@x/one', '1.0.0');
    await writeTemplate(path.join(f.project, 'vendor', 'two'), '@x/two', '1.0.0');
    for (const origin of ['one', 'two']) expect(f.run(['register', `path:vendor/${origin}`]).envelope.ok).toBe(true);
    const refused = f.run(['apply', '--input', batch({ '@x/one': ['café'], '@x/two': ['cafe\u0301'] })]);
    expect(refused.envelope.error?.code).toBe('TARGET_CONFLICT');
    expect(await tree(f.project)).not.toContain('café/t.txt');
    expect(await tree(f.project)).not.toContain('café/t.txt');
    const ok = f.run(['apply', '--input', batch({ '@x/one': ['cafe'], '@x/two': ['cafes'] })]);
    expect(ok.envelope.ok).toBe(true);
    expect(await readFile(path.join(f.project, 'cafe', 't.txt'), 'utf-8')).toContain('@x/one');
    expect(await readFile(path.join(f.project, 'cafes', 't.txt'), 'utf-8')).toContain('@x/two');
  });
});
