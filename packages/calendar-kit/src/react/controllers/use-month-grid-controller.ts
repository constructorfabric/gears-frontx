import { useCallback, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { isEventActionable } from "../../core/actionability";
import { arrayAt } from "../../core/array";
import {
  bucketSegmentsByMonthWeekRow,
  segmentAllDayEventAcrossViewerDates,
  segmentEventsAcrossViewerDates,
} from "../../core/grid";
import type { GridEvent, ViewerDateEventSegment } from "../../core/grid";
import { isGridNavigationKey, stepGridPosition } from "../../core/grid-keys";
import type {
  CalendarCell,
  CalendarDate,
  CalendarDirection,
  CalendarEvent,
  CalendarEventRenderContext,
  CalendarEventSegment,
  IanaTimeZone,
  UtcInstant,
} from "../../core/model";
import {
  buildDayRange,
  buildMonthRange,
  toUtcRange,
} from "../../core/temporal";
import { useControlledValue } from "../hooks/use-controlled-value";
import { useCurrentInstant } from "../hooks/use-current-instant";
import { buildMonthGridRows } from "./month-grid-view-model";
import type {
  MonthGridCell,
  MonthGridRow,
  MonthGridViewModelInput,
  TimedMonthSegment,
} from "./month-grid-view-model";

export type {
  MonthGridAllDaySpan,
  MonthGridCell,
  MonthGridRow,
} from "./month-grid-view-model";

export interface MonthGridFocusedCell {
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly eventId?: string;
}

type TimedCalendarEvent = Extract<CalendarEvent, { readonly allDay: false }>;
type AllDayCalendarEvent = Extract<CalendarEvent, { readonly allDay: true }>;
type AllDaySegmentEvent = GridEvent & { readonly source: AllDayCalendarEvent };
type TimedSegment = TimedMonthSegment;

interface MonthGridFocusedCellState extends MonthGridFocusedCell {
  readonly month: CalendarDate;
}

export interface MonthGridAnnouncement {
  readonly kind: "range" | "focus" | "overflow";
  readonly date?: CalendarDate;
  readonly eventId?: string;
  readonly eventCount?: number;
  readonly hiddenCount?: number;
}

export interface UseMonthGridControllerOptions {
  readonly date: CalendarDate;
  readonly events: readonly CalendarEvent[];
  readonly now?: UtcInstant;
  readonly timeZone: IanaTimeZone;
  readonly direction?: CalendarDirection;
  readonly cellHeight?: number;
  readonly densityCap?: number;
  readonly overflowByDate?: Readonly<Record<string, number>>;
  readonly selectedEventId?: string | null;
  readonly defaultSelectedEventId?: string | null;
  readonly onSelectedEventIdChange?: (eventId: string | null) => void;
  readonly onEventSelect?: (
    event: CalendarEvent,
    context: CalendarEventRenderContext,
    anchor?: HTMLElement
  ) => void;
}

export interface UseMonthGridControllerResult {
  readonly currentInstant: UtcInstant;
  readonly monthRange: ReturnType<typeof buildMonthRange>;
  readonly rows: readonly MonthGridRow[];
  readonly segments: readonly TimedSegment[];
  readonly allViewerDates: readonly CalendarDate[];
  readonly focusedCell: MonthGridFocusedCell;
  readonly selectedEventId: string | null;
  readonly selectedEvent: CalendarEvent | undefined;
  readonly announcement: MonthGridAnnouncement | null;
  readonly cellHeight: number;
  readonly setMeasuredCellHeight: (height: number) => void;
  readonly setCellRef: (
    rowIndex: number,
    columnIndex: number,
    element: HTMLElement | null
  ) => void;
  readonly setFocusedCell: (rowIndex: number, columnIndex: number) => void;
  readonly focusEvent: (
    rowIndex: number,
    columnIndex: number,
    eventId: string
  ) => void;
  readonly handleGridKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement>,
    rowIndex: number,
    columnIndex: number,
    eventId?: string
  ) => void;
  readonly selectEvent: (
    eventId: string,
    context?: CalendarEventRenderContext,
    anchor?: HTMLElement
  ) => void;
  readonly clearSelection: () => void;
  readonly getCellKey: (cell: CalendarCell) => string;
}

const DEFAULT_DIRECTION: CalendarDirection = "ltr";

const DEFAULT_CELL_HEIGHT = 135.2;

const EMPTY_OVERFLOW_BY_DATE: Readonly<Record<string, number>> = {};

const buildEventSegment = (
  event: CalendarEvent,
  timeZone: IanaTimeZone
): CalendarEventSegment => {
  if (event.allDay) {
    const range = toUtcRange(buildDayRange(event.startDate, timeZone));

    return {
      date: event.startDate,
      end: range.end,
      event,
      segment: null,
      start: range.start,
    };
  }

  return {
    date: event.startDate,
    end: event.end,
    event,
    segment: null,
    start: event.start,
  };
};

const cellHasEvent = (cell: MonthGridCell, eventId: string): boolean =>
  cell.allDayEventIds.includes(eventId) ||
  cell.visibleTimedEvents.some((segment) => segment.event.id === eventId);

const resolveFocusedCell = (
  focusedCell: MonthGridFocusedCellState,
  date: CalendarDate,
  currentCell: MonthGridCell | undefined
): MonthGridFocusedCell => {
  if (focusedCell.month !== date) {
    return { columnIndex: 0, rowIndex: 0 };
  }

  const focusedEventId = focusedCell.eventId;

  if (
    !currentCell ||
    typeof focusedEventId !== "string" ||
    cellHasEvent(currentCell, focusedEventId)
  ) {
    return focusedCell;
  }

  return {
    columnIndex: focusedCell.columnIndex,
    rowIndex: focusedCell.rowIndex,
  };
};

const visibleEventIdForCell = (
  cell: MonthGridCell,
  eventId: string | undefined
): string | undefined => {
  if (eventId === undefined) {
    return undefined;
  }

  const isVisible =
    cell.visibleTimedEvents.some((segment) => segment.event.id === eventId) ||
    cell.allDayEventIds.includes(eventId);

  return isVisible ? eventId : undefined;
};

const segmentTimedEvents = (
  events: readonly TimedCalendarEvent[],
  viewerDates: readonly CalendarDate[],
  timeZone: IanaTimeZone
): readonly TimedSegment[] => {
  const segments: TimedSegment[] = [];

  for (const event of events) {
    try {
      segments.push(
        ...segmentEventsAcrossViewerDates([event], viewerDates, timeZone)
      );
    } catch {
      continue;
    }
  }

  return segments;
};

const segmentAllDayEvents = (
  events: readonly AllDayCalendarEvent[],
  viewerDates: readonly CalendarDate[],
  timeZone: IanaTimeZone
): readonly ViewerDateEventSegment<AllDaySegmentEvent>[] => {
  const segments: ViewerDateEventSegment<AllDaySegmentEvent>[] = [];

  for (const event of events) {
    try {
      segments.push(
        ...segmentAllDayEventAcrossViewerDates(event, viewerDates, timeZone)
      );
    } catch {
      continue;
    }
  }

  return segments;
};

export const useMonthGridController = (
  options: UseMonthGridControllerOptions
): UseMonthGridControllerResult => {
  const direction = options.direction ?? DEFAULT_DIRECTION;
  const { currentInstant } = useCurrentInstant({
    cadence: "interval",
    intervalMs: 60_000,
    now: options.now,
  });
  const { onEventSelect, timeZone } = options;

  const [cellHeight, setCellHeight] = useState(
    options.cellHeight ?? DEFAULT_CELL_HEIGHT
  );

  const selectedState = useControlledValue<string | null>({
    defaultValue: options.defaultSelectedEventId ?? null,
    onChange: options.onSelectedEventIdChange,
    value: options.selectedEventId,
  });

  const [focusedCellState, setFocusedCellState] =
    useState<MonthGridFocusedCellState>({
      columnIndex: 0,
      month: options.date,
      rowIndex: 0,
    });

  const cellElementsRef = useRef(new Map<string, HTMLElement>());

  const monthRange = useMemo(
    () => buildMonthRange(options.date, options.timeZone),
    [options.date, options.timeZone]
  );

  const monthRows = useMemo(
    () => bucketSegmentsByMonthWeekRow([], options.date, options.timeZone).rows,
    [options.date, options.timeZone]
  );

  const allViewerDates = useMemo(
    () => monthRows.flatMap((row) => row.dates),
    [monthRows]
  );

  const { timedEvents, allDayEvents } = useMemo(() => {
    const timed: TimedCalendarEvent[] = [];

    const allDay: AllDayCalendarEvent[] = [];

    for (const event of options.events) {
      if (event.allDay) {
        allDay.push(event);
      } else {
        timed.push(event);
      }
    }

    return { allDayEvents: allDay, timedEvents: timed };
  }, [options.events]);

  const timedSegments = useMemo(
    () => segmentTimedEvents(timedEvents, allViewerDates, options.timeZone),
    [allViewerDates, options.timeZone, timedEvents]
  );

  const allDaySegments = useMemo(
    () => segmentAllDayEvents(allDayEvents, allViewerDates, options.timeZone),
    [allDayEvents, allViewerDates, options.timeZone]
  );

  const rows = useMemo<readonly MonthGridRow[]>(() => {
    const input: MonthGridViewModelInput = {
      allDaySegments,
      cellHeight,
      densityCap: options.densityCap,
      monthRange,
      monthRows,
      overflowByDate: options.overflowByDate ?? EMPTY_OVERFLOW_BY_DATE,
      timeZone: options.timeZone,
      timedSegments,
    };

    return buildMonthGridRows(input);
  }, [
    allDaySegments,
    cellHeight,
    monthRange,
    monthRows,
    options.densityCap,
    options.overflowByDate,
    options.timeZone,
    timedSegments,
  ]);

  const eventById = useMemo(() => {
    const map = new Map<string, CalendarEvent>();

    for (const event of options.events) {
      if (!map.has(event.id)) {
        map.set(event.id, event);
      }
    }

    return map;
  }, [options.events]);

  const { setValue: setSelectedEventId, value: selectedEventId } =
    selectedState;

  const selectedEvent =
    selectedEventId === null ? undefined : eventById.get(selectedEventId);

  const getCellKey = useCallback(
    (cell: CalendarCell): string => `month:${cell.date}`,
    []
  );

  const focusPosition = useCallback(
    (rowIndex: number, columnIndex: number): void => {
      const row = rowIndex < 0 ? undefined : arrayAt(rows, rowIndex);

      const cell = arrayAt(row?.cells ?? [], columnIndex);

      if (!cell) {
        return;
      }

      setFocusedCellState({ columnIndex, month: options.date, rowIndex });
      cellElementsRef.current.get(getCellKey(cell.cell))?.focus();
    },
    [getCellKey, options.date, rows]
  );

  const setFocusedCell = (rowIndex: number, columnIndex: number): void => {
    if (
      !arrayAt(
        rowIndex < 0 ? [] : (arrayAt(rows, rowIndex)?.cells ?? []),
        columnIndex
      )
    ) {
      return;
    }

    setFocusedCellState({ columnIndex, month: options.date, rowIndex });
  };

  const focusEvent = useCallback(
    (rowIndex: number, columnIndex: number, eventId: string): void => {
      if (
        arrayAt(
          rowIndex < 0 ? [] : (arrayAt(rows, rowIndex)?.cells ?? []),
          columnIndex
        ) === null ||
        arrayAt(
          rowIndex < 0 ? [] : (arrayAt(rows, rowIndex)?.cells ?? []),
          columnIndex
        ) === undefined
      ) {
        return;
      }

      setFocusedCellState({
        columnIndex,
        eventId,
        month: options.date,
        rowIndex,
      });
    },
    [options.date, rows]
  );

  const setMeasuredCellHeight = useCallback((height: number): void => {
    if (!Number.isFinite(height) || height <= 0) {
      return;
    }

    setCellHeight((current) => (current === height ? current : height));
  }, []);

  // Register only: measuring here loops (React #185).
  const setCellRef = useCallback(
    (
      rowIndex: number,
      columnIndex: number,
      element: HTMLElement | null
    ): void => {
      const cell = arrayAt(
        rowIndex < 0 ? [] : (arrayAt(rows, rowIndex)?.cells ?? []),
        columnIndex
      )?.cell;

      if (!cell) {
        return;
      }

      const key = getCellKey(cell);

      if (!element) {
        cellElementsRef.current.delete(key);

        return;
      }

      cellElementsRef.current.set(key, element);
    },
    [getCellKey, rows]
  );

  const selectEvent = useCallback(
    (
      eventId: string,
      context?: CalendarEventRenderContext,
      anchor?: HTMLElement
    ): void => {
      const event = eventById.get(eventId);

      if (!event || !isEventActionable(event)) {
        return;
      }

      setSelectedEventId(event.id);
      onEventSelect?.(
        event,
        context ?? {
          conflicts: event.conflicts ?? [],
          event,
          isAvailable: true,
          isPast:
            !event.allDay && Date.parse(event.end) < Date.parse(currentInstant),
          isReadOnly: false,
          isSelected: selectedEventId === event.id,
          segment: buildEventSegment(event, timeZone),
        },
        anchor
      );
    },
    [
      currentInstant,
      eventById,
      onEventSelect,
      selectedEventId,
      setSelectedEventId,
      timeZone,
    ]
  );

  const clearSelection = useCallback((): void => {
    setSelectedEventId(null);
  }, [setSelectedEventId]);

  const handleGridKeyDown = useCallback(
    (
      event: ReactKeyboardEvent<HTMLDivElement>,
      rowIndex: number,
      columnIndex: number,
      eventId?: string
    ): void => {
      const currentRow = arrayAt(rows, rowIndex);

      if (!currentRow) {
        return;
      }

      if (
        (event.key === "Enter" || event.key === " ") &&
        typeof eventId === "string"
      ) {
        event.preventDefault();

        if (!event.repeat) {
          selectEvent(
            eventId,
            undefined,
            event.target instanceof HTMLElement ? event.target : undefined
          );
        }

        return;
      }

      if (!isGridNavigationKey(event.key)) {
        return;
      }

      event.preventDefault();

      const next = stepGridPosition(
        event.key,
        direction,
        { columnIndex, rowIndex },
        currentRow.cells.length
      );

      const nextRow =
        next.rowIndex < 0 ? undefined : arrayAt(rows, next.rowIndex);

      if (nextRow) {
        focusPosition(
          next.rowIndex,
          Math.max(0, Math.min(nextRow.cells.length - 1, next.columnIndex))
        );
      }
    },
    [direction, focusPosition, rows, selectEvent]
  );

  const currentFocusedCell =
    rows[focusedCellState.rowIndex]?.cells[focusedCellState.columnIndex];

  const resolvedFocusedCell = resolveFocusedCell(
    focusedCellState,
    options.date,
    currentFocusedCell
  );

  const focusedEventId = resolvedFocusedCell.eventId;

  const publicFocusedCell: MonthGridFocusedCell =
    typeof focusedEventId === "string"
      ? {
          columnIndex: resolvedFocusedCell.columnIndex,
          eventId: focusedEventId,
          rowIndex: resolvedFocusedCell.rowIndex,
        }
      : {
          columnIndex: resolvedFocusedCell.columnIndex,
          rowIndex: resolvedFocusedCell.rowIndex,
        };

  const announcementCell = arrayAt(
    resolvedFocusedCell.rowIndex < 0
      ? []
      : (arrayAt(rows, resolvedFocusedCell.rowIndex)?.cells ?? []),
    resolvedFocusedCell.columnIndex
  );

  const announcement = announcementCell
    ? {
        date: announcementCell.date,
        eventCount: announcementCell.eventCount,
        eventId: visibleEventIdForCell(
          announcementCell,
          resolvedFocusedCell.eventId
        ),
        hiddenCount: announcementCell.hiddenCount,
        kind: "focus" as const,
      }
    : null;

  return {
    allViewerDates,
    announcement,
    cellHeight,
    clearSelection,
    currentInstant,
    focusEvent,
    focusedCell: publicFocusedCell,
    getCellKey,
    handleGridKeyDown,
    monthRange,
    rows,
    segments: timedSegments,
    selectEvent,
    selectedEvent,
    selectedEventId,
    setCellRef,
    setFocusedCell,
    setMeasuredCellHeight,
  };
};
