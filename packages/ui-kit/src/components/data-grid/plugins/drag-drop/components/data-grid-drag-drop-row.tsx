import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import {
  draggable,
  dropTargetForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { pointerOutsideOfPreview } from '@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import { attachClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { cx } from 'class-variance-authority';
import { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { TableRow } from '../../../../table/public.js';
import type { DataGridItem } from '../../../data-grid-types';
import { useDataGridContext } from '../../../services/core/data-grid-context';
import type { DataGridRecord } from '../../../services/storage/storage-types';
import { DataGridCell } from '../../../services/table/components/data-grid-cell';
import { DataGridExtraBodyColumns } from '../../../services/table/components/data-grid-extra-body-columns';
import { DataGridTableSlot } from '../../../services/table/components/data-grid-table-slot';
import { DataGridRecordProvider } from '../../../services/table/data-grid-record-context';
import { resolveBodyCellProps } from '../../../services/table/resolve-body-cell-props';
import type { DataGridTableColumn } from '../../../services/table/table-types';
import { useLatest } from '../../../utils/use-latest';
import type { DataGridDragDropPluginApi } from '../drag-drop-types';
import { buildClonedRowPreview } from '../drag-preview';
import styles from './data-grid-drag-drop.module.css';

interface DataGridDragDropRowProps<TItem extends DataGridItem> {
  record: DataGridRecord<TItem>;
}

export function DataGridDragDropRow<TItem extends DataGridItem>({
  record,
}: DataGridDragDropRowProps<TItem>) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  // The drag and drop callbacks are registered once per record id and read the record when the
  // event fires, so a refreshed record is what they see.
  const recordRef = useLatest(record);

  const [previewContainer, setPreviewContainer] = useState<HTMLElement | null>(null);

  const context = useDataGridContext<TItem>();
  const tableService = context.table;
  const columns = tableService.useVisibleColumns();
  const tableLayout = tableService.useTableLayout();
  const rowAfterSlots = tableService.useSlots('row-after');

  const { useDragDropStore, renderDragPreview } =
    context.plugins.getPlugin<DataGridDragDropPluginApi<TItem>>('dragDrop')!;

  const isDragging = useDragDropStore((s) => s.draggedRecordId === record.id);
  const isDropping = useDragDropStore((s) => s.dropTargetRecordId === record.id);
  const dropEdge = useDragDropStore((s) =>
    s.dropTargetRecordId === record.id ? s.dropEdge : undefined,
  );

  const BodyCellContent = tableService.useComponent<{
    column: DataGridTableColumn<TItem>;
    item: TItem;
  }>('body-cell-content');

  useEffect(() => {
    if (!rowRef.current) return;

    const handleEl = rowRef.current.querySelector<HTMLElement>('[data-drag-handle]');

    return combine(
      draggable({
        element: rowRef.current,
        dragHandle: handleEl ?? undefined,
        getInitialData: () => ({
          type: 'data-grid-row',
          pluginStore: useDragDropStore,
          recordId: recordRef.current.id,
          record: recordRef.current,
        }),
        onGenerateDragPreview: ({ nativeSetDragImage }) => {
          setCustomNativeDragPreview({
            nativeSetDragImage,
            getOffset: pointerOutsideOfPreview({ x: '8px', y: '8px' }),
            render: ({ container }) => {
              if (renderDragPreview) {
                // Render the consumer's preview inside the live React tree (so it
                // keeps context); flushSync commits the portal before the browser
                // snapshots the preview image.
                flushSync(() => setPreviewContainer(container));
                return () => setPreviewContainer(null);
              }
              const row = rowRef.current;
              if (!row) return undefined;
              container.appendChild(buildClonedRowPreview(row, styles.dragPreview));
              return undefined;
            },
          });
        },
      }),
      dropTargetForElements({
        element: rowRef.current,
        canDrop: ({ source }) =>
          source.data.pluginStore === useDragDropStore &&
          source.data.recordId !== recordRef.current.id,
        getData: ({ input, element }) =>
          attachClosestEdge(
            {
              type: 'data-grid-row',
              recordId: recordRef.current.id,
              record: recordRef.current,
            },
            { input, element, allowedEdges: ['top', 'bottom'] },
          ),
      }),
    );
  }, [record.id, useDragDropStore, renderDragPreview, recordRef]);

  return (
    <DataGridRecordProvider value={record}>
      <TableRow
        ref={rowRef}
        className={cx(
          styles.dragRow,
          isDragging && styles.dragRowDragging,
          isDropping && styles.dragRowDropping,
          dropEdge === 'top' && styles.dragRowDropIndicatorTop,
          dropEdge === 'bottom' && styles.dragRowDropIndicatorBottom,
        )}
      >
        <DataGridExtraBodyColumns position="start" />
        {columns.map((col) => {
          const dynamicClassName = col.getClassName?.(record.item);
          const bodyCellProps = resolveBodyCellProps(col, record.item, tableLayout);

          return (
            <DataGridCell<TItem>
              key={col.id}
              columnId={col.id}
              className={dynamicClassName}
              {...bodyCellProps}
            >
              <BodyCellContent column={col} item={record.item} />
            </DataGridCell>
          );
        })}
        <DataGridExtraBodyColumns position="end" />
      </TableRow>
      <DataGridTableSlot slots={rowAfterSlots} />
      {previewContainer && renderDragPreview
        ? createPortal(renderDragPreview(record.item), previewContainer)
        : null}
    </DataGridRecordProvider>
  );
}
