import { describe, expect, it } from 'vitest';

import { computePaginationItems, type PaginationItem } from './pagination-items';

// Compact form: page numbers as numbers, collapsed runs as '…'.
function drawn(page: number, totalPages: number): (number | '…')[] {
  return computePaginationItems(page, totalPages).map((item: PaginationItem) =>
    item.type === 'page' ? item.page : '…',
  );
}

describe('computePaginationItems', () => {
  it('draws nothing when there are no pages', () => {
    expect(drawn(1, 0)).toEqual([]);
  });

  it('draws every page while they all fit', () => {
    expect(drawn(1, 1)).toEqual([1]);
    expect(drawn(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // One page more and a run has to collapse.
    expect(drawn(4, 8)).toEqual([1, 2, 3, 4, 5, '…', 8]);
  });

  it('collapses the far end when the current page is near the start', () => {
    expect(drawn(1, 20)).toEqual([1, 2, 3, 4, 5, '…', 20]);
    expect(drawn(3, 20)).toEqual([1, 2, 3, 4, 5, '…', 20]);
  });

  it('collapses the near end when the current page is near the finish', () => {
    expect(drawn(20, 20)).toEqual([1, '…', 16, 17, 18, 19, 20]);
    expect(drawn(18, 20)).toEqual([1, '…', 16, 17, 18, 19, 20]);
  });

  it('collapses both ends around the current page in the middle', () => {
    expect(drawn(10, 20)).toEqual([1, '…', 9, 10, 11, '…', 20]);
  });
});
