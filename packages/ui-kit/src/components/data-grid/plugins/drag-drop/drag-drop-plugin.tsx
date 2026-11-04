// Load-bearing: a plugin is rendered as a child of <DataGrid>, so a Server Component can import
// and render it, and the component it returns calls hooks. This directive puts the banner on the
// plugin's own entry chunk (dist/data-grid/<plugin>.js). client-boundaries.test.ts only scans a
// component's top-level files, so scripts/verify-consumer.sh is what checks the built banner of
// every plugin entry.
'use client';

import { create } from 'zustand';
// The `.js` on the type imports below is for the shipped declaration file: this file's
// `createDataGridDragDropPlugin(config: DataGridDragDropPluginProps)` is a signature a consumer
// types a callback by, and `moduleResolution: "nodenext"` rejects an extensionless relative
// specifier in it, which turns the parameter into an untyped one.
import type { DataGridItem } from '../../data-grid-types.js';
import { createDataGridPlugin } from '../../services/plugins/plugins-helpers';
import type { DataGridItemId, DataGridRecord } from '../../services/storage/storage-types.js';
import { DataGridDragDropBodyCell } from './components/data-grid-drag-drop-body-cell';
import { DataGridDragDropContent } from './components/data-grid-drag-drop-content';
import { DataGridDragDropRow } from './components/data-grid-drag-drop-row';
import type {
  DataGridDragDropPluginApi,
  DataGridDragDropPluginProps,
  DataGridDragDropState,
  DataGridDropLoadingState,
} from './drag-drop-types.js';

/**
 * Creates a drag-and-drop plugin component for reordering a DataGrid's rows. It is a factory
 * because the callbacks are the plugin's own configuration, not props of the component it
 * returns: create it once, outside render, and render the result as a child of the grid.
 */
export function createDataGridDragDropPlugin<TItem extends DataGridItem = DataGridItem>(
  config: DataGridDragDropPluginProps<TItem>,
) {
  return createDataGridPlugin<TItem, 'dragDrop', Record<string, never>, DataGridDragDropPluginApi<TItem>>(
    'dragDrop',
    (context) => {
      const useDragDropStore = create<DataGridDragDropState>(() => ({
        isDragging: false,
        draggedRecordId: undefined,
        dropTargetRecordId: undefined,
        dropEdge: undefined,
        isRootDropTarget: false,
      }));

      const useDropLoadingStore = create<DataGridDropLoadingState>(() => ({
        loading: {},
      }));

      context.registerComponent('content', DataGridDragDropContent);
      context.registerExtraColumn({
        id: 'drag-drop',
        body: DataGridDragDropBodyCell,
        position: 'start',
        order: 0,
        width: '37px',
      });
      context.registerComponent('row', DataGridDragDropRow);

      return {
        renderDragPreview: config.renderDragPreview,
        useDragDropStore,
        useDropLoadingStore,
        setDropLoading,
        clearDropLoading,
        handleDrop,
      };

      function setDropLoading(id: DataGridItemId, value: boolean) {
        useDropLoadingStore.setState((state) => ({ loading: { ...state.loading, [id]: value } }));
      }

      function clearDropLoading(id: DataGridItemId) {
        useDropLoadingStore.setState((state) => {
          const next = { ...state.loading };
          delete next[id];
          return { loading: next };
        });
      }

      function handleDrop(
        sourceRecord: DataGridRecord<TItem>,
        targetRecord: DataGridRecord<TItem> | undefined,
      ) {
        executeHandleDrop({
          sourceRecord,
          targetRecord,
          onDrop: (item, target) => config.onDrop({ ...context, item, target }),
          setDropLoading,
          clearDropLoading,
        });
      }
    },
  );
}

/** @internal Extracted for testability. */
export function executeHandleDrop<TItem extends DataGridItem>({
  sourceRecord,
  targetRecord,
  onDrop,
  setDropLoading,
  clearDropLoading,
}: {
  sourceRecord: Pick<DataGridRecord<TItem>, 'id' | 'item'>;
  targetRecord: Pick<DataGridRecord<TItem>, 'item'> | undefined;
  onDrop: (item: TItem, target: TItem | null) => void | Promise<void>;
  setDropLoading: (id: DataGridItemId, value: boolean) => void;
  clearDropLoading: (id: DataGridItemId) => void;
}) {
  const target = targetRecord?.item ?? null;
  let drop: void | Promise<void>;
  try {
    drop = onDrop(sourceRecord.item, target);
  } catch (error) {
    // Thrown out of the library's drop handler, it would leave the library mid-drag, so no
    // later drag starts; it is reported on its own instead.
    queueMicrotask(() => {
      throw error;
    });
    return;
  }

  if (drop instanceof Promise) {
    setDropLoading(sourceRecord.id, true);
    drop
      .catch(() => {
        // Swallow rejection — cleanup happens in finally
      })
      .finally(() => {
        clearDropLoading(sourceRecord.id);
      });
  }
}
