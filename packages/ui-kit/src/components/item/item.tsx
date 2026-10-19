'use client';

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, cx, type VariantProps } from 'class-variance-authority';
import {
  Children,
  cloneElement,
  type ComponentProps,
  createContext,
  type CSSProperties,
  Fragment,
  isValidElement,
  type ReactNode,
  useContext,
} from 'react';

import { Separator, type SeparatorProps } from '../separator/separator';
import styles from './item.module.css';

/*
 * Item is mostly primitive-free (registry/bases/base/ui/item.tsx ships
 * plain `div`s with data-slot markers, same shape as Card — see card.tsx),
 * EXCEPT the root: upstream builds `Item` itself on Base UI's headless
 * `useRender`/`mergeProps` utilities for render-prop polymorphism (e.g.
 * rendering as an `<a>` so a whole item is a link), not a stateful/
 * positioned primitive like Button or Dialog. This port keeps that
 * capability rather than dropping it — the `render` prop is a real part of
 * Item's upstream surface, and "replicate faithfully" extends to it.
 *
 * No `data-slot`/`data-variant`/`data-size` attributes, per the kit-wide
 * convention (see card.tsx): `useRender`'s `state` option would otherwise
 * auto-reflect `variant`/`size` as `data-*` attributes (see Base UI's
 * getStateAttributesProps), so `stateAttributesMapping` below suppresses
 * that while still handing `{ variant, size }` through to a
 * function-as-`render` consumer's callback.
 */

const itemVariants = cva(styles.item, {
  variants: {
    variant: {
      default: styles.variantDefault,
      outline: styles.variantOutline,
      muted: styles.variantMuted,
    },
    size: {
      default: styles.sizeDefault,
      sm: styles.sizeSm,
      xs: styles.sizeXs,
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

type ItemVariant = NonNullable<VariantProps<typeof itemVariants>['variant']>;
type ItemSize = NonNullable<VariantProps<typeof itemVariants>['size']>;

export type ItemProps = useRender.ComponentProps<'div', { variant: ItemVariant; size: ItemSize }> &
  VariantProps<typeof itemVariants>;

// Set by ItemGroup, whose `role="list"` needs list items as its children.
const ItemGroupContext = createContext(false);

/*
 * Inside an ItemGroup a plain Item is the list's `listitem` (axe
 * `aria-required-children` on the group otherwise). An Item with `render`
 * (a link or a button row) keeps the rendered element's role, which a
 * listitem role would replace, and is wrapped in a `div role="listitem"`
 * instead, so the row stays a link or a button and the list stays well
 * formed. A `role` the caller passes always wins and gets no wrapper. Each
 * Item resets the context for its own children, so an Item nested in a
 * row (or in a popup opened from one) is not taken for a row of the list.
 * The context and the hook are why this module ships `'use client'`.
 */
export function Item({ className, variant, size, render, ...props }: ItemProps) {
  const inGroup = useContext(ItemGroupContext);
  // cva's own VariantProps types these `| null` (a consumer can pass
  // `variant={null}` to explicitly reset to the default), which a default
  // parameter value alone doesn't absorb — only `undefined` does. Resolved
  // here once so `state` below can stay a plain, non-nullable
  // `{ variant, size }` pair.
  const resolvedVariant = variant ?? 'default';
  const resolvedSize = size ?? 'default';
  const element = useRender({
    defaultTagName: 'div',
    render,
    state: { variant: resolvedVariant, size: resolvedSize },
    stateAttributesMapping: {
      variant: () => null,
      size: () => null,
    },
    props: mergeProps<'div'>(
      {
        className: itemVariants({ variant, size, className }),
        role: inGroup && render === undefined ? 'listitem' : undefined,
      },
      props,
    ),
  });
  // No wrapper when the row already carries list semantics of its own: a
  // `role` on the Item or on the rendered element, or an `li`.
  const renderOwnsRole =
    isValidElement<{ role?: string }>(render) &&
    (render.props.role !== undefined || render.type === 'li');
  const wrapped =
    inGroup && render !== undefined && props.role === undefined && !renderOwnsRole ? (
      <div role="listitem" className={styles.itemListItem}>
        {element}
      </div>
    ) : (
      element
    );
  return <ItemGroupContext.Provider value={false}>{wrapped}</ItemGroupContext.Provider>;
}

const itemMediaVariants = cva(styles.itemMedia, {
  variants: {
    variant: {
      default: styles.itemMediaVariantDefault,
      icon: styles.itemMediaVariantIcon,
      image: styles.itemMediaVariantImage,
      chip: styles.itemMediaVariantChip,
      'chip-round': styles.itemMediaVariantChipRound,
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface ItemMediaProps
  extends ComponentProps<'div'>, VariantProps<typeof itemMediaVariants> {}

/** `variant="image"` also shrinks to match the ancestor `Item`'s own
 * `size` (see item.module.css) — no separate prop, it reads the size class
 * already sitting on the `Item` root. */
export function ItemMedia({ className, variant, ...props }: ItemMediaProps) {
  return <div className={itemMediaVariants({ variant, className })} {...props} />;
}

export type ItemContentProps = ComponentProps<'div'>;

export function ItemContent({ className, ...props }: ItemContentProps) {
  return <div className={cx(styles.itemContent, className)} {...props} />;
}

export type ItemTitleProps = ComponentProps<'div'>;

/*
 * Each run of adjacent text children goes into one `.itemTitleText` span,
 * the box that draws the ellipsis (see item.module.css). A fragment's
 * children count as the title's own, so `<>{first} {last}</>` is one run.
 * Element children, such as an icon or a badge beside the text, render as
 * they are, so the flex gap between an icon and the text keeps working. A
 * run of whitespace only (the space between two elements in JSX) is
 * dropped: a flex container drops it anyway, while a span would add a
 * second gap.
 */
function wrapTextRuns(children: ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  let run: string[] = [];
  const flush = () => {
    const text = run.join('');
    run = [];
    if (text.trim() !== '') {
      out.push(
        <span key={`text-${out.length}`} className={styles.itemTitleText}>
          {text}
        </span>,
      );
    }
  };
  // `Children.toArray` keys each level from `.0`, so an element taken out
  // of a fragment is re-keyed under the fragment's own key to stay unique.
  const collect = (nodes: ReactNode, keyPrefix: string) => {
    for (const child of Children.toArray(nodes)) {
      if (typeof child === 'string' || typeof child === 'number') {
        run.push(String(child));
      } else if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) {
        collect(child.props.children, `${keyPrefix}${String(child.key)}/`);
      } else {
        flush();
        out.push(
          keyPrefix && isValidElement(child)
            ? cloneElement(child, { key: `${keyPrefix}${String(child.key)}` })
            : child,
        );
      }
    }
  };
  collect(children, '');
  flush();
  return out;
}

export function ItemTitle({ className, children, ...props }: ItemTitleProps) {
  return (
    <div className={cx(styles.itemTitle, className)} {...props}>
      {wrapTextRuns(children)}
    </div>
  );
}

/*
 * Deviation from upstream's own typing: source types this as
 * `React.ComponentProps<"p">` and does render a `<p>` (unlike KbdGroup/
 * EmptyDescription's own typing/render mismatch elsewhere in this port —
 * Item's is consistent), kept as-is.
 */
export interface ItemDescriptionProps extends ComponentProps<'p'> {
  /**
   * Lines shown before the text is cut with an ellipsis, rounded down to a
   * whole line. `'none'` shows the full text; a number below 1 or a
   * non-finite one does the same, so a description never clamps to zero
   * lines.
   * @default 2
   */
  lineClamp?: number | 'none';
}

/*
 * Upstream hardcodes a two-line clamp and leaves any other count to a
 * `className` override. Under CSS Modules that override competes with
 * `.itemDescription` at equal specificity, so stylesheet order decides, and
 * that order differs between the document and a shadow root. `lineClamp`
 * is the declared way out instead. A count other than 2 travels as the
 * private `--_item-line-clamp` custom property (the inline-variable idiom of
 * Textarea's `--rows`); the default writes no inline style, so the default
 * markup stays what it was. `'none'` swaps in a class that drops the clamp.
 */
export function ItemDescription({ className, style, lineClamp = 2, ...props }: ItemDescriptionProps) {
  const lines = lineClamp === 'none' || !Number.isFinite(lineClamp) || lineClamp < 1 ? undefined : Math.floor(lineClamp);
  const unclamped = lines === undefined;
  return (
    <p
      className={cx(styles.itemDescription, unclamped && styles.itemDescriptionUnclamped, className)}
      style={lines === undefined || lines === 2 ? style : ({ '--_item-line-clamp': lines, ...style } as CSSProperties)}
      {...props}
    />
  );
}

export type ItemActionsProps = ComponentProps<'div'>;

export function ItemActions({ className, ...props }: ItemActionsProps) {
  return <div className={cx(styles.itemActions, className)} {...props} />;
}

export type ItemHeaderProps = ComponentProps<'div'>;

export function ItemHeader({ className, ...props }: ItemHeaderProps) {
  return <div className={cx(styles.itemHeader, className)} {...props} />;
}

export type ItemFooterProps = ComponentProps<'div'>;

export function ItemFooter({ className, ...props }: ItemFooterProps) {
  return <div className={cx(styles.itemFooter, className)} {...props} />;
}

export type ItemGroupProps = ComponentProps<'div'>;

/** A `role="list"` container for a run of `Item`s, spacing them apart
 * (the gap shrinks to match the smallest `size` of Item it contains — see
 * item.module.css). */
// Its rows are list items only while the group is a list: a `role` the
// caller passes replaces `list`, and then no row takes `listitem`.
export function ItemGroup({ className, role = 'list', ...props }: ItemGroupProps) {
  return (
    <ItemGroupContext.Provider value={role === 'list'}>
      <div role={role} className={cx(styles.itemGroup, className)} {...props} />
    </ItemGroupContext.Provider>
  );
}

/** A divider between `Item`s, built on the kit's own `Separator` — same
 * composition idiom as `field.tsx`'s `FieldSeparator`. */
export type ItemSeparatorProps = SeparatorProps;

/*
 * Decorative by default (`aria-hidden`, the kit's documented decorative
 * form, see separator.md): inside ItemGroup's list a separator role is a
 * child the list role does not allow, and the rows already read as items.
 */
export function ItemSeparator({ className, ...props }: ItemSeparatorProps) {
  return (
    <Separator
      orientation="horizontal"
      aria-hidden
      className={cx(styles.itemSeparator, className)}
      {...props}
    />
  );
}
