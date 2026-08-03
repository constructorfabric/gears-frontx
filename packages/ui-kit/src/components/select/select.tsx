import { Select as SelectPrimitive } from '@base-ui/react/select';
import { cva, cx, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';

import styles from './select.module.css';

/* Inline lucide paths (ISC) — the kit carries no icon dependency. */
function Chevron({ direction, className }: { direction: 'up' | 'down'; className?: string }) {
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
      <path d={direction === 'down' ? 'm6 9 6 6 6-6' : 'm18 15-6-6-6 6'} />
    </svg>
  );
}

export const Select = SelectPrimitive.Root;

export interface SelectValueProps extends Omit<SelectPrimitive.Value.Props, 'className'> {
  className?: string;
}

export function SelectValue({ className, ...props }: SelectValueProps) {
  return <SelectPrimitive.Value className={cx(styles.value, className)} {...props} />;
}

const triggerVariants = cva(styles.trigger, {
  variants: {
    size: {
      default: styles.sizeDefault,
      sm: styles.sizeSm,
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

export interface SelectTriggerProps
  extends Omit<SelectPrimitive.Trigger.Props, 'className'>, VariantProps<typeof triggerVariants> {
  className?: string;
}

export function SelectTrigger({ className, size, children, ...props }: SelectTriggerProps) {
  return (
    <SelectPrimitive.Trigger className={triggerVariants({ size, className })} {...props}>
      {children}
      <SelectPrimitive.Icon render={<Chevron direction="down" className={styles.triggerIcon} />} />
    </SelectPrimitive.Trigger>
  );
}

export interface SelectContentProps
  extends Omit<SelectPrimitive.Popup.Props, 'className'>,
    Pick<
      SelectPrimitive.Positioner.Props,
      'align' | 'alignOffset' | 'side' | 'sideOffset' | 'alignItemWithTrigger'
    > {
  className?: string;
  /**
   * Where to portal the popup. Defaults to <body>. Pass a themed container
   * when the theme is scoped to a subtree (data-theme on a section rather
   * than <html>) so the popup inherits its tokens and font.
   */
  container?: SelectPrimitive.Portal.Props['container'];
}

export function SelectContent({
  className,
  children,
  container,
  side = 'bottom',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectContentProps) {
  return (
    <SelectPrimitive.Portal container={container}>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className={styles.positioner}
      >
        <SelectPrimitive.Popup
          data-align-trigger={alignItemWithTrigger}
          className={cx(styles.popup, className)}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

export interface SelectGroupProps extends Omit<SelectPrimitive.Group.Props, 'className'> {
  className?: string;
}

export function SelectGroup({ className, ...props }: SelectGroupProps) {
  return <SelectPrimitive.Group className={cx(styles.group, className)} {...props} />;
}

export interface SelectLabelProps extends Omit<SelectPrimitive.GroupLabel.Props, 'className'> {
  className?: string;
}

export function SelectLabel({ className, ...props }: SelectLabelProps) {
  return <SelectPrimitive.GroupLabel className={cx(styles.groupLabel, className)} {...props} />;
}

export interface SelectItemProps extends Omit<SelectPrimitive.Item.Props, 'className'> {
  className?: string;
  children?: ReactNode;
}

export function SelectItem({ className, children, ...props }: SelectItemProps) {
  return (
    <SelectPrimitive.Item className={cx(styles.item, className)} {...props}>
      <SelectPrimitive.ItemText className={styles.itemText}>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator render={<span className={styles.itemIndicator} />}>
        <svg
          className={styles.svgIcon}
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
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export interface SelectSeparatorProps extends Omit<SelectPrimitive.Separator.Props, 'className'> {
  className?: string;
}

export function SelectSeparator({ className, ...props }: SelectSeparatorProps) {
  return <SelectPrimitive.Separator className={cx(styles.separator, className)} {...props} />;
}

export function SelectScrollUpButton({
  className,
  ...props
}: Omit<ComponentProps<typeof SelectPrimitive.ScrollUpArrow>, 'className'> & {
  className?: string;
}) {
  return (
    <SelectPrimitive.ScrollUpArrow
      className={cx(styles.scrollArrow, styles.scrollArrowUp, className)}
      {...props}
    >
      <Chevron direction="up" />
    </SelectPrimitive.ScrollUpArrow>
  );
}

export function SelectScrollDownButton({
  className,
  ...props
}: Omit<ComponentProps<typeof SelectPrimitive.ScrollDownArrow>, 'className'> & {
  className?: string;
}) {
  return (
    <SelectPrimitive.ScrollDownArrow
      className={cx(styles.scrollArrow, styles.scrollArrowDown, className)}
      {...props}
    >
      <Chevron direction="down" />
    </SelectPrimitive.ScrollDownArrow>
  );
}
