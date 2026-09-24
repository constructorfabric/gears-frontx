import { isEventActionable } from "../../core/actionability";
import { sortCopy } from "../../core/array";
import {
  segmentAllDayEventAcrossViewerDates,
  segmentEventsAcrossViewerDates,
} from "../../core/grid";
import type {
  CalendarDate,
  CalendarEvent,
  CalendarEventRenderContext,
  CalendarEventSegment,
  IanaTimeZone,
  UtcInstant,
  ViewerDaySegmentKind,
} from "../../core/model";
import {
  AGENDA_WINDOW_DAYS,
  addCalendarDays,
  buildDayWindow,
  compareUtcInstants,
  fromViewerDateTime,
  toViewerDateTime,
} from "../../core/temporal";
import { localTimeFromMinutes } from "../../core/time-input";

type TimedCalendarEvent = Extract<CalendarEvent, { readonly allDay: false }>;

type AllDayCalendarEvent = Extract<CalendarEvent, { readonly allDay: true }>;

export interface AgendaWindowRange {
  readonly start: CalendarDate;
  readonly endExclusive: CalendarDate;
}

interface AgendaNowLine {
  readonly hourRowIndex: number;
  readonly minutePercent: number;
}

interface AgendaAllDayRow {
  readonly kind: "allday";
  readonly key: string;
  readonly event: AllDayCalendarEvent;
  readonly date: CalendarDate;
  readonly start: null;
  readonly end: null;
  readonly segment: ViewerDaySegmentKind | null;
  readonly focusIndex: number;
  readonly past: boolean;
  readonly now: boolean;
}

interface AgendaTimedRow {
  readonly kind: "timed";
  readonly key: string;
  readonly event: TimedCalendarEvent;
  readonly date: CalendarDate;
  readonly start: UtcInstant;
  readonly end: UtcInstant;
  readonly segment: ViewerDaySegmentKind | null;
  readonly focusIndex: number;
  readonly past: boolean;
  readonly now: boolean;
}

export type AgendaEventRow = AgendaAllDayRow | AgendaTimedRow;

interface AgendaHourRow {
  readonly hourStart: UtcInstant | null;
  readonly events: readonly AgendaTimedRow[];
}

export interface AgendaDayGroup {
  readonly date: CalendarDate;
  readonly eventCount: number;
  readonly allDayEvents: readonly AgendaAllDayRow[];
  readonly hourRows: readonly AgendaHourRow[];
  readonly nowLine: AgendaNowLine | null;
}

interface AgendaModel {
  readonly windowRange: AgendaWindowRange;
  readonly dayGroups: readonly AgendaDayGroup[];
  readonly eventRows: readonly AgendaEventRow[];
  readonly hasEvents: boolean;
}

interface BuildAgendaModelInput {
  readonly date: CalendarDate;
  readonly timeZone: IanaTimeZone;
  readonly events: readonly CalendarEvent[];
  readonly now: UtcInstant;
}

interface AgendaRowFlags {
  readonly past: boolean;
  readonly now: boolean;
}

type RawAgendaRow =
  | {
      readonly kind: "timed";
      readonly event: TimedCalendarEvent;
      readonly date: CalendarDate;
      readonly start: UtcInstant;
      readonly end: UtcInstant;
      readonly segment: ViewerDaySegmentKind | null;
      readonly sortStart: UtcInstant;
    }
  | {
      readonly kind: "allday";
      readonly event: AllDayCalendarEvent;
      readonly date: CalendarDate;
      readonly start: null;
      readonly end: null;
      readonly segment: ViewerDaySegmentKind | null;
      readonly sortStart: UtcInstant;
    };

const compareRawRows = (left: RawAgendaRow, right: RawAgendaRow): number => {
  if (left.date !== right.date) {
    return left.date < right.date ? -1 : 1;
  }

  return compareUtcInstants(left.sortStart, right.sortStart);
};

const resolveRowFlags = (
  row: RawAgendaRow,
  now: UtcInstant,
  todayDate: CalendarDate
): AgendaRowFlags => {
  if (row.kind === "timed") {
    const past = compareUtcInstants(row.end, now) <= 0;
    const inProgress = !past && compareUtcInstants(row.start, now) <= 0;

    return { now: inProgress, past };
  }

  // All-day rows never carry a live now state: the current-time line is hour-based.
  return { now: false, past: row.date < todayDate };
};

const toEventRow = (
  row: RawAgendaRow,
  focusIndex: number,
  now: UtcInstant,
  todayDate: CalendarDate
): AgendaEventRow => {
  const key = `${row.event.id}:${row.date}:${row.segment ?? "single"}`;
  const flags = resolveRowFlags(row, now, todayDate);

  if (row.kind === "allday") {
    return {
      date: row.date,
      end: null,
      event: row.event,
      focusIndex,
      key,
      kind: "allday",
      segment: row.segment,
      start: null,
      ...flags,
    };
  }

  return {
    date: row.date,
    end: row.end,
    event: row.event,
    focusIndex,
    key,
    kind: "timed",
    segment: row.segment,
    start: row.start,
    ...flags,
  };
};

const toCalendarEventSegment = (row: AgendaEventRow): CalendarEventSegment => {
  if (row.kind === "timed") {
    return {
      date: row.date,
      end: row.end,
      event: row.event,
      segment: row.segment,
      start: row.start,
    };
  }

  const start = fromViewerDateTime({
    date: row.date,
    time: "00:00",
    timeZone: row.event.timeZone,
  });

  const end = fromViewerDateTime({
    date: addCalendarDays(row.date, 1),
    time: "00:00",
    timeZone: row.event.timeZone,
  });

  return { date: row.date, end, event: row.event, segment: row.segment, start };
};

const buildWindowDates = (start: CalendarDate): CalendarDate[] => {
  const dates: CalendarDate[] = [];

  for (let offset = 0; offset < AGENDA_WINDOW_DAYS; offset += 1) {
    dates.push(addCalendarDays(start, offset));
  }

  return dates;
};

const hourInstant = (
  date: CalendarDate,
  hour: number,
  timeZone: IanaTimeZone
): UtcInstant =>
  fromViewerDateTime({
    date,
    time: localTimeFromMinutes(hour * 60),
    timeZone,
  });

const localHour = (instant: UtcInstant, timeZone: IanaTimeZone): number =>
  Number(toViewerDateTime(instant, timeZone).time.slice(0, 2));

const buildHourRows = (
  windowDate: CalendarDate,
  timedRows: readonly AgendaTimedRow[],
  isToday: boolean,
  now: UtcInstant,
  timeZone: IanaTimeZone
): AgendaHourRow[] => {
  if (timedRows.length === 0) {
    if (isToday) {
      return [
        {
          events: [],
          hourStart: hourInstant(
            windowDate,
            localHour(now, timeZone),
            timeZone
          ),
        },
      ];
    }

    return [{ events: [], hourStart: null }];
  }

  let minStartHour = 24;
  let maxEndHour = -1;

  for (const row of timedRows) {
    minStartHour = Math.min(minStartHour, localHour(row.start, timeZone));
    maxEndHour = Math.max(maxEndHour, localHour(row.end, timeZone));
  }

  const rowsByHour = new Map<number, AgendaTimedRow[]>();
  const hours = new Set<number>();

  for (const row of timedRows) {
    const hour = localHour(row.start, timeZone);
    hours.add(hour);
    const rows = rowsByHour.get(hour);

    if (rows === undefined) {
      rowsByHour.set(hour, [row]);
    } else {
      rows.push(row);
    }
  }

  for (let hour = minStartHour; hour <= maxEndHour; hour += 1) {
    hours.add(hour);
  }

  if (isToday) {
    hours.add(localHour(now, timeZone));
  }

  const sortedHours = sortCopy([...hours], (left, right) => left - right);

  return sortedHours.map((hour) => ({
    events: sortCopy(rowsByHour.get(hour) ?? [], (left, right) =>
      compareUtcInstants(left.start, right.start)
    ),
    hourStart: hourInstant(windowDate, hour, timeZone),
  }));
};

const buildNowLine = (
  hourRows: readonly AgendaHourRow[],
  now: UtcInstant,
  timeZone: IanaTimeZone
): AgendaNowLine | null => {
  const currentHour = localHour(now, timeZone);

  const hourRowIndex = hourRows.findIndex(
    (row) =>
      row.hourStart !== null &&
      localHour(row.hourStart, timeZone) === currentHour
  );

  if (hourRowIndex === -1) {
    return null;
  }

  const minute = Number(toViewerDateTime(now, timeZone).time.slice(3, 5));

  return { hourRowIndex, minutePercent: (minute / 60) * 100 };
};

const collectRawRows = (
  events: readonly CalendarEvent[],
  windowDates: readonly CalendarDate[],
  timeZone: IanaTimeZone
): RawAgendaRow[] => {
  const rawRows: RawAgendaRow[] = [];

  for (const event of events) {
    if (event.allDay) {
      if (event.endDate <= event.startDate) {
        throw new RangeError(
          `All-day event must end after it starts: ${event.id}`
        );
      }

      for (const segment of segmentAllDayEventAcrossViewerDates(
        event,
        windowDates,
        timeZone
      )) {
        rawRows.push({
          date: segment.date,
          end: null,
          event: segment.event.source,
          kind: "allday",
          segment: segment.segment,
          sortStart: segment.start,
          start: null,
        });
      }
      continue;
    }

    if (compareUtcInstants(event.start, event.end) >= 0) {
      throw new RangeError(`Timed event must end after it starts: ${event.id}`);
    }

    for (const segment of segmentEventsAcrossViewerDates(
      [event],
      windowDates,
      timeZone
    )) {
      rawRows.push({
        date: segment.date,
        end: segment.end,
        event: segment.event,
        kind: "timed",
        segment: segment.segment,
        sortStart: segment.start,
        start: segment.start,
      });
    }
  }

  return rawRows;
};

const isAllDayRow = (row: AgendaEventRow): row is AgendaAllDayRow =>
  row.kind === "allday";

const buildDayGroup = (
  windowDate: CalendarDate,
  eventRows: readonly AgendaEventRow[],
  now: UtcInstant,
  todayDate: CalendarDate,
  timeZone: IanaTimeZone
): AgendaDayGroup => {
  const dayRows: AgendaEventRow[] = [];

  const allDayEvents: AgendaAllDayRow[] = [];

  const timedRows: AgendaTimedRow[] = [];

  for (const row of eventRows) {
    if (row.date !== windowDate) {
      continue;
    }

    dayRows.push(row);

    if (isAllDayRow(row)) {
      allDayEvents.push(row);
    } else {
      timedRows.push(row);
    }
  }

  const isToday = windowDate === todayDate;

  const hourRows = buildHourRows(windowDate, timedRows, isToday, now, timeZone);

  const nowLine = isToday ? buildNowLine(hourRows, now, timeZone) : null;

  return {
    allDayEvents,
    date: windowDate,
    eventCount: dayRows.length,
    hourRows,
    nowLine,
  };
};

export const buildAgendaModel = (input: BuildAgendaModelInput): AgendaModel => {
  const { date, timeZone, events, now } = input;

  const windowRange = buildDayWindow(date, AGENDA_WINDOW_DAYS, timeZone);
  const windowDates = buildWindowDates(windowRange.start);
  const todayDate = toViewerDateTime(now, timeZone).date;

  const rawRows = collectRawRows(events, windowDates, timeZone);
  const sortedRawRows = sortCopy(rawRows, compareRawRows);

  const eventRows = sortedRawRows.map((row, index) =>
    toEventRow(row, index, now, todayDate)
  );

  const dayGroups = windowDates.map((windowDate) =>
    buildDayGroup(windowDate, eventRows, now, todayDate, timeZone)
  );

  return {
    dayGroups,
    eventRows,
    hasEvents: eventRows.length > 0,
    windowRange,
  };
};

export const isRowAvailable = (row: AgendaEventRow): boolean =>
  isEventActionable(row.event);

export const buildAgendaRenderContext = (
  row: AgendaEventRow,
  isSelected: boolean
): CalendarEventRenderContext => ({
  conflicts: row.event.conflicts ?? [],
  event: row.event,
  isAvailable: isRowAvailable(row),
  isPast: row.past,
  isReadOnly: false,
  isSelected,
  segment: toCalendarEventSegment(row),
});
