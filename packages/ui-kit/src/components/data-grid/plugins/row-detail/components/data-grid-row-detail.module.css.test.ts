import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { declarationMap, declaredIn, extractRules } from '../../../../../__test-utils__/css-rules';

// jsdom lays nothing out, so whether the detail row keeps the row hover tint off, and whether the
// detail content fills the cell it spans without widening the columns and wraps inside it, is a
// property of the stylesheet text alone; reading the source is the guard a rendered test cannot reach.
describe('data-grid-row-detail.module.css', () => {
  const declared = declaredIn(import.meta.url, 'data-grid-row-detail.module.css');

  // The sizes are the theme's invariants, the `:root` block that holds no colour.
  function invariantTokens() {
    const themeRules = extractRules(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'styles', 'theme.css'),
        'utf-8',
      ),
    );
    return declarationMap(themeRules.find((rule) => rule.selector === ':root')?.body ?? '');
  }

  it('gives the toggle a 24px hit area with a pseudo-element, the way the table tree toggle has it', () => {
    // A box over the toggle, centred on it by equal offsets, that shows nothing and moves nothing.
    expect(declared('.toggleCell .toggle::after', 'content')).toBe("''");
    expect(declared('.toggleCell .toggle::after', 'position')).toBe('absolute');
    // The offset counts from the padding box, so it carries the 1px border of the Button as well as
    // the --space-1 the square reaches past the toggle's line.
    expect(declared('.toggleCell .toggle::after', 'inset')).toBe(
      'calc(-1 * (var(--space-1) + var(--border-width)))',
    );
    expect(declared('.toggleCell .toggle::after', 'background')).toBeUndefined();

    // The square is the toggle's line and --space-1 each side: at least 1.5rem, 24px at a 16px root.
    expect(declared('.toggleCell .toggle', 'block-size')).toBe('var(--text-meta-line-height)');
    const rem = (token: string) => {
      const value = invariantTokens().get(token);
      if (!value?.endsWith('rem')) throw new Error(`${token} is not a rem token of the theme`);
      return parseFloat(value);
    };
    expect(rem('--text-meta-line-height') + 2 * rem('--space-1')).toBeGreaterThanOrEqual(1.5);
  });

  it('takes the row hover tint off the detail row, the way a dragged row is held', () => {
    expect(declared('.detailRow', '--table-row-hover-fill')).toBe('transparent');
  });

  it('gives a table nested in the detail its own row hover tint back, which the detail row turned off', () => {
    // A custom property inherits, so the detail row's `transparent` would reach every table the
    // consumer renders in the detail; `initial` is the guaranteed-invalid value, so the kit's
    // `var(--table-row-hover-fill, ...)` falls back to its own tint inside the detail content.
    expect(declared('.detailContent', '--table-row-hover-fill')).toBe('initial');
  });

  it('takes the detail content out of the auto-layout width measurement and fills the cell instead', () => {
    expect(declared('.detailContent', 'inline-size')).toBe('0');
    expect(declared('.detailContent', 'min-inline-size')).toBe('100%');
  });

  it('wraps the detail text the table cell keeps on one line, long unbroken strings included', () => {
    expect(declared('.detailContent', 'white-space')).toBe('normal');
    expect(declared('.detailContent', 'overflow-wrap')).toBe('anywhere');
  });
});
