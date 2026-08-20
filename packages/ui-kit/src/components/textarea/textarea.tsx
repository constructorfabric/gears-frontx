import { cx } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import styles from './textarea.module.css';

export type TextareaProps = ComponentProps<'textarea'>;

/*
 * A plain styled native <textarea> — matching upstream shadcn/ui's base
 * Textarea, which is a passthrough with no primitive of its own (see
 * registry/bases/base/ui/textarea.tsx). Previously rendered through Base
 * UI's Field.Control for automatic Field wiring; that wrapper is gone now
 * that the canonical `Field` (field.tsx) is itself primitive-free and
 * wires nothing automatically — wire `id`/`aria-describedby` by hand, the
 * same way every other control inside the new `Field` does (see field.md).
 * `Input` keeps its own Base UI primitive and still auto-wires inside
 * `FieldBackup` — Textarea never did have a primitive to lean on for that.
 */
export function Textarea({ className, ...props }: TextareaProps) {
  return <textarea className={cx(styles.textarea, className)} {...props} />;
}
