import { cx } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import styles from './spinner.module.css';

/*
 * Spinner has no Base UI primitive (registry/bases/base/ui/spinner.tsx
 * renders a lucide `Loader2Icon` styled `size-4 animate-spin`) and no
 * variant axis — a pure styling translation, same shape as Skeleton (no
 * cva, just one class).
 *
 * The kit ships no lucide-react (see shadcn-porting-map.md: Button/Badge
 * already avoid it), so this inlines the equivalent SVG directly rather
 * than adding the dependency: lucide's `loader-circle` icon (aliased as
 * `Loader2Icon`), copied path-for-path from
 * https://github.com/lucide-icons/lucide/blob/main/icons/loader-circle.svg
 * — a circle arc left open at one end, which is what makes the spin read
 * as motion instead of a solid disc rotating in place. `animate-spin` is
 * reproduced as this module's own `spin` keyframe (see spinner.module.css).
 */
export type SpinnerProps = ComponentProps<'svg'>;

export function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="status"
      aria-label="Loading"
      className={cx(styles.spinner, className)}
      {...props}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
