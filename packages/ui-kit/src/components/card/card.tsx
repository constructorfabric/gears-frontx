'use client';

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, cx, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import styles from './card.module.css';

/*
 * Card has no Base UI primitive (registry/base-vega ships plain `div`s with
 * data-slot markers) — this is a pure styling translation over native
 * elements, same shape as Dialog's Header/Footer/Title/Description.
 *
 * Card and CardTitle take `render` through Base UI's `useRender`/`mergeProps`
 * (as Item does), so a whole card can be a link and a title a real heading.
 * Without `render` the markup is the same `div` with the same classes. The
 * hook is why this module ships `'use client'`.
 */

const cardVariants = cva(styles.card, {
  variants: {
    size: {
      default: styles.sizeDefault,
      sm: styles.sizeSm,
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

export type CardProps = useRender.ComponentProps<'div'> & VariantProps<typeof cardVariants>;

/*
 * A Card rendered as a link or a button (`render={<a href />}`) also takes
 * `.interactive`: the UA link and button styling reset, and the hover and
 * focus states Item draws. A plain card never gains a hover.
 */
export function Card({ className, size, render, ...props }: CardProps) {
  return useRender({
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(
      { className: cardVariants({ size, className: cx(render && styles.interactive, className) }) },
      props,
    ),
  });
}

export type CardHeaderProps = ComponentProps<'div'>;

export function CardHeader({ className, ...props }: CardHeaderProps) {
  return <div className={cx(styles.cardHeader, className)} {...props} />;
}

/*
 * The typography axis, shared by the two text parts: `default` is the
 * card's own ramp and `panel` the denser pair a drawn panel header uses.
 * Two recipes rather than one, because the two parts step onto different
 * roles; the axis name and its values are the same on both, so a caller
 * sets the same word on each.
 */
const cardTitleVariants = cva(styles.cardTitle, {
  variants: {
    typography: {
      default: styles.typographyDefault,
      panel: styles.typographyPanel,
    },
  },
  defaultVariants: {
    typography: 'default',
  },
});

const cardDescriptionVariants = cva(styles.cardDescription, {
  variants: {
    typography: {
      default: styles.typographyDefault,
      panel: styles.typographyPanel,
    },
  },
  defaultVariants: {
    typography: 'default',
  },
});

export type CardTitleProps = useRender.ComponentProps<'div'> &
  VariantProps<typeof cardTitleVariants>;

/*
 * With `render` (a heading, typically) the element also takes
 * `.renderedTitle`, which resets the UA heading margins and font at zero
 * specificity, so the title class still decides how it looks.
 */
export function CardTitle({ className, typography, render, ...props }: CardTitleProps) {
  return useRender({
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(
      {
        className: cardTitleVariants({
          typography,
          className: cx(render && styles.renderedTitle, className),
        }),
      },
      props,
    ),
  });
}

export type CardDescriptionProps = ComponentProps<'div'> &
  VariantProps<typeof cardDescriptionVariants>;

export function CardDescription({ className, typography, ...props }: CardDescriptionProps) {
  return <div className={cardDescriptionVariants({ typography, className })} {...props} />;
}

/** Positions in the header's second column, spanning both its rows (see CSS). */
export type CardActionProps = ComponentProps<'div'>;

export function CardAction({ className, ...props }: CardActionProps) {
  return <div className={cx(styles.cardAction, className)} {...props} />;
}

export type CardContentProps = ComponentProps<'div'>;

export function CardContent({ className, ...props }: CardContentProps) {
  return <div className={cx(styles.cardContent, className)} {...props} />;
}

export type CardFooterProps = ComponentProps<'div'>;

export function CardFooter({ className, ...props }: CardFooterProps) {
  return <div className={cx(styles.cardFooter, className)} {...props} />;
}
