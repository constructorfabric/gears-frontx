import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { defaultGridConfig, type GridConfig } from './grid-config';
import { generateGridCss } from './grid-css.mjs';

const DIRECTORY = dirname(fileURLToPath(import.meta.url));
const COMMAND = join(DIRECTORY, '../../../scripts/frontx-ui-grid-css.mjs');
const COMMITTED = join(DIRECTORY, 'grid-steps.css');

interface GeneratorRun {
  status: number;
  stderr: string;
  css?: string;
}

const tempDirectories: string[] = [];

function tempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'grid-css-'));
  tempDirectories.push(directory);
  return directory;
}

// One helper owns the temp directory and the spawn: every case runs the command
// the way a consumer does, over a file on disk.
function runCommand(input: string, { kitDefault = false } = {}): GeneratorRun {
  const output = join(tempDirectory(), 'grid-steps.css');
  const args = kitDefault ? ['--kit-default', input, output] : [input, output];
  const run = spawnSync(process.execPath, [COMMAND, ...args], { encoding: 'utf8' });
  return {
    status: run.status ?? 1,
    stderr: run.stderr,
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

  it('generates in process what the command writes for a custom config', () => {
    const custom = { ...structuredClone(defaultGridConfig), name: 'inline' };
    expect(generateGridCss(custom)).toBe(runGenerator(custom).css);
  });
});
