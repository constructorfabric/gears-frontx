// @cpt-flow:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1
import { arrayAt, sortCopy } from "./array";
import type {
  CalendarDate,
  CalendarDateRange,
  CalendarSlotMinutes,
  CalendarTimeWindow,
  IanaTimeZone,
  LocalTime,
  LocalDateTimeInput,
  LocalDateTimeParts,
  LocalTimeDisambiguation,
  UtcInstant,
  UtcRange,
  ViewerDateRange,
  ViewerDateTime,
  ViewerDaySegment,
  Weekday,
  ZonedDateParts,
} from "./model";
import { MINUTES_PER_DAY } from "./time-input";
import {
  calendarDate,
  datePartsInZone,
  invalidTemporalValue,
  LOCAL_TIME_DISAMBIGUATION,
  localDateTimeParts,
  padTwo,
  parseIanaTimeZone,
  parseLocalTime,
  resolveDaySegment,
  utcInstant,
  WEEKDAY,
} from "./validation";

const MINUTE_IN_MILLISECONDS = 60_000;
const HOUR_IN_MILLISECONDS = 60 * MINUTE_IN_MILLISECONDS;
const OFFSET_SAMPLE_SPAN_HOURS = 72;

export const AGENDA_WINDOW_DAYS = 30;

const SHORT_MONTHS: ReadonlySet<number> = new Set([4, 6, 9, 11]);

const WEEKDAY_INDEXES: Readonly<Record<Weekday, number>> = {
  [WEEKDAY.sunday]: 0,
  [WEEKDAY.monday]: 1,
  [WEEKDAY.tuesday]: 2,
  [WEEKDAY.wednesday]: 3,
  [WEEKDAY.thursday]: 4,
  [WEEKDAY.friday]: 5,
  [WEEKDAY.saturday]: 6,
};

const timestampFromParts = (
  parts: LocalDateTimeParts | ZonedDateParts
): number => {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(
    parts.hour,
    parts.minute,
    parts.second,
    "millisecond" in parts ? parts.millisecond : 0
  );

  return date.getTime();
};

const offsetMinutesAt = (timestamp: number, timeZone: IanaTimeZone): number => {
  const parts = datePartsInZone(timestamp, timeZone);
  const displayedAsUtc = timestampFromParts(parts);
  const offset = (displayedAsUtc - timestamp) / MINUTE_IN_MILLISECONDS;

  return Math.round(offset);
};

const resolveGapTimestamp = (
  wallClockTimestamp: number,
  timeZone: IanaTimeZone,
  parts: LocalDateTimeParts,
  disambiguation: LocalTimeDisambiguation
): number => {
  const beforeOffset = offsetMinutesAt(
    wallClockTimestamp - OFFSET_SAMPLE_SPAN_HOURS * HOUR_IN_MILLISECONDS,
    timeZone
  );

  const afterOffset = offsetMinutesAt(
    wallClockTimestamp + OFFSET_SAMPLE_SPAN_HOURS * HOUR_IN_MILLISECONDS,
    timeZone
  );

  if (
    afterOffset > beforeOffset &&
    disambiguation === LOCAL_TIME_DISAMBIGUATION.earlier
  ) {
    return wallClockTimestamp - afterOffset * MINUTE_IN_MILLISECONDS;
  }

  if (afterOffset > beforeOffset) {
    return wallClockTimestamp - beforeOffset * MINUTE_IN_MILLISECONDS;
  }

  return timestampFromParts(parts) - beforeOffset * MINUTE_IN_MILLISECONDS;
};

const instantFromTimestamp = (timestamp: number): UtcInstant => {
  const date = new Date(timestamp);

  if (!Number.isFinite(date.getTime())) {
    throw invalidTemporalValue(`Invalid UTC timestamp: ${timestamp}`);
  }

  return utcInstant(date);
};

const sameLocalSecond = (
  left: ZonedDateParts,
  right: LocalDateTimeParts
): boolean =>
  left.year === right.year &&
  left.month === right.month &&
  left.day === right.day &&
  left.hour === right.hour &&
  left.minute === right.minute &&
  left.second === right.second;

const matchingLocalTimestamps = (
  wallClockTimestamp: number,
  parts: LocalDateTimeParts,
  timeZone: IanaTimeZone
): number[] => {
  // A zone changes offset at most once in this span, so three samples cover every match.
  const span = OFFSET_SAMPLE_SPAN_HOURS * HOUR_IN_MILLISECONDS;
  const offsets = new Set([
    offsetMinutesAt(wallClockTimestamp - span, timeZone),
    offsetMinutesAt(wallClockTimestamp, timeZone),
    offsetMinutesAt(wallClockTimestamp + span, timeZone),
  ]);

  const matches: number[] = [];

  for (const offsetMinutes of offsets) {
    const timestamp =
      wallClockTimestamp - offsetMinutes * MINUTE_IN_MILLISECONDS;

    const actual = datePartsInZone(timestamp, timeZone);

    if (sameLocalSecond(actual, parts)) {
      matches.push(timestamp);
    }
  }

  return sortCopy(matches, (left, right) => left - right);
};

export const compareUtcInstants = (
  left: UtcInstant,
  right: UtcInstant
): -1 | 0 | 1 => {
  const leftEpoch = Date.parse(utcInstant(left));
  const rightEpoch = Date.parse(utcInstant(right));

  if (leftEpoch < rightEpoch) {
    return -1;
  }

  if (leftEpoch > rightEpoch) {
    return 1;
  }

  return 0;
};

const ensureRangeOrder = (start: UtcInstant, end: UtcInstant): void => {
  if (compareUtcInstants(start, end) >= 0) {
    throw invalidTemporalValue(
      `UTC range end must be after start: ${start} -> ${end}`
    );
  }
};

const assertDisambiguation = (value: LocalTimeDisambiguation): void => {
  if (
    value !== LOCAL_TIME_DISAMBIGUATION.compatible &&
    value !== LOCAL_TIME_DISAMBIGUATION.earlier &&
    value !== LOCAL_TIME_DISAMBIGUATION.later &&
    value !== LOCAL_TIME_DISAMBIGUATION.reject
  ) {
    throw invalidTemporalValue(
      `Invalid local-time disambiguation: ${String(value)}`
    );
  }
};

const daysInMonth = (year: number, monthIndex: number): number => {
  const month = monthIndex + 1;

  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }

  return SHORT_MONTHS.has(month) ? 30 : 31;
};

export const weekdayIndex = (date: CalendarDate): number => {
  const normalizedDate = calendarDate(date);

  return new Date(`${normalizedDate}T00:00:00.000Z`).getUTCDay();
};

const formatCalendarDate = (parts: ZonedDateParts): string =>
  `${String(parts.year).padStart(4, "0")}-${padTwo(parts.month)}-${padTwo(parts.day)}`;

export const toViewerDateTime = (
  instant: UtcInstant,
  timeZone: IanaTimeZone
): ViewerDateTime => {
  const validInstant = utcInstant(instant);
  const validTimeZone = parseIanaTimeZone(timeZone);
  const parts = datePartsInZone(Date.parse(validInstant), validTimeZone);
  const date = calendarDate(formatCalendarDate(parts));
  const time = parseLocalTime(`${padTwo(parts.hour)}:${padTwo(parts.minute)}`);

  return {
    date,
    offsetMinutes: offsetMinutesAt(Date.parse(validInstant), validTimeZone),
    source: validInstant,
    time,
    timeZone: validTimeZone,
  };
};

export const fromViewerDateTime = (input: LocalDateTimeInput): UtcInstant => {
  const validDate = calendarDate(input.date);
  const validTime = parseLocalTime(String(input.time));
  const validTimeZone = parseIanaTimeZone(input.timeZone);

  const parts = localDateTimeParts({
    date: validDate,
    time: validTime,
    timeZone: validTimeZone,
  });

  const wallClockTimestamp = timestampFromParts(parts);

  const matches = matchingLocalTimestamps(
    wallClockTimestamp,
    parts,
    validTimeZone
  );

  const disambiguation =
    input.disambiguation ?? LOCAL_TIME_DISAMBIGUATION.compatible;

  assertDisambiguation(disambiguation);

  if (matches.length === 0) {
    if (disambiguation === LOCAL_TIME_DISAMBIGUATION.reject) {
      throw invalidTemporalValue(
        `Local date-time does not exist in ${validTimeZone}: ${validDate}T${validTime}`
      );
    }

    return instantFromTimestamp(
      resolveGapTimestamp(
        wallClockTimestamp,
        validTimeZone,
        parts,
        disambiguation
      )
    );
  }

  if (
    disambiguation === LOCAL_TIME_DISAMBIGUATION.reject &&
    matches.length > 1
  ) {
    throw invalidTemporalValue(
      `Local date-time is ambiguous in ${validTimeZone}: ${validDate}T${validTime}`
    );
  }

  if (
    matches.length === 1 ||
    disambiguation === LOCAL_TIME_DISAMBIGUATION.compatible ||
    disambiguation === LOCAL_TIME_DISAMBIGUATION.earlier
  ) {
    const earlier = arrayAt(matches, 0);

    if (earlier === undefined) {
      throw invalidTemporalValue("No matching local timestamp");
    }

    return instantFromTimestamp(earlier);
  }

  const later = arrayAt(matches, -1);

  if (later === undefined) {
    throw invalidTemporalValue("No matching local timestamp");
  }

  return instantFromTimestamp(later);
};

export const addCalendarDays = (
  date: CalendarDate,
  amount: number
): CalendarDate => {
  if (!Number.isInteger(amount)) {
    throw invalidTemporalValue(
      `Calendar-day amount must be an integer: ${amount}`
    );
  }

  const normalizedDate = calendarDate(date);
  const shiftedDate = new Date(`${normalizedDate}T00:00:00.000Z`);
  shiftedDate.setUTCDate(shiftedDate.getUTCDate() + amount);

  if (!Number.isFinite(shiftedDate.getTime())) {
    throw invalidTemporalValue(
      `Calendar-day amount is outside the supported range: ${amount}`
    );
  }

  return calendarDate(shiftedDate.toISOString().slice(0, 10));
};

export const addCalendarMonths = (
  date: CalendarDate,
  amount: number,
  anchorDay?: number
): CalendarDate => {
  if (!Number.isInteger(amount)) {
    throw invalidTemporalValue(
      `Calendar-month amount must be an integer: ${amount}`
    );
  }

  if (
    anchorDay !== undefined &&
    (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31)
  ) {
    throw invalidTemporalValue(
      `Calendar-month anchor day must be between 1 and 31: ${anchorDay}`
    );
  }

  const normalizedDate = calendarDate(date);
  const sourceYear = Number(normalizedDate.slice(0, 4));
  const sourceMonth = Number(normalizedDate.slice(5, 7)) - 1;
  const sourceDay = Number(normalizedDate.slice(8, 10));
  const monthIndex = sourceYear * 12 + sourceMonth + amount;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex - targetYear * 12;

  if (targetYear < 0 || targetYear > 9999) {
    throw invalidTemporalValue(
      `Calendar month is outside the supported range: ${amount}`
    );
  }

  const targetDay = Math.min(
    anchorDay ?? sourceDay,
    daysInMonth(targetYear, targetMonth)
  );

  const target = `${String(targetYear).padStart(4, "0")}-${padTwo(targetMonth + 1)}-${padTwo(targetDay)}`;

  return calendarDate(target);
};

export const buildDayRange = (
  date: CalendarDate,
  timeZone: IanaTimeZone
): ViewerDateRange => {
  const start = calendarDate(date);
  const zone = parseIanaTimeZone(timeZone);

  return { endExclusive: addCalendarDays(start, 1), start, timeZone: zone };
};

export const buildDayWindow = (
  start: CalendarDate,
  days: number,
  timeZone: IanaTimeZone
): ViewerDateRange => {
  if (!Number.isInteger(days) || days <= 0) {
    throw invalidTemporalValue(
      `Calendar-day range length must be a positive integer: ${days}`
    );
  }

  const windowStart = calendarDate(start);
  const zone = parseIanaTimeZone(timeZone);

  return {
    endExclusive: addCalendarDays(windowStart, days),
    start: windowStart,
    timeZone: zone,
  };
};

export const buildWeekRange = (
  date: CalendarDate,
  timeZone: IanaTimeZone,
  weekStartsOn: Weekday = WEEKDAY.monday
): ViewerDateRange => {
  const anchor = calendarDate(date);
  const zone = parseIanaTimeZone(timeZone);

  const daysSinceStart =
    (weekdayIndex(anchor) - WEEKDAY_INDEXES[weekStartsOn] + 7) % 7;

  const start = addCalendarDays(anchor, -daysSinceStart);

  return { endExclusive: addCalendarDays(start, 7), start, timeZone: zone };
};

export const buildMonthRange = (
  date: CalendarDate,
  timeZone: IanaTimeZone
): ViewerDateRange => {
  const anchor = calendarDate(date);
  const zone = parseIanaTimeZone(timeZone);
  const monthStart = calendarDate(`${anchor.slice(0, 7)}-01`);

  return {
    endExclusive: addCalendarMonths(monthStart, 1),
    start: monthStart,
    timeZone: zone,
  };
};

export const toUtcRange = (range: ViewerDateRange): UtcRange => {
  const zone = parseIanaTimeZone(range.timeZone);

  const start = fromViewerDateTime({
    date: calendarDate(range.start),
    disambiguation: LOCAL_TIME_DISAMBIGUATION.compatible,
    time: "00:00",
    timeZone: zone,
  });

  const end = fromViewerDateTime({
    date: calendarDate(range.endExclusive),
    disambiguation: LOCAL_TIME_DISAMBIGUATION.compatible,
    time: "00:00",
    timeZone: zone,
  });

  if (compareUtcInstants(start, end) >= 0) {
    throw invalidTemporalValue(
      `Viewer range end must be after start: ${range.start} -> ${range.endExclusive}`
    );
  }

  return { end, start };
};

export const DEFAULT_SLOT_MINUTES: CalendarSlotMinutes = 60;

export const FULL_DAY_TIME_WINDOW: CalendarTimeWindow = {
  end: parseLocalTime("00:00"),
  start: parseLocalTime("00:00"),
};

export const DEFAULT_WORKING_HOURS: CalendarTimeWindow = {
  end: parseLocalTime("18:00"),
  start: parseLocalTime("08:00"),
};

const minutesOfDay = (time: LocalTime): number =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

const windowEndMinutes = (window: CalendarTimeWindow): number => {
  const end = minutesOfDay(window.end);

  return end === 0 ? MINUTES_PER_DAY : end;
};

export const assertTimeWindow = (
  window: CalendarTimeWindow,
  slotMinutes: CalendarSlotMinutes
): void => {
  const start = minutesOfDay(window.start);
  const end = windowEndMinutes(window);

  if (start >= end) {
    throw invalidTemporalValue(
      `Time window must end after it starts: ${window.start} -> ${window.end}`
    );
  }

  if (start % slotMinutes !== 0 || end % slotMinutes !== 0) {
    throw invalidTemporalValue(
      `Time window ${window.start} -> ${window.end} is not aligned to ${slotMinutes}-minute slots`
    );
  }
};

export const countWindowSlots = (
  window: CalendarTimeWindow,
  slotMinutes: CalendarSlotMinutes
): number =>
  (windowEndMinutes(window) - minutesOfDay(window.start)) / slotMinutes;

export const isWithinTimeWindow = (
  time: LocalTime,
  window: CalendarTimeWindow
): boolean => {
  const minutes = minutesOfDay(time);

  return (
    minutes >= minutesOfDay(window.start) && minutes < windowEndMinutes(window)
  );
};

export const buildTimeWindowRange = (
  date: CalendarDate,
  timeZone: IanaTimeZone,
  window: CalendarTimeWindow
): UtcRange => {
  const endsAtMidnight = windowEndMinutes(window) === MINUTES_PER_DAY;

  const start = fromViewerDateTime({
    date,
    disambiguation: LOCAL_TIME_DISAMBIGUATION.compatible,
    time: window.start,
    timeZone,
  });

  const end = fromViewerDateTime({
    date: endsAtMidnight ? addCalendarDays(date, 1) : date,
    disambiguation: LOCAL_TIME_DISAMBIGUATION.compatible,
    time: window.end,
    timeZone,
  });

  return { end, start };
};

// Elapsed-time slots: a DST day has one slot fewer or more.
export const buildSlotStarts = (
  range: UtcRange,
  slotMinutes: CalendarSlotMinutes
): UtcInstant[] => {
  const startEpoch = Date.parse(utcInstant(range.start));
  const endEpoch = Date.parse(utcInstant(range.end));

  if (endEpoch <= startEpoch) {
    throw invalidTemporalValue("UTC range must end after it starts");
  }

  const slotMilliseconds = slotMinutes * MINUTE_IN_MILLISECONDS;

  const starts: UtcInstant[] = [];

  for (let epoch = startEpoch; epoch < endEpoch; epoch += slotMilliseconds) {
    starts.push(instantFromTimestamp(epoch));
  }

  return starts;
};

export const orderDateRange = (
  first: CalendarDate,
  second: CalendarDate
): CalendarDateRange =>
  first <= second
    ? { end: second, start: first }
    : { end: first, start: second };

export const isDateInRange = (
  date: CalendarDate,
  range: CalendarDateRange | null
): boolean => range !== null && date >= range.start && date <= range.end;

export const splitUtcRangeByViewerDay = (
  start: UtcInstant,
  end: UtcInstant,
  timeZone: IanaTimeZone
): readonly ViewerDaySegment[] => {
  const validStart = utcInstant(start);
  const validEnd = utcInstant(end);
  const zone = parseIanaTimeZone(timeZone);

  ensureRangeOrder(validStart, validEnd);

  const startDate = toViewerDateTime(validStart, zone).date;
  const endProbe = instantFromTimestamp(Date.parse(validEnd) - 1);
  const endDate = toViewerDateTime(endProbe, zone).date;
  const crossesMidnight = startDate !== endDate;

  const segments: ViewerDaySegment[] = [];

  let cursor = validStart;
  let currentDate = startDate;

  while (compareUtcInstants(cursor, validEnd) < 0) {
    const nextDate = addCalendarDays(currentDate, 1);

    const nextBoundary = fromViewerDateTime({
      date: nextDate,
      disambiguation: LOCAL_TIME_DISAMBIGUATION.compatible,
      time: "00:00",
      timeZone: zone,
    });

    if (compareUtcInstants(nextBoundary, cursor) <= 0) {
      throw invalidTemporalValue(
        `Viewer day boundary did not advance for ${currentDate} in ${zone}`
      );
    }

    const segmentEnd =
      compareUtcInstants(nextBoundary, validEnd) < 0 ? nextBoundary : validEnd;

    const segment = crossesMidnight
      ? resolveDaySegment(currentDate === startDate, currentDate === endDate)
      : null;

    segments.push({
      date: currentDate,
      end: segmentEnd,
      segment,
      start: cursor,
    });
    cursor = segmentEnd;
    currentDate = nextDate;
  }

  return segments;
};

export type {
  CalendarDate,
  IanaTimeZone,
  LocalDateTimeInput,
  LocalDateTimeParts,
  LocalTime,
  LocalTimeDisambiguation,
  UtcInstant,
  UtcRange,
  ViewerDateRange,
  ViewerDateTime,
  ViewerDaySegment,
  Weekday,
  ZonedDateParts,
} from "./model";
