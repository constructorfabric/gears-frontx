/*
 * The one Grid config validator: grid-config.ts and the generator
 * (grid-css.mjs, behind the frontx-ui-grid-css command) both import it, so a
 * config object and the stylesheet generated from it cannot disagree. The
 * build copies this module flat into dist/ next to the command. Plain
 * dependency-free ESM, so the command runs in plain Node without loading any
 * component code (the built entries import CSS).
 *
 * Types: grid-config-check.d.mts.
 */

export const SIZE_CLASSES = ['small', 'medium', 'large'];
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const TOKEN_PATTERN = /^--[a-z][a-z0-9-]*$/;
const LENGTH_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em)$/;

function validRange(range, columns) {
  return (
    !!range &&
    Number.isInteger(range.min) &&
    Number.isInteger(range.preferred) &&
    Number.isInteger(range.max) &&
    range.min >= 1 &&
    range.min <= range.preferred &&
    range.preferred <= range.max &&
    range.max <= columns
  );
}

/**
 * Throws with a plain message when a config cannot drive the solver or the
 * generated CSS. `allowDefaultName` admits the reserved `default` scope, which
 * belongs to the kit's own defaultGridConfig and its shipped stylesheet; every
 * other caller refuses it.
 */
export function validateGridConfig(config, { allowDefaultName = false } = {}) {
  if (!config || typeof config !== 'object') throw new Error('Grid config must be an object');
  if (typeof config.name !== 'string' || !NAME_PATTERN.test(config.name)) {
    throw new Error('Grid config name must be a lowercase CSS-safe name');
  }
  if (!allowDefaultName && config.name === 'default') {
    throw new Error('Grid config name "default" belongs to defaultGridConfig; give a custom config its own name');
  }
  if (!Number.isInteger(config.columns) || config.columns < 1) throw new Error('Grid columns must be an integer >= 1');
  if (typeof config.rowHeight !== 'string' || !LENGTH_PATTERN.test(config.rowHeight) || parseFloat(config.rowHeight) <= 0) {
    throw new Error('Grid rowHeight must be a positive CSS length in px, rem or em');
  }
  if (!Array.isArray(config.steps) || config.steps.length === 0) throw new Error('Grid steps must be nonempty');
  const names = new Set();
  let previousWidth = -1;
  for (const step of config.steps) {
    if (!step || typeof step.name !== 'string' || !NAME_PATTERN.test(step.name) || names.has(step.name)) {
      throw new Error('Grid step names must be unique lowercase CSS-safe names');
    }
    if (!Number.isFinite(step.minWidth) || step.minWidth < 0 || step.minWidth <= previousWidth) {
      throw new Error('Grid step widths must be finite, nonnegative, and strictly increasing');
    }
    if (typeof step.gap !== 'string' || !TOKEN_PATTERN.test(step.gap)) {
      throw new Error(`Grid step ${step.name} gap must be a CSS token reference`);
    }
    names.add(step.name);
    previousWidth = step.minWidth;
  }
  if (config.steps[0].minWidth !== 0) throw new Error('Grid first step must start at 0');
  for (const size of SIZE_CLASSES) {
    const steps = config.sizes?.[size];
    if (!steps || typeof steps !== 'object') throw new Error(`Grid size ${size} is missing`);
    for (const name of names) {
      if (!validRange(steps[name], config.columns)) {
        throw new Error(`Grid size ${size} step ${name} needs 1 <= min <= preferred <= max <= columns`);
      }
    }
  }
}
