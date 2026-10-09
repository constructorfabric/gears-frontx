import { cx } from 'class-variance-authority';

import { Spinner } from '../../spinner/public.js';
import styles from './data-grid-spinner.module.css';

interface DataGridSpinnerProps {
  className?: string;
}

/**
 * The one loader the grid draws, for the first load, for the `Suspense` fallback and for every
 * refetch overlay: a spinner that changed size between the first load and a refetch would read
 * as two different components, so there is a single size and a single place that sets it.
 *
 * It fades in after a short delay, so a load that finishes quickly never shows it. The fade is
 * on a wrapper rather than on the spinner: the spinner already runs its own rotation animation,
 * and a second `animation` declaration on the same element would replace that one.
 */
export function DataGridSpinner({ className }: DataGridSpinnerProps) {
  return (
    <span className={cx(styles.delayed, className)}>
      <Spinner size="lg" />
    </span>
  );
}
