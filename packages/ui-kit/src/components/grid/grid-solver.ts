import {
  SIZE_CLASSES,
  defaultGridConfig,
  validateGridConfig,
  type GridConfig,
  type HeightClass,
  type SizeClass,
  type SpanRange,
} from './grid-config.js';

export interface GridItemSpec {
  layoutId: string;
  size: SizeClass;
  height?: HeightClass;
}

export interface GridPlacement {
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
}

export interface GridStepLayout {
  placements: Record<string, GridPlacement>;
  rows: number;
  holes: number;
}

export interface GridLayout {
  steps: Record<string, GridStepLayout>;
}

/*
 * `flexible` is a property of one group (one Grid). Off, the default, every
 * block takes its size class's preferred span at each step, so widths stay
 * on the config's few fixed values and a row that does not fill keeps its
 * hole. On, a span may move inside the class's min..max to fill rows.
 */
export interface GridSolveOptions {
  flexible?: boolean;
}

/*
 * The placement search, run once per config step. Items are cut, in input
 * order, into bands. A one-track band holds lows (L) side by side. A
 * two-track band holds at least one high and is read as column segments
 * from the inline start: T is a high over both tracks, P is a pair of two
 * adjacent lows of one width (first on top). Row tracks have a fixed size,
 * so a low never spans two tracks: beside a high it stands only as half of
 * a pair. Unused columns sit at the inline end of a band.
 *
 * Plans compare by a cost tuple, lexicographically: hole cells in every
 * band but the last, hole cells in the last band, the sum of
 * |span - preferred| (always 0 unless flexible), the band count. A
 * two-track band's unused column counts two cells. Equal costs fall back
 * to a total tie order: band end indices, then each band's segment kinds
 * (P before T before L) and widths, smaller first. The order never
 * overrides cost.
 *
 * best[i] is the cheapest plan for items i..n-1. For each start the search
 * extends one band at a time through an inner table keyed by (next item,
 * used width, high seen), keeping only the cheapest partial band per key,
 * so the search stays linear in items for a fixed column count. The tie
 * keys `ends` and `kinds` are suffix strings, so they grow with the item
 * count; at the sizes a Grid group holds that cost is negligible.
 */

type SegmentKind = 'L' | 'P' | 'T';

interface Segment {
  kind: SegmentKind;
  index: number;
  width: number;
}

interface PartialBand {
  width: number;
  sawHigh: boolean;
  deviation: number;
  segments: Segment[];
  // Segment kinds and widths as a fixed-width string, the band's tie key.
  key: string;
}

type Cost = [number, number, number, number];

interface Plan {
  cost: Cost;
  ends: string;
  kinds: string;
  band?: { height: number; segments: Segment[] };
  next?: Plan;
}

const KIND_ORDER: Record<SegmentKind, string> = { P: '0', T: '1', L: '2' };

// Code-unit order, independent of the runtime locale.
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareCost(a: Cost, b: Cost): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function comparePartial(a: PartialBand, b: PartialBand): number {
  return a.deviation - b.deviation || compareText(a.key, b.key);
}

function comparePlan(a: Plan, b: Plan): number {
  return compareCost(a.cost, b.cost) || compareText(a.ends, b.ends) || compareText(a.kinds, b.kinds);
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function validateItems(items: GridItemSpec[]): void {
  if (!Array.isArray(items)) throw new Error('Grid items must be an array');
  const ids = new Set<string>();
  for (const item of items) {
    if (!item || typeof item.layoutId !== 'string' || item.layoutId.length === 0) {
      throw new Error('Grid item layoutId must be a nonempty string');
    }
    if (ids.has(item.layoutId)) throw new Error(`Duplicate Grid layoutId: ${item.layoutId}`);
    if (!SIZE_CLASSES.includes(item.size)) {
      throw new Error(`Unknown Grid size: ${String(item.size)}`);
    }
    if (item.height !== undefined && item.height !== 'low' && item.height !== 'high') {
      throw new Error(`Unknown Grid height: ${String(item.height)}`);
    }
    ids.add(item.layoutId);
  }
}

// The span range a block may take at a step: its class's range when flexible, else its preferred span only.
function spanRange(config: GridConfig, size: SizeClass, step: string, flexible: boolean): SpanRange {
  const range = config.sizes[size][step];
  return flexible ? range : { min: range.preferred, preferred: range.preferred, max: range.preferred };
}

function solveStep(items: GridItemSpec[], config: GridConfig, step: string, flexible: boolean): GridStepLayout {
  const n = items.length;
  const placements = Object.create(null) as Record<string, GridPlacement>;
  if (n === 0) return { placements, rows: 0, holes: 0 };

  const columns = config.columns;
  const ranges = items.map(item => spanRange(config, item.size, step, flexible));
  const high = items.map(item => item.height === 'high');
  const indexWidth = String(n).length;
  const spanWidth = String(columns).length;
  const best: Plan[] = new Array<Plan>(n + 1);
  best[n] = { cost: [0, 0, 0, 0], ends: '', kinds: '' };

  for (let start = n - 1; start >= 0; start--) {
    let winner: Plan | undefined;

    const offer = (band: PartialBand, height: number, end: number): void => {
      if (band.width === 0 || (height === 2 && !band.sawHigh)) return;
      const holes = height * (columns - band.width);
      const suffix = best[end];
      const plan: Plan = {
        cost: [
          (end < n ? holes : 0) + suffix.cost[0],
          (end === n ? holes : 0) + suffix.cost[1],
          band.deviation + suffix.cost[2],
          1 + suffix.cost[3],
        ],
        ends: `${String(end).padStart(indexWidth, '0')},${suffix.ends}`,
        kinds: `${band.key}/${suffix.kinds}`,
        band: { height, segments: band.segments },
        next: suffix,
      };
      if (!winner || comparePlan(plan, winner) < 0) winner = plan;
    };

    for (const height of [1, 2]) {
      // A one-track band holds at most one item per column; a two-track
      // band one high plus pairs in every other column.
      const limit = Math.min(n, start + (height === 1 ? columns : 2 * columns - 1));
      const table: Map<string, PartialBand>[] = Array.from({ length: limit - start + 1 }, () => new Map());
      table[0].set('0:0', { width: 0, sawHigh: false, deviation: 0, segments: [], key: '' });

      for (let index = start; index <= limit; index++) {
        for (const band of table[index - start].values()) {
          offer(band, height, index);
          if (index === limit) continue;

          const extend = (kind: SegmentKind, width: number, count: number, deviation: number): void => {
            if (band.width + width > columns || index + count > limit) return;
            const candidate: PartialBand = {
              width: band.width + width,
              sawHigh: band.sawHigh || kind === 'T',
              deviation: band.deviation + deviation,
              segments: [...band.segments, { kind, index, width }],
              key: band.key + KIND_ORDER[kind] + String(width).padStart(spanWidth, '0'),
            };
            const bucket = table[index + count - start];
            const bucketKey = `${candidate.width}:${Number(candidate.sawHigh)}`;
            const held = bucket.get(bucketKey);
            if (!held || comparePartial(candidate, held) < 0) bucket.set(bucketKey, candidate);
          };

          const range = ranges[index];
          if (high[index]) {
            if (height === 1) continue;
            for (let width = range.min; width <= range.max; width++) {
              extend('T', width, 1, Math.abs(width - range.preferred));
            }
            continue;
          }
          if (height === 1) {
            for (let width = range.min; width <= range.max; width++) {
              extend('L', width, 1, Math.abs(width - range.preferred));
            }
            continue;
          }
          if (index + 1 < limit && !high[index + 1]) {
            const other: SpanRange = ranges[index + 1];
            for (let width = Math.max(range.min, other.min); width <= Math.min(range.max, other.max); width++) {
              extend('P', width, 2, Math.abs(width - range.preferred) + Math.abs(width - other.preferred));
            }
          }
        }
      }
    }

    // Every item fits a band of its own, so a plan always exists.
    if (!winner) throw new Error(`No Grid layout for item ${items[start].layoutId}`);
    best[start] = winner;
  }

  let row = 1;
  let holes = 0;
  for (let plan: Plan | undefined = best[0]; plan?.band; plan = plan.next) {
    const { height, segments } = plan.band;
    let col = 1;
    for (const { kind, index, width } of segments) {
      placements[items[index].layoutId] = {
        colStart: col,
        colSpan: width,
        rowStart: row,
        rowSpan: kind === 'P' ? 1 : height,
      };
      if (kind === 'P') {
        placements[items[index + 1].layoutId] = { colStart: col, colSpan: width, rowStart: row + 1, rowSpan: 1 };
      }
      col += width;
    }
    holes += height * (columns - col + 1);
    row += height;
  }
  return { placements, rows: row - 1, holes };
}

/**
 * Places ordered items for every step of a config. Pure: no DOM, no
 * measurement, the same input always gives the same output. Throws on an
 * invalid config, a duplicate `layoutId` or an unknown size or height.
 */
export function solveGridLayout(
  items: GridItemSpec[],
  config: GridConfig = defaultGridConfig,
  { flexible = false }: GridSolveOptions = {},
): GridLayout {
  validateGridConfig(config);
  validateItems(items);
  const steps = Object.create(null) as Record<string, GridStepLayout>;
  for (const step of config.steps) steps[step.name] = solveStep(items, config, step.name, flexible);
  return { steps };
}

/**
 * Checks a layout against its items and config through an occupancy
 * matrix: every item placed once, spans at the preferred value (inside the
 * range when flexible), a high over two tracks and a low over one, no
 * overlap, no cell outside the grid, empty cells only at the inline end of
 * a row, the hole count, and the input order in reading order (no item
 * moved, a pair only of neighbours). Throws on the first violation.
 * The tests' independent check of the solver, kept out of the package API.
 */
export function validateGridLayout(
  layout: GridLayout,
  items: GridItemSpec[],
  config: GridConfig = defaultGridConfig,
  { flexible = false }: GridSolveOptions = {},
): void {
  validateGridConfig(config);
  validateItems(items);
  for (const step of config.steps) {
    const result = layout.steps?.[step.name];
    if (!result || !Number.isInteger(result.rows) || result.rows < 0 || !Number.isInteger(result.holes) || result.holes < 0) {
      throw new Error(`Grid layout step ${step.name} has invalid rows or holes`);
    }
    if (!result.placements || typeof result.placements !== 'object') {
      throw new Error(`Grid layout step ${step.name} has no placements`);
    }
    const ids = Object.keys(result.placements);
    if (ids.length !== items.length || items.some(item => !hasOwn(result.placements, item.layoutId))) {
      throw new Error(`Grid layout step ${step.name} must place every item once`);
    }
    const matrix = Array.from({ length: result.rows }, () => new Array<boolean>(config.columns).fill(false));
    for (const item of items) {
      const p = result.placements[item.layoutId];
      if (!p || typeof p !== 'object') throw new Error(`Grid layout placement for ${item.layoutId} is missing at ${step.name}`);
      const range = spanRange(config, item.size, step.name, flexible);
      const integers = [p.colStart, p.colSpan, p.rowStart, p.rowSpan].every(Number.isInteger);
      const rowSpanOk = p.rowSpan === (item.height === 'high' ? 2 : 1);
      if (
        !integers ||
        p.colStart < 1 ||
        p.rowStart < 1 ||
        p.colSpan < range.min ||
        p.colSpan > range.max ||
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
      if (last < 0 || cells.slice(0, last + 1).includes(false)) {
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
