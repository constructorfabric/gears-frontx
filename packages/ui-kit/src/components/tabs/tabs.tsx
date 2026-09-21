import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cva, cx, type VariantProps } from 'class-variance-authority';

import styles from './tabs.module.css';

/*
 * Base UI names these parts Root/List/Tab/Panel (see @base-ui/react/tabs);
 * the kit exposes the shadcn-registry's public names (Tabs/TabsList/
 * TabsTrigger/TabsContent) so consumers coming from shadcn's docs
 * recognize them. Every prop besides `className` is Base UI's own — see
 * each part's re-exported `Props` type below.
 *
 * The drawn model is ONE indicator per list that travels to the active
 * tab, not one bar per trigger crossfading. Base UI's `Tabs.Indicator` is
 * the part that implements it: a `<span>` whose position and size Base UI
 * measures and writes as CSS variables at runtime (`--active-tab-left`,
 * `--active-tab-width` and their siblings, see `TabsIndicatorCssVars`).
 * `TabsList` renders it itself rather than exposing a part of its own -
 * every list has exactly one, and a consumer placing a second one, or
 * none, is not a composition the drawn model has.
 */

export interface TabsProps extends Omit<TabsPrimitive.Root.Props, 'className'> {
  className?: string;
}

export function Tabs({ className, ...props }: TabsProps) {
  return <TabsPrimitive.Root className={cx(styles.tabs, className)} {...props} />;
}

/*
 * Two axes on the list, both inherited by the triggers the way the kit's
 * other container-driven scales are: `variant` picks the look (the drawn
 * indicator model, or the kit's own filled track), `size` picks the label
 * step the spec draws, 12/16 or 14/20. A trigger takes no prop of its own
 * for either, so a list cannot hold two triggers that disagree.
 */
const tabsListVariants = cva(styles.list, {
  variants: {
    variant: {
      default: styles.variantDefault,
      line: styles.variantLine,
    },
    size: {
      sm: styles.sizeSm,
      default: styles.sizeDefault,
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

export interface TabsListProps
  extends Omit<TabsPrimitive.List.Props, 'className'>,
    VariantProps<typeof tabsListVariants> {
  className?: string;
}

export function TabsList({ className, variant, size, children, ...props }: TabsListProps) {
  return (
    <TabsPrimitive.List className={tabsListVariants({ variant, size, className })} {...props}>
      {children}
      <TabsPrimitive.Indicator className={styles.indicator} />
    </TabsPrimitive.List>
  );
}

export interface TabsTriggerProps extends Omit<TabsPrimitive.Tab.Props, 'className'> {
  className?: string;
}

export function TabsTrigger({ className, ...props }: TabsTriggerProps) {
  return <TabsPrimitive.Tab className={cx(styles.trigger, className)} {...props} />;
}

export interface TabsContentProps extends Omit<TabsPrimitive.Panel.Props, 'className'> {
  className?: string;
  /**
   * Replay a short enter animation (a fade up over 4px) every time this
   * panel becomes the active one. Opt out for a panel that animates its
   * own content, or one whose content must not move at all.
   * @default true
   */
  animate?: boolean;
}

/*
 * The enter animation is CSS keyed on `data-starting-style`, the attribute
 * Base UI's own transition machinery puts on a panel for the frame it
 * mounts or opens on (TabsPanelDataAttributes.startingStyle, the same hook
 * the kit's overlays already animate from). Nothing here measures or times
 * anything: `data-animate` only says whether that CSS applies, so a panel
 * that opts out has no transition to interrupt.
 *
 * It replays per activation because an inactive panel unmounts by default;
 * with `keepMounted` the same attribute still lands on each open, so the
 * animation holds either way.
 */
export function TabsContent({ className, animate = true, ...props }: TabsContentProps) {
  return (
    <TabsPrimitive.Panel
      className={cx(styles.content, className)}
      {...props}
      data-animate={animate || undefined}
    />
  );
}
