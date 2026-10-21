import { describe, expect, it } from 'vitest';

import { declaredIn } from '../../../../../__test-utils__/css-rules';

// jsdom lays nothing out, so whether the pager row fits a narrow container is a property of the
// stylesheet text alone; reading the source is the guard a rendered test cannot reach.
describe('pager.module.css', () => {
  const declared = declaredIn(import.meta.url, 'pager.module.css');

  it('wraps the pager row so a container narrower than its parts keeps every control inside it', () => {
    expect(declared('.pager', 'flex-wrap')).toBe('wrap');
  });
});
