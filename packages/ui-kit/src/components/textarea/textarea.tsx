import { cx } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import styles from './textarea.module.css';

export type TextareaProps = ComponentProps<'textarea'>;

export function Textarea({ className, ...props }: TextareaProps) {
  return <textarea className={cx(styles.textarea, className)} {...props} />;
}
