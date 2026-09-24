import { sortCopy } from "../../core/array";
import { formatGridTime } from "../../core/format";
import { dateTimeFormatter } from "../../core/intl-cache";
import type {
  CalendarDate,
  CalendarEvent,
  IanaTimeZone,
  UtcInstant,
} from "../../core/model";
import {
  addCalendarDays,
  compareUtcInstants,
  fromViewerDateTime,
  splitUtcRangeByViewerDay,
  toViewerDateTime,
} from "../../core/temporal";
import type { CalendarTranslate } from "../../i18n/calendar-localization";
import { getRelativeDayLabel } from "../agenda-view/agenda-format";

const DIACRITIC_MARKS = /[\u0300-\u036F]/gu;

export const MIN_QUERY_LENGTH = 2;

export interface SearchResultRow {
  readonly key: string;
  readonly event: CalendarEvent;
  readonly date: CalendarDate;
  readonly start: UtcInstant | null;
  readonly end: UtcInstant | null;
  readonly focusIndex: number;
}

export interface SearchResultGroup {
  readonly date: CalendarDate;
  readonly dayStart: UtcInstant;
  readonly rows: readonly SearchResultRow[];
}

const addRow = (
  rowsByDate: Map<CalendarDate, SearchResultRow[]>,
  date: CalendarDate,
  row: Omit<SearchResultRow, "focusIndex">
): void => {
  const existing = rowsByDate.get(date);

  const entry = { ...row, focusIndex: -1 };

  if (existing !== undefined) {
    existing.push(entry);

    return;
  }

  rowsByDate.set(date, [entry]);
};

const addAllDayRows = (
  rowsByDate: Map<CalendarDate, SearchResultRow[]>,
  event: Extract<CalendarEvent, { readonly allDay: true }>
): void => {
  let date = event.startDate;

  while (date < event.endDate) {
    addRow(rowsByDate, date, {
      date,
      end: null,
      event,
      key: `${event.id}:${date}`,
      start: null,
    });
    date = addCalendarDays(date, 1);
  }
};

const compareRows = (left: SearchResultRow, right: SearchResultRow): number => {
  if (left.start === null && right.start !== null) {
    return -1;
  }

  if (left.start !== null && right.start === null) {
    return 1;
  }

  if (left.start !== null && right.start !== null) {
    const startOrder = compareUtcInstants(left.start, right.start);

    if (startOrder !== 0) {
      return startOrder;
    }
  }

  return left.event.title.localeCompare(right.event.title);
};

const buildGroups = (
  rowsByDate: ReadonlyMap<CalendarDate, SearchResultRow[]>,
  timeZone: IanaTimeZone
): readonly SearchResultGroup[] => {
  const dates = sortCopy([...rowsByDate.keys()]);

  const groups: SearchResultGroup[] = [];

  let focusIndex = 0;

  for (const date of dates) {
    const rows = rowsByDate.get(date);

    if (rows === undefined) {
      continue;
    }

    const sortedRows = rows.toSorted(compareRows);

    const indexedRows: SearchResultRow[] = [];

    for (const row of sortedRows) {
      indexedRows.push({ ...row, focusIndex });
      focusIndex += 1;
    }

    groups.push({
      date,
      dayStart: fromViewerDateTime({ date, time: "00:00", timeZone }),
      rows: indexedRows,
    });
  }

  return groups;
};

const foldDiacritics = (value: string): string =>
  value.normalize("NFD").replaceAll(DIACRITIC_MARKS, "");

const findPart = (
  parts: readonly Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string => parts.find((part) => part.type === type)?.value ?? "";

export const normalizeQuery = (query: string): string =>
  foldDiacritics(query.trim().toLowerCase());

export const eventMatches = (event: CalendarEvent, needle: string): boolean => {
  const normalizedNeedle = normalizeQuery(needle);

  const fields = [event.title, event.organizer, event.location];

  for (const field of fields) {
    const resolvedField = field ?? undefined;

    if (
      resolvedField !== undefined &&
      normalizeQuery(resolvedField).includes(normalizedNeedle)
    ) {
      return true;
    }
  }

  return false;
};

export const buildSearchGroups = (
  events: readonly CalendarEvent[],
  query: string,
  timeZone: IanaTimeZone
): readonly SearchResultGroup[] => {
  const needle = normalizeQuery(query);

  if (needle.length < MIN_QUERY_LENGTH) {
    return [];
  }

  const rowsByDate = new Map<CalendarDate, SearchResultRow[]>();

  for (const event of events) {
    if (!eventMatches(event, needle)) {
      continue;
    }

    if (event.allDay) {
      addAllDayRows(rowsByDate, event);

      continue;
    }

    for (const segment of splitUtcRangeByViewerDay(
      event.start,
      event.end,
      timeZone
    )) {
      addRow(rowsByDate, segment.date, {
        date: segment.date,
        end: segment.end,
        event,
        key: `${event.id}:${segment.date}`,
        start: segment.start,
      });
    }
  }

  return buildGroups(rowsByDate, timeZone);
};

export const formatSearchDayHeader = (
  date: CalendarDate,
  dayStart: UtcInstant,
  todayDate: CalendarDate,
  timeZone: IanaTimeZone,
  locale: string,
  t: CalendarTranslate
): string => {
  const relative = getRelativeDayLabel(date, todayDate, t);

  if (relative !== null) {
    return relative;
  }

  const parts = dateTimeFormatter(locale, {
    day: "numeric",
    month: "short",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(dayStart));

  const month = findPart(parts, "month");
  const day = findPart(parts, "day");
  const year = findPart(parts, "year");

  return `${month} ${day}, ${year}`;
};

export const formatSearchResultDetails = (
  row: SearchResultRow,
  timeZone: IanaTimeZone,
  locale: string,
  t: CalendarTranslate
): string => {
  const details: string[] = [];

  if (row.start === null || row.end === null) {
    details.push(t("calendar.agenda.allDay"));
  } else {
    const start = formatGridTime(row.start, timeZone, locale);
    const end = formatGridTime(row.end, timeZone, locale);

    details.push(`${start} – ${end}`);
  }

  const organizer = row.event.organizer ?? undefined;

  if (organizer !== undefined) {
    details.push(organizer);
  }

  const location = row.event.location ?? undefined;

  if (location !== undefined) {
    details.push(location);
  }

  return details.join(" · ");
};

export const countRows = (groups: readonly SearchResultGroup[]): number => {
  let count = 0;

  for (const group of groups) {
    count += group.rows.length;
  }

  return count;
};

export const formatSearchCount = (
  count: number,
  t: CalendarTranslate
): string => t("calendar.panel.searchCount", { count });

const rowIndexCache = new WeakMap<
  readonly SearchResultGroup[],
  ReadonlyMap<number, SearchResultRow>
>();

export const rowAt = (
  groups: readonly SearchResultGroup[],
  focusIndex: number
): SearchResultRow | undefined => {
  let rowByFocusIndex = rowIndexCache.get(groups);

  if (rowByFocusIndex === undefined) {
    const index = new Map<number, SearchResultRow>();

    for (const group of groups) {
      for (const row of group.rows) {
        index.set(row.focusIndex, row);
      }
    }

    rowByFocusIndex = index;
    rowIndexCache.set(groups, rowByFocusIndex);
  }

  return rowByFocusIndex.get(focusIndex);
};

export const viewerToday = (
  currentInstant: UtcInstant,
  timeZone: IanaTimeZone
): CalendarDate => toViewerDateTime(currentInstant, timeZone).date;
