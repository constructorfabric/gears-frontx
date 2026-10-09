import { useMemo } from 'react';

export type PaginationItem = { type: 'page'; page: number } | { type: 'ellipsis' };

const siblings = 1;
const edges = 1;
const totalVisible = siblings * 2 + edges * 2 + 3;

function range(start: number, end: number): number[] {
  const result: number[] = [];
  for (let i = start; i <= end; i++) {
    result.push(i);
  }
  return result;
}

function pages(from: number[]): PaginationItem[] {
  return from.map((page) => ({ type: 'page', page }));
}

/**
 * The page numbers to draw, with an ellipsis where a run is collapsed: the first and last page
 * always, the current page and one neighbour either side, and room for the whole list when it is
 * short enough to fit.
 */
export function computePaginationItems(page: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 0) return [];

  if (totalPages <= totalVisible) {
    return pages(range(1, totalPages));
  }

  const leftSiblingIndex = Math.max(page - siblings, edges + 1);
  const rightSiblingIndex = Math.min(page + siblings, totalPages - edges);

  const showLeftEllipsis = leftSiblingIndex > edges + 2;
  const showRightEllipsis = rightSiblingIndex < totalPages - edges - 1;

  if (!showLeftEllipsis && showRightEllipsis) {
    const leftItemCount = siblings * 2 + edges + 2;
    return [
      ...pages(range(1, leftItemCount)),
      { type: 'ellipsis' },
      ...pages(range(totalPages - edges + 1, totalPages)),
    ];
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    const rightItemCount = siblings * 2 + edges + 2;
    return [
      ...pages(range(1, edges)),
      { type: 'ellipsis' },
      ...pages(range(totalPages - rightItemCount + 1, totalPages)),
    ];
  }

  return [
    ...pages(range(1, edges)),
    { type: 'ellipsis' },
    ...pages(range(leftSiblingIndex, rightSiblingIndex)),
    { type: 'ellipsis' },
    ...pages(range(totalPages - edges + 1, totalPages)),
  ];
}

export function usePaginationItems(page: number, totalPages: number): PaginationItem[] {
  return useMemo(() => computePaginationItems(page, totalPages), [page, totalPages]);
}
