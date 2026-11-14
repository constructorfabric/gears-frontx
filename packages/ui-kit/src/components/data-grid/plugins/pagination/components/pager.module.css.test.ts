import { describe, expect, it } from 'vitest';

import { declaredIn } from '../../../../../__test-utils__/css-rules';

// jsdom lays nothing out, so whether the pager row fits a narrow container is a property of the
// stylesheet text alone; reading the source is the guard a rendered test cannot reach.
describe('pager.module.css', () => {
  const declared = declaredIn(import.meta.url, 'pager.module.css');

  it('wraps the pager row so a container narrower than its parts keeps every control inside it', () => {
    expect(declared('.pager', 'flex-wrap')).toBe('wrap');
  });

  it('keeps the compact pager on one line that clips its text instead of spilling', () => {
    expect(declared('.compact', 'flex-wrap')).toBe('nowrap');
    expect(declared('.compact .info', 'min-inline-size')).toBe('0');
    expect(declared('.compact .info', 'overflow')).toBe('hidden');
    expect(declared('.compact .info', 'text-overflow')).toBe('ellipsis');
    expect(declared('.compact .info', 'white-space')).toBe('nowrap');
  });
});
