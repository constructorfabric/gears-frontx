/** Date-entry domain: the locale's segment order, its typed mask, and parsing. */

import { dateTimeFormatter } from "./intl-cache";
import type { CalendarDate } from "./model";
import { calendarDate } from "./validation";

export const DATE_SEGMENT = {
  day: "day",
  month: "month",
  year: "year",
} as const;

export type DateSegmentKind = (typeof DATE_SEGMENT)[keyof typeof DATE_SEGMENT];

export interface DateSegment {
  readonly kind: DateSegmentKind;
  readonly start: number;
  readonly length: number;
}

export interface DateMask {
  readonly segments: readonly DateSegment[];
  /** The unfilled text, e.g. `mm/dd/yyyy` or `dd.mm.yyyy`, in the locale's order. */
  readonly empty: string;
}

/** What the caller must remember between keystrokes to keep digits shifting in. */
export interface SegmentEntry {
  readonly kind: DateSegmentKind;
  readonly digits: string;
}

export interface TypedDigit {
  readonly text: string;
  readonly entry: SegmentEntry | null;
  /** The segment can hold no further digit, so the caret moves on. */
  readonly complete: boolean;
}

const DIGITS_PATTERN = /^\d+$/u;

const NON_DIGIT_PATTERN = /\D/gu;

const SEGMENT_PLACEHOLDER: Readonly<Record<DateSegmentKind, string>> = {
  day: "dd",
  month: "mm",
  year: "yyyy",
};

const SEGMENT_MAX: Readonly<Record<DateSegmentKind, number>> = {
  day: 31,
  month: 12,
  year: 9999,
};

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const FEBRUARY = 2;

const LEAP_DAY = 29;

/** Any date with a two-digit day and month, so every locale pattern shows both. */
const REFERENCE_DATE = new Date(Date.UTC(2026, 10, 22));

const MASK_OPTIONS = {
  calendar: "gregory",
  day: "2-digit",
  month: "2-digit",
  numberingSystem: "latn",
  timeZone: "UTC",
  year: "numeric",
} as const;

const masks = new Map<string, DateMask>();

const isSegmentKind = (type: string): type is DateSegmentKind =>
  type in SEGMENT_PLACEHOLDER;

export const dateMask = (locale: string): DateMask => {
  const cached = masks.get(locale);

  if (cached !== undefined) {
    return cached;
  }

  const parts = dateTimeFormatter(locale, MASK_OPTIONS).formatToParts(
    REFERENCE_DATE
  );

  const segments: DateSegment[] = [];
  let empty = "";

  for (const part of parts) {
    if (!isSegmentKind(part.type)) {
      empty += part.value;
      continue;
    }

    const placeholder = SEGMENT_PLACEHOLDER[part.type];

    segments.push({
      kind: part.type,
      length: placeholder.length,
      start: empty.length,
    });

    empty += placeholder;
  }

  const mask: DateMask = { empty, segments };
  masks.set(locale, mask);

  return mask;
};

export const segmentText = (text: string, segment: DateSegment): string =>
  text.slice(segment.start, segment.start + segment.length);

export const replaceSegment = (
  text: string,
  segment: DateSegment,
  value: string
): string =>
  text.slice(0, segment.start) +
  value +
  text.slice(segment.start + segment.length);

const daysInMonth = (year: number, month: number): number => {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

  if (month === FEBRUARY && isLeap) {
    return LEAP_DAY;
  }

  return MONTH_LENGTHS[month - 1] ?? 0;
};

export const maskedText = (
  value: CalendarDate | "",
  mask: DateMask
): string => {
  if (value === "") {
    return mask.empty;
  }

  const digits: Readonly<Record<DateSegmentKind, string>> = {
    day: value.slice(8, 10),
    month: value.slice(5, 7),
    year: value.slice(0, 4),
  };

  let text = mask.empty;

  for (const segment of mask.segments) {
    text = replaceSegment(text, segment, digits[segment.kind]);
  }

  return text;
};

/** The typed date, or empty while any segment is unfilled or out of range. */
export const parseMaskedText = (
  text: string,
  mask: DateMask
): CalendarDate | "" => {
  const values = new Map<DateSegmentKind, number>();

  for (const segment of mask.segments) {
    const raw = segmentText(text, segment);

    if (!DIGITS_PATTERN.test(raw)) {
      return "";
    }

    values.set(segment.kind, Number(raw));
  }

  const year = values.get(DATE_SEGMENT.year) ?? 0;
  const month = values.get(DATE_SEGMENT.month) ?? 0;
  const day = values.get(DATE_SEGMENT.day) ?? 0;

  if (year === 0 || month < 1 || month > 12 || day < 1) {
    return "";
  }

  const clampedDay = Math.min(day, daysInMonth(year, month));

  return calendarDate(
    `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`
  );
};

export const isEmptyText = (text: string, mask: DateMask): boolean =>
  text === mask.empty;

export const clearSegment = (
  text: string,
  mask: DateMask,
  segment: DateSegment
): string => replaceSegment(text, segment, segmentText(mask.empty, segment));

/** The segment the caret sits in, so a click lands on a whole segment. */
export const segmentIndexAt = (mask: DateMask, caret: number): number => {
  const index = mask.segments.findIndex(
    (segment) => caret <= segment.start + segment.length
  );

  return index === -1 ? mask.segments.length - 1 : index;
};

/**
 * Shifts one digit into the segment the way a native date input does: `1` then
 * `3` in a month cannot mean 13, so it restarts the segment as 03 and moves on.
 */
export const typeDigit = (
  text: string,
  segment: DateSegment,
  entry: SegmentEntry | null,
  digit: string
): TypedDigit => {
  const previous = entry?.kind === segment.kind ? entry.digits : "";
  const candidate = (previous + digit).slice(-segment.length);
  const max = SEGMENT_MAX[segment.kind];
  const digits = Number(candidate) > max ? digit : candidate;
  const complete = digits.length >= segment.length || Number(digits) * 10 > max;

  return {
    complete,
    entry: complete ? null : { digits, kind: segment.kind },
    text: replaceSegment(text, segment, digits.padStart(segment.length, "0")),
  };
};

/** Arrow-key stepping: month and day wrap, the year only clamps. */
export const stepSegment = (
  text: string,
  segment: DateSegment,
  delta: number
): string => {
  const max = SEGMENT_MAX[segment.kind];
  const raw = segmentText(text, segment);

  if (!DIGITS_PATTERN.test(raw)) {
    return replaceSegment(
      text,
      segment,
      String(delta > 0 ? 1 : max).padStart(segment.length, "0")
    );
  }

  const stepped = Number(raw) + delta;

  const next =
    segment.kind === DATE_SEGMENT.year
      ? Math.min(Math.max(stepped, 1), max)
      : ((stepped - 1 + max) % max) + 1;

  return replaceSegment(
    text,
    segment,
    String(next).padStart(segment.length, "0")
  );
};

/** Pasted text: its digits fill the segments in the locale's own order. */
export const fillDigits = (mask: DateMask, pasted: string): string => {
  let rest = pasted.replaceAll(NON_DIGIT_PATTERN, "");
  let text = mask.empty;

  for (const segment of mask.segments) {
    if (rest.length < segment.length) {
      break;
    }

    text = replaceSegment(text, segment, rest.slice(0, segment.length));
    rest = rest.slice(segment.length);
  }

  return text;
};
