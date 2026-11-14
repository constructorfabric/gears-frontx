import { SearchXIcon } from 'lucide-react';

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../../empty/public.js';
import { useDataGrid } from '../services/core/data-grid-context';
import { useDataGridMessages } from '../services/core/data-grid-messages-context';
import styles from './data-grid-empty-state.module.css';

export function DataGridEmptyState() {
  const { useStore } = useDataGrid();
  const messages = useDataGridMessages();

  const hasActiveFilters = useStore((s) => s.hasActiveFilters);

  return (
    <Empty className={styles.emptyState}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>{messages.emptyState.noResultsFound}</EmptyTitle>
        {hasActiveFilters && (
          <EmptyDescription>{messages.emptyState.noResultsFoundDescription}</EmptyDescription>
        )}
      </EmptyHeader>
    </Empty>
  );
}
