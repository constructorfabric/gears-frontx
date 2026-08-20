// Load-bearing: ContextMenuContent calls useContext directly, so this
// can't be dropped. Coupled to CLIENT_COMPONENTS in
// scripts/verify-consumer.sh — keep both in sync if this ever changes.
'use client';

import { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu';
import { cva, cx, type VariantProps } from 'class-variance-authority';
import { type ComponentProps, createContext, useContext } from 'react';

import styles from './context-menu.module.css';

/*
 * Carries ContextMenuContent's effective portal container down to nested
 * submenus, so a theme scoped to a subtree holds one level deep without the
 * consumer repeating `container` on every ContextMenuSubContent. An explicit
 * `container` on the submenu still wins. Same idiom as dropdown-menu's
 * MenuContainerContext — this primitive reuses the identical Menu submenu
 * parts under the hood.
 */
const MenuContainerContext = createContext<ContextMenuPrimitive.Portal.Props['container']>(
  undefined,
);

/* Inline lucide paths (ISC) — the kit carries no icon dependency. */
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cx(styles.svgIcon, className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cx(styles.svgIcon, className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export const ContextMenu = ContextMenuPrimitive.Root;
/**
 * The root is a Base UI pass-through, but its props type is still exported:
 * a consumer writing a typed wrapper imports it from this kit — Base UI is
 * this package's dependency, not necessarily theirs. Same idiom as
 * DropdownMenuProps.
 */
export type ContextMenuProps = ContextMenuPrimitive.Root.Props;

export interface ContextMenuTriggerProps
  extends Omit<ContextMenuPrimitive.Trigger.Props, 'className'> {
  className?: string;
}

/**
 * The right-click / long-press activation area. Renders a `<div>` — wrap
 * whatever content the menu should apply to (a table row, a canvas, a
 * whole page section).
 */
export function ContextMenuTrigger({ className, ...props }: ContextMenuTriggerProps) {
  return <ContextMenuPrimitive.Trigger className={cx(styles.trigger, className)} {...props} />;
}

export interface ContextMenuContentProps
  extends Omit<ContextMenuPrimitive.Popup.Props, 'className'>,
    Pick<
      ContextMenuPrimitive.Positioner.Props,
      // positionMethod/collision*: the escape hatch for popups anchored
      // inside a transform/filter container, where the default absolute
      // positioning resolves against the wrong containing block — see
      // dropdown-menu.tsx for the same reasoning.
      | 'align'
      | 'alignOffset'
      | 'side'
      | 'sideOffset'
      | 'positionMethod'
      | 'collisionBoundary'
      | 'collisionPadding'
    > {
  className?: string;
  /**
   * Where to portal the popup. Defaults to <body>. Pass a themed container
   * when the theme is scoped to a subtree (data-theme on a container that
   * isn't at document root) so the popup inherits its tokens and font.
   * Inherited by nested ContextMenuSubContent unless it passes its own.
   */
  container?: ContextMenuPrimitive.Portal.Props['container'];
}

export function ContextMenuContent({
  className,
  children,
  container,
  side = 'right',
  sideOffset = 0,
  align = 'start',
  alignOffset = 4,
  positionMethod,
  collisionBoundary,
  collisionPadding,
  ...props
}: ContextMenuContentProps) {
  const inheritedContainer = useContext(MenuContainerContext);
  const effectiveContainer = container ?? inheritedContainer;
  return (
    <MenuContainerContext.Provider value={effectiveContainer}>
      <ContextMenuPrimitive.Portal container={effectiveContainer}>
        <ContextMenuPrimitive.Positioner
          side={side}
          sideOffset={sideOffset}
          align={align}
          alignOffset={alignOffset}
          positionMethod={positionMethod}
          collisionBoundary={collisionBoundary}
          collisionPadding={collisionPadding}
          className={styles.positioner}
        >
          <ContextMenuPrimitive.Popup className={cx(styles.popup, className)} {...props}>
            {children}
          </ContextMenuPrimitive.Popup>
        </ContextMenuPrimitive.Positioner>
      </ContextMenuPrimitive.Portal>
    </MenuContainerContext.Provider>
  );
}

export interface ContextMenuGroupProps
  extends Omit<ContextMenuPrimitive.Group.Props, 'className'> {
  className?: string;
}

export function ContextMenuGroup({ className, ...props }: ContextMenuGroupProps) {
  return <ContextMenuPrimitive.Group className={className} {...props} />;
}

export interface ContextMenuLabelProps
  extends Omit<ContextMenuPrimitive.GroupLabel.Props, 'className'> {
  className?: string;
  /** Indents the label to align with an inset item's text, past its icon column. */
  inset?: boolean;
}

export function ContextMenuLabel({ className, inset, ...props }: ContextMenuLabelProps) {
  return (
    <ContextMenuPrimitive.GroupLabel
      data-inset={inset}
      className={cx(styles.label, className)}
      {...props}
    />
  );
}

const itemVariants = cva(styles.item, {
  variants: {
    variant: {
      default: styles.variantDefault,
      destructive: styles.variantDestructive,
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface ContextMenuItemProps
  extends Omit<ContextMenuPrimitive.Item.Props, 'className'>, VariantProps<typeof itemVariants> {
  className?: string;
  /** Indents the item's text past a leading-icon column other items in the same menu use. */
  inset?: boolean;
}

export function ContextMenuItem({ className, variant, inset, ...props }: ContextMenuItemProps) {
  return (
    <ContextMenuPrimitive.Item
      data-inset={inset}
      className={itemVariants({ variant, className })}
      {...props}
    />
  );
}

export interface ContextMenuCheckboxItemProps
  extends Omit<ContextMenuPrimitive.CheckboxItem.Props, 'className'> {
  className?: string;
  /** Indents the item's text past a leading-icon column other items in the same menu use. */
  inset?: boolean;
}

export function ContextMenuCheckboxItem({
  className,
  children,
  inset,
  ...props
}: ContextMenuCheckboxItemProps) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      data-inset={inset}
      className={cx(styles.checkboxItem, className)}
      {...props}
    >
      {children}
      <ContextMenuPrimitive.CheckboxItemIndicator className={styles.itemIndicator}>
        <CheckIcon />
      </ContextMenuPrimitive.CheckboxItemIndicator>
    </ContextMenuPrimitive.CheckboxItem>
  );
}

export interface ContextMenuRadioGroupProps
  extends Omit<ContextMenuPrimitive.RadioGroup.Props, 'className'> {
  className?: string;
}

export function ContextMenuRadioGroup({ className, ...props }: ContextMenuRadioGroupProps) {
  return <ContextMenuPrimitive.RadioGroup className={className} {...props} />;
}

export interface ContextMenuRadioItemProps
  extends Omit<ContextMenuPrimitive.RadioItem.Props, 'className'> {
  className?: string;
  /** Indents the item's text past a leading-icon column other items in the same menu use. */
  inset?: boolean;
}

export function ContextMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: ContextMenuRadioItemProps) {
  return (
    <ContextMenuPrimitive.RadioItem
      data-inset={inset}
      className={cx(styles.radioItem, className)}
      {...props}
    >
      {children}
      <ContextMenuPrimitive.RadioItemIndicator className={styles.itemIndicator}>
        <CheckIcon />
      </ContextMenuPrimitive.RadioItemIndicator>
    </ContextMenuPrimitive.RadioItem>
  );
}

export interface ContextMenuSeparatorProps
  extends Omit<ContextMenuPrimitive.Separator.Props, 'className'> {
  className?: string;
}

export function ContextMenuSeparator({ className, ...props }: ContextMenuSeparatorProps) {
  return <ContextMenuPrimitive.Separator className={cx(styles.separator, className)} {...props} />;
}

export type ContextMenuShortcutProps = ComponentProps<'span'>;

export function ContextMenuShortcut({ className, ...props }: ContextMenuShortcutProps) {
  return <span className={cx(styles.shortcut, className)} {...props} />;
}

export const ContextMenuSub = ContextMenuPrimitive.SubmenuRoot;
/** Pass-through props type — see ContextMenuProps. */
export type ContextMenuSubProps = ContextMenuPrimitive.SubmenuRoot.Props;

export interface ContextMenuSubTriggerProps
  extends Omit<ContextMenuPrimitive.SubmenuTrigger.Props, 'className'> {
  className?: string;
  /** Indents the trigger's text past a leading-icon column other items in the same menu use. */
  inset?: boolean;
}

export function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: ContextMenuSubTriggerProps) {
  return (
    <ContextMenuPrimitive.SubmenuTrigger
      data-inset={inset}
      className={cx(styles.subTrigger, className)}
      {...props}
    >
      {children}
      <ChevronRightIcon className={styles.subTriggerIcon} />
    </ContextMenuPrimitive.SubmenuTrigger>
  );
}

export type ContextMenuSubContentProps = ContextMenuContentProps;

export function ContextMenuSubContent({
  className,
  side = 'right',
  align = 'start',
  sideOffset = 0,
  // Upstream's ContextMenuSubContent passes only `side="right"` through to
  // ContextMenuContent and leaves alignOffset at its inherited default (4) —
  // unlike dropdown-menu.tsx's SubContent, which sets its own -3. A context
  // menu's root popup is pointer-anchored rather than trigger-anchored, so
  // upstream did not give its submenu a different offset from the root.
  alignOffset = 4,
  ...props
}: ContextMenuSubContentProps) {
  return (
    <ContextMenuContent
      className={cx(styles.subPopup, className)}
      side={side}
      align={align}
      sideOffset={sideOffset}
      alignOffset={alignOffset}
      {...props}
    />
  );
}
