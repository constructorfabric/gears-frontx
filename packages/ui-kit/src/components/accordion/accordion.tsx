import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import { cx } from 'class-variance-authority';

import styles from './accordion.module.css';

/**
 * Unlike the kit's popup-based overlays (Dialog/Popover/Tooltip/...), whose
 * Root renders no DOM element of its own, Accordion.Root renders the
 * top-level `<div>` — so it needs a real wrapper (for the base flex-column
 * layout), not a bare pass-through re-export.
 */
export interface AccordionProps<Value = unknown>
  extends Omit<AccordionPrimitive.Root.Props<Value>, 'className'> {
  className?: string;
}

export function Accordion<Value = unknown>({ className, ...props }: AccordionProps<Value>) {
  return <AccordionPrimitive.Root className={cx(styles.root, className)} {...props} />;
}

export interface AccordionItemProps extends Omit<AccordionPrimitive.Item.Props, 'className'> {
  className?: string;
}

export function AccordionItem({ className, ...props }: AccordionItemProps) {
  return <AccordionPrimitive.Item className={cx(styles.item, className)} {...props} />;
}

/* Inline lucide chevron-down path (ISC) — the kit carries no icon dependency.
 * Upstream swaps between a chevron-down and chevron-up icon by aria-expanded
 * visibility; the kit instead rotates one icon 180deg off `data-panel-open`
 * (see accordion.module.css) — one fewer DOM node for the same result. */
function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cx(styles.triggerIcon, className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export interface AccordionTriggerProps
  extends Omit<AccordionPrimitive.Trigger.Props, 'className'> {
  className?: string;
}

export function AccordionTrigger({ className, children, ...props }: AccordionTriggerProps) {
  return (
    <AccordionPrimitive.Header className={styles.header}>
      <AccordionPrimitive.Trigger className={cx(styles.trigger, className)} {...props}>
        {children}
        <ChevronDownIcon />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export interface AccordionContentProps extends Omit<AccordionPrimitive.Panel.Props, 'className'> {
  className?: string;
}

export function AccordionContent({ className, children, ...props }: AccordionContentProps) {
  return (
    <AccordionPrimitive.Panel className={styles.panel} {...props}>
      <div className={cx(styles.content, className)}>{children}</div>
    </AccordionPrimitive.Panel>
  );
}
