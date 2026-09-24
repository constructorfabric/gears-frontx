/** Reads free-typed or pasted date text into a `CalendarDate`, following the locale's own date order. */

import { toAsciiDigits } from "./digits";
import { dateTimeFormatter } from "./intl-cache";
import type { CalendarDate } from "./model";
import { calendarDate } from "./validation";

export const DATE_INPUT = {
  empty: "empty",
  invalid: "invalid",
  value: "value",
} as const;

export type DateInputKind = (typeof DATE_INPUT)[keyof typeof DATE_INPUT];

export type DateInputResult =
  | { readonly kind: typeof DATE_INPUT.value; readonly value: CalendarDate }
  | { readonly kind: typeof DATE_INPUT.empty }
  | { readonly kind: typeof DATE_INPUT.invalid };

export interface ParseDateInputOptions {
  readonly locale: string;
  /** Supplies the parts the text leaves out - a bare day keeps this month and year. */
  readonly reference: CalendarDate;
}

const ISO_DATE_PATTERN =
  /^(?<group1>\d{4})-(?<group2>\d{1,2})-(?<group3>\d{1,2})$/u;

const DATE_SEPARATOR_PATTERN = /[^\p{L}\p{Nd}]+/gu;

const DIGITS_ONLY_PATTERN = /^\d+$/u;

const MONTHS_PER_YEAR = 12;

const MAX_DAY_OF_MONTH = 31;

const TWO_DIGIT_YEAR_LIMIT = 100;

const CENTURY = 2000;

const MIN_MONTH_NAME_LENGTH = 3;

type DateFieldName = "day" | "month" | "year";

interface DateInputParts {
  readonly day: number;
  readonly month?: number;
  readonly year?: number;
}

const monthNamesByLocale = new Map<string, readonly string[]>();

const dateFieldOrders = new Map<string, readonly DateFieldName[]>();

/** Month names of one arbitrary year, long and short, lowercased for matching. */
const monthNames = (locale: string): readonly string[] => {
  const cached = monthNamesByLocale.get(locale);

  if (cached) {
    return cached;
  }

  const long = dateTimeFormatter(locale, { month: "long", timeZone: "UTC" });
  const short = dateTimeFormatter(locale, { month: "short", timeZone: "UTC" });

  const names: string[] = [];

  for (let month = 0; month < MONTHS_PER_YEAR; month += 1) {
    const sample = new Date(Date.UTC(2021, month, 15, 12));

    names.push(
      `${long.format(sample)}\u0000${short.format(sample)}`.toLowerCase()
    );
  }

  monthNamesByLocale.set(locale, names);

  return names;
};

/** The order in which the locale writes a numeric date, e.g. month, day, year for en-US. */
const dateFieldOrder = (locale: string): readonly DateFieldName[] => {
  const cached = dateFieldOrders.get(locale);

  if (cached) {
    return cached;
  }

  const order = dateTimeFormatter(locale, {
    day: "numeric",
    month: "numeric",
    timeZone: "UTC",
    year: "numeric",
  })
    .formatToParts(new Date(Date.UTC(2021, 0, 2, 12)))
    .flatMap((part) =>
      part.type === "day" || part.type === "month" || part.type === "year"
        ? [part.type]
        : []
    );

  dateFieldOrders.set(locale, order);

  return order;
};

const matchMonthName = (token: string, locale: string): number | undefined => {
  const candidate = token.toLowerCase();

  if (candidate.length < MIN_MONTH_NAME_LENGTH) {
    return undefined;
  }

  const index = monthNames(locale).findIndex((names) =>
    names.split("\u0000").some((name) => name.startsWith(candidate))
  );

  return index === -1 ? undefined : index + 1;
};

const expandYear = (year: number): number =>
  year < TWO_DIGIT_YEAR_LIMIT ? CENTURY + year : year;

/** A shorter entry drops the year first; a lone number is always the day. */
const resolveFilledSlots = (
  slots: readonly DateFieldName[],
  count: number
): readonly DateFieldName[] => {
  if (count === slots.length) {
    return slots;
  }

  if (count === 1) {
    return ["day"];
  }

  return slots.filter((field) => field !== "year").slice(0, count);
};

/** Assigns the typed numbers to date fields; a named month takes the month slot first. */
const readDateParts = (
  numbers: readonly number[],
  namedMonth: number | undefined,
  locale: string
): DateInputParts | null => {
  const slots = dateFieldOrder(locale).filter(
    (field) => namedMonth === undefined || field !== "month"
  );

  if (numbers.length === 0 || numbers.length > slots.length) {
    return null;
  }

  const filled = resolveFilledSlots(slots, numbers.length);

  const assigned = new Map<DateFieldName, number>(
    numbers.map((value, index) => [filled[index], value])
  );

  const day = assigned.get("day");

  if (day === undefined) {
    return null;
  }

  return {
    day,
    month: namedMonth ?? assigned.get("month"),
    year: assigned.get("year"),
  };
};

const buildDateInput = (
  year: number,
  month: number,
  day: number
): DateInputResult => {
  if (
    month < 1 ||
    month > MONTHS_PER_YEAR ||
    day < 1 ||
    day > MAX_DAY_OF_MONTH
  ) {
    return { kind: DATE_INPUT.invalid };
  }

  const utc = new Date(Date.UTC(year, month - 1, day, 12));

  // A rolled-over date (31 April, 30 February) lands on another month.
  if (utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return { kind: DATE_INPUT.invalid };
  }

  try {
    return {
      kind: DATE_INPUT.value,
      value: calendarDate(utc.toISOString().slice(0, 10)),
    };
  } catch {
    return { kind: DATE_INPUT.invalid };
  }
};

export const parseDateInput = (
  text: string,
  { locale, reference }: ParseDateInputOptions
): DateInputResult => {
  const normalised = toAsciiDigits(text).trim();

  if (!normalised) {
    return { kind: DATE_INPUT.empty };
  }

  const isoMatch = ISO_DATE_PATTERN.exec(normalised);

  if (isoMatch) {
    return buildDateInput(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3])
    );
  }

  const numbers: number[] = [];

  let namedMonth: number | undefined;

  for (const token of normalised.split(DATE_SEPARATOR_PATTERN)) {
    if (!token) {
      continue;
    }

    if (DIGITS_ONLY_PATTERN.test(token)) {
      numbers.push(Number(token));

      continue;
    }

    namedMonth ??= matchMonthName(token, locale);
  }

  const referenceYear = Number(reference.slice(0, 4));
  const referenceMonth = Number(reference.slice(5, 7));
  const parts = readDateParts(numbers, namedMonth, locale);

  if (!parts) {
    return { kind: DATE_INPUT.invalid };
  }

  return buildDateInput(
    expandYear(parts.year ?? referenceYear),
    parts.month ?? referenceMonth,
    parts.day
  );
};
