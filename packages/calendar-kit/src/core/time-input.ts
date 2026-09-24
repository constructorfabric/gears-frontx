import { toAsciiDigits } from "./digits";
import { dateTimeFormatter } from "./intl-cache";
import type { LocalTime } from "./model";
import { invalidTemporalValue, padTwo, parseLocalTime } from "./validation";

export const MINUTES_PER_HOUR = 60;

export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

const NOON = 12 * MINUTES_PER_HOUR;

const HOUR_MINUTE_PATTERN =
  /^(?<group1>\d{1,2})\s*[:.,\s]\s*(?<group2>\d{1,2})$/u;

const HOUR_ONLY_PATTERN = /^(?<group1>\d{1,2})$/u;

const COMPACT_PATTERN = /^(?<group1>\d{1,2})(?<group2>\d{2})$/u;

interface TimeFormatters {
  readonly twelveHourDetector: Intl.DateTimeFormat;
  readonly twelveHour: Intl.DateTimeFormat;
  readonly twentyFourHour: Intl.DateTimeFormat;
}

const localeDayPeriod = (locale: string, hour: number): string => {
  const parts = dateTimeFormatter(locale, {
    hour: "numeric",
    hourCycle: "h12",
    timeZone: "UTC",
  }).formatToParts(new Date(Date.UTC(1970, 0, 1, hour)));

  return (
    parts.find((part) => part.type === "dayPeriod")?.value.toLowerCase() ?? ""
  );
};

const MERIDIEM = { am: "am", pm: "pm" } as const;

const meridiemTokens = (
  locale: string
): readonly (readonly [string, Meridiem])[] => {
  const tokens: (readonly [string, Meridiem])[] = [];

  const localizedAm = localeDayPeriod(locale, 9);
  const localizedPm = localeDayPeriod(locale, 21);

  if (localizedAm) {
    tokens.push([localizedAm, MERIDIEM.am]);
  }

  if (localizedPm) {
    tokens.push([localizedPm, MERIDIEM.pm]);
  }

  tokens.push(
    ["am", MERIDIEM.am],
    ["pm", MERIDIEM.pm],
    ["a", MERIDIEM.am],
    ["p", MERIDIEM.pm]
  );

  return tokens;
};

const splitMeridiem = (text: string, locale: string) => {
  const lowered = text.toLowerCase();

  for (const [token, period] of meridiemTokens(locale)) {
    if (lowered.endsWith(token)) {
      return { period, rest: text.slice(0, text.length - token.length).trim() };
    }
  }

  return { period: null, rest: text };
};

const readHourMinute = (
  text: string
): { readonly hour: number; readonly minute: number } | null => {
  const separated = HOUR_MINUTE_PATTERN.exec(text);

  if (separated) {
    return { hour: Number(separated[1]), minute: Number(separated[2]) };
  }

  const hourOnly = HOUR_ONLY_PATTERN.exec(text);

  if (hourOnly) {
    return { hour: Number(hourOnly[1]), minute: 0 };
  }

  const compact = COMPACT_PATTERN.exec(text);

  if (compact) {
    return { hour: Number(compact[1]), minute: Number(compact[2]) };
  }

  return null;
};

const getTimeFormatters = (locale: string): TimeFormatters => ({
  twelveHour: dateTimeFormatter(locale, {
    hour: "numeric",
    hourCycle: "h12",
    minute: "2-digit",
    timeZone: "UTC",
  }),
  twelveHourDetector: dateTimeFormatter(locale, {
    hour: "numeric",
    timeZone: "UTC",
  }),
  twentyFourHour: dateTimeFormatter(locale, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: "UTC",
  }),
});

export const usesTwelveHourClock = (locale: string): boolean => {
  const parts = getTimeFormatters(locale).twelveHourDetector.formatToParts(
    new Date(Date.UTC(1970, 0, 1, 13))
  );

  return parts.some((part) => part.type === "dayPeriod");
};

export const minutesFromLocalTime = (time: LocalTime): number => {
  const validTime = parseLocalTime(time);
  const hour = Number(validTime.slice(0, 2));
  const minute = Number(validTime.slice(3, 5));

  return hour * MINUTES_PER_HOUR + minute;
};

const inheritReferencePeriod = (
  minutes: number,
  hour: number,
  locale: string,
  reference: LocalTime | undefined
): number => {
  const ambiguous = hour >= 1 && hour <= 11;

  if (!reference || !ambiguous || !usesTwelveHourClock(locale)) {
    return minutes;
  }

  return minutesFromLocalTime(reference) >= NOON ? minutes + NOON : minutes;
};

const resolveMinutes = (
  { hour, minute }: { readonly hour: number; readonly minute: number },
  period: Meridiem | null,
  locale: string,
  reference: LocalTime | undefined
): number | null => {
  if (minute > 59) {
    return null;
  }

  if (period) {
    if (hour < 1 || hour > 12) {
      return null;
    }

    const hourMinutes = hour === 12 ? 0 : hour * MINUTES_PER_HOUR;

    return (period === MERIDIEM.pm ? hourMinutes + NOON : hourMinutes) + minute;
  }

  if (hour > 23) {
    return null;
  }

  return inheritReferencePeriod(
    hour * MINUTES_PER_HOUR + minute,
    hour,
    locale,
    reference
  );
};

type Meridiem = (typeof MERIDIEM)[keyof typeof MERIDIEM];

export const TIME_INPUT = {
  empty: "empty",
  invalid: "invalid",
  value: "value",
} as const;

export type TimeInputKind = (typeof TIME_INPUT)[keyof typeof TIME_INPUT];

export type TimeInputResult =
  | { readonly kind: typeof TIME_INPUT.value; readonly value: LocalTime }
  | { readonly kind: typeof TIME_INPUT.empty }
  | { readonly kind: typeof TIME_INPUT.invalid };

export interface ParseTimeInputOptions {
  readonly locale: string;
  readonly reference?: LocalTime;
}

export interface TimeOfDayIncrementOptions {
  readonly stepMinutes: number;
  readonly fromMinutes?: number;
  readonly toMinutes?: number;
}

export const localTimeFromMinutes = (minutes: number): LocalTime => {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= MINUTES_PER_DAY) {
    throw invalidTemporalValue(`Invalid minute of day: ${minutes}`);
  }

  const hour = Math.floor(minutes / MINUTES_PER_HOUR);
  const minute = minutes % MINUTES_PER_HOUR;

  return parseLocalTime(`${padTwo(hour)}:${padTwo(minute)}`);
};

export const formatTimeOfDay = (time: LocalTime, locale: string): string => {
  const minutes = minutesFromLocalTime(time);
  const formatters = getTimeFormatters(locale);
  const twelveHour = usesTwelveHourClock(locale);

  const date = new Date(
    Date.UTC(
      1970,
      0,
      1,
      Math.floor(minutes / MINUTES_PER_HOUR),
      minutes % MINUTES_PER_HOUR
    )
  );

  return (
    twelveHour ? formatters.twelveHour : formatters.twentyFourHour
  ).format(date);
};

export const timeOfDayIncrements = ({
  stepMinutes,
  fromMinutes = 0,
  toMinutes = MINUTES_PER_DAY - 1,
}: TimeOfDayIncrementOptions): readonly LocalTime[] => {
  if (!Number.isInteger(stepMinutes) || stepMinutes <= 0) {
    throw invalidTemporalValue(`Invalid time-of-day step: ${stepMinutes}`);
  }

  if (!Number.isFinite(fromMinutes) || !Number.isFinite(toMinutes)) {
    throw invalidTemporalValue("Time-of-day bounds must be finite");
  }

  const first = Math.ceil(Math.max(fromMinutes, 0) / stepMinutes) * stepMinutes;
  const last = Math.min(toMinutes, MINUTES_PER_DAY - 1);

  const rows: LocalTime[] = [];

  for (let minutes = first; minutes <= last; minutes += stepMinutes) {
    rows.push(localTimeFromMinutes(minutes));
  }

  return rows;
};

export const parseTimeInput = (
  text: string,
  { locale, reference }: ParseTimeInputOptions
): TimeInputResult => {
  const normalised = toAsciiDigits(text).trim();

  if (!normalised) {
    return { kind: TIME_INPUT.empty };
  }

  const { rest, period } = splitMeridiem(normalised, locale);
  const parts = readHourMinute(rest);

  if (!parts) {
    return { kind: TIME_INPUT.invalid };
  }

  const minutes = resolveMinutes(parts, period, locale, reference);

  if (minutes === null) {
    return { kind: TIME_INPUT.invalid };
  }

  return { kind: TIME_INPUT.value, value: localTimeFromMinutes(minutes) };
};
