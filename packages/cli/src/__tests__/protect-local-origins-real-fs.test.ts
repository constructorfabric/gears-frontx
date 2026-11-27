// @cpt-flow:cpt-frontx-flow-cli-scaffolding-delete-target:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-delete-plan:p1
//
// F3 — `delete` protects the LOCAL ORIGIN folders of every registered entry,
// current and previous (human ruling 2026-11-09: protect registered local
// origin directories from deletion with a target, preserving future restore
// capability), refuses an origin whose location cannot be determined, guards
// the real footprint of the AI-bundle removal against origin folders AND
// against the directory entries an origin's access path depends on, and says
// truthfully that confirming detaches the target. Real filesystem through
// `run()`. Scope: stable tree; registered-only protection (after an explicit
// `unregister` the folders are unprotected); apply/upgrade/bundle
// MATERIALIZATION overlap is NOT covered (separate, unresolved item).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// probe once at module load; B-HIGH-case skips on case-sensitive volumes
const caseSensitiveFs = (() => {
  const f = path.join(os.tmpdir(), `_frontx_case_probe_${Date.now()}`);
  try { fs.writeFileSync(f, ''); return !fs.existsSync(f.toUpperCase()); }
  finally { try { fs.unlinkSync(f); } catch { /* ok */ } }
})();

// probe once at module load; B-HIGH-nfc skips on volumes that don't equate NFC/NFD
const unicodeNormalizingFs = (() => {
  const nfc = path.join(os.tmpdir(), `_frontx_nfc_probe_${Date.now()}_é`);  // NFC é
  const nfd = path.join(os.tmpdir(), `_frontx_nfc_probe_${Date.now()}_é`); // NFD é
  try { fs.writeFileSync(nfc, ''); return fs.existsSync(nfd); }
  finally { try { fs.unlinkSync(nfc); } catch { /* ok */ } }
})();

// probe once at module load; B-HIGH-fold-dir skips on volumes that don't equate straße/strasse
const unicodeFoldingFs = (() => {
  const dir = path.join(os.tmpdir(), `_frontx_fold_probe_${Date.now()}`);
  try {
    fs.mkdirSync(dir);
    fs.mkdirSync(path.join(dir, 'straße')); // straße
    return fs.existsSync(path.join(dir, 'strasse'));
  } catch {
    return false;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
  }
})();
import { run, createRealDeps } from '../cli';
import { createFsClassifyPathStrictFn } from '../adapters/fs-project-io';

type Snap = Record<string, string>;
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
      } else out[rel] = `file ${mode} ${crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')}`;
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

describe('F3: delete protects registered local origins and the bundle footprint', () => {
  const originalCwd = process.cwd();
  const originalInv = process.env.FRONTX_INVENTORY_ROOT;
  let sandbox: string;
  let project: string;

  const call = (args: string[]) => run([...args, '--json'], createRealDeps());
  type Env = {
    ok: boolean;
    data?: { toDelete?: string[]; toPreserve?: string[] } & Record<string, unknown>;
    error?: { code: string; message: string; details?: { planDigest?: string; toDelete?: string[]; toPreserve?: string[] } & Record<string, unknown> };
  };
  const env = (o: { stdout?: string; stderr?: string }): Env => {
    expect(o.stderr).toBeUndefined();
    return JSON.parse(o.stdout ?? '') as Env;
  };
  const batch = (t: Record<string, string[]>) => JSON.stringify({ templates: t });
  const write = (rel: string, c = 'x\n') => {
    fs.mkdirSync(path.dirname(path.join(project, rel)), { recursive: true });
    fs.writeFileSync(path.join(project, rel), c);
  };
  function template(dir: string, name: string, version: string, files: Record<string, string> = { 'a.txt': 'p\n' }): void {
    const base = path.join(project, dir);
    fs.rmSync(base, { recursive: true, force: true });
    fs.mkdirSync(base, { recursive: true });
    fs.writeFileSync(path.join(base, 'frontx-template.json'), JSON.stringify({ name, version, description: 'fx', excludedSubtrees: [] }));
    for (const [rel, c] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
      fs.writeFileSync(path.join(base, rel), c);
    }
  }
  const state = () => JSON.parse(fs.readFileSync(path.join(project, '.frontx/project.json'), 'utf-8')) as {
    templates: Record<string, { origin: string; targets: string[]; previous?: { origin: string } }>;
  };
  const review = async (target: string) => {
    const e = env(await call(['delete', target]));
    expect(e.error?.code).toBe('CONFIRMATION_REQUIRED');
    return e;
  };
  const confirm = async (target: string) => {
    const e = await review(target);
    return call(['delete', target, '--yes', `--plan-digest=${e.error!.details!.planDigest}`]);
  };

  beforeEach(() => {
    sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-f3-')));
    project = path.join(sandbox, 'proj');
    fs.mkdirSync(project, { recursive: true });
    process.env.FRONTX_INVENTORY_ROOT = path.join(sandbox, 'inv');
    process.chdir(project);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    for (const p of ['private', '.frontx/ai']) {
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

  describe('current and previous origins of every entry are protected', () => {
    it('P1: the owner\'s PREVIOUS origin folder beneath its own target survives a digest-confirmed delete; both origins are listed', async () => {
      template('app/v1', '@x/t', '1.0.0', { 'src/a.ts': 'one\n' });
      template('app/v2', '@x/t', '2.0.0', { 'src/a.ts': 'two\n' });
      expect((await call(['register', 'path:app/v1'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ '@x/t': ['app'] }), '--adopt-existing'])).exitCode).toBe(0);
      const up = env(await call(['upgrade', '@x/t', 'path:app/v2']));
      expect((await call(['upgrade', '@x/t', 'path:app/v2', '--yes', `--plan-digest=${up.error!.details!.planDigest}`])).exitCode).toBe(0);
      expect(state().templates['@x/t'].previous?.origin).toBe('path:app/v1');
      const before = snapshot(project);
      const dry = env(await call(['delete', 'app', '--dry-run']));
      expect(dry.data?.toPreserve).toEqual(expect.arrayContaining(['app/v1', 'app/v2']));
      expect((dry.data?.toDelete ?? []).some((p) => p.startsWith('app/v1') || p.startsWith('app/v2'))).toBe(false);
      expect((await confirm('app')).exitCode).toBe(0);
      const after = snapshot(project);
      for (const k of Object.keys(before).filter((k) => k.startsWith('app/v1') || k.startsWith('app/v2'))) expect(after[k], k).toBe(before[k]);
    });

    it('P2: ANOTHER entry\'s current and previous origins beneath the target are protected', async () => {
      template('app/o1', '@x/o', '1.0.0');
      template('app/o2', '@x/o', '2.0.0');
      template('vendor/t', '@x/t', '1.0.0');
      expect((await call(['register', 'path:vendor/t'])).exitCode).toBe(0);
      expect((await call(['register', 'path:app/o1'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ '@x/t': ['app'] }), '--adopt-existing'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ '@x/o': ['other'] })])).exitCode).toBe(0);
      const up = env(await call(['upgrade', '@x/o', 'path:app/o2']));
      expect((await call(['upgrade', '@x/o', 'path:app/o2', '--yes', `--plan-digest=${up.error!.details!.planDigest}`])).exitCode).toBe(0);
      const dry = env(await call(['delete', 'app', '--dry-run']));
      expect(dry.data?.toPreserve).toEqual(expect.arrayContaining(['app/o1', 'app/o2']));
      expect((dry.data?.toDelete ?? []).some((p) => p.startsWith('app/o'))).toBe(false);
    });

    it('P3: an origin whose location cannot be determined refuses the whole delete before any plan or digest, nothing written; it proceeds once access is restored', async () => {
      template('vendor/t', '@x/t', '1.0.0');
      template('private/u', '@x/u', '1.0.0');
      expect((await call(['register', 'path:vendor/t'])).exitCode).toBe(0);
      expect((await call(['register', 'path:private/u'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ '@x/t': ['app'] })])).exitCode).toBe(0);
      if (process.getuid?.() === 0) return; // cannot construct EACCES as root
      fs.chmodSync(path.join(project, 'private'), 0o000);
      const before = snapshot(project);
      for (const args of [['delete', 'app', '--dry-run'], ['delete', 'app']]) {
        const o = await call(args);
        const e = env(o);
        expect(o.exitCode, args.join(' ')).toBe(1);
        expect(e.error?.code).toBe('CONTENT_CONFLICT');
        expect(e.error?.details?.origin).toBe('path:private/u');
        expect(e.error?.details?.planDigest).toBeUndefined();
      }
      expect(snapshot(project)).toEqual(before);
      fs.chmodSync(path.join(project, 'private'), 0o755);
      expect((await confirm('app')).exitCode).toBe(0);
    });

    it('P4: an origin folder that no longer exists is absent, not unknown: the delete proceeds and its location stays listed when it lies in the target', async () => {
      template('vendor/t', '@x/t', '1.0.0');
      template('app/gone', '@x/g', '1.0.0');
      expect((await call(['register', 'path:vendor/t'])).exitCode).toBe(0);
      expect((await call(['register', 'path:app/gone'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ '@x/t': ['app'] }), '--adopt-existing'])).exitCode).toBe(0);
      fs.rmSync(path.join(project, 'app/gone'), { recursive: true });
      const dry = env(await call(['delete', 'app', '--dry-run']));
      expect(dry.ok).toBe(true);
      expect(dry.data?.toPreserve).toContain('app/gone');
    });
  });

  describe('detachment is disclosed and the protected data survives', () => {
    it('T5: a detach-and-cleanup delete detaches the target and says so; the origin bytes survive; the registered-only boundary is real', async () => {
      template('app/src-a', '@x/a', '1.0.0', { 'src/k.txt': 'keep\n' });
      expect((await call(['register', 'path:app/src-a'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ '@x/a': ['app'] }), '--adopt-existing'])).exitCode).toBe(0);
      const before = snapshot(project);
      const r = await review('app');
      expect(r.error?.details?.toPreserve ?? []).toContain('app/src-a');
      expect((r.error?.details?.toDelete ?? []).some((p) => p.startsWith('app/src-a/'))).toBe(false);
      expect(r.error?.message).toContain('also removes "app" from "@x/a"');
      expect(r.error?.message).toContain('applied targets');
      const digest = r.error!.details!.planDigest;
      expect((await call(['delete', 'app', '--yes', `--plan-digest=${digest}`])).exitCode).toBe(0);
      expect(state().templates['@x/a'].targets).toEqual([]);
      const after = snapshot(project);
      for (const k of Object.keys(before).filter((k) => k.startsWith('app/src-a'))) expect(after[k], k).toBe(before[k]);
      // registered-only: once unregistered, a different template over the same ground sees it as ordinary
      expect((await call(['unregister', '@x/a'])).exitCode).toBe(0);
      template('vendor/c', '@x/c', '1.0.0');
      expect((await call(['register', 'path:vendor/c'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ '@x/c': ['app'] }), '--adopt-existing'])).exitCode).toBe(0);
      const rc = env(await call(['delete', 'app', '--dry-run']));
      expect((rc.data?.toDelete ?? []).some((p) => p.startsWith('app/src-a'))).toBe(true);
    });

    it('T5-allpreserved: when the entire target content is the origin folder, toDelete is empty; confirming detaches the target', async () => {
      // template with no content files; origin IS inside the target
      template('app/origin', '@x/a', '1.0.0', {});
      expect((await call(['register', 'path:app/origin'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ '@x/a': ['app'] })])).exitCode).toBe(0);
      const r = await review('app');
      expect(r.error?.details?.toDelete ?? []).toEqual([]);
      expect(r.error?.details?.toPreserve ?? []).toContain('app/origin');
      // confirm: all-preserved delete detaches the target while origin bytes survive
      const before = snapshot(project);
      const confirmed = env(await call(['delete', 'app', '--yes', `--plan-digest=${r.error!.details!.planDigest}`]));
      expect(confirmed.ok).toBe(true);
      expect(state().templates['@x/a'].targets).toEqual([]);
      for (const k of Object.keys(before).filter((k) => k.startsWith('app/origin'))) {
        expect(snapshot(project)[k], k).toBe(before[k]);
      }
    });
    it('T4e/T4e\': retargeting an origin under the target after review changes the plan (re-asks); retargeting one wholly outside does not', async () => {
      template('vendor/t', '@x/t', '1.0.0');
      template('app/o1', '@x/o', '1.0.0');
      template('app/o2', '@x/o', '1.0.0');
      template('elsewhere/e1', '@x/o', '1.0.0');
      expect((await call(['register', 'path:vendor/t'])).exitCode).toBe(0);
      expect((await call(['register', 'path:app/o1'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ '@x/t': ['app'] }), '--adopt-existing'])).exitCode).toBe(0);
      let rv = await review('app');
      expect(rv.error!.details!.toPreserve).toContain('app/o1');
      // retarget @x/o's origin app/o1 -> app/o2 (both under the target): projection changes
      const st = state();
      st.templates['@x/o'].origin = 'path:app/o2';
      fs.writeFileSync(path.join(project, '.frontx/project.json'), JSON.stringify({ formatVersion: 1, ...st, projectOwnedRoots: [] }));
      const stale = env(await call(['delete', 'app', '--yes', `--plan-digest=${rv.error!.details!.planDigest}`]));
      expect(stale.error?.code).toBe('CONFIRMATION_REQUIRED');
      expect(stale.error?.details?.toPreserve).toContain('app/o2');
      // control: move it wholly outside the target — the plan is the same shape, confirmation proceeds
      rv = await review('app');
      const st2 = state();
      st2.templates['@x/o'].origin = 'path:elsewhere/e1';
      fs.writeFileSync(path.join(project, '.frontx/project.json'), JSON.stringify({ formatVersion: 1, ...st2, projectOwnedRoots: [] }));
      const changed = env(await call(['delete', 'app', '--yes', `--plan-digest=${rv.error!.details!.planDigest}`]));
      expect(changed.error?.code ?? 'ok').toBe('CONFIRMATION_REQUIRED'); // o1/o2 listing dropped -> projection changed too
    });

    it('T4e\': outside-to-outside origin retarget with unchanged projection succeeds with the original digest', async () => {
      // @x/t applied to app; @x/u origin wholly outside — moving it outside-to-outside changes nothing
      template('vendor/t', '@x/t', '1.0.0');
      template('vendor/u', '@x/u', '1.0.0');
      template('vendor/u2', '@x/u', '1.0.0');
      expect((await call(['register', 'path:vendor/t'])).exitCode).toBe(0);
      expect((await call(['register', 'path:vendor/u'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ '@x/t': ['app'] })])).exitCode).toBe(0);
      const rv = await review('app');
      const digest = rv.error!.details!.planDigest;
      // projection: vendor/t is NOT under app, so toPreserve doesn't include it; vendor/u also outside
      expect((rv.error?.details?.toPreserve ?? []).every((p) => !p.startsWith('vendor/'))).toBe(true);
      // move @x/u's origin to vendor/u2 — still outside app, projection unchanged
      const st = state();
      st.templates['@x/u'].origin = 'path:vendor/u2';
      fs.writeFileSync(path.join(project, '.frontx/project.json'), JSON.stringify({ formatVersion: 1, ...st, projectOwnedRoots: [] }));
      const beforeBytes = snapshot(project);
      // confirm with the original digest succeeds because the full projection is unchanged
      const r = await call(['delete', 'app', '--yes', `--plan-digest=${digest}`]);
      expect(r.exitCode).toBe(0);
      const afterBytes = snapshot(project);
      // vendor/t and vendor/u2 (outside app) are untouched
      for (const k of Object.keys(beforeBytes).filter((k) => k.startsWith('vendor/'))) {
        expect(afterBytes[k], k).toBe(beforeBytes[k]);
      }
    });
  });

  describe('AI-bundle removal footprint (last target of the owner)', () => {
    const GUIDE = { 'a.txt': 'p\n', '.frontx/ai/@x/t/guide.md': 'guide\n' };
    async function ownerApplied(): Promise<void> {
      template('vendor/t', '@x/t', '1.0.0', GUIDE);
      expect((await call(['register', 'path:vendor/t'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ '@x/t': ['app'] })])).exitCode).toBe(0);
      expect(fs.existsSync(path.join(project, '.frontx/ai/@x/t/guide.md'))).toBe(true);
    }
    const refusedUnchanged = async (code = 'CONTENT_CONFLICT'): Promise<Env> => {
      const before = snapshot(project);
      const st = fs.readFileSync(path.join(project, '.frontx/project.json'), 'utf-8');
      const o = await call(['delete', 'app']);
      const e = env(o);
      expect(o.exitCode).toBe(1);
      expect(e.error?.code).toBe(code);
      expect(e.error?.details?.planDigest).toBeUndefined();
      expect(snapshot(project)).toEqual(before);
      expect(fs.readFileSync(path.join(project, '.frontx/project.json'), 'utf-8')).toBe(st);
      return e;
    };

    it('B1: another entry\'s origin INSIDE the bundle directory — refused, bundle/source/state unchanged', async () => {
      await ownerApplied();
      template('.frontx/ai/@x/t/src', '@x/u', '1.0.0');
      expect((await call(['register', 'path:.frontx/ai/@x/t/src'])).exitCode).toBe(0);
      await refusedUnchanged();
    });
    it('B2: another entry\'s PREVIOUS origin inside the bundle — refused', async () => {
      await ownerApplied();
      template('.frontx/ai/@x/t/src', '@x/u', '1.0.0');
      template('vendor/u2', '@x/u', '2.0.0');
      expect((await call(['register', 'path:.frontx/ai/@x/t/src'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ '@x/u': ['other'] })])).exitCode).toBe(0);
      const up = env(await call(['upgrade', '@x/u', 'path:vendor/u2']));
      expect((await call(['upgrade', '@x/u', 'path:vendor/u2', '--yes', `--plan-digest=${up.error!.details!.planDigest}`])).exitCode).toBe(0);
      expect(state().templates['@x/u'].previous?.origin).toBe('path:.frontx/ai/@x/t/src');
      await refusedUnchanged();
    });
    it('B3: an origin that CONTAINS the bundle directory — refused', async () => {
      await ownerApplied();
      template('.frontx/ai', '@x/u', '1.0.0', { 'frontx-keep.txt': 'k\n' });
      // the bundle directory now sits inside the origin folder; recreate it (template() wiped .frontx/ai)
      write('.frontx/ai/@x/t/guide.md', 'guide\n');
      expect((await call(['register', 'path:.frontx/ai'])).exitCode).toBe(0);
      await refusedUnchanged();
    });
    it('B4: the bundle path is a symlink to a registered origin folder (registered directly) — the delete proceeds, the link is removed, the source bytes are unchanged', async () => {
      await ownerApplied();
      template('vendor/x', '@x/x', '1.0.0', { 'src/f.txt': 'src\n' });
      expect((await call(['register', 'path:vendor/x'])).exitCode).toBe(0);
      fs.rmSync(path.join(project, '.frontx/ai/@x/t'), { recursive: true });
      fs.symlinkSync('../../../vendor/x', path.join(project, '.frontx/ai/@x/t'));
      const before = snapshot(project);
      expect((await confirm('app')).exitCode).toBe(0);
      const after = snapshot(project);
      expect(fs.existsSync(path.join(project, '.frontx/ai/@x/t'))).toBe(false);
      for (const k of Object.keys(before).filter((k) => k.startsWith('vendor/x'))) expect(after[k], k).toBe(before[k]);
    });
    it('B-HIGH-final: an origin REACHED THROUGH the bundle link (path:.frontx/ai/@x/t/src) — refused: removing the link breaks the stored path', async () => {
      await ownerApplied();
      template('vendor/x', '@x/u', '1.0.0');
      fs.mkdirSync(path.join(project, 'vendor/x/src'));
      fs.writeFileSync(path.join(project, 'vendor/x/src/frontx-template.json'), JSON.stringify({ name: '@x/w', version: '1.0.0', description: 'd', excludedSubtrees: [] }));
      fs.rmSync(path.join(project, '.frontx/ai/@x/t'), { recursive: true });
      fs.symlinkSync('../../../vendor/x', path.join(project, '.frontx/ai/@x/t'));
      expect((await call(['register', 'path:.frontx/ai/@x/t/src'])).exitCode).toBe(0);
      await refusedUnchanged();
      // the stored origin is still usable afterwards
      expect((await call(['validate', '--project'])).exitCode).toBe(0);
    });
    it('B-HIGH-internal: an origin that traverses a link INSIDE the real bundle directory — refused', async () => {
      await ownerApplied();
      template('vendor/y', '@x/w', '1.0.0');
      fs.symlinkSync('../../../../vendor/y', path.join(project, '.frontx/ai/@x/t/ln'));
      expect((await call(['register', 'path:.frontx/ai/@x/t/ln'])).exitCode).toBe(0);
      await refusedUnchanged();
    });
    it('B7: an entryKind lstat error on the bundle path is refused, nothing changed', async () => {
      await ownerApplied();
      // snapshot before spy — snapshot() itself calls lstatSync
      const before = snapshot(project);
      const st = fs.readFileSync(path.join(project, '.frontx/project.json'), 'utf-8');
      const bundleReal = path.join(fs.realpathSync(project), '.frontx', 'ai', '@x', 't');
      const real = fs.lstatSync;
      vi.spyOn(fs, 'lstatSync').mockImplementation(((p: fs.PathLike, o?: unknown) => {
        if (String(p) === bundleReal) throw Object.assign(new Error('EIO'), { code: 'EIO' });
        return (real as (a: fs.PathLike, b?: unknown) => fs.Stats)(p, o);
      }) as typeof fs.lstatSync);
      const o = await call(['delete', 'app']);
      const e = env(o);
      expect(o.exitCode).toBe(1);
      expect(e.error?.code).toBe('CONTENT_CONFLICT');
      expect(e.error?.details?.planDigest).toBeUndefined();
      expect(fs.readFileSync(path.join(project, '.frontx/project.json'), 'utf-8')).toBe(st);
      vi.restoreAllMocks();
      expect(snapshot(project)).toEqual(before);
    });
    it.skipIf(!unicodeNormalizingFs)('B-HIGH-nfc: an NFD access path through an NFC-named bundle link is refused on a unicode-normalizing volume', async () => {
      // owner @x/café (NFC é = é); bundle .frontx/ai/@x/café -> ../../../vendor/x
      const ownerNfc = '@x/café'; // café NFC
      template('vendor/x', ownerNfc, '1.0.0', { 'src/f.txt': 'src\n', [`.frontx/ai/${ownerNfc}/src/f.txt`]: 'bundle\n' });
      expect((await call(['register', 'path:vendor/x'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ [ownerNfc]: ['app'] })])).exitCode).toBe(0);
      // replace real bundle dir with a symlink
      fs.rmSync(path.join(project, `.frontx/ai/${ownerNfc}`), { recursive: true });
      fs.symlinkSync('../../../vendor/x', path.join(project, `.frontx/ai/${ownerNfc}`));
      // set origin directly to NFD path — register --replace is refused with active targets
      const nfdPath = `.frontx/ai/@x/café/src`; // NFD: e + U+0301
      const st = JSON.parse(fs.readFileSync(path.join(project, '.frontx/project.json'), 'utf-8'));
      st.templates[ownerNfc].origin = `path:${nfdPath}`;
      fs.writeFileSync(path.join(project, '.frontx/project.json'), JSON.stringify(st));
      const before = snapshot(project);
      await refusedUnchanged();
      // source bytes and registration survive
      for (const k of Object.keys(before).filter((k) => k.startsWith('vendor/x'))) {
        expect(snapshot(project)[k], k).toBe(before[k]);
      }
    });
    it.skipIf(!unicodeNormalizingFs)('B-HIGH-nfc-dir: an NFD origin path inside a real (non-symlink) NFC-named bundle directory is refused', async () => {
      // Real directory footprint: bundle stays as a directory, no symlink replacement.
      // nfcTouches check in bundleFootprintVerdict catches this via canonical containment.
      const ownerNfc = `@x/café`;
      template('vendor/t', ownerNfc, '1.0.0', {
        'a.txt': 'p\n',
        [`.frontx/ai/${ownerNfc}/sub/f.txt`]: 'source\n',
      });
      expect((await call(['register', 'path:vendor/t'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ [ownerNfc]: ['app'] })])).exitCode).toBe(0);
      // confirm real directory, not symlink
      expect(fs.lstatSync(path.join(project, `.frontx/ai/${ownerNfc}`)).isDirectory()).toBe(true);
      // register @x/u with its manifest at the NFC bundle sub-path so inventory is populated
      fs.writeFileSync(
        path.join(project, `.frontx/ai/${ownerNfc}/sub/frontx-template.json`),
        JSON.stringify({ name: '@x/u', version: '1.0.0', description: 'd', excludedSubtrees: [] }),
      );
      expect((await call(['register', `path:.frontx/ai/${ownerNfc}/sub`])).exitCode).toBe(0);
      // overwrite origin to NFD spelling — same FS path on a normalizing volume
      const nfdOrigin = `.frontx/ai/@x/café/sub`;
      const st = JSON.parse(fs.readFileSync(path.join(project, '.frontx/project.json'), 'utf-8'));
      st.templates['@x/u'].origin = `path:${nfdOrigin}`;
      fs.writeFileSync(path.join(project, '.frontx/project.json'), JSON.stringify(st));
      // delete must refuse: NFD origin is inside the NFC bundle directory being removed
      await refusedUnchanged();
    });

    it.skipIf(!unicodeFoldingFs)('B-HIGH-fold-dir: an origin registered via a Unicode-folded alias (strasse) of a real bundle directory (straße) is refused', async () => {
      // Reproduce the reviewer-confirmed data-loss: on APFS, straße and strasse share an inode.
      // The strict classifier must record the PHYSICAL name (straße) so ciNorm comparison succeeds.
      const ownerFold = '@x/straße';
      template('vendor/t', ownerFold, '1.0.0', {
        'a.txt': 'p\n',
        [`.frontx/ai/${ownerFold}/sub/f.txt`]: 'source\n',
      });
      expect((await call(['register', 'path:vendor/t'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ [ownerFold]: ['app'] })])).exitCode).toBe(0);
      // confirm real directory, not symlink
      expect(fs.lstatSync(path.join(project, `.frontx/ai/${ownerFold}`)).isDirectory()).toBe(true);
      // create sub-directory via physical path and write manifest for @x/u
      fs.writeFileSync(
        path.join(project, `.frontx/ai/${ownerFold}/sub/frontx-template.json`),
        JSON.stringify({ name: '@x/u', version: '1.0.0', description: 'd', excludedSubtrees: [] }),
      );
      expect((await call(['register', `path:.frontx/ai/${ownerFold}/sub`])).exitCode).toBe(0);
      // overwrite origin to fold-alias spelling — strasse == straße on this FS
      const foldAlias = `.frontx/ai/@x/strasse/sub`;
      const st = JSON.parse(fs.readFileSync(path.join(project, '.frontx/project.json'), 'utf-8'));
      st.templates['@x/u'].origin = `path:${foldAlias}`;
      fs.writeFileSync(path.join(project, '.frontx/project.json'), JSON.stringify(st));
      // delete must refuse: folded-alias origin is inside the bundle directory being removed
      await refusedUnchanged();
    });

    it.skipIf(!unicodeFoldingFs)('B-HIGH-fold-control: an origin wholly outside the bundle is not refused on a folding volume', async () => {
      const ownerFold = '@x/straße';
      template('vendor/t', ownerFold, '1.0.0', { 'a.txt': 'p\n' });
      template('vendor/u', '@x/u', '1.0.0');
      expect((await call(['register', 'path:vendor/t'])).exitCode).toBe(0);
      expect((await call(['register', 'path:vendor/u'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ [ownerFold]: ['app'] })])).exitCode).toBe(0);
      // origin vendor/u is wholly outside .frontx/ai/@x/straße — delete must proceed
      expect((await confirm('app')).exitCode).toBe(0);
      expect(fs.existsSync(path.join(project, `.frontx/ai/${ownerFold}`))).toBe(false);
    });

    it.skipIf(!unicodeFoldingFs)('B-HIGH-fold-reverse: an origin at the PHYSICAL bundle dir (straße) is refused when the owner key uses the fold alias (strasse)', async () => {
      // Reverse direction of B-HIGH-fold-dir: the bundle dir was created as 'straße' (ß),
      // but the owner key in project.json was later changed to 'strasse' (ss). The guard must
      // resolve the physical bundle entry and refuse, not compare raw 'strasse' against physical 'straße'.
      const ownerPhysical = '@x/straße'; // ß — used to register, creates the physical dir
      template('vendor/t', ownerPhysical, '1.0.0', {
        'a.txt': 'p\n',
        [`.frontx/ai/${ownerPhysical}/sub/f.txt`]: 'source\n',
      });
      expect((await call(['register', 'path:vendor/t'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ [ownerPhysical]: ['app'] })])).exitCode).toBe(0);
      expect(fs.lstatSync(path.join(project, `.frontx/ai/${ownerPhysical}`)).isDirectory()).toBe(true);
      // Write manifest for @x/u inside the physical bundle dir
      fs.writeFileSync(
        path.join(project, `.frontx/ai/${ownerPhysical}/sub/frontx-template.json`),
        JSON.stringify({ name: '@x/u', version: '1.0.0', description: 'd', excludedSubtrees: [] }),
      );
      expect((await call(['register', `path:.frontx/ai/${ownerPhysical}/sub`])).exitCode).toBe(0);
      // Change @x/t key in project.json from 'straße' to 'strasse' (fold alias)
      const st = JSON.parse(fs.readFileSync(path.join(project, '.frontx/project.json'), 'utf-8'));
      const ownerAlias = '@x/strasse'; // ASCII ss
      st.templates[ownerAlias] = st.templates[ownerPhysical];
      delete st.templates[ownerPhysical];
      fs.writeFileSync(path.join(project, '.frontx/project.json'), JSON.stringify(st));
      // The @x/u origin is at the PHYSICAL 'straße' path; delete must refuse via physical footprint
      await refusedUnchanged();
    });

    it.skipIf(!unicodeFoldingFs)('B-HIGH-fold-reverse-control: an origin wholly outside the bundle is not refused when owner key uses the fold alias', async () => {
      const ownerPhysical = '@x/straße';
      template('vendor/t', ownerPhysical, '1.0.0', { 'a.txt': 'p\n' });
      template('vendor/u', '@x/u', '1.0.0');
      expect((await call(['register', 'path:vendor/t'])).exitCode).toBe(0);
      expect((await call(['register', 'path:vendor/u'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ [ownerPhysical]: ['app'] })])).exitCode).toBe(0);
      // Change key to alias spelling
      const st = JSON.parse(fs.readFileSync(path.join(project, '.frontx/project.json'), 'utf-8'));
      const ownerAlias = '@x/strasse';
      st.templates[ownerAlias] = st.templates[ownerPhysical];
      delete st.templates[ownerPhysical];
      fs.writeFileSync(path.join(project, '.frontx/project.json'), JSON.stringify(st));
      // vendor/u origin is wholly outside .frontx/ai/@x/straße — delete must proceed
      expect((await confirm('app')).exitCode).toBe(0);
      expect(fs.existsSync(path.join(project, `.frontx/ai/${ownerPhysical}`))).toBe(false);
    });

    it.skipIf(caseSensitiveFs)('B-HIGH-case: a case-variant access path through the bundle link is refused on a case-insensitive volume', async () => {
      await ownerApplied();
      template('vendor/x', '@x/u', '1.0.0');
      fs.mkdirSync(path.join(project, 'vendor/x/src'));
      fs.writeFileSync(path.join(project, 'vendor/x/src/frontx-template.json'), JSON.stringify({ name: '@x/w', version: '1.0.0', description: 'd', excludedSubtrees: [] }));
      fs.rmSync(path.join(project, '.frontx/ai/@x/t'), { recursive: true });
      fs.symlinkSync('../../../vendor/x', path.join(project, '.frontx/ai/@x/t'));
      // register with uppercase components — on case-insensitive FS this resolves to vendor/x/src
      expect((await call(['register', 'path:.frontx/AI/@X/T/src'])).exitCode).toBe(0);
      const before = snapshot(project);
      await refusedUnchanged();
      // source bytes and registration survive the refused attempt
      for (const k of Object.keys(before).filter((k) => k.startsWith('vendor/x'))) {
        expect(snapshot(project)[k], k).toBe(before[k]);
      }
      // src/frontx-template.json declares '@x/w', so that's what register stored
      expect(state().templates['@x/w'].origin).toBe('path:.frontx/AI/@X/T/src');
    });
    it('B5: a bundle parent that stays in the project but escapes the AI namespace — refused at plan time, nothing changed', async () => {
      await ownerApplied();
      fs.mkdirSync(path.join(project, '.frontx/elsewhere/t'), { recursive: true });
      fs.writeFileSync(path.join(project, '.frontx/elsewhere/t/guide.md'), 'g\n');
      fs.rmSync(path.join(project, '.frontx/ai/@x'), { recursive: true });
      fs.symlinkSync('../elsewhere', path.join(project, '.frontx/ai/@x'));
      await refusedUnchanged();
    });
    it.skipIf(process.getuid?.() === 0)('B6: an unreadable AI namespace cannot be classified — refused', async () => {
      await ownerApplied();
      fs.chmodSync(path.join(project, '.frontx/ai'), 0o000);
      await refusedUnchanged();
    });
    it('B8 control: no intersection — the bundle is removed as before', async () => {
      await ownerApplied();
      expect((await confirm('app')).exitCode).toBe(0);
      expect(fs.existsSync(path.join(project, '.frontx/ai/@x/t'))).toBe(false);
      expect(diff({}, {}).added).toEqual([]);
    });

    it('B-HIGH-dangling: origin AT the dangling bundle symlink is refused — the link physically exists and would be removed', async () => {
      // Bundle entry is a dangling symlink (.frontx/ai/@x/t → missing target).
      // An origin registered AT .frontx/ai/@x/t itself must be protected because
      // the adapter removes the link file regardless of its target's existence.
      await ownerApplied();
      template('vendor/u', '@x/u', '1.0.0');
      expect((await call(['register', 'path:vendor/u'])).exitCode).toBe(0);
      // Replace the bundle directory with a dangling symlink
      fs.rmSync(path.join(project, '.frontx/ai/@x/t'), { recursive: true });
      fs.symlinkSync('../../../vendor/missing', path.join(project, '.frontx/ai/@x/t'));
      // Change @x/u origin to point AT the dangling link (preserve all other registered fields)
      const st = JSON.parse(fs.readFileSync(path.join(project, '.frontx/project.json'), 'utf-8'));
      st.templates['@x/u'].origin = 'path:.frontx/ai/@x/t';
      fs.writeFileSync(path.join(project, '.frontx/project.json'), JSON.stringify(st));
      await refusedUnchanged();
      // The dangling link must still be there after the refused delete
      expect(fs.lstatSync(path.join(project, '.frontx/ai/@x/t')).isSymbolicLink()).toBe(true);
    });

    it('B-HIGH-dangling-access: origin accessed THROUGH the dangling bundle symlink is refused', async () => {
      // An origin whose access path traverses the dangling link is blocked because
      // removing the link breaks the path, even though the origin's target is absent.
      await ownerApplied();
      template('vendor/u', '@x/u', '1.0.0');
      expect((await call(['register', 'path:vendor/u'])).exitCode).toBe(0);
      fs.rmSync(path.join(project, '.frontx/ai/@x/t'), { recursive: true });
      fs.symlinkSync('../../../vendor/missing', path.join(project, '.frontx/ai/@x/t'));
      // Change @x/u origin to a path that traverses through the dangling link
      const st = JSON.parse(fs.readFileSync(path.join(project, '.frontx/project.json'), 'utf-8'));
      st.templates['@x/u'].origin = 'path:.frontx/ai/@x/t/src';
      fs.writeFileSync(path.join(project, '.frontx/project.json'), JSON.stringify(st));
      await refusedUnchanged();
    });

    it('B-HIGH-dangling-control: an unrelated origin is NOT refused when bundle is a dangling symlink', async () => {
      // Bundle is dangling, but the registered origin is wholly unrelated — delete must proceed.
      await ownerApplied();
      template('vendor/u', '@x/u', '1.0.0');
      expect((await call(['register', 'path:vendor/u'])).exitCode).toBe(0);
      fs.rmSync(path.join(project, '.frontx/ai/@x/t'), { recursive: true });
      fs.symlinkSync('../../../vendor/missing', path.join(project, '.frontx/ai/@x/t'));
      // @x/u origin remains vendor/u — entirely outside the bundle — delete must proceed
      expect((await confirm('app')).exitCode).toBe(0);
      // The dangling link is gone (adapter removes it)
      expect(fs.existsSync(path.join(project, '.frontx/ai/@x/t'))).toBe(false);
    });

    it('B-HIGH-dangling-absent-entry: a genuinely absent (no link) bundle returns ok:true — not a false refusal', async () => {
      // Control: when the bundle directory was never created, delete proceeds normally.
      template('vendor/t', '@x/t', '1.0.0'); // no .frontx/ai files
      expect((await call(['register', 'path:vendor/t'])).exitCode).toBe(0);
      expect((await call(['apply', '--input', batch({ '@x/t': ['app'] })])).exitCode).toBe(0);
      // No .frontx/ai/@x/t exists at all — not even a symlink
      expect(fs.existsSync(path.join(project, '.frontx/ai/@x/t'))).toBe(false);
      // No origin registered — delete must proceed (CONFIRMATION_REQUIRED, then ok)
      expect((await confirm('app')).exitCode).toBe(0);
    });
  });
});

describe('F3: resolvePhysicalName hard-link disambiguation', () => {
  let root: string;
  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-hl-')));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('HL-file: classifying a hard-linked file returns the requested name, not the alphabetically-prior sibling', () => {
    fs.mkdirSync(path.join(root, 'dir'));
    fs.writeFileSync(path.join(root, 'dir/zzz-file'), 'x');
    fs.linkSync(path.join(root, 'dir/zzz-file'), path.join(root, 'dir/aaa-file'));
    const classify = createFsClassifyPathStrictFn(root);
    // Both spellings must classify to their own canonical, not the alphabetically-first sibling
    const zzz = classify('dir/zzz-file');
    expect(zzz.kind).toBe('present');
    if (zzz.kind !== 'present') return;
    expect(zzz.canonical).toBe('dir/zzz-file');
    const aaa = classify('dir/aaa-file');
    expect(aaa.kind).toBe('present');
    if (aaa.kind !== 'present') return;
    expect(aaa.canonical).toBe('dir/aaa-file');
  });

  it('HL-symlink: classifying a hard-linked symlink (if supported by the platform) returns the requested entry name', () => {
    fs.mkdirSync(path.join(root, 'dir'));
    fs.mkdirSync(path.join(root, 'target'));
    fs.symlinkSync(path.join(root, 'target'), path.join(root, 'dir/zzz-link'));
    try {
      fs.linkSync(path.join(root, 'dir/zzz-link'), path.join(root, 'dir/aaa-link'));
    } catch {
      return; // platform (e.g. macOS) does not support hard links to symlinks — skip
    }
    const classify = createFsClassifyPathStrictFn(root);
    const zzz = classify('dir/zzz-link');
    if (zzz.kind === 'unknown') throw new Error(zzz.reason);
    // entries must record the requested name, not the alphabetically-prior hard link
    expect(zzz.entries.some((e) => e.path === 'dir/zzz-link' && e.symlink)).toBe(true);
    expect(zzz.entries.every((e) => e.path !== 'dir/aaa-link')).toBe(true);
    const aaa = classify('dir/aaa-link');
    if (aaa.kind === 'unknown') throw new Error(aaa.reason);
    expect(aaa.entries.some((e) => e.path === 'dir/aaa-link' && e.symlink)).toBe(true);
    expect(aaa.entries.every((e) => e.path !== 'dir/zzz-link')).toBe(true);
  });

  // Helper: inject an error with the given code on the SECOND lstat call for `targetPath`.
  // The first call (initial stat before readdirSync) is allowed through; the second
  // (enumeration-time lstat) throws, simulating a transient FS fault during sibling scan.
  function injectSecondLstatError(targetPath: string, code: string): void {
    const realLstat = fs.lstatSync.bind(fs);
    let callCount = 0;
    vi.spyOn(fs, 'lstatSync').mockImplementation((p, opts?) => {
      const ps = typeof p === 'string' ? p : p.toString();
      if (ps === targetPath) {
        callCount++;
        if (callCount > 1) {
          const err = new Error(`${code}: injected`) as NodeJS.ErrnoException;
          err.code = code;
          throw err;
        }
      }
      return realLstat(ps, opts as Parameters<typeof realLstat>[1]);
    });
  }

  it('HL-eio-sibling: EIO during sibling enumeration fails closed — returns unknown instead of the wrong hard-link sibling', () => {
    // Mutation: OLD code skipped all errors → returned aaa-file (wrong sibling).
    // Fix: any lstat error during enumeration (stable tree assumed) → fail closed.
    fs.mkdirSync(path.join(root, 'dir'));
    fs.writeFileSync(path.join(root, 'dir/zzz-file'), 'x');
    fs.linkSync(path.join(root, 'dir/zzz-file'), path.join(root, 'dir/aaa-file'));
    injectSecondLstatError(path.join(root, 'dir/zzz-file'), 'EIO');
    const classify = createFsClassifyPathStrictFn(root);
    const result = classify('dir/zzz-file');
    expect(result.kind).toBe('unknown');
  });

  it('HL-enoent-sibling: ENOENT during sibling enumeration also fails closed — returns unknown, not the wrong hard-link sibling', () => {
    // Scope: stable tree assumed. In a stable tree, ENOENT during enumeration is unexpected
    // (the directory was just successfully read). Skipping it risks returning a sibling
    // hard link as canonical — a wrong identity. The fix treats ALL enumeration lstat
    // errors as incomplete-enumeration and returns null (unknown to the caller).
    // This is NOT a concurrency guarantee: on a filesystem with concurrent removes the
    // classifier can still observe partial state; the stable-tree assumption is documented
    // in the function comment and in this test's scope.
    fs.mkdirSync(path.join(root, 'dir'));
    fs.writeFileSync(path.join(root, 'dir/zzz-file'), 'x');
    fs.linkSync(path.join(root, 'dir/zzz-file'), path.join(root, 'dir/aaa-file'));
    injectSecondLstatError(path.join(root, 'dir/zzz-file'), 'ENOENT');
    const classify = createFsClassifyPathStrictFn(root);
    const result = classify('dir/zzz-file');
    // With old ENOENT-skip: aaa-file match survives → present canonical aaa-file (wrong sibling).
    // With fail-closed: unknown.
    expect(result.kind).toBe('unknown');
  });

  // Helper: inject an error on the FIRST lstat call for `targetPath` (every call, not just 2nd+).
  // Used when the initial stat and enumeration stat use different path spellings (fold aliases):
  // the initial lstat uses the alias spelling; the enumeration lstat uses the physical spelling.
  // Also used for unrelated siblings: the initial lstat targets a DIFFERENT path, so the sibling's
  // first lstat (during enumeration) is the first call to that path — injectSecondLstatError would
  // skip it (callCount=1, 1>1 false).
  function injectFirstLstatError(targetPath: string, code: string): void {
    const realLstat = fs.lstatSync.bind(fs);
    vi.spyOn(fs, 'lstatSync').mockImplementation((p, opts?) => {
      const ps = typeof p === 'string' ? p : p.toString();
      if (ps === targetPath) {
        const err = new Error(`${code}: injected`) as NodeJS.ErrnoException;
        err.code = code;
        throw err;
      }
      return realLstat(ps, opts as Parameters<typeof realLstat>[1]);
    });
  }

  it('HL-enoent-sibling-control: ENOENT on any sibling also fails closed — blanket rule, no selective skip', () => {
    // Blanket fail-closed: even a CI-unrelated sibling whose ENOENT cannot directly cause a wrong
    // hard-link identity still fails closed. Any incomplete enumeration is treated as unsafe.
    // The r9 selective-skip was unsound: NFC/lowercase comparison cannot predict all FS-level
    // equivalences (e.g. ß↔ss on APFS), so no entry name can be safely declared "unrelated".
    // The C10 test fixture uses relative symlinks so it never traverses os.tmpdir() — that is
    // the correct isolation strategy for real transient entries, not a code-level selective skip.
    // Note: injectFirstLstatError is needed here (not injectSecondLstatError) because the initial
    // lstat targets 'zzz-file', so the first lstat call to 'aaa-file' is the enumeration call.
    fs.mkdirSync(path.join(root, 'dir'));
    fs.writeFileSync(path.join(root, 'dir/zzz-file'), 'x');
    fs.writeFileSync(path.join(root, 'dir/aaa-file'), 'y'); // different inode — not a hard link
    injectFirstLstatError(path.join(root, 'dir/aaa-file'), 'ENOENT');
    const classify = createFsClassifyPathStrictFn(root);
    // aaa-file ENOENT → enumeration incomplete → fail closed → unknown (not present).
    const result = classify('dir/zzz-file');
    expect(result.kind).toBe('unknown');
  });

  it.skipIf(!unicodeFoldingFs)('HL-fold-alias-stable: on a folding FS, classifying via the fold alias (strasse) finds the physical name (straße)', () => {
    // On APFS: 'straße' and 'strasse' are the same directory entry (ß↔ss folding).
    // lstatSync('dir/strasse') returns the same inode as 'dir/straße'.
    // readdirSync returns the physical name 'straße'; inode comparison matches → canonical is 'straße'.
    fs.mkdirSync(path.join(root, 'dir'));
    fs.writeFileSync(path.join(root, 'dir/straße'), 'x');
    const classify = createFsClassifyPathStrictFn(root);
    const result = classify('dir/strasse'); // alias
    expect(result.kind).toBe('present');
    if (result.kind !== 'present') return;
    expect(result.canonical).toBe('dir/straße'); // physical name
  });

  it.skipIf(!unicodeFoldingFs)('HL-fold-alias-enoent: ENOENT for the physical alias (straße) during enumeration fails closed even though NFC/lowercase differs from requested (strasse)', () => {
    // This is the r9 unsoundness: 'straße'.NFC.lower = 'straße' ≠ 'strasse' = ciSeg, so r9 skipped
    // the ENOENT and returned the hard-link sibling 'aaa' as canonical — a wrong identity.
    // With blanket fail-closed, any ENOENT during enumeration → unknown, regardless of name spelling.
    // Mutation: r9 code → present canonical dir/aaa (wrong). r10 code → unknown.
    fs.mkdirSync(path.join(root, 'dir'));
    fs.writeFileSync(path.join(root, 'dir/straße'), 'x');
    fs.linkSync(path.join(root, 'dir/straße'), path.join(root, 'dir/aaa')); // hard-link sibling
    // The initial lstat uses the alias path ('dir/strasse'); the enumeration lstat uses the
    // physical path ('dir/straße'). Inject on the physical path → enumeration fails.
    injectFirstLstatError(path.join(root, 'dir/straße'), 'ENOENT');
    const classify = createFsClassifyPathStrictFn(root);
    const result = classify('dir/strasse');
    expect(result.kind).toBe('unknown');
  });
});
