import { useEffect } from 'react';
import { useDataGrid, useDataGridContext } from '../services/core/data-grid-context';
import { DataGridLayoutContent } from '../services/layout/components/data-grid-layout-content';
import { DataGridLayoutMain } from '../services/layout/components/data-grid-layout-main';
import { DataGridLayoutSlot } from '../services/layout/components/data-grid-layout-slot';
import { DataGridLayoutTop } from '../services/layout/components/data-grid-layout-top';
import { LoadControlled } from './load-controlled';

export function DataGridContent() {
  const grid = useDataGrid();
  const { useStore } = grid;
  const { core } = useDataGridContext();
  const visibleRecords = useStore((s) => s.visibleRecords);

  const loadState = core.useLoadStateStore((s) => s.loadState);
  const isEmpty = visibleRecords.length === 0;

  useEffect(() => {
    // A failed first load is already handled for the user: the core load state goes to `'error'`
    // and the region below renders the error view. Letting the rejection escape as well surfaced it
    // as an unhandled rejection, which a host app's global handler reports as a crash it cannot act
    // on. Nothing subscribes to the `load:error` hook, though, so catching it without saying
    // anything would leave a failed load with no trace at all for whoever has to debug it.
    grid.init().catch((error: unknown) => {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[DataGrid] Initial load failed:', error);
      }
    });
    return () => grid.destroy();
  }, [grid]);

  return (
    <DataGridLayoutContent>
      <LoadControlled loadState={loadState}>
        <DataGridLayoutTop />
        <DataGridLayoutMain />
        {!isEmpty && <DataGridLayoutSlot name="bottom" />}
      </LoadControlled>
    </DataGridLayoutContent>
  );
}
