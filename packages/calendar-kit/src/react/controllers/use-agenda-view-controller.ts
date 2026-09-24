import { useCallback, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import type {
  CalendarDate,
  CalendarEvent,
  CalendarEventRenderContext,
  IanaTimeZone,
  UtcInstant,
} from "../../core/model";
import { toViewerDateTime } from "../../core/temporal";
import {
  buildAgendaModel,
  buildAgendaRenderContext,
  isRowAvailable,
} from "../../ui/agenda-view/agenda-rows";
import type {
  AgendaDayGroup,
  AgendaEventRow,
  AgendaWindowRange,
} from "../../ui/agenda-view/agenda-rows";
import { useControlledValue } from "../hooks/use-controlled-value";
import { useCurrentInstant } from "../hooks/use-current-instant";

export interface AgendaViewControllerInput {
  readonly date: CalendarDate;
  readonly timeZone: IanaTimeZone;
  readonly events: readonly CalendarEvent[];
  readonly onEventSelect?: (
    event: CalendarEvent,
    context: CalendarEventRenderContext,
    anchor?: HTMLElement
  ) => void;
  readonly selectedEventId?: string | null;
  readonly defaultSelectedEventId?: string | null;
  readonly onSelectedEventIdChange?: (eventId: string | null) => void;
  readonly now?: UtcInstant;
}

export type AgendaAnnouncement =
  | { readonly kind: "range" }
  | { readonly kind: "focus"; readonly rowIndex: number };

export interface AgendaViewController {
  readonly windowRange: AgendaWindowRange;
  readonly currentInstant: UtcInstant;
  readonly todayDate: CalendarDate;
  readonly dayGroups: readonly AgendaDayGroup[];
  readonly eventRows: readonly AgendaEventRow[];
  readonly hasEvents: boolean;
  readonly selectedEventId: string | null;
  readonly focusedRowIndex: number;
  readonly announcement: AgendaAnnouncement;
  readonly setRowRef: (index: number, element: HTMLElement | null) => void;
  readonly focusRow: (index: number) => void;
  readonly handleRowKeyDown: (
    event: ReactKeyboardEvent,
    index: number,
    eventId: string
  ) => void;
  readonly selectEvent: (eventId: string, anchor?: HTMLElement) => void;
  readonly announceRow: (rowIndex: number) => void;
}

const clampIndex = (index: number, length: number): number => {
  if (length === 0) {
    return -1;
  }

  return Math.max(0, Math.min(index, length - 1));
};

export const useAgendaViewController = (
  input: AgendaViewControllerInput
): AgendaViewController => {
  const {
    date,
    timeZone,
    events,
    onEventSelect,
    selectedEventId,
    defaultSelectedEventId = null,
    onSelectedEventIdChange,
    now,
  } = input;

  const { currentInstant } = useCurrentInstant({
    cadence: "interval",
    intervalMs: 30_000,
    now,
  });

  const todayDate = useMemo(
    () => toViewerDateTime(currentInstant, timeZone).date,
    [currentInstant, timeZone]
  );

  const model = useMemo(() => {
    try {
      return buildAgendaModel({ date, events, now: currentInstant, timeZone });
    } catch {
      return buildAgendaModel({
        date,
        events: [],
        now: currentInstant,
        timeZone,
      });
    }
  }, [date, timeZone, events, currentInstant]);

  const { windowRange, dayGroups, eventRows, hasEvents } = model;

  const eventRowById = useMemo(() => {
    const rowsById = new Map<string, AgendaEventRow>();

    for (const row of eventRows) {
      if (!rowsById.has(row.event.id)) {
        rowsById.set(row.event.id, row);
      }
    }

    return rowsById;
  }, [eventRows]);

  const selection = useControlledValue<string | null>({
    defaultValue: defaultSelectedEventId,
    onChange: onSelectedEventIdChange,
    value: selectedEventId,
  });

  const [focusedRowIndex, setFocusedRowIndex] = useState(() =>
    eventRows.length > 0 ? 0 : -1
  );

  const [announcement, setAnnouncement] = useState<AgendaAnnouncement>({
    kind: "range",
  });

  const rowRefs = useRef<Map<number, HTMLElement>>(new Map());

  const signature = `${windowRange.start}:${eventRows.length}`;

  const [previousSignature, setPreviousSignature] = useState(signature);

  if (signature !== previousSignature) {
    setPreviousSignature(signature);
    setFocusedRowIndex(eventRows.length > 0 ? 0 : -1);
    setAnnouncement({ kind: "range" });
  }

  const setRowRef = useCallback(
    (index: number, element: HTMLElement | null): void => {
      if (element === null) {
        rowRefs.current.delete(index);
        return;
      }

      rowRefs.current.set(index, element);
    },
    []
  );

  const focusRow = useCallback(
    (index: number): void => {
      const clamped = clampIndex(index, eventRows.length);

      setFocusedRowIndex(clamped);
      setAnnouncement({ kind: "focus", rowIndex: clamped });
      rowRefs.current.get(clamped)?.focus();
    },
    [eventRows.length]
  );

  const { setValue: setSelectedEventId } = selection;

  const selectEvent = useCallback(
    (eventId: string, anchor?: HTMLElement): void => {
      const row = eventRowById.get(eventId);

      if (row === undefined || !isRowAvailable(row)) {
        return;
      }

      setSelectedEventId(eventId);
      onEventSelect?.(row.event, buildAgendaRenderContext(row, true), anchor);
    },
    [eventRowById, onEventSelect, setSelectedEventId]
  );

  const announceRow = useCallback((rowIndex: number): void => {
    setAnnouncement({ kind: "focus", rowIndex });
  }, []);

  const handleRowKeyDown = useCallback(
    (event: ReactKeyboardEvent, index: number, eventId: string): void => {
      switch (event.key) {
        case "ArrowDown": {
          event.preventDefault();
          focusRow(index + 1);
          break;
        }
        case "ArrowUp": {
          event.preventDefault();
          focusRow(index - 1);
          break;
        }
        case "Enter":
        case " ": {
          event.preventDefault();
          selectEvent(
            eventId,
            event.currentTarget instanceof HTMLElement
              ? event.currentTarget
              : undefined
          );

          break;
        }
        default: {
          break;
        }
      }
    },
    [focusRow, selectEvent]
  );

  return {
    announceRow,
    announcement,
    currentInstant,
    dayGroups,
    eventRows,
    focusRow,
    focusedRowIndex,
    handleRowKeyDown,
    hasEvents,
    selectEvent,
    selectedEventId: selection.value,
    setRowRef,
    todayDate,
    windowRange,
  };
};
