// @cpt-flow:cpt-frontx-flow-cli-scaffolding-seed-repository:p1
//
// `seed` has no separate preview and a refused seed leaves no registrations
// behind, so its TARGET_CONFLICT advice is "revise the batch and run seed
// again" - never the assemble preview, which would run against a project the
// failed seed did not leave. Reached through the real `seed` dispatch with a
// synthetic official-default map (the generated one is empty in this checkout).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run, createRealDeps } from '../cli';

vi.mock('../generated/official-defaults', () => ({
  OFFICIAL_DEFAULT_TEMPLATES: { '@example/one': 'path:tpl-one', '@example/two': 'path:tpl-two' },
}));

describe('seed TARGET_CONFLICT next action', () => {
  const originalCwd = process.cwd();
  let base: string;
  let dir: string;
  const seed = (templates: Record<string, string[]>) =>
    run(['seed', dir, '--input', JSON.stringify({ templates }), '--json'], createRealDeps());

  beforeEach(() => {
    base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-seed-conflict-')));
    dir = path.join(base, 'target');
    for (const [folder, name] of [['tpl-one', '@example/one'], ['tpl-two', '@example/two']]) {
      fs.mkdirSync(path.join(dir, folder), { recursive: true });
      fs.writeFileSync(
        path.join(dir, folder, 'frontx-template.json'),
        JSON.stringify({ name, version: '1.0.0', excludedSubtrees: [], description: 'fixture' }),
      );
      fs.writeFileSync(path.join(dir, folder, 'a.txt'), 'a\n');
    }
    process.chdir(base);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(base, { recursive: true, force: true });
    expect(fs.existsSync(base)).toBe(false);
  });

  it('inst-seed-if-conflict: a refused seed says to revise and run seed again, keeps the exact conflicts, leaves no project state, and the revised seed succeeds', async () => {
    const outcome = await seed({ '@example/one': ['app'], '@example/two': ['app'] });
    expect(outcome.stderr).toBeUndefined();
    const env = JSON.parse(outcome.stdout ?? '') as {
      ok: boolean;
      error: { code: string; message: string; details: unknown };
    };
    expect(outcome.exitCode).toBe(1);
    expect(env.ok).toBe(false);
    expect(env.error.code).toBe('TARGET_CONFLICT');
    expect(env.error.details).toEqual({
      conflicts: [
        { ground: 'app', contestants: [{ target: 'app', templateName: '@example/one' }, { target: 'app', templateName: '@example/two' }] },
      ],
    });
    expect(env.error.message).toContain('distinct targets');
    expect(env.error.message).toContain('run seed again with the revised batch');
    expect(env.error.message).not.toContain('assemble');
    expect(env.error.message).not.toMatch(/\b(delete|remove|rm|force|override|overwrite)\b/i);
    expect(fs.existsSync(path.join(dir, '.frontx', 'project.json'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'app'))).toBe(false);

    // the stated action works
    const retry = await seed({ '@example/one': ['app'], '@example/two': ['lib'] });
    expect(retry.exitCode).toBe(0);
    expect(fs.existsSync(path.join(dir, 'app'))).toBe(true);
  });
});
