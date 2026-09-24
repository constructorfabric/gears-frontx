import { arrayAt } from "../../core/array";
import {
  allocateAllDaySpans,
  calculateMonthCellCapacity,
} from "../../core/grid";
import type {
  AllDaySpan,
  GridEvent,
  MonthWeekRow,
  ViewerDateEventSegment,
} from "../../core/grid";
import type {
  CalendarCell,
  CalendarDate,
  CalendarEvent,
  CalendarEventSegment,
  IanaTimeZone,
  ViewerDateRange,
} from "../../core/model";
import { buildDayRange, toUtcRange } from "../../core/temporal";
import { parseLocalTime, resolveDaySegment } from "../../core/validation";

type TimedCalendarEvent = Extract<CalendarEvent, { readonly allDay: false }>;
type AllDayCalendarEvent = Extract<CalendarEvent, { readonly allDay: true }>;
type AllDaySegmentEvent = GridEvent & { readonly source: AllDayCalendarEvent };

export type MonthRowSeed = MonthWeekRow;
export type MonthRange = ViewerDateRange;
export type TimedMonthSegment = ViewerDateEventSegment<TimedCalendarEvent>;
export type AllDayMonthSegment = ViewerDateEventSegment<AllDaySegmentEvent>;

export interface MonthGridAllDaySpan {
  readonly key: string;
  readonly event: CalendarEvent;
  readonly segment: CalendarEventSegment;
  readonly startColumn: number;
  readonly endColumn: number;
  readonly lane: number;
  readonly continuesBefore: boolean;
  readonly continuesAfter: boolean;
}

export interface MonthGridCell {
  readonly cell: CalendarCell;
  readonly date: CalendarDate;
  readonly isOutsideMonth: boolean;
  readonly eventCount: number;
  readonly capacity: number;
  readonly hiddenCount: number;
  readonly visibleTimedEvents: readonly TimedMonthSegment[];
  readonly allDayEventIds: readonly string[];
}

export interface MonthGridRow {
  readonly row: {
    readonly key: string;
    readonly rowIndex: number;
    readonly weekStart: CalendarDate;
    readonly weekNumber: number;
    readonly dates: readonly CalendarDate[];
  };
  readonly cells: readonly MonthGridCell[];
  readonly allDaySpans: readonly MonthGridAllDaySpan[];
}

export interface MonthGridViewModelInput {
  readonly monthRows: readonly MonthRowSeed[];
  readonly monthRange: MonthRange;
  readonly timedSegments: readonly TimedMonthSegment[];
  readonly allDaySegments: readonly AllDayMonthSegment[];
  readonly cellHeight: number;
  readonly densityCap: number | undefined;
  readonly overflowByDate: Readonly<Record<string, number>>;
  readonly timeZone: IanaTimeZone;
}

export type MonthGridViewModelOutput = readonly MonthGridRow[];

const uniqueTimedSegments = (
  segments: readonly TimedMonthSegment[]
): readonly TimedMonthSegment[] => {
  const seen = new Set<string>();

  const unique: TimedMonthSegment[] = [];

  for (const segment of segments) {
    if (seen.has(segment.event.id)) {
      continue;
    }

    seen.add(segment.event.id);
    unique.push(segment);
  }

  return unique;
};

const eventIdsForDate = (
  timedEvents: readonly TimedMonthSegment[],
  allDaySpans: readonly MonthGridAllDaySpan[],
  date: CalendarDate,
  columnIndex: number
): readonly string[] => {
  const ids = new Set<string>();

  for (const segment of timedEvents) {
    if (segment.date === date) {
      ids.add(segment.event.id);
    }
  }

  for (const span of allDaySpans) {
    if (span.startColumn <= columnIndex && columnIndex < span.endColumn) {
      ids.add(span.event.id);
    }
  }

  return [...ids];
};

const allDaySpansForRow = (
  rowDates: readonly CalendarDate[],
  segments: readonly AllDayMonthSegment[],
  timeZone: IanaTimeZone
): readonly MonthGridAllDaySpan[] => {
  const spans = allocateAllDaySpans(segments, rowDates);

  return spans.flatMap((span: AllDaySpan<AllDaySegmentEvent>) => {
    const { source } = span.event;
    const date = arrayAt(rowDates, span.startColumn);

    if (date === undefined) {
      return [];
    }

    const range = toUtcRange(buildDayRange(date, timeZone));
    const segment = resolveDaySegment(
      !span.continuesBefore,
      !span.continuesAfter
    );

    return [
      {
        continuesAfter: span.continuesAfter,
        continuesBefore: span.continuesBefore,
        endColumn: span.endColumn,
        event: source,
        key: span.key,
        lane: span.lane,
        segment: {
          date,
          end: range.end,
          event: source,
          segment,
          start: range.start,
        },
        startColumn: span.startColumn,
      },
    ];
  });
};

interface MonthGridCellVisibility {
  readonly capacity: number;
  readonly visibleCount: number;
  readonly hiddenCount: number;
}

const indexAllDaySegmentsByRow = (
  monthRows: readonly MonthRowSeed[],
  allDaySegments: readonly AllDayMonthSegment[]
): AllDayMonthSegment[][] => {
  const rowIndexByDate = new Map<CalendarDate, number>();
  const allDaySegmentsByRow = monthRows.map(() => [] as AllDayMonthSegment[]);

  for (const [rowIndex, monthRow] of monthRows.entries()) {
    for (const date of monthRow.dates) {
      rowIndexByDate.set(date, rowIndex);
    }
  }

  for (const segment of allDaySegments) {
    const rowIndex = rowIndexByDate.get(segment.date) ?? -1;
    allDaySegmentsByRow[rowIndex]?.push(segment);
  }

  return allDaySegmentsByRow;
};

const visibleCountForCell = (
  cellHeight: number,
  eventCount: number,
  densityCap: number | undefined
): MonthGridCellVisibility => {
  const calculated = calculateMonthCellCapacity({ cellHeight, eventCount });

  const boundedDensityCap = Number.isFinite(densityCap)
    ? Math.floor(Math.max(0, densityCap ?? 0))
    : undefined;

  const visibleCount =
    boundedDensityCap === undefined
      ? calculated.visibleCount
      : Math.min(calculated.visibleCount, boundedDensityCap);

  return {
    capacity: calculated.capacity,
    hiddenCount: eventCount - visibleCount,
    visibleCount,
  };
};

export const buildMonthGridRows = (
  input: MonthGridViewModelInput
): MonthGridViewModelOutput => {
  const rowsWithCells: MonthGridRow[] = [];

  const timedByDate = new Map<CalendarDate, TimedMonthSegment[]>();

  for (const segment of input.timedSegments) {
    const current = timedByDate.get(segment.date);

    if (current) {
      current.push(segment);
    } else {
      timedByDate.set(segment.date, [segment]);
    }
  }

  const allDaySegmentsByRow = indexAllDaySegmentsByRow(
    input.monthRows,
    input.allDaySegments
  );

  for (const [rowIndex, monthRow] of input.monthRows.entries()) {
    const rowSegments = allDaySegmentsByRow[rowIndex] ?? [];
    const sourceSpans = allDaySpansForRow(
      monthRow.dates,
      rowSegments,
      input.timeZone
    );

    const candidates: {
      readonly cell: CalendarCell;
      readonly date: CalendarDate;
      readonly isOutsideMonth: boolean;
      readonly eventIds: readonly string[];
      readonly timedEvents: readonly TimedMonthSegment[];
      readonly allDaySpans: readonly MonthGridAllDaySpan[];
    }[] = [];

    for (const [columnIndex, date] of monthRow.dates.entries()) {
      const range = toUtcRange(buildDayRange(date, input.timeZone));

      const cell: CalendarCell = {
        date,
        end: range.end,
        endTime: parseLocalTime(range.end.slice(11, 16)),
        start: range.start,
        startTime: parseLocalTime(range.start.slice(11, 16)),
      };

      const timedForDate = uniqueTimedSegments(timedByDate.get(date) ?? []);
      const allDayForDate = sourceSpans.filter(
        (span) =>
          span.startColumn <= columnIndex && columnIndex < span.endColumn
      );

      candidates.push({
        allDaySpans: allDayForDate,
        cell,
        date,
        eventIds: eventIdsForDate(timedForDate, sourceSpans, date, columnIndex),
        isOutsideMonth:
          date < input.monthRange.start ||
          date >= input.monthRange.endExclusive,
        timedEvents: timedForDate,
      });
    }

    const visibleByDate = new Map<CalendarDate, Set<string>>();

    const cells: MonthGridCell[] = [];

    for (const candidate of candidates) {
      const eventCount = candidate.eventIds.length;
      const visibility = visibleCountForCell(
        input.cellHeight,
        eventCount,
        input.densityCap
      );
      const visibleIds = new Set<string>();

      for (const span of candidate.allDaySpans) {
        if (visibleIds.size >= visibility.visibleCount) {
          break;
        }

        const eventId = span.event.id;
        visibleIds.add(eventId);
      }

      for (const segment of candidate.timedEvents) {
        if (visibleIds.size >= visibility.visibleCount) {
          break;
        }

        visibleIds.add(segment.event.id);
      }

      visibleByDate.set(candidate.date, visibleIds);
      const hiddenFromApi = input.overflowByDate[candidate.date];

      const normalizedHiddenFromApi = Number.isFinite(hiddenFromApi)
        ? Math.max(0, Math.floor(hiddenFromApi))
        : 0;

      const hiddenCount = Math.max(
        visibility.hiddenCount,
        normalizedHiddenFromApi
      );

      const allDayEventIds: string[] = [];

      const visibleTimedEvents: TimedMonthSegment[] = [];

      for (const span of candidate.allDaySpans) {
        const eventId = span.event.id;

        if (visibleIds.has(eventId)) {
          allDayEventIds.push(eventId);
        }
      }

      for (const segment of candidate.timedEvents) {
        if (visibleIds.has(segment.event.id)) {
          visibleTimedEvents.push(segment);
        }
      }

      cells.push({
        allDayEventIds,
        capacity: visibility.capacity,
        cell: candidate.cell,
        date: candidate.date,
        eventCount,
        hiddenCount,
        isOutsideMonth: candidate.isOutsideMonth,
        visibleTimedEvents,
      });
    }

    const allDaySpans = sourceSpans.filter((span) => {
      for (
        let columnIndex = span.startColumn;
        columnIndex < span.endColumn;
        columnIndex += 1
      ) {
        const date = arrayAt(monthRow.dates, columnIndex);

        if (
          date === undefined ||
          visibleByDate.get(date)?.has(span.event.id) !== true
        ) {
          return false;
        }
      }

      return true;
    });

    rowsWithCells.push({
      allDaySpans,
      cells,
      row: {
        dates: monthRow.dates,
        key: monthRow.key,
        rowIndex: monthRow.rowIndex,
        weekNumber: monthRow.weekNumber,
        weekStart: monthRow.weekStart,
      },
    });
  }

  return rowsWithCells;
};
