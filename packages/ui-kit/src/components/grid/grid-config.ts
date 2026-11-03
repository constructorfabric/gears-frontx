import defaultConfig from './default-grid-config.json';
import { validateGridConfig as checkConfig } from './grid-config-check.mjs';

export type GridSizeClass = 'small' | 'medium' | 'large';
export type GridHeightClass = 'low' | 'high';

/*
 * A size class's span at one step, in columns: 1 <= min <= preferred <= max
 * <= columns. A Grid places `preferred`; only a flexible Grid moves inside
 * min..max to fill its rows.
 */
export interface GridSpanRange {
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
 * A Grid config is data, kept in one file: the step CSS is generated from the
 * same data (`frontx-ui-grid-css`), and the shipped default config is this
 * package's grid-default-config.json. `name` scopes the generated rules, so
 * two configs can render on one page; `default` is the kit's own scope.
 * `rowHeight` is the fixed size of one row track: a low block is one track, a
 * high block two tracks and the row gap between them.
 */
export interface GridConfig {
  name: string;
  columns: number;
  rowHeight: string;
  steps: GridStep[];
  sizes: Record<GridSizeClass, Record<string, GridSpanRange>>;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// Frozen: the kit's own step CSS is generated from these values.
export const defaultGridConfig: GridConfig = deepFreeze(structuredClone(defaultConfig));

export const SIZE_CLASSES: readonly GridSizeClass[] = ['small', 'medium', 'large'];

/**
 * Throws with a plain message when a config cannot drive the solver or the
 * generated CSS. One validator with the CSS command (grid-config-check.mjs);
 * the reserved `default` scope is admitted here because defaultGridConfig
 * itself carries it, and Grid refuses it for any other config object.
 */
export function validateGridConfig(config: GridConfig): void {
  checkConfig(config, { allowDefaultName: true });
}
