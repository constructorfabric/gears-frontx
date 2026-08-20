import { Field as FieldPrimitive } from '@base-ui/react/field';
import { cx } from 'class-variance-authority';

import { Label } from '../label/label';
import styles from './field-backup.module.css';

export interface FieldBackupProps extends Omit<FieldPrimitive.Root.Props, 'className'> {
  className?: string;
}

export function FieldBackup({ className, ...props }: FieldBackupProps) {
  return <FieldPrimitive.Root className={cx(styles.field, className)} {...props} />;
}

export interface FieldBackupLabelProps extends Omit<FieldPrimitive.Label.Props, 'className'> {
  className?: string;
}

/* Renders the kit Label through Base UI Field.Label, which wires htmlFor /
 * id to the field's control automatically. */
export function FieldBackupLabel({ className, ...props }: FieldBackupLabelProps) {
  return <FieldPrimitive.Label render={<Label />} className={className} {...props} />;
}

export interface FieldBackupDescriptionProps extends Omit<FieldPrimitive.Description.Props, 'className'> {
  className?: string;
}

export function FieldBackupDescription({ className, ...props }: FieldBackupDescriptionProps) {
  return <FieldPrimitive.Description className={cx(styles.description, className)} {...props} />;
}

export interface FieldBackupErrorProps extends Omit<FieldPrimitive.Error.Props, 'className'> {
  className?: string;
}

export function FieldBackupError({ className, ...props }: FieldBackupErrorProps) {
  return <FieldPrimitive.Error className={cx(styles.error, className)} {...props} />;
}
