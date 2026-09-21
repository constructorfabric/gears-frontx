import { cx } from 'class-variance-authority';
import { LoaderCircleIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import styles from './spinner.module.css';

/*
 * Spinner has no Base UI primitive (registry/bases/base/ui/spinner.tsx
 * renders `Loader2Icon` styled `size-4 animate-spin` — lucide's legacy
 * alias for `loader-circle`, spelled canonically here) and no
 * variant axis — a pure styling translation, same shape as Skeleton (no
 * cva, just one class). `animate-spin` is reproduced as this module's own
 * `spin` keyframe (see spinner.module.css).
 *
 * `role="status"` + `aria-label` also suppress lucide's default
 * `aria-hidden="true"`: this icon IS the loading announcement, not decoration.
 *
 * Two shapes, one component. Bare, it is that icon and nothing else, at
 * the kit's small icon step. Given a `label` or a `description`, it
 * becomes the drawn loading block: the glyph centred in an indicator box
 * with its text beneath. The wrapper is then the live region and the
 * glyph turns decorative, so the announcement is the text a reader can
 * also see, rather than a second hardcoded "Loading".
 *
 * Props stay the indicator `<svg>`'s at both shapes, `className`
 * included - the layout block the kit adds around it is the kit's, not a
 * second element to configure. A caller who needs to place the whole
 * block wraps it themselves.
 */
export interface SpinnerProps extends ComponentProps<'svg'> {
  /**
   * The state, written under the indicator in the drawn micro type. Its
   * presence is what turns the spinner into the composed block, and it
   * becomes the announcement in place of the default "Loading".
   */
  label?: ReactNode;
  /** A second line under the label: what is being waited on, or how long
   * it usually takes. Announced with the label. */
  description?: ReactNode;
  /**
   * The drawn tighter block: a 28 indicator around a 14 glyph instead of
   * 36 around 18. On a bare spinner it takes the glyph to that same 14.
   * @default false
   */
  compact?: boolean;
}

export function Spinner({ className, label, description, compact, ...props }: SpinnerProps) {
  // Both `false` and `null` are ReactNodes that render nothing, and
  // `label={busy && 'Saving'}` passes one whenever `busy` is false. They
  // must land on the bare shape, not produce an empty live region.
  const hasText = isPresent(label) || isPresent(description);

  if (!hasText) {
    return (
      <LoaderCircleIcon
        role="status"
        aria-label="Loading"
        className={cx(styles.spinner, className)}
        {...props}
        data-compact={compact || undefined}
      />
    );
  }

  // The block is the live region now, so a consumer-passed `role` (and
  // `aria-live`/`aria-atomic`, if passed) must land here, not on the
  // glyph below - it lets a labelled Spinner nested in another live
  // region opt out with `role={undefined}` or `role="presentation"` to
  // avoid a duplicate announcement, instead of always adding a second one.
  // An own-property check (not a destructuring default) so an explicit
  // `role={undefined}` is still honored as "no role", rather than falling
  // back to "status". `hasOwnProperty.call`, not `Object.hasOwn` - the root
  // tsconfig's host type-check runs packages/*/src against an ES2020 lib.
  const hasRole = Object.prototype.hasOwnProperty.call(props, 'role');
  const { role, 'aria-live': ariaLive, 'aria-atomic': ariaAtomic, ...svgProps } = props;

  return (
    <div
      className={styles.block}
      role={hasRole ? role : 'status'}
      aria-live={ariaLive}
      aria-atomic={ariaAtomic}
      data-compact={compact || undefined}
    >
      <span className={styles.indicator}>
        <LoaderCircleIcon
          className={cx(styles.spinner, className)}
          {...svgProps}
          // After `...svgProps`: the block above is the live region now, so
          // the glyph must be decorative whatever the caller passed.
          aria-hidden="true"
        />
      </span>
      {isPresent(label) ? <span className={styles.label}>{label}</span> : null}
      {isPresent(description) ? <span className={styles.description}>{description}</span> : null}
    </div>
  );
}

function isPresent(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== '';
}
