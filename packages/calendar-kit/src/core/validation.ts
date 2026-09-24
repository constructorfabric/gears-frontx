import { dateTimeFormatter } from "./intl-cache";
import type {
  CalendarDate,
  IanaTimeZone,
  LocalDateTimeInput,
  LocalDateTimeParts,
  LocalTime,
  UtcInstant,
  ZonedDateParts,
} from "./model";

const UTC_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

const isUtcInstantValue = (value: string): value is UtcInstant =>
  UTC_INSTANT_PATTERN.test(value);

const CALENDAR_DATE_PATTERN =
  /^(?<group1>\d{4})-(?<group2>\d{2})-(?<group3>\d{2})$/u;
const LOCAL_TIME_PATTERN =
  /^(?<group1>\d{2}):(?<group2>\d{2})(?::(?<group3>\d{2})(?:\.(?<group4>\d{1,3}))?)?$/u;

const canonicalTimeZones = new Map<string, IanaTimeZone>();

const isIanaTimeZoneValue = (value: string): value is IanaTimeZone =>
  value.length > 0;

const DATE_PARTS_FORMAT_OPTIONS = {
  calendar: "gregory",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  numberingSystem: "latn",
  second: "2-digit",
  year: "numeric",
} as const;

export const WEEKDAY = {
  friday: "friday",
  monday: "monday",
  saturday: "saturday",
  sunday: "sunday",
  thursday: "thursday",
  tuesday: "tuesday",
  wednesday: "wednesday",
} as const;

export const LOCAL_TIME_DISAMBIGUATION = {
  compatible: "compatible",
  earlier: "earlier",
  later: "later",
  reject: "reject",
} as const;

export const VIEWER_DAY_SEGMENT = {
  end: "end",
  middle: "middle",
  start: "start",
} as const;

export const invalidTemporalValue = (message: string): RangeError =>
  new RangeError(message);

export const resolveDaySegment = (
  isFirst: boolean,
  isLast: boolean
): "start" | "middle" | "end" | null => {
  if (isFirst && isLast) {
    return null;
  }

  if (isFirst) {
    return VIEWER_DAY_SEGMENT.start;
  }

  if (isLast) {
    return VIEWER_DAY_SEGMENT.end;
  }

  return VIEWER_DAY_SEGMENT.middle;
};

const getDatePartsFormatter = (timeZone: IanaTimeZone): Intl.DateTimeFormat =>
  dateTimeFormatter("en-US", {
    timeZone: String(timeZone),
    ...DATE_PARTS_FORMAT_OPTIONS,
  });

const readInstantCandidate = (value: string | Date | number): string => {
  if (value instanceof Date) {
    const date = new Date(value);

    if (!Number.isFinite(date.getTime())) {
      throw invalidTemporalValue(`Invalid UTC instant: ${String(value)}`);
    }

    return date.toISOString();
  }

  if (Number.isFinite(value)) {
    const date = new Date(value);

    if (!Number.isFinite(date.getTime())) {
      throw invalidTemporalValue(`Invalid UTC instant: ${String(value)}`);
    }

    return date.toISOString();
  }

  return String(value);
};

const createUtcDate = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0
): Date => {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  date.setUTCHours(hour, minute, second, millisecond);

  return date;
};

const isCalendarDateValue = (value: string): value is CalendarDate => {
  const match = CALENDAR_DATE_PATTERN.exec(value);

  if (match === null) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = createUtcDate(year, month - 1, day);

  return (
    Number.isFinite(candidate.getTime()) &&
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
};

export const calendarDate = (value: string): CalendarDate => {
  if (!isCalendarDateValue(value)) {
    throw invalidTemporalValue(`Invalid calendar date: ${value}`);
  }
  return value;
};

const readCalendarDate = (value: string) => {
  const match = CALENDAR_DATE_PATTERN.exec(value);

  if (!match) {
    throw invalidTemporalValue(`Invalid calendar date: ${value}`);
  }

  const date = calendarDate(value);

  return {
    day: Number(date.slice(8, 10)),
    month: Number(date.slice(5, 7)),
    year: Number(date.slice(0, 4)),
  };
};

const readLocalTime = (value: string) => {
  const match = LOCAL_TIME_PATTERN.exec(value);

  if (!match) {
    throw invalidTemporalValue(`Invalid local time: ${value}`);
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  const fraction = match[4] ?? "";
  const millisecond = Number(fraction.padEnd(3, "0") || "0");

  if (hour > 23 || minute > 59 || second > 59 || millisecond > 999) {
    throw invalidTemporalValue(`Invalid local time: ${value}`);
  }

  return { hour, millisecond, minute, second };
};

export const padTwo = (value: number): string => String(value).padStart(2, "0");

export const utcInstant = (value: string | Date | number): UtcInstant => {
  const candidate = readInstantCandidate(value);

  if (!isUtcInstantValue(candidate)) {
    throw invalidTemporalValue(`Invalid UTC instant: ${candidate}`);
  }

  const parsed = new Date(candidate);

  if (!Number.isFinite(parsed.getTime())) {
    throw invalidTemporalValue(`Invalid UTC instant: ${candidate}`);
  }

  const canonical = parsed.toISOString();

  const expected =
    candidate.length === 20 ? candidate.replace("Z", ".000Z") : candidate;

  if (canonical !== expected || !isUtcInstantValue(canonical)) {
    throw invalidTemporalValue(`Invalid UTC instant: ${candidate}`);
  }

  return canonical;
};

const isLocalTimeValue = (value: string): value is LocalTime => {
  const match = LOCAL_TIME_PATTERN.exec(value);

  if (match === null) {
    return false;
  }
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
};

export const parseLocalTime = (value: string): LocalTime => {
  const parts = readLocalTime(value);
  const canonical = `${padTwo(parts.hour)}:${padTwo(parts.minute)}`;

  if (!isLocalTimeValue(canonical)) {
    throw invalidTemporalValue(`Invalid local time: ${value}`);
  }
  return canonical;
};

export const parseIanaTimeZone = (value: string): IanaTimeZone => {
  if (!value.trim()) {
    throw invalidTemporalValue("Invalid IANA time zone: empty value");
  }

  const cached = canonicalTimeZones.get(value);

  if (cached !== undefined) {
    return cached;
  }

  try {
    const canonical = Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).resolvedOptions().timeZone;

    if (!canonical) {
      throw invalidTemporalValue(`Invalid IANA time zone: ${value}`);
    }

    if (!isIanaTimeZoneValue(canonical)) {
      throw invalidTemporalValue(`Invalid IANA time zone: ${value}`);
    }

    canonicalTimeZones.set(value, canonical);
    canonicalTimeZones.set(canonical, canonical);

    return canonical;
  } catch (error) {
    if (
      error instanceof RangeError &&
      error.message.startsWith("Invalid IANA time zone")
    ) {
      throw error;
    }

    throw invalidTemporalValue(`Invalid IANA time zone: ${value}`);
  }
};

export const localDateTimeParts = (
  input: LocalDateTimeInput
): LocalDateTimeParts => {
  const dateParts = readCalendarDate(input.date);
  const timeParts = readLocalTime(String(input.time));

  const candidate = createUtcDate(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute,
    timeParts.second,
    timeParts.millisecond
  );

  if (
    !Number.isFinite(candidate.getTime()) ||
    candidate.getUTCFullYear() !== dateParts.year ||
    candidate.getUTCMonth() !== dateParts.month - 1 ||
    candidate.getUTCDate() !== dateParts.day ||
    candidate.getUTCHours() !== timeParts.hour ||
    candidate.getUTCMinutes() !== timeParts.minute ||
    candidate.getUTCSeconds() !== timeParts.second ||
    candidate.getUTCMilliseconds() !== timeParts.millisecond
  ) {
    throw invalidTemporalValue(
      `Invalid local date-time: ${input.date}T${input.time}`
    );
  }

  return {
    day: dateParts.day,
    hour: timeParts.hour,
    millisecond: timeParts.millisecond,
    minute: timeParts.minute,
    month: dateParts.month,
    second: timeParts.second,
    year: dateParts.year,
  };
};

export const datePartsInZone = (
  timestamp: number,
  timeZone: IanaTimeZone
): ZonedDateParts => {
  if (!Number.isFinite(timestamp)) {
    throw invalidTemporalValue(`Invalid timestamp: ${timestamp}`);
  }

  const formatter = getDatePartsFormatter(parseIanaTimeZone(timeZone));
  const parts = formatter.formatToParts(new Date(timestamp));

  const values = new Map<string, string>();

  for (const part of parts) {
    values.set(part.type, part.value);
  }

  const result = {
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    month: Number(values.get("month")),
    second: Number(values.get("second")),
    year: Number(values.get("year")),
  } satisfies ZonedDateParts;

  if (Object.values(result).some((value) => !Number.isFinite(value))) {
    throw invalidTemporalValue(`Unable to read timestamp in ${timeZone}`);
  }

  return result;
};
