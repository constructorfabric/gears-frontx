import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import { cva, type VariantProps } from 'class-variance-authority';

import styles from './switch.module.css';

const switchVariants = cva(styles.switch, {
  variants: {
    size: {
      default: styles.sizeDefault,
      sm: styles.sizeSm,
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

export interface SwitchProps
  extends Omit<SwitchPrimitive.Root.Props, 'className'>, VariantProps<typeof switchVariants> {
  className?: string;
}

export function Switch({ className, size, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root className={switchVariants({ size, className })} {...props}>
      <SwitchPrimitive.Thumb className={styles.thumb} />
    </SwitchPrimitive.Root>
  );
}
