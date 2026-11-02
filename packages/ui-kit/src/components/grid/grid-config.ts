import defaultConfig from './default-grid-config.json';

export type SizeClass = 'small' | 'medium' | 'large';
export type HeightClass = 'low' | 'high';

/*
 * A size class's span at one step, in columns: 1 <= min <= preferred <= max
 * <= columns. A Grid places `preferred`; only a flexible Grid moves inside
 * min..max to fill its rows.
 */
export interface SpanRange {
  min: number;
  preferred: number;
  max: number;
}

/*
 * One container step. `minWidth` is the Grid container's inline size in px
 * from which the step applies; the first step starts at 0. `gap` names a
 * spacing token (`--space-4`), the gap from this step on.
 */
export interface GridStep {
  name: string;
  minWidth: number;
  gap: string;
}

/*
 * A Grid config is data, kept in one file and treated as immutable: Grid
 * caches placements by the config object's identity, and the step CSS is
 * generated from the same data (`frontx-ui-grid-css`). `name` scopes the
 * generated rules, so two configs can render on one page. `rowHeight` is
 * the fixed size of one row track: a low block is one track, a high block
 * two tracks and the row gap between them.
 */
export interface GridConfig {
  name: string;
  columns: number;
  rowHeight: string;
  steps: GridStep[];
  sizes: Record<SizeClass, Record<string, SpanRange>>;
  heights: Record<HeightClass, number>;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// Frozen: Grid caches by config identity and the kit's step CSS is generated from these values.
export const defaultGridConfig: GridConfig = deepFreeze(structuredClone(defaultConfig));

export const SIZE_CLASSES: readonly SizeClass[] = ['small', 'medium', 'large'];
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const TOKEN_PATTERN = /^--[a-z][a-z0-9-]*$/;
const LENGTH_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em)$/;

function validRange(range: SpanRange | undefined, columns: number): boolean {
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
 * generated CSS. Heights are fixed at two: low is 1 track, high is 2.
 */
export function validateGridConfig(config: GridConfig): void {
  if (!config || typeof config !== 'object') throw new Error('Grid config must be an object');
  if (typeof config.name !== 'string' || !NAME_PATTERN.test(config.name)) {
    throw new Error('Grid config name must be a lowercase CSS-safe name');
  }
  if (!Number.isInteger(config.columns) || config.columns < 1) throw new Error('Grid columns must be an integer >= 1');
  if (typeof config.rowHeight !== 'string' || !LENGTH_PATTERN.test(config.rowHeight) || parseFloat(config.rowHeight) <= 0) {
    throw new Error('Grid rowHeight must be a positive CSS length in px, rem or em');
  }
  if (!Array.isArray(config.steps) || config.steps.length === 0) throw new Error('Grid steps must be nonempty');
  const names = new Set<string>();
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
  if (config.heights?.low !== 1 || config.heights?.high !== 2) {
    throw new Error('Grid heights must be low 1 and high 2');
  }
}
