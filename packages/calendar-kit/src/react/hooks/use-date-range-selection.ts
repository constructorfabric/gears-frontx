import { useState } from "react";

import type { CalendarDate, CalendarDateRange } from "../../core/model";
import { orderDateRange } from "../../core/temporal";
import { useControlledValue } from "./use-controlled-value";

export interface UseDateRangeSelectionOptions {
  readonly value?: CalendarDateRange | null;
  readonly defaultValue?: CalendarDateRange | null;
  readonly onChange?: (range: CalendarDateRange | null) => void;
}

export interface UseDateRangeSelectionResult {
  /** The range being picked while an anchor is set, otherwise the committed range. */
  readonly range: CalendarDateRange | null;
  readonly anchor: CalendarDate | null;
  readonly press: (date: CalendarDate) => void;
  readonly hover: (date: CalendarDate) => void;
  readonly release: (date: CalendarDate) => void;
  readonly activate: (date: CalendarDate) => void;
  readonly cancel: () => void;
}

interface PickState {
  readonly anchor: CalendarDate;
  readonly hovered: CalendarDate;
  readonly dragging: boolean;
}

export const useDateRangeSelection = ({
  value,
  defaultValue = null,
  onChange,
}: UseDateRangeSelectionOptions): UseDateRangeSelectionResult => {
  const committed = useControlledValue<CalendarDateRange | null>({
    defaultValue,
    onChange,
    value,
  });

  const [pick, setPick] = useState<PickState | null>(null);

  const commit = (anchor: CalendarDate, date: CalendarDate): void => {
    setPick(null);
    committed.setValue(orderDateRange(anchor, date));
  };

  // A press while an anchor waits is the second click; otherwise it starts a drag.
  const press = (date: CalendarDate): void => {
    if (pick !== null && !pick.dragging) {
      commit(pick.anchor, date);

      return;
    }

    setPick({ anchor: date, dragging: true, hovered: date });
  };

  const hover = (date: CalendarDate): void => {
    setPick((current) =>
      current === null || current.hovered === date
        ? current
        : { ...current, hovered: date }
    );
  };

  // Releasing on the anchor keeps it waiting for a second click.
  const release = (date: CalendarDate): void => {
    if (pick === null || !pick.dragging) {
      return;
    }

    if (date === pick.anchor) {
      setPick({ ...pick, dragging: false });

      return;
    }

    commit(pick.anchor, date);
  };

  const activate = (date: CalendarDate): void => {
    if (pick === null) {
      setPick({ anchor: date, dragging: false, hovered: date });

      return;
    }

    commit(pick.anchor, date);
  };

  const cancel = (): void => {
    setPick(null);
  };

  return {
    activate,
    anchor: pick?.anchor ?? null,
    cancel,
    hover,
    press,
    range:
      pick === null
        ? committed.value
        : orderDateRange(pick.anchor, pick.hovered),
    release,
  };
};
