import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { defaultGridConfig, type GridConfig } from './grid-config';
import { generateGridCss } from './grid-css.mjs';

const DIRECTORY = dirname(fileURLToPath(import.meta.url));
const COMMAND = join(DIRECTORY, '../../../scripts/frontx-ui-grid-css.mjs');
const COMMITTED = join(DIRECTORY, 'grid-steps.css');

// The usage line the command answers every malformed invocation with; pinned
// here because the DESIGN.md frontx-ui-grid-css row names the same arguments.
const USAGE = /^Usage: frontx-ui-grid-css \[--kit-default\] <config\.json\|config\.mjs\|config\.js> <output\.css>\n$/;

interface GeneratorRun {
  status: number;
  stderr: string;
  stdout: string;
  css?: string;
}

const tempDirectories: string[] = [];

function tempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'grid-css-'));
  tempDirectories.push(directory);
  return directory;
}

// One helper owns the temp directory and the spawn: every case runs the command
// the way a consumer does, over a file on disk. `args` replaces the standard
// input/output pair for invocations that never reach a file.
function runCommand(input: string, { kitDefault = false, extra = [], args }: { kitDefault?: boolean; extra?: string[]; args?: string[] } = {}): GeneratorRun {
  const output = join(tempDirectory(), 'grid-steps.css');
  const argv = args ?? [...(kitDefault ? ['--kit-default'] : []), input, output, ...extra];
  const run = spawnSync(process.execPath, [COMMAND, ...argv], { encoding: 'utf8' });
  return {
    status: run.status ?? 1,
    stderr: run.stderr,
    stdout: run.stdout,
    css: existsSync(output) ? readFileSync(output, 'utf8') : undefined,
  };
}

function runGenerator(config: GridConfig, options?: { kitDefault?: boolean }): GeneratorRun {
  const input = join(tempDirectory(), 'config.json');
  writeFileSync(input, JSON.stringify(config));
  return runCommand(input, options);
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('Grid CSS generator', () => {
  it('writes the committed default CSS from the default config', () => {
    const run = runGenerator(defaultGridConfig, { kitDefault: true });
    expect(run.status).toBe(0);
    expect(run.css, 'stale grid-steps.css: run npm run grid:css -w @gears-frontx/ui-kit').toBe(readFileSync(COMMITTED, 'utf8'));
  });

  // grid.md's config example is documentation a consumer copies verbatim, so
  // it must be JSON the command accepts as written.
  it('generates from the json config example in grid.md', () => {
    const doc = readFileSync(join(DIRECTORY, 'grid.md'), 'utf8');
    const block = /```json\n([\s\S]*?)\n```/.exec(doc)?.[1];
    expect(block, 'grid.md carries no ```json config example').toBeDefined();
    const run = runGenerator(JSON.parse(block!) as GridConfig);
    expect(run.status).toBe(0);
    expect(run.stderr).toBe('');
  });

  it('scopes a custom config by its name and its own fallbacks', () => {
    const custom = { ...structuredClone(defaultGridConfig), name: 'custom', columns: 8, rowHeight: '120px' };
    for (const size of Object.values(custom.sizes)) for (const range of Object.values(size)) {
      range.max = Math.min(range.max, 8);
      range.preferred = Math.min(range.preferred, 8);
      range.min = Math.min(range.min, 8);
    }
    const run = runGenerator(custom);
    expect(run.status).toBe(0);
    const css = run.css ?? '';
    expect(css).toContain('@container fx-grid (min-width: 768px)');
    expect(css).toContain('[data-fx-grid="custom"]');
    expect(css).toContain('var(--_grid-columns, 8)');
    expect(css).toContain('grid-auto-rows: var(--grid-row-height, 120px)');
    expect(css).toContain('var(--_grid-col-sm, auto)');
    expect(css).toContain('var(--grid-gap, var(--space-6))');
    expect(css).not.toContain('[data-fx-grid="default"]');
  });

  it.each([
    ['a module without a default export', 'config.mjs', 'export const config = {};', /no default export/],
    ['an unsupported extension', 'config.ts', 'export default {};', /\.json file or an ES module/],
  ])('fails with a plain message on %s', (_name, file, text, message) => {
    const input = join(tempDirectory(), file);
    writeFileSync(input, text);
    const run = runCommand(input);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(message);
    expect(run.css).toBeUndefined();
  });

  it('refuses the reserved default name for a custom config', () => {
    const refused = runGenerator(structuredClone(defaultGridConfig));
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/give a custom config its own name/);
    expect(refused.css).toBeUndefined();
    // --kit-default is the kit's own regeneration path and the only way through.
    const admitted = runGenerator(structuredClone(defaultGridConfig), { kitDefault: true });
    expect(admitted.status).toBe(0);
    expect(admitted.css).toBe(readFileSync(COMMITTED, 'utf8'));
  });

  // A help request is the one success that writes nothing: usage on stdout.
  it.each([['--help'], ['-h']])('answers %s with the usage text and success', (flag) => {
    const run = runCommand('', { args: [flag] });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(USAGE);
    expect(run.css).toBeUndefined();
  });

  // Exactly one option and two positionals are readable; anything else gets
  // the usage line rather than a failed file read further in. The flag shapes
  // carry no input file: a flag read as a filename must never get that far.
  it('answers stray double-dash flags with the usage message', () => {
    const run = runCommand('', { args: ['--out', '--kit-wide'] });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(USAGE);
    expect(run.css).toBeUndefined();
  });

  // A single leading dash is a path character, not an option.
  it('writes to a dash-led output path', () => {
    const directory = tempDirectory();
    const input = join(directory, 'config.json');
    writeFileSync(input, JSON.stringify({ ...structuredClone(defaultGridConfig), name: 'dashed' }));
    const run = spawnSync(process.execPath, [COMMAND, input, '-steps.css'], { cwd: directory, encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(existsSync(join(directory, '-steps.css'))).toBe(true);
  });

  it('refuses an output path that is the config file and leaves the config intact', () => {
    const input = join(tempDirectory(), 'config.json');
    const source = JSON.stringify({ ...structuredClone(defaultGridConfig), name: 'same' });
    writeFileSync(input, source);
    const run = spawnSync(process.execPath, [COMMAND, input, input], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/is the config file/);
    expect(readFileSync(input, 'utf8')).toBe(source);
  });

  it('refuses an output that is a symlink to the config and leaves the config intact', () => {
    const directory = tempDirectory();
    const input = join(directory, 'config.json');
    const source = JSON.stringify({ ...structuredClone(defaultGridConfig), name: 'linked' });
    writeFileSync(input, source);
    const alias = join(directory, 'alias.css');
    symlinkSync(input, alias);
    const run = spawnSync(process.execPath, [COMMAND, input, alias], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/is the config file/);
    expect(readFileSync(input, 'utf8')).toBe(source);
  });

  it('answers a third positional with the usage message', () => {
    const input = join(tempDirectory(), 'config.json');
    writeFileSync(input, JSON.stringify(defaultGridConfig));
    const run = runCommand(input, { extra: [join(tempDirectory(), 'extra.css')] });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(USAGE);
    expect(run.css).toBeUndefined();
  });

  it('generates in process what the command writes for a custom config', () => {
    const custom = { ...structuredClone(defaultGridConfig), name: 'inline' };
    expect(generateGridCss(custom)).toBe(runGenerator(custom).css);
  });
});
