import type { ReactNode } from 'react';
import { DataGridSpinner } from '../../../components/data-grid-spinner';
import rootStyles from '../../../data-grid.module.css';
import { useDataGridContext } from '../../core/data-grid-context';
import { useDataGridLoading } from '../../load/use-data-grid-loading';
import styles from './data-grid-layout-content.module.css';

interface DataGridLayoutContentProps {
  children: ReactNode;
}

export function DataGridLayoutContent({ children }: DataGridLayoutContentProps) {
  const context = useDataGridContext();
  const initialLoadState = context.core.useLoadStateStore((s) => s.loadState);
  const isLoading = useDataGridLoading();

  // The first load already renders a centred loader in place of the grid, so the overlay stays out
  // until there is content to cover. Without this gate the two would run at once.
  const showOverlay = isLoading && initialLoadState === 'loaded';
  // Tracks the feedback that is actually on screen -- the overlay, or the first load's centred
  // loader -- rather than the raw loading flag. `'error'` latches for the lifetime of the grid and
  // swaps the whole region for the error view, so reading the flag directly announced a busy grid
  // to a screen reader while sighted users saw an error and nothing running.
  const isBusy = showOverlay || initialLoadState === 'loading';

  return (
    <div className={rootStyles.root} aria-busy={isBusy ? 'true' : undefined}>
      {children}
      {showOverlay && (
        <div className={styles.loaderOverlay}>
          <DataGridSpinner />
        </div>
      )}
    </div>
  );
}
