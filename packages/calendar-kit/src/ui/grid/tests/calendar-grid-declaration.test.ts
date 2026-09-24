import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { describe, expectTypeOf, it } from "vitest";

import { UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime, utcInstant } from "../../../core/model";
import type {
  CalendarCell,
  CalendarCellContext,
  CalendarColorFamily,
  CalendarConflict,
  CalendarDetailRenderContext,
  CalendarDirection,
  CalendarEvent,
  CalendarEventGeometry,
  CalendarEventRenderContext,
  CalendarEventSegment,
  CalendarGridColumn,
  CalendarGridRow,
  CalendarMoveRequest,
  CalendarSelectionRange,
  IanaTimeZone,
} from "../../../core/model";
import type {
  CalendarConflictRenderer,
  CalendarDetailRenderer,
  CalendarEventRenderer,
  CalendarInteractionCallbacks,
  CalendarLocalizedProps,
  CalendarQuickCreatePayload,
  CalendarTemporalProps,
} from "../../../react/slots";
import type { ConflictIndicatorProps } from "../../conflict-indicator/conflict-indicator";
import type {
  CalendarEventKeyDownHandler,
  EventCardProps,
} from "../../event-card/event-card";
import type { EventDetailPanelProps } from "../../event-detail-panel/event-detail-panel";
import type { WeekGridProps } from "../../week-grid/week-grid";
import type {
  CalendarGridCellKeyDownHandler,
  CalendarGridProps,
} from "../calendar-grid";

const DATE = calendarDate("2026-08-24");

const NEXT_DATE = calendarDate("2026-08-25");

const FIRST_INSTANT = utcInstant("2026-08-24T09:00:00.000Z");

const SECOND_INSTANT = utcInstant("2026-08-24T10:00:00.000Z");

const selectedTimeZone: IanaTimeZone = UTC;

const t: CalendarLocalizedProps["t"] = (key, values) =>
  `${key}${values ? JSON.stringify(values) : ""}`;

const customColorFamily: CalendarColorFamily = "consumer-owned-family";

const direction: CalendarDirection = "ltr";

const ignoreCallback = (..._args: unknown[]): void => {
  // Declaration fixtures only need a compatible, side-effect-free callback.
};

interface Payload {
  readonly courseCode: string;
}

const localizedProps: CalendarLocalizedProps = {
  className: "calendar-surface",
  direction,
  t,
};

const temporalProps: CalendarTemporalProps = {
  ...localizedProps,
  locale: "en-US",
  timeZone: selectedTimeZone,
};

const firstCell: CalendarCell = {
  date: DATE,
  end: SECOND_INSTANT,
  endTime: parseLocalTime("10:00"),
  start: FIRST_INSTANT,
  startTime: parseLocalTime("09:00"),
};

const secondCell: CalendarCell = {
  ...firstCell,
  end: utcInstant("2026-08-24T11:00:00.000Z"),
  endTime: parseLocalTime("11:00"),
  start: SECOND_INSTANT,
  startTime: parseLocalTime("10:00"),
};

const selectionRange: CalendarSelectionRange = {
  cells: [firstCell, secondCell],
  end: secondCell,
  start: firstCell,
};

const event: CalendarEvent<Payload> = {
  allDay: false,
  colorFamily: customColorFamily,
  end: firstCell.end,
  endDate: DATE,
  endTime: firstCell.endTime,
  id: "event-1",
  metadata: { courseCode: "CAL-101" },
  start: firstCell.start,
  startDate: DATE,
  startTime: firstCell.startTime,
  timeZone: UTC,
  title: "Planning",
};

const conflict: CalendarConflict = {
  dimension: "classroom",
  id: "conflict-1",
  label: "Classroom",
};

const segment: CalendarEventSegment = {
  date: DATE,
  end: SECOND_INSTANT,
  event,
  segment: null,
  start: FIRST_INSTANT,
};

const geometry: CalendarEventGeometry = {
  height: 50,
  inlineSize: 100,
  insetInlineStart: 0,
  top: 0,
  zIndex: 1,
};

const eventContext: CalendarEventRenderContext<Payload> = {
  conflicts: [conflict],
  event,
  geometry,
  isAvailable: true,
  isPast: false,
  isReadOnly: false,
  isSelected: false,
  segment,
};

const detailContext: CalendarDetailRenderContext<Payload> = {
  close: () => {},
  event,
  onDelete: () => {},
  onEdit: () => {},
};

const columns: readonly CalendarGridColumn[] = [
  { key: "monday", label: "Monday" },
];

const rows: readonly CalendarGridRow[] = [{ cells: [firstCell], key: "09:00" }];

const renderEvent: CalendarEventRenderer<Payload> = (context) =>
  context.event.title;

const renderConflict: CalendarConflictRenderer = (value, context) =>
  `${value.label}:${context.event.id}`;

const renderDetail: CalendarDetailRenderer<Payload> = (context) =>
  context.event.title;

const renderCell: CalendarGridProps["renderCell"] = (context) => context.label;

const gridKeyDown: CalendarGridCellKeyDownHandler = (
  keyboardEvent,
  context
) => {
  keyboardEvent.preventDefault();
  void context;
};

const eventKeyDown: CalendarEventKeyDownHandler<Payload> = (
  keyboardEvent,
  context
) => {
  keyboardEvent.preventDefault();
  void context;
};

const interactions: CalendarInteractionCallbacks<Payload> = {
  onEventSelect: (value, context) => {
    void value;
    void context;
  },
  onMoveRequest: (request) => {
    const move: CalendarMoveRequest = request;
    void move;
  },
  onPaintSelect: (range) => {
    void range;
  },
  onQuickCreate: (payload) => {
    const range: CalendarSelectionRange = payload.range;
    void range;
  },
};

const moveRequest: CalendarMoveRequest = {
  cancel: () => {},
  confirm: () => {},
  event,
  from: firstCell,
  to: secondCell,
};

const quickCreate: CalendarQuickCreatePayload = { range: selectionRange };

const gridProps: CalendarGridProps = {
  columns,
  rows,
  ...localizedProps,
  activeCellKey: "2026-08-24:09:00",
  defaultActiveCellKey: "2026-08-24:09:00",
  getCellKey: (value) => `${value.date}:${value.startTime}`,
  getCellLabel: (value, context) => `${value.date} ${context.key}`,
  onActiveCellChange: ignoreCallback,
  onCellKeyDown: gridKeyDown,
  renderCell,
  renderHeader: (value) => value.label,
};

const weekGridProps: WeekGridProps<Payload> = {
  ...temporalProps,
  date: DATE,
  defaultInteractionMode: "quick-create",
  defaultSelectedEventId: null,
  events: [event],
  interactionMode: "paint-and-move",
  onEventSelect: interactions.onEventSelect,
  onInteractionModeChange: ignoreCallback,
  onMoveRequest: interactions.onMoveRequest,
  onPaintSelect: interactions.onPaintSelect,
  onQuickCreate: interactions.onQuickCreate,
  onSelectedEventIdChange: ignoreCallback,
  renderCell,
  renderConflict,
  renderDetail,
  renderEvent,
  renderUnavailable: (value) => value.startTime,
  selectedEventId: event.id,
  visibleDays: 5,
};

const eventCardProps: EventCardProps<Payload> = {
  ...temporalProps,
  available: true,
  conflicts: [conflict],
  event,
  geometry,
  onKeyDown: eventKeyDown,
  onSelect: (value, context) => {
    void value;
    void context;
  },
  past: false,
  readOnly: false,
  renderConflict: (value, context) => `${value.label}:${context.event.id}`,
  renderMetadata: (context) => context.event.metadata?.courseCode,
  renderTime: (context) => context.event.startTime,
  renderTitle: (context) => context.event.title,
  segment,
  selected: true,
};

const conflictIndicatorProps: ConflictIndicatorProps = {
  ...localizedProps,
  compact: true,
  conflicts: [conflict],
  renderConflict: (value) => value.label,
};

const eventDetailPanelProps: EventDetailPanelProps = {
  ...temporalProps,
  comparisonTimeZone: null,
  defaultOpen: false,
  event,
  onClose: () => {},
  onDelete: ignoreCallback,
  onEdit: ignoreCallback,
  onOpenChange: ignoreCallback,
  open: true,
  readOnly: false,
  renderActions: () => "",
  renderBody: () => "",
  renderFooter: () => "",
  renderHeader: () => "",
  renderMetadata: () => "",
  selectedEventId: event.id,
};

const oldCellRenderer: (cell: CalendarCell) => ReactNode = (value) =>
  value.date;

const incompleteGridProps = {
  columns,
  rows,
  ...localizedProps,
  getCellKey: (value: CalendarCell) => value.date,
} satisfies Partial<CalendarGridProps>;

describe("calendar public declaration contract", () => {
  it("binds every launch-group-one public props interface and shared base signature", () => {
    expectTypeOf(localizedProps).toExtend<CalendarLocalizedProps>();
    expectTypeOf(temporalProps).toExtend<CalendarTemporalProps>();
    expectTypeOf(gridProps).toExtend<CalendarGridProps>();
    expectTypeOf(weekGridProps).toExtend<WeekGridProps<Payload>>();
    expectTypeOf(eventCardProps).toExtend<EventCardProps<Payload>>();
    expectTypeOf(conflictIndicatorProps).toExtend<ConflictIndicatorProps>();
    expectTypeOf(eventDetailPanelProps).toExtend<EventDetailPanelProps>();
  });

  it("keeps CalendarGrid callback parameters exact and rejects legacy alternatives", () => {
    expectTypeOf(gridProps.getCellKey).parameters.toEqualTypeOf<
      [CalendarCell]
    >();
    expectTypeOf(gridProps.getCellLabel).parameters.toEqualTypeOf<
      [CalendarCell, CalendarCellContext]
    >();
    expectTypeOf(gridProps.renderCell)
      .parameter(0)
      .toEqualTypeOf<CalendarCellContext>();
    expectTypeOf(gridKeyDown).parameters.toEqualTypeOf<
      [ReactKeyboardEvent<HTMLDivElement>, CalendarCellContext]
    >();
    expectTypeOf(eventKeyDown).parameters.toEqualTypeOf<
      [
        ReactKeyboardEvent<HTMLButtonElement>,
        CalendarEventRenderContext<Payload>,
      ]
    >();
    expectTypeOf(quickCreate.range).toEqualTypeOf<CalendarSelectionRange>();
    expectTypeOf(quickCreate.anchorRect).toEqualTypeOf<
      DOMRectReadOnly | undefined
    >();
    expectTypeOf(oldCellRenderer).not.toExtend<
      CalendarGridProps["renderCell"]
    >();
    expectTypeOf(incompleteGridProps).not.toExtend<CalendarGridProps>();
  });

  void detailContext;
  void eventContext;
  void moveRequest;
  void quickCreate;
  void customColorFamily;
  void t;
  void selectedTimeZone;
  void NEXT_DATE;
  void FIRST_INSTANT;
  void SECOND_INSTANT;
  void DATE;
  void UTC;
});
