import { describe, expect, it } from 'vitest';

import { declaredIn } from '../../../../../__test-utils__/css-rules';

// jsdom lays nothing out, so whether the detail row keeps the row hover tint off, and whether the
// detail content fills the cell it spans without widening the columns, is a property of the
// stylesheet text alone; reading the source is the guard a rendered test cannot reach.
describe('data-grid-row-detail.module.css', () => {
  const declared = declaredIn(import.meta.url, 'data-grid-row-detail.module.css');

  it('takes the row hover tint off the detail row, the way a dragged row is held', () => {
    expect(declared('.detailRow', '--table-row-hover-fill')).toBe('transparent');
  });

  it('takes the detail content out of the auto-layout width measurement and fills the cell instead', () => {
    expect(declared('.detailContent', 'inline-size')).toBe('0');
    expect(declared('.detailContent', 'min-inline-size')).toBe('100%');
  });
});
