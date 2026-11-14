import { cx } from 'class-variance-authority';
import { XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '../../../../accordion/public.js';
import { Badge } from '../../../../badge/public.js';
import { useDataGrid } from '../../../services/core/data-grid-context';
import { useDataGridMessages } from '../../../services/core/data-grid-messages-context';
import type { DataGridFilterEntity, DataGridFiltersPluginApi } from '../filters-types';
import styles from './dialog-filter-item.module.css';
import { FilterLabel } from './filter-label';

interface DialogFilterItemProps {
  filterEntity: DataGridFilterEntity;
  children: ReactNode;
}

export function DialogFilterItem({ filterEntity, children }: DialogFilterItemProps) {
  const grid = useDataGrid();
  const filtersApi = grid.getPlugin<DataGridFiltersPluginApi>('filters')!;
  const messages = useDataGridMessages();

  const draftState = filtersApi.useDraftState(filterEntity.filterKey);
  const count = getDraftActiveCount(draftState?.value, filtersApi.isFilterValueActive);

  function handleClear() {
    filtersApi.setDraftState(filterEntity.filterKey, { value: undefined });
  }

  return (
    <AccordionItem>
      <div className={styles.header}>
        <AccordionTrigger>
          <span className={cx(count > 0 && styles.titleWithActions)}>
            <FilterLabel filterEntity={filterEntity} />
          </span>
        </AccordionTrigger>
        {count > 0 && (
          <span className={styles.actions}>
            <Badge>
              {count}
              <button
                type="button"
                className={styles.tagClose}
                aria-label={messages.filters.close}
                onClick={handleClear}
              >
                <XIcon />
              </button>
            </Badge>
          </span>
        )}
      </div>
      <AccordionContent>{children}</AccordionContent>
    </AccordionItem>
  );
}

/**
 * Number of active selections in a section's draft value: the length for multi-select
 * (array) filters, 1 for an active single value, 0 otherwise. Drives the header count
 * badge; the badge is hidden when 0.
 */
function getDraftActiveCount(value: unknown, isFilterValueActive: (value: unknown) => boolean) {
  if (Array.isArray(value)) return value.length;

  return isFilterValueActive(value) ? 1 : 0;
}
