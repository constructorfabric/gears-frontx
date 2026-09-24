// @cpt-flow:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-host-data-boundary:p1
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-keyboard:p1
import { arrayAt } from "../../core/array";
import { formatViewerTimeZoneOffset } from "../../core/format";
import {
  EVENT_CHIP_HEIGHT,
  allocateAllDaySpans,
  segmentAllDayEventAcrossViewerDates,
  segmentEventsAcrossViewerDates,
} from "../../core/grid";
import type { AllDaySpan, ViewerDateEventSegment } from "../../core/grid";
import { dateTimeFormatter } from "../../core/intl-cache";
import { layoutTimedEvents } from "../../core/layout";
import type { TimedEventGeometry } from "../../core/layout";
import type {
  CalendarCell,
  CalendarDate,
  CalendarEvent,
  CalendarEventGeometry,
  CalendarEventSegment,
  CalendarGridColumn,
  CalendarGridRow,
  CalendarTimeWindow,
  IanaTimeZone,
  UtcInstant,
  UtcRange,
} from "../../core/model";
import {
  addCalendarDays,
  buildDayRange,
  compareUtcInstants,
  isWithinTimeWindow,
  toUtcRange,
  toViewerDateTime,
} from "../../core/temporal";
import {
  parseLocalTime,
  resolveDaySegment,
  utcInstant,
} from "../../core/validation";
import type { CalendarTranslate } from "../../i18n/calendar-localization";
import type { WeekGridDayColumn } from "../../react/controllers/use-week-grid-controller";

export const HOUR_ROW_HEIGHT = 43;

export interface CellMeta {
  readonly kind: "gutter" | "all-day" | "timed";
  readonly cell: CalendarCell;
  readonly columnIndex: number;
  readonly slotIndex: number | null;
  readonly label: string;
}

export interface GridData {
  readonly columns: readonly CalendarGridColumn[];
  readonly rows: readonly CalendarGridRow[];
  readonly metaByCell: ReadonlyMap<CalendarCell, CellMeta>;
  readonly allDayCellByDate: ReadonlyMap<CalendarDate, CalendarCell>;
  readonly cellByKey: ReadonlyMap<string, CalendarCell>;
  readonly cellKeyByCell: ReadonlyMap<CalendarCell, string>;
}

export interface PositionedEvent<Payload> {
  readonly event: CalendarEvent<Payload>;
  readonly segment: CalendarEventSegment;
  readonly geometry: CalendarEventGeometry;
  readonly top: number;
  readonly height: number;
}

export interface AllDayPosition<Payload> {
  readonly event: CalendarEvent<Payload>;
  readonly segment: CalendarEventSegment;
  readonly geometry: CalendarEventGeometry;
  readonly startColumn: number;
  readonly endColumn: number;
  readonly lane: number;
}

export interface WeekGridAxis {
  readonly slotRowCount: number;
  readonly workingHours: CalendarTimeWindow;
}

export interface NowPosition {
  readonly cellKey: string;
  readonly offset: number;
}

type CellMetaBase = Pick<CellMeta, "kind" | "columnIndex" | "slotIndex">;

interface CellLabelParts {
  readonly dateLabel?: string;
  readonly timeLabel?: string;
}

interface WeekGridFormatters {
  readonly fullDate: Intl.DateTimeFormat;
  readonly time: Intl.DateTimeFormat;
  readonly weekday: Intl.DateTimeFormat;
  readonly dayNumber: Intl.DateTimeFormat;
}

const getWeekGridFormatters = (
  locale: string,
  timeZone: IanaTimeZone
): WeekGridFormatters => ({
  dayNumber: dateTimeFormatter(locale, { day: "numeric", timeZone }),
  fullDate: dateTimeFormatter(locale, { dateStyle: "full", timeZone }),
  time: dateTimeFormatter(locale, {
    hour12: false,
    timeStyle: "short",
    timeZone,
  }),
  weekday: dateTimeFormatter(locale, { timeZone, weekday: "short" }),
});

type TimedCalendarEvent<Payload> = Extract<
  CalendarEvent<Payload>,
  { readonly allDay: false }
>;

type AllDayCalendarEvent<Payload> = Extract<
  CalendarEvent<Payload>,
  { readonly allDay: true }
>;

interface AllDaySource<Payload> {
  readonly id: string;
  readonly start: UtcInstant;
  readonly end: UtcInstant;
  readonly source: AllDayCalendarEvent<Payload>;
}

const buildDayUtcRange = (
  date: CalendarDate,
  timeZone: IanaTimeZone
): UtcRange => {
  if (timeZone === "UTC") {
    const endDate = addCalendarDays(date, 1);

    return {
      end: utcInstant(`${endDate}T00:00:00.000Z`),
      start: utcInstant(`${date}T00:00:00.000Z`),
    };
  }

  return toUtcRange(buildDayRange(date, timeZone));
};

const createGutterCell = (source: CalendarCell): CalendarCell => ({
  date: source.date,
  end: source.end,
  endTime: source.endTime,
  start: source.start,
  startTime: source.startTime,
});

const buildTimeGutterLabel = (
  firstViewerDate: CalendarDate | undefined,
  dayRanges: ReadonlyMap<CalendarDate, UtcRange>,
  timeZone: IanaTimeZone,
  locale: string,
  t: CalendarTranslate
): string => {
  const firstRange =
    firstViewerDate === undefined ? undefined : dayRanges.get(firstViewerDate);

  if (firstRange === undefined) {
    return t("calendar.week.timeZone");
  }

  return formatViewerTimeZoneOffset(firstRange.start, timeZone, locale);
};

const buildGutterLabel = (
  cell: CalendarCell,
  meta: Pick<CellMeta, "slotIndex">,
  t: CalendarTranslate
): string =>
  meta.slotIndex === null ? t("calendar.week.allDay") : cell.startTime;

export const buildCellLabel = (
  cell: CalendarCell,
  meta: Pick<CellMeta, "kind" | "slotIndex">,
  timeZone: IanaTimeZone,
  locale: string,
  t: CalendarTranslate,
  workingHours: CalendarTimeWindow,
  labelParts: CellLabelParts = {}
): string => {
  // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-render
  if (meta.kind === "gutter") {
    return buildGutterLabel(cell, meta, t);
  }

  const dateLabel =
    labelParts.dateLabel ??
    getWeekGridFormatters(locale, timeZone).fullDate.format(
      new Date(buildDayUtcRange(cell.date, timeZone).start)
    );

  if (meta.kind === "all-day") {
    return `${dateLabel} ${t("calendar.week.allDay")}`;
  }

  const timeLabel =
    labelParts.timeLabel ??
    getWeekGridFormatters(locale, timeZone).time.format(new Date(cell.start));

  const workingLabel = t(
    isWithinTimeWindow(cell.startTime, workingHours)
      ? "calendar.week.workingHour"
      : "calendar.week.nonWorkingHour"
  );

  return `${dateLabel} ${timeLabel} ${workingLabel}`;
  // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-render
};

const registerCell = (
  cell: CalendarCell,
  key: string,
  metaBase: CellMetaBase,
  metaByCell: Map<CalendarCell, CellMeta>,
  cellByKey: Map<string, CalendarCell>,
  cellKeyByCell: Map<CalendarCell, string>,
  timeZone: IanaTimeZone,
  locale: string,
  t: CalendarTranslate,
  workingHours: CalendarTimeWindow,
  labelParts: CellLabelParts
): void => {
  const meta: CellMeta = {
    ...metaBase,
    cell,
    label: buildCellLabel(
      cell,
      metaBase,
      timeZone,
      locale,
      t,
      workingHours,
      labelParts
    ),
  };

  metaByCell.set(cell, meta);
  cellByKey.set(key, cell);
  cellKeyByCell.set(cell, key);
};

export const buildGridData = (
  dayColumns: readonly WeekGridDayColumn[],
  viewerDates: readonly CalendarDate[],
  timeZone: IanaTimeZone,
  t: CalendarTranslate,
  locale: string,
  getTimedCellKey: (cell: CalendarCell) => string,
  axis: WeekGridAxis
): GridData => {
  // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-derive
  const formatters = getWeekGridFormatters(locale, timeZone);
  const dateLabels = new Map<CalendarDate, string>();
  const dayRanges = new Map<CalendarDate, UtcRange>();

  for (const viewerDate of viewerDates) {
    const dayRange = buildDayUtcRange(viewerDate, timeZone);
    dayRanges.set(viewerDate, dayRange);
    dateLabels.set(
      viewerDate,
      formatters.fullDate.format(new Date(dayRange.start))
    );
  }

  const timeGutterLabel = buildTimeGutterLabel(
    arrayAt(viewerDates, 0),
    dayRanges,
    timeZone,
    locale,
    t
  );

  const columns: CalendarGridColumn[] = [
    { key: "time", label: timeGutterLabel },
  ];

  for (const viewerDate of viewerDates) {
    columns.push({
      key: viewerDate,
      label: dateLabels.get(viewerDate) ?? viewerDate,
    });
  }

  const metaByCell = new Map<CalendarCell, CellMeta>();
  const allDayCellByDate = new Map<CalendarDate, CalendarCell>();
  const cellByKey = new Map<string, CalendarCell>();
  const cellKeyByCell = new Map<CalendarCell, string>();

  const rows: CalendarGridRow[] = [];

  const timeLabels = new Map<UtcInstant, string>();

  for (const column of dayColumns) {
    for (const cell of column.slots) {
      timeLabels.set(cell.start, formatters.time.format(new Date(cell.start)));
    }
  }

  const fallbackCell = arrayAt(arrayAt(dayColumns, 0)?.slots ?? [], 0);

  if (!fallbackCell) {
    return {
      allDayCellByDate,
      cellByKey,
      cellKeyByCell,
      columns,
      metaByCell,
      rows,
    };
  }

  const allDayGutter = createGutterCell(fallbackCell);
  registerCell(
    allDayGutter,
    "gutter:all-day",
    { columnIndex: 0, kind: "gutter", slotIndex: null },
    metaByCell,
    cellByKey,
    cellKeyByCell,
    timeZone,
    locale,
    t,
    axis.workingHours,
    {
      dateLabel: dateLabels.get(allDayGutter.date),
      timeLabel: timeLabels.get(allDayGutter.start),
    }
  );

  const allDayCells: CalendarCell[] = [allDayGutter];

  for (const [columnIndex, viewerDate] of viewerDates.entries()) {
    const range = dayRanges.get(viewerDate);

    if (range === undefined) {
      continue;
    }

    const cell: CalendarCell = {
      date: viewerDate,
      end: range.end,
      endTime: parseLocalTime("00:00"),
      start: range.start,
      startTime: parseLocalTime("00:00"),
    };

    allDayCells.push(cell);
    allDayCellByDate.set(viewerDate, cell);
    registerCell(
      cell,
      `all-day:${viewerDate}`,
      { columnIndex, kind: "all-day", slotIndex: null },
      metaByCell,
      cellByKey,
      cellKeyByCell,
      timeZone,
      locale,
      t,
      axis.workingHours,
      {
        dateLabel: dateLabels.get(cell.date),
        timeLabel: timeLabels.get(cell.start),
      }
    );
  }

  rows.push({ cells: allDayCells, key: "all-day" });

  for (let slotIndex = 0; slotIndex < axis.slotRowCount; slotIndex += 1) {
    // Slot counts differ across DST, so use the first column that has this row.
    let slotSource = fallbackCell;

    for (const column of dayColumns) {
      const cell = arrayAt(column.slots, slotIndex);

      if (cell) {
        slotSource = cell;

        break;
      }
    }

    const gutter = createGutterCell(slotSource);

    const cells: CalendarCell[] = [gutter];

    registerCell(
      gutter,
      `gutter:${slotIndex}`,
      { columnIndex: 0, kind: "gutter", slotIndex },
      metaByCell,
      cellByKey,
      cellKeyByCell,
      timeZone,
      locale,
      t,
      axis.workingHours,
      {
        dateLabel: dateLabels.get(gutter.date),
        timeLabel: timeLabels.get(gutter.start),
      }
    );

    for (const [columnIndex, column] of dayColumns.entries()) {
      const cell = arrayAt(column.slots, slotIndex);

      if (!cell) {
        continue;
      }

      cells.push(cell);
      registerCell(
        cell,
        getTimedCellKey(cell),
        { columnIndex, kind: "timed", slotIndex },
        metaByCell,
        cellByKey,
        cellKeyByCell,
        timeZone,
        locale,
        t,
        axis.workingHours,
        {
          dateLabel: dateLabels.get(cell.date),
          timeLabel: timeLabels.get(cell.start),
        }
      );
    }

    rows.push({ cells, key: `slot-${slotIndex}` });
  }

  return {
    allDayCellByDate,
    cellByKey,
    cellKeyByCell,
    columns,
    metaByCell,
    rows,
  };
  // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-derive
};

export const buildTimedSegments = <Payload>(
  events: readonly CalendarEvent<Payload>[],
  viewerDates: readonly CalendarDate[],
  timeZone: IanaTimeZone
): readonly ViewerDateEventSegment<TimedCalendarEvent<Payload>>[] => {
  const timedEvents = events.flatMap((event) => (event.allDay ? [] : [event]));

  return segmentEventsAcrossViewerDates(timedEvents, viewerDates, timeZone);
};

export const buildVisibleAllDaySpans = <Payload>(
  events: readonly CalendarEvent<Payload>[],
  allViewerDates: readonly CalendarDate[],
  viewerDates: readonly CalendarDate[],
  timeZone: IanaTimeZone
): readonly AllDaySpan<AllDaySource<Payload>>[] => {
  const allDayEvents = events.flatMap((event) => (event.allDay ? [event] : []));

  const segments = allDayEvents.flatMap((event) =>
    segmentAllDayEventAcrossViewerDates(event, allViewerDates, timeZone)
  );

  const spans = allocateAllDaySpans(segments, allViewerDates);

  const visible: AllDaySpan<AllDaySource<Payload>>[] = [];

  const visibleCount = viewerDates.length;

  for (const span of spans) {
    const startColumn = Math.max(0, span.startColumn);
    const endColumn = Math.min(visibleCount, span.endColumn);

    if (endColumn > startColumn) {
      visible.push({
        ...span,
        continuesAfter: span.continuesAfter || span.endColumn > visibleCount,
        endColumn,
        startColumn,
      });
    }
  }

  return visible;
};

const findCellIndex = (
  cells: readonly CalendarCell[],
  start: UtcInstant,
  end: UtcInstant
): number => {
  for (const [index, cell] of cells.entries()) {
    if (
      compareUtcInstants(start, cell.end) < 0 &&
      compareUtcInstants(end, cell.start) > 0
    ) {
      return index;
    }
  }

  return 0;
};

const clipSegmentsToRange = <
  T extends { readonly start: UtcInstant; readonly end: UtcInstant },
>(
  segments: readonly T[],
  range: UtcRange
): readonly T[] =>
  segments.flatMap((segment) => {
    const start =
      compareUtcInstants(segment.start, range.start) > 0
        ? segment.start
        : range.start;

    const end =
      compareUtcInstants(segment.end, range.end) < 0 ? segment.end : range.end;

    return compareUtcInstants(start, end) < 0
      ? [{ ...segment, end, start }]
      : [];
  });

export const buildTimedPositions = <Payload>(
  segments: readonly ViewerDateEventSegment<TimedCalendarEvent<Payload>>[],
  dayColumns: readonly WeekGridDayColumn[],
  getCellKey: (cell: CalendarCell) => string
): ReadonlyMap<string, readonly PositionedEvent<Payload>[]> => {
  // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-derive
  const byCell = new Map<string, PositionedEvent<Payload>[]>();
  const segmentsByDate = new Map<
    CalendarDate,
    ViewerDateEventSegment<TimedCalendarEvent<Payload>>[]
  >();

  for (const segment of segments) {
    const current = segmentsByDate.get(segment.date);

    if (current === undefined) {
      segmentsByDate.set(segment.date, [segment]);
    } else {
      current.push(segment);
    }
  }

  for (const column of dayColumns) {
    const columnSegments = clipSegmentsToRange(
      segmentsByDate.get(column.date) ?? [],
      column.range
    );
    const layoutInput = columnSegments.map((segment) => ({
      end: segment.end,
      id: segment.key,
      start: segment.start,
    }));

    const layouts = layoutTimedEvents(layoutInput);
    const layoutById = new Map<string, TimedEventGeometry>();

    for (const layout of layouts) {
      layoutById.set(layout.id, layout);
    }

    const { range, slots } = column;
    const rangeStartEpoch = Date.parse(range.start);
    const rangeDuration = Date.parse(range.end) - rangeStartEpoch;
    const columnHeight = Math.max(slots.length, 1) * HOUR_ROW_HEIGHT;

    for (const segment of columnSegments) {
      const layout = layoutById.get(segment.key);

      if (!layout) {
        continue;
      }

      const startIndex = findCellIndex(slots, segment.start, segment.end);
      const startCell = arrayAt(slots, startIndex);

      if (!startCell) {
        continue;
      }

      const top =
        ((Date.parse(segment.start) - rangeStartEpoch) / rangeDuration) *
          columnHeight -
        startIndex * HOUR_ROW_HEIGHT;

      const height = Math.max(
        4,
        ((Date.parse(segment.end) - Date.parse(segment.start)) /
          rangeDuration) *
          columnHeight
      );

      const eventSegment: CalendarEventSegment = {
        date: segment.date,
        end: segment.end,
        event: segment.event,
        segment: segment.segment,
        start: segment.start,
      };

      const positioned: PositionedEvent<Payload> = {
        event: segment.event,
        geometry: {
          height,
          inlineSize: layout.width,
          insetInlineStart: layout.left,
          top,
          zIndex: layout.zIndex,
        },
        height,
        segment: eventSegment,
        top,
      };

      const key = getCellKey(startCell);
      const current = byCell.get(key);

      if (current) {
        current.push(positioned);
      } else {
        byCell.set(key, [positioned]);
      }
    }
  }

  return byCell;
  // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-derive
};

export const buildAllDayPositions = <Payload>(
  spans: readonly AllDaySpan<AllDaySource<Payload>>[],
  gridData: GridData,
  getCellKey: (cell: CalendarCell) => string,
  timeZone: IanaTimeZone
): ReadonlyMap<string, readonly AllDayPosition<Payload>[]> => {
  // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-derive
  const byCell = new Map<string, AllDayPosition<Payload>[]>();

  const dates = [...gridData.allDayCellByDate.keys()];

  for (const span of spans) {
    const date = arrayAt(dates, span.startColumn);

    if (date === undefined) {
      continue;
    }

    const cell = gridData.allDayCellByDate.get(date);

    if (cell === undefined) {
      continue;
    }

    const range = buildDayUtcRange(date, timeZone);

    const segment: CalendarEventSegment = {
      date,
      end: range.end,
      event: span.event.source,
      segment: resolveDaySegment(!span.continuesBefore, !span.continuesAfter),
      start: range.start,
    };

    const position: AllDayPosition<Payload> = {
      endColumn: span.endColumn,
      event: span.event.source,
      geometry: {
        height: EVENT_CHIP_HEIGHT,
        inlineSize: span.endColumn - span.startColumn,
        insetInlineStart: 0,
        top: 0,
        zIndex: span.lane + 1,
      },
      lane: span.lane,
      segment,
      startColumn: span.startColumn,
    };

    const key = getCellKey(cell);
    const current = byCell.get(key);

    if (current) {
      current.push(position);
    } else {
      byCell.set(key, [position]);
    }
  }

  return byCell;
  // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-derive
};

export const buildUnavailableCellKeys = <Payload>(
  events: readonly CalendarEvent<Payload>[],
  dayColumns: readonly WeekGridDayColumn[],
  getCellKey: (cell: CalendarCell) => string,
  timeZone: IanaTimeZone
): ReadonlySet<string> => {
  const unavailable = new Set<string>();
  const cellsByDate = new Map<CalendarDate, readonly CalendarCell[]>();

  for (const column of dayColumns) {
    cellsByDate.set(column.date, column.slots);
  }

  for (const event of events) {
    if (
      event.allDay ||
      ((event.available ?? true) && event.access !== "busy")
    ) {
      continue;
    }

    try {
      const startDate = toViewerDateTime(event.start, timeZone).date;
      const endDate = toViewerDateTime(event.end, timeZone).date;

      for (const column of dayColumns) {
        if (column.date < startDate || column.date > endDate) {
          continue;
        }

        for (const cell of cellsByDate.get(column.date) ?? []) {
          if (
            compareUtcInstants(event.start, cell.end) < 0 &&
            compareUtcInstants(event.end, cell.start) > 0
          ) {
            unavailable.add(getCellKey(cell));
          }
        }
      }
    } catch {
      continue;
    }
  }

  return unavailable;
};

export const buildNowPosition = (
  currentInstant: UtcInstant,
  viewerDates: readonly CalendarDate[],
  dayColumns: readonly WeekGridDayColumn[],
  timeZone: IanaTimeZone,
  getCellKey: (cell: CalendarCell) => string
): NowPosition | null => {
  const currentDate = toViewerDateTime(currentInstant, timeZone).date;
  const columnIndex = viewerDates.indexOf(currentDate);

  if (columnIndex === -1) {
    return null;
  }

  const column = arrayAt(dayColumns, columnIndex);
  const firstCell = arrayAt(column?.slots ?? [], 0);

  if (!column || !firstCell) {
    return null;
  }

  const { range } = column;
  const elapsed = Date.parse(currentInstant) - Date.parse(range.start);
  const duration = Date.parse(range.end) - Date.parse(range.start);

  if (elapsed < 0 || elapsed >= duration) {
    return null;
  }

  const offset = (elapsed / duration) * column.slots.length * HOUR_ROW_HEIGHT;

  return { cellKey: getCellKey(firstCell), offset };
};

export const formatWeekday = (
  instant: UtcInstant,
  timeZone: IanaTimeZone,
  locale: string
): string =>
  getWeekGridFormatters(locale, timeZone)
    .weekday.format(new Date(instant))
    .toLocaleUpperCase(locale);

export const formatDayNumber = (
  instant: UtcInstant,
  timeZone: IanaTimeZone,
  locale: string
): string =>
  getWeekGridFormatters(locale, timeZone).dayNumber.format(new Date(instant));

export const formatFullDateForDate = (
  date: CalendarDate,
  timeZone: IanaTimeZone,
  locale: string
): string => {
  const instant = buildDayUtcRange(date, timeZone).start;

  return getWeekGridFormatters(locale, timeZone).fullDate.format(
    new Date(instant)
  );
};
