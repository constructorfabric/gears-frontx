import { DataGridEmptyState } from '../../../components/data-grid-empty-state';
import { useDataGrid, useDataGridContext } from '../../core/data-grid-context';
import styles from './data-grid-layout-main.module.css';

export function DataGridLayoutMain() {
  const { useStore } = useDataGrid();
  const context = useDataGridContext();
  const visibleRecords = useStore((s) => s.visibleRecords);
  const hasActiveFilters = useStore((s) => s.hasActiveFilters);

  const activeSlotId = context.layout.useLayoutStore((state) => state.activeSlotIds.get('main'));
  const mainLayoutSlots = context.layout.useLayoutStore((state) => state.slots.get('main'));
  const activeSlot = mainLayoutSlots?.find((s) => s.id === activeSlotId);

  // Lives outside the `main` slots, so it renders in exactly the case `showMain` excludes.
  const emptySlots = context.layout.useLayoutStore((state) => state.slots.get('empty'));
  const emptySlot = emptySlots?.[0];

  const isEmpty = visibleRecords.length === 0;
  const showMain = activeSlot && (!isEmpty || hasActiveFilters);
  // Not gated on the load state. A load replaces the records in one synchronous step after the
  // fetch resolves, so `visibleRecords` never renders empty mid-flight and there is no "No results
  // found" flash to suppress -- and whatever this region holds is behind the scrim for the whole
  // load anyway. Gating it here instead unmounted the region entirely on an unfiltered empty grid,
  // where `showMain` is false too, which collapsed the grid to the toolbar's height and back.
  const showEmptyState = isEmpty;

  return (
    <div className={styles.dataGridLayoutMain}>
      {showMain && <activeSlot.component />}
      {showEmptyState && (emptySlot ? <emptySlot.component /> : <DataGridEmptyState />)}
    </div>
  );
}
