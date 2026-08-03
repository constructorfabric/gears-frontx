import { Input as InputPrimitive } from '@base-ui/react/input';
import { cx } from 'class-variance-authority';

import styles from './input.module.css';

export interface InputProps extends Omit<InputPrimitive.Props, 'className'> {
  className?: string;
}

export function Input({ className, ...props }: InputProps) {
  return <InputPrimitive className={cx(styles.input, className)} {...props} />;
}
