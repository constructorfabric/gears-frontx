// @cpt-flow:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1
// @cpt-algo:cpt-frontx-calendar-kit-algo-week-grid-mode-gating:p1
// @cpt-algo:cpt-frontx-calendar-kit-algo-week-grid-paint-range:p1
// @cpt-algo:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1
// @cpt-state:cpt-frontx-calendar-kit-state-week-grid-interaction-mode:p2
// @cpt-state:cpt-frontx-calendar-kit-state-week-grid-pending-move:p2
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-host-data-boundary:p1
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-mode-callbacks:p1
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-keyboard:p1
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isEventActionable } from "../../core/actionability";
import { arrayAt } from "../../core/array";
import { rangesOverlap } from "../../core/event-overlap";
import type { InteractionState } from "../../core/interactions";
import type {
  CalendarCell,
  CalendarDate,
  CalendarDirection,
  CalendarEvent,
  CalendarEventRenderContext,
  CalendarMoveRequest,
  CalendarSelectionRange,
  CalendarSlotMinutes,
  CalendarTimeWindow,
  IanaTimeZone,
  UtcRange,
  WeekGridInteractionMode,
} from "../../core/model";
import {
  DEFAULT_SLOT_MINUTES,
  DEFAULT_WORKING_HOURS,
  FULL_DAY_TIME_WINDOW,
  addCalendarDays,
  assertTimeWindow,
  buildSlotStarts,
  buildTimeWindowRange,
  buildWeekRange,
  countWindowSlots,
  isWithinTimeWindow,
  toViewerDateTime,
} from "../../core/temporal";
import { useControlledValue } from "../hooks/use-controlled-value";
import { useInteractionController } from "../hooks/use-interaction-controller";
import type { InteractionControllerInternals } from "../hooks/use-interaction-controller";
import type { CalendarQuickCreatePayload } from "../slots";

export interface FocusedCell {
  readonly rowIndex: number;
  readonly columnIndex: number;
}

export interface WeekGridDayColumn {
  readonly date: CalendarDate;
  readonly range: UtcRange;
  readonly slots: readonly CalendarCell[];
}

export interface UseWeekGridControllerOptions<Payload = unknown> {
  readonly date: CalendarDate;
  readonly events: readonly CalendarEvent<Payload>[];
  readonly timeZone: IanaTimeZone;
  readonly direction?: CalendarDirection;
  readonly visibleDays?: 5 | 7;
  readonly visibleHours?: CalendarTimeWindow;
  readonly slotMinutes?: CalendarSlotMinutes;
  readonly workingHours?: CalendarTimeWindow;
  readonly interactionMode?: WeekGridInteractionMode;
  readonly defaultInteractionMode?: WeekGridInteractionMode;
  readonly onInteractionModeChange?: (mode: WeekGridInteractionMode) => void;
  readonly selectedEventId?: string | null;
  readonly defaultSelectedEventId?: string | null;
  readonly onSelectedEventIdChange?: (eventId: string | null) => void;
  readonly onEventSelect?: (
    event: CalendarEvent<Payload>,
    context: CalendarEventRenderContext<Payload>,
    anchor?: HTMLElement
  ) => void;
  readonly onQuickCreate?: (payload: CalendarQuickCreatePayload) => void;
  readonly onPaintSelect?: (range: CalendarSelectionRange) => void;
  readonly onMoveRequest?: (request: CalendarMoveRequest) => void;
}

export interface WeekGridControllerInternals<Payload = unknown> {
  readonly interaction: Readonly<InteractionControllerInternals>;
  readonly originFocusKey: string | null;
  readonly eventById: ReadonlyMap<string, CalendarEvent<Payload>>;
}

export interface UseWeekGridControllerResult<Payload = unknown> {
  readonly interactionMode: WeekGridInteractionMode;
  readonly selectedEventId: string | null;
  readonly selectedEvent: CalendarEvent<Payload> | undefined;
  readonly allViewerDates: readonly CalendarDate[];
  readonly viewerDates: readonly CalendarDate[];
  readonly hiddenDateCount: number;
  readonly dayColumns: readonly WeekGridDayColumn[];
  readonly focusedCell: FocusedCell;
  readonly pendingMove: InteractionControllerInternals["state"]["pendingMove"];
  readonly committedMove: InteractionControllerInternals["state"]["committedMove"];
  readonly paint: CalendarSelectionRange | null;
  readonly setInteractionMode: (mode: WeekGridInteractionMode) => void;
  readonly workingHours: CalendarTimeWindow;
  readonly workingSlotIndex: number;
  readonly slotRowCount: number;
  readonly selectEvent: (
    eventId: string,
    context?: CalendarEventRenderContext<Payload>,
    anchor?: HTMLElement
  ) => void;
  readonly clearSelection: () => void;
  readonly getCell: (
    columnIndex: number,
    rowIndex: number
  ) => CalendarCell | undefined;
  readonly getCellKey: (cell: CalendarCell) => string;
  readonly setFocusedCell: (position: FocusedCell) => void;
  readonly activateCell: (
    columnIndex: number,
    rowIndex: number,
    anchorRect?: DOMRectReadOnly
  ) => CalendarSelectionRange | null;
  readonly beginPaint: (columnIndex: number, rowIndex: number) => void;
  readonly updatePaint: (columnIndex: number, rowIndex: number) => void;
  readonly endPaint: () => void;
  readonly cancelPaint: () => void;
  readonly beginMove: (
    eventId: string,
    from: CalendarCell,
    to?: CalendarCell
  ) => void;
  readonly updateMove: (cell: CalendarCell) => void;
  readonly endMove: () => void;
  readonly confirmMove: () => void;
  readonly cancelMove: () => void;
  readonly getInternals: () => Readonly<WeekGridControllerInternals<Payload>>;
}

const DEFAULT_VISIBLE_DAYS = 5;

const DEFAULT_INTERACTION_MODE: WeekGridInteractionMode = "quick-create";

const buildDayColumn = (
  date: CalendarDate,
  timeZone: IanaTimeZone,
  window: CalendarTimeWindow,
  slotMinutes: CalendarSlotMinutes
): WeekGridDayColumn => {
  const range = buildTimeWindowRange(date, timeZone, window);
  const starts = buildSlotStarts(range, slotMinutes);

  const slots: CalendarCell[] = [];

  for (const [index, start] of starts.entries()) {
    const end = starts[index + 1] ?? range.end;

    slots.push({
      date,
      end,
      endTime:
        end === range.end ? window.end : toViewerDateTime(end, timeZone).time,
      start,
      startTime: toViewerDateTime(start, timeZone).time,
    });
  }

  return { date, range, slots };
};

const findEventAtCellInEvents = <Payload>(
  events: readonly CalendarEvent<Payload>[],
  cell: CalendarCell
): CalendarEvent<Payload> | undefined => {
  for (const event of events) {
    if (event.allDay) {
      continue;
    }

    try {
      if (
        rangesOverlap(
          { end: event.end, start: event.start },
          { end: cell.end, start: cell.start }
        )
      ) {
        return event;
      }
    } catch {
      continue;
    }
  }

  return undefined;
};

const findPosition = (
  columns: readonly WeekGridDayColumn[],
  target: CalendarCell
): FocusedCell => {
  for (const [columnIndex, column] of columns.entries()) {
    for (const [rowIndex, cell] of column.slots.entries()) {
      if (cell.start === target.start) {
        return { columnIndex, rowIndex };
      }
    }
  }

  return { columnIndex: 0, rowIndex: 0 };
};

const isSameMoveEvent = (
  current: CalendarEvent,
  pending: CalendarEvent
): boolean => {
  if (current.id !== pending.id || current.allDay !== pending.allDay) {
    return false;
  }

  return current.allDay
    ? current.startDate === pending.startDate &&
        current.endDate === pending.endDate
    : !pending.allDay &&
        current.start === pending.start &&
        current.end === pending.end;
};

export const useWeekGridController = <Payload = unknown>(
  options: UseWeekGridControllerOptions<Payload>
): UseWeekGridControllerResult<Payload> => {
  const visibleDayCount = options.visibleDays ?? DEFAULT_VISIBLE_DAYS;
  const slotMinutes = options.slotMinutes ?? DEFAULT_SLOT_MINUTES;
  const { end: visibleEnd, start: visibleStart } =
    options.visibleHours ?? FULL_DAY_TIME_WINDOW;
  const { end: workingEnd, start: workingStart } =
    options.workingHours ?? DEFAULT_WORKING_HOURS;

  const modeState = useControlledValue<WeekGridInteractionMode>({
    defaultValue: options.defaultInteractionMode ?? DEFAULT_INTERACTION_MODE,
    onChange: options.onInteractionModeChange,
    value: options.interactionMode,
  });

  const selectedState = useControlledValue<string | null>({
    defaultValue: options.defaultSelectedEventId ?? null,
    onChange: options.onSelectedEventIdChange,
    value: options.selectedEventId,
  });

  const [focusedCellState, setFocusedCellState] = useState<FocusedCell>({
    columnIndex: 0,
    rowIndex: 0,
  });

  const originFocusRef = useRef<{
    readonly key: string;
    readonly position: FocusedCell;
  } | null>(null);

  const interactionInvalidationRef = useRef(false);

  const gridIdentity = `${options.date}:${options.timeZone}:${visibleDayCount}:${visibleStart}-${visibleEnd}:${slotMinutes}`;

  const previousGridIdentityRef = useRef(gridIdentity);
  const previousModeRef = useRef(modeState.value);

  const restoreOriginFocus = useCallback((): void => {
    const origin = originFocusRef.current;

    if (!origin) {
      return;
    }

    originFocusRef.current = null;
    setFocusedCellState(origin.position);
  }, []);

  const { onMoveRequest } = options;

  const handleMoveRequest = useCallback(
    (request: CalendarMoveRequest): void => {
      // @cpt-begin:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1:inst-move-request
      if (!onMoveRequest) {
        request.cancel();
        return;
      }

      onMoveRequest({
        ...request,
        cancel: () => {
          request.cancel();
          restoreOriginFocus();
        },
        confirm: () => {
          request.confirm();
          restoreOriginFocus();
        },
      });
      // @cpt-end:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1:inst-move-request
    },
    [onMoveRequest, restoreOriginFocus]
  );

  const allViewerDates = useMemo(() => {
    const week = buildWeekRange(options.date, options.timeZone);

    return Array.from({ length: 7 }, (_, index) =>
      addCalendarDays(week.start, index)
    );
  }, [options.date, options.timeZone]);

  const viewerDates = useMemo(
    () => allViewerDates.slice(0, visibleDayCount === 5 ? 5 : 7),
    [allViewerDates, visibleDayCount]
  );

  const visibleHours = useMemo<CalendarTimeWindow>(() => {
    const window = { end: visibleEnd, start: visibleStart };
    assertTimeWindow(window, slotMinutes);

    return window;
  }, [slotMinutes, visibleEnd, visibleStart]);

  const workingHours = useMemo<CalendarTimeWindow>(
    () => ({ end: workingEnd, start: workingStart }),
    [workingEnd, workingStart]
  );

  const dayColumns = useMemo(
    () =>
      viewerDates.map((date) =>
        buildDayColumn(date, options.timeZone, visibleHours, slotMinutes)
      ),
    [options.timeZone, slotMinutes, viewerDates, visibleHours]
  );

  const workingSlotIndex = Math.max(
    (arrayAt(dayColumns, 0)?.slots ?? []).findIndex((cell) =>
      isWithinTimeWindow(cell.startTime, workingHours)
    ),
    0
  );

  // A DST day contributes one slot fewer or more; the axis keeps the window's nominal rows.
  const slotRowCount = useMemo(() => {
    let count = countWindowSlots(visibleHours, slotMinutes);

    for (const column of dayColumns) {
      count = Math.max(count, column.slots.length);
    }

    return count;
  }, [dayColumns, slotMinutes, visibleHours]);

  const eventById = useMemo(() => {
    const map = new Map<string, CalendarEvent<Payload>>();

    for (const event of options.events) {
      if (!map.has(event.id)) {
        map.set(event.id, event);
      }
    }

    return map;
  }, [options.events]);

  const selectedEvent =
    selectedState.value === null
      ? undefined
      : eventById.get(selectedState.value);

  const shouldInvalidateInteraction = useCallback(
    (state: InteractionState): boolean => {
      const gridChanged = previousGridIdentityRef.current !== gridIdentity;
      const { pendingMove } = state;

      if (!pendingMove) {
        return false;
      }

      const currentEvent = eventById.get(pendingMove.event.id);
      const invalid =
        gridChanged ||
        !currentEvent ||
        !isSameMoveEvent(currentEvent, pendingMove.event) ||
        !isEventActionable(currentEvent);

      if (invalid) {
        interactionInvalidationRef.current = true;
      }

      return invalid;
    },
    [eventById, gridIdentity]
  );

  const { events } = options;
  const { onPaintSelect } = options;

  const handlePaintSelect = useCallback(
    (range: CalendarSelectionRange): void => {
      // @cpt-begin:cpt-frontx-calendar-kit-algo-week-grid-paint-range:p1:inst-paint-return
      for (const cell of range.cells) {
        const event = findEventAtCellInEvents(events, cell);

        if (event && !isEventActionable(event)) {
          return;
        }
      }

      onPaintSelect?.(range);
      // @cpt-end:cpt-frontx-calendar-kit-algo-week-grid-paint-range:p1:inst-paint-return
    },
    [events, onPaintSelect]
  );

  const interaction = useInteractionController({
    interactionMode: modeState.value,
    onMoveRequest: onMoveRequest ? handleMoveRequest : undefined,
    onPaintSelect: handlePaintSelect,
    onQuickCreate: options.onQuickCreate,
    shouldInvalidate: shouldInvalidateInteraction,
  });

  const cellKey = useCallback(
    (cell: CalendarCell): string =>
      `${cell.date}:${cell.startTime}:${cell.start}`,
    []
  );

  const getCell = (
    columnIndex: number,
    rowIndex: number
  ): CalendarCell | undefined => dayColumns[columnIndex]?.slots[rowIndex];

  const isPositionInGrid = (position: FocusedCell): boolean =>
    position.columnIndex >= 0 &&
    position.columnIndex < dayColumns.length &&
    position.rowIndex >= 0 &&
    position.rowIndex < (dayColumns[0]?.slots.length ?? 0);

  const setFocusedCell = (position: FocusedCell): void => {
    if (!isPositionInGrid(position)) {
      return;
    }

    setFocusedCellState(position);
  };

  const findEventAtCell = (
    cell: CalendarCell
  ): CalendarEvent<Payload> | undefined =>
    findEventAtCellInEvents(options.events, cell);

  const selectEvent = (
    eventId: string,
    context?: CalendarEventRenderContext<Payload>,
    anchor?: HTMLElement
  ): void => {
    // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-select
    const event = eventById.get(eventId);

    if (!event || !isEventActionable(event)) {
      return;
    }

    selectedState.setValue(event.id);

    if (context) {
      options.onEventSelect?.(event, context, anchor);
    }
    // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-select
  };

  const clearSelection = (): void => {
    selectedState.setValue(null);
  };

  const activateCell = (
    columnIndex: number,
    rowIndex: number,
    anchorRect?: DOMRectReadOnly
  ): CalendarSelectionRange | null => {
    // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-quick-create
    const cell = getCell(columnIndex, rowIndex);

    if (!cell || findEventAtCell(cell)) {
      return null;
    }

    // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-quick-create
    return interaction.activateCell(cell, anchorRect);
  };

  const beginPaint = (columnIndex: number, rowIndex: number): void => {
    // @cpt-begin:cpt-frontx-calendar-kit-algo-week-grid-paint-range:p1:inst-paint-anchor
    const cell = getCell(columnIndex, rowIndex);

    if (!cell) {
      return;
    }

    const event = findEventAtCell(cell);

    if (event && !isEventActionable(event)) {
      return;
    }

    interaction.beginPaint(cell);
    // @cpt-end:cpt-frontx-calendar-kit-algo-week-grid-paint-range:p1:inst-paint-anchor
  };

  const updatePaint = (columnIndex: number, rowIndex: number): void => {
    // @cpt-begin:cpt-frontx-calendar-kit-algo-week-grid-paint-range:p1:inst-paint-extend
    const cell = getCell(columnIndex, rowIndex);

    if (!cell) {
      return;
    }

    const event = findEventAtCell(cell);

    if (event && !isEventActionable(event)) {
      return;
    }

    interaction.updatePaint(cell);
    // @cpt-end:cpt-frontx-calendar-kit-algo-week-grid-paint-range:p1:inst-paint-extend
  };

  const endPaint = (): void => {
    interaction.endPaint();
  };

  const cancelPaint = (): void => {
    // Move cancellation belongs to cancelMove; paint cancellation only resets the interaction state.
    restoreOriginFocus();
    interaction.reset();
  };

  const beginMove = (
    eventId: string,
    from: CalendarCell,
    to?: CalendarCell
  ): void => {
    // @cpt-begin:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1:inst-move-request
    const event = eventById.get(eventId);

    if (!event || !isEventActionable(event)) {
      return;
    }

    originFocusRef.current = {
      key: cellKey(from),
      position: findPosition(dayColumns, from),
    };
    interaction.beginMove(event, from, to);

    if (!interaction.getInternals().state.pendingMove) {
      originFocusRef.current = null;
    }
    // @cpt-end:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1:inst-move-request
  };

  const updateMove = (cell: CalendarCell): void => {
    interaction.updateMove(cell);
  };

  const endMove = (): void => {
    // @cpt-begin:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1:inst-move-return
    interaction.endMove();
    // @cpt-end:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1:inst-move-return
  };

  const confirmMove = (): void => {
    // @cpt-begin:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1:inst-move-resolve
    interaction.confirmMove();
    restoreOriginFocus();
    // @cpt-end:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1:inst-move-resolve
  };

  const cancelMove = (): void => {
    // @cpt-begin:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1:inst-move-resolve
    interaction.cancelMove();
    restoreOriginFocus();
    // @cpt-end:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1:inst-move-resolve
  };

  useEffect(() => {
    previousGridIdentityRef.current = gridIdentity;
  }, [gridIdentity]);

  useEffect(() => {
    if (
      interactionInvalidationRef.current &&
      interaction.pendingMove === null
    ) {
      interactionInvalidationRef.current = false;
      restoreOriginFocus();
    }
  }, [interaction.pendingMove, restoreOriginFocus]);

  useEffect(() => {
    const modeChanged = previousModeRef.current !== modeState.value;
    previousModeRef.current = modeState.value;

    if (modeChanged) {
      restoreOriginFocus();
    }
  }, [modeState.value, restoreOriginFocus]);

  const getInternals = (): Readonly<WeekGridControllerInternals<Payload>> => ({
    eventById,
    interaction: interaction.getInternals(),
    originFocusKey: originFocusRef.current?.key ?? null,
  });

  return {
    activateCell,
    allViewerDates,
    beginMove,
    beginPaint,
    cancelMove,
    cancelPaint,
    clearSelection,
    committedMove: interaction.committedMove,
    confirmMove,
    dayColumns,
    endMove,
    endPaint,
    focusedCell: focusedCellState,
    getCell,
    getCellKey: cellKey,
    getInternals,
    hiddenDateCount: allViewerDates.length - viewerDates.length,
    interactionMode: modeState.value,
    paint: interaction.paint,
    pendingMove: interaction.pendingMove,
    selectEvent,
    selectedEvent,
    selectedEventId: selectedState.value,
    setFocusedCell,
    setInteractionMode: modeState.setValue,
    slotRowCount,
    updateMove,
    updatePaint,
    viewerDates,
    workingHours,
    workingSlotIndex,
  };
};
