'use client';

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import { ArrowUpRight } from 'lucide-react';

import styles from './link.module.css';

/*
 * An inline anchor that inherits font size and line height from its line,
 * so it never changes the line box: the difference from
 * `buttonVariants({ variant: 'link' })`, which carries a control's height
 * and padding. `render` hands the anchor to the application's router link,
 * which keeps routing out of the kit. An explicit `variant={null}` resolves
 * to the default, as on Heading.
 */
const linkVariants = cva(styles.link, {
  variants: {
    variant: {
      default: styles.variantDefault,
      muted: styles.variantMuted,
      inherit: styles.variantInherit,
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface LinkProps
  extends useRender.ComponentProps<'a'>, VariantProps<typeof linkVariants> {
  /**
   * A link that leaves the application: opens in a new tab
   * (`target="_blank"`, `rel="noopener noreferrer"` unless the caller passes
   * its own) and appends an arrow icon hidden from assistive technology. The
   * accessible wording ("opens in a new tab") stays with the caller.
   * @default false
   */
  external?: boolean;
}

export function Link({
  className,
  variant,
  external = false,
  render,
  children,
  target,
  rel,
  ...props
}: LinkProps) {
  const resolvedVariant = variant ?? 'default';
  const externalProps = external
    ? { target: target ?? '_blank', rel: rel ?? 'noopener noreferrer' }
    : { target, rel };
  const content = external ? (
    <>
      {children}
      <ArrowUpRight aria-hidden="true" />
    </>
  ) : (
    children
  );
  return useRender({
    defaultTagName: 'a',
    render,
    props: mergeProps<'a'>(
      {
        className: linkVariants({ variant: resolvedVariant, className }),
        children: content,
        ...externalProps,
      },
      props,
    ),
  });
}

export { linkVariants };
