"use client";

import { clsx } from "clsx";
import { memo, useMemo, useState } from "react";
import type {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  ReactNode,
} from "react";

import { formatCalendarList, formatGridTime } from "../../core/format";
import { dateTimeFormatter } from "../../core/intl-cache";
import type {
  CalendarCell,
  CalendarCellContext,
  CalendarDate,
  CalendarDateRange,
  CalendarEvent,
  CalendarEventGeometry,
  CalendarEventRenderContext,
  CalendarEventSegment,
  IanaTimeZone,
  UtcInstant,
} from "../../core/model";
import {
  buildDayRange,
  isDateInRange,
  toUtcRange,
  toViewerDateTime,
} from "../../core/temporal";
import { useCalendarContext } from "../../i18n/calendar-context";
import {
  omitCalendarContextProps,
  useCalendarLocalization,
} from "../../i18n/calendar-localization";
import type {
  CalendarContextProps,
  CalendarTranslate,
} from "../../i18n/calendar-localization";
import { CalendarScope } from "../../i18n/calendar-localization-provider";
import { useMonthGridController } from "../../react/controllers/use-month-grid-controller";
import type {
  MonthGridAllDaySpan,
  MonthGridCell,
  MonthGridRow,
} from "../../react/controllers/use-month-grid-controller";
import { useDateRangeSelection } from "../../react/hooks/use-date-range-selection";
import type { CalendarEventRenderer } from "../../react/slots";
import { ConflictIndicator } from "../conflict-indicator/conflict-indicator";
import { EventCard } from "../event-card/event-card";
import { Button } from "../primitives/button/button";
import { Tag } from "../primitives/tag/tag";
import {
  buildLiveAnnouncement,
  formatMonthDayNumber,
  formatMonthWeekNumber,
  formatMonthWeekday,
  MONTH_ANNOUNCEMENT_KIND,
} from "./month-grid-format";

import styles from "./month-grid.module.css";

type MonthGridControllerResult = ReturnType<typeof useMonthGridController>;

export interface MonthGridData {
  /** Maximum events shown per day before the overflow chip. Without it, capacity follows the measured cell height. */
  readonly densityCap?: number;
  /** Extra hidden counts per `YYYY-MM-DD`, for events the host did not send. */
  readonly overflowByDate: Readonly<Record<string, number>>;
}

export type MonthGridSelectionMode = "none" | "date-range";

export type MonthGridWeekNumbering = "month" | "iso";

export interface MonthGridProps extends CalendarContextProps {
  /** Class added to the component root. */
  readonly className?: string;
  /** Any day in the month to show. Weeks start on Monday. */
  readonly date: CalendarDate;
  /** Events to place. Days outside the month are shown dimmed and still receive their events. */
  readonly events: readonly CalendarEvent[];
  /** Default `none`. */
  readonly selectionMode?: MonthGridSelectionMode;
  /** Controlled date range (both ends inclusive). */
  readonly selectedDateRange?: CalendarDateRange | null;
  /** Initial date range when uncontrolled. */
  readonly defaultSelectedDateRange?: CalendarDateRange | null;
  /** Called when a range is committed or cleared. */
  readonly onSelectedDateRangeChange?: (
    range: CalendarDateRange | null
  ) => void;
  /** How the week column is labelled. Default `month`. */
  readonly weekNumbering?: MonthGridWeekNumbering;
  /** Repeat the week column on the trailing edge, hidden from assistive technology. */
  readonly trailingGutter?: boolean;
  /** Class added to every day cell. */
  readonly cellClassName?: string;
  /** Class added to every weekday header. */
  readonly columnHeaderClassName?: string;
  /** Class added to the week column, its heading and the trailing copy. */
  readonly weekNumberClassName?: string;
  /** Reference instant for the today marker and past styling. Omit to follow the wall clock. */
  readonly now?: UtcInstant;
  /** Density cap and host-known hidden counts. */
  readonly monthData?: MonthGridData;
  /** Controlled selected event. */
  readonly selectedEventId?: string | null;
  /** Initial selected event when uncontrolled. */
  readonly defaultSelectedEventId?: string | null;
  /** Called when an event is selected or deselected. */
  readonly onSelectedEventIdChange?: (eventId: string | null) => void;
  /** Replaces the default one-line event strip. */
  readonly renderEvent?: CalendarEventRenderer;
  /** Replaces the overflow chip content. Receives the hidden count. */
  readonly renderOverflow?: (count: number, date: CalendarDate) => ReactNode;
  /** Replaces the content of each day cell. */
  readonly renderCell?: (context: CalendarCellContext) => ReactNode;
  /** An available event was activated. `anchor` is the strip element. */
  readonly onEventSelect?: (
    event: CalendarEvent,
    context: CalendarEventRenderContext,
    anchor?: HTMLElement
  ) => void;
  /** An empty part of a day was activated (in `selectionMode="none"`). */
  readonly onEmptyCellSelect?: (cell: CalendarCell) => void;
  /** The overflow chip was activated. `anchorRect` is the chip's rectangle, for a popover. */
  readonly onOverflowSelect?: (payload: {
    readonly date: CalendarDate;
    readonly anchorRect?: DOMRectReadOnly;
  }) => void;
}

interface MonthEventSlotProps {
  readonly event: CalendarEvent;
  readonly segment: CalendarEventSegment;
  readonly rowIndex: number;
  readonly selected: boolean;
  readonly past: boolean;
  readonly focused: boolean;
  readonly allDay?: boolean;
  readonly startColumn: number;
  readonly endColumn: number;
  readonly lane: number;
  readonly renderEvent?: CalendarEventRenderer;
  readonly onSelect: (
    event: CalendarEvent,
    context: CalendarEventRenderContext,
    anchor: HTMLElement
  ) => void;
  readonly onFocus: () => void;
  readonly onArrowKey: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
}

const buildEventConflict = (
  conflict: NonNullable<CalendarEvent["conflicts"]>[number]
) => <ConflictIndicator conflicts={[conflict]} compact />;

interface DefaultSlotTimeProps {
  readonly event: CalendarEvent;
}

const DefaultSlotTime = ({ event }: DefaultSlotTimeProps) => {
  const { locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  if (event.allDay) {
    return t("calendar.event.allDay");
  }

  return (
    <span data-slot-time>{formatGridTime(event.start, timeZone, locale)}</span>
  );
};

const renderDefaultSlotTime = (context: CalendarEventRenderContext) => (
  <DefaultSlotTime event={context.event} />
);

interface MonthGridDynamicStyles extends CSSProperties {
  readonly "--cal-month-all-day-row-count"?: number;
}

const buildAllDayRowCounts = (
  spans: readonly MonthGridAllDaySpan[],
  columnCount: number
): readonly number[] => {
  const rowCounts = Array.from({ length: columnCount }, () => 0);

  for (const span of spans) {
    for (
      let columnIndex = span.startColumn;
      columnIndex < span.endColumn && columnIndex < columnCount;
      columnIndex += 1
    ) {
      rowCounts[columnIndex] = Math.max(
        rowCounts[columnIndex] ?? 0,
        span.lane + 1
      );
    }
  }

  return rowCounts;
};

const MONTH_STRIP_BLOCK_SIZE = 21;

const MONTH_STRIP_GEOMETRY: CalendarEventGeometry = {
  height: MONTH_STRIP_BLOCK_SIZE,
  inlineSize: 0,
  insetInlineStart: 0,
  top: 0,
  zIndex: 0,
};

const MonthEventSlot = ({
  event,
  segment,
  rowIndex,
  selected,
  past,
  focused,
  allDay = false,
  startColumn,
  endColumn,
  lane,
  renderEvent,
  onSelect,
  onFocus,
  onArrowKey,
}: MonthEventSlotProps): ReactElement => {
  const gridStyle: CSSProperties | undefined = allDay
    ? {
        gridColumn: `${startColumn + 1} / ${endColumn + 1}`,
        gridRow: lane + 1,
      }
    : undefined;

  const continuesBefore =
    segment.segment === "middle" || segment.segment === "end";
  const continuesAfter =
    segment.segment === "middle" || segment.segment === "start";

  const handleKeyDown = (
    keyboardEvent: ReactKeyboardEvent<HTMLDivElement>
  ): void => {
    const isActivationKey =
      keyboardEvent.key === "Enter" || keyboardEvent.key === " ";

    if (isActivationKey) {
      return;
    }

    onArrowKey(keyboardEvent);
  };

  const eventCard = (
    <EventCard
      event={event}
      segment={segment}
      geometry={MONTH_STRIP_GEOMETRY}
      positioned={false}
      selected={selected}
      past={past}
      tabIndex={focused ? 0 : -1}
      style={gridStyle}
      data-color-family={event.colorFamily}
      aria-colspan={allDay ? endColumn - startColumn : undefined}
      aria-rowindex={allDay ? rowIndex + 2 : undefined}
      data-continues-before={allDay && continuesBefore ? "true" : undefined}
      data-continues-after={allDay && continuesAfter ? "true" : undefined}
      onSelect={onSelect}
      renderConflict={buildEventConflict}
      renderTitle={renderEvent}
      renderTime={event.allDay ? undefined : renderDefaultSlotTime}
    />
  );

  return (
    <div
      role="presentation"
      className={clsx(styles.eventSlot, "event", allDay && styles.allDaySlot)}
      style={gridStyle}
      onFocus={onFocus}
      onKeyDown={handleKeyDown}
    >
      {eventCard}
    </div>
  );
};

type MonthTimedSegment =
  MonthGridRow["cells"][number]["visibleTimedEvents"][number];

interface MonthOverflowButtonProps {
  readonly cell: MonthGridCell;
  readonly hiddenLabel: string;
  readonly onOverflowSelect?: MonthGridProps["onOverflowSelect"];
  readonly renderOverflow?: MonthGridProps["renderOverflow"];
}

const MonthOverflowButton = ({
  cell,
  hiddenLabel,
  onOverflowSelect,
  renderOverflow,
}: MonthOverflowButtonProps): ReactElement | null => {
  if (cell.hiddenCount <= 0) {
    return null;
  }

  const handleOverflowClick = (
    clickEvent: ReactMouseEvent<HTMLElement>
  ): void => {
    clickEvent.stopPropagation();

    onOverflowSelect?.({
      anchorRect: clickEvent.currentTarget.getBoundingClientRect(),
      date: cell.date,
    });
  };

  return (
    <Button
      type="button"
      className={styles.overflow}
      variant="tertiary"
      size="sm"
      tabIndex={-1}
      aria-label={hiddenLabel}
      onClick={handleOverflowClick}
    >
      {renderOverflow?.(cell.hiddenCount, cell.date) ?? hiddenLabel}
    </Button>
  );
};

interface MonthEventControllerProps {
  readonly focusEvent: MonthGridControllerResult["focusEvent"];
  readonly onGridKeyDown: MonthGridControllerResult["handleGridKeyDown"];
  readonly selectEvent: MonthGridControllerResult["selectEvent"];
}

interface MonthTimedEventProps
  extends
    Pick<MonthEventSlotProps, "focused" | "past" | "renderEvent" | "selected">,
    MonthEventControllerProps {
  readonly columnIndex: number;
  readonly key: string;
  readonly rowIndex: number;
  readonly segment: MonthTimedSegment;
}

const MonthTimedEventImpl = ({
  columnIndex,
  focused,
  focusEvent,
  onGridKeyDown,
  past,
  renderEvent,
  rowIndex,
  segment,
  selected,
  selectEvent,
}: Omit<MonthTimedEventProps, "key">) => {
  const segmentValue: CalendarEventSegment = {
    date: segment.date,
    end: segment.end,
    event: segment.event,
    segment: segment.segment,
    start: segment.start,
  };

  const handleArrowKey = (
    keyboardEvent: ReactKeyboardEvent<HTMLDivElement>
  ): void => {
    onGridKeyDown(keyboardEvent, rowIndex, columnIndex, segment.event.id);
  };

  const handleFocus = (): void => {
    focusEvent(rowIndex, columnIndex, segment.event.id);
  };

  const handleSelect = (
    event: CalendarEvent,
    context: CalendarEventRenderContext,
    anchor: HTMLElement
  ): void => {
    selectEvent(event.id, context, anchor);
  };

  return (
    <MonthEventSlot
      event={segment.event}
      segment={segmentValue}
      rowIndex={rowIndex}
      selected={selected}
      past={past}
      focused={focused}
      startColumn={columnIndex}
      endColumn={columnIndex + 1}
      lane={0}
      renderEvent={renderEvent}
      onSelect={handleSelect}
      onFocus={handleFocus}
      onArrowKey={handleArrowKey}
    />
  );
};

const MonthTimedEvent = memo(MonthTimedEventImpl);

interface MonthAllDayEventProps
  extends
    Pick<MonthEventSlotProps, "focused" | "past" | "renderEvent" | "selected">,
    MonthEventControllerProps {
  readonly key: string;
  readonly rowIndex: number;
  readonly span: MonthGridAllDaySpan;
}

const MonthAllDayEventImpl = ({
  focused,
  focusEvent,
  onGridKeyDown,
  past,
  renderEvent,
  rowIndex,
  selected,
  selectEvent,
  span,
}: Omit<MonthAllDayEventProps, "key">) => {
  const handleArrowKey = (
    keyboardEvent: ReactKeyboardEvent<HTMLDivElement>
  ): void => {
    onGridKeyDown(keyboardEvent, rowIndex, span.startColumn, span.event.id);
  };

  const handleFocus = (): void => {
    focusEvent(rowIndex, span.startColumn, span.event.id);
  };

  const handleSelect = (
    event: CalendarEvent,
    context: CalendarEventRenderContext,
    anchor: HTMLElement
  ): void => {
    selectEvent(event.id, context, anchor);
  };

  return (
    <MonthEventSlot
      event={span.event}
      segment={span.segment}
      rowIndex={rowIndex}
      selected={selected}
      past={past}
      focused={focused}
      allDay
      startColumn={span.startColumn}
      endColumn={span.endColumn}
      lane={span.lane}
      renderEvent={renderEvent}
      onSelect={handleSelect}
      onFocus={handleFocus}
      onArrowKey={handleArrowKey}
    />
  );
};

const MonthAllDayEvent = memo(MonthAllDayEventImpl);

const cellAnnouncement = (
  cell: MonthGridCell,
  locale: string,
  timeZone: IanaTimeZone,
  t: CalendarTranslate
): string =>
  formatCalendarList(locale, [
    dateTimeFormatter(locale, { dateStyle: "full", timeZone }).format(
      new Date(cell.cell.start)
    ),
    t("calendar.month.eventCount", { count: cell.eventCount }),
  ]);

const dayStart = (date: CalendarDate, timeZone: IanaTimeZone): UtcInstant =>
  toUtcRange(buildDayRange(date, timeZone)).start;

const formatRangeAnnouncement = (
  range: CalendarDateRange | null,
  formatter: Intl.DateTimeFormat,
  timeZone: IanaTimeZone,
  t: CalendarTranslate
): string => {
  if (range === null) {
    return "";
  }

  const formatDay = (date: CalendarDate): string =>
    formatter.format(new Date(dayStart(date, timeZone)));

  return t("calendar.month.dateRangeSelected", {
    end: formatDay(range.end),
    start: formatDay(range.start),
  });
};

const isPastEvent = (event: CalendarEvent, now: UtcInstant): boolean => {
  if (event.allDay) {
    return false;
  }
  return Date.parse(event.end) < Date.parse(now);
};

const findFirstOverflowCell = (
  rows: readonly MonthGridRow[]
): MonthGridCell | undefined =>
  rows.flatMap((row) => row.cells).find((cell) => cell.hiddenCount > 0);

type MonthGridContentProps = Omit<MonthGridProps, keyof CalendarContextProps>;

const useMonthGridContent = (props: MonthGridContentProps) => {
  const { direction, locale, t } = useCalendarLocalization();
  const { timeZone } = useCalendarContext();

  const {
    date,
    events,
    now,
    monthData,
    selectedEventId,
    defaultSelectedEventId,
    onSelectedEventIdChange,
    onEventSelect,
    onEmptyCellSelect,
    selectionMode = "none",
    selectedDateRange,
    defaultSelectedDateRange,
    onSelectedDateRangeChange,
  } = props;

  const rangeMode = selectionMode === "date-range";

  const [selectionAnnouncement, setSelectionAnnouncement] = useState("");

  const controller = useMonthGridController({
    date,
    defaultSelectedEventId,
    densityCap: monthData?.densityCap,
    direction,
    events,
    now,
    onEventSelect,
    onSelectedEventIdChange,
    overflowByDate: monthData?.overflowByDate,
    selectedEventId,
    timeZone,
  });

  const { currentInstant } = controller;

  const today = useMemo(
    () => toViewerDateTime(currentInstant, timeZone).date,
    [currentInstant, timeZone]
  );

  const dayLabelFormatter = dateTimeFormatter(locale, {
    dateStyle: "long",
    timeZone,
  });
  const tagLabelFormatter = dateTimeFormatter(locale, {
    day: "numeric",
    month: "long",
    timeZone,
  });

  const liveAnnouncement = useMemo(
    () =>
      buildLiveAnnouncement(
        controller.announcement,
        controller.monthRange,
        controller.rows,
        locale,
        timeZone,
        t
      ),
    [
      controller.announcement,
      controller.monthRange,
      controller.rows,
      locale,
      t,
      timeZone,
    ]
  );

  const overflowCell = useMemo(
    () => findFirstOverflowCell(controller.rows),
    [controller.rows]
  );

  const overflowAnnouncement = useMemo(
    () =>
      overflowCell === undefined
        ? ""
        : buildLiveAnnouncement(
            {
              hiddenCount: overflowCell.hiddenCount,
              kind: MONTH_ANNOUNCEMENT_KIND.overflow,
            },
            controller.monthRange,
            controller.rows,
            locale,
            timeZone,
            t
          ),
    [controller.monthRange, controller.rows, locale, overflowCell, t, timeZone]
  );

  const rangeAnnouncement = useMemo(
    () =>
      buildLiveAnnouncement(
        { kind: MONTH_ANNOUNCEMENT_KIND.range },
        controller.monthRange,
        controller.rows,
        locale,
        timeZone,
        t
      ),
    [controller.monthRange, controller.rows, locale, t, timeZone]
  );

  const rangeSelection = useDateRangeSelection({
    defaultValue: defaultSelectedDateRange,
    onChange: (range) => {
      setSelectionAnnouncement(
        formatRangeAnnouncement(range, dayLabelFormatter, timeZone, t)
      );
      onSelectedDateRangeChange?.(range);
    },
    value: selectedDateRange,
  });

  const { getCellKey, rows } = controller;

  const cellsByKey = useMemo(
    () =>
      new Map(
        rows.flatMap((row) =>
          row.cells.map((cell) => [getCellKey(cell.cell), cell] as const)
        )
      ),
    [getCellKey, rows]
  );

  const dayAtTarget = (
    target: EventTarget | null
  ): CalendarDate | undefined => {
    if (
      !(target instanceof Element) ||
      target.closest(`[data-event-id], .${styles.overflow}`) !== null
    ) {
      return undefined;
    }

    const key = target.closest<HTMLElement>("[data-cell-key]")?.dataset.cellKey;

    return key === undefined ? undefined : cellsByKey.get(key)?.date;
  };

  const handleRangePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>
  ): void => {
    const day = dayAtTarget(event.target);

    if (!rangeMode || day === undefined || event.button !== 0) {
      return;
    }

    event.preventDefault();
    rangeSelection.press(day);
  };

  const handleRangePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>
  ): void => {
    const day = dayAtTarget(event.target);

    if (rangeMode && day !== undefined) {
      rangeSelection.hover(day);
    }
  };

  const handleRangePointerUp = (
    event: ReactPointerEvent<HTMLDivElement>
  ): void => {
    const day = dayAtTarget(event.target);

    if (rangeMode && day !== undefined) {
      rangeSelection.release(day);
    }
  };

  const handleCellFocus = (day: CalendarDate): void => {
    if (rangeMode) {
      setSelectionAnnouncement("");
      rangeSelection.hover(day);
    }
  };

  const allDayRowCountsByRow = useMemo(
    () =>
      new Map(
        controller.rows.map((row) => [
          row.row.key,
          buildAllDayRowCounts(row.allDaySpans, row.cells.length),
        ])
      ),
    [controller.rows]
  );

  const handleCellClick = (
    event: React.MouseEvent<HTMLDivElement>,
    cell: MonthGridCell,
    rowIndex: number,
    columnIndex: number
  ): void => {
    if (
      event.target instanceof Element &&
      event.target.closest(`[data-event-id], .${styles.overflow}`) !== null
    ) {
      return;
    }

    controller.setFocusedCell(rowIndex, columnIndex);
    event.currentTarget.focus();

    if (!rangeMode) {
      onEmptyCellSelect?.(cell.cell);
    }
  };

  const handleCellKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    rowIndex: number,
    columnIndex: number,
    cell: MonthGridCell
  ): void => {
    controller.handleGridKeyDown(event, rowIndex, columnIndex);

    if (rangeMode && event.key === "Escape" && rangeSelection.anchor !== null) {
      event.preventDefault();
      rangeSelection.cancel();

      return;
    }

    if (
      !event.defaultPrevented &&
      (event.key === "Enter" || event.key === " ") &&
      event.target instanceof Element &&
      event.target.closest(`[data-event-id], .${styles.overflow}`) === null
    ) {
      event.preventDefault();

      if (rangeMode) {
        rangeSelection.activate(cell.date);
      } else {
        onEmptyCellSelect?.(cell.cell);
      }
    }
  };

  return {
    allDayRowCountsByRow,
    controller,
    currentInstant,
    dayLabelFormatter,
    direction,
    handleCellClick,
    handleCellFocus,
    handleCellKeyDown,
    handleRangePointerDown,
    handleRangePointerMove,
    handleRangePointerUp,
    liveAnnouncement,
    locale,
    overflowAnnouncement,
    rangeAnnouncement,
    rangeMode,
    selectedRange: rangeSelection.range,
    selectionAnnouncement,
    t,
    tagLabelFormatter,
    timeZone,
    today,
  };
};

type MonthGridView = ReturnType<typeof useMonthGridContent>;

interface MonthDayCellProps {
  readonly allDayRowCount: number;
  readonly cell: MonthGridCell;
  readonly cellClassName?: string;
  readonly columnIndex: number;
  readonly controller: MonthGridControllerResult;
  readonly currentInstant: UtcInstant;
  readonly dayLabelFormatter: Intl.DateTimeFormat;
  readonly handleCellClick: MonthGridView["handleCellClick"];
  readonly handleCellFocus: MonthGridView["handleCellFocus"];
  readonly handleCellKeyDown: MonthGridView["handleCellKeyDown"];
  readonly locale: string;
  readonly onOverflowSelect: MonthGridProps["onOverflowSelect"];
  readonly rangeMode: boolean;
  readonly renderCell: MonthGridProps["renderCell"];
  readonly renderEvent: MonthGridProps["renderEvent"];
  readonly renderOverflow: MonthGridProps["renderOverflow"];
  readonly rowIndex: number;
  readonly selectedRange: CalendarDateRange | null;
  readonly t: CalendarTranslate;
  readonly tagLabelFormatter: Intl.DateTimeFormat;
  readonly timeZone: IanaTimeZone;
  readonly today: CalendarDate;
}

interface MonthDayNumberProps {
  readonly isToday: boolean;
  readonly label: string;
}

const MonthDayNumber = ({ isToday, label }: MonthDayNumberProps) => (
  <Tag
    className={clsx(
      styles.dayNumber,
      isToday ? styles.dayNumberToday : styles.dayNumberNoFill,
      "dayNumber"
    )}
    color={isToday ? "red" : "basic"}
    data-today={isToday ? "true" : undefined}
    size="s"
    variant={isToday ? "strong" : "regular"}
  >
    {label}
  </Tag>
);

const rangeClassName = (
  date: CalendarDate,
  range: CalendarDateRange | null
): string | undefined => {
  if (range === null) {
    return undefined;
  }

  return clsx(
    styles.inRange,
    date === range.start && styles.rangeStart,
    date === range.end && styles.rangeEnd
  );
};

const MonthDayCell = ({
  allDayRowCount,
  cell,
  cellClassName,
  columnIndex,
  controller,
  currentInstant,
  dayLabelFormatter,
  handleCellClick,
  handleCellFocus,
  handleCellKeyDown,
  locale,
  onOverflowSelect,
  rangeMode,
  renderCell,
  renderEvent,
  renderOverflow,
  rowIndex,
  selectedRange,
  t,
  tagLabelFormatter,
  timeZone,
  today,
}: MonthDayCellProps) => {
  const isFocusedCell =
    controller.focusedCell.rowIndex === rowIndex &&
    controller.focusedCell.columnIndex === columnIndex;

  const isFocused =
    isFocusedCell && controller.focusedCell.eventId === undefined;

  const cellKey = controller.getCellKey(cell.cell);
  const inRange = rangeMode && isDateInRange(cell.date, selectedRange);

  const cellContext: CalendarCellContext = {
    cell: cell.cell,
    isFocused,
    isReadOnly: false,
    isSelected: inRange,
    isUnavailable: false,
    key: cellKey,
    label: cellAnnouncement(cell, locale, timeZone, t),
  };

  const isToday = cell.date === today;
  const isFirstOfMonth = cell.date.endsWith("-01");
  const dayLabel = dayLabelFormatter.format(new Date(cell.cell.start));

  const tagLabel =
    isToday || isFirstOfMonth
      ? tagLabelFormatter.format(new Date(cell.cell.start))
      : formatMonthDayNumber(cell.date, locale);

  const timedEventsStyle: MonthGridDynamicStyles | undefined =
    allDayRowCount === 0
      ? undefined
      : { "--cal-month-all-day-row-count": allDayRowCount };

  const handleFocus = (focusEvent: ReactFocusEvent<HTMLDivElement>): void => {
    if (focusEvent.target !== focusEvent.currentTarget) {
      return;
    }

    controller.setFocusedCell(rowIndex, columnIndex);
    handleCellFocus(cell.date);
  };

  return (
    <div
      className={clsx(
        styles.dayCell,
        cell.isOutsideMonth && styles.outsideMonth,
        isToday && styles.today,
        rangeClassName(cell.date, inRange ? selectedRange : null),
        cellClassName
      )}
      data-cell-key={cellKey}
      role="gridcell"
      aria-colindex={columnIndex + 2}
      aria-rowindex={rowIndex + 2}
      aria-label={cellContext.label}
      aria-selected={rangeMode ? inRange : undefined}
      data-event-count={cell.eventCount}
      data-all-day-row-count={allDayRowCount}
      data-outside-month={String(cell.isOutsideMonth)}
      data-today={String(isToday)}
      tabIndex={isFocused ? 0 : -1}
      ref={(element) => {
        controller.setCellRef(rowIndex, columnIndex, element);
      }}
      onFocus={handleFocus}
      onClick={(clickEvent) => {
        handleCellClick(clickEvent, cell, rowIndex, columnIndex);
      }}
      onKeyDown={(keyEvent) => {
        handleCellKeyDown(keyEvent, rowIndex, columnIndex, cell);
      }}
    >
      <span className={styles.fullDate}>{dayLabel}</span>
      <MonthDayNumber isToday={isToday} label={tagLabel} />
      {renderCell?.(cellContext)}
      <div className={styles.timedEvents} style={timedEventsStyle}>
        {cell.visibleTimedEvents.map((segment) => (
          <MonthTimedEvent
            columnIndex={columnIndex}
            focusEvent={controller.focusEvent}
            focused={
              controller.focusedCell.eventId === segment.event.id &&
              controller.focusedCell.rowIndex === rowIndex &&
              controller.focusedCell.columnIndex === columnIndex
            }
            onGridKeyDown={controller.handleGridKeyDown}
            key={`${segment.event.id}:${segment.date}`}
            past={isPastEvent(segment.event, currentInstant)}
            renderEvent={renderEvent}
            rowIndex={rowIndex}
            segment={segment}
            selectEvent={controller.selectEvent}
            selected={controller.selectedEventId === segment.event.id}
          />
        ))}
        <MonthOverflowButton
          cell={cell}
          hiddenLabel={buildLiveAnnouncement(
            {
              hiddenCount: cell.hiddenCount,
              kind: MONTH_ANNOUNCEMENT_KIND.overflow,
            },
            controller.monthRange,
            controller.rows,
            locale,
            timeZone,
            t
          )}
          onOverflowSelect={onOverflowSelect}
          renderOverflow={renderOverflow}
        />
      </div>
    </div>
  );
};

const MonthGridContent = (props: MonthGridContentProps) => {
  const view = useMonthGridContent(props);

  const {
    allDayRowCountsByRow,
    controller,
    currentInstant,
    dayLabelFormatter,
    direction,
    liveAnnouncement,
    overflowAnnouncement,
    rangeAnnouncement,
    handleCellClick,
    handleCellFocus,
    handleCellKeyDown,
    handleRangePointerDown,
    handleRangePointerMove,
    handleRangePointerUp,
    locale,
    rangeMode,
    selectedRange,
    selectionAnnouncement,
    tagLabelFormatter,
    t,
    timeZone,
    today,
  } = view;

  const {
    className,
    onOverflowSelect,
    renderCell,
    renderEvent,
    renderOverflow,
    cellClassName,
    columnHeaderClassName,
    trailingGutter = false,
    weekNumberClassName,
    weekNumbering = "month",
  } = props;

  const weekdayDates = controller.rows[0]?.row.dates ?? [];
  const rootClassName = clsx(
    styles.monthGrid,
    "monthGrid",
    trailingGutter && styles.trailingGutter,
    className
  );
  const weeksHeading = t("calendar.month.weeks").toUpperCase();

  return (
    <div className={styles.container}>
      <div
        className={rootClassName}
        role="grid"
        aria-label={t("calendar.month.label")}
        aria-colcount={8}
        aria-multiselectable={rangeMode ? true : undefined}
        aria-rowcount={controller.rows.length + 1}
        dir={direction}
        onPointerDown={handleRangePointerDown}
        onPointerEnter={handleRangePointerMove}
        onPointerMove={handleRangePointerMove}
        onPointerUp={handleRangePointerUp}
      >
        <div className={styles.headerRow} role="row" aria-rowindex={1}>
          <div
            className={clsx(styles.headerCell, weekNumberClassName)}
            role="columnheader"
            aria-colindex={1}
          >
            {weeksHeading}
          </div>
          {weekdayDates.map((weekdayDate, index) => (
            <div
              className={clsx(styles.headerCell, columnHeaderClassName)}
              role="columnheader"
              aria-colindex={index + 2}
              key={weekdayDate}
            >
              {formatMonthWeekday(weekdayDate, timeZone, locale)}
            </div>
          ))}
          {trailingGutter && (
            <div
              className={clsx(
                styles.headerCell,
                styles.trailingWeekNumber,
                weekNumberClassName
              )}
              aria-hidden="true"
            >
              {weeksHeading}
            </div>
          )}
        </div>

        {controller.rows.map((row) => {
          const weekNumber = formatMonthWeekNumber(
            weekNumbering === "iso" ? row.row.weekNumber : row.row.rowIndex + 1,
            locale
          );
          const weekLabel = t("calendar.month.weekPrefix", {
            week: weekNumber,
          });

          return (
            <div
              className={clsx(styles.weekRow, "weekRow")}
              role="row"
              aria-rowindex={row.row.rowIndex + 2}
              key={row.row.key}
            >
              <div
                className={clsx(styles.weekNumber, weekNumberClassName)}
                role="rowheader"
                aria-rowindex={row.row.rowIndex + 2}
                aria-label={`${t("calendar.month.week")} ${weekNumber}`}
              >
                {weekLabel}
              </div>
              {row.cells.map((cell, columnIndex) => (
                <MonthDayCell
                  allDayRowCount={
                    allDayRowCountsByRow.get(row.row.key)?.[columnIndex] ?? 0
                  }
                  cell={cell}
                  cellClassName={cellClassName}
                  columnIndex={columnIndex}
                  controller={controller}
                  currentInstant={currentInstant}
                  dayLabelFormatter={dayLabelFormatter}
                  handleCellClick={handleCellClick}
                  handleCellFocus={handleCellFocus}
                  handleCellKeyDown={handleCellKeyDown}
                  key={controller.getCellKey(cell.cell)}
                  locale={locale}
                  onOverflowSelect={onOverflowSelect}
                  rangeMode={rangeMode}
                  renderCell={renderCell}
                  renderEvent={renderEvent}
                  renderOverflow={renderOverflow}
                  rowIndex={row.row.rowIndex}
                  selectedRange={selectedRange}
                  t={t}
                  tagLabelFormatter={tagLabelFormatter}
                  timeZone={timeZone}
                  today={today}
                />
              ))}
              <div className={styles.allDayLayer} role="presentation">
                {row.allDaySpans.map((span) => (
                  <MonthAllDayEvent
                    focusEvent={controller.focusEvent}
                    focused={
                      controller.focusedCell.eventId === span.event.id &&
                      controller.focusedCell.rowIndex === row.row.rowIndex &&
                      controller.focusedCell.columnIndex === span.startColumn
                    }
                    onGridKeyDown={controller.handleGridKeyDown}
                    key={span.key}
                    past={isPastEvent(span.event, currentInstant)}
                    renderEvent={renderEvent}
                    rowIndex={row.row.rowIndex}
                    selectEvent={controller.selectEvent}
                    selected={controller.selectedEventId === span.event.id}
                    span={span}
                  />
                ))}
              </div>
              {trailingGutter && (
                <div
                  className={clsx(
                    styles.weekNumber,
                    styles.trailingWeekNumber,
                    weekNumberClassName
                  )}
                  aria-hidden="true"
                >
                  {weekLabel}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div
        className={styles.liveRegion}
        role="status"
        aria-live="polite"
        aria-label={liveAnnouncement}
      >
        {selectionAnnouncement ||
          overflowAnnouncement ||
          liveAnnouncement ||
          rangeAnnouncement}
      </div>
    </div>
  );
};

export const MonthGrid = (props: MonthGridProps) => (
  <CalendarScope {...props}>
    <MonthGridContent {...omitCalendarContextProps(props)} />
  </CalendarScope>
);

MonthGrid.displayName = "MonthGrid";
