'use client';

import { cva, cx, type VariantProps } from 'class-variance-authority';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { Children, type ComponentProps, type CSSProperties, useEffect, useState } from 'react';

import { Button, type ButtonProps } from '../button/button';
import styles from './code-block.module.css';

/*
 * CodeBlock, translated from shadcn/ui's base CodeBlock (MIT,
 * registry/bases/base/ui/code-block.tsx) to CSS Modules: a frame with an
 * optional header (title and actions) over a focusable `pre`, an optional
 * footer, and line parts for numbers, diffs and highlighted lines. No Base
 * UI primitive. Syntax highlighting is not ported: upstream keeps it in a
 * separate hook (`useHighlightedCode`, Shiki), which would add a
 * highlighter to every consumer; a consumer that highlights passes the
 * tokens as CodeBlockLine children.
 *
 * Deviations, per the kit-wide conventions: no `data-slot`/`data-*` state
 * attributes (the size, variant, wrap and numbering hooks are classes, and
 * the parts find each other through `:has()` on their classes); the focus
 * state is the kit's border recolour plus inset ring rather than upstream's
 * `ring-3` halo; the copy button is the kit's icon-only Button (`size="sm"`,
 * the glyph in its `icon` slot) and takes `copyLabel`/`copiedLabel` so the
 * announced words can be translated.
 */

const codeBlockVariants = cva(styles.codeBlock, {
  variants: {
    variant: {
      default: styles.variantDefault,
      destructive: styles.variantDestructive,
    },
    size: {
      default: styles.sizeDefault,
      sm: styles.sizeSm,
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

export interface CodeBlockProps
  extends ComponentProps<'div'>, VariantProps<typeof codeBlockVariants> {}

export function CodeBlock({ className, variant, size, ...props }: CodeBlockProps) {
  return <div className={codeBlockVariants({ variant, size, className })} {...props} />;
}

export type CodeBlockHeaderProps = ComponentProps<'div'>;

export function CodeBlockHeader({ className, ...props }: CodeBlockHeaderProps) {
  return <div className={cx(styles.header, className)} {...props} />;
}

export type CodeBlockTitleProps = ComponentProps<'div'>;

/** One line, cut with an ellipsis; an svg before the text is sized to it. */
export function CodeBlockTitle({ className, ...props }: CodeBlockTitleProps) {
  return <div className={cx(styles.title, className)} {...props} />;
}

export type CodeBlockActionsProps = ComponentProps<'div'>;

/**
 * Inside CodeBlockHeader it sits at the end of the row. As a direct child
 * of CodeBlock (no header) it floats over the top end of the block and
 * shows on hover or focus, and always on a coarse pointer.
 */
export function CodeBlockActions({ className, ...props }: CodeBlockActionsProps) {
  return <div className={cx(styles.actions, className)} {...props} />;
}

export interface CodeBlockCopyButtonProps
  extends Omit<
    ButtonProps,
    'icon' | 'end' | 'children' | 'render' | 'nativeButton' | 'aria-label'
  > {
  /** The text written to the clipboard. */
  value: string;
  /** The button's accessible name before a copy. @default 'Copy' */
  copyLabel?: string;
  /** The button's accessible name and the announcement after a copy. @default 'Copied' */
  copiedLabel?: string;
}

/*
 * Upstream's copy flow: write `value`, switch to the check glyph and the
 * copied name for two seconds, and say it once in a polite live region. A
 * refused write changes nothing (upstream swallows it the same way), and
 * so does a missing clipboard (an insecure context), which would otherwise
 * throw before any promise exists. The reset timer lives in an effect
 * keyed on the time of the last copy, so a second copy within the two
 * seconds restarts it, and an unmount clears it.
 */
export function CodeBlockCopyButton({
  value,
  copyLabel = 'Copy',
  copiedLabel = 'Copied',
  variant = 'ghost',
  size = 'sm',
  className,
  onClick,
  ...props
}: CodeBlockCopyButtonProps) {
  const [copiedAt, setCopiedAt] = useState<number | null>(null);
  const copied = copiedAt !== null;

  useEffect(() => {
    if (copiedAt === null) {
      return;
    }
    const timeout = setTimeout(() => setCopiedAt(null), 2000);
    return () => clearTimeout(timeout);
  }, [copiedAt]);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        aria-label={copied ? copiedLabel : copyLabel}
        className={cx(styles.copyButton, className)}
        icon={copied ? <CheckIcon /> : <CopyIcon />}
        onClick={(event) => {
          onClick?.(event);
          Promise.resolve()
            .then(() => navigator.clipboard.writeText(value))
            .then(() => setCopiedAt(Date.now()))
            .catch(() => {});
        }}
        {...props}
      />
      <span aria-live="polite" className={styles.srOnly}>
        {copied ? copiedLabel : ''}
      </span>
    </>
  );
}

export interface CodeBlockContentProps extends ComponentProps<'pre'> {
  /**
   * Soft-wrap long lines instead of scrolling them sideways.
   * @default false
   */
  wrap?: boolean;
  /**
   * Number the lines. A string child is split into CodeBlockLine parts;
   * CodeBlockLine children are numbered as they are.
   * @default false
   */
  lineNumbers?: boolean;
  /** The number of the first line. @default 1 */
  startLine?: number;
}

/*
 * The `pre` is always a tab stop, so a keyboard user can scroll a long
 * line (axe `scrollable-region-focusable`); name it with `aria-label` when
 * the page holds several blocks. It is always left to right, whatever the
 * page direction. Line numbers come from a CSS counter the `pre` resets
 * to `startLine - 1`, so they stay out of a copied selection.
 */
export function CodeBlockContent({
  className,
  children,
  style,
  wrap = false,
  lineNumbers = false,
  startLine = 1,
  ...props
}: CodeBlockContentProps) {
  return (
    <pre
      dir="ltr"
      tabIndex={0}
      style={{ counterReset: `line ${startLine - 1}`, ...style } as CSSProperties}
      className={cx(
        styles.content,
        wrap ? 'scroll-fade-y' : 'scroll-fade-x',
        wrap && styles.wrap,
        lineNumbers && styles.numbered,
        className,
      )}
      {...props}
    >
      <code className={styles.code}>
        {lineNumbers && typeof children === 'string'
          ? children
              .replace(/\n$/, '')
              .split('\n')
              .map((line, index) => <CodeBlockLine key={index}>{line}</CodeBlockLine>)
          : children}
      </code>
    </pre>
  );
}

const codeBlockLineVariants = cva(styles.line, {
  variants: {
    variant: {
      default: styles.lineDefault,
      added: styles.lineAdded,
      removed: styles.lineRemoved,
      highlighted: styles.lineHighlighted,
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface CodeBlockLineProps
  extends ComponentProps<'span'>, VariantProps<typeof codeBlockLineVariants> {}

export function CodeBlockLine({ className, variant, children, ...props }: CodeBlockLineProps) {
  // An empty line holds a newline so copying a selection keeps blank lines.
  // `Children.toArray` drops null, undefined and booleans, so a line whose
  // children all render nothing counts as empty too.
  const empty = Children.toArray(children).every((child) => child === '');

  return (
    <span className={codeBlockLineVariants({ variant, className })} {...props}>
      <span className={styles.lineContent}>{empty ? '\n' : children}</span>
    </span>
  );
}

export type CodeBlockFooterProps = ComponentProps<'div'>;

export function CodeBlockFooter({ className, ...props }: CodeBlockFooterProps) {
  return <div className={cx(styles.footer, className)} {...props} />;
}

export { codeBlockVariants };
