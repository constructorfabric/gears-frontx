'use client';

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cx } from 'class-variance-authority';

import styles from './visually-hidden.module.css';

/*
 * Text a screen reader reads and the screen does not show: the name of an
 * icon-only control, a table caption, a skip target's label. The same
 * declarations the kit repeats in several component modules, as the one public
 * copy; `sr-only` in utilities.css is the same rule for markup that is not
 * React.
 */
export type VisuallyHiddenProps = useRender.ComponentProps<'span'>;

export function VisuallyHidden({ className, render, ...props }: VisuallyHiddenProps) {
  return useRender({
    defaultTagName: 'span',
    render,
    props: mergeProps<'span'>({ className: cx(styles.visuallyHidden, className) }, props),
  });
}
