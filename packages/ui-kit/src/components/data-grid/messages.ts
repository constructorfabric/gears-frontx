/*
 * Every user-facing string the grid renders, in one place: the English defaults. Components read
 * them through the grid's messages context, and a grid's `messages` prop merges a consumer's
 * strings over these, so one module still keeps them findable and lets the tests assert against
 * `messages.*` instead of repeating the text. A string that embeds a count or a name is a function
 * of it.
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
    // The input has no visible label, so this names it for assistive tech; the plugin's `label`
    // prop overrides it.
    label: 'Search',
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
  actionsMenu: {
    actions: 'Actions',
  },
  exportMenuItem: {
    defaultFilename: 'Report',
    defaultSheetName: 'Sheet',
    exportAs: (type: string) => `Export as ${type}`,
  },
  tableConfiguration: {
    header: 'Table configuration',
    configureColumns: 'Configure columns',
    pinColumn: 'Pin column',
    unpinColumn: 'Unpin column',
  },
  rowSelect: {
    itemsSelected: (count: number) => (count === 1 ? '1 item selected' : `${count} items selected`),
    pageSelected: (count: number) =>
      count === 1 ? '1 item on this page is selected.' : `All ${count} items on this page are selected.`,
    selectAll: (count: number) => `Select all ${count}`,
    allSelected: (count: number) =>
      count === 1 ? '1 item is selected.' : `All ${count} items are selected.`,
    clearSelection: 'Clear selection',
  },
  pagination: {
    ariaLabel: 'Pagination',
    // The pager of a grid with a `label`: two grids on one page must not share the landmark name
    // "Pagination" (axe's `landmark-unique`), so the label names each one's nav.
    ariaLabelFor: (label: string) => `${label} pagination`,
    limitSelectorAriaLabel: 'Items per page',
    previousPage: 'Previous page',
    nextPage: 'Next page',
    goToPage: (page: number) => `Go to page ${page}`,
    pageInfo: (page: number, totalPages: number, total: number) =>
      `Page ${page} of ${totalPages} (${total} items)`,
    // The compact pager draws no page buttons, so the item count is what it drops to stay one
    // line: the position is what a page change moves, and that is all this line says.
    pageInfoCompact: (page: number, totalPages: number) => `Page ${page} of ${totalPages}`,
  },
  filters: {
    allFilters: 'All filters',
    allFiltersTitle: 'All filters',
    apply: 'Apply',
    reset: 'Reset',
    searchPlaceholder: 'Search...',
    noOptionsFound: 'No options found',
    close: 'Close',
    closeDialog: 'Close dialog',
  },
  dragDrop: {
    dragHandle: 'Drag to reorder row',
  },
  tree: {
    noItems: 'No items',
    collapse: 'Collapse',
    expand: 'Expand',
  },
  tableTree: {
    // The row toggle has no visible text, so its state is spoken twice: the name says what the
    // press does and `aria-expanded` says whether the row is open.
    expand: 'Expand row',
    collapse: 'Collapse row',
  },
  rowDetail: {
    // The toggle has no visible text either: the name says what the press offers and
    // `aria-expanded` says whether the row's detail is open.
    toggle: 'Details',
  },
};

/*
 * The shape of the English defaults. The grid's `messages` prop takes the partial override below,
 * mapped from this type so a new entry here widens the prop without a second hand-written list:
 * a group may be replaced entry by entry, and a function entry stays a function of the same
 * signature.
 */
export type DataGridMessages = typeof messages;

type MessagesOverride<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends string | number | boolean
    ? T
    : { [K in keyof T]?: MessagesOverride<T[K]> };

export type DataGridMessagesOverride = MessagesOverride<DataGridMessages>;
