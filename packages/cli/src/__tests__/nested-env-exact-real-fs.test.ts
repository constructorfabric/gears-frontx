// @cpt-flow:cpt-frontx-flow-cli-scaffolding-add-template:p1
// @cpt-flow:cpt-frontx-flow-cli-scaffolding-delete-template:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-delete-plan:p1
//
// Command-level regression for environment-owned entries (`.git`, `.DS_Store`,
// `Thumbs.db`) NESTED inside a target, through the real `run()` entry with real
// adapters on a disposable filesystem. Verified loss it reproduces (before the
// fix): after `--adopt-existing`, a digest-confirmed `delete` removed a
// developer-owned `app/.git/config`, `app/.DS_Store` and `app/sub/Thumbs.db`.
//
// Scope: the reserved names in ANY ASCII case (human ruling 2026-11-09:
// protected on every volume, over-protection of a distinct `.GIT` on a
// case-sensitive volume accepted), on a filesystem that does not change
// between the confirming recomputation and the unlinks. NOT claimed: Unicode
// equivalence, physical volume identity / mixed volumes, concurrent changes, or that every command avoids reading `.git` internals (apply's
// existing-content walk and upgrade's disk listing still traverse it).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run, createRealDeps } from '../cli';

type Snap = Record<string, string>;

// Every entry under `root` (including `.frontx`): kind, mode, sha256 for files,
// link text for symlinks. A directory the test user cannot read is recorded as
// such rather than read, so the harness never opens protected content itself.
function snapshot(root: string): Snap {
  const out: Snap = {};
  const walk = (dir: string): void => {
    let names: string[];
    try {
      names = fs.readdirSync(dir).sort();
    } catch {
      out[`${path.relative(root, dir)}/`] = 'unreadable-dir';
      return;
    }
    for (const n of names) {
      const full = path.join(dir, n);
      const rel = path.relative(root, full);
      const st = fs.lstatSync(full);
      const mode = (st.mode & 0o7777).toString(8);
      if (st.isSymbolicLink()) out[rel] = `link ${fs.readlinkSync(full)}`;
      else if (st.isDirectory()) {
        out[rel] = `dir ${mode}`;
        walk(full);
      } else if (st.isFile()) out[rel] = `file ${mode} ${crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')}`;
      else out[rel] = `other ${mode}`;
    }
  };
  walk(root);
  return out;
}
const diff = (a: Snap, b: Snap) => ({
  added: Object.keys(b).filter((k) => !(k in a)).sort(),
  removed: Object.keys(a).filter((k) => !(k in b)).sort(),
  changed: Object.keys(a).filter((k) => k in b && a[k] !== b[k]).sort(),
});

describe('nested environment-owned entries (exact spelling), real filesystem through run()', () => {
  const originalCwd = process.cwd();
  const originalInv = process.env.FRONTX_INVENTORY_ROOT;
  let sandbox: string;
  let project: string;

  const call = (args: string[]) => run([...args, '--json'], createRealDeps());
  type Json = Record<string, unknown>;
  type Env = {
    ok: boolean;
    data?: { toDelete?: string[]; toPreserve?: string[] } & Json;
    error?: {
      code: string;
      message: string;
      details?: { planDigest?: string; plan?: { operations: { path: string }[] }; toPreserve?: string[]; conflicts?: { ground: string; contestants: unknown[] }[] } & Json;
    };
  };
  const envelope = (o: { stdout?: string; stderr?: string }): Env => {
    expect(o.stderr).toBeUndefined();
    return JSON.parse(o.stdout ?? '') as Env;
  };
  const batch = (templates: Record<string, string[]>) => JSON.stringify({ templates });
  const write = (rel: string, content = 'x\n') => {
    fs.mkdirSync(path.dirname(path.join(project, rel)), { recursive: true });
    fs.writeFileSync(path.join(project, rel), content);
  };
  function template(dir: string, name: string, version: string, files: Record<string, string>, excluded: string[] = []): void {
    const base = path.join(project, 'vendor', dir);
    fs.rmSync(base, { recursive: true, force: true });
    fs.mkdirSync(base, { recursive: true });
    fs.writeFileSync(
      path.join(base, 'frontx-template.json'),
      JSON.stringify({ name, version, description: 'fixture', excludedSubtrees: excluded }),
    );
    for (const [rel, c] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
      fs.writeFileSync(path.join(base, rel), c);
    }
  }
  const envFiles = () => {
    write('app/.git/config', '[core]\n');
    write('app/.git/objects/ab/cd', 'obj\n');
    write('app/.DS_Store', 'ds');
    write('app/sub/Thumbs.db', 'th');
  };

  beforeEach(() => {
    sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-env-nested-')));
    project = path.join(sandbox, 'proj');
    fs.mkdirSync(project, { recursive: true });
    process.env.FRONTX_INVENTORY_ROOT = path.join(sandbox, 'inv');
    process.chdir(project);
  });
  afterEach(() => {
    process.chdir(originalCwd);
    for (const p of ['app/.git', 'app/locked']) {
      try {
        fs.chmodSync(path.join(project, p), 0o755);
      } catch {
        /* absent */
      }
    }
    fs.rmSync(sandbox, { recursive: true, force: true });
    expect(fs.existsSync(sandbox)).toBe(false);
    if (originalInv === undefined) delete process.env.FRONTX_INVENTORY_ROOT;
    else process.env.FRONTX_INVENTORY_ROOT = originalInv;
  });

  async function appliedProject(files: Record<string, string> = { 'a.txt': 'payload\n' }): Promise<void> {
    template('t', '@x/t', '1.0.0', files);
    expect((await call(['register', 'path:vendor/t'])).exitCode).toBe(0);
  }

  it('A1: pre-existing nested env entries are not "foreign content"; apply needs no --adopt-existing and leaves them byte-identical', async () => {
    await appliedProject();
    envFiles();
    const before = snapshot(project);
    const o = await call(['apply', '--input', batch({ '@x/t': ['app'] })]);
    expect(o.exitCode).toBe(0);
    const d = diff(before, snapshot(project));
    expect(d.removed).toEqual([]);
    expect(d.added).toEqual(['app/a.txt']);
    expect(d.changed).toEqual(['.frontx/project.json']);
  });

  it('A2: a payload that ships nested env entries does not write them', async () => {
    await appliedProject({ 'a.txt': 'p\n', '.git/x': 'g\n', '.DS_Store': 'd\n', 'sub/Thumbs.db': 't\n', 'sub/ok.txt': 'ok\n' });
    const o = await call(['apply', '--input', batch({ '@x/t': ['app'] })]);
    expect(o.exitCode).toBe(0);
    for (const p of ['app/.git', 'app/.DS_Store', 'app/sub/Thumbs.db']) expect(fs.existsSync(path.join(project, p)), p).toBe(false);
    expect(fs.existsSync(path.join(project, 'app/a.txt'))).toBe(true);
    expect(fs.existsSync(path.join(project, 'app/sub/ok.txt'))).toBe(true);
  });

  it('C-cli: assemble/apply/ownership refuse a claim at or inside a nested reserved entry, nothing written', async () => {
    await appliedProject();
    fs.mkdirSync(path.join(project, 'app/.git/hooks'), { recursive: true });
    const before = snapshot(project);
    for (const target of ['app/.git/hooks', 'app/sub/Thumbs.db/x', 'app/.DS_Store']) {
      for (const cmd of ['assemble', 'apply']) {
        const o = await call([cmd, '--input', batch({ '@x/t': [target] })]);
        const e = envelope(o);
        expect(o.exitCode, `${cmd} ${target}`).toBe(1);
        expect(e.error?.code).toBe('TARGET_CONFLICT');
        expect(e.error?.details?.conflicts?.[0]?.contestants).toEqual([{ target, templateName: '@x/t' }]);
      }
    }
    expect(snapshot(project)).toEqual(before);
  });

  it('C4: ownership add on an existing nested reserved entry is refused like the root one, projectOwnedRoots unchanged', async () => {
    await appliedProject();
    envFiles();
    const before = snapshot(project);
    for (const p of ['app/.git', 'app/.DS_Store']) {
      const o = await call(['ownership', 'add', p]);
      const e = envelope(o);
      expect(o.exitCode, p).toBe(1);
      expect(e.error?.code).toBe('TARGET_CONFLICT');
      expect(e.error?.details?.conflicts?.[0]?.ground).toBe(p);
    }
    expect(snapshot(project)).toEqual(before);
  });

  describe('delete', () => {
    async function reviewDigest(target = 'app'): Promise<{ digest: string; env: Env }> {
      const o = await call(['delete', target]);
      const env = envelope(o);
      expect(env.error?.code).toBe('CONFIRMATION_REQUIRED');
      return { digest: env.error!.details!.planDigest as string, env };
    }

    it('D1/D2: dry-run lists nested env entries in toPreserve, never toDelete; the confirmed delete removes only the payload file', async () => {
      await appliedProject();
      expect((await call(['apply', '--input', batch({ '@x/t': ['app'] })])).exitCode).toBe(0);
      envFiles();
      const before = snapshot(project);
      const dry = envelope(await call(['delete', 'app', '--dry-run']));
      expect(dry.data?.toDelete).toEqual(['app/a.txt']);
      expect(dry.data?.toPreserve).toEqual(expect.arrayContaining(['app/.git', 'app/.DS_Store', 'app/sub/Thumbs.db']));
      const sorted = [...(dry.data?.toPreserve ?? [])].sort();
      expect(new Set(sorted).size).toBe(sorted.length);
      expect(snapshot(project)).toEqual(before);

      const { digest } = await reviewDigest();
      const done = await call(['delete', 'app', '--yes', `--plan-digest=${digest}`]);
      expect(done.exitCode).toBe(0);
      const d = diff(before, snapshot(project));
      expect(d.removed).toEqual(['app/a.txt']);
      expect(d.added).toEqual([]);
      expect(d.changed).toEqual(['.frontx/project.json']);
    });

    it('D3: root target "." preserves a nested .git too', async () => {
      await appliedProject();
      expect((await call(['apply', '--input', batch({ '@x/t': ['.'] })])).exitCode).toBe(0);
      write('sub/.git/config', 'c\n');
      const dry = envelope(await call(['delete', '.', '--dry-run']));
      expect(dry.data?.toDelete).not.toContain('sub/.git/config');
      expect(dry.data?.toPreserve).toEqual(expect.arrayContaining(['sub/.git']));
    });

    it('D4a/b: an in-target alias of a protected file / of .git is preserved, protected bytes and link text unchanged', async () => {
      await appliedProject();
      expect((await call(['apply', '--input', batch({ '@x/t': ['app'] })])).exitCode).toBe(0);
      envFiles();
      fs.symlinkSync('.git/config', path.join(project, 'app/cfg'));
      fs.symlinkSync('.git', path.join(project, 'app/link'));
      const before = snapshot(project);
      const dry = envelope(await call(['delete', 'app', '--dry-run']));
      expect(dry.data?.toDelete).toEqual(['app/a.txt']);
      for (const p of ['app/cfg']) expect(dry.data?.toPreserve).toContain(p);
      expect((dry.data?.toPreserve as string[]).some((p) => p.startsWith('app/link/'))).toBe(true);
      const { digest } = await reviewDigest();
      expect((await call(['delete', 'app', '--yes', `--plan-digest=${digest}`])).exitCode).toBe(0);
      const after = snapshot(project);
      for (const k of ['app/.git/config', 'app/.git/objects/ab/cd', 'app/cfg', 'app/link', 'app/.DS_Store', 'app/sub/Thumbs.db']) {
        expect(after[k], k).toBe(before[k]);
      }
    });

    it('D5: dangling nested .git link and a .git worktree FILE are disclosed in toPreserve and survive', async () => {
      await appliedProject();
      expect((await call(['apply', '--input', batch({ '@x/t': ['app'] })])).exitCode).toBe(0);
      fs.mkdirSync(path.join(project, 'app/x'), { recursive: true });
      fs.symlinkSync('nowhere', path.join(project, 'app/x/.git'));
      write('app/wt/.git', 'gitdir: /elsewhere\n');
      const before = snapshot(project);
      const dry = envelope(await call(['delete', 'app', '--dry-run']));
      expect(dry.data?.toPreserve).toEqual(expect.arrayContaining(['app/x/.git', 'app/wt/.git']));
      const { digest } = await reviewDigest();
      expect((await call(['delete', 'app', '--yes', `--plan-digest=${digest}`])).exitCode).toBe(0);
      const after = snapshot(project);
      expect(after['app/x/.git']).toBe(before['app/x/.git']);
      expect(after['app/wt/.git']).toBe(before['app/wt/.git']);
    });

    it.skipIf(process.getuid?.() === 0)('D8: an unreadable app/.git does not fail dry-run or confirmed delete', async () => {
      await appliedProject();
      expect((await call(['apply', '--input', batch({ '@x/t': ['app'] })])).exitCode).toBe(0);
      envFiles();
      fs.chmodSync(path.join(project, 'app/.git'), 0o000);
      const dry = await call(['delete', 'app', '--dry-run']);
      expect(dry.exitCode).toBe(0);
      expect(envelope(dry).data?.toPreserve).toContain('app/.git');
      const { digest } = await reviewDigest();
      expect((await call(['delete', 'app', '--yes', `--plan-digest=${digest}`])).exitCode).toBe(0);
      expect(fs.statSync(path.join(project, 'app/.git')).isDirectory()).toBe(true);
    });

    it('D9: digest drift — a change that alters the review projection re-asks; an equivalent-projection change proceeds with protected data intact', async () => {
      await appliedProject();
      expect((await call(['apply', '--input', batch({ '@x/t': ['app'] })])).exitCode).toBe(0);
      envFiles();
      // (i) projection changes: a new nested env entry appears after review
      let { digest } = await reviewDigest();
      write('app/sub2/.DS_Store', 'new');
      const before = snapshot(project);
      const stale = envelope(await call(['delete', 'app', '--yes', `--plan-digest=${digest}`]));
      expect(stale.error?.code).toBe('CONFIRMATION_REQUIRED');
      expect(stale.error?.details?.planDigest).not.toBe(digest);
      expect(stale.error?.details?.toPreserve).toContain('app/sub2/.DS_Store');
      expect(snapshot(project)).toEqual(before);
      // (ii) equivalent projection: .git directory replaced by a FILE of the same name
      ({ digest } = await reviewDigest());
      fs.rmSync(path.join(project, 'app/.git'), { recursive: true });
      write('app/.git', 'gitdir: x\n');
      const mid = snapshot(project);
      const ok = await call(['delete', 'app', '--yes', `--plan-digest=${digest}`]);
      expect(ok.exitCode).toBe(0);
      const after = snapshot(project);
      expect(after['app/.git']).toBe(mid['app/.git']);
      expect(after['app/sub2/.DS_Store']).toBe(mid['app/sub2/.DS_Store']);
      expect(diff(mid, after).removed).toEqual(['app/a.txt']);
    });
  });

  describe('ASCII case variants (human ruling 2026-11-09)', () => {
    // Variant spellings live alone in their fixture so the test is valid on a
    // case-insensitive volume too, where `.GIT` and `.git` would be one entry.
    const variantFiles = () => {
      write('app/.GIT/config', '[core]\n');
      write('app/.Ds_Store', 'ds');
      write('app/sub/THUMBS.DB', 'th');
    };
    it('apply: pre-existing variant entries need no --adopt-existing and stay byte-identical; a payload shipping them writes none', async () => {
      await appliedProject({ 'a.txt': 'p\n', '.GIT/x': 'g\n', 'sub/thumbs.db': 't\n' });
      variantFiles();
      const before = snapshot(project);
      expect((await call(['apply', '--input', batch({ '@x/t': ['app'] })])).exitCode).toBe(0);
      const d = diff(before, snapshot(project));
      expect(d.added).toEqual(['app/a.txt']);
      expect(d.removed).toEqual([]);
      expect(d.changed).toEqual(['.frontx/project.json']);
      expect(fs.existsSync(path.join(project, 'app/.GIT/x'))).toBe(false);
    });
    it('conflict: assemble/apply/ownership refuse a claim at or inside a variant, nothing written', async () => {
      await appliedProject();
      variantFiles();
      const before = snapshot(project);
      for (const target of ['app/.GIT/hooks', 'app/sub/THUMBS.DB/x', 'app/.Ds_Store']) {
        for (const cmd of ['assemble', 'apply']) {
          const o = await call([cmd, '--input', batch({ '@x/t': [target] })]);
          expect(o.exitCode, `${cmd} ${target}`).toBe(1);
          expect(envelope(o).error?.code).toBe('TARGET_CONFLICT');
        }
      }
      for (const p of ['app/.GIT', 'app/.Ds_Store']) {
        const o = await call(['ownership', 'add', p]);
        expect(o.exitCode, p).toBe(1);
        expect(envelope(o).error?.code).toBe('TARGET_CONFLICT');
      }
      expect(snapshot(project)).toEqual(before);
    });
    it('delete: variants are listed in toPreserve never toDelete; confirmed delete removes only the payload; resolved aliases of a variant are protected', async () => {
      await appliedProject();
      expect((await call(['apply', '--input', batch({ '@x/t': ['app'] })])).exitCode).toBe(0);
      variantFiles();
      fs.symlinkSync('.GIT/config', path.join(project, 'app/cfg'));
      fs.symlinkSync('.GIT', path.join(project, 'app/link'));
      const before = snapshot(project);
      const dry = envelope(await call(['delete', 'app', '--dry-run']));
      expect(dry.data?.toDelete).toEqual(['app/a.txt']);
      expect(dry.data?.toPreserve).toEqual(expect.arrayContaining(['app/.GIT', 'app/.Ds_Store', 'app/sub/THUMBS.DB', 'app/cfg']));
      expect((dry.data?.toPreserve ?? []).some((p) => p.startsWith('app/link/'))).toBe(true);
      expect(snapshot(project)).toEqual(before);
      const review = envelope(await call(['delete', 'app']));
      const done = await call(['delete', 'app', '--yes', `--plan-digest=${review.error!.details!.planDigest}`]);
      expect(done.exitCode).toBe(0);
      const after = snapshot(project);
      for (const k of ['app/.GIT/config', 'app/.Ds_Store', 'app/sub/THUMBS.DB', 'app/cfg', 'app/link']) expect(after[k], k).toBe(before[k]);
      expect(diff(before, after).removed).toEqual(['app/a.txt']);
    });
    it('on a case-SENSITIVE volume: distinct `.git` and `.GIT` siblings are both protected (over-protection accepted); skipped on a case-insensitive volume', async () => {
      fs.writeFileSync(path.join(sandbox, 'probe-lower'), '');
      const caseSensitive = !fs.existsSync(path.join(sandbox, 'PROBE-LOWER'));
      if (!caseSensitive) return; // the two spellings cannot coexist here; covered by the other cases
      await appliedProject();
      expect((await call(['apply', '--input', batch({ '@x/t': ['app'] })])).exitCode).toBe(0);
      write('app/.git/config', 'lower\n');
      write('app/.GIT/config', 'upper\n');
      write('app/sub/Thumbs.db', 'a');
      write('app/sub/thumbs.db', 'b');
      fs.symlinkSync('.GIT', path.join(project, 'app/link'));
      const before = snapshot(project);
      const dry = envelope(await call(['delete', 'app', '--dry-run']));
      expect(dry.data?.toDelete).toEqual(['app/a.txt']);
      expect(dry.data?.toPreserve).toEqual(
        expect.arrayContaining(['app/.git', 'app/.GIT', 'app/sub/Thumbs.db', 'app/sub/thumbs.db']),
      );
      expect((dry.data?.toPreserve ?? []).some((p) => p.startsWith('app/link/'))).toBe(true);
      const review = envelope(await call(['delete', 'app']));
      expect((await call(['delete', 'app', '--yes', `--plan-digest=${review.error!.details!.planDigest}`])).exitCode).toBe(0);
      const after = snapshot(project);
      for (const k of ['app/.git/config', 'app/.GIT/config', 'app/sub/Thumbs.db', 'app/sub/thumbs.db', 'app/link']) expect(after[k], k).toBe(before[k]);
      expect(diff(before, after).removed).toEqual(['app/a.txt']);
    });
    it('digest projection: a variant appearing after review changes the plan (re-asks, nothing deleted); a variant dir replaced by a file keeps protected data', async () => {
      await appliedProject();
      expect((await call(['apply', '--input', batch({ '@x/t': ['app'] })])).exitCode).toBe(0);
      variantFiles();
      let review = envelope(await call(['delete', 'app']));
      let digest = review.error!.details!.planDigest as string;
      write('app/late/.dS_sToRe', 'late');
      const before = snapshot(project);
      const stale = envelope(await call(['delete', 'app', '--yes', `--plan-digest=${digest}`]));
      expect(stale.error?.code).toBe('CONFIRMATION_REQUIRED');
      expect(stale.error?.details?.planDigest).not.toBe(digest);
      expect(stale.error?.details?.toPreserve).toContain('app/late/.dS_sToRe');
      expect(snapshot(project)).toEqual(before);
      review = envelope(await call(['delete', 'app']));
      digest = review.error!.details!.planDigest as string;
      fs.rmSync(path.join(project, 'app/.GIT'), { recursive: true });
      write('app/.GIT', 'gitdir: x\n');
      const mid = snapshot(project);
      expect((await call(['delete', 'app', '--yes', `--plan-digest=${digest}`])).exitCode).toBe(0);
      const after = snapshot(project);
      expect(after['app/.GIT']).toBe(mid['app/.GIT']);
      expect(after['app/late/.dS_sToRe']).toBe(mid['app/late/.dS_sToRe']);
      expect(diff(mid, after).removed).toEqual(['app/a.txt']);
    });
    it('root target "." preserves a variant-named root entry and a nested one', async () => {
      await appliedProject();
      expect((await call(['apply', '--input', batch({ '@x/t': ['.'] })])).exitCode).toBe(0);
      write('.GIT/config', 'c\n');
      write('sub/.Git/config', 'c\n');
      const dry = envelope(await call(['delete', '.', '--dry-run']));
      expect(dry.data?.toDelete).toEqual(['a.txt']);
      // On a case-insensitive volume a root `.GIT` is covered by the root literal `.git`
      // (listed once); on a case-sensitive one it is listed under its own spelling.
      expect(dry.data?.toPreserve).toEqual(expect.arrayContaining(['sub/.Git']));
      expect((dry.data?.toPreserve ?? []).some((p) => p === '.GIT' || p === '.git')).toBe(true);
      expect((dry.data?.toDelete ?? []).some((p) => /^\.git\//i.test(p))).toBe(false);
    });
    it('upgrade/restore: variant paths in the candidate are skipped, existing variant bytes unchanged', async () => {
      template('v1', '@x/t', '1.0.0', { 'src/a.ts': 'one\n' });
      template('v2', '@x/t', '2.0.0', { 'src/a.ts': 'two\n', '.GIT/config': 'tmpl\n', '.ds_store': 'tmpl' });
      expect((await call(['register', 'path:vendor/v1'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ '@x/t': ['app'] })])).exitCode).toBe(0);
      variantFiles();
      const base = snapshot(project);
      const review = envelope(await call(['upgrade', '@x/t', 'path:vendor/v2']));
      expect(review.error?.code).toBe('CONFIRMATION_REQUIRED');
      expect((review.error!.details!.plan!.operations).filter((o) => /(\.git|\.ds_store|thumbs\.db)(\/|$)/i.test(o.path))).toEqual([]);
      expect((await call(['upgrade', '@x/t', 'path:vendor/v2', '--yes', `--plan-digest=${review.error!.details!.planDigest}`])).exitCode).toBe(0);
      const after = snapshot(project);
      for (const k of ['app/.GIT/config', 'app/.Ds_Store', 'app/sub/THUMBS.DB']) expect(after[k], k).toBe(base[k]);
      expect(fs.readFileSync(path.join(project, 'app/src/a.ts'), 'utf-8')).toBe('two\n');
    });
  });

  describe('reserved entries inside other protected ground, aliases and shapes (review of fix-nested-env)', () => {
    async function apply(target = 'app', files: Record<string, string> = { 'a.txt': 'payload\n' }, excluded: string[] = []): Promise<void> {
      template('t', '@x/t', '1.0.0', files, excluded);
      expect((await call(['register', 'path:vendor/t'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ '@x/t': [target] })])).exitCode).toBe(0);
    }
    const confirmDelete = async (target = 'app') => {
      const review = envelope(await call(['delete', target]));
      expect(review.error?.code).toBe('CONFIRMATION_REQUIRED');
      return call(['delete', target, '--yes', `--plan-digest=${review.error!.details!.planDigest}`]);
    };

    it('M1/D6 declared exclusion: a reserved entry inside the excluded subtree is listed beside the exclusion root; digest tracks it; bytes survive', async () => {
      await apply('app', { 'a.txt': 'p\n' }, ['userland/']);
      write('app/userland/.git/config', 'protected\n');
      write('app/userland/ok.txt', 'user\n');
      const before = snapshot(project);
      const dry = envelope(await call(['delete', 'app', '--dry-run']));
      expect(dry.data?.toDelete).toEqual(['app/a.txt']);
      expect(dry.data?.toPreserve).toEqual(expect.arrayContaining(['app/userland/', 'app/userland/.git']));
      expect(snapshot(project)).toEqual(before);
      // a second nested reserved entry inside the same exclusion changes the projection
      const review = envelope(await call(['delete', 'app']));
      const digest = review.error!.details!.planDigest as string;
      write('app/userland/sub/.DS_Store', 'late');
      const stale = envelope(await call(['delete', 'app', '--yes', `--plan-digest=${digest}`]));
      expect(stale.error?.code).toBe('CONFIRMATION_REQUIRED');
      expect(stale.error?.details?.toPreserve).toContain('app/userland/sub/.DS_Store');
      const mid = snapshot(project);
      expect((await confirmDelete()).exitCode).toBe(0);
      const after = snapshot(project);
      for (const k of ['app/userland/.git/config', 'app/userland/ok.txt', 'app/userland/sub/.DS_Store']) expect(after[k], k).toBe(mid[k]);
      expect(diff(mid, after).removed).toEqual(['app/a.txt']);
    });

    it('M1 project-owned root: a reserved entry inside an owned root is listed beside the root', async () => {
      await apply();
      write('app/owned/.git/config', 'protected\n');
      write('app/owned/o.txt', 'owned\n');
      expect((await call(['ownership', 'add', 'app/owned'])).exitCode).toBe(0);
      const dry = envelope(await call(['delete', 'app', '--dry-run']));
      expect(dry.data?.toDelete).toEqual(['app/a.txt']);
      expect(dry.data?.toPreserve).toEqual(expect.arrayContaining(['app/owned', 'app/owned/.git']));
      const before = snapshot(project);
      expect((await confirmDelete()).exitCode).toBe(0);
      const after = snapshot(project);
      for (const k of ['app/owned/.git/config', 'app/owned/o.txt']) expect(after[k], k).toBe(before[k]);
    });

    it('M1 nested target: a reserved entry inside another template target is listed beside that target', async () => {
      template('g', '@x/g', '1.0.0', { 'g.txt': 'g\n' });
      template('t', '@x/t', '1.0.0', { 'a.txt': 'p\n' }, ['guest/']);
      expect((await call(['register', 'path:vendor/t'])).exitCode).toBe(0);
      expect((await call(['register', 'path:vendor/g'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ '@x/t': ['app'], '@x/g': ['app/guest'] })])).exitCode).toBe(0);
      write('app/guest/.git/config', 'guest-git\n');
      const dry = envelope(await call(['delete', 'app', '--dry-run']));
      expect(dry.data?.toDelete).toEqual(['app/a.txt']);
      expect(dry.data?.toPreserve).toEqual(expect.arrayContaining(['app/guest/', 'app/guest/.git']));
      const before = snapshot(project);
      expect((await confirmDelete()).exitCode).toBe(0);
      const after = snapshot(project);
      for (const k of ['app/guest/.git/config', 'app/guest/g.txt']) expect(after[k], k).toBe(before[k]);
    });

    it('M1 local origin folder: a reserved entry inside the owner\'s own origin folder is listed beside it (target ".")', async () => {
      await apply('.');
      write('vendor/t/.git/config', 'origin-git\n');
      const dry = envelope(await call(['delete', '.', '--dry-run']));
      expect(dry.data?.toPreserve).toEqual(expect.arrayContaining(['vendor/t', 'vendor/t/.git']));
      expect((dry.data?.toDelete ?? []).some((p) => p.startsWith('vendor/t'))).toBe(false);
    });

    it('D4c: a recorded target that became a symlink to a directory holding .git — protected data survives, ordinary files follow existing resolution', async () => {
      await apply();
      fs.rmSync(path.join(project, 'app'), { recursive: true });
      write('x/.git/config', 'real-git\n');
      write('x/y.txt', 'ordinary\n');
      fs.symlinkSync('x', path.join(project, 'app'));
      const before = snapshot(project);
      const dry = envelope(await call(['delete', 'app', '--dry-run']));
      expect(dry.data?.toDelete ?? []).not.toContain('app/.git/config');
      expect(dry.data?.toPreserve).toEqual(expect.arrayContaining(['app/.git']));
      expect(snapshot(project)).toEqual(before);
      const done = await confirmDelete();
      expect(done.exitCode).toBe(0);
      expect(fs.readFileSync(path.join(project, 'x/.git/config'), 'utf-8')).toBe('real-git\n');
    });

    it('D4d: a recorded target that resolves INSIDE .git — every candidate is preserved, nothing is deleted', async () => {
      await apply();
      fs.rmSync(path.join(project, 'app'), { recursive: true });
      write('store/.git/objects/o1', 'o1\n');
      write('store/.git/HEAD', 'ref\n');
      fs.symlinkSync('store/.git', path.join(project, 'app'));
      const before = snapshot(project);
      const dry = envelope(await call(['delete', 'app', '--dry-run']));
      expect(dry.data?.toDelete ?? []).toEqual([]);
      const done = await confirmDelete();
      expect(done.exitCode).toBe(0);
      const after = snapshot(project);
      for (const k of ['store/.git/objects/o1', 'store/.git/HEAD']) expect(after[k], k).toBe(before[k]);
    });

    it('D4e: an escaping alias is disclosed and nothing outside the project is touched', async () => {
      await apply();
      fs.mkdirSync(path.join(sandbox, 'elsewhere'));
      fs.writeFileSync(path.join(sandbox, 'elsewhere', 'keep.txt'), 'outside\n');
      fs.symlinkSync('../../elsewhere', path.join(project, 'app/out'));
      const dry = envelope(await call(['delete', 'app', '--dry-run']));
      expect(dry.data?.toPreserve).toContain('app/out');
      expect((await confirmDelete()).exitCode).toBe(0);
      expect(fs.readFileSync(path.join(sandbox, 'elsewhere', 'keep.txt'), 'utf-8')).toBe('outside\n');
    });

    it.skipIf(process.getuid?.() === 0)('D7: an unreadable NON-reserved directory fails the plan (generic error, no envelope), nothing is written', async () => {
      await apply();
      write('app/locked/f.txt', 'f\n');
      fs.chmodSync(path.join(project, 'app/locked'), 0o000);
      const before = snapshot(project);
      for (const args of [['delete', 'app', '--dry-run'], ['delete', 'app']]) {
        const o = await call(args);
        expect(o.exitCode, args.join(' ')).toBe(2);
        expect(String(o.stderr ?? '')).toMatch(/could not enumerate target directory/);
        expect(o.stdout ?? '').toBe('');
      }
      expect(snapshot(project)).toEqual(before);
    });

    for (const [label, disk] of [['matching', 'ds0'], ['diverged', 'developer edit']] as const) {
      it(`G2 (${label}): a prior payload that shipped .DS_Store, dropped by the candidate, leaves the disk file untouched`, async () => {
        template('v0', '@x/t', '1.0.0', { 'src/a.ts': 'one\n', '.DS_Store': 'ds0' });
        template('v1', '@x/t', '2.0.0', { 'src/a.ts': 'two\n' });
        expect((await call(['register', 'path:vendor/v0'])).exitCode).toBe(0);
        expect((await call(['apply', '--input', batch({ '@x/t': ['app'] })])).exitCode).toBe(0);
        write('app/.DS_Store', disk);
        const base = snapshot(project);
        const review = envelope(await call(['upgrade', '@x/t', 'path:vendor/v1']));
        expect(review.error?.code).toBe('CONFIRMATION_REQUIRED');
        expect(review.error!.details!.plan!.operations.filter((o) => /\.DS_Store$/.test(o.path))).toEqual([]);
        expect((await call(['upgrade', '@x/t', 'path:vendor/v1', '--yes', `--plan-digest=${review.error!.details!.planDigest}`])).exitCode).toBe(0);
        expect(snapshot(project)['app/.DS_Store']).toBe(base['app/.DS_Store']);
        expect(fs.readFileSync(path.join(project, 'app/src/a.ts'), 'utf-8')).toBe('two\n');
      });
    }
  });

  describe('upgrade and restore', () => {
    const V1 = { 'src/a.ts': 'one\n' };
    const V2 = { 'src/a.ts': 'two\n', '.DS_Store': 'tmpl-ds', '.git/config': 'tmpl-git\n' };
    it('G1/G3: v1→v2 skips nested env paths from the candidate, env bytes unchanged, restore likewise', async () => {
      template('v1', '@x/t', '1.0.0', V1);
      template('v2', '@x/t', '2.0.0', V2);
      expect((await call(['register', 'path:vendor/v1'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ '@x/t': ['app'] })])).exitCode).toBe(0);
      envFiles();
      const envKeys = ['app/.git/config', 'app/.git/objects/ab/cd', 'app/.DS_Store', 'app/sub/Thumbs.db'];
      const base = snapshot(project);

      const review = envelope(await call(['upgrade', '@x/t', 'path:vendor/v2']));
      expect(review.error?.code).toBe('CONFIRMATION_REQUIRED');
      const plan = review.error!.details!.plan!;
      expect(plan.operations.filter((o) => /(^|\/)(\.git|\.DS_Store|Thumbs\.db)(\/|$)/.test(o.path))).toEqual([]);
      const up = await call(['upgrade', '@x/t', 'path:vendor/v2', '--yes', `--plan-digest=${review.error!.details!.planDigest}`]);
      expect(up.exitCode).toBe(0);
      let s = snapshot(project);
      for (const k of envKeys) expect(s[k], k).toBe(base[k]);
      expect(fs.readFileSync(path.join(project, 'app/src/a.ts'), 'utf-8')).toBe('two\n');

      const rr = envelope(await call(['upgrade', '@x/t', '--restore']));
      expect(rr.error?.code).toBe('CONFIRMATION_REQUIRED');
      const rs = await call(['upgrade', '@x/t', '--restore', '--yes', `--plan-digest=${rr.error!.details!.planDigest}`]);
      expect(rs.exitCode).toBe(0);
      s = snapshot(project);
      for (const k of envKeys) expect(s[k], k).toBe(base[k]);
      expect(fs.readFileSync(path.join(project, 'app/src/a.ts'), 'utf-8')).toBe('one\n');
    });
  });
});
