import { useSyncExternalStore } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import { TableCell, TableRow } from '../../../../table/public.js';
import type { DataGridItem } from '../../../data-grid-types';
import { useDataGrid } from '../../../services/core/data-grid-context';
import { useDataGridRecord } from '../../../services/table/data-grid-record-context';
import { useTableService } from '../../../services/table/table-context';
import type { DataGridDragDropPluginApi, DataGridDragDropState } from '../../drag-drop/drag-drop-types';
import type { DataGridRowDetailPluginApi } from '../row-detail-types';
import styles from './data-grid-row-detail.module.css';

function subscribeToNothing() {
  return () => {};
}

function getNotDragging() {
  return false;
}

// The store, not the plugin API: the API is generic in the grid's item, and a callback property of
// its makes it invariant, while the store's shape does not depend on the item at all.
function readIsDragging(store: UseBoundStore<StoreApi<DataGridDragDropState>>) {
  return () => store.getState().isDragging;
}

export function DataGridRowDetailRow<TItem extends DataGridItem>() {
  const grid = useDataGrid<TItem>();
  const record = useDataGridRecord<TItem>();
  const tableService = useTableService<TItem>();
  const rowDetail = grid.getPlugin<DataGridRowDetailPluginApi<TItem>>('rowDetail')!;

  const isOpen = rowDetail.useIsOpen(record.id);
  const render = rowDetail.useRender();
  // Read before the early return below: a hook called only by an open detail would change this
  // component's hook order when a detail opens.
  const name = rowDetail.useName(record.item);

  // The drag and drop plugin can mount after this row did, so its state is read through
  // useSyncExternalStore with a no-op stand-in while the plugin is absent, the way
  // useColumnAriaSort reads the order plugin: the hooks called stay the same whoever mounts late.
  const dragDrop = grid.getPlugin<DataGridDragDropPluginApi<TItem>>('dragDrop');
  const isDragging = useSyncExternalStore(
    dragDrop?.useDragDropStore.subscribe ?? subscribeToNothing,
    dragDrop ? readIsDragging(dragDrop.useDragDropStore) : getNotDragging,
  );

  // All three lists are read reactively, so hiding a column in the table configuration panel or
  // adding row actions moves the span with them.
  const visibleColumns = tableService.useVisibleColumns();
  const startColumns = tableService.useExtraColumns('start');
  const endColumns = tableService.useExtraColumns('end');

  if (!isOpen || !render) {
    return null;
  }

  const colSpan = visibleColumns.length + startColumns.length + endColumns.length;

  // A drag hides the open details rather than unmounting them, so a drop always lands on a record
  // row while what a detail holds (a draft, a loaded request) survives the drag, and the toggle's
  // `aria-controls` still points at an element that exists. `hidden` takes the row out of layout
  // and hit testing alike.
  return (
    <TableRow className={styles.detailRow} hidden={isDragging}>
      <TableCell colSpan={colSpan}>
        <div
          id={rowDetail.regionId(record.id)}
          role="group"
          aria-label={name}
          className={styles.detailContent}
        >
          {render(record.item)}
        </div>
      </TableCell>
    </TableRow>
  );
}
