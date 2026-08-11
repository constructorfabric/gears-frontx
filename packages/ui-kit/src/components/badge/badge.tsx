import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import { Children, type ReactNode } from 'react';

import styles from './badge.module.css';

/*
 * Badge has no Base UI primitive component, but it still gets `render`-prop
 * polymorphism — from `useRender`/`mergeProps`, the same utilities Base UI's
 * primitives are built on. A status badge is usually static, but rendered as
 * a link via `render` it stays focusable and gets the focus ring below.
 *
 * The variant model follows the F-mockups' Badge/Status ("pill or dot;
 * semantic intent only"), which retires the shadcn-inherited
 * default/secondary/destructive/outline/ghost/link list: a badge states
 * *what kind* of thing it marks, not how to paint it. That semantic-only
 * rule is real, but it lives in badge.md and in the VALUE names — the prop
 * itself keeps the kit-wide `variant` name rather than an axis name of its
 * own, so every component in the kit is driven the same way.
 *
 * `shape`, not `size`: the two values are pill vs. plain (bare text, no
 * fill), and Badge has no size axis at all (the pill is a fixed 24px).
 * Not `form` either — that is a real HTML attribute, so a styling prop by
 * that name would shadow it for anyone rendering a form-associated element
 * via `render`. The status dot and the icon slot are opt-in props, not
 * shape values — both shapes can carry either.
 */
const badgeVariants = cva(styles.badge, {
  variants: {
    variant: {
      success: styles.variantSuccess,
      warning: styles.variantWarning,
      info: styles.variantInfo,
      danger: styles.variantDanger,
      muted: styles.variantMuted,
    },
    shape: {
      pill: styles.shapePill,
      plain: styles.shapePlain,
    },
  },
  defaultVariants: {
    variant: 'muted',
    shape: 'pill',
  },
});

export interface BadgeProps
  extends useRender.ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  /**
   * Show the status dot, painted in the variant's accent color. Off by
   * default; ignored when `icon` is present — the icon takes its place.
   */
  dot?: boolean;
  /**
   * Leading icon slot — decorative (`aria-hidden`), fixed 12px, painted in
   * the variant's accent color like the dot it replaces. Wins over `dot`
   * when both are set.
   */
  icon?: ReactNode;
}

export function Badge({ className, variant, shape, dot, icon, render, children, ...props }: BadgeProps) {
  // `icon != null` is true for `icon={false}` — a valid ReactNode that
  // renders nothing — which is exactly what `icon={cond && <Icon/>}` passes
  // when `cond` is false. Same predicate as Button's `hasLabel`, applied to
  // a slot instead of children: it answers "is this renderable" rather than
  // "is this set".
  const hasIcon = Children.toArray(icon).some((child) => child !== '');
  return useRender({
    defaultTagName: 'span',
    render,
    /*
     * The derived attribute and the composed children are layered on top of
     * the merged props, NOT passed through mergeProps: they must win over a
     * caller's own `data-dot` (same shadow-proofing as Button's
     * `data-loading`), and mergeProps types its arguments as the closed DOM
     * attribute set, which rejects a `data-*` key in an object literal.
     * `useRender`'s own `props` takes `Record<string, unknown>`, so the
     * spread below type-checks while keeping the ordering that matters.
     */
    props: {
      ...mergeProps<'span'>({ className: badgeVariants({ variant, shape, className }) }, props),
      'data-dot': (dot && !hasIcon) || undefined,
      children: (
        <>
          {hasIcon && (
            <span className={styles.icon} aria-hidden="true">
              {icon}
            </span>
          )}
          {children}
        </>
      ),
    },
  });
}
