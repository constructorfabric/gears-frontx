import { OctagonAlertIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../../empty/public.js';
import { messages } from '../messages';
import type { LoadState } from '../utils/load-state';
import { DataGridSpinner } from './data-grid-spinner';
import styles from './load-controlled.module.css';

interface LoadControlledProps {
  loadState: LoadState;
  /** Rendered once the state is `loaded`. */
  children: ReactNode;
}

/**
 * Shows the grid's first load: its content when loaded, an error view when the load failed, and
 * the delayed spinner for everything else. Both stand-ins are centred in the space the grid
 * occupies. The error view has no retry: a failed first load stays failed.
 */
export function LoadControlled({ loadState, children }: LoadControlledProps) {
  if (loadState === 'loaded') {
    return <>{children}</>;
  }

  if (loadState === 'error') {
    return (
      <Empty className={styles.center}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <OctagonAlertIcon />
          </EmptyMedia>
          <EmptyTitle>{messages.loadError.headerDefault}</EmptyTitle>
          <EmptyDescription>{messages.loadError.bodyDefault}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return <DataGridSpinner className={styles.center} />;
}
