import { useCallback, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { isEventActionable } from "../../core/actionability";
import { arrayAt } from "../../core/array";
import { rangesOverlap } from "../../core/event-overlap";
import { buildSelectionRange } from "../../core/interactions";
import { layoutTimedEvents } from "../../core/layout";
import type {
  CalendarCell,
  CalendarDate,
  CalendarDirection,
  CalendarEvent,
  CalendarEventRenderContext,
  CalendarSlotMinutes,
  CalendarTimeWindow,
  IanaTimeZone,
  UtcInstant,
  UtcRange,
  ViewerDaySegment,
} from "../../core/model";
import {
  DEFAULT_SLOT_MINUTES,
  DEFAULT_WORKING_HOURS,
  FULL_DAY_TIME_WINDOW,
  addCalendarDays,
  assertTimeWindow,
  buildDayRange,
  buildSlotStarts,
  buildTimeWindowRange,
  compareUtcInstants,
  isWithinTimeWindow,
  splitUtcRangeByViewerDay,
  toUtcRange,
  toViewerDateTime,
} from "../../core/temporal";
import { useControlledValue } from "../hooks/use-controlled-value";
import { useCurrentInstant } from "../hooks/use-current-instant";
import type { CalendarQuickCreatePayload } from "../slots";
import { buildDayGridViewModel } from "./day-grid-view-model";
import type {
  AllDaySegment,
  DayGridViewModelInput,
  DaySegment,
  TimedEventPlacement,
  TimedSegment,
} from "./day-grid-view-model";

export type {
  AllDaySegment,
  DaySegment,
  TimedEventPlacement,
  TimedSegment,
} from "./day-grid-view-model";

const UPDATE_INTERVAL_MS = 30_000;

export interface DayGridControllerParams {
  readonly date: CalendarDate;
  readonly events: readonly CalendarEvent[];
  readonly timeZone: IanaTimeZone;
  readonly now?: UtcInstant;
  readonly direction?: CalendarDirection;
  readonly visibleHours?: CalendarTimeWindow;
  readonly slotMinutes?: CalendarSlotMinutes;
  readonly workingHours?: CalendarTimeWindow;
  readonly interactionMode?: "quick-create" | "read-only";
  readonly defaultInteractionMode?: "quick-create" | "read-only";
  readonly onInteractionModeChange?: (
    mode: "quick-create" | "read-only"
  ) => void;
  readonly selectedEventId?: string | null;
  readonly defaultSelectedEventId?: string | null;
  readonly onSelectedEventIdChange?: (eventId: string | null) => void;
  readonly onEventSelect?: (
    event: CalendarEvent,
    context: CalendarEventRenderContext,
    anchor?: HTMLElement
  ) => void;
  readonly onQuickCreate?: (payload: CalendarQuickCreatePayload) => void;
}

export interface DayGridControllerInternals {
  readonly eventById: ReadonlyMap<string, CalendarEvent>;
  readonly focusedCellIndex: number;
}

export interface UseDayGridControllerResult {
  readonly utcDayRange: ReturnType<typeof toUtcRange>;
  readonly axisRange: UtcRange;
  readonly currentInstant: UtcInstant;
  readonly axisStartEpoch: number;
  readonly axisDuration: number;
  readonly isToday: boolean;
  readonly isWorkingDay: boolean;
  readonly slotStarts: readonly UtcInstant[];
  readonly workingSlots: readonly boolean[];
  readonly allDaySegments: readonly AllDaySegment[];
  readonly timedEvents: readonly TimedEventPlacement[];
  readonly hasEvents: boolean;
  readonly nowPercent: number | null;
  readonly focusedCellIndex: number;
  readonly announcement: string;
  readonly interactionMode: "quick-create" | "read-only";
  readonly selectedEventId: string | null;
  readonly setInteractionMode: (mode: "quick-create" | "read-only") => void;
  readonly setCellRef: (index: number, element: HTMLDivElement | null) => void;
  readonly setBodyRef: (element: HTMLDivElement | null) => void;
  readonly focusCell: (index: number) => void;
  readonly setAnnouncement: (announcement: string) => void;
  readonly handleCellKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement>,
    index: number
  ) => void;
  readonly selectEmptyCell: (
    index: number,
    anchor: HTMLDivElement,
    anchorRect?: DOMRectReadOnly
  ) => void;
  readonly selectEvent: (
    eventId: string,
    context?: CalendarEventRenderContext,
    anchor?: HTMLElement
  ) => void;
  readonly getInternals: () => Readonly<DayGridControllerInternals>;
}

const DEFAULT_MODE = "quick-create" as const;

const resolveAllDaySegment = (
  continuesBefore: boolean,
  continuesAfter: boolean
): ViewerDaySegment["segment"] => {
  if (continuesBefore && continuesAfter) {
    return "middle";
  }
  if (continuesBefore) {
    return "end";
  }
  if (continuesAfter) {
    return "start";
  }
  return null;
};

const nextCalendarDate = (date: CalendarDate): CalendarDate =>
  addCalendarDays(date, 1);

const isAllDaySegment = (segment: DaySegment): segment is AllDaySegment =>
  segment.event.allDay;

const isTimedSegment = (segment: DaySegment): segment is TimedSegment =>
  !segment.event.allDay;

const segmentEventForDay = (
  event: CalendarEvent,
  date: CalendarDate,
  dayStart: UtcInstant,
  dayEnd: UtcInstant,
  timeZone: IanaTimeZone
): readonly DaySegment[] => {
  if (event.allDay) {
    if (event.endDate <= date || event.startDate > date) {
      return [];
    }
    return [
      {
        date,
        end: dayEnd,
        event,
        segment: resolveAllDaySegment(
          event.startDate !== date,
          nextCalendarDate(date) !== event.endDate
        ),
        start: dayStart,
      },
    ];
  }

  if (
    compareUtcInstants(event.end, dayStart) <= 0 ||
    compareUtcInstants(event.start, dayEnd) >= 0
  ) {
    return [];
  }

  const daySegment = splitUtcRangeByViewerDay(
    event.start,
    event.end,
    timeZone
  ).find((segment) => segment.date === date);

  if (!daySegment) {
    return [];
  }

  const start =
    compareUtcInstants(daySegment.start, dayStart) > 0
      ? daySegment.start
      : dayStart;

  const end =
    compareUtcInstants(daySegment.end, dayEnd) < 0 ? daySegment.end : dayEnd;

  return [{ date, end, event, segment: daySegment.segment, start }];
};

const clipTimedSegment = (
  segment: TimedSegment,
  range: UtcRange
): TimedSegment | undefined => {
  const start =
    compareUtcInstants(segment.start, range.start) > 0
      ? segment.start
      : range.start;

  const end =
    compareUtcInstants(segment.end, range.end) < 0 ? segment.end : range.end;

  return compareUtcInstants(start, end) < 0
    ? { ...segment, end, start }
    : undefined;
};

const getWeekday = (date: CalendarDate): number =>
  new Date(`${date}T00:00:00.000Z`).getUTCDay();

const resolveNavigationTarget = (
  key: string,
  index: number,
  length: number
): number | undefined => {
  switch (key) {
    case "ArrowDown": {
      return index + 1;
    }
    case "ArrowUp": {
      return index - 1;
    }
    case "Home": {
      return 0;
    }
    case "End": {
      return length - 1;
    }
    default: {
      return undefined;
    }
  }
};

export const useDayGridController = (
  options: DayGridControllerParams
): UseDayGridControllerResult => {
  const {
    date,
    events,
    timeZone,
    now,
    interactionMode,
    defaultInteractionMode = DEFAULT_MODE,
    onInteractionModeChange,
    selectedEventId,
    defaultSelectedEventId = null,
    onSelectedEventIdChange,
    onEventSelect,
    onQuickCreate,
  } = options;

  const slotMinutes = options.slotMinutes ?? DEFAULT_SLOT_MINUTES;
  const { end: visibleEnd, start: visibleStart } =
    options.visibleHours ?? FULL_DAY_TIME_WINDOW;
  const { end: workingEnd, start: workingStart } =
    options.workingHours ?? DEFAULT_WORKING_HOURS;

  const modeState = useControlledValue<"quick-create" | "read-only">({
    defaultValue: defaultInteractionMode,
    onChange: onInteractionModeChange,
    value: interactionMode,
  });

  const selectedState = useControlledValue<string | null>({
    defaultValue: defaultSelectedEventId,
    onChange: onSelectedEventIdChange,
    value: selectedEventId,
  });
  const { setValue: setSelectedEventId, value: selectedEventIdValue } =
    selectedState;

  const { currentInstant } = useCurrentInstant({
    cadence: "interval",
    intervalMs: UPDATE_INTERVAL_MS,
    now,
  });

  const [announcement, setAnnouncement] = useState("");

  const cellRefs = useRef(new Map<number, HTMLDivElement>());
  const positionedDateRef = useRef<CalendarDate | null>(null);

  const dayRange = useMemo(
    () => buildDayRange(date, timeZone),
    [date, timeZone]
  );

  const utcDayRange = useMemo(() => toUtcRange(dayRange), [dayRange]);

  const axisRange = useMemo(() => {
    const window = { end: visibleEnd, start: visibleStart };
    assertTimeWindow(window, slotMinutes);

    return buildTimeWindowRange(date, timeZone, window);
  }, [date, slotMinutes, timeZone, visibleEnd, visibleStart]);

  const slotStarts = useMemo(
    () => buildSlotStarts(axisRange, slotMinutes),
    [axisRange, slotMinutes]
  );

  const axisStartEpoch = Date.parse(axisRange.start);
  const axisDuration = Date.parse(axisRange.end) - axisStartEpoch;

  const isToday = useMemo(
    () => toViewerDateTime(currentInstant, timeZone).date === date,
    [currentInstant, timeZone, date]
  );

  const isWorkingDay = getWeekday(date) >= 1 && getWeekday(date) <= 5;

  const nowElapsed = Date.parse(currentInstant) - axisStartEpoch;

  // The marker is the viewer's current day only, and only while now is inside the visible hours.
  const nowPercent =
    isToday && nowElapsed >= 0 && nowElapsed < axisDuration
      ? (nowElapsed / axisDuration) * 100
      : null;

  const workingSlots = useMemo(() => {
    const window = { end: workingEnd, start: workingStart };

    return slotStarts.map((instant) =>
      isWithinTimeWindow(toViewerDateTime(instant, timeZone).time, window)
    );
  }, [slotStarts, timeZone, workingEnd, workingStart]);

  const workingSlotIndex = Math.max(workingSlots.findIndex(Boolean), 0);

  const [focusedCellIndex, setFocusedCellIndex] = useState(workingSlotIndex);

  const daySegments = useMemo(() => {
    const segments: DaySegment[] = [];

    for (const event of events) {
      try {
        segments.push(
          ...segmentEventForDay(
            event,
            date,
            utcDayRange.start,
            utcDayRange.end,
            timeZone
          )
        );
      } catch {
        continue;
      }
    }

    return segments;
  }, [date, events, timeZone, utcDayRange.end, utcDayRange.start]);

  const eventById = useMemo(() => {
    const map = new Map<string, CalendarEvent>();

    for (const event of events) {
      if (!map.has(event.id)) {
        map.set(event.id, event);
      }
    }

    return map;
  }, [events]);

  const { allDaySegments, timedSegments } = useMemo(() => {
    const allDay: AllDaySegment[] = [];

    const timed: TimedSegment[] = [];

    for (const segment of daySegments) {
      if (isAllDaySegment(segment)) {
        allDay.push(segment);
      } else if (isTimedSegment(segment)) {
        const clipped = clipTimedSegment(segment, axisRange);

        if (clipped !== undefined) {
          timed.push(clipped);
        }
      }
    }

    return { allDaySegments: allDay, timedSegments: timed };
  }, [axisRange, daySegments]);

  const timedGeometryByEventId = useMemo(() => {
    const geometry = layoutTimedEvents(
      timedSegments.map((segment) => ({
        end: segment.end,
        id: segment.event.id,
        start: segment.start,
      }))
    );

    return new Map(
      geometry.map(
        (eventGeometry) => [eventGeometry.id, eventGeometry] as const
      )
    );
  }, [timedSegments]);

  const dayViewModel = useMemo(() => {
    const input: DayGridViewModelInput = {
      axisDuration,
      axisStartEpoch,
      currentInstant,
      date,
      daySegments,
      readOnly: modeState.value === "read-only",
      selectedEventId: selectedEventIdValue,
      timeZone,
      timedGeometryByEventId,
      timedSegments,
    };

    return buildDayGridViewModel(input);
  }, [
    currentInstant,
    date,
    axisDuration,
    daySegments,
    axisStartEpoch,
    modeState.value,
    selectedEventIdValue,
    timeZone,
    timedGeometryByEventId,
    timedSegments,
  ]);

  const { timedEvents } = dayViewModel;

  const setCellRef = useCallback(
    (index: number, element: HTMLDivElement | null): void => {
      if (element) {
        cellRefs.current.set(index, element);
      } else {
        cellRefs.current.delete(index);
      }
    },
    []
  );

  const setBodyRef = useCallback(
    (element: HTMLDivElement | null): void => {
      if (!element) {
        return;
      }
      if (positionedDateRef.current === date) {
        return;
      }

      positionedDateRef.current = date;
      element.scrollTop =
        (element.scrollHeight / slotStarts.length) * workingSlotIndex;
    },
    [date, slotStarts.length, workingSlotIndex]
  );

  const focusCell = useCallback(
    (index: number): void => {
      const boundedIndex = Math.max(0, Math.min(slotStarts.length - 1, index));
      setFocusedCellIndex(boundedIndex);
      cellRefs.current.get(boundedIndex)?.focus();
    },
    [slotStarts.length]
  );

  const findTimedEventAtCell = useCallback(
    (cell: CalendarCell): TimedSegment | undefined =>
      timedSegments.find((segment) =>
        rangesOverlap(
          { end: segment.end, start: segment.start },
          { end: cell.end, start: cell.start }
        )
      ),
    [timedSegments]
  );

  const cellForIndex = useCallback(
    (index: number): CalendarCell | undefined => {
      const start = arrayAt(slotStarts, index);

      if (start === undefined) {
        return undefined;
      }

      const end = slotStarts[index + 1] ?? axisRange.end;
      const startTime = toViewerDateTime(start, timeZone).time;
      const endTime = toViewerDateTime(end, timeZone).time;

      return { date, end, endTime, start, startTime };
    },
    [axisRange.end, date, slotStarts, timeZone]
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

      const resolvedContext = context ?? dayViewModel.buildEventContext(event);

      if (!resolvedContext) {
        return;
      }

      setSelectedEventId(event.id);
      onEventSelect?.(event, resolvedContext, anchor);
    },
    [dayViewModel, eventById, onEventSelect, setSelectedEventId]
  );

  const selectEmptyCell = useCallback(
    (
      index: number,
      anchor: HTMLDivElement,
      anchorRect?: DOMRectReadOnly
    ): void => {
      if (modeState.value !== "quick-create") {
        return;
      }

      const cell = cellForIndex(index);

      if (!cell || findTimedEventAtCell(cell)) {
        return;
      }

      const range = buildSelectionRange(cell, cell);

      if (!range) {
        return;
      }

      onQuickCreate?.({
        anchorRect: anchorRect ?? anchor.getBoundingClientRect(),
        range,
      });
    },
    [cellForIndex, findTimedEventAtCell, modeState.value, onQuickCreate]
  );

  const handleCellKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>, index: number): void => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectEmptyCell(index, event.currentTarget);
        return;
      }

      const navigationTarget = resolveNavigationTarget(
        event.key,
        index,
        slotStarts.length
      );

      if (navigationTarget === undefined) {
        return;
      }

      event.preventDefault();
      focusCell(navigationTarget);
    },
    [focusCell, slotStarts.length, selectEmptyCell]
  );

  const getInternals = (): Readonly<DayGridControllerInternals> => ({
    eventById,
    focusedCellIndex,
  });

  return {
    allDaySegments,
    announcement,
    axisDuration,
    axisRange,
    axisStartEpoch,
    currentInstant,
    focusCell,
    focusedCellIndex,
    getInternals,
    handleCellKeyDown,
    hasEvents: daySegments.length > 0,
    interactionMode: modeState.value,
    isToday,
    isWorkingDay,
    nowPercent,
    selectEmptyCell,
    selectEvent,
    selectedEventId: selectedEventIdValue,
    setAnnouncement,
    setBodyRef,
    setCellRef,
    setInteractionMode: modeState.setValue,
    slotStarts,
    timedEvents,
    utcDayRange,
    workingSlots,
  };
};
