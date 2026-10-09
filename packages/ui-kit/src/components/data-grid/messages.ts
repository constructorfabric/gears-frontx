/*
 * Every user-facing string the grid renders, in one place. The kit has no i18n layer, so these are
 * English literals; one module keeps them findable and lets the tests assert against `messages.*`
 * instead of repeating the text. A string that embeds a count or a name is a function of it.
 */
export const messages = {
  emptyState: {
    noResultsFound: 'No results found',
    noResultsFoundDescription: 'Try adjusting your search or filters',
  },
  loadError: {
    headerDefault: 'Something went wrong',
    bodyDefault: 'An error occurred while loading',
  },
  layoutMainSlotSelector: {
    table: 'Table view',
    cards: 'Cards view',
  },
  textSearch: {
    placeholder: 'Search...',
    clear: 'Clear input',
  },
  order: {
    sort: 'Sort',
    sortBy: 'Sort by',
    order: 'Order',
    changeSorting: (columnLabel: string) => `Change sorting of '${columnLabel}' column`,
    ascString: 'A-Z',
    descString: 'Z-A',
    ascNumber: '0-9',
    descNumber: '9-0',
    ascDate: 'Oldest first',
    descDate: 'Newest first',
  },
  pagination: {
    ariaLabel: 'Pagination',
    limitSelectorAriaLabel: 'Items per page',
    previousPage: 'Previous page',
    nextPage: 'Next page',
    goToPage: (page: number) => `Go to page ${page}`,
    pageInfo: (page: number, totalPages: number, total: number) =>
      `Page ${page} of ${totalPages} (${total} items)`,
  },
};
