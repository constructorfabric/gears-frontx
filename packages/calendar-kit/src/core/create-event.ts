import type {
  AllDayCreateEventDraft,
  CreateEventDraft,
  TimedCreateEventDraft,
} from "./model";
import { minutesFromLocalTime } from "./time-input";
import { parseLocalTime } from "./validation";

const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/u;
const RECURRENCE_UNTIL_PATTERN = /^\d{8}(?<group1>T\d{6}Z)?$/u;
const RECURRENCE_WEEKDAYS: ReadonlySet<string> = new Set([
  "SU",
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
]);
const SUPPORTED_RECURRENCE_KEYS: ReadonlySet<string> = new Set([
  "FREQ",
  "INTERVAL",
  "COUNT",
  "UNTIL",
  "BYDAY",
]);

export type CreateEventField =
  | "title"
  | "startDate"
  | "endDate"
  | "startTime"
  | "endTime"
  | "recurrenceRule";

export type CreateEventValidationError =
  | "required"
  | "before-start"
  | "invalid";

export type CreateEventValidationErrors = Partial<
  Record<CreateEventField, CreateEventValidationError>
>;

interface CreateEventValidation {
  readonly valid: boolean;
  readonly errors: CreateEventValidationErrors;
}

const validateAllDayDraft = (
  draft: AllDayCreateEventDraft,
  errors: CreateEventValidationErrors
): void => {
  if (draft.startTime !== null) {
    errors.startTime = "invalid";
  }

  if (draft.endTime !== null) {
    errors.endTime = "invalid";
  }

  const endDate = draft.endDate ?? undefined;

  if (endDate === undefined || endDate <= draft.startDate) {
    errors.endDate = "before-start";
  }
};

const localTimeMinutes = (value: string): number | null => {
  try {
    return minutesFromLocalTime(parseLocalTime(value));
  } catch {
    return null;
  }
};

const validateTimedDraft = (
  draft: TimedCreateEventDraft,
  errors: CreateEventValidationErrors
): void => {
  const startMinutes = localTimeMinutes(draft.startTime);

  if (startMinutes === null) {
    errors.startTime = "invalid";
    return;
  }

  const endDate = draft.endDate ?? undefined;

  if (endDate !== undefined && endDate < draft.startDate) {
    errors.endDate = "before-start";
    return;
  }

  const endTime = draft.endTime ?? undefined;

  if (endTime === undefined) {
    return;
  }

  const endMinutes = localTimeMinutes(endTime);

  if (endMinutes === null) {
    errors.endTime = "invalid";
    return;
  }

  const sameDate = endDate === undefined || endDate === draft.startDate;

  if (sameDate && endMinutes <= startMinutes) {
    errors.endTime = "before-start";
  }
};

const isPositiveInteger = (value: string): boolean =>
  POSITIVE_INTEGER_PATTERN.test(value);

const parseRecurrenceValues = (rule: string): Map<string, string> | null => {
  if (rule.trim() === "") {
    return null;
  }

  const values = new Map<string, string>();

  for (const field of rule.split(";")) {
    const separator = field.indexOf("=");

    if (separator <= 0 || separator === field.length - 1) {
      return null;
    }

    const key = field.slice(0, separator);

    if (values.has(key)) {
      return null;
    }

    values.set(key, field.slice(separator + 1));
  }

  return values;
};

const hasValidByDay = (value: string | undefined): boolean => {
  if (value === undefined) {
    return true;
  }
  return value.split(",").every((weekday) => RECURRENCE_WEEKDAYS.has(weekday));
};

const hasSupportedKeys = (values: ReadonlyMap<string, string>): boolean =>
  [...values.keys()].every((key) => SUPPORTED_RECURRENCE_KEYS.has(key));

export const isValidRecurrenceRule = (rule: string): boolean => {
  const values = parseRecurrenceValues(rule);

  if (values === null) {
    return false;
  }

  const frequency = values.get("FREQ");
  const validFrequency =
    frequency === "DAILY" ||
    frequency === "WEEKLY" ||
    frequency === "MONTHLY" ||
    frequency === "YEARLY";
  const interval = values.get("INTERVAL");
  const count = values.get("COUNT");
  const until = values.get("UNTIL");

  return (
    validFrequency &&
    (interval === undefined || isPositiveInteger(interval)) &&
    (count === undefined || isPositiveInteger(count)) &&
    (until === undefined || RECURRENCE_UNTIL_PATTERN.test(until)) &&
    hasValidByDay(values.get("BYDAY")) &&
    hasSupportedKeys(values)
  );
};

export const validateCreateEventDraft = (
  draft: CreateEventDraft
): CreateEventValidation => {
  const errors: CreateEventValidationErrors = {};

  if (draft.title.trim() === "") {
    errors.title = "required";
  }

  const recurrenceRule = draft.recurrenceRule ?? undefined;

  if (recurrenceRule !== undefined && !isValidRecurrenceRule(recurrenceRule)) {
    errors.recurrenceRule = "invalid";
  }

  if (draft.allDay) {
    validateAllDayDraft(draft, errors);
  } else {
    validateTimedDraft(draft, errors);
  }

  return { errors, valid: Object.keys(errors).length === 0 };
};
