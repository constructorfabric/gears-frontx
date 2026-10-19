'use client';

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';

import styles from './heading.module.css';

/*
 * A heading on the kit's type ramp: `typography` picks the ramp role and
 * `render` picks the element, so the document outline (h1 to h6) and the
 * look stay independent. The axis is named `typography`, as on CardTitle,
 * because it picks a set of ramp tokens, not a box size. No Base UI
 * primitive: `render` polymorphism comes from `useRender`/`mergeProps`, as
 * in StatusDot, Badge and Item. Margins are zero; spacing belongs to the
 * layout that places the heading.
 */
const headingVariants = cva(styles.heading, {
  variants: {
    typography: {
      display: styles.typographyDisplay,
      'heading-1': styles.typographyHeading1,
      'heading-2': styles.typographyHeading2,
    },
  },
  defaultVariants: {
    typography: 'heading-1',
  },
});

export interface HeadingProps
  extends useRender.ComponentProps<'h2'>, VariantProps<typeof headingVariants> {}

export function Heading({ className, typography, render, ...props }: HeadingProps) {
  // cva reads an explicit `null` as "emit no class"; resolved here so
  // `typography={null}` lands on the default role, as StatusDot and Item do.
  const resolvedTypography = typography ?? 'heading-1';
  return useRender({
    defaultTagName: 'h2',
    render,
    props: mergeProps<'h2'>(
      { className: headingVariants({ typography: resolvedTypography, className }) },
      props,
    ),
  });
}

export { headingVariants };
