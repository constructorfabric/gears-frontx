import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { vi } from "vitest";

import type { GridEvent } from "../core/grid";
import {
  calendarDate,
  fromViewerDateTime,
  parseIanaTimeZone,
  parseLocalTime,
  utcInstant,
} from "../core/model";
import type {
  CalendarAvailabilityCell,
  CalendarDate,
  CalendarEvent,
  IanaTimeZone,
  TimedCreateEventDraft,
  UtcInstant,
} from "../core/model";
import type { CalendarTranslate } from "../i18n/calendar-localization";
import { englishTranslationFor } from "../i18n/english";

export const UTC = parseIanaTimeZone("UTC");

export const instant = (
  date: string | CalendarDate,
  time: string,
  timeZone: IanaTimeZone = UTC
): UtcInstant =>
  fromViewerDateTime({
    date: typeof date === "string" ? calendarDate(date) : date,
    time: parseLocalTime(time),
    timeZone,
  });

export interface MakeEventOptions {
  readonly startDate?: string | CalendarDate;
  readonly startTime?: string;
  readonly endDate?: string | CalendarDate;
  readonly endTime?: string;
  readonly timeZone?: IanaTimeZone;
}

export const makeEvent = (
  id: string,
  options: MakeEventOptions = {}
): GridEvent => {
  const startDate = options.startDate ?? calendarDate("2026-08-24");
  const startTime = options.startTime ?? "09:00";
  const endDate = options.endDate ?? startDate;
  const endTime = options.endTime ?? "10:00";
  const timeZone = options.timeZone ?? UTC;

  return {
    end: instant(endDate, endTime, timeZone),
    id,
    start: instant(startDate, startTime, timeZone),
  };
};

export const availabilityCell = (
  date: string,
  time: string,
  available = true
): CalendarAvailabilityCell => {
  const hour = Number(time.slice(0, 2));
  const nextHour = `${String(hour + 1).padStart(2, "0")}:00`;

  return {
    available,
    date: calendarDate(date),
    end: instant(date, nextHour),
    endTime: parseLocalTime(nextHour),
    start: instant(date, time),
    startTime: parseLocalTime(time),
  };
};

type TimedCalendarEvent<Payload> = Extract<
  CalendarEvent<Payload>,
  { readonly allDay: false }
>;

type TimedEventInput<Payload> = Omit<
  Partial<TimedCalendarEvent<Payload>>,
  "endDate" | "endTime" | "startDate" | "startTime"
> & {
  readonly endDate?: CalendarDate | string;
  readonly endTime?: ReturnType<typeof parseLocalTime> | string | null;
  readonly startDate?: CalendarDate | string;
  readonly startTime?: ReturnType<typeof parseLocalTime> | string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const dateValue = (value: CalendarDate | string): CalendarDate =>
  typeof value === "string" ? calendarDate(value) : value;

const timeValue = (value: ReturnType<typeof parseLocalTime> | string) =>
  typeof value === "string" ? parseLocalTime(value) : value;

interface PositionalPayload {
  readonly courseCode: string;
}

const isIso = (value: unknown): value is string =>
  typeof value === "string" && value.includes("T");

const isDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value);

const isTime = (value: unknown): value is string =>
  typeof value === "string" && /^\d{2}:\d{2}$/u.test(value);

const positionalDefaults = (
  id: string
): TimedEventInput<PositionalPayload> => ({
  available: true,
  colorFamily: "purple",
  conflicts: [{ dimension: "classroom", id: "conflict", label: "Room A" }],
  id,
  metadata: { courseCode: "CAL-101" },
  title: id,
});

const withAttendees = (
  id: string,
  options: Record<string, unknown>
): Record<string, unknown> => {
  if (typeof options.attendees !== "number") {
    return options;
  }
  return {
    ...options,
    attendees: Array.from({ length: options.attendees }, (_, index) => ({
      displayName: `Person ${index}`,
      id: `${id}-person-${index}`,
    })),
  };
};

const positionalTimedEventThree = (
  id: string,
  args: readonly unknown[]
): TimedEventInput<PositionalPayload> => {
  const [first, second, third] = args;
  const defaults = positionalDefaults(id);

  if (isIso(first) && isIso(second) && typeof third === "boolean") {
    return {
      ...defaults,
      available: third,
      end: utcInstant(second),
      start: utcInstant(first),
    };
  }
  if (isIso(first) && isIso(second) && isRecord(third)) {
    return {
      ...defaults,
      ...withAttendees(id, third),
      end: utcInstant(second),
      start: utcInstant(first),
    };
  }

  if (typeof first === "string" && isIso(second) && isIso(third)) {
    let geometryDefaults: TimedEventInput<PositionalPayload> = {};

    if (first.includes("week")) {
      geometryDefaults = {
        colorFamily: "purple",
        eventType: "Lecture",
        location: "Room B12",
        organizer: "Prof. Curie",
      };
    } else if (first.includes("event")) {
      geometryDefaults = {
        eventType: "Course",
        location: "B-107",
        organizer: "Dr. Smith",
      };
    }

    return {
      ...defaults,
      ...geometryDefaults,
      end: utcInstant(third),
      start: utcInstant(second),
      title: first,
    };
  }

  return defaults;
};

const positionalTimedEventFour = (
  id: string,
  args: readonly unknown[]
): TimedEventInput<PositionalPayload> => {
  const [first, second, third, fourth] = args;
  const defaults = positionalDefaults(id);

  if (isDate(first) && isTime(second) && isDate(third) && isTime(fourth)) {
    return {
      ...defaults,
      endDate: third,
      endTime: fourth,
      startDate: first,
      startTime: second,
    };
  }
  if (
    typeof first === "string" &&
    isIso(second) &&
    isIso(third) &&
    isRecord(fourth)
  ) {
    return {
      ...defaults,
      ...withAttendees(id, fourth),
      end: utcInstant(third),
      start: utcInstant(second),
      title: first,
    };
  }
  if (
    typeof first === "string" &&
    isDate(second) &&
    isTime(third) &&
    isTime(fourth)
  ) {
    return {
      ...defaults,
      endTime: fourth,
      startDate: second,
      startTime: third,
      title: first,
    };
  }
  return defaults;
};

const positionalTimedEventFiveOrMore = (
  id: string,
  args: readonly unknown[]
): TimedEventInput<PositionalPayload> => {
  const [first, second, third, fourth, fifth, sixth] = args;
  const defaults = positionalDefaults(id);

  if (typeof first !== "string" || !isDate(second) || !isTime(third)) {
    return defaults;
  }
  if (isTime(fourth)) {
    return {
      ...defaults,
      calendarId: "cal-courses",
      calendarName: "Courses",
      endTime: fourth,
      location: typeof sixth === "string" ? sixth : undefined,
      organizer: typeof fifth === "string" ? fifth : undefined,
      startDate: second,
      startTime: third,
      title: first,
    };
  }
  if (isDate(fourth) && isTime(fifth)) {
    return {
      ...defaults,
      ...(isRecord(sixth) ? sixth : {}),
      endDate: fourth,
      endTime: fifth,
      startDate: second,
      startTime: third,
      title: first,
    };
  }
  return defaults;
};

const positionalTimedEvent = (
  id: string,
  args: readonly unknown[]
): TimedEventInput<PositionalPayload> => {
  const [first, second] = args;

  if (args.length === 0) {
    return positionalDefaults(id);
  }
  if (args.length === 1 && typeof first === "boolean") {
    return { ...positionalDefaults(id), available: first };
  }
  if (args.length === 2 && isIso(first) && isIso(second)) {
    return {
      ...positionalDefaults(id),
      end: utcInstant(second),
      start: utcInstant(first),
    };
  }
  if (args.length === 2 && isTime(first) && isTime(second)) {
    return { ...positionalDefaults(id), endTime: second, startTime: first };
  }
  if (args.length === 3) {
    return positionalTimedEventThree(id, args);
  }
  if (args.length === 4) {
    return positionalTimedEventFour(id, args);
  }
  return positionalTimedEventFiveOrMore(id, args);
};

export function timedEvent<Payload = unknown>(
  overrides?: TimedEventInput<Payload>
): TimedCalendarEvent<Payload>;
export function timedEvent(
  id: string,
  ...args: unknown[]
): TimedCalendarEvent<PositionalPayload>;
export function timedEvent(
  first: string | TimedEventInput<unknown> = {},
  ...args: unknown[]
): TimedCalendarEvent<unknown> {
  const options: TimedEventInput<unknown> =
    typeof first === "string" ? positionalTimedEvent(first, args) : first;

  const startDate = dateValue(options.startDate ?? "2026-08-24");
  const endDate = dateValue(options.endDate ?? startDate);
  const timeZone = options.timeZone ?? UTC;
  const startTime = timeValue(options.startTime ?? "09:00");

  const endTime =
    options.endTime === null
      ? parseLocalTime("10:00")
      : timeValue(options.endTime ?? "10:00");

  return {
    allDay: false,
    colorFamily: "turquoise",
    end:
      options.end ??
      fromViewerDateTime({ date: endDate, time: endTime, timeZone }),
    id: "event-1",
    start:
      options.start ??
      fromViewerDateTime({ date: startDate, time: startTime, timeZone }),
    timeZone,
    title: "Planning",
    ...options,
    endDate,
    endTime: options.endTime === null ? null : endTime,
    startDate,
    startTime,
  };
}

type AllDayCalendarEvent<Payload> = Extract<
  CalendarEvent<Payload>,
  { readonly allDay: true }
>;

type AllDayEventInput<Payload> = Omit<
  Partial<AllDayCalendarEvent<Payload>>,
  "endDate" | "startDate"
> & {
  readonly endDate?: CalendarDate | string;
  readonly startDate?: CalendarDate | string;
};

export function allDayEvent<Payload = unknown>(
  overrides?: AllDayEventInput<Payload>
): AllDayCalendarEvent<Payload>;
export function allDayEvent<Payload = unknown>(
  id: string,
  ...args: string[]
): AllDayCalendarEvent<Payload>;
export function allDayEvent<Payload = unknown>(
  first: string | AllDayEventInput<Payload> = {},
  ...args: string[]
): AllDayCalendarEvent<Payload> {
  const [second, third, fourth] = args;

  const positional = (id: string): AllDayEventInput<Payload> =>
    args.length === 2
      ? { endDate: third, id, startDate: second, title: id }
      : { endDate: fourth, id, startDate: third, title: second };

  const options = typeof first === "string" ? positional(first) : first;

  const startDate = dateValue(options.startDate ?? "2026-08-24");
  const endDate = dateValue(options.endDate ?? "2026-08-25");

  return {
    allDay: true,
    colorFamily: "turquoise",
    endTime: null,
    id: "all-day",
    startTime: null,
    timeZone: UTC,
    title: "All day",
    ...options,
    endDate,
    startDate,
  };
}

export const timedDraft = (): TimedCreateEventDraft => {
  const date = calendarDate("2026-08-24");

  return {
    allDay: false,
    calendarId: "calendar-1",
    endDate: date,
    endTime: parseLocalTime("10:00"),
    startDate: date,
    startTime: parseLocalTime("09:00"),
    timeZone: UTC,
    title: "Planning session",
  };
};

export const providerTranslate: CalendarTranslate = (key) => `provider:${key}`;

export const explicitTranslate: CalendarTranslate = (key) => `explicit:${key}`;

export const identityTranslate: CalendarTranslate = (key) => key;

class TestKeyboardEvent extends globalThis.KeyboardEvent {
  public override readonly currentTarget: HTMLDivElement;
  public readonly nativeEvent: globalThis.KeyboardEvent;
  public override readonly target: HTMLDivElement;
  public override readonly view: Window = window;
  public readonly locale = "";
  public readonly persist = vi.fn<() => void>();
  public readonly isDefaultPrevented = vi.fn<() => boolean>(() => false);
  public readonly isPropagationStopped = vi.fn<() => boolean>(() => false);
  public override readonly preventDefault = vi.fn<() => void>();
  public override readonly stopPropagation = vi.fn<() => void>();

  public constructor(key: string, init: KeyboardEventInit = {}) {
    super("keydown", { key, ...init });
    const target = document.createElement("div");
    this.currentTarget = target;
    this.nativeEvent = this;
    this.target = target;
  }
}

export const keyboardEvent = (
  key: string,
  init: KeyboardEventInit = {}
): ReactKeyboardEvent<HTMLDivElement> => new TestKeyboardEvent(key, init);

/** The bundled English, so a test renders the same text a providerless calendar does. */
export const englishMessage =
  (locale: string): CalendarTranslate =>
  (id, values) =>
    englishTranslationFor(id, values, locale) ?? id;
