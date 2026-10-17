'use client';

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, cx, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import styles from './page-header.module.css';

/*
 * PageHeader has no Base UI primitive and no shadcn/ui counterpart: it is
 * the kit's own layout frame for the header of a page or a section - a
 * control before the text, a line above the title, content beside it, a
 * description under it and actions at the end. The frame lays out what the
 * application puts in those slots and renders no other kit component.
 * Plain styled elements, the same shape as Card and Empty (see card.tsx).
 * No `data-slot` attributes, per the kit-wide convention.
 *
 * The title is the one part that calls a hook - useRender, for its heading
 * level, the same idiom Badge and BreadcrumbLink use - and that is what
 * puts the 'use client' banner on this file.
 */

const pageHeaderVariants = cva(styles.pageHeader, {
  variants: {
    size: {
      sm: styles.sizeSm,
      default: styles.sizeDefault,
      lg: styles.sizeLg,
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

export interface PageHeaderProps
  extends ComponentProps<'header'>, VariantProps<typeof pageHeaderVariants> {
  /** Draws the rule under the header. `false` paints it transparent rather
   * than dropping it, so a header without the rule keeps the height and
   * the text position of one with it. A flag, not a variant value: it is
   * anatomy, the way Badge's `dot` is. */
  border?: boolean;
}

/** `size` is the drawn minimum height: `sm` 56, `default` 64, `lg` 80. */
export function PageHeader({ className, size, border = true, ...props }: PageHeaderProps) {
  return (
    <header
      className={cx(pageHeaderVariants({ size }), !border && styles.borderHidden, className)}
      {...props}
    />
  );
}

export type PageHeaderLeadingProps = ComponentProps<'div'>;

/** A control before the text: a back link, a view switch. */
export function PageHeaderLeading({ className, ...props }: PageHeaderLeadingProps) {
  return <div className={cx(styles.pageHeaderLeading, className)} {...props} />;
}

export type PageHeaderContentProps = ComponentProps<'div'>;

/** The text block: eyebrow, title, the content beside the title and the
 * description. Each part takes its own grid area, so where it lands does
 * not depend on which of the others are present. */
export function PageHeaderContent({ className, ...props }: PageHeaderContentProps) {
  return <div className={cx(styles.pageHeaderContent, className)} {...props} />;
}

export type PageHeaderEyebrowProps = ComponentProps<'div'>;

/** A line above the title - typically a link to the parent the page
 * belongs to. */
export function PageHeaderEyebrow({ className, ...props }: PageHeaderEyebrowProps) {
  return <div className={cx(styles.pageHeaderEyebrow, className)} {...props} />;
}

const pageHeaderTitleVariants = cva(styles.pageHeaderTitle, {
  variants: {
    typography: {
      heading: styles.typographyHeading,
      display: styles.typographyDisplay,
    },
  },
  defaultVariants: {
    typography: 'heading',
  },
});

export interface PageHeaderTitleProps
  extends useRender.ComponentProps<'h1'>, VariantProps<typeof pageHeaderTitleVariants> {}

/** The page's heading: an `h1` unless `render` names another level, such
 * as `render={<h2 />}` for a section under the page's own header.
 * `typography` picks the ramp role - `heading` (20/28) or `display`
 * (26/32), independent of the header's height. */
export function PageHeaderTitle({ className, typography, render, ...props }: PageHeaderTitleProps) {
  return useRender({
    defaultTagName: 'h1',
    render,
    props: mergeProps<'h1'>({ className: pageHeaderTitleVariants({ typography, className }) }, props),
  });
}

export type PageHeaderMetaProps = ComponentProps<'div'>;

/** Content beside the title: a badge, a status, section navigation, a
 * small action. */
export function PageHeaderMeta({ className, ...props }: PageHeaderMetaProps) {
  return <div className={cx(styles.pageHeaderMeta, className)} {...props} />;
}

export type PageHeaderDescriptionProps = ComponentProps<'div'>;

/** A short line under the title. */
export function PageHeaderDescription({ className, ...props }: PageHeaderDescriptionProps) {
  return <div className={cx(styles.pageHeaderDescription, className)} {...props} />;
}

export type PageHeaderActionsProps = ComponentProps<'div'>;

/** The row at the end of the header: buttons, menus, anything the page
 * acts with. */
export function PageHeaderActions({ className, ...props }: PageHeaderActionsProps) {
  return <div className={cx(styles.pageHeaderActions, className)} {...props} />;
}
