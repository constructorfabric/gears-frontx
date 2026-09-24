import { describe, expect, it, vi } from "vitest";

import { englishMessage, UTC } from "../../../__test-utils__/fixtures";
import {
  calendarDate,
  parseIanaTimeZone,
  parseLocalTime,
  utcInstant,
} from "../../../core/model";
import type { CalendarEvent } from "../../../core/model";
import type { CalendarTranslate } from "../../../i18n/calendar-localization";
import {
  buildRsvpSegments,
  formatComparisonLine,
  formatEventRange,
  formatRecurrenceSummary,
  formatRsvpSegment,
} from "../event-detail-panel-format";

const BERLIN = parseIanaTimeZone("Europe/Berlin");

const DATE = calendarDate("2026-08-24");

type TimedEvent = Extract<CalendarEvent, { readonly allDay: false }>;

type TimedEventOverrides = Partial<Omit<TimedEvent, "allDay">>;

const makeTimedEvent = (overrides: TimedEventOverrides = {}): TimedEvent => ({
  allDay: false,
  available: true,
  colorFamily: "purple",
  end: utcInstant("2026-08-24T10:00:00.000Z"),
  endDate: DATE,
  endTime: parseLocalTime("10:00"),
  id: "event-1",
  start: utcInstant("2026-08-24T09:00:00.000Z"),
  startDate: DATE,
  startTime: parseLocalTime("09:00"),
  timeZone: UTC,
  title: "Chemistry",
  ...overrides,
});

const makeAllDayEvent = (endDate: string): CalendarEvent => ({
  allDay: true,
  available: true,
  colorFamily: "orange",
  endDate: calendarDate(endDate),
  endTime: null,
  id: "event-all-day",
  startDate: DATE,
  startTime: null,
  timeZone: UTC,
  title: "Holiday",
});

describe(formatEventRange, () => {
  it("formats a timed event as date plus clock range in the viewer zone", () => {
    expect(formatEventRange(makeTimedEvent(), UTC, "en-US")).toBe(
      "Aug 24, 2026, 9:00 AM – 10:00 AM"
    );
  });

  it("omits the end clock when the event has no end time", () => {
    expect(
      formatEventRange(makeTimedEvent({ endTime: null }), UTC, "en-US")
    ).toBe("Aug 24, 2026, 9:00 AM");
  });

  it("formats a single all-day event as one date", () => {
    expect(formatEventRange(makeAllDayEvent("2026-08-25"), UTC, "en-US")).toBe(
      "Aug 24, 2026"
    );
  });

  it("formats a multi-day all-day event as an inclusive date range", () => {
    expect(formatEventRange(makeAllDayEvent("2026-08-26"), UTC, "en-US")).toBe(
      "Aug 24, 2026 – Aug 25, 2026"
    );
  });
});

describe(formatComparisonLine, () => {
  it("converts the event clock into the comparison zone and names it", () => {
    expect(formatComparisonLine(makeTimedEvent(), BERLIN, "en-US")).toBe(
      "11:00 AM – 12:00 PM (Europe/Berlin)"
    );
  });

  it("shows only the converted start clock without an end time", () => {
    expect(
      formatComparisonLine(makeTimedEvent({ endTime: null }), BERLIN, "en-US")
    ).toBe("11:00 AM (Europe/Berlin)");
  });

  it("converts an all-day event into the comparison zone date", () => {
    expect(
      formatComparisonLine(makeAllDayEvent("2026-08-25"), BERLIN, "en-US")
    ).toBe("Aug 24, 2026 (Europe/Berlin)");
  });
});

describe(buildRsvpSegments, () => {
  it("emits one segment per supplied count in fixed order", () => {
    const segments = buildRsvpSegments(
      makeTimedEvent({
        rsvp: { awaiting: 8, invited: 31, maybe: 3, no: 3, yes: 17 },
      })
    );

    expect(segments).toStrictEqual([
      { count: 31, labelKey: "calendar.detail.rsvp.invited" },
      { count: 17, labelKey: "calendar.detail.rsvp.yes" },
      { count: 3, labelKey: "calendar.detail.rsvp.no" },
      { count: 8, labelKey: "calendar.detail.rsvp.awaiting" },
      { count: 3, labelKey: "calendar.detail.rsvp.maybe" },
    ]);
  });

  it("yields no segments for absent or null RSVP", () => {
    expect(buildRsvpSegments(makeTimedEvent())).toStrictEqual([]);
    expect(buildRsvpSegments(makeTimedEvent({ rsvp: null }))).toStrictEqual([]);
  });
});

describe(formatRsvpSegment, () => {
  it("resolves the count's plural category for the active locale", () => {
    expect(
      formatRsvpSegment(
        { count: 2, labelKey: "calendar.detail.rsvp.yes" },
        englishMessage("ar-EG")
      )
    ).toBe("٢ yes");
    expect(
      formatRsvpSegment(
        { count: 17, labelKey: "calendar.detail.rsvp.yes" },
        englishMessage("en-US")
      )
    ).toBe("17 yes");
  });

  it("passes the raw count as the plural count", () => {
    const message = vi.fn<CalendarTranslate>(() => "count");

    expect(
      formatRsvpSegment(
        { count: 3, labelKey: "calendar.detail.rsvp.maybe" },
        message
      )
    ).toBe("count");
    expect(message).toHaveBeenCalledWith("calendar.detail.rsvp.maybe", {
      count: 3,
    });
  });
});

describe(formatRecurrenceSummary, () => {
  it("hands the raw rule to the consumer translation without echoing it", () => {
    const t = vi.fn<CalendarTranslate>(() => "Repeats weekly");

    const summary = formatRecurrenceSummary(
      makeTimedEvent({ recurrenceRule: "FREQ=WEEKLY;BYDAY=MO" }),
      t
    );

    expect(summary).toBe("Repeats weekly");
    expect(t).toHaveBeenCalledWith("calendar.detail.recurrence", {
      rule: "FREQ=WEEKLY;BYDAY=MO",
    });
  });

  it("yields no summary for missing, empty, or blank rules", () => {
    const t = vi.fn<CalendarTranslate>(() => "Repeats weekly");

    expect(formatRecurrenceSummary(makeTimedEvent(), t)).toBeUndefined();
    expect(
      formatRecurrenceSummary(makeTimedEvent({ recurrenceRule: null }), t)
    ).toBeUndefined();
    expect(
      formatRecurrenceSummary(makeTimedEvent({ recurrenceRule: "" }), t)
    ).toBeUndefined();
    expect(
      formatRecurrenceSummary(makeTimedEvent({ recurrenceRule: "   " }), t)
    ).toBeUndefined();
    expect(t).not.toHaveBeenCalled();
  });
});
