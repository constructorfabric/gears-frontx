const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 4;

export interface PopoverPosition {
  readonly top: number;
  readonly left: number;
  readonly side: "top" | "bottom";
}

interface PopoverPositionOptions {
  readonly dir?: "ltr" | "rtl";
  readonly align?: PopoverAlign;
}

export type PopoverAlign = "center" | "start";

export const computePopoverPosition = (
  anchor: DOMRect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  options: PopoverPositionOptions = {}
): PopoverPosition => {
  const dir = options.dir ?? "ltr";
  const below = anchor.bottom + ANCHOR_GAP;
  const above = anchor.top - ANCHOR_GAP - size.height;

  let side: PopoverPosition["side"] = "bottom";
  let top = below;

  if (
    below + size.height > viewport.height - VIEWPORT_MARGIN &&
    above >= VIEWPORT_MARGIN
  ) {
    side = "top";
    top = above;
  }

  const topMax = Math.max(
    VIEWPORT_MARGIN,
    viewport.height - VIEWPORT_MARGIN - size.height
  );
  top = Math.min(Math.max(top, VIEWPORT_MARGIN), topMax);

  const anchorEnd = dir === "rtl" ? anchor.right - size.width : anchor.left;

  let left =
    options.align === "center"
      ? anchor.left + anchor.width / 2 - size.width / 2
      : anchorEnd;

  const leftMax = Math.max(
    VIEWPORT_MARGIN,
    viewport.width - VIEWPORT_MARGIN - size.width
  );
  left = Math.min(Math.max(left, VIEWPORT_MARGIN), leftMax);

  return { left, side, top };
};

export interface InlinePopoverPosition {
  readonly top: number;
  readonly left: number;
  readonly side: "start" | "end";
  /** Distance from the panel's top edge to the anchor's vertical centre. */
  readonly arrowTop: number;
}

const INLINE_GAP = 12;
const ARROW_INSET = 20;

/** Opens beside the anchor on the side with room; null when neither side fits, so callers fall back to below. */
export const computeInlinePopoverPosition = (
  anchor: DOMRect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  dir: "ltr" | "rtl" = "ltr"
): InlinePopoverPosition | null => {
  const roomAfter =
    viewport.width - VIEWPORT_MARGIN - anchor.right - INLINE_GAP;
  const roomBefore = anchor.left - INLINE_GAP - VIEWPORT_MARGIN;
  const rightFits = roomAfter >= size.width;
  const leftFits = roomBefore >= size.width;

  if (!rightFits && !leftFits) {
    return null;
  }

  const onRight = rightFits && (dir === "ltr" || !leftFits);

  const leftMax = Math.max(
    VIEWPORT_MARGIN,
    viewport.width - VIEWPORT_MARGIN - size.width
  );
  const left = Math.min(
    Math.max(
      onRight
        ? anchor.right + INLINE_GAP
        : anchor.left - INLINE_GAP - size.width,
      VIEWPORT_MARGIN
    ),
    leftMax
  );

  const anchorMiddle = anchor.top + anchor.height / 2;
  const topMax = Math.max(
    VIEWPORT_MARGIN,
    viewport.height - VIEWPORT_MARGIN - size.height
  );
  const top = Math.min(
    Math.max(anchorMiddle - ARROW_INSET * 2, VIEWPORT_MARGIN),
    topMax
  );
  const arrowTop = Math.min(
    Math.max(anchorMiddle - top, ARROW_INSET),
    Math.max(ARROW_INSET, size.height - ARROW_INSET)
  );

  const physicalSide = onRight ? "right" : "left";

  const startSide = dir === "ltr" ? "left" : "right";

  return {
    arrowTop,
    left,
    side: physicalSide === startSide ? "start" : "end",
    top,
  };
};

export { ANCHOR_GAP, VIEWPORT_MARGIN };
