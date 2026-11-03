import { describe, expect, it } from 'vitest';

import { defaultGridConfig, validateGridConfig, type GridConfig, type GridSizeClass, type GridStep } from './grid-config';
// The one validator the CSS command runs; grid-config.ts re-uses it with the
// reserved name admitted, so the rule itself is exercised here.
import { validateGridConfig as validateConfigForCommand } from './grid-config-check.mjs';

function configWith(change: (config: GridConfig) => void): GridConfig {
  const config = structuredClone(defaultGridConfig);
  change(config);
  return config;
}

describe('Grid config', () => {
  it.each([
    ['name', (c: GridConfig) => { c.name = 'bad name'; }, /name/],
    ['columns', (c: GridConfig) => { c.columns = 0; }, /columns/],
    ['columns above the bound', (c: GridConfig) => { c.columns = 49; }, /1 to 48/],
    ['columns beyond safe integers', (c: GridConfig) => { c.columns = 2 ** 53; }, /1 to 48/],
    ['fractional range min', (c: GridConfig) => { c.sizes.small.base.min = 1.5; }, /small.*base/],
    ['missing row height', (c: GridConfig) => { delete (c as Partial<GridConfig>).rowHeight; }, /rowHeight/],
    ['unitless row height', (c: GridConfig) => { c.rowHeight = '160'; }, /rowHeight/],
    ['zero row height', (c: GridConfig) => { c.rowHeight = '0rem'; }, /rowHeight/],
    ['relative row height', (c: GridConfig) => { c.rowHeight = '20%'; }, /rowHeight/],
    ['missing steps', (c: GridConfig) => { c.steps = []; }, /steps/],
    ['first width', (c: GridConfig) => { c.steps[0].minWidth = 1; }, /first step/],
    ['duplicate step', (c: GridConfig) => { c.steps[1].name = 'base'; }, /step names/],
    ['descending widths', (c: GridConfig) => { c.steps[2].minWidth = 400; }, /widths/],
    ['nonfinite width', (c: GridConfig) => { c.steps[1].minWidth = Infinity; }, /widths/],
    ['bad gap', (c: GridConfig) => { c.steps[0].gap = '4px'; }, /gap/],
    ['missing range', (c: GridConfig) => { delete c.sizes.small.base; }, /small.*base/],
    ['out of range', (c: GridConfig) => { c.sizes.small.base.max = 13; }, /small.*base/],
    ['missing size class', (c: GridConfig) => { delete (c.sizes as Partial<Record<GridSizeClass, unknown>>).medium; }, /Grid size medium is missing/],
    ['null step entry', (c: GridConfig) => { c.steps[1] = null as unknown as GridStep; }, /step names/],
  ])('rejects %s', (_name, change, message) => {
    expect(() => validateGridConfig(configWith(change))).toThrow(message);
  });

  it.each(['160px', '12.5rem', '.5em'])('accepts the row height %s', rowHeight => {
    expect(() => validateGridConfig({ ...structuredClone(defaultGridConfig), rowHeight })).not.toThrow();
  });

  // What this checks: the reserved name is not the package validator's rule.
  // validateGridConfig admits `default` because defaultGridConfig itself
  // carries it (Grid refuses any other config object under that name by
  // identity); the command validator refuses it unless --kit-default says the
  // kit's own stylesheet is being regenerated.
  it('admits the reserved default name in the package validator and refuses it in the command validator', () => {
    expect(() => validateGridConfig(defaultGridConfig)).not.toThrow();
    expect(() => validateGridConfig(configWith(config => { config.name = 'default'; }))).not.toThrow();
    expect(() => validateConfigForCommand(configWith(config => { config.name = 'default'; }))).toThrow(
      /give a custom config its own name/,
    );
    expect(() => validateConfigForCommand(defaultGridConfig, { allowDefaultName: true })).not.toThrow();
  });
});
