import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";

import { resolveDirection } from "../direction";
import { noopCleanup, subscribeGlobalEvent } from "../global-event-listener";
import { computePopoverPosition } from "../popover/popover-position";
import type { PopoverPosition } from "../popover/popover-position";

export const useFloatingPanel = (
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>
) => {
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  const panelRef = useRef<HTMLElement | null>(null);

  const reposition = useCallback((): void => {
    const anchor = anchorRef.current;

    if (!anchor) {
      return;
    }

    const panel = panelRef.current;

    const size = panel
      ? { height: panel.offsetHeight, width: panel.offsetWidth }
      : { height: 0, width: 0 };

    const viewport = { height: window.innerHeight, width: window.innerWidth };

    const dir = resolveDirection(panel ?? anchor);

    setPosition(
      computePopoverPosition(anchor.getBoundingClientRect(), size, viewport, {
        dir,
      })
    );
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (open) {
      reposition();
    }
  }, [open, reposition]);

  useEffect(() => {
    if (!open) {
      return noopCleanup;
    }

    let frame: number | undefined;

    const scheduleReposition = (): void => {
      if (frame !== undefined) {
        return;
      }

      frame = requestAnimationFrame(() => {
        frame = undefined;
        reposition();
      });
    };

    const unsubscribeScroll = subscribeGlobalEvent(
      window,
      "scroll",
      scheduleReposition,
      { capture: true, passive: true }
    );
    const unsubscribeResize = subscribeGlobalEvent(
      window,
      "resize",
      scheduleReposition,
      { passive: true }
    );

    return () => {
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }

      unsubscribeScroll();
      unsubscribeResize();
    };
  }, [open, reposition]);

  return { panelRef, position: open ? position : null };
};
