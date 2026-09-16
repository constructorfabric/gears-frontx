import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { cva, cx, type VariantProps } from 'class-variance-authority';
import { CheckIcon, MinusIcon } from 'lucide-react';

import styles from './checkbox.module.css';

/*
 * The two control boxes the design spec draws, 16 and 20. The axis is
 * geometry only: both steps keep the same radius, the same 12px glyph and
 * the same 32px interaction row, so a small checkbox in a dense table row
 * is no harder to hit than a default one in a form.
 */
const checkboxVariants = cva(styles.checkbox, {
  variants: {
    size: {
      sm: styles.sizeSm,
      default: styles.sizeDefault,
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

export interface CheckboxProps
  extends Omit<CheckboxPrimitive.Root.Props, 'className'>, VariantProps<typeof checkboxVariants> {
  className?: string;
}

export function Checkbox({ className, size, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root className={checkboxVariants({ size, className })} {...props}>
      <CheckboxPrimitive.Indicator className={styles.indicator}>
        {/* Both marks are always in the DOM; CSS swaps which one shows on the
         * indicator's data-indeterminate state. */}
        <CheckIcon className={cx(styles.icon, styles.iconCheck)} />
        <MinusIcon className={cx(styles.icon, styles.iconIndeterminate)} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
