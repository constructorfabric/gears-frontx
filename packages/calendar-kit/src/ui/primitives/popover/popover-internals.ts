import { cycleTabFocus } from "../focus-trap";
import type { TabKeyEvent } from "../focus-trap";
import { subscribeGlobalEvent } from "../global-event-listener";
import { hasNestedLayer } from "../portal-layer";

const openPanels = new Set<HTMLElement>();

let releaseSwallow: (() => void) | undefined;

/** The panel unmounts before the click its press ends with, so the swallow outlives it. */
const swallowNextClick = (): void => {
  releaseSwallow?.();

  let released = false;

  const swallow = (event: Event): void => {
    if (!released) {
      return;
    }

    releaseSwallow?.();
    event.stopPropagation();
    event.preventDefault();
  };

  const unsubscribe = [
    subscribeGlobalEvent(document, "click", swallow, true),
    subscribeGlobalEvent(
      document,
      "pointerup",
      () => {
        released = true;
      },
      true
    ),
    subscribeGlobalEvent(
      document,
      "pointerdown",
      () => releaseSwallow?.(),
      false
    ),
  ];

  releaseSwallow = (): void => {
    for (const unsubscribeListener of unsubscribe) {
      unsubscribeListener();
    }

    releaseSwallow = undefined;
  };
};

const isTopmostLayer = (panel: HTMLElement): boolean => {
  for (const other of openPanels) {
    if (other !== panel && panel.contains(other)) {
      return false;
    }
  }

  return !hasNestedLayer(panel);
};

// A popover below another layer keeps its focus where it is.
const trapTabFocus = (event: TabKeyEvent, panel: HTMLElement | null): void => {
  if (panel === null || !isTopmostLayer(panel)) {
    return;
  }

  cycleTabFocus(event, panel);
};

export { isTopmostLayer, openPanels, swallowNextClick, trapTabFocus };
