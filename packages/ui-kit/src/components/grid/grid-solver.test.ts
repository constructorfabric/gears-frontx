import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  SIZE_CLASSES,
  defaultGridConfig,
  validateGridConfig,
  type GridConfig,
  type HeightClass,
  type SizeClass,
  type SpanRange,
} from './grid-config';
import { solveGridLayout, validateGridLayout, type GridItemSpec, type GridStepLayout } from './grid-solver';

function configWithRanges(ranges: Partial<Record<SizeClass, SpanRange>>): GridConfig {
  const config = structuredClone(defaultGridConfig);
  config.steps = [config.steps[0]];
  for (const [size, range] of Object.entries(ranges)) config.sizes[size as SizeClass].base = range;
  return config;
}

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '../../../scripts/grid-css.mjs');
const FLEXIBLE = { flexible: true };

const fixed = (width: number): SpanRange => ({ min: width, preferred: width, max: width });
const item = (layoutId: string, size: SizeClass, height?: HeightClass): GridItemSpec => ({ layoutId, size, height });
const spans = (items: GridItemSpec[], step: GridStepLayout) => items.map(it => step.placements[it.layoutId].colSpan);

function seededRandom(seed: number): () => number {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

function randomItems(random: () => number, maxLength: number, highShare: number): GridItemSpec[] {
  return Array.from({ length: 1 + Math.floor(random() * maxLength) }, (_, i) =>
    item(`item-${i}`, SIZE_CLASSES[Math.floor(random() * SIZE_CLASSES.length)], random() < highShare ? 'high' : 'low'));
}

describe('Grid config', () => {
  it.each([
    ['name', (c: GridConfig) => { c.name = 'bad name'; }, /name/],
    ['columns', (c: GridConfig) => { c.columns = 0; }, /columns/],
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
    ['height model', (c: GridConfig) => { c.heights.high = 3; }, /heights/],
  ])('rejects %s, in the component and in the CSS command alike', (_name, change, message) => {
    const config = structuredClone(defaultGridConfig);
    change(config);
    expect(() => validateGridConfig(config)).toThrow(message);
    const directory = mkdtempSync(join(tmpdir(), 'grid-config-'));
    try {
      const input = join(directory, 'config.json');
      writeFileSync(input, JSON.stringify(config));
      const run = spawnSync(process.execPath, [SCRIPT, input, join(directory, 'out.css')], { encoding: 'utf8' });
      expect(run.status).toBe(1);
      expect(run.stderr).toMatch(message);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(['160px', '12.5rem', '.5em'])('accepts the row height %s', rowHeight => {
    expect(() => validateGridConfig({ ...structuredClone(defaultGridConfig), rowHeight })).not.toThrow();
  });
});

describe('Grid solver, preferred spans (default)', () => {
  it('places only the preferred spans 12, 6 and 3 with the default config', () => {
    const random = seededRandom(61243);
    for (let run = 0; run < 24; run++) {
      const items = randomItems(random, 28, 0.3);
      const layout = solveGridLayout(items);
      validateGridLayout(layout, items);
      for (const step of Object.values(layout.steps)) {
        for (const span of spans(items, step)) expect([12, 6, 3]).toContain(span);
      }
    }
  });

  it('keeps the hole at the inline end of a row that only ranges could fill', () => {
    const items = [item('medium', 'medium'), item('small', 'small')];
    const strict = solveGridLayout(items).steps.lg;
    expect(strict.placements).toEqual({
      medium: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 1 },
      small: { colStart: 7, colSpan: 3, rowStart: 1, rowSpan: 1 },
    });
    expect(strict).toMatchObject({ rows: 1, holes: 3 });

    const flexible = solveGridLayout(items, defaultGridConfig, FLEXIBLE);
    expect(spans(items, flexible.steps.lg)).toEqual([8, 4]);
    expect(flexible.steps.lg).toMatchObject({ rows: 1, holes: 0 });
    validateGridLayout(flexible, items, defaultGridConfig, FLEXIBLE);
    expect(() => validateGridLayout(flexible, items)).toThrow(/placement for medium is invalid/);
  });

  it('stacks four small lows beside a high medium at lg into T6 + P3 + P3', () => {
    const items = [item('high', 'medium', 'high'), item('a', 'small'), item('b', 'small'), item('c', 'small'), item('d', 'small')];
    for (const options of [{}, FLEXIBLE]) {
      const lg = solveGridLayout(items, defaultGridConfig, options).steps.lg;
      expect(lg.placements).toEqual({
        high: { colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 2 },
        a: { colStart: 7, colSpan: 3, rowStart: 1, rowSpan: 1 },
        b: { colStart: 7, colSpan: 3, rowStart: 2, rowSpan: 1 },
        c: { colStart: 10, colSpan: 3, rowStart: 1, rowSpan: 1 },
        d: { colStart: 10, colSpan: 3, rowStart: 2, rowSpan: 1 },
      });
      expect(lg).toMatchObject({ rows: 2, holes: 0 });
    }
  });

  it.each([
    ['sm', {}, 6, 6],
    ['md', {}, 6, 3],
    ['lg', {}, 6, 3],
    ['md', FLEXIBLE, 8, 4],
    ['lg', FLEXIBLE, 8, 4],
  ] as const)('stacks two small lows beside a high medium at %s (%j), in both orders', (step, options, highSpan, pairSpan) => {
    const holes = 2 * (12 - highSpan - pairSpan);
    const highFirst = solveGridLayout([item('high', 'medium', 'high'), item('top', 'small'), item('bottom', 'small')], defaultGridConfig, options).steps[step];
    expect(highFirst.placements).toEqual({
      high: { colStart: 1, colSpan: highSpan, rowStart: 1, rowSpan: 2 },
      top: { colStart: highSpan + 1, colSpan: pairSpan, rowStart: 1, rowSpan: 1 },
      bottom: { colStart: highSpan + 1, colSpan: pairSpan, rowStart: 2, rowSpan: 1 },
    });
    expect(highFirst).toMatchObject({ rows: 2, holes });
    const highLast = solveGridLayout([item('top', 'small'), item('bottom', 'small'), item('high', 'medium', 'high')], defaultGridConfig, options).steps[step];
    expect(highLast.placements).toEqual({
      top: { colStart: 1, colSpan: pairSpan, rowStart: 1, rowSpan: 1 },
      bottom: { colStart: 1, colSpan: pairSpan, rowStart: 2, rowSpan: 1 },
      high: { colStart: pairSpan + 1, colSpan: highSpan, rowStart: 1, rowSpan: 2 },
    });
    expect(highLast).toMatchObject({ rows: 2, holes });
  });

  it('never stretches a low over two tracks: a lone low beside a high moves to the next band', () => {
    const items = [item('high', 'medium', 'high'), item('low', 'small')];
    const lg = solveGridLayout(items).steps.lg;
    expect(lg.placements.low).toEqual({ colStart: 1, colSpan: 3, rowStart: 3, rowSpan: 1 });
    expect(lg).toMatchObject({ rows: 3, holes: 2 * 6 + 9 });
    validateGridLayout(solveGridLayout(items), items);
  });
});

describe('Grid solver', () => {
  it('fills exact widths through ranges only when flexible', () => {
    const config = configWithRanges({ large: fixed(7), medium: { min: 4, preferred: 4, max: 5 } });
    const items = [item('a', 'large'), item('b', 'medium')];
    const flexible = solveGridLayout(items, config, FLEXIBLE);
    expect(flexible.steps.base).toMatchObject({ rows: 1, holes: 0 });
    expect(flexible.steps.base.placements.b.colSpan).toBe(5);
    validateGridLayout(flexible, items, config, FLEXIBLE);
    expect(solveGridLayout(items, config).steps.base).toMatchObject({ holes: 1, placements: { b: { colSpan: 4 } } });
  });

  it('does not pair lows across a high item', () => {
    const config = configWithRanges({ large: fixed(7), small: fixed(5) });
    const items = [item('first', 'small'), item('middle', 'large', 'high'), item('last', 'small')];
    const result = solveGridLayout(items, config);
    const first = result.steps.base.placements.first;
    const last = result.steps.base.placements.last;
    const paired = first.colStart === last.colStart && last.rowStart === first.rowStart + 1;
    expect(paired).toBe(false);
    validateGridLayout(result, items, config);
  });

  it('uses all 23 items allowed in a two-track 12-column band', () => {
    const config = configWithRanges({ large: fixed(1), small: fixed(1) });
    const items = [item('high', 'large', 'high'), ...Array.from({ length: 22 }, (_, i) => item(`low-${i}`, 'small'))];
    const result = solveGridLayout(items, config);
    expect(result.steps.base).toMatchObject({ rows: 2, holes: 0 });
    validateGridLayout(result, items, config);
  });

  it('uses a deterministic total tie order', () => {
    const config = configWithRanges({ small: { min: 4, preferred: 5, max: 8 } });
    const items = [item('a', 'small'), item('b', 'small')];
    const first = solveGridLayout(items, config, FLEXIBLE);
    expect(first.steps.base.placements.a.colSpan).toBe(5);
    for (let i = 0; i < 10; i++) expect(solveGridLayout(items, config, FLEXIBLE)).toEqual(first);
  });

  it('rejects duplicate identities and unknown classes', () => {
    expect(() => solveGridLayout([item('a', 'small'), item('a', 'small')])).toThrow(/Duplicate/);
    expect(() => solveGridLayout([item('a', 'tiny' as SizeClass)])).toThrow(/Unknown Grid size/);
    expect(() => solveGridLayout([item('a', 'small', 'short' as HeightClass)])).toThrow(/Unknown Grid height/);
  });

  it('validates a seeded flexible corpus at every step', () => {
    const random = seededRandom(52817);
    for (let run = 0; run < 24; run++) {
      const items = randomItems(random, 28, 0.3);
      validateGridLayout(solveGridLayout(items, defaultGridConfig, FLEXIBLE), items, defaultGridConfig, FLEXIBLE);
    }
  });

  it('solves 200 items across four steps within a CI bound, in both modes', () => {
    const items = Array.from({ length: 200 }, (_, i) => item(`item-${i}`, SIZE_CLASSES[i % SIZE_CLASSES.length], i % 5 === 0 ? 'high' : 'low'));
    for (const options of [{}, FLEXIBLE]) {
      solveGridLayout(items, defaultGridConfig, options);
      const start = performance.now();
      const layout = solveGridLayout(items, defaultGridConfig, options);
      const elapsed = performance.now() - start;
      validateGridLayout(layout, items, defaultGridConfig, options);
      expect(elapsed).toBeLessThan(500);
    }
  });
});

/*
 * A brute-force reference for small inputs: every split into bands, every
 * segment choice and width, scored with the same cost tuple. The solver's
 * layout must reach the same minimum.
 */
type Cost = [number, number, number, number];

function bruteForceCost(items: GridItemSpec[], config: GridConfig, step: string, flexible: boolean): Cost {
  const columns = config.columns;
  const ranges = items.map(i => {
    const range = config.sizes[i.size][step];
    return flexible ? range : fixed(range.preferred);
  });
  const high = items.map(i => i.height === 'high');
  const better = (a: Cost, b: Cost) => {
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] < b[k];
    return false;
  };
  let best: Cost | undefined;
  const walk = (start: number, acc: Cost): void => {
    if (start === items.length) {
      if (!best || better(acc, best)) best = acc;
      return;
    }
    // Extend one band from start: lows side by side on one track, or highs and pairs of lows on two.
    const band = (index: number, height: number, width: number, sawHigh: boolean, deviation: number): void => {
      if (width > 0 && (height === 1 || sawHigh)) {
        const holes = height * (columns - width);
        const last = index === items.length;
        walk(index, [acc[0] + (last ? 0 : holes), acc[1] + (last ? holes : 0), acc[2] + deviation, acc[3] + 1]);
      }
      if (index === items.length) return;
      const r = ranges[index];
      for (let w = r.min; w <= r.max && width + w <= columns; w++) {
        if (high[index]) {
          if (height === 2) band(index + 1, 2, width + w, true, deviation + Math.abs(w - r.preferred));
          continue;
        }
        if (height === 1) {
          band(index + 1, 1, width + w, false, deviation + Math.abs(w - r.preferred));
          continue;
        }
        if (index + 1 < items.length && !high[index + 1]) {
          const o = ranges[index + 1];
          if (w >= o.min && w <= o.max) band(index + 2, 2, width + w, sawHigh, deviation + Math.abs(w - r.preferred) + Math.abs(w - o.preferred));
        }
      }
    };
    band(start, 1, 0, false, 0);
    band(start, 2, 0, false, 0);
  };
  walk(0, [0, 0, 0, 0]);
  return best!;
}

function layoutCost(items: GridItemSpec[], config: GridConfig, step: string, flexible: boolean): Cost {
  const result = solveGridLayout(items, config, { flexible }).steps[step];
  const placements = items.map(i => result.placements[i.layoutId]);
  const cost: Cost = [0, 0, 0, 0];
  let row = 1;
  while (row <= result.rows) {
    const starting = placements.filter(p => p.rowStart === row);
    const height = Math.max(...starting.map(p => p.rowSpan));
    const inBand = placements.filter(p => p.rowStart >= row && p.rowStart < row + height);
    const width = Math.max(...inBand.map(p => p.colStart + p.colSpan - 1));
    const holes = height * (config.columns - width);
    if (row + height - 1 === result.rows) cost[1] += holes;
    else cost[0] += holes;
    cost[3] += 1;
    row += height;
  }
  items.forEach((item, i) => {
    cost[2] += Math.abs(placements[i].colSpan - config.sizes[item.size][step].preferred);
  });
  return cost;
}

describe('Grid solver optimality', () => {
  it.each([false, true])('reaches the brute-force minimum cost on a seeded corpus of small inputs (flexible %s)', flexible => {
    const config = structuredClone(defaultGridConfig);
    config.columns = 6;
    config.steps = [config.steps[0]];
    config.sizes = {
      small: { base: { min: 1, preferred: 2, max: 3 } },
      medium: { base: { min: 2, preferred: 3, max: 4 } },
      large: { base: { min: 4, preferred: 6, max: 6 } },
    };
    const random = seededRandom(9001);
    for (let run = 0; run < 150; run++) {
      const items = randomItems(random, 6, 0.35);
      validateGridLayout(solveGridLayout(items, config, { flexible }), items, config, { flexible });
      expect(layoutCost(items, config, 'base', flexible), JSON.stringify(items)).toEqual(bruteForceCost(items, config, 'base', flexible));
    }
  });
});

describe('Grid layout validator', () => {
  const config = configWithRanges({ large: fixed(7), small: fixed(5) });
  const items = [item('high', 'large', 'high'), item('top', 'small'), item('bottom', 'small')];

  it('rejects a layout that reorders items', () => {
    const swapped = solveGridLayout(items, config);
    swapped.steps.base.placements.top.rowStart = 2;
    swapped.steps.base.placements.bottom.rowStart = 1;
    expect(() => validateGridLayout(swapped, items, config)).toThrow(/reorders/);
  });

  it('rejects a low over two tracks, a lone low beside a high and a pair of two widths', () => {
    const stretched = solveGridLayout(items, config);
    stretched.steps.base.placements.top.rowSpan = 2;
    expect(() => validateGridLayout(stretched, items, config)).toThrow(/invalid/);
    // Row 1 ends at 12 and row 2 at 7: no internal hole, but the low has no partner below it.
    const lone = [item('high', 'large', 'high'), item('low', 'small')];
    const unpaired = solveGridLayout(lone, config);
    unpaired.steps.base.placements.low = { colStart: 8, colSpan: 5, rowStart: 1, rowSpan: 1 };
    unpaired.steps.base.rows = 2;
    unpaired.steps.base.holes = 5;
    expect(() => validateGridLayout(unpaired, lone, config)).toThrow(/unpaired beside a high/);
    const loose = configWithRanges({ large: fixed(7), small: { min: 4, preferred: 5, max: 5 } });
    const uneven = solveGridLayout(items, loose, FLEXIBLE);
    uneven.steps.base.placements.bottom.colSpan = 4;
    uneven.steps.base.holes += 1;
    expect(() => validateGridLayout(uneven, items, loose, FLEXIBLE)).toThrow(/another width/);
  });

  it('rejects overlap, a wrong hole count, a missing placement and an internal hole', () => {
    const pair = [item('a', 'small'), item('b', 'small')];
    const wide = configWithRanges({ small: fixed(5) });
    const layout = solveGridLayout(pair, wide);
    const overlap = structuredClone(layout);
    overlap.steps.base.placements.b.colStart = 1;
    expect(() => validateGridLayout(overlap, pair, wide)).toThrow(/overlap/);
    const holes = structuredClone(layout);
    holes.steps.base.holes = 1;
    expect(() => validateGridLayout(holes, pair, wide)).toThrow(/hole count/);
    const missing = structuredClone(layout);
    delete (missing.steps.base.placements as Record<string, unknown>).b;
    expect(() => validateGridLayout(missing, pair, wide)).toThrow(/every item once/);
    const holed = structuredClone(layout);
    holed.steps.base.placements.b.colStart = 7;
    expect(() => validateGridLayout(holed, pair, wide)).toThrow(/internal hole/);
  });
});
