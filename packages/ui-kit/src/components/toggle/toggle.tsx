import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { cva, type VariantProps } from 'class-variance-authority';

import styles from './toggle.module.css';

export const toggleVariants = cva(styles.toggle, {
  variants: {
    variant: {
      default: styles.variantDefault,
      outline: styles.variantOutline,
      steel: styles.variantSteel,
    },
    size: {
      default: styles.sizeDefault,
      sm: styles.sizeSm,
      lg: styles.sizeLg,
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

export interface ToggleProps<Value extends string = string>
  extends Omit<TogglePrimitive.Props<Value>, 'className'>, VariantProps<typeof toggleVariants> {
  className?: string;
  /**
   * The toggle holds a glyph and nothing else: it squares up to its own
   * size step (32 at `sm`) and draws the glyph at the drawn 18. Icon-only
   * is derived from an `icon` slot on `Button`, but a Toggle's glyph is
   * its children, so there is nothing to derive it from here and the
   * caller states it. Always pair it with an `aria-label`: a glyph carries
   * no accessible name.
   * @default false
   */
  iconOnly?: boolean;
}

/*
 * `toggleVariants` is exported (not just `Toggle`) so ToggleGroupItem can
 * apply the exact same variant/size classes to the Base UI Toggle it
 * renders inside a group — same split as upstream shadcn's toggle.tsx,
 * kept here because Toggle must exist before ToggleGroup can import it.
 */
export function Toggle<Value extends string = string>({
  className,
  variant,
  size,
  iconOnly,
  ...props
}: ToggleProps<Value>) {
  return (
    <TogglePrimitive
      className={toggleVariants({ variant, size, className })}
      {...props}
      // After `...props`, so a caller's own `data-icon-only` cannot
      // contradict the prop the CSS below is keyed on - same ordering
      // button.tsx uses for its derived attributes.
      data-icon-only={iconOnly || undefined}
    />
  );
}
