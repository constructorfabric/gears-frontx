export { DataTable, type DataTableProps } from './data-table'
export { DataTablePagination, type DataTablePaginationProps } from './data-table-pagination'
export { DataTableColumnHeader, type DataTableColumnHeaderProps } from './data-table-column-header'
export { DataTableViewOptions, type DataTableViewOptionsProps } from './data-table-view-options'

// Re-export useful types from @tanstack/react-table
export {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  type Row,
  type Table,
  type Column,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
