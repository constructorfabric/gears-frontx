import {
  assertLocale,
  dateTimeFormatter,
  listFormatter,
  numberFormatter,
  relativeTimeFormatter,
  segmenter,
} from "./intl-cache";
import type {
  IanaTimeZone,
  UtcInstant,
  ViewerDateTimeFormatOptions,
} from "./model";
import { MINUTES_PER_DAY, MINUTES_PER_HOUR } from "./time-input";
import {
  parseIanaTimeZone,
  utcInstant,
  invalidTemporalValue,
} from "./validation";

const NARROW_NO_BREAK_SPACE = "\u202F";

const DEFAULT_VIEWER_DATE_TIME_OPTIONS = {
  dateStyle: "short",
  timeStyle: "short",
} as const;

const DEFAULT_VIEWER_DATE_OPTIONS = { dateStyle: "medium" } as const;

const DEFAULT_VIEWER_TIME_OPTIONS = { timeStyle: "short" } as const;

type DurationUnit = "day" | "hour" | "minute";

const formatInViewerZone = <Result>(
  instant: UtcInstant,
  timeZone: IanaTimeZone,
  locale: string,
  options: Intl.DateTimeFormatOptions,
  format: (formatter: Intl.DateTimeFormat, date: Date) => Result
): Result => {
  const validInstant = utcInstant(instant);
  const validTimeZone = parseIanaTimeZone(timeZone);
  const formatter = dateTimeFormatter(locale, {
    ...options,
    timeZone: validTimeZone,
  });

  return format(formatter, new Date(validInstant));
};

const formatViewerWithOptions = (
  instant: UtcInstant,
  timeZone: IanaTimeZone,
  locale: string,
  options: Intl.DateTimeFormatOptions
): string =>
  formatInViewerZone(instant, timeZone, locale, options, (formatter, date) =>
    formatter.format(date)
  );

const formatDurationUnit = (
  value: number,
  unit: DurationUnit,
  locale: string
): string =>
  numberFormatter(locale, {
    maximumFractionDigits: 0,
    style: "unit",
    unit,
    unitDisplay: "short",
  }).format(value);

const formatWithPart = (
  instant: UtcInstant,
  timeZone: IanaTimeZone,
  locale: string,
  options: Intl.DateTimeFormatOptions,
  part: Intl.DateTimeFormatPartTypes
): string =>
  formatInViewerZone(
    instant,
    timeZone,
    locale,
    options,
    (formatter, date) =>
      formatter.formatToParts(date).find((candidate) => candidate.type === part)
        ?.value ?? ""
  );

export const RELATIVE_HINT_NOW = "now" as const;

export const formatViewerDateTime = (
  instant: UtcInstant,
  timeZone: IanaTimeZone,
  locale: string,
  options: ViewerDateTimeFormatOptions = DEFAULT_VIEWER_DATE_TIME_OPTIONS
): string => formatViewerWithOptions(instant, timeZone, locale, options);

export const formatViewerDate = (
  instant: UtcInstant,
  timeZone: IanaTimeZone,
  locale: string,
  options: ViewerDateTimeFormatOptions = DEFAULT_VIEWER_DATE_OPTIONS
): string => formatViewerWithOptions(instant, timeZone, locale, options);

export const formatViewerTime = (
  instant: UtcInstant,
  timeZone: IanaTimeZone,
  locale: string,
  options: ViewerDateTimeFormatOptions = DEFAULT_VIEWER_TIME_OPTIONS
): string => formatViewerWithOptions(instant, timeZone, locale, options);

export const formatViewerMonthYear = (
  instant: UtcInstant,
  timeZone: IanaTimeZone,
  locale: string
): string =>
  formatViewerWithOptions(instant, timeZone, locale, {
    month: "long",
    year: "numeric",
  });

export const formatViewerWeekdayShort = (
  instant: UtcInstant,
  timeZone: IanaTimeZone,
  locale: string
): string =>
  formatWithPart(instant, timeZone, locale, { weekday: "short" }, "weekday");

export const formatViewerDayNumber = (
  instant: UtcInstant,
  timeZone: IanaTimeZone,
  locale: string
): string =>
  formatWithPart(instant, timeZone, locale, { day: "2-digit" }, "day");

export const formatViewerTimeZoneOffset = (
  instant: UtcInstant,
  timeZone: IanaTimeZone,
  locale: string
): string =>
  formatWithPart(
    instant,
    timeZone,
    locale,
    { timeZoneName: "shortOffset" },
    "timeZoneName"
  );

export const formatDuration = (
  start: UtcInstant,
  end: UtcInstant,
  locale: string
): string => {
  const validStart = utcInstant(start);
  const validEnd = utcInstant(end);

  assertLocale(locale);

  const elapsedMilliseconds = Date.parse(validEnd) - Date.parse(validStart);

  if (elapsedMilliseconds <= 0) {
    throw invalidTemporalValue("Duration end must be after start");
  }

  const totalMinutes = Math.round(elapsedMilliseconds / 60_000);
  const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const hours = Math.floor((totalMinutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(formatDurationUnit(days, "day", locale));
  }

  if (hours > 0) {
    parts.push(formatDurationUnit(hours, "hour", locale));
  }

  if (minutes > 0 || parts.length === 0) {
    parts.push(formatDurationUnit(minutes, "minute", locale));
  }

  return parts.join(NARROW_NO_BREAK_SPACE);
};

export const formatRelativeHint = (
  target: UtcInstant,
  now: UtcInstant,
  locale: string
): string => {
  const validTarget = utcInstant(target);
  const validNow = utcInstant(now);

  assertLocale(locale);

  const deltaMinutes = Math.round(
    (Date.parse(validTarget) - Date.parse(validNow)) / 60_000
  );

  if (deltaMinutes === 0) {
    return RELATIVE_HINT_NOW;
  }

  const relativeTimeFormat = relativeTimeFormatter(locale, {
    numeric: "always",
  });

  const magnitude = Math.abs(deltaMinutes);

  if (magnitude < MINUTES_PER_HOUR) {
    return relativeTimeFormat.format(deltaMinutes, "minute");
  }

  if (magnitude < MINUTES_PER_DAY) {
    return relativeTimeFormat.format(
      Math.trunc(deltaMinutes / MINUTES_PER_HOUR),
      "hour"
    );
  }

  return relativeTimeFormat.format(
    Math.trunc(deltaMinutes / MINUTES_PER_DAY),
    "day"
  );
};

export const formatGridTime = (
  instant: UtcInstant,
  timeZone: IanaTimeZone,
  locale: string
): string =>
  formatViewerTime(instant, timeZone, locale, {
    hour12: false,
    timeStyle: "short",
  });

export const leadingGraphemes = (
  text: string,
  locale: string,
  count: number
): string =>
  Array.from(segmenter(locale).segment(text), (part) => part.segment)
    .slice(0, count)
    .join("");

export const formatCalendarList = (
  locale: string | undefined,
  parts: readonly string[]
): string => listFormatter(locale ?? "en-US", { type: "unit" }).format(parts);
