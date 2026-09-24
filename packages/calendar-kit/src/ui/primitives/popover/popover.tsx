import { clsx } from "clsx";
import { Activity, useCallback, useId, useRef, useState } from "react";
import type { ReactNode, Ref } from "react";
import { createPortal } from "react-dom";

import { assignRef } from "../listbox-internals-utils";
import { trapTabFocus } from "./popover-internals";
import {
  computeInlinePopoverPosition,
  computePopoverPosition,
  VIEWPORT_MARGIN,
} from "./popover-position";
import type { InlinePopoverPosition, PopoverAlign } from "./popover-position";
import { EMPTY_SIZE, useMeasuredPanelSize } from "./use-measured-panel-size";
import { usePopoverDismiss } from "./use-popover-dismiss";
import { usePopoverLifecycle } from "./use-popover-lifecycle";
import { usePopoverReposition } from "./use-popover-reposition";

import styles from "./popover.module.css";

interface PopoverProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly anchorRect: DOMRect;
  readonly anchorRectProvider?: () => DOMRect;
  /** The element the panel belongs to, when the panel portals away from it. */
  readonly anchorElement?: HTMLElement | null;
  /** Panel edge that lines up with the anchor; defaults to its start edge. */
  readonly align?: PopoverAlign;
  /** `inline` opens beside the anchor with an arrow pointing at it; `block` opens below or above. */
  readonly placement?: "block" | "inline";
  readonly label: string;
  readonly ariaLabelledBy?: string;
  readonly header?: ReactNode;
  readonly belongsTo?: (target: EventTarget, panel: HTMLElement) => boolean;
  readonly search?: ReactNode;
  readonly footer?: ReactNode;
  readonly overlay?: ReactNode;
  readonly className?: string;
  readonly container?: Element | DocumentFragment;
  readonly ref?: Ref<HTMLElement>;
  readonly children: ReactNode;
}

interface ViewportSize {
  readonly height: number;
  readonly width: number;
}

// The viewport is read on demand so a resize is reflected on the next render.
const readViewportSize = (): ViewportSize => ({
  height: window.innerHeight,
  width: window.innerWidth,
});

interface ResolvedPopoverPosition {
  readonly inline: InlinePopoverPosition | null;
  readonly position: { readonly left: number; readonly top: number };
}

const resolvePopoverPosition = (
  placement: "block" | "inline",
  anchor: DOMRect,
  size: { width: number; height: number },
  viewport: ViewportSize,
  options: { readonly align?: PopoverAlign; readonly dir: "ltr" | "rtl" }
): ResolvedPopoverPosition => {
  const inline =
    placement === "inline"
      ? computeInlinePopoverPosition(anchor, size, viewport, options.dir)
      : null;

  if (inline !== null) {
    return { inline, position: inline };
  }

  return {
    inline: null,
    position: computePopoverPosition(anchor, size, viewport, options),
  };
};

interface PopoverArrowProps {
  readonly position: InlinePopoverPosition;
  readonly dir: "ltr" | "rtl";
  readonly panelWidth: number;
}

// The panel clips its children to its rounded corners, so the arrow is its sibling.
const PopoverArrow = ({ position, dir, panelWidth }: PopoverArrowProps) => {
  const pointsLeft = (position.side === "end") === (dir === "ltr");

  return (
    <span
      aria-hidden="true"
      className={clsx(
        styles.arrow,
        pointsLeft ? styles.arrowLeft : styles.arrowRight
      )}
      style={{
        left: pointsLeft ? position.left : position.left + panelWidth,
        top: position.top + position.arrowTop,
      }}
    />
  );
};

const Popover = ({
  open,
  onOpenChange,
  anchorRect,
  anchorRectProvider,
  anchorElement,
  align,
  placement = "block",
  label,
  ariaLabelledBy,
  header,
  search,
  footer,
  overlay,
  className,
  container,
  belongsTo,
  ref,
  children,
}: PopoverProps) => {
  const [measuredSize, setMeasuredSize] = useState(EMPTY_SIZE);

  const [dir, setDir] = useState<"ltr" | "rtl">("ltr");

  const headerId = useId();

  const panelRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<HTMLElement | null>(null);

  const setPanelRef = useCallback(
    (node: HTMLDivElement | null): void => {
      panelRef.current = node;
      assignRef(ref, node);
    },
    [ref]
  );

  usePopoverLifecycle({
    anchorElement,
    onDirectionChange: setDir,
    open,
    originRef,
    panelRef,
  });

  usePopoverReposition(open, panelRef);

  usePopoverDismiss({
    belongsTo,
    onOpenChange,
    open,
    originRef,
    panelRef,
  });

  useMeasuredPanelSize(open, panelRef, setMeasuredSize);

  const viewport = readViewportSize();
  const anchor = anchorRectProvider?.() ?? anchorRect;

  const { inline, position } = resolvePopoverPosition(
    placement,
    anchor,
    measuredSize,
    viewport,
    { align, dir }
  );

  const hasHeader = (header ?? null) !== null;
  const hasFooter = (footer ?? null) !== null;
  const labelledBy = ariaLabelledBy ?? (hasHeader ? headerId : undefined);

  const panel = (
    <div
      ref={setPanelRef}
      role="dialog"
      aria-label={label}
      aria-labelledby={labelledBy}
      tabIndex={-1}
      className={clsx(styles.panel, className)}
      onKeyDownCapture={(event) => {
        if (event.key === "Tab") {
          trapTabFocus(event, panelRef.current);
        }
      }}
      style={{
        left: position.left,
        maxHeight: viewport.height - VIEWPORT_MARGIN * 2,
        maxWidth: viewport.width - VIEWPORT_MARGIN * 2,
        top: position.top,
      }}
    >
      {hasHeader ? (
        <div id={headerId} className={styles.header}>
          {header}
        </div>
      ) : null}
      {hasHeader ? <div aria-hidden="true" className={styles.divider} /> : null}
      <div className={styles.content}>
        {(search ?? null) === null ? null : (
          <div className={styles.search}>{search}</div>
        )}
        {children}
      </div>
      {hasFooter ? <div aria-hidden="true" className={styles.divider} /> : null}
      {hasFooter ? <div className={styles.footer}>{footer}</div> : null}
      {(overlay ?? null) === null ? null : (
        <div className={styles.overlay}>{overlay}</div>
      )}
    </div>
  );

  const layer = (
    <>
      {panel}
      {inline === null ? null : (
        <PopoverArrow
          position={inline}
          dir={dir}
          panelWidth={measuredSize.width}
        />
      )}
    </>
  );

  const content = container ? createPortal(layer, container) : layer;

  return <Activity mode={open ? "visible" : "hidden"}>{content}</Activity>;
};

Popover.displayName = "Popover";

export { Popover };
