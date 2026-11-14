import { cx } from 'class-variance-authority';
import { GripVerticalIcon } from 'lucide-react';
import { Spinner } from '../../../../spinner/public.js';
import { useDataGrid } from '../../../services/core/data-grid-context';
import { useDataGridMessages } from '../../../services/core/data-grid-messages-context';
import { IGNORE_CLICK_ATTRIBUTE } from '../../../services/table/ignore-row-click';
import { useDataGridRecord } from '../../../services/table/data-grid-record-context';
import type { DataGridDragDropPluginApi } from '../drag-drop-types';
import styles from './data-grid-drag-drop.module.css';

export function DataGridDragDropBodyCell() {
  const grid = useDataGrid();
  const record = useDataGridRecord();
  const messages = useDataGridMessages();

  const { useDropLoadingStore } = grid.getPlugin<DataGridDragDropPluginApi>('dragDrop')!;

  const isLoading = useDropLoadingStore((s) => !!s.loading[record.id]);

  return (
    <div
      className={cx(styles.dragHandler, isLoading && styles.dragHandlerLoading)}
      {...{ [IGNORE_CLICK_ATTRIBUTE]: '' }}
      data-drag-handle=""
      aria-label={messages.dragDrop.dragHandle}
    >
      {isLoading ? <Spinner /> : <GripVerticalIcon />}
    </div>
  );
}
