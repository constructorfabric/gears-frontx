import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

import { noopCleanup } from "../global-event-listener";

interface PanelSize {
  readonly height: number;
  readonly width: number;
}

const EMPTY_SIZE: PanelSize = { height: 0, width: 0 };

// Measure before paint so the panel never flashes unplaced.
const useMeasuredPanelSize = (
  open: boolean,
  panelRef: RefObject<HTMLDivElement | null>,
  setMeasuredSize: (size: PanelSize) => void
): void => {
  const measuredSizeRef = useRef(EMPTY_SIZE);

  useLayoutEffect(() => {
    const panel = panelRef.current;

    if (!open || panel === null) {
      return noopCleanup;
    }

    const syncMeasuredSize = (): void => {
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const previous = measuredSizeRef.current;

      if (previous.width === width && previous.height === height) {
        return;
      }

      measuredSizeRef.current = { height, width };
      setMeasuredSize(measuredSizeRef.current);
    };

    syncMeasuredSize();

    const observer = new ResizeObserver(syncMeasuredSize);
    observer.observe(panel);

    return () => {
      observer.disconnect();
    };
  }, [open, panelRef, setMeasuredSize]);
};

export { EMPTY_SIZE, useMeasuredPanelSize };
export type { PanelSize };
