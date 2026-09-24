// @cpt-algo:cpt-frontx-calendar-kit-algo-week-grid-mode-gating:p1
// @cpt-algo:cpt-frontx-calendar-kit-algo-week-grid-paint-range:p1
// @cpt-algo:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1
// @cpt-state:cpt-frontx-calendar-kit-state-week-grid-interaction-mode:p2
// @cpt-state:cpt-frontx-calendar-kit-state-week-grid-pending-move:p2
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-mode-callbacks:p1
import { arrayAt } from "./array";
import { compareCalendarCells, normalizeCalendarCell } from "./calendar-cell";
import type {
  CalendarCell,
  CalendarEvent,
  CalendarSelectionRange,
  WeekGridInteractionMode,
} from "./model";
import { addCalendarDays, compareUtcInstants } from "./temporal";
import {
  MINUTES_PER_DAY,
  localTimeFromMinutes,
  minutesFromLocalTime,
} from "./time-input";
import { invalidTemporalValue, utcInstant } from "./validation";

const MAX_INFERRED_CELLS = 10_000;

export interface PendingMove {
  readonly event: CalendarEvent;
  readonly from: CalendarCell;
  readonly to: CalendarCell;
}

export type CommittedMove = PendingMove;

export interface InteractionState {
  readonly mode: WeekGridInteractionMode;
  readonly paint: CalendarSelectionRange | null;
  readonly pendingMove: PendingMove | null;
  readonly committedMove: CommittedMove | null;
  readonly paintAnchor: CalendarCell | null;
}

export type InteractionAction =
  | { readonly type: "paint-start"; readonly cell: CalendarCell }
  | { readonly type: "paint-update"; readonly cell: CalendarCell }
  | { readonly type: "paint-end" }
  | {
      readonly type: "move-start";
      readonly event: CalendarEvent;
      readonly from: CalendarCell;
    }
  | { readonly type: "move-target"; readonly to?: CalendarCell }
  | { readonly type: "move-confirm" }
  | { readonly type: "move-cancel" };

export type InteractionValidationResult =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly reason: "busy-access" | "unavailable" | "missing-id";
    };

export const validateInteractionEvent = (
  event: CalendarEvent
): InteractionValidationResult => {
  // @cpt-begin:cpt-frontx-calendar-kit-algo-week-grid-mode-gating:p1:inst-gate-return
  if (event.access === "busy") {
    return { reason: "busy-access", valid: false };
  }

  if (event.available === false) {
    return { reason: "unavailable", valid: false };
  }

  if (!event.id.trim()) {
    return { reason: "missing-id", valid: false };
  }

  return { valid: true };
  // @cpt-end:cpt-frontx-calendar-kit-algo-week-grid-mode-gating:p1:inst-gate-return
};

const assertMode = (mode: WeekGridInteractionMode): void => {
  if (
    mode !== "quick-create" &&
    mode !== "paint-and-move" &&
    mode !== "read-only"
  ) {
    throw invalidTemporalValue(`Invalid interaction mode: ${String(mode)}`);
  }
};

const wallDurationMinutes = (cell: CalendarCell): number => {
  const start = minutesFromLocalTime(cell.startTime);
  const end = minutesFromLocalTime(cell.endTime);

  const dayDifference = end < start ? 1 : 0;

  const duration = dayDifference * MINUTES_PER_DAY + end - start;

  return duration > 0
    ? duration
    : (Date.parse(cell.end) - Date.parse(cell.start)) / 60_000;
};

const advancePoint = (
  date: CalendarCell["date"],
  time: CalendarCell["startTime"],
  minutes: number
) => {
  const total = minutesFromLocalTime(time) + minutes;
  const days = Math.floor(total / MINUTES_PER_DAY);
  const minuteOfDay = total - days * MINUTES_PER_DAY;
  const nextDate = addCalendarDays(date, days);

  return { date: nextDate, time: localTimeFromMinutes(minuteOfDay) };
};

const inferCells = (start: CalendarCell, end: CalendarCell): CalendarCell[] => {
  // @cpt-begin:cpt-frontx-calendar-kit-algo-week-grid-paint-range:p1:inst-paint-extend
  const durationMilliseconds = Date.parse(start.end) - Date.parse(start.start);
  const durationMinutes = wallDurationMinutes(start);

  if (durationMilliseconds <= 0 || durationMinutes <= 0) {
    return compareCalendarCells(start, end) === 0 ? [start] : [start, end];
  }

  const cells: CalendarCell[] = [start];

  let cursor = start;
  let iterations = 0;

  while (
    compareCalendarCells(cursor, end) < 0 &&
    iterations < MAX_INFERRED_CELLS
  ) {
    const nextStart = advancePoint(
      cursor.date,
      cursor.startTime,
      durationMinutes
    );

    const nextStartInstant = cursor.end;

    if (compareUtcInstants(nextStartInstant, end.start) >= 0) {
      break;
    }

    const nextEnd = advancePoint(
      nextStart.date,
      nextStart.time,
      durationMinutes
    );

    const nextEndInstant = utcInstant(
      new Date(Date.parse(nextStartInstant) + durationMilliseconds)
    );

    const nextCell: CalendarCell = {
      date: nextStart.date,
      end: nextEndInstant,
      endTime: nextEnd.time,
      start: nextStartInstant,
      startTime: nextStart.time,
    };

    cells.push(nextCell);
    cursor = nextCell;
    iterations += 1;
  }

  const lastCell = arrayAt(cells, -1);

  if (!lastCell || compareCalendarCells(lastCell, end) !== 0) {
    cells.push(end);
  }

  return cells;
  // @cpt-end:cpt-frontx-calendar-kit-algo-week-grid-paint-range:p1:inst-paint-extend
};

export const buildSelectionRange = (
  first: CalendarCell,
  second: CalendarCell
): CalendarSelectionRange | null => {
  // @cpt-begin:cpt-frontx-calendar-kit-algo-week-grid-paint-range:p1:inst-paint-return
  const validFirst = normalizeCalendarCell(first);
  const validSecond = normalizeCalendarCell(second);

  if (!validFirst || !validSecond) {
    return null;
  }

  const ordered =
    compareCalendarCells(validFirst, validSecond) <= 0
      ? { end: validSecond, start: validFirst }
      : { end: validFirst, start: validSecond };

  const cells = inferCells(ordered.start, ordered.end);

  if (cells.length === 0) {
    return null;
  }

  const start = arrayAt(cells, 0);
  const end = arrayAt(cells, -1);

  if (!start || !end) {
    return null;
  }

  return { cells, end, start };
  // @cpt-end:cpt-frontx-calendar-kit-algo-week-grid-paint-range:p1:inst-paint-return
};

export const createInteractionState = (
  mode: WeekGridInteractionMode
): InteractionState => {
  // @cpt-begin:cpt-frontx-calendar-kit-state-week-grid-interaction-mode:p2:inst-mode-switch
  assertMode(mode);

  return {
    committedMove: null,
    mode,
    paint: null,
    paintAnchor: null,
    pendingMove: null,
  };
  // @cpt-end:cpt-frontx-calendar-kit-state-week-grid-interaction-mode:p2:inst-mode-switch
};

type PaintStartAction = Extract<InteractionAction, { type: "paint-start" }>;
type PaintUpdateAction = Extract<InteractionAction, { type: "paint-update" }>;
type MoveStartAction = Extract<InteractionAction, { type: "move-start" }>;
type MoveTargetAction = Extract<InteractionAction, { type: "move-target" }>;

const transitionPaintStart = (
  state: InteractionState,
  action: PaintStartAction
): InteractionState => {
  if (state.mode !== "paint-and-move") {
    return state;
  }

  const cell = normalizeCalendarCell(action.cell);

  if (!cell) {
    return state;
  }
  return {
    ...state,
    paint: buildSelectionRange(cell, cell),
    paintAnchor: cell,
  };
};

const transitionPaintUpdate = (
  state: InteractionState,
  action: PaintUpdateAction
): InteractionState => {
  if (state.mode !== "paint-and-move" || !state.paintAnchor) {
    return state;
  }

  const cell = normalizeCalendarCell(action.cell);

  if (!cell) {
    return state;
  }

  const paint = buildSelectionRange(state.paintAnchor, cell);

  return paint ? { ...state, paint } : state;
};

const transitionMoveStart = (
  state: InteractionState,
  action: MoveStartAction
): InteractionState => {
  if (state.mode !== "paint-and-move") {
    return state;
  }

  const eventValidation = validateInteractionEvent(action.event);

  if (!eventValidation.valid) {
    return state;
  }

  const from = normalizeCalendarCell(action.from);

  if (!from) {
    return state;
  }
  return {
    ...state,
    pendingMove: { event: action.event, from, to: from },
  };
};

const transitionMoveTarget = (
  state: InteractionState,
  action: MoveTargetAction
): InteractionState => {
  if (!state.pendingMove || !action.to) {
    return state.pendingMove ? { ...state, pendingMove: null } : state;
  }

  const to = normalizeCalendarCell(action.to);

  if (!to || compareCalendarCells(state.pendingMove.from, to) === 0) {
    return { ...state, pendingMove: null };
  }
  return { ...state, pendingMove: { ...state.pendingMove, to } };
};

export const transitionInteraction = (
  state: InteractionState,
  action: InteractionAction
): InteractionState => {
  // @cpt-begin:cpt-frontx-calendar-kit-algo-week-grid-mode-gating:p1:inst-gate-return
  assertMode(state.mode);

  switch (action.type) {
    case "paint-start": {
      return transitionPaintStart(state, action);
    }
    case "paint-update": {
      return transitionPaintUpdate(state, action);
    }
    case "paint-end": {
      return state.mode === "paint-and-move"
        ? { ...state, paintAnchor: null }
        : state;
    }
    case "move-start": {
      return transitionMoveStart(state, action);
    }
    case "move-target": {
      return transitionMoveTarget(state, action);
    }
    case "move-confirm": {
      return state.pendingMove
        ? {
            ...state,
            committedMove: state.pendingMove,
            pendingMove: null,
          }
        : state;
    }
    case "move-cancel": {
      return state.pendingMove ? { ...state, pendingMove: null } : state;
    }
    default: {
      return state;
    }
  }
  // @cpt-end:cpt-frontx-calendar-kit-algo-week-grid-mode-gating:p1:inst-gate-return
};
