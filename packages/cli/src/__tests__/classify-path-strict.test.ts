// @cpt-algo:cpt-frontx-algo-cli-scaffolding-delete-plan:p1
//
// `classifyPathStrict`: the fail-closed, per-component classification `delete`
// uses to locate a registered LOCAL origin. Unlike the lenient canonicalizer
// (which maps any failure to the nearest existing ancestor), it separates a
// genuinely ABSENT location from one that cannot be determined (`unknown`:
// EACCES, EIO, a link cycle, a readlink failure), and reports every entry the
// access path traverses so a caller can tell which directory entries the
// origin's path depends on. Stable tree only; no TOCTOU claim.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFsCanonicalizeTargetFn, createFsClassifyPathStrictFn } from '../adapters/fs-project-io';

describe('classifyPathStrict', () => {
  let sandbox: string;
  let root: string;
  const w = (rel: string, c = 'x') => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), c);
  };
  beforeEach(() => {
    sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-strict-')));
    root = path.join(sandbox, 'proj');
    fs.mkdirSync(root);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const p of ['locked', 'a/locked']) {
      try {
        fs.chmodSync(path.join(root, p), 0o755);
      } catch {
        /* absent */
      }
    }
    fs.rmSync(sandbox, { recursive: true, force: true });
    expect(fs.existsSync(sandbox)).toBe(false);
  });
  const classify = (raw: string) => createFsClassifyPathStrictFn(root)(raw);

  it('C1 present directory', () => {
    w('vendor/t/a.txt');
    expect(classify('vendor/t')).toMatchObject({ kind: 'present', canonical: 'vendor/t' });
  });
  it('C2 missing leaf / C3 missing intermediate / C4 file as intermediate are absent with the lexical remainder', () => {
    w('vendor/f.txt');
    fs.mkdirSync(path.join(root, 'vendor/d'), { recursive: true });
    expect(classify('vendor/d/missing')).toMatchObject({ kind: 'absent', canonical: 'vendor/d/missing' });
    expect(classify('nope/deeper/x')).toMatchObject({ kind: 'absent', canonical: 'nope/deeper/x' });
    expect(classify('vendor/f.txt/under')).toMatchObject({ kind: 'absent', canonical: 'vendor/f.txt/under' });
  });
  it.skipIf(process.getuid?.() === 0)('C5 an unreadable parent is unknown, never absent', () => {
    fs.mkdirSync(path.join(root, 'locked/inner'), { recursive: true });
    fs.chmodSync(path.join(root, 'locked'), 0o000);
    const r = classify('locked/inner/src');
    expect(r.kind).toBe('unknown');
  });
  it('C6 an injected lstat failure is unknown', () => {
    w('vendor/t/a.txt');
    const real = fs.lstatSync;
    vi.spyOn(fs, 'lstatSync').mockImplementation(((p: fs.PathLike, o?: unknown) => {
      if (String(p).endsWith(`${path.sep}vendor`)) throw Object.assign(new Error('EIO'), { code: 'EIO' });
      return (real as (a: fs.PathLike, b?: unknown) => fs.Stats)(p, o);
    }) as typeof fs.lstatSync);
    expect(classify('vendor/t')).toMatchObject({ kind: 'unknown' });
  });
  it('C7 a link cycle is unknown', () => {
    fs.symlinkSync('b', path.join(root, 'a'));
    fs.symlinkSync('a', path.join(root, 'b'));
    expect(classify('a/x')).toMatchObject({ kind: 'unknown' });
  });
  it('C8 a dangling final link is absent at its target location', () => {
    fs.symlinkSync('gone/place', path.join(root, 'ln'));
    expect(classify('ln')).toMatchObject({ kind: 'absent', canonical: 'gone/place' });
  });
  it('C9 a link leaving the root is outside', () => {
    fs.mkdirSync(path.join(sandbox, 'elsewhere'));
    fs.symlinkSync('../elsewhere', path.join(root, 'out'));
    expect(classify('out')).toMatchObject({ kind: 'outside' });
  });
  it('C10 a chain that exits the root and re-enters is judged at the final inside location', () => {
    w('real/t/f.txt');
    // Use relative symlinks so the traversal stays within the isolated sandbox and never
    // enumerates os.tmpdir(), which may have concurrent entries that ENOENT during lstat.
    // sandbox/outside/back -> ../proj/real  (stays in sandbox, not in os.tmpdir())
    fs.mkdirSync(path.join(sandbox, 'outside'));
    fs.symlinkSync('../proj/real', path.join(sandbox, 'outside', 'back'));
    // root/via -> ../outside/back  (exits root into sandbox/outside, then re-enters via back)
    fs.symlinkSync('../outside/back', path.join(root, 'via'));
    expect(classify('via/t')).toMatchObject({ kind: 'present', canonical: 'real/t' });
  });
  it('C10b absolute-symlink traversal fails closed when an unrelated entry ENOENT during enumeration', () => {
    // Isolated, controlled version of the absolute-symlink ENOENT scenario.
    // root/via2 uses an ABSOLUTE symlink target so the classifier resets resolved to '/' and
    // walks every absolute path component, enumerating each parent via resolvePhysicalName.
    // A known foreign-entry is placed in sandbox (enumerated when classifier reaches that level).
    // Before injection: present (proves the absolute chain resolves correctly on this FS).
    // After injection: unknown with reason 'physical-name-resolution' (proves the spy hit the target branch).
    w('real/t/f.txt');
    fs.mkdirSync(path.join(sandbox, 'outside2'));
    // back is a relative symlink so sandbox/outside2 is the deepest foreign directory traversed.
    fs.symlinkSync('../proj/real', path.join(sandbox, 'outside2', 'back'));
    // root/via2 uses an ABSOLUTE symlink target — classifier walks sandbox/outside2/back's absolute path.
    fs.symlinkSync(path.join(sandbox, 'outside2', 'back'), path.join(root, 'via2'));
    // Create a foreign entry at sandbox level (enumerated when classifier looks for 'outside2').
    const foreignPath = path.join(sandbox, 'foreign-c10b');
    fs.writeFileSync(foreignPath, 'x');

    // Stable-tree contract: the absolute walk enumerates every ancestor of the sandbox, and
    // os.tmpdir() is shared with concurrently running test files whose entries can vanish
    // between readdir and lstat (a real ENOENT that fails closed before the injection). Outside
    // the sandbox, enumerate only the component leading to it; the sandbox itself stays real.
    const realReaddir = fs.readdirSync.bind(fs);
    vi.spyOn(fs, 'readdirSync').mockImplementation(((p: fs.PathLike, opts?: unknown) => {
      const toSandbox = path.relative(String(p), sandbox);
      if (toSandbox !== '' && !toSandbox.startsWith('..') && !path.isAbsolute(toSandbox)) {
        return [toSandbox.split(path.sep)[0]];
      }
      return realReaddir(p, opts as Parameters<typeof realReaddir>[1]);
    }) as typeof fs.readdirSync);

    // Pre-injection control: without spy the absolute chain resolves to present.
    expect(classify('via2/t')).toMatchObject({ kind: 'present', canonical: 'real/t' });

    // Inject ENOENT for the specific controlled foreign path.
    const realLstat = fs.lstatSync.bind(fs);
    let injectionHits = 0;
    vi.spyOn(fs, 'lstatSync').mockImplementation((p, opts?) => {
      const ps = typeof p === 'string' ? p : p.toString();
      if (ps === foreignPath) {
        injectionHits++;
        const err = new Error('ENOENT: injected') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      }
      return realLstat(ps, opts as Parameters<typeof realLstat>[1]);
    });

    // Post-injection: fail-closed → unknown with physical-name-resolution reason.
    const result = classify('via2/t');
    expect(result).toMatchObject({ kind: 'unknown', reason: 'physical-name-resolution' });
    // Spy hit exactly once for the controlled foreign path — proves the injection reached the target branch.
    expect(injectionHits).toBe(1);
  });
  it('C11 ./a/../b has the same canonical as b', () => {
    w('b/f.txt');
    w('a/f.txt');
    expect(classify('./a/../b')).toMatchObject({ kind: 'present', canonical: 'b' });
  });
  it('C12 a readlink failure is unknown', () => {
    fs.symlinkSync('t', path.join(root, 'ln'));
    vi.spyOn(fs, 'readlinkSync').mockImplementation(() => {
      throw Object.assign(new Error('EIO'), { code: 'EIO' });
    });
    expect(classify('ln/x')).toMatchObject({ kind: 'unknown' });
  });
  it('reports every traversed entry, marking links, in project-relative physical space', () => {
    w('vendor/x/src/f.txt');
    fs.mkdirSync(path.join(root, '.frontx/ai/@x'), { recursive: true });
    fs.symlinkSync('../../../vendor/x', path.join(root, '.frontx/ai/@x/t'));
    const r = classify('.frontx/ai/@x/t/src');
    expect(r).toMatchObject({ kind: 'present', canonical: 'vendor/x/src' });
    if (r.kind === 'present') {
      expect(r.entries).toEqual(
        expect.arrayContaining([
          { path: '.frontx/ai/@x/t', symlink: true },
          { path: 'vendor/x/src', symlink: false },
        ]),
      );
    }
  });
  it('A1 canonical diverges from raw when the access path traverses a symlink (resolved ≠ lexical)', () => {
    w('real/t/f.txt');
    fs.symlinkSync('real', path.join(root, 'alias'));
    const r = classify('alias/t');
    expect(r.kind).toBe('present');
    if (r.kind === 'present') {
      // lexical says 'alias/t'; canonical follows the link to 'real/t'
      expect(r.canonical).toBe('real/t');
      expect(r.canonical).not.toBe('alias/t');
    }
  });
  it('parity: for every non-unknown case canonical equals the lenient canonicalizer', () => {
    w('real/t/f.txt');
    fs.symlinkSync('real', path.join(root, 'alias'));
    for (const raw of ['real/t', 'alias/t', 'alias/missing', 'nothing/at/all', './real/../real/t']) {
      const r = classify(raw);
      const lenient = createFsCanonicalizeTargetFn(root)(raw);
      expect(r.kind === 'unknown' ? undefined : (r as { canonical: string }).canonical, raw).toBe(lenient ?? undefined);
    }
  });
});
