import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// jsdom has no layout engine and no real stylesheet is applied in unit tests, so the stacking
// order between the overlay and the table's sticky layers is only observable in the CSS text.
// Same approach as data-grid-cell.module.css.test.ts. The three values are read from their own
// stylesheets and compared to each other, so moving any one of them out of order fails here
// instead of leaving a literal in this file to go stale.
const here = dirname(fileURLToPath(import.meta.url));
const tableComponents = join(here, '..', '..', 'table', 'components');

// A plain string search rather than a regex built from the selector: the selectors are literals
// in this file, and a literal `/z-index/` regex is all the parsing the rule body needs.
function zIndexOf(cssFile: string, selector: string): number {
  const css = readFileSync(cssFile, 'utf-8');
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`Rule for selector "${selector}" not found in ${cssFile}`);
  }
  const rule = css.slice(start, css.indexOf('}', start));
  const zIndex = /z-index\s*:\s*(\d+)/.exec(rule);
  if (!zIndex) {
    throw new Error(`Rule "${selector}" in ${cssFile} declares no numeric z-index`);
  }
  return Number(zIndex[1]);
}

describe('data-grid-layout-content.module.css -- loader overlay stacking', () => {
  const cellCss = join(tableComponents, 'data-grid-cell.module.css');
  const overlay = zIndexOf(join(here, 'data-grid-layout-content.module.css'), '.loaderOverlay');

  it('lifts the overlay above both sticky layers inside the table, header above pinned cells', () => {
    const pinnedCell = zIndexOf(cellCss, '.stickyCell');
    const stickyHeader = zIndexOf(
      join(tableComponents, 'data-grid-table-header.module.css'),
      '.theadSticky',
    );

    // Pinned body cells sit under the pinned header row group, and the refetch overlay covers
    // both: an overlay that sat lower would leave a sticky layer clickable through the scrim.
    expect(pinnedCell).toBeLessThan(stickyHeader);
    expect(stickyHeader).toBeLessThan(overlay);
  });

  it('keeps a pinned header cell above the kit\'s header cells and below the overlay', () => {
    // Table's own sticky header lifts every header cell to the same step. A pinned column's
    // header cell has to clear that step, or the header cells scrolling in from the side paint
    // over it; and it still sits under the overlay.
    const kitHeaderCell = zIndexOf(
      join(here, '..', '..', '..', '..', 'table', 'table.module.css'),
      ':where(.stickyHeader) .tableHeader .tableHead',
    );
    const pinnedHeaderCell = zIndexOf(cellCss, '.cell.stickyCell.stickyHeaderCell');

    expect(pinnedHeaderCell).toBeGreaterThan(kitHeaderCell);
    expect(pinnedHeaderCell).toBeLessThan(overlay);
  });
});
