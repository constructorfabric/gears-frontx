import { describe, expect as assert, it } from "vitest";

import { englishMessage, UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, utcInstant } from "../../../core/model";
import {
  buildLiveAnnouncement,
  formatAgendaDate,
  formatAgendaEventCount,
  getRelativeDayLabel,
} from "../agenda-format";
import type { AgendaDayGroup } from "../agenda-rows";

const group = (date: string, eventCount: number): AgendaDayGroup => ({
  allDayEvents: [],
  date: calendarDate(date),
  eventCount,
  hourRows: [{ events: [], hourStart: null }],
  nowLine: null,
});

describe("agenda formatting", () => {
  it("formats dates, plural counts, and relative day labels", () => {
    const t = englishMessage("en-US");

    assert(
      formatAgendaDate(utcInstant("2025-09-01T12:00:00.000Z"), UTC, "en-US")
    ).toBe("Mon, Sep 1");
    assert(formatAgendaEventCount(1, t)).toBe("1 event");
    assert(formatAgendaEventCount(2, t)).toBe("2 events");
    assert(
      getRelativeDayLabel(
        calendarDate("2026-08-24"),
        calendarDate("2026-08-24"),
        t
      )
    ).toBe("Today");
    assert(
      getRelativeDayLabel(
        calendarDate("2026-08-25"),
        calendarDate("2026-08-24"),
        t
      )
    ).toBe("Tomorrow");
    assert(
      getRelativeDayLabel(
        calendarDate("2026-08-26"),
        calendarDate("2026-08-24"),
        t
      )
    ).toBeNull();
  });

  it("announces the date range and every day count", () => {
    const text = buildLiveAnnouncement(
      { kind: "range" },
      [group("2026-08-24", 1), group("2026-08-25", 0)],
      [],
      "en-US",
      UTC,
      englishMessage("en-US")
    );

    assert(text).toContain("Aug 24");
    assert(text).toContain("1 event");
    assert(text).toContain("0 events");
  });

  it("handles empty announcements", () => {
    assert(
      buildLiveAnnouncement(
        { kind: "range" },
        [],
        [],
        "en-US",
        UTC,
        englishMessage("en-US")
      )
    ).toBe("");
  });

  it("rejects empty locales before constructing Intl formatters", () => {
    assert(() =>
      formatAgendaDate(utcInstant("2025-09-01T12:00:00.000Z"), UTC, " ")
    ).toThrow("Locale must not be empty");
  });
});
