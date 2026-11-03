import { defaultGridConfig, type GridConfig } from '../components/grid/grid-config';
import type { GridItemSpec, GridLayout, GridPlacement, GridSolveOptions, GridStepLayout } from '../components/grid/grid-solver';

/**
 * Checks a layout against its items and config through an occupancy
 * matrix: every item placed once, spans at the preferred value (inside the
 * range when flexible), a high over two tracks and a low over one, no
 * overlap, no cell outside the grid, empty cells only at the inline end of
 * a row, the hole count, and the input order in reading order (no item
 * moved, a pair only of neighbours). Throws on the first violation.
 *
 * The tests' independent check of the solver, kept out of the package API:
 * it reads the config's ranges and the layout's placements directly and
 * imports no solver code, so an error in the solver cannot hide behind the
 * code that judges it.
 */
export function validateGridLayout(
  layout: GridLayout,
  items: GridItemSpec[],
  config: GridConfig = defaultGridConfig,
  { flexible = false }: GridSolveOptions = {},
): void {
  for (const step of config.steps) {
    const result = layout.steps?.[step.name];
    if (!result || !Number.isInteger(result.rows) || result.rows < 0 || !Number.isInteger(result.holes) || result.holes < 0) {
      throw new Error(`Grid layout step ${step.name} has invalid rows or holes`);
    }
    if (!result.placements || typeof result.placements !== 'object') {
      throw new Error(`Grid layout step ${step.name} has no placements`);
    }
    const ids = Object.keys(result.placements);
    if (ids.length !== items.length || items.some(item => !Object.prototype.hasOwnProperty.call(result.placements, item.layoutId))) {
      throw new Error(`Grid layout step ${step.name} must place every item once`);
    }
    const matrix = Array.from({ length: result.rows }, () => new Array<boolean>(config.columns).fill(false));
    for (const item of items) {
      const p = result.placements[item.layoutId];
      if (!p || typeof p !== 'object') throw new Error(`Grid layout placement for ${item.layoutId} is missing at ${step.name}`);
      // Read straight off the config, not through the solver's own range lookup.
      const range = config.sizes[item.size]?.[step.name];
      if (!range) {
        throw new Error(`Grid config has no ${step.name} range for size ${item.size}, needed to check ${item.layoutId}`);
      }
      const min = flexible ? range.min : range.preferred;
      const max = flexible ? range.max : range.preferred;
      const integers = [p.colStart, p.colSpan, p.rowStart, p.rowSpan].every(Number.isInteger);
      const rowSpanOk = p.rowSpan === (item.height === 'high' ? 2 : 1);
      if (
        !integers ||
        p.colStart < 1 ||
        p.rowStart < 1 ||
        p.colSpan < min ||
        p.colSpan > max ||
        p.colStart + p.colSpan - 1 > config.columns ||
        !rowSpanOk ||
        p.rowStart + p.rowSpan - 1 > result.rows
      ) {
        throw new Error(`Grid layout placement for ${item.layoutId} is invalid at ${step.name}`);
      }
      for (let row = p.rowStart - 1; row < p.rowStart + p.rowSpan - 1; row++) {
        for (let col = p.colStart - 1; col < p.colStart + p.colSpan - 1; col++) {
          if (matrix[row][col]) throw new Error(`Grid layout overlap at ${step.name} row ${row + 1} column ${col + 1}`);
          matrix[row][col] = true;
        }
      }
    }
    let holes = 0;
    for (const cells of matrix) {
      const last = cells.lastIndexOf(true);
      // A row no item reaches is not a hole inside a row: it gets its own message.
      if (last < 0) throw new Error(`Grid layout has an empty row at ${step.name}`);
      if (cells.slice(0, last + 1).includes(false)) {
        throw new Error(`Grid layout has an internal hole at ${step.name}`);
      }
      holes += config.columns - last - 1;
    }
    if (holes !== result.holes) throw new Error(`Grid layout hole count differs at ${step.name}`);
    validateReadingOrder(items, result, step.name);
  }
}

/*
 * The solver never reorders: read band by band, segment by segment from
 * the inline start, top before bottom inside a pair, the items come in
 * input order. That also keeps a pair to two neighbouring items.
 */
function validateReadingOrder(items: GridItemSpec[], result: GridStepLayout, step: string): void {
  const placements = items.map(item => result.placements[item.layoutId]);
  // A band starts on a row no earlier item reaches into.
  const bandOf = new Map<number, number>();
  let band = -1;
  let bandEnd = 0;
  const starts = [...new Set(placements.map(p => p.rowStart))].sort((a, b) => a - b);
  for (const row of starts) {
    if (row > bandEnd) {
      band++;
      bandEnd = row;
    }
    for (const p of placements) if (p.rowStart === row) bandEnd = Math.max(bandEnd, row + p.rowSpan - 1);
    bandOf.set(row, band);
  }
  const key = (p: GridPlacement): [number, number, number] => [bandOf.get(p.rowStart) ?? 0, p.colStart, p.rowStart];
  for (let i = 1; i < items.length; i++) {
    const a = key(placements[i - 1]);
    const b = key(placements[i]);
    if ((a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) >= 0) {
      throw new Error(`Grid layout reorders ${items[i].layoutId} at ${step}`);
    }
  }
  // Row tracks are fixed, so a low in a two-track band stands only as half of a pair: its input
  // neighbour sits in the other track of the same column. Rows ending at different columns hide
  // no internal hole, so the occupancy matrix alone accepts a lone low beside a high.
  const twoTrack = new Set(placements.filter(p => p.rowSpan === 2).map(p => bandOf.get(p.rowStart)));
  placements.forEach((p, i) => {
    if (p.rowSpan !== 1 || !twoTrack.has(bandOf.get(p.rowStart))) return;
    const stacked = (q: GridPlacement | undefined, offset: number) =>
      !!q &&
      q.rowSpan === 1 &&
      q.colStart === p.colStart &&
      q.rowStart === p.rowStart + offset &&
      bandOf.get(q.rowStart) === bandOf.get(p.rowStart);
    if (!stacked(placements[i + 1], 1) && !stacked(placements[i - 1], -1)) {
      throw new Error(`Grid layout leaves ${items[i].layoutId} unpaired beside a high at ${step}`);
    }
  });
  // A pair is two lows of one width. Only a high spans two tracks, so a two-track band always holds one.
  for (let i = 0; i + 1 < items.length; i++) {
    const p = placements[i];
    const next = placements[i + 1];
    const paired = bandOf.get(p.rowStart) === bandOf.get(next.rowStart) && next.colStart === p.colStart && next.rowStart === p.rowStart + 1;
    if (paired && next.colSpan !== p.colSpan) {
      throw new Error(`Grid layout pairs ${items[i].layoutId} with a low of another width at ${step}`);
    }
  }
}
