import { useEffect } from "react";
import type { RefObject } from "react";

import { resolveDirection } from "../direction";
import { resolveActiveElement } from "../focus-trap";
import { noopCleanup } from "../global-event-listener";
import { registerNestedLayer } from "../portal-layer";
import { openPanels } from "./popover-internals";

interface PopoverLifecycleOptions {
  readonly open: boolean;
  readonly panelRef: RefObject<HTMLDivElement | null>;
  readonly originRef: RefObject<HTMLElement | null>;
  readonly anchorElement?: HTMLElement | null;
  readonly onDirectionChange: (dir: "ltr" | "rtl") => void;
}

const usePopoverLifecycle = ({
  open,
  panelRef,
  originRef,
  anchorElement,
  onDirectionChange,
}: PopoverLifecycleOptions): void => {
  useEffect(() => {
    const panel = panelRef.current;

    if (!open || !panel) {
      return noopCleanup;
    }

    originRef.current = resolveActiveElement(panel);
    onDirectionChange(resolveDirection(panel));
    openPanels.add(panel);

    const unregisterNestedLayer =
      anchorElement === null || anchorElement === undefined
        ? noopCleanup
        : registerNestedLayer(panel, anchorElement);

    panel.focus();

    return () => {
      openPanels.delete(panel);
      unregisterNestedLayer();

      const origin = originRef.current;

      if (origin) {
        originRef.current = null;
        origin.focus();
      }
    };
  }, [anchorElement, onDirectionChange, open, originRef, panelRef]);
};

export { usePopoverLifecycle };
