// @cpt-flow:cpt-frontx-flow-cli-scaffolding-assemble-preview:p1
// @cpt-flow:cpt-frontx-flow-cli-scaffolding-add-template:p1
// @cpt-flow:cpt-frontx-flow-composed-provenance-ownership-add:p1
//
// A `TARGET_CONFLICT` message must tell the developer a safe next action
// (`cpt-frontx-cli-nfr-discoverability`): revise the batch / declare a
// permissible exclusion and preview again, or pick a different ownership
// path. It must never suggest deleting content or overriding the check, and
// the structured `details.conflicts` contract is unchanged. Real filesystem,
// through `run()` with the real adapters; no network.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run, createRealDeps } from '../cli';

function tree(root: string): string {
  const h = crypto.createHash('sha256');
  const walk = (dir: string): void => {
    for (const n of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, n);
      h.update(path.relative(root, full));
      if (fs.statSync(full).isDirectory()) walk(full);
      else h.update(fs.readFileSync(full));
    }
  };
  walk(root);
  return h.digest('hex');
}

describe('TARGET_CONFLICT carries a safe next action that actually works', () => {
  const originalCwd = process.cwd();
  const originalInv = process.env.FRONTX_INVENTORY_ROOT;
  let sandbox: string;
  let project: string;

  const call = (args: string[]) => run([...args, '--json'], createRealDeps());
  type Env = {
    ok: boolean;
    error: { code: string; message: string; details: { conflicts?: unknown[]; path?: string } };
  };
  const envelope = (outcome: { stdout?: string; stderr?: string }): Env => {
    expect(outcome.stderr).toBeUndefined();
    return JSON.parse(outcome.stdout ?? '') as Env;
  };
  const batch = (templates: Record<string, string[]>) => JSON.stringify({ templates });
  const UNSAFE = /\b(delete|remove|rm|force|override|overwrite|--adopt-existing)\b/i;

  function template(dir: string, name: string, excludedSubtrees: string[] = []): void {
    fs.mkdirSync(path.join(project, 'vendor', dir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(project, 'vendor', dir, 'frontx-template.json'),
      JSON.stringify({ name, version: '1.0.0', excludedSubtrees, description: 'fixture' }),
    );
    fs.writeFileSync(path.join(project, 'vendor', dir, 'src', 'main.ts'), 'x\n');
  }

  beforeEach(async () => {
    sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-conflict-action-')));
    project = path.join(sandbox, 'proj');
    fs.mkdirSync(project, { recursive: true });
    template('alpha', '@acme/alpha');
    template('beta', '@acme/beta');
    template('host', '@acme/host', ['sub/']);
    process.env.FRONTX_INVENTORY_ROOT = path.join(sandbox, 'inv');
    process.chdir(project);
    for (const d of ['alpha', 'beta', 'host']) expect((await call(['register', `path:vendor/${d}`])).exitCode).toBe(0);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(sandbox, { recursive: true, force: true });
    expect(fs.existsSync(sandbox)).toBe(false);
    if (originalInv === undefined) delete process.env.FRONTX_INVENTORY_ROOT;
    else process.env.FRONTX_INVENTORY_ROOT = originalInv;
  });

  // Refuses with the exact structured conflicts, writes nothing, and states only
  // the actions that fit this kind of ground.
  async function refused(command: 'assemble' | 'apply', templates: Record<string, string[]>, conflicts: unknown[]): Promise<Env> {
    const before = tree(project);
    const outcome = await call([command, '--input', batch(templates)]);
    const env = envelope(outcome);
    expect(outcome.exitCode).toBe(1);
    expect(env.ok).toBe(false);
    expect(env.error.code).toBe('TARGET_CONFLICT');
    expect(env.error.details).toEqual({ conflicts });
    expect(env.error.message).toContain('contested by:');
    expect(env.error.message).toContain('nothing written');
    expect(env.error.message).not.toMatch(UNSAFE);
    expect(tree(project)).toBe(before);
    return env;
  }

  const coincide = [
    { ground: 'app', contestants: [{ target: 'app', templateName: '@acme/alpha' }, { target: 'app', templateName: '@acme/beta' }] },
  ];
  const nested = [
    { ground: 'app contains app/sub', contestants: [{ target: 'app', templateName: '@acme/alpha' }, { target: 'app/sub', templateName: '@acme/beta' }] },
  ];
  const reserved = [{ ground: '.frontx', contestants: [{ target: '.frontx', templateName: '@acme/alpha' }] }];

  for (const command of ['assemble', 'apply'] as const) {
    it(`inst-asm-return-conflict / inst-add-return-conflict: ${command} on coinciding targets says to give distinct targets, and distinct targets then preview and apply`, async () => {
      const env = await refused(command, { '@acme/alpha': ['app'], '@acme/beta': ['app'] }, coincide);
      expect(env.error.message).toContain('distinct targets');
      expect(env.error.message).not.toContain('excludedSubtrees');
      expect(env.error.message).not.toContain('reserved ground');
      const revised = batch({ '@acme/alpha': ['app'], '@acme/beta': ['lib'] });
      expect((await call(['assemble', '--input', revised])).exitCode).toBe(0);
      expect((await call(['apply', '--input', revised])).exitCode).toBe(0);
    });

    it(`inst-asm-return-conflict / inst-add-return-conflict: ${command} on nested targets offers both valid cures and each one passes the geometry check`, async () => {
      const env = await refused(command, { '@acme/alpha': ['app'], '@acme/beta': ['app/sub'] }, nested);
      expect(env.error.message).toContain('move a nested target outside its containing target');
      expect(env.error.message).toContain('excludedSubtrees');
      // cure 1: move the nested target out
      expect((await call(['assemble', '--input', batch({ '@acme/alpha': ['app'], '@acme/beta': ['lib'] })])).exitCode).toBe(0);
      // cure 2: a containing template whose manifest declares the nested ground
      const viaHost = batch({ '@acme/host': ['app'], '@acme/beta': ['app/sub'] });
      expect((await call(['assemble', '--input', viaHost])).exitCode).toBe(0);
      expect((await call(['apply', '--input', viaHost])).exitCode).toBe(0);
    });

    it(`inst-asm-return-conflict / inst-add-return-conflict: ${command} on .frontx never offers an exclusion, and an exclusion does not cure it`, async () => {
      const env = await refused(command, { '@acme/alpha': ['.frontx'] }, reserved);
      expect(env.error.message).toContain('reserved ground');
      expect(env.error.message).not.toContain('excludedSubtrees');
      // the exclusion route is genuinely not a remedy for reserved ground
      template('hostfx', '@acme/hostfx', ['.frontx/']);
      expect((await call(['register', 'path:vendor/hostfx'])).exitCode).toBe(0);
      const still = await call([command, '--input', batch({ '@acme/hostfx': ['.frontx'] })]);
      expect(still.exitCode).toBe(1);
      expect(envelope(still).error.code).toBe('TARGET_CONFLICT');
      // the stated action works
      expect((await call(['assemble', '--input', batch({ '@acme/alpha': ['tools'] })])).exitCode).toBe(0);
    });
  }

  // Valid target paths may themselves contain the words the human-readable
  // `ground` uses ("A contains B"); the advice is classified from structured
  // contestants, so such names must not change which actions are offered.
  describe('targets whose names contain the display delimiter', () => {
    const D = 'foo contains bar';
    const pair = (a: string, b: string) => [
      { target: a, templateName: '@acme/alpha' },
      { target: b, templateName: '@acme/beta' },
    ];

    for (const command of ['assemble', 'apply'] as const) {
      it(`${command}: coinciding targets named "${D}" get the coincidence advice only`, async () => {
        const env = await refused(command, { '@acme/alpha': [D], '@acme/beta': [D] }, [
          { ground: D, contestants: pair(D, D) },
        ]);
        expect(env.error.message).toContain('distinct targets');
        expect(env.error.message).not.toContain('nested target');
        expect(env.error.message).not.toContain('excludedSubtrees');
        expect(env.error.message).not.toContain('reserved ground');
        const revised = batch({ '@acme/alpha': [D], '@acme/beta': ['other contains name'] });
        expect((await call(['assemble', '--input', revised])).exitCode).toBe(0);
        expect((await call(['apply', '--input', revised])).exitCode).toBe(0);
      });

      it(`${command}: genuinely nested targets that carry the delimiter get the nesting advice, and both cures work`, async () => {
        const inner = `${D}/sub`;
        const env = await refused(command, { '@acme/alpha': [D], '@acme/beta': [inner] }, [
          { ground: `${D} contains ${inner}`, contestants: pair(D, inner) },
        ]);
        expect(env.error.message).toContain('move a nested target outside its containing target');
        expect(env.error.message).toContain('excludedSubtrees');
        expect(env.error.message).not.toContain('distinct targets');
        expect(env.error.message).not.toContain('reserved ground');
        expect((await call(['assemble', '--input', batch({ '@acme/alpha': [D], '@acme/beta': ['elsewhere'] })])).exitCode).toBe(0);
        const viaHost = batch({ '@acme/host': [D], '@acme/beta': [inner] });
        expect((await call(['assemble', '--input', viaHost])).exitCode).toBe(0);
        expect((await call(['apply', '--input', viaHost])).exitCode).toBe(0);
      });

      it(`${command}: a delimiter-bearing target inside .frontx gets the reserved-ground advice only`, async () => {
        const target = '.frontx/x contains y';
        const env = await refused(command, { '@acme/alpha': [target] }, [
          { ground: '.frontx', contestants: [{ target, templateName: '@acme/alpha' }] },
        ]);
        expect(env.error.message).toContain('reserved ground');
        expect(env.error.message).not.toContain('excludedSubtrees');
        expect(env.error.message).not.toContain('distinct targets');
        expect(env.error.message).not.toContain('nested target');
      });
    }

    it('a mixed refusal offers each distinct action once, per structured kind', async () => {
      template('gamma', '@acme/gamma');
      expect((await call(['register', 'path:vendor/gamma'])).exitCode).toBe(0);
      const before = tree(project);
      const mixed = {
        '@acme/alpha': [D, `${D}/sub`],
        '@acme/beta': [D, '.frontx'],
        '@acme/gamma': ['solo'],
      };
      const outcome = await call(['assemble', '--input', batch(mixed)]);
      const env = envelope(outcome);
      expect(outcome.exitCode).toBe(1);
      expect(env.error.code).toBe('TARGET_CONFLICT');
      // authoritative structured data: a coincidence, nestings (one per claimant of D), a reserved record
      const grounds = [...new Set(((env.error.details.conflicts ?? []) as Array<{ ground: string }>).map((c) => c.ground))].sort();
      expect(grounds).toEqual([D, `${D} contains ${D}/sub`, '.frontx'].sort());
      const m = env.error.message;
      for (const phrase of ['reserved ground', 'distinct targets', 'nested target']) {
        expect(m.split(phrase).length - 1, phrase).toBe(1);
      }
      expect(m).not.toMatch(UNSAFE);
      expect(tree(project)).toBe(before);
    });

    it('ownership add: an applied target named with the delimiter is reported as an applied target and its strict descendant is accepted', async () => {
      expect((await call(['apply', '--input', batch({ '@acme/alpha': [D] })])).exitCode).toBe(0);
      fs.writeFileSync(path.join(project, D, 'file.txt'), 'u\n');
      const outcome = await call(['ownership', 'add', D]);
      const env = envelope(outcome);
      expect(outcome.exitCode).toBe(1);
      expect(env.error.details).toEqual({
        path: D,
        conflicts: [{ ground: D, contestants: [{ target: D, templateName: null }, { target: D, templateName: '@acme/alpha' }] }],
      });
      expect(env.error.message).toContain('applied target');
      expect(env.error.message).not.toContain('reserved ground');
      expect((await call(['ownership', 'add', `${D}/file.txt`])).exitCode).toBe(0);
    });
  });

  describe('ownership add', () => {
    it('inst-oadd-return-conflict: applied-target conflict (equal and ancestor) names the target; a strict descendant is accepted', async () => {
      expect((await call(['apply', '--input', batch({ '@acme/alpha': ['app'], '@acme/beta': ['lib'] })])).exitCode).toBe(0);
      fs.writeFileSync(path.join(project, 'app', 'file.txt'), 'u\n');
      fs.mkdirSync(path.join(project, 'docs'));
      const before = tree(project);
      const cases: Array<[string, unknown[]]> = [
        ['app', [{ ground: 'app', contestants: [{ target: 'app', templateName: null }, { target: 'app', templateName: '@acme/alpha' }] }]],
        ['.', [
          { ground: '. contains app', contestants: [{ target: '.', templateName: null }, { target: 'app', templateName: '@acme/alpha' }] },
          { ground: '. contains lib', contestants: [{ target: '.', templateName: null }, { target: 'lib', templateName: '@acme/beta' }] },
        ]],
      ];
      for (const [target, conflicts] of cases) {
        const outcome = await call(['ownership', 'add', target]);
        const env = envelope(outcome);
        expect(outcome.exitCode).toBe(1);
        expect(env.error.code).toBe('TARGET_CONFLICT');
        expect(env.error.details).toEqual({ path: target, conflicts });
        expect(env.error.message).toContain('applied target');
        expect(env.error.message).toContain('neither equals nor contains any applied target');
        expect(env.error.message).not.toContain('reserved ground');
        expect(env.error.message).not.toMatch(UNSAFE);
      }
      expect(tree(project)).toBe(before);
      // the stated action works: a strict descendant, and a path outside every target
      expect((await call(['ownership', 'add', 'app/file.txt'])).exitCode).toBe(0);
      expect((await call(['ownership', 'add', 'docs'])).exitCode).toBe(0);
    });

    it('inst-oadd-return-conflict: reserved ground is reported as reserved, not as an applied target, even with no applied targets', async () => {
      const before = tree(project);
      const outcome = await call(['ownership', 'add', '.frontx']);
      const env = envelope(outcome);
      expect(outcome.exitCode).toBe(1);
      expect(env.error.code).toBe('TARGET_CONFLICT');
      expect(env.error.details).toEqual({
        path: '.frontx',
        conflicts: [{ ground: '.frontx', contestants: [{ target: '.frontx', templateName: null }] }],
      });
      expect(env.error.message).toContain('reserved ground');
      expect(env.error.message).toContain('outside it');
      expect(env.error.message).not.toContain('applied target');
      expect(env.error.message).not.toContain('unknown');
      expect(env.error.message).not.toMatch(UNSAFE);
      expect(tree(project)).toBe(before);
      // the stated action works
      fs.mkdirSync(path.join(project, 'docs'));
      expect((await call(['ownership', 'add', 'docs'])).exitCode).toBe(0);
    });
  });
});
