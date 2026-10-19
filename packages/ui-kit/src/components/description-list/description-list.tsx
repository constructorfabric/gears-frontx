import { cva, cx, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import styles from './description-list.module.css';

/*
 * A list of name and value pairs on real `dl`/`dt`/`dd`, so assistive
 * technology keeps the term-to-value relation. `DescriptionListItem` is the
 * `div` grouping HTML allows inside `dl`, so a row can carry a separator
 * or a key. No `render` on the parts: the elements are the point of the
 * component. `orientation` has the values and meaning of Field's.
 */
const descriptionListVariants = cva(styles.descriptionList, {
  variants: {
    orientation: {
      vertical: styles.orientationVertical,
      horizontal: styles.orientationHorizontal,
    },
    size: {
      default: styles.sizeDefault,
      sm: styles.sizeSm,
    },
  },
  defaultVariants: {
    orientation: 'vertical',
    size: 'default',
  },
});

// The value's ramp role, named `typography` as on Text.
const descriptionDetailsVariants = cva(styles.descriptionDetails, {
  variants: {
    typography: {
      body: styles.typographyBody,
      mono: styles.typographyMono,
    },
  },
  defaultVariants: {
    typography: 'body',
  },
});

export interface DescriptionListProps
  extends ComponentProps<'dl'>, VariantProps<typeof descriptionListVariants> {}

export function DescriptionList({ className, orientation, size, ...props }: DescriptionListProps) {
  return (
    <dl
      className={descriptionListVariants({
        orientation: orientation ?? 'vertical',
        size: size ?? 'default',
        className,
      })}
      {...props}
    />
  );
}

export type DescriptionListItemProps = ComponentProps<'div'>;

export function DescriptionListItem({ className, ...props }: DescriptionListItemProps) {
  return <div className={cx(styles.descriptionItem, className)} {...props} />;
}

export type DescriptionListTermProps = ComponentProps<'dt'>;

export function DescriptionListTerm({ className, ...props }: DescriptionListTermProps) {
  return <dt className={cx(styles.descriptionTerm, className)} {...props} />;
}

export interface DescriptionListDetailsProps
  extends ComponentProps<'dd'>, VariantProps<typeof descriptionDetailsVariants> {}

export function DescriptionListDetails({
  className,
  typography,
  ...props
}: DescriptionListDetailsProps) {
  return (
    <dd
      className={descriptionDetailsVariants({ typography: typography ?? 'body', className })}
      {...props}
    />
  );
}
