'use client';

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, cx, type VariantProps } from 'class-variance-authority';
import { createContext, useContext, useEffect, useRef, useState, type ComponentProps, type RefObject } from 'react';

import { Button, type ButtonProps } from '../button/button.js';
import styles from './attachment.module.css';

/*
 * A faithful port of shadcn/ui's base Attachment
 * (registry/bases/base/ui/attachment.tsx): a file/image attachment card
 * with media, metadata, upload state, and actions. No primitive to lean
 * on — the upload state machine (`state`) is plain data-attribute-driven
 * CSS, same shape as Message/Bubble, for every part EXCEPT the shimmer
 * below.
 *
 * Uses two utilities from this package's global stylesheet
 * (src/styles/utilities.css, imported alongside theme.css — see that
 * file's own header): `shimmer` on `AttachmentTitle` while uploading or
 * processing, and `scroll-fade-x` + `no-scrollbar` on `AttachmentGroup`'s
 * scroll track.
 *
 * Upstream drives the shimmer purely through a CSS ancestor selector
 * (`group-data-[state=processing]/attachment:shimmer`) with no extra prop
 * on `AttachmentTitle` at all. `shimmer` is a GLOBAL utility class, not a
 * CSS Modules class — there is no CSS-only way to conditionally attach an
 * unrelated global class name to a descendant based on an ancestor's data
 * attribute (a plain descendant selector can style `.attachmentTitle`
 * directly, but it cannot make that element also match every rule the
 * literal `.shimmer` class carries). Every other ancestor-state read
 * below (`AttachmentMedia`'s size/orientation/error styling,
 * `AttachmentDescription`'s error tint) stays pure CSS for exactly this
 * reason — only the shimmer needs it. React context carries the state
 * down to `AttachmentTitle` instead, so the API stays prop-free like
 * upstream — the consumer never re-passes `state` to a child part.
 */
const AttachmentStateContext = createContext<AttachmentProps['state']>('done');

const attachmentVariants = cva(styles.attachment, {
  variants: {
    size: {
      default: styles.sizeDefault,
      sm: styles.sizeSm,
      xs: styles.sizeXs,
    },
    orientation: {
      horizontal: styles.orientationHorizontal,
      vertical: styles.orientationVertical,
    },
  },
  defaultVariants: {
    size: 'default',
    orientation: 'horizontal',
  },
});

export interface AttachmentProps extends ComponentProps<'div'>, VariantProps<typeof attachmentVariants> {
  /**
   * The upload state. Drives styling (idle's dashed border, error's
   * destructive tint on the media/description) and `AttachmentTitle`'s
   * shimmer.
   * @default 'done'
   */
  state?: 'idle' | 'uploading' | 'processing' | 'error' | 'done';
}

/** The root attachment container. */
export function Attachment({
  className,
  state = 'done',
  size = 'default',
  orientation = 'horizontal',
  ...props
}: AttachmentProps) {
  return (
    <AttachmentStateContext.Provider value={state}>
      <div
        data-state={state}
        data-size={size}
        data-orientation={orientation}
        className={attachmentVariants({ size, orientation, className })}
        {...props}
      />
    </AttachmentStateContext.Provider>
  );
}

const attachmentMediaVariants = cva(styles.attachmentMedia, {
  variants: {
    variant: {
      icon: styles.variantIcon,
      image: styles.variantImage,
    },
  },
  defaultVariants: {
    variant: 'icon',
  },
});

export interface AttachmentMediaProps
  extends ComponentProps<'div'>, VariantProps<typeof attachmentMediaVariants> {}

/** The media slot for an icon or image preview. Sizes and tints itself off
 * the ancestor `Attachment`'s `size`/`orientation`/`state` via CSS — no
 * extra props needed. */
export function AttachmentMedia({ className, variant, ...props }: AttachmentMediaProps) {
  // cva's own VariantProps types this `| null` (a consumer can pass
  // `variant={null}` to explicitly reset to the default), which a default
  // parameter value alone doesn't absorb — only `undefined` does. cva reads
  // that null as "emit no variant class at all" while `data-variant` would
  // still be dropped by React, so the media slot would come out with neither
  // the default class nor the attribute. Resolved once here, same as
  // marker.tsx, so class and attribute always agree.
  const resolvedVariant = variant ?? 'icon';
  return (
    <div
      data-variant={resolvedVariant}
      className={attachmentMediaVariants({ variant: resolvedVariant, className })}
      {...props}
    />
  );
}

export type AttachmentContentProps = ComponentProps<'div'>;

/** Wraps the title and description. */
export function AttachmentContent({ className, ...props }: AttachmentContentProps) {
  return <div className={cx(styles.attachmentContent, className)} {...props} />;
}

export type AttachmentTitleProps = ComponentProps<'span'>;

/** The attachment name. Shimmers (via the global `shimmer` utility class —
 * see this file's own header) while the ancestor `Attachment`'s `state` is
 * `'uploading'` or `'processing'` — read from context, not a prop. */
export function AttachmentTitle({ className, ...props }: AttachmentTitleProps) {
  const state = useContext(AttachmentStateContext);
  return (
    <span
      className={cx(styles.attachmentTitle, (state === 'uploading' || state === 'processing') && 'shimmer', className)}
      {...props}
    />
  );
}

export type AttachmentDescriptionProps = ComponentProps<'span'>;

/** Secondary metadata such as the file type, size, or upload status. Picks
 * up the ancestor `Attachment`'s `error` tint via a CSS descendant
 * selector — no extra prop needed. */
export function AttachmentDescription({ className, ...props }: AttachmentDescriptionProps) {
  return <span className={cx(styles.attachmentDescription, className)} {...props} />;
}

export type AttachmentActionsProps = ComponentProps<'div'>;

/** A container for one or more actions, aligned to the end of the
 * attachment. */
export function AttachmentActions({ className, ...props }: AttachmentActionsProps) {
  return <div className={cx(styles.attachmentActions, className)} {...props} />;
}

export type AttachmentActionProps = ButtonProps;

/**
 * An action button. Renders the kit `Button` and accepts all of its props.
 *
 * DRIFT from upstream: shadcn's `AttachmentAction` defaults to
 * `size="icon-xs"` — a dedicated micro icon-only step this kit's `Button`
 * does not have.
 * `size="sm"` is the smallest step available; icon-only squaring already
 * works at any size via Button's own `[data-icon-only]` rule
 * (button.module.css), so the visual result is a slightly larger action
 * button (32px) than upstream's (24px), not a broken one.
 */
export function AttachmentAction({ className, variant, size = 'sm', ...props }: AttachmentActionProps) {
  return (
    <Button
      variant={variant ?? 'ghost'}
      size={size}
      className={cx(styles.attachmentAction, className)}
      {...props}
    />
  );
}

export type AttachmentTriggerProps = useRender.ComponentProps<'button'>;

/** A full-card overlay that activates the attachment — opens a link or
 * dialog while `AttachmentActions` stay independently clickable (it sits
 * behind them in the stacking order). Renders a `<button>` by default. */
export function AttachmentTrigger({ className, render, type, ...props }: AttachmentTriggerProps) {
  return useRender({
    defaultTagName: 'button',
    render,
    props: mergeProps<'button'>(
      {
        type: render ? type : (type ?? 'button'),
        className: cx(styles.attachmentTrigger, className),
      },
      props,
    ),
  });
}

export interface AttachmentGroupProps extends ComponentProps<'div'> {
  /**
   * Accessible name for the row (`role="group"` + `aria-label`). Announced
   * when keyboard focus lands on an overflowing row; without it the group
   * has no role and no name.
   */
  label?: string;
}

/*
 * The row hides its scrollbar, so while its attachments overflow it a
 * keyboard user needs the row itself as a tab stop to scroll it with the
 * arrow keys (WCAG 2.1.1), the same reason Table's scroll wrapper is one.
 * Unlike Table, the stop is held only while the content overflows, the way
 * Base UI's ScrollArea viewport does it: the usual composer row holds one or
 * two attachments that fit, and an unconditional stop would add an empty one
 * to every such row. Overflow is re-measured when the row or one of its
 * children resizes and when children come or go. A focused row keeps its
 * stop until it blurs. A `tabIndex` the caller passes always wins.
 *
 * `label` gives `role="group"`, not Table's `role="region"`: a message list
 * can hold many attachment rows, and a landmark per row would flood
 * landmark navigation.
 */
function useHorizontalOverflow(ref: RefObject<HTMLDivElement | null>): boolean {
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => setOverflowing(element.scrollWidth > element.clientWidth);
    measure();
    // Each observer is optional on its own: without ResizeObserver the row
    // still re-measures when children come or go.
    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    const observeChildren = () => {
      if (!resizeObserver) return;
      resizeObserver.disconnect();
      resizeObserver.observe(element);
      for (const child of element.children) resizeObserver.observe(child);
    };
    observeChildren();
    const mutationObserver =
      typeof MutationObserver === 'undefined'
        ? undefined
        : new MutationObserver(() => {
            observeChildren();
            measure();
          });
    mutationObserver?.observe(element, { childList: true });
    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [ref]);
  return overflowing;
}

/** Lays out attachments in a horizontally scrollable, snapping row with an
 * edge fade. Applies `scroll-fade-x` and `no-scrollbar` (this package's
 * global utilities, see this file's own header) directly, by class name,
 * alongside the module's own layout class. */
export function AttachmentGroup({ className, label, tabIndex, ref, ...props }: AttachmentGroupProps) {
  const groupRef = useRef<HTMLDivElement>(null);
  const overflowing = useHorizontalOverflow(groupRef);
  // Once focused, the row keeps its stop until it loses focus: dropping
  // tabindex from the focused element (an attachment removed, the viewport
  // widened) would send focus to the body and lose the user's place.
  const [focused, setFocused] = useState(false);
  return useRender({
    defaultTagName: 'div',
    ref: ref === undefined ? groupRef : [groupRef, ref],
    props: mergeProps<'div'>(
      {
        role: label === undefined ? undefined : 'group',
        'aria-label': label,
        tabIndex: tabIndex ?? (overflowing || focused ? 0 : undefined),
        onFocus: (event) => {
          if (event.target === event.currentTarget) setFocused(true);
        },
        onBlur: (event) => {
          if (event.target === event.currentTarget) setFocused(false);
        },
        className: cx(styles.attachmentGroup, 'scroll-fade-x', 'no-scrollbar', className),
      },
      props,
    ),
  });
}

export { attachmentMediaVariants, attachmentVariants };
