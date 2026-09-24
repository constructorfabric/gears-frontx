import { sortCopy } from "./array";
import type {
  CalendarDate,
  IanaTimeZone,
  UtcInstant,
  ViewerDaySegment,
} from "./model";
// @cpt-flow:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-host-data-boundary:p1
import {
  addCalendarDays,
  buildDayRange,
  buildMonthRange,
  compareUtcInstants,
  toUtcRange,
  toViewerDateTime,
  weekdayIndex,
} from "./temporal";
import {
  VIEWER_DAY_SEGMENT,
  calendarDate,
  resolveDaySegment,
  utcInstant,
} from "./validation";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
export const DAYS_PER_WEEK = 7;

export const EVENT_CHIP_HEIGHT = 21;

const MONTH_CELL_BOX_MODEL = {
  chipGap: 4,
  chipHeight: EVENT_CHIP_HEIGHT,
  dayChipHeight: 20,
  gapAfterDayChip: 6,
  padBottom: 6,
  padTop: 6,
} as const;

interface DayColumnGeometryInput {
  readonly viewerDate: CalendarDate;
  readonly timeZone: IanaTimeZone;
  readonly start: UtcInstant;
  readonly end: UtcInstant;
}

interface DayColumnGeometry {
  readonly dayStartEpoch: number;
  readonly dayEndEpoch: number;
  readonly duration: number;
  readonly startPercentOfDay: number;
  readonly endPercentOfDay: number;
}

export interface GridEvent {
  readonly id: string;
  readonly start: UtcInstant;
  readonly end: UtcInstant;
  readonly allDay?: boolean;
}

interface AllDayDateInterval {
  readonly id: string;
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate;
}

export interface ViewerDateEventSegment<T extends GridEvent = GridEvent> {
  readonly key: string;
  readonly event: T;
  readonly date: CalendarDate;
  readonly start: UtcInstant;
  readonly end: UtcInstant;
  readonly segment: ViewerDaySegment["segment"];
}

const toViewerDayUtcRange = (date: CalendarDate, timeZone: IanaTimeZone) => {
  if (timeZone === "UTC") {
    const endDate = addCalendarDays(date, 1);

    return {
      end: utcInstant(`${endDate}T00:00:00.000Z`),
      start: utcInstant(`${date}T00:00:00.000Z`),
    };
  }

  return toUtcRange(buildDayRange(date, timeZone));
};

type EventColumnIndex = ReadonlyMap<string, ReadonlySet<number>>;

const buildEventColumnIndex = <T extends GridEvent>(
  segments: readonly ViewerDateEventSegment<T>[],
  dateIndexes: ReadonlyMap<CalendarDate, number>
): EventColumnIndex => {
  const index = new Map<string, Set<number>>();

  for (const segment of segments) {
    const displayIndex = dateIndexes.get(segment.date);

    if (displayIndex === undefined) {
      continue;
    }

    const columns = index.get(segment.event.id);

    if (columns === undefined) {
      index.set(segment.event.id, new Set([displayIndex % DAYS_PER_WEEK]));
    } else {
      columns.add(displayIndex % DAYS_PER_WEEK);
    }
  }

  return index;
};

const hasEventAtColumn = (
  index: EventColumnIndex,
  eventId: string,
  column: number
): boolean => index.get(eventId)?.has(column) ?? false;

const continuesBefore = (segment: ViewerDaySegment["segment"]): boolean =>
  segment === VIEWER_DAY_SEGMENT.middle || segment === VIEWER_DAY_SEGMENT.end;

const continuesAfter = (segment: ViewerDaySegment["segment"]): boolean =>
  segment === VIEWER_DAY_SEGMENT.middle || segment === VIEWER_DAY_SEGMENT.start;

const buildSpanCandidate = <T extends GridEvent>(
  group: SegmentGroup<T>,
  columns: ReadonlyMap<number, ViewerDateEventSegment<T>>,
  startColumn: number,
  endColumn: number
): SpanCandidateInput<T> => {
  const firstSegment = columns.get(startColumn);
  const lastSegment = columns.get(endColumn - 1);

  if (!firstSegment || !lastSegment) {
    throw new Error(`Missing all-day segment for ${group.event.id}`);
  }

  return {
    continuesAfter: continuesAfter(lastSegment.segment),
    continuesBefore: continuesBefore(firstSegment.segment),
    endColumn,
    event: group.event,
    key: `${group.event.id}:${startColumn}-${endColumn}`,
    startColumn,
  };
};

const percentOfDay = (
  epoch: number,
  dayStartEpoch: number,
  duration: number
): number =>
  Math.max(0, Math.min(100, ((epoch - dayStartEpoch) / duration) * 100));

const isoWeekNumber = (date: CalendarDate): number => {
  const mondayOffset = (weekdayIndex(date) + 6) % 7;
  const thursday = addCalendarDays(date, 3 - mondayOffset);
  const januaryFourth = calendarDate(`${thursday.slice(0, 4)}-01-04`);

  const firstWeekMonday = addCalendarDays(
    januaryFourth,
    -((weekdayIndex(januaryFourth) + 6) % 7)
  );

  return (
    Math.floor(
      (Date.parse(`${thursday}T00:00:00.000Z`) -
        Date.parse(`${firstWeekMonday}T00:00:00.000Z`)) /
        (DAYS_PER_WEEK * MILLISECONDS_PER_DAY)
    ) + 1
  );
};

export interface AllDaySpan<T extends GridEvent = GridEvent> {
  readonly key: string;
  readonly event: T;
  readonly startColumn: number;
  readonly endColumn: number;
  readonly lane: number;
  readonly continuesBefore: boolean;
  readonly continuesAfter: boolean;
}

export interface MonthWeekFragment<T extends GridEvent = GridEvent> {
  readonly key: string;
  readonly event: T;
  readonly rowIndex: number;
  readonly startColumn: number;
  readonly endColumn: number;
  readonly continuesBefore: boolean;
  readonly continuesAfter: boolean;
}

export interface MonthWeekRow<T extends GridEvent = GridEvent> {
  readonly key: string;
  readonly rowIndex: number;
  readonly weekStart: CalendarDate;
  readonly weekNumber: number;
  readonly dates: readonly CalendarDate[];
  readonly fragments: readonly MonthWeekFragment<T>[];
}

interface MonthWeekBuckets<T extends GridEvent = GridEvent> {
  readonly monthStart: CalendarDate;
  readonly monthEndExclusive: CalendarDate;
  readonly rows: readonly MonthWeekRow<T>[];
}

interface MonthCellCapacityInput {
  readonly cellHeight: number;
  readonly eventCount: number;
}

interface MonthCellCapacity {
  readonly capacity: number;
  readonly visibleCount: number;
  readonly hiddenCount: number;
}

interface SegmentGroup<T extends GridEvent> {
  readonly event: T;
  readonly segments: ViewerDateEventSegment<T>[];
}

type SpanCandidateInput<T extends GridEvent> = Omit<AllDaySpan<T>, "lane">;

const groupSegmentsByEvent = <T extends GridEvent>(
  segments: readonly ViewerDateEventSegment<T>[],
  dateIndexes?: ReadonlyMap<CalendarDate, number>
): Map<string, SegmentGroup<T>> => {
  const grouped = new Map<string, SegmentGroup<T>>();

  for (const segment of segments) {
    if (
      dateIndexes !== undefined &&
      dateIndexes.get(segment.date) === undefined
    ) {
      continue;
    }

    const existing = grouped.get(segment.event.id);

    if (existing !== undefined) {
      existing.segments.push(segment);

      continue;
    }

    grouped.set(segment.event.id, {
      event: segment.event,
      segments: [segment],
    });
  }

  return grouped;
};

const buildEventColumns = <T extends GridEvent>(
  group: SegmentGroup<T>,
  dateIndexes: ReadonlyMap<CalendarDate, number>
): Map<number, ViewerDateEventSegment<T>> => {
  const columns = new Map<number, ViewerDateEventSegment<T>>();

  for (const segment of group.segments) {
    const displayIndex = dateIndexes.get(segment.date);

    if (displayIndex !== undefined) {
      columns.set(displayIndex % DAYS_PER_WEEK, segment);
    }
  }

  return columns;
};

const buildSpanEventColumns = <T extends GridEvent>(
  group: SegmentGroup<T>,
  dateIndexes: ReadonlyMap<CalendarDate, number>
): Map<number, ViewerDateEventSegment<T>> => {
  const columns = new Map<number, ViewerDateEventSegment<T>>();

  for (const segment of group.segments) {
    const displayIndex = dateIndexes.get(segment.date);

    if (displayIndex !== undefined && !columns.has(displayIndex)) {
      columns.set(displayIndex, segment);
    }
  }

  return columns;
};

const buildContiguousColumnRuns = (
  sortedColumns: readonly number[]
): readonly (readonly [number, number])[] => {
  if (sortedColumns.length === 0) {
    return [];
  }

  const runs: (readonly [number, number])[] = [];

  const [firstColumn] = sortedColumns;

  if (firstColumn === undefined) {
    return runs;
  }

  let runStart = firstColumn;
  let previousColumn = runStart;

  for (const column of sortedColumns.slice(1)) {
    if (column === previousColumn + 1) {
      previousColumn = column;

      continue;
    }

    runs.push([runStart, previousColumn + 1]);
    runStart = column;
    previousColumn = column;
  }

  runs.push([runStart, previousColumn + 1]);

  return runs;
};

const buildMonthWeekFragmentsForGroup = <T extends GridEvent>(
  group: SegmentGroup<T>,
  columns: ReadonlyMap<number, ViewerDateEventSegment<T>>,
  rowIndex: number,
  previousEventColumns: EventColumnIndex,
  nextEventColumns: EventColumnIndex
): MonthWeekFragment<T>[] => {
  const sortedColumns = sortCopy(
    [...columns.keys()],
    (left, right) => left - right
  );

  const fragments: MonthWeekFragment<T>[] = [];

  const eventId = group.event.id;

  for (const [startColumn, endColumn] of buildContiguousColumnRuns(
    sortedColumns
  )) {
    const firstSegment = columns.get(startColumn);
    const lastSegment = columns.get(endColumn - 1);

    if (!firstSegment || !lastSegment) {
      throw new Error(`Missing month segment for ${eventId}`);
    }

    fragments.push({
      continuesAfter:
        endColumn < DAYS_PER_WEEK
          ? columns.has(endColumn)
          : hasEventAtColumn(nextEventColumns, eventId, 0),
      continuesBefore:
        startColumn > 0
          ? columns.has(startColumn - 1)
          : hasEventAtColumn(previousEventColumns, eventId, DAYS_PER_WEEK - 1),
      endColumn,
      event: group.event,
      key: `${eventId}:row-${rowIndex}:${startColumn}-${endColumn}`,
      rowIndex,
      startColumn,
    });
  }

  return fragments;
};

const buildMonthWeekFragments = <T extends GridEvent>(
  rowSegments: readonly ViewerDateEventSegment<T>[],
  dateIndexes: ReadonlyMap<CalendarDate, number>,
  rowIndex: number,
  previousRowSegments: readonly ViewerDateEventSegment<T>[],
  nextRowSegments: readonly ViewerDateEventSegment<T>[]
): readonly MonthWeekFragment<T>[] => {
  const previousEventColumns = buildEventColumnIndex(
    previousRowSegments,
    dateIndexes
  );
  const nextEventColumns = buildEventColumnIndex(nextRowSegments, dateIndexes);
  const grouped = groupSegmentsByEvent(rowSegments);

  const fragments: MonthWeekFragment<T>[] = [];

  for (const group of grouped.values()) {
    const columns = buildEventColumns(group, dateIndexes);
    fragments.push(
      ...buildMonthWeekFragmentsForGroup(
        group,
        columns,
        rowIndex,
        previousEventColumns,
        nextEventColumns
      )
    );
  }

  return fragments;
};

const buildAllDaySpanCandidates = <T extends GridEvent>(
  segments: readonly ViewerDateEventSegment<T>[],
  dateIndexes: ReadonlyMap<CalendarDate, number>
): SpanCandidateInput<T>[] => {
  const grouped = groupSegmentsByEvent(segments, dateIndexes);

  const candidates: SpanCandidateInput<T>[] = [];

  for (const group of grouped.values()) {
    const columns = buildSpanEventColumns(group, dateIndexes);
    const sortedColumns = sortCopy(
      [...columns.keys()],
      (left, right) => left - right
    );

    for (const [startColumn, endColumn] of buildContiguousColumnRuns(
      sortedColumns
    )) {
      candidates.push(
        buildSpanCandidate(group, columns, startColumn, endColumn)
      );
    }
  }

  return candidates;
};

const assignAllDaySpanLanes = <T extends GridEvent>(
  candidates: readonly SpanCandidateInput<T>[]
): readonly AllDaySpan<T>[] => {
  const candidatesWithLanes = candidates.map((candidate) => ({
    ...candidate,
    lane: 0,
  }));

  const sortedCandidates = sortCopy(candidatesWithLanes, (left, right) => {
    if (left.startColumn !== right.startColumn) {
      return left.startColumn - right.startColumn;
    }

    if (left.endColumn !== right.endColumn) {
      return right.endColumn - left.endColumn;
    }

    return (
      Number(left.event.id > right.event.id) -
      Number(left.event.id < right.event.id)
    );
  });

  const laneEnds: number[] = [];

  for (const candidate of sortedCandidates) {
    const availableLane = laneEnds.findIndex(
      (endColumn) => endColumn <= candidate.startColumn
    );

    const lane = availableLane === -1 ? laneEnds.length : availableLane;
    laneEnds[lane] = candidate.endColumn;
    candidate.lane = lane;
  }

  return candidatesWithLanes.map((candidate) => ({
    continuesAfter: candidate.continuesAfter,
    continuesBefore: candidate.continuesBefore,
    endColumn: candidate.endColumn,
    event: candidate.event,
    key: candidate.key,
    lane: candidate.lane,
    startColumn: candidate.startColumn,
  }));
};

interface MonthDisplay {
  readonly firstDisplayDate: CalendarDate;
  readonly monthEndExclusive: CalendarDate;
  readonly monthStart: CalendarDate;
  readonly rowCount: number;
  readonly dateIndexes: ReadonlyMap<CalendarDate, number>;
}

const buildMonthDisplay = (
  monthDate: CalendarDate,
  timeZone: IanaTimeZone
): MonthDisplay => {
  const monthRange = buildMonthRange(monthDate, timeZone);
  const firstDisplayDate = addCalendarDays(
    monthRange.start,
    -((weekdayIndex(monthRange.start) + 6) % 7)
  );
  const lastMonthDate = addCalendarDays(monthRange.endExclusive, -1);
  const lastDisplayDate = addCalendarDays(
    lastMonthDate,
    (7 - ((weekdayIndex(lastMonthDate) + 6) % 7) - 1) % 7
  );
  const rowCount =
    Math.floor(
      (Date.parse(`${lastDisplayDate}T00:00:00.000Z`) -
        Date.parse(`${firstDisplayDate}T00:00:00.000Z`)) /
        (DAYS_PER_WEEK * MILLISECONDS_PER_DAY)
    ) + 1;
  const dateIndexes = new Map<CalendarDate, number>();

  for (let index = 0; index < rowCount * DAYS_PER_WEEK; index += 1) {
    dateIndexes.set(addCalendarDays(firstDisplayDate, index), index);
  }

  return {
    dateIndexes,
    firstDisplayDate,
    monthEndExclusive: monthRange.endExclusive,
    monthStart: monthRange.start,
    rowCount,
  };
};

const bucketSegmentsIntoRows = <T extends GridEvent>(
  segments: readonly ViewerDateEventSegment<T>[],
  dateIndexes: ReadonlyMap<CalendarDate, number>,
  rowCount: number
): ViewerDateEventSegment<T>[][] => {
  const segmentsByRow: ViewerDateEventSegment<T>[][] = Array.from(
    { length: rowCount },
    () => []
  );

  for (const segment of segments) {
    const displayIndex = dateIndexes.get(segment.date);

    if (displayIndex !== undefined) {
      segmentsByRow[Math.floor(displayIndex / DAYS_PER_WEEK)]?.push(segment);
    }
  }

  return segmentsByRow;
};

const buildMonthWeekRows = <T extends GridEvent>(
  segmentsByRow: readonly (readonly ViewerDateEventSegment<T>[])[],
  firstDisplayDate: CalendarDate,
  rowCount: number,
  dateIndexes: ReadonlyMap<CalendarDate, number>
): MonthWeekRow<T>[] =>
  Array.from({ length: rowCount }, (_row, rowIndex) => {
    const weekStart = addCalendarDays(
      firstDisplayDate,
      rowIndex * DAYS_PER_WEEK
    );
    const dates = Array.from(
      { length: DAYS_PER_WEEK },
      (_column, columnIndex) => addCalendarDays(weekStart, columnIndex)
    );

    return {
      dates,
      fragments: buildMonthWeekFragments(
        segmentsByRow[rowIndex] ?? [],
        dateIndexes,
        rowIndex,
        segmentsByRow[rowIndex - 1] ?? [],
        segmentsByRow[rowIndex + 1] ?? []
      ),
      key: `month-week:${weekStart}`,
      rowIndex,
      weekNumber: isoWeekNumber(weekStart),
      weekStart,
    };
  });

export const calculateDayColumnGeometry = ({
  viewerDate,
  timeZone,
  start,
  end,
}: DayColumnGeometryInput): DayColumnGeometry => {
  // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-derive
  if (compareUtcInstants(start, end) >= 0) {
    throw new RangeError(
      `Clipped range end must be after start: ${start} -> ${end}`
    );
  }

  const dayRange = toViewerDayUtcRange(viewerDate, timeZone);
  const dayStartEpoch = Date.parse(dayRange.start);
  const dayEndEpoch = Date.parse(dayRange.end);
  const duration = dayEndEpoch - dayStartEpoch;

  return {
    dayEndEpoch,
    dayStartEpoch,
    duration,
    endPercentOfDay: percentOfDay(Date.parse(end), dayStartEpoch, duration),
    startPercentOfDay: percentOfDay(Date.parse(start), dayStartEpoch, duration),
  };
  // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-derive
};

export const segmentEventsAcrossViewerDates = <T extends GridEvent>(
  events: readonly T[],
  viewerDates: readonly CalendarDate[],
  timeZone: IanaTimeZone
): readonly ViewerDateEventSegment<T>[] => {
  // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-derive
  const segments: ViewerDateEventSegment<T>[] = [];

  for (const event of events) {
    if (compareUtcInstants(event.start, event.end) >= 0) {
      continue;
    }

    const eventStartDate = toViewerDateTime(event.start, timeZone).date;
    const eventEndProbe = utcInstant(new Date(Date.parse(event.end) - 1));
    const eventEndDate = toViewerDateTime(eventEndProbe, timeZone).date;

    for (const date of viewerDates) {
      const dayRange = toViewerDayUtcRange(date, timeZone);

      if (
        compareUtcInstants(event.end, dayRange.start) <= 0 ||
        compareUtcInstants(event.start, dayRange.end) >= 0
      ) {
        continue;
      }

      const start =
        compareUtcInstants(event.start, dayRange.start) > 0
          ? event.start
          : dayRange.start;

      const end =
        compareUtcInstants(event.end, dayRange.end) < 0
          ? event.end
          : dayRange.end;

      const segment =
        eventStartDate === eventEndDate
          ? null
          : resolveDaySegment(date === eventStartDate, date === eventEndDate);

      segments.push({
        date,
        end,
        event,
        key: `${event.id}:${date}`,
        segment,
        start,
      });
    }
  }

  return segments;
  // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-derive
};

export const segmentAllDayEventAcrossViewerDates = <
  T extends AllDayDateInterval,
>(
  event: T,
  viewerDates: readonly CalendarDate[],
  timeZone: IanaTimeZone
): readonly ViewerDateEventSegment<GridEvent & { readonly source: T }>[] => {
  // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-derive
  const startDate = calendarDate(event.startDate);
  const endDate = calendarDate(event.endDate);

  if (endDate <= startDate) {
    return [];
  }

  const segments: ViewerDateEventSegment<GridEvent & { readonly source: T }>[] =
    [];

  for (const date of viewerDates) {
    if (endDate <= date || startDate > date) {
      continue;
    }

    const dayRange = toViewerDayUtcRange(date, timeZone);
    const isFirstDay = startDate === date;
    const isLastDay = addCalendarDays(date, 1) === endDate;

    const segmentEvent = {
      end: dayRange.end,
      id: event.id,
      source: event,
      start: dayRange.start,
    };

    segments.push({
      date,
      end: dayRange.end,
      event: segmentEvent,
      key: `${segmentEvent.id}:${date}`,
      segment: resolveDaySegment(isFirstDay, isLastDay),
      start: dayRange.start,
    });
  }

  return segments;
  // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-derive
};

export const allocateAllDaySpans = <T extends GridEvent>(
  segments: readonly ViewerDateEventSegment<T>[],
  viewerDates: readonly CalendarDate[]
): readonly AllDaySpan<T>[] => {
  // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-derive
  const dateIndexes = new Map(viewerDates.map((date, index) => [date, index]));
  const candidates = buildAllDaySpanCandidates(segments, dateIndexes);

  return assignAllDaySpanLanes(candidates);
  // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-derive
};

export const bucketSegmentsByMonthWeekRow = <T extends GridEvent>(
  segments: readonly ViewerDateEventSegment<T>[],
  monthDate: CalendarDate,
  timeZone: IanaTimeZone
): MonthWeekBuckets<T> => {
  const display = buildMonthDisplay(monthDate, timeZone);
  const segmentsByRow = bucketSegmentsIntoRows(
    segments,
    display.dateIndexes,
    display.rowCount
  );

  return {
    monthEndExclusive: display.monthEndExclusive,
    monthStart: display.monthStart,
    rows: buildMonthWeekRows(
      segmentsByRow,
      display.firstDisplayDate,
      display.rowCount,
      display.dateIndexes
    ),
  };
};

export const calculateMonthCellCapacity = ({
  cellHeight,
  eventCount,
}: MonthCellCapacityInput): MonthCellCapacity => {
  if (!Number.isFinite(cellHeight) || cellHeight <= 0) {
    throw new RangeError(
      `Cell height must be positive and finite: ${cellHeight}`
    );
  }

  if (!Number.isInteger(eventCount) || eventCount < 0) {
    throw new RangeError(
      `Event count must be a non-negative integer: ${eventCount}`
    );
  }

  const availableHeight =
    cellHeight -
    MONTH_CELL_BOX_MODEL.padTop -
    MONTH_CELL_BOX_MODEL.dayChipHeight -
    MONTH_CELL_BOX_MODEL.gapAfterDayChip -
    MONTH_CELL_BOX_MODEL.padBottom;

  const capacity = Math.max(
    0,
    Math.floor(
      availableHeight /
        (MONTH_CELL_BOX_MODEL.chipHeight + MONTH_CELL_BOX_MODEL.chipGap)
    )
  );

  const visibleCount =
    eventCount <= capacity ? eventCount : Math.max(capacity - 1, 0);

  return {
    capacity,
    hiddenCount: eventCount - visibleCount,
    visibleCount,
  };
};

export { layoutTimedEvents } from "./layout";

export type { TimedEventGeometry, TimedLayoutInput } from "./layout";
