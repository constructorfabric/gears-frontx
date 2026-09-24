import { useEffect, useState } from "react";
import type { RefObject } from "react";

import { noopCleanup, subscribeGlobalEvent } from "../global-event-listener";

const usePopoverReposition = (
  open: boolean,
  panelRef: RefObject<HTMLDivElement | null>
): void => {
  const [, setRepositionTick] = useState(0);

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
        setRepositionTick((tick) => tick + 1);
      });
    };

    const root = panelRef.current?.getRootNode();

    const unsubscribeRootScroll =
      root instanceof ShadowRoot
        ? subscribeGlobalEvent(root, "scroll", scheduleReposition, {
            capture: true,
            passive: true,
          })
        : null;

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

      unsubscribeRootScroll?.();
      unsubscribeScroll();
      unsubscribeResize();
    };
  }, [open, panelRef]);
};

export { usePopoverReposition };
