import { describe, expect as assert, it } from "vitest";

import { instant, UTC } from "../../__test-utils__/fixtures";
import {
  LOCAL_TIME_DISAMBIGUATION,
  WEEKDAY,
  calendarDate,
  parseIanaTimeZone,
  parseLocalTime,
  utcInstant,
} from "../model";
import type { ViewerDateRange } from "../model";
import {
  addCalendarDays,
  addCalendarMonths,
  buildDayRange,
  buildDayWindow,
  DEFAULT_WORKING_HOURS,
  FULL_DAY_TIME_WINDOW,
  assertTimeWindow,
  buildSlotStarts,
  buildTimeWindowRange,
  countWindowSlots,
  buildMonthRange,
  buildWeekRange,
  compareUtcInstants,
  fromViewerDateTime,
  isDateInRange,
  isWithinTimeWindow,
  orderDateRange,
  splitUtcRangeByViewerDay,
  toUtcRange,
  toViewerDateTime,
} from "../temporal";

const timeWindow = (start: string, end: string) => ({
  end: parseLocalTime(end),
  start: parseLocalTime(start),
});

describe("calendar temporal algorithms", () => {
  it("converts between viewer-local parts and UTC while preserving the injected zone", () => {
    const zone = parseIanaTimeZone("Europe/Berlin");

    const value = fromViewerDateTime({
      date: calendarDate("2026-08-24"),
      time: parseLocalTime("09:30"),
      timeZone: zone,
    });

    assert(value).toBe("2026-08-24T07:30:00.000Z");
    assert(toViewerDateTime(value, zone)).toStrictEqual({
      date: "2026-08-24",
      offsetMinutes: 120,
      source: value,
      time: "09:30",
      timeZone: zone,
    });
  });

  it("resolves a skipped calendar day and a half-hour DST fold", () => {
    const apia = parseIanaTimeZone("Pacific/Apia");
    const lordHowe = parseIanaTimeZone("Australia/Lord_Howe");

    const skipped = {
      date: calendarDate("2011-12-30"),
      time: "12:00",
      timeZone: apia,
    };

    const fold = {
      date: calendarDate("2026-04-05"),
      time: "01:30",
      timeZone: lordHowe,
    };

    assert(fromViewerDateTime(skipped)).toBe("2011-12-30T22:00:00.000Z");
    assert(() =>
      fromViewerDateTime({
        ...skipped,
        disambiguation: LOCAL_TIME_DISAMBIGUATION.reject,
      })
    ).toThrow(RangeError);
    assert(
      fromViewerDateTime({
        ...fold,
        disambiguation: LOCAL_TIME_DISAMBIGUATION.earlier,
      })
    ).toBe("2026-04-04T14:30:00.000Z");
    assert(
      fromViewerDateTime({
        ...fold,
        disambiguation: LOCAL_TIME_DISAMBIGUATION.later,
      })
    ).toBe("2026-04-04T15:00:00.000Z");
  });

  it("uses explicit earlier, later, compatible, and reject policies at DST gaps and folds", () => {
    const zone = parseIanaTimeZone("America/New_York");

    const gap = {
      date: calendarDate("2026-03-08"),
      time: "02:30",
      timeZone: zone,
    };

    const fold = {
      date: calendarDate("2026-11-01"),
      time: "01:30",
      timeZone: zone,
    };

    assert(fromViewerDateTime(gap)).toBe("2026-03-08T07:30:00.000Z");
    assert(
      fromViewerDateTime({
        ...gap,
        disambiguation: LOCAL_TIME_DISAMBIGUATION.earlier,
      })
    ).toBe("2026-03-08T06:30:00.000Z");
    assert(() =>
      fromViewerDateTime({
        ...gap,
        disambiguation: LOCAL_TIME_DISAMBIGUATION.reject,
      })
    ).toThrow(RangeError);

    assert(fromViewerDateTime(fold)).toBe("2026-11-01T05:30:00.000Z");
    assert(
      fromViewerDateTime({
        ...fold,
        disambiguation: LOCAL_TIME_DISAMBIGUATION.later,
      })
    ).toBe("2026-11-01T06:30:00.000Z");
    assert(() =>
      fromViewerDateTime({
        ...fold,
        disambiguation: LOCAL_TIME_DISAMBIGUATION.reject,
      })
    ).toThrow(RangeError);

    assert(() =>
      fromViewerDateTime({
        ...fold,
        disambiguation: (() => {
          const value = { policy: LOCAL_TIME_DISAMBIGUATION.compatible };
          Object.defineProperty(value, "policy", { value: "unspecified" });

          return value.policy;
        })(),
      })
    ).toThrow(RangeError);
  });

  it("compares instants, shifts dates, and clamps month ends to valid days", () => {
    assert(
      compareUtcInstants(
        instant("2026-08-24", "09:00"),
        instant("2026-08-24", "10:00")
      )
    ).toBe(-1);
    assert(
      compareUtcInstants(
        instant("2026-08-24", "10:00"),
        instant("2026-08-24", "10:00")
      )
    ).toBe(0);
    assert(
      compareUtcInstants(
        instant("2026-08-24", "11:00"),
        instant("2026-08-24", "10:00")
      )
    ).toBe(1);

    assert(addCalendarDays(calendarDate("2026-01-01"), -1)).toBe("2025-12-31");
    assert(addCalendarDays(calendarDate("2026-01-01"), 1)).toBe("2026-01-02");
    assert(addCalendarMonths(calendarDate("2024-01-31"), 1)).toBe("2024-02-29");
    assert(addCalendarMonths(calendarDate("2026-01-31"), 1, 31)).toBe(
      "2026-02-28"
    );
    assert(addCalendarMonths(calendarDate("2026-03-31"), -1)).toBe(
      "2026-02-28"
    );
    assert(() => addCalendarDays(calendarDate("2026-01-01"), 1.5)).toThrow(
      RangeError
    );
    assert(() =>
      addCalendarDays(calendarDate("2026-01-01"), Number.MAX_SAFE_INTEGER)
    ).toThrow(RangeError);
    assert(() => addCalendarMonths(calendarDate("2026-01-01"), 1.5)).toThrow(
      RangeError
    );
    assert(() => addCalendarMonths(calendarDate("2026-01-01"), 1, 0)).toThrow(
      RangeError
    );
    assert(() => addCalendarMonths(calendarDate("9999-12-01"), 1)).toThrow(
      RangeError
    );
  });

  it("builds exclusive day, window, week, and month ranges with requested week starts", () => {
    const date = calendarDate("2026-08-26");

    assert(buildDayRange(date, UTC)).toStrictEqual({
      endExclusive: "2026-08-27",
      start: date,
      timeZone: UTC,
    });
    assert(buildDayWindow(date, 3, UTC)).toStrictEqual({
      endExclusive: "2026-08-29",
      start: date,
      timeZone: UTC,
    });
    assert(buildWeekRange(date, UTC)).toStrictEqual({
      endExclusive: "2026-08-31",
      start: "2026-08-24",
      timeZone: UTC,
    });
    assert(buildWeekRange(date, UTC, WEEKDAY.sunday)).toStrictEqual({
      endExclusive: "2026-08-30",
      start: "2026-08-23",
      timeZone: UTC,
    });
    assert(buildMonthRange(date, UTC)).toStrictEqual({
      endExclusive: "2026-09-01",
      start: "2026-08-01",
      timeZone: UTC,
    });
    assert(() => buildDayWindow(date, 0, UTC)).toThrow(RangeError);
    assert(() => buildDayWindow(date, 1.2, UTC)).toThrow(RangeError);

    assert(() =>
      buildWeekRange(
        date,
        UTC,
        (() => {
          const value = { day: WEEKDAY.monday };
          Object.defineProperty(value, "day", { value: "mondayish" });

          return value.day;
        })()
      )
    ).toThrow(RangeError);
  });

  it("maps viewer ranges to UTC and rejects inverted ranges", () => {
    const berlin = parseIanaTimeZone("Europe/Berlin");
    const range = buildDayRange(calendarDate("2026-03-29"), berlin);

    assert(toUtcRange(range)).toStrictEqual({
      end: "2026-03-29T22:00:00.000Z",
      start: "2026-03-28T23:00:00.000Z",
    });

    const inverted: ViewerDateRange = {
      endExclusive: calendarDate("2026-08-24"),
      start: calendarDate("2026-08-25"),
      timeZone: UTC,
    };

    assert(() => toUtcRange(inverted)).toThrow(RangeError);
  });

  it("generates slot starts for ordinary and DST-length days", () => {
    const ordinary = toUtcRange(buildDayRange(calendarDate("2026-08-24"), UTC));
    const spring = toUtcRange(
      buildDayRange(
        calendarDate("2026-03-29"),
        parseIanaTimeZone("Europe/Berlin")
      )
    );

    assert(buildSlotStarts(ordinary, 60)).toHaveLength(24);
    assert(buildSlotStarts(ordinary, 60)[0]).toBe(ordinary.start);
    assert(buildSlotStarts(ordinary, 30)).toHaveLength(48);
    assert(buildSlotStarts(ordinary, 15)[1]).toBe(
      utcInstant("2026-08-24T00:15:00.000Z")
    );
    assert(buildSlotStarts(spring, 60)).toHaveLength(23);
    assert(() =>
      buildSlotStarts({ end: ordinary.start, start: ordinary.end }, 60)
    ).toThrow(RangeError);
  });

  it("resolves a visible time window on a viewer date", () => {
    const date = calendarDate("2026-08-24");

    const visible = {
      end: parseLocalTime("23:00"),
      start: parseLocalTime("06:00"),
    };

    assert(buildTimeWindowRange(date, UTC, visible)).toStrictEqual({
      end: utcInstant("2026-08-24T23:00:00.000Z"),
      start: utcInstant("2026-08-24T06:00:00.000Z"),
    });
    assert(buildTimeWindowRange(date, UTC, FULL_DAY_TIME_WINDOW)).toStrictEqual(
      toUtcRange(buildDayRange(date, UTC))
    );
    assert(
      buildSlotStarts(buildTimeWindowRange(date, UTC, visible), 60)
    ).toHaveLength(17);
  });

  it("rejects time windows that are empty, inverted, or off the slot grid", () => {
    assert(() => {
      assertTimeWindow(timeWindow("06:00", "23:00"), 60);
    }).not.toThrow();
    assert(() => {
      assertTimeWindow(FULL_DAY_TIME_WINDOW, 15);
    }).not.toThrow();
    assert(() => {
      assertTimeWindow(timeWindow("10:00", "10:00"), 60);
    }).toThrow(RangeError);
    assert(() => {
      assertTimeWindow(timeWindow("18:00", "08:00"), 60);
    }).toThrow(RangeError);
    assert(() => {
      assertTimeWindow(timeWindow("06:30", "23:00"), 60);
    }).toThrow(RangeError);
    assert(() => {
      assertTimeWindow(timeWindow("06:00", "23:10"), 20);
    }).toThrow(RangeError);
    assert(countWindowSlots(timeWindow("06:00", "23:00"), 30)).toBe(34);
  });

  it("orders a date range and tests membership inclusively", () => {
    const first = calendarDate("2025-09-01");
    const last = calendarDate("2025-12-25");
    const range = orderDateRange(last, first);

    assert(range).toStrictEqual({ end: last, start: first });
    assert(isDateInRange(first, range)).toBeTruthy();
    assert(isDateInRange(last, range)).toBeTruthy();
    assert(isDateInRange(calendarDate("2025-12-26"), range)).toBeFalsy();
    assert(isDateInRange(first, null)).toBeFalsy();
  });

  it("identifies working-hour boundaries and segments intervals by viewer day", () => {
    assert(
      isWithinTimeWindow(parseLocalTime("08:00"), DEFAULT_WORKING_HOURS)
    ).toBeTruthy();
    assert(
      isWithinTimeWindow(parseLocalTime("17:30"), DEFAULT_WORKING_HOURS)
    ).toBeTruthy();
    assert(
      isWithinTimeWindow(parseLocalTime("18:00"), DEFAULT_WORKING_HOURS)
    ).toBeFalsy();
    assert(
      isWithinTimeWindow(parseLocalTime("07:00"), DEFAULT_WORKING_HOURS)
    ).toBeFalsy();
    assert(
      isWithinTimeWindow(parseLocalTime("23:30"), FULL_DAY_TIME_WINDOW)
    ).toBeTruthy();

    const start = instant("2026-08-24", "23:00");
    const end = instant("2026-08-25", "01:00");
    assert(splitUtcRangeByViewerDay(start, end, UTC)).toStrictEqual([
      {
        date: "2026-08-24",
        end: instant("2026-08-25", "00:00"),
        segment: "start",
        start,
      },
      {
        date: "2026-08-25",
        end,
        segment: "end",
        start: instant("2026-08-25", "00:00"),
      },
    ]);
    assert(
      splitUtcRangeByViewerDay(start, instant("2026-08-24", "23:30"), UTC)[0]
        ?.segment
    ).toBeNull();
    assert(() => splitUtcRangeByViewerDay(end, start, UTC)).toThrow(RangeError);

    const dstZone = parseIanaTimeZone("America/New_York");
    const dstStart = instant("2026-03-08", "01:30", dstZone);
    const dstEnd = instant("2026-03-09", "01:30", dstZone);
    const segments = splitUtcRangeByViewerDay(dstStart, dstEnd, dstZone);

    assert(segments).toHaveLength(2);
    assert(Date.parse(segments[0].end) - Date.parse(segments[0].start)).toBe(
      21.5 * 60 * 60 * 1000
    );
  });
});
