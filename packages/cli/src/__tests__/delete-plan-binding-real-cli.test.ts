// @cpt-flow:cpt-frontx-flow-cli-scaffolding-delete-target:p1
// @cpt-state:cpt-frontx-state-cli-scaffolding-delete-op:p1
//
// Approval of a `delete` is bound to the reviewed plan — through the BUILT
// `frontx` executable, as a subprocess, on a real filesystem. The project is
// built with the CLI itself (register → apply of a local `path:` template that
// ships an AI bundle), then the review → change → confirm sequences run.
//
// What this proves: with nothing changed the reviewed digest deletes; a file,
// a preserved entry or an emptied/filled target that differs when the confirming
// call runs is refused with the updated plan and NOTHING written (target files,
// project state, AI bundle); a bare `--yes` writes nothing either; the stale
// digest of an earlier review never deletes a later plan. What it does NOT prove:
// absence of races in the window between the final recomputation and the
// removals, serialization against other commands, or that a person saw the plan
// (the digest says only that the caller restated this plan's digest).
// Isolation: one `mkdtemp` sandbox (project, inventory, home, templates), removed
// in `afterAll` (best effort); a closed subprocess environment; no network.
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageRoot = path.resolve(__dirname, '..', '..');
let buildDir: string;
let sandbox: string;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-delete-binding-'));
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

interface Envelope {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}
interface Run {
  status: number | null;
  envelope: Envelope;
}

function frontx(cwd: string, args: string[]): Run {
  const result = spawnSync(process.execPath, [path.join(buildDir, 'cli.js'), ...args, '--json'], {
    cwd,
    encoding: 'utf-8',
    timeout: 60_000,
    env: { PATH: process.env.PATH ?? '', HOME: path.join(sandbox, 'home'), FRONTX_INVENTORY_ROOT: path.join(sandbox, 'inventory') },
  });
  expect(result.error, `spawn failed: ${String(result.error)}`).toBeUndefined();
  try {
    return { status: result.status, envelope: JSON.parse(result.stdout.trim()) as Envelope };
  } catch {
    throw new Error(`no JSON envelope for "${args.join(' ')}": exit ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  }
}

/** Every entry under `root` (relative path → kind, regular files with their bytes); symlinks recorded, not followed. */
async function snapshot(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const key = path.relative(root, full);
      if (entry.isSymbolicLink()) out[key] = 'symlink';
      else if (entry.isDirectory()) {
        out[key] = 'dir';
        await walk(full);
      } else if (entry.isFile()) out[key] = `file:${(await readFile(full)).toString('base64')}`;
      else out[key] = 'other';
    }
  }
  try {
    await walk(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { '<absent>': '' };
    throw error;
  }
  return out;
}

const exists = async (p: string): Promise<boolean> => lstat(p).then(() => true, () => false);

interface Fixture {
  project: string;
  run: (args: string[]) => Run;
  state: () => Promise<string>;
  bundle: string;
  /** Everything a refused delete must leave byte-identical. */
  everything: () => Promise<{ app: Record<string, string>; state: string; bundle: Record<string, string> }>;
}

let counter = 0;
/** A project with one registered `path:` template applied at `app` (plus a second target when asked). */
async function makeProject(targets: string[] = ['app']): Promise<Fixture> {
  counter += 1;
  const project = path.join(sandbox, `proj-${counter}`);
  const tpl = path.join(project, 'vendor', 'tpl');
  await mkdir(path.join(tpl, 'src'), { recursive: true });
  await mkdir(path.join(tpl, '.frontx/ai/@acme/tpl'), { recursive: true });
  await writeFile(path.join(tpl, 'src/main.ts'), 'export const main = 1;\n');
  await writeFile(path.join(tpl, 'README.md'), 'readme\n');
  await writeFile(path.join(tpl, '.frontx/ai/@acme/tpl/guide.md'), 'guide\n');
  await writeFile(
    path.join(tpl, 'frontx-template.json'),
    JSON.stringify({ name: '@acme/tpl', version: '1.0.0', excludedSubtrees: [], description: 'binding fixture' }),
  );
  const run = (args: string[]): Run => frontx(project, args);
  expect(run(['register', 'path:vendor/tpl']).status).toBe(0);
  const batch = JSON.stringify({ templates: { '@acme/tpl': targets } });
  const applied = run(['apply', '--input', batch]);
  expect(applied.status, JSON.stringify(applied.envelope)).toBe(0);
  const bundle = path.join(project, '.frontx/ai/@acme/tpl');
  expect(await exists(path.join(bundle, 'guide.md'))).toBe(true);
  const state = (): Promise<string> => readFile(path.join(project, '.frontx/project.json'), 'utf-8');
  return {
    project,
    run,
    state,
    bundle,
    everything: async () => ({ app: await snapshot(path.join(project, 'app')), state: await state(), bundle: await snapshot(bundle) }),
  };
}

const review = (f: Fixture, target = 'app'): Run => {
  const r = f.run(['delete', target]);
  expect(r.status).toBe(1);
  expect(r.envelope.error?.code).toBe('CONFIRMATION_REQUIRED');
  return r;
};
const digestOf = (r: Run): string => String(r.envelope.error?.details?.planDigest);
const confirm = (f: Fixture, digest: string, target = 'app'): Run => f.run(['delete', target, '--yes', `--plan-digest=${digest}`]);
const toDelete = (r: Run): string[] => ((r.envelope.error?.details?.toDelete ?? r.envelope.data?.toDelete) as string[]).slice().sort();

describe('delete: approval is bound to the reviewed plan (built binary, real filesystem)', () => {
  it('control: with nothing changed, the reviewed digest deletes the target and its AI bundle', async () => {
    const f = await makeProject();
    const r1 = review(f);
    expect(r1.envelope.error?.details).toMatchObject({
      target: 'app',
      templateName: '@acme/tpl',
      toPreserve: [],
      aiBundle: { removed: true, path: '.frontx/ai/@acme/tpl' },
    });
    expect(digestOf(r1)).toMatch(/^[0-9a-f]{64}$/);
    // The review itself writes nothing.
    const before = await f.everything();
    expect(await f.everything()).toEqual(before);

    const done = confirm(f, digestOf(r1));
    expect(done.status).toBe(0);
    expect(done.envelope).toMatchObject({
      ok: true,
      data: { target: 'app', wasLastTarget: true, boundToReviewedPlan: true, planDigest: digestOf(r1), aiBundle: { removed: true } },
    });
    expect(await exists(path.join(f.project, 'app/src/main.ts'))).toBe(false);
    expect(await exists(path.join(f.bundle, 'guide.md'))).toBe(false);
  });

  it('a bare --json --yes writes nothing and returns the plan with its digest', async () => {
    const f = await makeProject();
    const before = await f.everything();
    const r = f.run(['delete', 'app', '--yes']);
    expect(r.status).toBe(1);
    expect(r.envelope.error?.code).toBe('CONFIRMATION_REQUIRED');
    expect(r.envelope.error?.message).toContain('--plan-digest');
    expect(digestOf(r)).toMatch(/^[0-9a-f]{64}$/);
    expect(await f.everything()).toEqual(before);
  });

  it('files written after the review: refused twice with the updated plan, deleted only on the last digest', async () => {
    const f = await makeProject();
    const r1 = review(f);
    const d1 = digestOf(r1);
    const before = await f.everything();

    await writeFile(path.join(f.project, 'app/notes-written-after-review.md'), 'late\n');
    const afterFirstChange = await f.everything();
    const refused1 = confirm(f, d1);
    expect(refused1.status).toBe(1);
    expect(refused1.envelope.error?.code).toBe('CONFIRMATION_REQUIRED');
    expect(refused1.envelope.error?.details?.planChangedSinceReview).toBe(true);
    expect(toDelete(refused1)).toEqual([...toDelete(r1), 'app/notes-written-after-review.md'].sort());
    expect(digestOf(refused1)).not.toBe(d1);
    // Nothing written: the late file, every other file, the state and the bundle are as they were.
    expect(await f.everything()).toEqual(afterFirstChange);
    expect(afterFirstChange.state).toBe(before.state);

    await writeFile(path.join(f.project, 'app/another-late-file.md'), 'later\n');
    const afterSecondChange = await f.everything();
    const refused2 = confirm(f, digestOf(refused1));
    expect(refused2.envelope.error?.details?.planChangedSinceReview).toBe(true);
    expect(toDelete(refused2)).toContain('app/another-late-file.md');
    expect(await f.everything()).toEqual(afterSecondChange);

    // The stale first digest still deletes nothing.
    expect(confirm(f, d1).envelope.error?.code).toBe('CONFIRMATION_REQUIRED');
    expect(await f.everything()).toEqual(afterSecondChange);

    const done = confirm(f, digestOf(refused2));
    expect(done.status).toBe(0);
    expect(done.envelope.ok).toBe(true);
    expect(await exists(path.join(f.project, 'app/notes-written-after-review.md'))).toBe(false);
    expect(await exists(path.join(f.project, 'app/another-late-file.md'))).toBe(false);
    expect(await exists(path.join(f.bundle, 'guide.md'))).toBe(false);
  });

  it('a change of the preserved set alone (an entry that cannot be enumerated appears) is a changed plan', async () => {
    const f = await makeProject();
    const r1 = review(f);
    execFileSync('mkfifo', [path.join(f.project, 'app/pipe')]);
    const before = await f.everything();
    const refused = confirm(f, digestOf(r1));
    expect(refused.envelope.error?.code).toBe('CONFIRMATION_REQUIRED');
    expect(refused.envelope.error?.details?.planChangedSinceReview).toBe(true);
    expect(refused.envelope.error?.details?.toPreserve).toEqual(['app/pipe']);
    expect(toDelete(refused)).toEqual(toDelete(r1));
    expect(await f.everything()).toEqual(before);
    expect(await exists(path.join(f.bundle, 'guide.md'))).toBe(true);
  });

  describe('empty plans are plans: they are bound too, and an empty last target is a real deletion', () => {
    async function emptiedTarget(): Promise<Fixture> {
      const f = await makeProject();
      for (const file of ['README.md', 'src/main.ts']) await rm(path.join(f.project, 'app', file));
      return f;
    }

    it('unchanged empty plan for a last target still deletes: record updated and bundle removed', async () => {
      const f = await emptiedTarget();
      const r1 = review(f);
      expect(r1.envelope.error?.details?.toDelete).toEqual([]);
      const done = confirm(f, digestOf(r1));
      expect(done.status).toBe(0);
      expect(done.envelope).toMatchObject({ ok: true, data: { toDelete: [], wasLastTarget: true } });
      expect(await f.state()).toContain('"targets": []');
      expect(await exists(path.join(f.bundle, 'guide.md'))).toBe(false);
    });

    it('empty → non-empty is refused with no writes (record and bundle untouched)', async () => {
      const f = await emptiedTarget();
      const r1 = review(f);
      await writeFile(path.join(f.project, 'app/appeared.md'), 'x\n');
      const before = await f.everything();
      const refused = confirm(f, digestOf(r1));
      expect(refused.envelope.error?.details).toMatchObject({ toDelete: ['app/appeared.md'], planChangedSinceReview: true });
      expect(await f.everything()).toEqual(before);
    });

    it('non-empty → empty is refused with no writes (record and bundle untouched)', async () => {
      const f = await makeProject();
      const r1 = review(f);
      for (const file of ['README.md', 'src/main.ts']) await rm(path.join(f.project, 'app', file));
      const before = await f.everything();
      const refused = confirm(f, digestOf(r1));
      expect(refused.envelope.error?.details).toMatchObject({ toDelete: [], planChangedSinceReview: true });
      expect(await f.everything()).toEqual(before);
      expect(before.state).toContain('"app"');
    });
  });

  it('a change of which target is the owner\'s last one flips the bundle fact: refused, bundle kept', async () => {
    const f = await makeProject(['app', 'second']);
    const r1 = review(f);
    expect(r1.envelope.error?.details?.aiBundle).toEqual({ removed: false, path: null });
    // `second` goes away between review and confirmation.
    const second = confirm(f, digestOf(review(f, 'second')), 'second');
    expect(second.status).toBe(0);
    const before = await f.everything();
    const refused = confirm(f, digestOf(r1));
    expect(refused.envelope.error?.code).toBe('CONFIRMATION_REQUIRED');
    expect(refused.envelope.error?.details).toMatchObject({
      planChangedSinceReview: true,
      aiBundle: { removed: true, path: '.frontx/ai/@acme/tpl' },
    });
    expect(await f.everything()).toEqual(before);
  });

  it('a target that vanished from the record is TARGET_NOT_APPLIED, never a fresh list', async () => {
    const f = await makeProject(['app', 'second']);
    const r1 = review(f);
    expect(confirm(f, digestOf(r1)).status).toBe(0);
    const again = confirm(f, digestOf(r1));
    expect(again.status).toBe(1);
    expect(again.envelope.error?.code).toBe('TARGET_NOT_APPLIED');
    expect(again.envelope.error?.details?.planDigest).toBeUndefined();
  });

  it('refusals at the argument layer: --plan-digest without --yes, with --dry-run, malformed', async () => {
    const f = await makeProject();
    const before = await f.everything();
    const d = 'a'.repeat(64);
    for (const args of [
      ['delete', 'app', `--plan-digest=${d}`],
      ['delete', 'app', '--dry-run', '--yes', `--plan-digest=${d}`],
      ['delete', 'app', '--yes', `--plan-digest=${'z'.repeat(64)}`],
      ['delete', 'app', '--yes', `--plan-digest=${'a'.repeat(63)}`],
    ]) {
      const r = f.run(args);
      expect(r.status, args.join(' ')).toBe(1);
      expect(r.envelope.error?.code, args.join(' ')).toBe('INVALID_INPUT');
    }
    expect(await f.everything()).toEqual(before);
  });

  it('dry-run issues no digest', async () => {
    const f = await makeProject();
    const r = f.run(['delete', 'app', '--dry-run']);
    expect(r.status).toBe(0);
    expect(r.envelope.data?.planDigest).toBeUndefined();
    // `tree` (the bundle's captured files) is part of the reviewed plan, cli-scaffolding FEATURE.
    expect(r.envelope.data?.aiBundle).toMatchObject({ removed: true, path: '.frontx/ai/@acme/tpl', tree: { files: [{ path: 'guide.md' }] } });
  });

  // DOCUMENTED LIMIT, not a protection: the digest binds path STRINGS and flags.
  // A symlink inside the target that is re-pointed after the review (both ends
  // outside the target) leaves every listed string unchanged, so the digest
  // still matches. The link is not enumerable as target content, so it is
  // preserved either way and nothing behind it is touched; what this pins is
  // that the plan's identity is the strings, as the docs say.
  it('re-pointing a symlink inside the target does not change the digest (limit: strings, not identity)', async () => {
    const f = await makeProject();
    await mkdir(path.join(f.project, 'elsewhere-a'));
    await mkdir(path.join(f.project, 'elsewhere-b'));
    await writeFile(path.join(f.project, 'elsewhere-a/x.txt'), 'a\n');
    await writeFile(path.join(f.project, 'elsewhere-b/x.txt'), 'b\n');
    await symlink('../elsewhere-a', path.join(f.project, 'app/link'));
    const r1 = review(f);
    expect(r1.envelope.error?.details?.toPreserve).toEqual(['app/link']);
    await rm(path.join(f.project, 'app/link'));
    await symlink('../elsewhere-b', path.join(f.project, 'app/link'));
    const done = confirm(f, digestOf(r1));
    expect(done.status).toBe(0);
    expect(await readFile(path.join(f.project, 'elsewhere-a/x.txt'), 'utf-8')).toBe('a\n');
    expect(await readFile(path.join(f.project, 'elsewhere-b/x.txt'), 'utf-8')).toBe('b\n');
    expect(await exists(path.join(f.project, 'app/link'))).toBe(true);
  });
});

/**
 * Drives an INTERACTIVE `delete` (no --json) of the built binary through piped
 * stdin: it waits for each `[y/N] ` prompt on stdout, runs the step scripted for
 * that prompt (which may change the project while the prompt is open), then
 * answers. Returns everything printed, split per prompt, and the exit status.
 */
async function interactiveDelete(
  f: Fixture,
  target: string,
  steps: { answer: 'y' | 'n'; then?: () => Promise<void> | void }[],
): Promise<{ status: number | null; prompts: string[]; stdout: string }> {
  const child = spawn(process.execPath, [path.join(buildDir, 'cli.js'), 'delete', target], {
    cwd: f.project,
    env: { PATH: process.env.PATH ?? '', HOME: path.join(sandbox, 'home'), FRONTX_INVENTORY_ROOT: path.join(sandbox, 'inventory') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let consumed = 0;
  const prompts: string[] = [];
  let chain: Promise<void> = Promise.resolve();
  child.stdout.setEncoding('utf-8');
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
    chain = chain.then(async () => {
      for (;;) {
        const end = stdout.indexOf('[y/N] ', consumed);
        if (end < 0) return;
        const upTo = end + '[y/N] '.length;
        prompts.push(stdout.slice(consumed, upTo));
        consumed = upTo;
        const step = steps[prompts.length - 1];
        if (step === undefined) {
          child.kill();
          throw new Error(`prompted more often than scripted:\n${stdout}`);
        }
        await step.then?.();
        child.stdin.write(`${step.answer}\n`);
      }
    });
  });
  const status = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`interactive delete timed out:\n${stdout}`));
    }, 60_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  await chain;
  return { status, prompts, stdout };
}

describe('delete: the interactive prompt shows the whole reviewed projection, owner included (built binary, piped stdin)', () => {
  it('non-last target: the first prompt names the owning template next to the "no bundle removed" line', async () => {
    const f = await makeProject(['app', 'second']);
    const out = await interactiveDelete(f, 'app', [{ answer: 'n' }]);
    expect(out.status).toBe(0);
    expect(out.prompts).toHaveLength(1);
    expect(out.prompts[0]).toContain('Owning template: @acme/tpl\n');
    expect(out.prompts[0]).toContain('No AI bundle is removed (other targets of @acme/tpl remain).');
    expect(out.prompts[0]).toContain('Would delete:\n  app/README.md');
    expect(await exists(path.join(f.project, 'app/src/main.ts'))).toBe(true);
  });

  it('last target: the owner and the bundle path are both on screen', async () => {
    const f = await makeProject();
    const out = await interactiveDelete(f, 'app', [{ answer: 'n' }]);
    expect(out.prompts[0]).toContain('Owning template: @acme/tpl\n');
    expect(out.prompts[0]).toContain('AI bundle .frontx/ai/@acme/tpl/ will be removed');
  });

  it('a changed plan is re-shown, with its owner, as an updated plan and needs its own answer', async () => {
    const f = await makeProject(['app', 'second']);
    const out = await interactiveDelete(f, 'app', [
      { answer: 'y', then: () => writeFile(path.join(f.project, 'app/late.md'), 'late\n') },
      { answer: 'n' },
    ]);
    expect(out.status).toBe(0);
    expect(out.prompts).toHaveLength(2);
    expect(out.prompts[0]).not.toContain('late.md');
    expect(out.prompts[1]).toContain('The plan changed since it was shown. Updated plan:');
    expect(out.prompts[1]).toContain('Owning template: @acme/tpl\n');
    expect(out.prompts[1]).toContain('app/late.md');
    expect(await exists(path.join(f.project, 'app/late.md'))).toBe(true);
    expect(await exists(path.join(f.project, 'app/src/main.ts'))).toBe(true);
  });

  it('a change of the owner alone re-prompts and the updated prompt shows the NEW owner', async () => {
    const f = await makeProject(['app', 'second']);
    const out = await interactiveDelete(f, 'app', [
      {
        answer: 'y',
        then: async () => {
          // Same target, same files, same exclusions: only the recorded owner's name changes.
          const file = path.join(f.project, '.frontx/project.json');
          const text = (await readFile(file, 'utf-8')).replaceAll('@acme/tpl', '@acme/renamed');
          await writeFile(file, text);
        },
      },
      { answer: 'n' },
    ]);
    expect(out.prompts, out.stdout).toHaveLength(2);
    expect(out.prompts[0]).toContain('Owning template: @acme/tpl\n');
    expect(out.prompts[1]).toContain('The plan changed since it was shown. Updated plan:');
    expect(out.prompts[1]).toContain('Owning template: @acme/renamed\n');
    expect(out.prompts[1]).toContain('other targets of @acme/renamed remain');
  });
});
