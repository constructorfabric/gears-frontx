import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { cx } from 'class-variance-authority';

import styles from './checkbox.module.css';

export interface CheckboxProps extends Omit<CheckboxPrimitive.Root.Props, 'className'> {
  className?: string;
}

export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root className={cx(styles.checkbox, className)} {...props}>
      <CheckboxPrimitive.Indicator className={styles.indicator}>
        {/* Inline check/minus marks (lucide paths, ISC) — the kit carries no
         * icon dependency. CSS swaps them on the indicator's
         * data-indeterminate state. */}
        <svg
          className={cx(styles.icon, styles.iconCheck)}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <svg
          className={cx(styles.icon, styles.iconIndeterminate)}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12h14" />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
