import { describe, expect as assert, it } from "vitest";

import { englishMessage, UTC } from "../../../__test-utils__/fixtures";
import { calendarDate } from "../../../core/model";
import {
  MONTH_ANNOUNCEMENT_KIND,
  buildLiveAnnouncement,
  formatMonthDayNumber,
  formatMonthWeekNumber,
  formatMonthWeekday,
} from "../month-grid-format";

const rows = [
  {
    allDaySpans: [],
    cells: [],
    row: {
      dates: [],
      key: "row",
      rowIndex: 0,
      weekNumber: 36,
      weekStart: calendarDate("2025-09-01"),
    },
  },
] as const;

describe("month-grid-format", () => {
  it("formats week, day, and weekday values using the requested locale", () => {
    assert(formatMonthWeekNumber(36, "ar-EG")).toBe("٣٦");
    assert(formatMonthDayNumber(calendarDate("2025-09-02"), "ar-EG")).toBe("٢");
    assert(formatMonthWeekday(calendarDate("2025-09-02"), UTC, "en-US")).toBe(
      "Tue"
    );
  });

  it("announces no pending state as an empty string", () => {
    assert(
      buildLiveAnnouncement(
        null,
        {
          endExclusive: calendarDate("2025-10-01"),
          start: calendarDate("2025-09-01"),
        },
        rows,
        "en-US",
        UTC,
        englishMessage("en-US")
      )
    ).toBe("");
  });

  it("announces the month range", () => {
    assert(
      buildLiveAnnouncement(
        { kind: MONTH_ANNOUNCEMENT_KIND.range },
        {
          endExclusive: calendarDate("2025-10-01"),
          start: calendarDate("2025-09-01"),
        },
        rows,
        "en-US",
        UTC,
        englishMessage("en-US")
      )
    ).toBe("Month of September 2025");
  });

  it("announces focused and hidden counts with localized digits", () => {
    const result = buildLiveAnnouncement(
      {
        date: calendarDate("2025-09-02"),
        eventCount: 2,
        hiddenCount: 3,
        kind: MONTH_ANNOUNCEMENT_KIND.focus,
      },
      {
        endExclusive: calendarDate("2025-10-01"),
        start: calendarDate("2025-09-01"),
      },
      rows,
      "ar-EG",
      UTC,
      englishMessage("ar-EG")
    );

    assert(result).toContain("Month view");
    assert(result).toContain("+٣ hidden");
  });

  it("announces an overflow action even when its count is zero", () => {
    assert(
      buildLiveAnnouncement(
        { kind: MONTH_ANNOUNCEMENT_KIND.overflow },
        {
          endExclusive: calendarDate("2025-10-01"),
          start: calendarDate("2025-09-01"),
        },
        rows,
        "en-US",
        UTC,
        englishMessage("en-US")
      )
    ).toBe("+0 hidden");
  });
});
