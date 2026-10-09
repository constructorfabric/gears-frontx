import { useDataGrid } from '../../../services/core/data-grid-context';
import type { PaginationPluginApi } from '../pagination-plugin';
import styles from './data-grid-pagination.module.css';
import { Pager } from './pager';

export function DataGridPagination() {
  const grid = useDataGrid();

  const paginationPlugin = grid.getPlugin<PaginationPluginApi>('pagination')!;

  // Reactive selectors
  const limits = paginationPlugin.useConfigStore((s) => s.limits);
  const autoHide = paginationPlugin.useConfigStore((s) => s.autoHide);
  const page = paginationPlugin.usePaginationStore((s) => s.page);
  const limit = paginationPlugin.usePaginationStore((s) => s.limit);
  const total = paginationPlugin.usePaginationStore((s) => s.total);

  const { setPage, setLimit } = paginationPlugin;

  return (
    <div className={styles.dataGridPagination}>
      <Pager
        page={page}
        limit={limit}
        total={total}
        limits={limits}
        autoHide={autoHide}
        onPageChange={setPage}
        onLimitChange={setLimit}
      />
    </div>
  );
}
