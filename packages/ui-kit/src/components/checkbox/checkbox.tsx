import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { cx } from 'class-variance-authority';
import { CheckIcon, MinusIcon } from 'lucide-react';

import styles from './checkbox.module.css';

/*
 * One control box, 16, which is what the design spec draws. There is no
 * size axis: a prop with a single value is worse than no prop, and the kit
 * is pre-1.0. The drawn 32px interaction row is wider and taller than that
 * box on purpose, so a checkbox in a dense row is no harder to hit.
 */
export interface CheckboxProps extends Omit<CheckboxPrimitive.Root.Props, 'className'> {
  className?: string;
}

export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root className={cx(styles.checkbox, className)} {...props}>
      <CheckboxPrimitive.Indicator className={styles.indicator}>
        {/* Both marks are always in the DOM; CSS swaps which one shows on the
         * indicator's data-indeterminate state. */}
        <CheckIcon className={cx(styles.icon, styles.iconCheck)} />
        <MinusIcon className={cx(styles.icon, styles.iconIndeterminate)} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
