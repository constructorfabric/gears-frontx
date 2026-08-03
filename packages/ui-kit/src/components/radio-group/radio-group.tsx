import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { cx } from 'class-variance-authority';

import styles from './radio-group.module.css';

export interface RadioGroupProps extends Omit<RadioGroupPrimitive.Props, 'className'> {
  className?: string;
}

export function RadioGroup({ className, ...props }: RadioGroupProps) {
  return <RadioGroupPrimitive className={cx(styles.group, className)} {...props} />;
}

export interface RadioGroupItemProps extends Omit<RadioPrimitive.Root.Props, 'className'> {
  className?: string;
}

export function RadioGroupItem({ className, ...props }: RadioGroupItemProps) {
  return (
    <RadioPrimitive.Root className={cx(styles.item, className)} {...props}>
      <RadioPrimitive.Indicator className={styles.indicator}>
        <span className={styles.dot} />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  );
}
