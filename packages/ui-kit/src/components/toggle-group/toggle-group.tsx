import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group';
import { cx, type VariantProps } from 'class-variance-authority';
import { createContext, useContext, type CSSProperties } from 'react';

import { toggleVariants } from '../toggle/toggle';
import styles from './toggle-group.module.css';

/*
 * Shares variant/size across every item the way upstream shadcn's
 * ToggleGroup does: set once on the group, read by each ToggleGroupItem,
 * with an item's own `variant`/`size` prop as the fallback when the group
 * doesn't set one. Base UI's own ToggleGroup context (pressed values,
 * disabled, orientation) is separate and internal — Toggle already reads
 * it automatically when rendered inside a ToggleGroup, so this context
 * only needs to carry the two CVA axes Base UI doesn't know about.
 */
interface ToggleGroupSharedProps extends VariantProps<typeof toggleVariants> {
  /** See ToggleGroupProps.iconOnly. `undefined` means "the item decides". */
  iconOnly?: boolean;
}

const ToggleGroupContext = createContext<ToggleGroupSharedProps>({
  variant: 'default',
  size: 'default',
});

export interface ToggleGroupProps<Value extends string = string>
  extends Omit<ToggleGroupPrimitive.Props<Value>, 'className' | 'style'>,
    VariantProps<typeof toggleVariants> {
  className?: string;
  style?: CSSProperties;
  /**
   * Gap between items, in pixels - upstream's `spacing` prop, restored
   * (see toggle-group.md's "Deviation from upstream" for why it was
   * dropped and then brought back). `spacing={0}` additionally switches
   * the group into the drawn segmented look: items lose their individual
   * radius and share collapsed borders, rounded only on the group's own
   * outer corners, and each insets its label by 8 - the same join idiom
   * `ButtonGroup` already uses. Left `undefined`, the group keeps
   * rendering exactly what it always has: a fixed `--space-1` gap between
   * independently-bordered items.
   * @default undefined
   */
  spacing?: number;
  /**
   * Every item holds a glyph and nothing else: each squares up to the
   * group's size step (32 at `sm`) and draws its glyph at the drawn 18.
   * An item's own `iconOnly` still wins where the group leaves it unset,
   * the same precedence `variant` and `size` already have. Each item
   * needs its own `aria-label`: a glyph carries no accessible name.
   * @default undefined
   */
  iconOnly?: boolean;
}

export function ToggleGroup<Value extends string = string>({
  className,
  style,
  variant,
  size,
  spacing,
  iconOnly,
  children,
  ...props
}: ToggleGroupProps<Value>) {
  return (
    <ToggleGroupPrimitive
      data-spacing={spacing}
      /*
       * The group's own size, mirrored onto the element so the collapsed
       * outer corner can follow it: the corner belongs to the group's edge,
       * not to any one item, so it cannot be keyed off an item's class.
       */
      data-size={size}
      className={cx(styles.group, className)}
      style={spacing === undefined ? style : { ...style, gap: `${spacing}px` }}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size, iconOnly }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  );
}

export interface ToggleGroupItemProps<Value extends string = string>
  extends Omit<TogglePrimitive.Props<Value>, 'className'>,
    ToggleGroupSharedProps {
  className?: string;
}

/*
 * Renders the same Base UI Toggle as the standalone component (not a
 * distinct primitive) — Base UI detects the ToggleGroup ancestor itself
 * and wires pressed/disabled/keyboard nav from there, same as upstream's
 * ToggleGroupItem. The group's variant/size (if set) win over an item's
 * own, matching upstream's `context.variant || variant` precedence.
 * `styles.item` adds only what a group membership needs on top of the
 * standalone toggle look (shrinking instead of wrapping, and lifting
 * above neighbors on focus so the ring isn't clipped by the next item).
 */
export function ToggleGroupItem<Value extends string = string>({
  className,
  variant,
  size,
  iconOnly,
  ...props
}: ToggleGroupItemProps<Value>) {
  const context = useContext(ToggleGroupContext);
  return (
    <TogglePrimitive
      className={cx(
        styles.item,
        toggleVariants({ variant: context.variant ?? variant, size: context.size ?? size }),
        className,
      )}
      {...props}
      // Same group-wins precedence as variant/size above, and spread after
      // `...props` so a caller's own attribute cannot contradict the prop.
      data-icon-only={(context.iconOnly ?? iconOnly) || undefined}
    />
  );
}
