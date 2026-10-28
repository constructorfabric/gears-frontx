// @cpt-flow:cpt-frontx-flow-cli-scaffolding-seed-repository:p1
//
// Pins the state this repository is actually in. The CLI's built-in default
// list is generated from the template territory discovered in the checkout
// (`scripts/generate-cli-official-defaults.mjs`), and no template territory
// lives here — templates are published from a repository of their own — so
// the generated map is EMPTY. `list` must then report an empty `defaults`
// set, and `seed`, which accepts official defaults and nothing else, must
// refuse every name with `TEMPLATE_NOT_REGISTERED`.
//
// Deliberately does NOT mock `../generated/official-defaults`: every other
// suite that exercises `seed`/`list` defaults substitutes a synthetic map, and
// this one is the counterweight that runs against the real generated module.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { run, createRealDeps, EXIT_SUCCESS, EXIT_USER_ERROR } from '../cli';
import { OFFICIAL_DEFAULT_TEMPLATES } from '../generated/official-defaults';

describe('with this checkout\'s own (empty) generated official-default map', () => {
  let base: string;
  const originalCwd = process.cwd();

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-empty-defaults-'));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('is empty — the premise the two tests below rest on', () => {
    expect(OFFICIAL_DEFAULT_TEMPLATES).toEqual({});
  });

  it('list reports an empty defaults set', async () => {
    process.chdir(base);

    const outcome = await run(['list', '--json'], createRealDeps());

    expect(outcome.exitCode).toBe(EXIT_SUCCESS);
    const parsed = JSON.parse(outcome.stdout ?? '') as { ok: true; data: { defaults: unknown[] } };
    expect(parsed.data.defaults).toEqual([]);
  });

  it('seed refuses TEMPLATE_NOT_REGISTERED for any name, writing nothing', async () => {
    const batch = JSON.stringify({ templates: { '@example/template-alpha': ['.'] } });

    const outcome = await run(['seed', base, '--input', batch, '--json'], createRealDeps());

    expect(outcome.exitCode).toBe(EXIT_USER_ERROR);
    const parsed = JSON.parse(outcome.stdout ?? '') as { ok: false; error: { code: string } };
    expect(parsed.error.code).toBe('TEMPLATE_NOT_REGISTERED');
    expect(fs.readdirSync(base)).toEqual([]);
  });
});
