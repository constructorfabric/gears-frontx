import { cva, cx, type VariantProps } from 'class-variance-authority';
import { type ComponentProps, type MouseEvent } from 'react';

import { Button, type ButtonProps } from '../button/public.js';
import { Input, type InputProps } from '../input/public.js';
import { Textarea, type TextareaProps } from '../textarea/public.js';
import styles from './input-group.module.css';

/*
 * InputGroup composes Input/Textarea with addons into ONE visually unified
 * field: the outer group draws the field chrome (border/background/focus
 * ring), the inner control (InputGroupInput/InputGroupTextarea) draws none
 * of its own — see input-group.module.css's `.control` for how that
 * override reaches inside Input/Textarea's OWN class without editing either
 * directory (both are owned elsewhere in this port batch). Upstream's
 * equivalent styling lives in a base-vega stylesheet this port has no
 * access to (see input-group.module.css's header comment) — the group-owns-
 * the-border design below is this port's own reconstruction of the well-
 * known shadcn Input Group look (one bordered box, no seams between the
 * icon/button addons and the field), not a value copied from a source file
 * this repo doesn't have.
 */
export interface InputGroupProps extends Omit<ComponentProps<'div'>, 'className'> {
  className?: string;
}

export function InputGroup({ className, ...props }: InputGroupProps) {
  return <div role="group" className={cx(styles.group, className)} {...props} />;
}

const addonVariants = cva(styles.addon, {
  variants: {
    align: {
      'inline-start': styles.alignInlineStart,
      'inline-end': styles.alignInlineEnd,
      'block-start': styles.alignBlockStart,
      'block-end': styles.alignBlockEnd,
    },
  },
  defaultVariants: {
    align: 'inline-start',
  },
});

export interface InputGroupAddonProps
  extends Omit<ComponentProps<'div'>, 'className'>, VariantProps<typeof addonVariants> {
  className?: string;
}

export function InputGroupAddon({
  className,
  align = 'inline-start',
  onClick,
  ...props
}: InputGroupAddonProps) {
  return (
    <div
      role="group"
      data-align={align}
      className={addonVariants({ align, className })}
      onClick={(event: MouseEvent<HTMLDivElement>) => {
        // Clicking the addon's own padding (around a leading icon, say)
        // focuses the group's <input> — a bigger, friendlier hit target
        // than the input's own edge. A click that actually lands on a
        // button inside the addon (a clear/reveal action) must NOT be
        // hijacked into a focus-steal that fires ahead of — or instead of —
        // that button's own click handling. Matches upstream exactly.
        if (!(event.target as HTMLElement).closest('button')) {
          event.currentTarget.parentElement?.querySelector('input')?.focus();
        }
        onClick?.(event);
      }}
      {...props}
    />
  );
}

export interface InputGroupButtonProps extends Omit<ButtonProps, 'size' | 'type'> {
  type?: 'button' | 'submit' | 'reset';
  /**
   * Restricted to the kit's own two smallest Button sizes — upstream offers
   * `xs`/`sm`/`icon-xs`/`icon-sm`, but this kit's control-height scale has
   * no step below `sm` (32px; see theme.css's `--control-height-*`), and
   * "icon" is a derived state (Button's `icon` prop with no children), not
   * a size of its own — see button.tsx. `sm` is the closest in-group
   * default; pass `icon` with no children for a compact icon-only action.
   * @default 'sm'
   */
  size?: 'default' | 'sm';
}

export function InputGroupButton({
  type = 'button',
  variant = 'ghost',
  size = 'sm',
  className,
  ...props
}: InputGroupButtonProps) {
  return (
    <Button
      type={type}
      variant={variant}
      size={size}
      className={cx(styles.button, className)}
      {...props}
    />
  );
}

export type InputGroupTextProps = ComponentProps<'span'>;

export function InputGroupText({ className, ...props }: InputGroupTextProps) {
  return <span className={cx(styles.text, className)} {...props} />;
}

export type InputGroupInputProps = InputProps;

export function InputGroupInput({ className, ...props }: InputGroupInputProps) {
  return <Input className={cx(styles.control, className)} {...props} />;
}

export type InputGroupTextareaProps = TextareaProps;

export function InputGroupTextarea({ className, ...props }: InputGroupTextareaProps) {
  return <Textarea className={cx(styles.control, styles.textareaControl, className)} {...props} />;
}
