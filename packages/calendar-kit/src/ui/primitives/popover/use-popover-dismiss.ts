import { useEffect, useEffectEvent } from "react";
import type { RefObject } from "react";

import { noopCleanup, subscribeGlobalEvent } from "../global-event-listener";
import { isNestedLayerEvent } from "../portal-layer";
import {
  isTopmostLayer,
  swallowNextClick,
  trapTabFocus,
} from "./popover-internals";

const isOwnedEvent = (
  event: Event,
  panel: HTMLElement,
  belongsTo?: (target: EventTarget, panel: HTMLElement) => boolean
): boolean => {
  const path = event.composedPath();

  if (path.includes(panel) || isNestedLayerEvent(panel, path)) {
    return true;
  }
  if (!belongsTo) {
    return false;
  }
  return path.some((target) => belongsTo(target, panel));
};

interface PopoverDismissOptions {
  readonly open: boolean;
  readonly panelRef: RefObject<HTMLDivElement | null>;
  readonly originRef: RefObject<HTMLElement | null>;
  readonly onOpenChange: (open: boolean) => void;
  readonly belongsTo?: (target: EventTarget, panel: HTMLElement) => boolean;
}

const usePopoverDismiss = ({
  open,
  panelRef,
  originRef,
  onOpenChange,
  belongsTo,
}: PopoverDismissOptions): void => {
  const dismiss = useEffectEvent((): void => {
    onOpenChange(false);
  });

  const ownsEvent = useEffectEvent(
    (event: Event, panel: HTMLElement): boolean =>
      isOwnedEvent(event, panel, belongsTo)
  );

  useEffect(() => {
    const panel = panelRef.current;

    if (!open || !panel) {
      return noopCleanup;
    }

    const handleKeyDown = (event: Event): void => {
      if (!(event instanceof KeyboardEvent) || !isTopmostLayer(panel)) {
        return;
      }

      if (event.key === "Escape") {
        const listbox = panel.querySelector('[role="listbox"]');

        if (listbox !== null) {
          return;
        }

        event.stopPropagation();
        dismiss();

        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      if (event.composedPath().includes(panel)) {
        return;
      }

      trapTabFocus(event, panel);
    };

    const handlePointerDown = (event: Event): void => {
      if (!isTopmostLayer(panel)) {
        return;
      }

      if (!ownsEvent(event, panel)) {
        event.stopPropagation();
        swallowNextClick();
        dismiss();
      }
    };

    const handleFocusIn = (event: Event): void => {
      const target = event
        .composedPath()
        .find((node): node is HTMLElement => node instanceof HTMLElement);

      if (target !== undefined && !ownsEvent(event, panel)) {
        originRef.current = target;
      }
    };

    const root = panel.getRootNode();

    const unsubscribe = [
      subscribeGlobalEvent(panel, "keydown", handleKeyDown, true),
      subscribeGlobalEvent(document, "keydown", handleKeyDown, true),
      subscribeGlobalEvent(document, "pointerdown", handlePointerDown, true),
      subscribeGlobalEvent(document, "focusin", handleFocusIn, true),
      ...(root instanceof ShadowRoot
        ? [
            subscribeGlobalEvent(root, "pointerdown", handlePointerDown, true),
            subscribeGlobalEvent(root, "focusin", handleFocusIn, true),
          ]
        : []),
    ];

    return () => {
      for (const unsubscribeListener of unsubscribe) {
        unsubscribeListener();
      }
    };
  }, [open, originRef, panelRef]);
};

export { usePopoverDismiss };
