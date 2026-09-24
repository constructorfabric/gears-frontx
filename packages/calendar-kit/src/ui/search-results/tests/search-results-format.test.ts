import { describe, expect as assert, it, vi } from "vitest";

import {
  allDayEvent,
  timedEvent,
  englishMessage,
  UTC,
} from "../../../__test-utils__/fixtures";
import {
  calendarDate,
  fromViewerDateTime,
  utcInstant,
} from "../../../core/model";
import type { CalendarTranslate } from "../../../i18n/calendar-localization";
import { englishTranslate as t } from "../../../i18n/english";
import {
  buildSearchGroups,
  countRows,
  eventMatches,
  formatSearchCount,
  formatSearchDayHeader,
  formatSearchResultDetails,
  normalizeQuery,
  rowAt,
  viewerToday,
} from "../search-results-format";

const NOW = utcInstant("2026-08-24T08:00:00.000Z");

const requiredRow = <T>(row: T | undefined): T => {
  if (row === undefined) {
    throw new Error("Expected search group to carry a row");
  }

  return row;
};

describe("search-results-format", () => {
  it("normalizes query and searchable fields with trim, lowercase, and accent folding", () => {
    assert(normalizeQuery("  CAFÉ  ")).toBe("cafe");
    assert(
      eventMatches(
        timedEvent(
          "one",
          "Other",
          "2026-08-24",
          "09:00",
          "2026-08-24",
          "10:00",
          {
            organizer: "Élodie",
          }
        ),
        "elodie"
      )
    ).toBeTruthy();
    assert(
      eventMatches(
        timedEvent(
          "two",
          "Other",
          "2026-08-24",
          "09:00",
          "2026-08-24",
          "10:00"
        ),
        "missing"
      )
    ).toBeFalsy();
  });

  it("returns no rows for a query shorter than the minimum", () => {
    assert(buildSearchGroups([], "x", UTC)).toStrictEqual([]);
  });

  it("splits timed events and expands all-day events across viewer days", () => {
    const groups = buildSearchGroups(
      [
        timedEvent(
          "overnight",
          "Overnight",
          "2026-08-24",
          "23:00",
          "2026-08-25",
          "01:00"
        ),
        allDayEvent("conference", "Conference", "2026-08-24", "2026-08-26"),
      ],
      "er",
      UTC
    );

    assert(groups).toHaveLength(2);
    assert(groups[0]?.date).toBe("2026-08-24");
    assert(groups[0]?.rows.map((row) => row.event.id)).toStrictEqual([
      "conference",
      "overnight",
    ]);
    assert(groups[1]?.rows.map((row) => row.event.id)).toStrictEqual([
      "conference",
      "overnight",
    ]);
    assert(groups[0]?.rows.map((row) => row.focusIndex)).toStrictEqual([0, 1]);
    assert(rowAt(groups, 3)?.event.id).toBe("overnight");
    assert(rowAt(groups, 99)).toBeUndefined();
  });

  it("orders rows by all-day first, then start, then title and counts them", () => {
    const groups = buildSearchGroups(
      [
        timedEvent(
          "late",
          "Zed Event",
          "2026-08-24",
          "11:00",
          "2026-08-24",
          "12:00"
        ),
        timedEvent(
          "early",
          "Beta Event",
          "2026-08-24",
          "09:00",
          "2026-08-24",
          "10:00"
        ),
        timedEvent(
          "same",
          "Alpha Event",
          "2026-08-24",
          "09:00",
          "2026-08-24",
          "10:00"
        ),
        allDayEvent("all-day", "All day Event", "2026-08-24", "2026-08-25"),
      ],
      "event",
      UTC
    );

    assert(groups[0]?.rows.map((row) => row.event.title)).toStrictEqual([
      "All day Event",
      "Alpha Event",
      "Beta Event",
      "Zed Event",
    ]);
    assert(countRows(groups)).toBe(4);
  });

  it("formats relative and absolute group headers, details, and pluralized counts", () => {
    const today = viewerToday(NOW, UTC);
    const todayStart = fromViewerDateTime({
      date: today,
      time: "00:00",
      timeZone: UTC,
    });
    const tomorrow = calendarDate("2026-08-25");
    const tomorrowStart = fromViewerDateTime({
      date: tomorrow,
      time: "00:00",
      timeZone: UTC,
    });
    const later = calendarDate("2026-08-26");
    const laterStart = fromViewerDateTime({
      date: later,
      time: "00:00",
      timeZone: UTC,
    });

    const row = buildSearchGroups(
      [
        timedEvent("one", "One", "2026-08-24", "09:00", "2026-08-24", "10:00", {
          location: "Room",
          organizer: "Organizer",
        }),
      ],
      "one",
      UTC
    )[0]?.rows[0];

    assert(
      formatSearchDayHeader(today, todayStart, today, UTC, "en-US", t)
    ).toBe("Today");
    assert(
      formatSearchDayHeader(tomorrow, tomorrowStart, today, UTC, "en-US", t)
    ).toBe("Tomorrow");
    assert(
      formatSearchDayHeader(later, laterStart, today, UTC, "en-US", t)
    ).toBe("Aug 26, 2026");
    assert(formatSearchCount(1, englishMessage("en-US"))).toBe("1 result");
    assert(formatSearchCount(2, englishMessage("en-US"))).toBe("2 results");
    assert(formatSearchResultDetails(row, UTC, "en-US", t)).toBe(
      "09:00 – 10:00 · Organizer · Room"
    );

    const allDayRow = requiredRow(
      buildSearchGroups(
        [allDayEvent("all-day", "All day", "2026-08-24", "2026-08-25")],
        "all",
        UTC
      )[0]?.rows[0]
    );

    assert(formatSearchResultDetails(allDayRow, UTC, "en-US", t)).toBe(
      "All day"
    );
  });
});

describe(formatSearchCount, () => {
  it("passes the numeric count so the resolver selects the category", () => {
    const message = vi.fn<CalendarTranslate>(() => "count");

    assert(formatSearchCount(2, message)).toBe("count");
    assert(message).toHaveBeenCalledWith("calendar.panel.searchCount", {
      count: 2,
    });
  });
});
