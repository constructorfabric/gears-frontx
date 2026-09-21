'use client';

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

import styles from './status-dot.module.css';

/*
 * An inline status indicator: a round dot plus an optional label, both in
 * the tone's own colour. No Base UI primitive, but it still gets
 * `render`-prop polymorphism from `useRender`/`mergeProps` - the same
 * utilities Badge and Marker use - for the case a consumer needs the dot
 * as something other than a `span`, e.g. an `<li>` in a status list. That
 * is layout, not action: the design spec still draws this as text plus a
 * decorative dot, "never colour-only or styled as an action" - Badge is
 * the part that turns into a link, and Marker the one that turns into a
 * row.
 *
 * The tone drives `color` alone; the dot paints itself from
 * `currentColor`, so dot and label can never disagree about the tone. Same
 * mechanism Badge's own dot already uses (see badge.module.css).
 */
const statusDotVariants = cva(styles.statusDot, {
  variants: {
    tone: {
      neutral: styles.toneNeutral,
      success: styles.toneSuccess,
      warning: styles.toneWarning,
      danger: styles.toneDanger,
      info: styles.toneInfo,
    },
  },
  defaultVariants: {
    tone: 'neutral',
  },
});

export interface StatusDotProps
  extends Omit<useRender.ComponentProps<'span'>, 'children'>,
    VariantProps<typeof statusDotVariants> {
  /**
   * The text beside the dot. Omit it for a dot on its own - a table cell
   * or a dense row where the surrounding column already says what the
   * status means.
   */
  label?: ReactNode;
  /**
   * Marks a status that is still moving (a running job, a live
   * connection): the dot breathes on a 2s opacity cycle, and the root
   * carries `data-live` for a consumer to hook. Off under
   * `prefers-reduced-motion`.
   * @default false
   */
  live?: boolean;
}

export function StatusDot({
  className,
  tone,
  label,
  live = false,
  render,
  ...props
}: StatusDotProps) {
  // cva types `tone` as `| null` (an explicit `tone={null}` resets to the
  // default), which a default parameter absorbs only for `undefined`. cva
  // reads that null as "emit no tone class", while React would drop a null
  // `data-tone` - so the dot would come out with neither. Resolved once
  // here, the same fix marker.tsx and item.tsx already carry.
  const resolvedTone = tone ?? 'neutral';
  // `false`/`null`/`undefined` are all valid ReactNodes that render
  // nothing, and `label={busy && 'Running'}` passes one whenever `busy` is
  // false. Treating those as "no label" keeps the accessible-name branch
  // below honest instead of announcing an empty string.
  const hasLabel = label !== undefined && label !== null && label !== false && label !== '';
  const named = props['aria-label'] !== undefined || props['aria-labelledby'] !== undefined;
  return useRender({
    defaultTagName: 'span',
    render,
    // `data-tone`/`data-live` are layered on AFTER mergeProps, not passed
    // through it: mergeProps types its own object literal as the closed
    // DOM attribute set for the tag, which rejects a `data-*` key - the
    // same shadow-proofing marker.tsx's `data-variant` needs.
    props: {
      ...mergeProps<'span'>(
        {
          className: statusDotVariants({ tone: resolvedTone, className }),
          /*
           * A bare dot carries no text, so it announces as nothing: hide
           * it from assistive tech unless the caller gave it a name of
           * its own. `role="img"` is what makes that name reach the tree
           * at all - an `aria-label` on a plain generic span is ignored
           * by most screen readers. With a visible label neither is
           * needed: the label IS the announcement. Both stay overridable
           * - `props`, merged after, wins whenever the caller sets one.
           */
          role: !hasLabel && named ? 'img' : undefined,
          'aria-hidden': !hasLabel && !named ? true : undefined,
          children: (
            <>
              <span className={styles.dot} />
              {hasLabel ? <span className={styles.label}>{label}</span> : null}
            </>
          ),
        },
        props,
      ),
      'data-tone': resolvedTone,
      'data-live': live || undefined,
    },
  });
}

export { statusDotVariants };
