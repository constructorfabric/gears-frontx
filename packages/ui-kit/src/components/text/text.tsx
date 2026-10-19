'use client';

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';

import styles from './text.module.css';

/*
 * Text on the kit's type ramp: `typography` is the ramp role (size, line
 * height, weight and tracking come together, so they are one axis) and
 * `tone` the colour. The axis is named `typography` as on Heading and
 * CardTitle. The default element is `p`; `render` swaps it (a `span` inside
 * a row, a `code` for a path). No lead, overline or uppercase roles: they
 * are not ramp roles.
 */
const textVariants = cva(styles.text, {
  variants: {
    typography: {
      body: styles.typographyBody,
      label: styles.typographyLabel,
      meta: styles.typographyMeta,
      mono: styles.typographyMono,
      micro: styles.typographyMicro,
    },
    tone: {
      default: styles.toneDefault,
      muted: styles.toneMuted,
    },
  },
  defaultVariants: {
    typography: 'body',
    tone: 'default',
  },
});

export interface TextProps extends useRender.ComponentProps<'p'>, VariantProps<typeof textVariants> {}

export function Text({ className, typography, tone, render, ...props }: TextProps) {
  // An explicit `null` resolves to the default, as on Heading.
  const resolvedTypography = typography ?? 'body';
  const resolvedTone = tone ?? 'default';
  return useRender({
    defaultTagName: 'p',
    render,
    props: mergeProps<'p'>(
      {
        className: textVariants({ typography: resolvedTypography, tone: resolvedTone, className }),
      },
      props,
    ),
  });
}

export { textVariants };
