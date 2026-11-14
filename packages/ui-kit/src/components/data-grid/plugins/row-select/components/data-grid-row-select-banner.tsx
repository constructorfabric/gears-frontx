import { Alert, AlertDescription } from '../../../../alert/public.js';
import { Link } from '../../../../link/public.js';
import { useDataGrid } from '../../../services/core/data-grid-context';
import { useDataGridMessages } from '../../../services/core/data-grid-messages-context';
import type { DataGridRowSelectPluginApi } from '../row-select-types';
import styles from './data-grid-row-select-banner.module.css';

export function DataGridRowSelectBanner() {
  const grid = useDataGrid();
  const rowSelect = grid.getPlugin<DataGridRowSelectPluginApi>('rowSelect')!;
  const messages = useDataGridMessages();

  const multiple = rowSelect.useMultiple();
  const showSelectAllMatching = rowSelect.useShowSelectAllMatching();
  const isSelectAllMatching = rowSelect.useIsSelectAllMatching();
  const isAllSelected = rowSelect.useIsAllSelected();
  const total = rowSelect.useTotalCount();
  const pageCount = rowSelect.useSelectableCount();
  const visibleCount = rowSelect.useVisibleCount();

  if (!multiple || !showSelectAllMatching) return null;

  // More records match than are loaded on this page. Compare against the loaded
  // count (not the selectable count) so a `visible`-gated single page doesn't
  // falsely offer "select all".
  const pageFull = isAllSelected && total > visibleCount;
  if (!isSelectAllMatching && !pageFull) return null;

  const content = isSelectAllMatching
    ? {
        text: messages.rowSelect.allSelected(total),
        action: messages.rowSelect.clearSelection,
        onAction: rowSelect.clearSelection,
      }
    : {
        text: messages.rowSelect.pageSelected(pageCount),
        action: messages.rowSelect.selectAll(total),
        onAction: rowSelect.selectAllMatching,
      };

  // The action sits at the end of the sentence as an inline link, but it is a button: it changes
  // the selection and goes nowhere.
  return (
    <Alert className={styles.banner}>
      <AlertDescription>
        {`${content.text} `}
        <Link render={<button type="button" className={styles.action} />} onClick={content.onAction}>
          {content.action}
        </Link>
      </AlertDescription>
    </Alert>
  );
}
