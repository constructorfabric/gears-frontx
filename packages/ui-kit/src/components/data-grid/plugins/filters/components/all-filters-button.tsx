import { FunnelIcon } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../../../badge/public.js';
import { Sheet, SheetContent } from '../../../../sheet/public.js';
import { FilterChip } from '../../../components/filter-chip';
import { useDataGrid } from '../../../services/core/data-grid-context';
import { useDataGridMessages } from '../../../services/core/data-grid-messages-context';
import { useDataGridPortalContainer } from '../../../services/core/data-grid-portal-container-context';
import { useIsTabletUp } from '../../../utils/use-is-tablet-up';
import type { DataGridFiltersPluginApi } from '../filters-types';
import styles from './all-filters-button.module.css';
import { AllFiltersDialog } from './all-filters-dialog';

export function AllFiltersButton() {
  const grid = useDataGrid();
  const filtersApi = grid.getPlugin<DataGridFiltersPluginApi>('filters')!;
  const [isOpen, setIsOpen] = useState(false);
  const isTabletUp = useIsTabletUp();
  const portalContainer = useDataGridPortalContainer();
  const messages = useDataGridMessages();

  const entities = filtersApi.useFilterEntities();
  const dialogEntities = entities.filter((e) => e.dialogFilterComponent);
  const dialogFilterKeys = dialogEntities.map((e) => e.filterKey);
  const activeCount = filtersApi.useActiveCount(dialogFilterKeys);

  function handleOpen() {
    filtersApi.resetDraftState();
    setIsOpen(true);
  }

  function handleClose() {
    setIsOpen(false);
    filtersApi.resetDraftState();
  }

  function handleApply() {
    filtersApi.applyDraftState();
    setIsOpen(false);
  }

  return (
    <>
      <FilterChip hover={isOpen} onClick={handleOpen}>
        <FunnelIcon />
        {messages.filters.allFilters}
        {activeCount > 0 && <Badge size="xs">{activeCount}</Badge>}
      </FilterChip>

      <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        {/* A panel from the side where there is room for one, from the bottom edge where not.
            Leaving it by its close button, Escape or a click outside discards the draft, and
            Apply is the way to keep it. */}
        <SheetContent
          container={portalContainer}
          side={isTabletUp ? 'right' : 'bottom'}
          closeLabel={messages.filters.closeDialog}
          className={styles.panel}
        >
          <AllFiltersDialog onApply={handleApply} />
        </SheetContent>
      </Sheet>
    </>
  );
}
