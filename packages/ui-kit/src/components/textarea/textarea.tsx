import { Field as FieldPrimitive } from '@base-ui/react/field';
import { cx } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import styles from './textarea.module.css';

export type TextareaProps = ComponentProps<'textarea'>;

/* Rendered through Field.Control so a surrounding Field wires the label,
 * aria-describedby, and validation state — same as Input. Outside a Field
 * the control falls back to Base UI's no-op context. */
export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <FieldPrimitive.Control render={<textarea className={cx(styles.textarea, className)} {...props} />} />
  );
}
