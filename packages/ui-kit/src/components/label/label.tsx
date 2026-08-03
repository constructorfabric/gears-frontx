import { cx } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import styles from './label.module.css';

export type LabelProps = ComponentProps<'label'>;

export function Label({ className, ...props }: LabelProps) {
  return <label className={cx(styles.label, className)} {...props} />;
}
