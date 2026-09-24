import { describe, expect as assert, it } from "vitest";

import {
  VIEWER_DAY_SEGMENT,
  calendarDate,
  datePartsInZone,
  invalidTemporalValue,
  localDateTimeParts,
  parseIanaTimeZone,
  parseLocalTime,
  resolveDaySegment,
  utcInstant,
} from "../validation";

describe("temporal validation", () => {
  it("creates a typed temporal error and resolves every day-segment edge", () => {
    const error = invalidTemporalValue("bad temporal input");

    assert(error).toBeInstanceOf(RangeError);
    assert(error.message).toBe("bad temporal input");
    assert(resolveDaySegment(true, true)).toBeNull();
    assert(resolveDaySegment(true, false)).toBe(VIEWER_DAY_SEGMENT.start);
    assert(resolveDaySegment(false, true)).toBe(VIEWER_DAY_SEGMENT.end);
    assert(resolveDaySegment(false, false)).toBe(VIEWER_DAY_SEGMENT.middle);
  });

  it("accepts UTC strings, Dates, and epoch numbers only when their round trip is canonical", () => {
    const date = new Date("2026-08-24T10:00:00.000Z");

    assert(utcInstant("2026-08-24T10:00:00Z")).toBe("2026-08-24T10:00:00.000Z");
    assert(utcInstant(date)).toBe("2026-08-24T10:00:00.000Z");
    assert(utcInstant(date.getTime())).toBe("2026-08-24T10:00:00.000Z");
    assert(() => utcInstant("2026-08-24T10:00:00+01:00")).toThrow(RangeError);
    assert(() => utcInstant("9999-99-99T00:00:00.000Z")).toThrow(RangeError);
    assert(() => utcInstant("2026-02-29T00:00:00.000Z")).toThrow(RangeError);
    assert(() => utcInstant(new Date(Number.NaN))).toThrow(RangeError);
    assert(() => utcInstant(Number.NaN)).toThrow(RangeError);
    assert(() => utcInstant(Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
  });

  it("validates calendar dates and preserves the canonical local-time precision", () => {
    assert(calendarDate("0000-02-29")).toBe("0000-02-29");
    assert(calendarDate("2026-04-30")).toBe("2026-04-30");
    assert(parseLocalTime("09:05")).toBe("09:05");
    assert(parseLocalTime("09:05:07.4")).toBe("09:05");
    assert(parseLocalTime("09:05:07.45")).toBe("09:05");
    assert(() => calendarDate("2026-02-29")).toThrow(RangeError);
    assert(() => calendarDate("2026-2-09")).toThrow(RangeError);
    assert(() => parseLocalTime("09:05:60")).toThrow(RangeError);
    assert(() => parseLocalTime("24:00")).toThrow(RangeError);
    assert(() => parseLocalTime("not-a-time")).toThrow(RangeError);
  });

  it("canonicalizes supported IANA aliases and rejects missing or unavailable zones", () => {
    assert(parseIanaTimeZone("UTC")).toBe("UTC");
    assert(parseIanaTimeZone("US/Eastern")).toBe("America/New_York");
    assert(() => parseIanaTimeZone("")).toThrow(RangeError);
    assert(() => parseIanaTimeZone("Mars/Olympus")).toThrow(RangeError);
  });

  it("parses local date-time components without allowing calendar rollover", () => {
    assert(
      localDateTimeParts({
        date: calendarDate("2026-08-24"),
        time: "09:05:07",
        timeZone: parseIanaTimeZone("UTC"),
      })
    ).toStrictEqual({
      day: 24,
      hour: 9,
      millisecond: 0,
      minute: 5,
      month: 8,
      second: 7,
      year: 2026,
    });
    assert(() =>
      localDateTimeParts({
        date: calendarDate("2026-08-24"),
        time: "09:05:60",
        timeZone: parseIanaTimeZone("UTC"),
      })
    ).toThrow(RangeError);

    const malformed = {
      date: calendarDate("2026-08-24"),
      time: "09:05",
      timeZone: parseIanaTimeZone("UTC"),
    };
    Object.defineProperty(malformed, "date", { value: "not-a-date" });
    assert(() => localDateTimeParts(malformed)).toThrow(RangeError);
  });

  it("reads zoned date parts and rejects non-finite timestamps", () => {
    const zone = parseIanaTimeZone("Europe/Berlin");

    assert(
      datePartsInZone(Date.parse("2026-08-24T07:30:00.000Z"), zone)
    ).toStrictEqual({
      day: 24,
      hour: 9,
      minute: 30,
      month: 8,
      second: 0,
      year: 2026,
    });
    assert(() => datePartsInZone(Number.POSITIVE_INFINITY, zone)).toThrow(
      RangeError
    );
  });
});
