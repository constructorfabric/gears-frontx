import { dateTimeFormatter, listFormatter } from "../../core/intl-cache";
import type { CalendarDate, UtcInstant, Weekday } from "../../core/model";
import { weekdayIndex } from "../../core/temporal";
import { calendarDate } from "../../core/validation";
import type { CalendarTranslate } from "../../i18n/calendar-localization";
import { englishTranslate } from "../../i18n/english";
import { formatDateFieldLabel } from "../primitives/date-field/date-field-format";

const UNTIL_DATE_PATTERN = /^\d{8}(?:T\d{6}Z)?$/u;
const WHITESPACE_PATTERN = /\s+/u;

export const REPEAT_PRESET = {
  biweekly: "biweekly",
  custom: "custom",
  daily: "daily",
  monthly: "monthly",
  none: "none",
  weekly: "weekly",
} as const;

export type RepeatPreset = (typeof REPEAT_PRESET)[keyof typeof REPEAT_PRESET];

export const REPEAT_UNIT = {
  day: "day",
  month: "month",
  week: "week",
} as const;

export type RepeatUnit = (typeof REPEAT_UNIT)[keyof typeof REPEAT_UNIT];

export const WEEKDAY_ORDER: readonly Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const WEEKDAY_CODES: Readonly<Record<Weekday, string>> = {
  friday: "FR",
  monday: "MO",
  saturday: "SA",
  sunday: "SU",
  thursday: "TH",
  tuesday: "TU",
  wednesday: "WE",
};

const WEEKDAY_TRANSLATION_KEYS: Readonly<Record<Weekday, string>> = {
  friday: "calendar.create_event.weekday.friday",
  monday: "calendar.create_event.weekday.monday",
  saturday: "calendar.create_event.weekday.saturday",
  sunday: "calendar.create_event.weekday.sunday",
  thursday: "calendar.create_event.weekday.thursday",
  tuesday: "calendar.create_event.weekday.tuesday",
  wednesday: "calendar.create_event.weekday.wednesday",
};

export type RepeatEndKind = "never" | "on";

export interface CustomRepeatState {
  readonly interval: number;
  readonly unit: RepeatUnit;
  readonly byDay: readonly Weekday[];
  readonly endKind: RepeatEndKind;
  readonly endDate: CalendarDate | null;
}

const frequencyForUnit = (unit: RepeatUnit): "DAILY" | "WEEKLY" | "MONTHLY" => {
  if (unit === REPEAT_UNIT.day) {
    return "DAILY";
  }
  if (unit === REPEAT_UNIT.month) {
    return "MONTHLY";
  }
  return "WEEKLY";
};

const frequencyTranslationKey = (frequency: string | undefined): string => {
  if (frequency === "DAILY") {
    return "calendar.create_event.repeat.daily";
  }
  if (frequency === "MONTHLY") {
    return "calendar.create_event.repeat.monthly";
  }
  if (frequency === "YEARLY") {
    return "calendar.create_event.repeat.yearly";
  }
  return "calendar.create_event.repeat.weekly";
};

const parseWeekdays = (value: string | undefined): readonly Weekday[] => {
  if (typeof value !== "string" || value === "") {
    return [];
  }

  const codes = new Set(value.split(","));

  return WEEKDAY_ORDER.filter((weekday) => codes.has(WEEKDAY_CODES[weekday]));
};

const parseUntilDate = (value: string | undefined): CalendarDate | null => {
  if (value === undefined || !UNTIL_DATE_PATTERN.test(value)) {
    return null;
  }

  const date = value.slice(0, 8);

  try {
    return calendarDate(
      `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
    );
  } catch {
    return null;
  }
};

const parseRule = (rule: string): Map<string, string> => {
  const fields = new Map<string, string>();

  for (const field of rule.split(";")) {
    const separator = field.indexOf("=");

    if (separator <= 0) {
      continue;
    }

    fields.set(field.slice(0, separator), field.slice(separator + 1));
  }

  return fields;
};

const formatList = (values: readonly string[], locale: string): string =>
  listFormatter(locale, { style: "long", type: "conjunction" }).format(values);

export const resolveOverlayKind = (
  discardOpen: boolean,
  customRepeatOpen: boolean
): "discard" | "custom-repeat" | "none" => {
  if (discardOpen) {
    return "discard";
  }
  if (customRepeatOpen) {
    return "custom-repeat";
  }
  return "none";
};

export const serializeCustomRepeat = (state: CustomRepeatState): string => {
  const frequency = frequencyForUnit(state.unit);

  const parts = [`FREQ=${frequency}`];

  if (state.interval > 1) {
    parts.push(`INTERVAL=${Math.max(1, Math.floor(state.interval))}`);
  }

  if (frequency === "WEEKLY" && state.byDay.length > 0) {
    const days: string[] = [];

    for (const weekday of WEEKDAY_ORDER) {
      if (state.byDay.includes(weekday)) {
        days.push(WEEKDAY_CODES[weekday]);
      }
    }

    if (days.length > 0) {
      parts.push(`BYDAY=${days.join(",")}`);
    }
  }

  if (state.endKind === "on" && state.endDate !== null) {
    parts.push(`UNTIL=${String(state.endDate).replaceAll("-", "")}`);
  }

  return parts.join(";");
};

export const parseCustomRepeatState = (
  rule: string | null | undefined
): CustomRepeatState => {
  const fields = parseRule(rule ?? "");
  const intervalValue = Number(fields.get("INTERVAL") ?? "1");

  const interval =
    Number.isInteger(intervalValue) && intervalValue > 0 ? intervalValue : 1;

  const frequency = fields.get("FREQ");
  let unit: RepeatUnit = REPEAT_UNIT.week;

  if (frequency === "DAILY") {
    unit = REPEAT_UNIT.day;
  } else if (frequency === "MONTHLY") {
    unit = REPEAT_UNIT.month;
  }

  const byDay = parseWeekdays(fields.get("BYDAY"));
  const endDate = parseUntilDate(fields.get("UNTIL"));

  return {
    byDay,
    endDate,
    endKind: endDate === null ? "never" : "on",
    interval,
    unit,
  };
};

export const weekdayLabel = (weekday: Weekday, t: CalendarTranslate): string =>
  t(WEEKDAY_TRANSLATION_KEYS[weekday]);

export const formatRepeatSummary = (
  rule: string | null | undefined,
  t: CalendarTranslate,
  locale: string
): string | undefined => {
  if (rule === null || rule === "") {
    return undefined;
  }

  const fields = parseRule(rule ?? "");
  const frequency = fields.get("FREQ");
  const summary = t(frequencyTranslationKey(frequency));
  const byDay = fields.get("BYDAY");

  if (byDay === undefined) {
    return summary;
  }

  const labels: string[] = [];

  for (const code of byDay.split(",")) {
    const weekday = WEEKDAY_ORDER.find(
      (candidate) => WEEKDAY_CODES[candidate] === code
    );

    if (weekday !== undefined) {
      labels.push(weekdayLabel(weekday, t));
    }
  }

  if (labels.length === 0) {
    return summary;
  }

  return `${summary}: ${formatList(labels, locale)}`;
};

export const formatDateRowLabel = (
  date: CalendarDate,
  locale: string,
  includeYear = false
): string => formatDateFieldLabel(date, locale, includeYear);

export const dateRangeDayCount = (
  startDate: CalendarDate,
  endDate: CalendarDate | null
): number => {
  if (endDate === null) {
    return 0;
  }

  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);

  return Math.max(0, Math.round((end - start) / (24 * 60 * 60 * 1000)));
};

export const formatTimeZone = (
  timeZone: string,
  locale: string,
  t: CalendarTranslate = englishTranslate,
  now?: UtcInstant
): string => {
  const parts = dateTimeFormatter(locale, {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(now === undefined ? new Date() : new Date(now));
  const offset = parts.find((part) => part.type === "timeZoneName")?.value;

  if (timeZone === "Europe/Berlin" && offset !== undefined) {
    return `${offset} ${t("calendar.timeZone.cityGroup.berlinBratislavaBelgrade")}`;
  }

  return offset ?? timeZone;
};

export const initials = (displayName: string): string => {
  const result: string[] = [];

  for (const part of displayName.trim().split(WHITESPACE_PATTERN)) {
    if (part === "") {
      continue;
    }

    result.push(part.charAt(0).toUpperCase());

    if (result.length === 2) {
      break;
    }
  }

  return result.join("");
};

export const firstLetter = (name: string): string =>
  name.trim().charAt(0).toUpperCase();

export const createDefaultAnchorRect = (): DOMRect => new DOMRect(24, 24, 0, 0);

const HINT_KEY_BY_UNIT: Readonly<Record<RepeatUnit, string>> = {
  day: "calendar.create_event.repeat.hint.daily",
  month: "calendar.create_event.repeat.hint.monthly",
  week: "calendar.create_event.repeat.hint.weekly",
};

// 2023-01-01 is a Sunday.
const longWeekdayName = (weekday: Weekday, locale: string): string =>
  dateTimeFormatter(locale, { timeZone: "UTC", weekday: "long" }).format(
    new Date(Date.UTC(2023, 0, 1 + WEEKDAY_ORDER.indexOf(weekday)))
  );

const hintKey = (state: CustomRepeatState): string =>
  state.interval === 1
    ? HINT_KEY_BY_UNIT[state.unit]
    : `${HINT_KEY_BY_UNIT[state.unit]}Every`;

// Without BYDAY a weekly rule repeats on the start weekday.
const hintWeekdays = (
  state: CustomRepeatState,
  startDate: CalendarDate,
  locale: string
): string => {
  const weekdays =
    state.byDay.length > 0
      ? state.byDay
      : [WEEKDAY_ORDER[weekdayIndex(startDate)] ?? "monday"];

  return formatList(
    weekdays.map((weekday) => longWeekdayName(weekday, locale)),
    locale
  );
};

export const formatRepeatHint = (
  rule: string | null | undefined,
  startDate: CalendarDate,
  t: CalendarTranslate,
  locale: string
): string | undefined => {
  if ((rule ?? "") === "") {
    return undefined;
  }

  const state = parseCustomRepeatState(rule);
  const frequency = t(hintKey(state), {
    count: state.interval,
    day: Number(startDate.slice(-2)),
    weekdays: hintWeekdays(state, startDate, locale),
  });

  if (state.endDate === null) {
    return frequency;
  }

  return t("calendar.create_event.repeat.hint.until", {
    date: formatDateRowLabel(state.endDate, locale, true),
    frequency,
  });
};
