import { Field as FieldPrimitive } from '@base-ui/react/field';
import { cx } from 'class-variance-authority';

import { Label } from '../label/label';
import styles from './field.module.css';

export interface FieldProps extends Omit<FieldPrimitive.Root.Props, 'className'> {
  className?: string;
}

export function Field({ className, ...props }: FieldProps) {
  return <FieldPrimitive.Root className={cx(styles.field, className)} {...props} />;
}

export interface FieldLabelProps extends Omit<FieldPrimitive.Label.Props, 'className'> {
  className?: string;
}

/* Renders the kit Label through Base UI Field.Label, which wires htmlFor /
 * id to the field's control automatically. */
export function FieldLabel({ className, ...props }: FieldLabelProps) {
  return <FieldPrimitive.Label render={<Label />} className={className} {...props} />;
}

export interface FieldDescriptionProps extends Omit<FieldPrimitive.Description.Props, 'className'> {
  className?: string;
}

export function FieldDescription({ className, ...props }: FieldDescriptionProps) {
  return <FieldPrimitive.Description className={cx(styles.description, className)} {...props} />;
}

export interface FieldErrorProps extends Omit<FieldPrimitive.Error.Props, 'className'> {
  className?: string;
}

export function FieldError({ className, ...props }: FieldErrorProps) {
  return <FieldPrimitive.Error className={cx(styles.error, className)} {...props} />;
}
