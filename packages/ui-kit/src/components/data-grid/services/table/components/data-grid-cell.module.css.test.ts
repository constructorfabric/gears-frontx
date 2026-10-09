import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// jsdom has no layout engine and Vitest's default CSS handling replaces module classes with an
// identity proxy (no real stylesheet is ever applied in these tests), so a rendered-component
// test cannot observe how the nowrap content wrapper actually sizes -- the two failure modes here
// (collapsing to 0 width when uncapped, ignoring the cap when capped) are purely a property of
// the CSS text. Reading the source directly is the regression guard that's actually reachable.
const here = dirname(fileURLToPath(import.meta.url));

function readCss(file: string): string {
  return readFileSync(join(here, file), 'utf-8');
}

function extractRule(css: string, selector: string, file: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) {
    throw new Error(`Rule for selector "${selector}" not found in ${file}`);
  }
  return match[1];
}

describe('data-grid-cell.module.css -- nowrap (single-line, ellipsis-clipping) content wrapper', () => {
  const rule = extractRule(
    readCss('data-grid-cell.module.css'),
    "[data-overflow='nowrap'] .content",
    'data-grid-cell.module.css',
  );

  it('does not force min-inline-size: 100% on the content wrapper', () => {
    // min-inline-size: 100% competes with -- and per the CSS spec wins over -- max-inline-size,
    // so an uncapped nowrap column collapses to 0 width instead of truncating, and a capped one
    // ignores the cap once the cell stretches past it. The fix is to let the wrapper inherit
    // min-inline-size: 0 from the base .content rule (the standard flex/table-cell shrink fix),
    // not override it to 100%.
    expect(rule).not.toMatch(/min-inline-size\s*:\s*100%/);
  });

  it('falls back the content-cap var to "none", not "0", when the column has no maxWidth', () => {
    // A `0` fallback forces the wrapper to zero width whenever `--_data-grid-col-max` is unset -- i.e.
    // every nowrap column without a `maxWidth` -- rendering the (present-in-DOM) text invisible.
    // `none` leaves sizing to the cell's actual width (the fixed track, or 100% of the th via
    // .contentRow) exactly as intended.
    expect(rule).toMatch(/max-inline-size\s*:\s*var\(--_data-grid-col-max,\s*none\)/);
  });
});

// The pinned header's fill and separator used to be the cell's own (`.stickyHeaderCell` painted a
// background and drew a hairline with a box-shadow). Table's `stickyHeader` owns both now: it
// fills the header cells from `--table-header-fill`, and draws the rule under them as each cell's
// own border, which only travels with a pinned cell under the separated-borders model.
describe('data-grid-table.module.css -- sticky header', () => {
  const tableCss = readCss('data-grid-table.module.css');

  it('hands the consumer hook to the kit fill, with the kit default behind it', () => {
    // `--data-grid-header-background` wins, and a grid that sets nothing paints what a sticky Table
    // paints on its own (`--card`).
    const rule = extractRule(tableCss, '.table', 'data-grid-table.module.css');
    expect(rule.replace(/\s+/g, ' ')).toMatch(
      /--table-header-fill: var\(--data-grid-header-background, var\(--card\)\)/,
    );
  });

  it.each(['.table.layoutFixed', '.table.layoutAuto'])(
    'keeps borders separated in %s, so the rule under a pinned header travels with its cell',
    (selector) => {
      const rule = extractRule(tableCss, selector, 'data-grid-table.module.css');
      expect(rule).toMatch(/border-collapse\s*:\s*separate/);
    },
  );
});
