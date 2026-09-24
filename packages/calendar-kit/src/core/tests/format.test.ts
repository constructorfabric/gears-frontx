import { describe, expect as assert, it } from "vitest";

import { instant } from "../../__test-utils__/fixtures";
import {
  RELATIVE_HINT_NOW,
  formatDuration,
  formatRelativeHint,
  formatViewerDate,
  formatViewerDateTime,
  formatViewerDayNumber,
  formatViewerMonthYear,
  formatViewerTime,
  formatViewerTimeZoneOffset,
  formatViewerWeekdayShort,
} from "../format";
import { parseIanaTimeZone, parseLocalTime, utcInstant } from "../model";
import {
  TIME_INPUT,
  formatTimeOfDay,
  localTimeFromMinutes,
  minutesFromLocalTime,
  parseTimeInput,
  timeOfDayIncrements,
  usesTwelveHourClock,
} from "../time-input";

const BERLIN = parseIanaTimeZone("Europe/Berlin");

const REFERENCE = utcInstant("2026-08-24T10:00:00.000Z");

describe("calendar formatting and time-input algorithms", () => {
  it("formats viewer dates, times, parts, and offsets through the supplied locale and zone", () => {
    const morning = utcInstant("2026-08-24T07:30:00.000Z");

    assert(formatViewerDateTime(morning, BERLIN, "en-US")).toContain("8/24/26");
    assert(formatViewerDate(morning, BERLIN, "en-US")).toContain("Aug");
    assert(formatViewerTime(morning, BERLIN, "en-US")).toContain("9:30");
    assert(formatViewerMonthYear(morning, BERLIN, "en-US")).toBe("August 2026");
    assert(formatViewerWeekdayShort(morning, BERLIN, "en-US")).toBe("Mon");
    assert(formatViewerDayNumber(morning, BERLIN, "en-US")).toBe("24");
    assert(formatViewerTimeZoneOffset(morning, BERLIN, "en-US")).toMatch(
      /GMT\+2/u
    );
    assert(
      formatViewerDateTime(morning, BERLIN, "de-DE", {
        dateStyle: "full",
        timeStyle: "short",
      })
    ).toContain("Montag");
  });

  it("formats positive durations and relative hints at minute, hour, day, and now scales", () => {
    assert(
      formatDuration(
        instant("2026-08-24", "09:00"),
        instant("2026-08-24", "10:00"),
        "en-US"
      )
    ).toContain("1 hr");
    assert(
      formatDuration(
        instant("2026-08-24", "09:00"),
        instant("2026-08-24", "10:00"),
        "en-US"
      )
    ).not.toContain("day");
    assert(
      formatDuration(
        instant("2026-08-24", "09:00"),
        utcInstant("2026-08-25T11:03:00.000Z"),
        "en-US"
      )
    ).toContain("1 day");
    assert(
      formatDuration(
        instant("2026-08-24", "09:00"),
        utcInstant("2026-08-24T09:02:00.000Z"),
        "en-US"
      )
    ).toContain("2 min");
    assert(() =>
      formatDuration(
        instant("2026-08-24", "10:00"),
        instant("2026-08-24", "09:00"),
        "en-US"
      )
    ).toThrow(RangeError);

    assert(formatRelativeHint(REFERENCE, REFERENCE, "en-US")).toBe(
      RELATIVE_HINT_NOW
    );
    assert(
      formatRelativeHint(
        utcInstant("2026-08-24T10:30:00.000Z"),
        REFERENCE,
        "en-US"
      )
    ).toContain("30");
    assert(
      formatRelativeHint(
        utcInstant("2026-08-24T08:00:00.000Z"),
        REFERENCE,
        "en-US"
      )
    ).toContain("2");
    assert(
      formatRelativeHint(
        utcInstant("2026-08-26T10:00:00.000Z"),
        REFERENCE,
        "en-US"
      )
    ).toContain("2");
  });

  it("converts local-time values to minutes and formats both clock conventions", () => {
    assert(minutesFromLocalTime(parseLocalTime("23:45"))).toBe(1425);
    assert(localTimeFromMinutes(0)).toBe("00:00");
    assert(localTimeFromMinutes(1439)).toBe("23:59");
    assert(() => localTimeFromMinutes(-1)).toThrow(RangeError);
    assert(() => localTimeFromMinutes(1440)).toThrow(RangeError);
    assert(() => localTimeFromMinutes(1.5)).toThrow(RangeError);

    assert(usesTwelveHourClock("en-US")).toBeTruthy();
    assert(usesTwelveHourClock("de-DE")).toBeFalsy();
    assert(formatTimeOfDay(parseLocalTime("13:05"), "en-US")).toContain("1:05");
    assert(formatTimeOfDay(parseLocalTime("13:05"), "de-DE")).toContain(
      "13:05"
    );
    assert(() => usesTwelveHourClock("")).toThrow(RangeError);
  });

  it("formats repeated locale-specific time values consistently", () => {
    const locale = "en-US-u-ca-gregory";

    assert(formatTimeOfDay(parseLocalTime("13:05"), locale)).toContain("1:05");
    assert(usesTwelveHourClock(locale)).toBeTruthy();
  });

  it("generates bounded time-of-day increments and rejects unusable steps", () => {
    assert(
      timeOfDayIncrements({ fromMinutes: 10, stepMinutes: 15, toMinutes: 40 })
    ).toStrictEqual(["00:15", "00:30"]);
    assert(
      timeOfDayIncrements({
        fromMinutes: 23 * 60,
        stepMinutes: 60,
        toMinutes: 24 * 60,
      })
    ).toStrictEqual(["23:00"]);
    assert(
      timeOfDayIncrements({ fromMinutes: -10, stepMinutes: 30, toMinutes: 20 })
    ).toStrictEqual(["00:00"]);
    assert(
      timeOfDayIncrements({
        fromMinutes: 1500,
        stepMinutes: 15,
        toMinutes: 1600,
      })
    ).toStrictEqual([]);
    assert(() => timeOfDayIncrements({ stepMinutes: 0 })).toThrow(RangeError);
    assert(() => timeOfDayIncrements({ stepMinutes: 1.5 })).toThrow(RangeError);
    assert(() =>
      timeOfDayIncrements({ fromMinutes: Number.NaN, stepMinutes: 15 })
    ).toThrow(RangeError);
  });

  it("parses empty, separated, compact, meridiem, localized-digit, and reference-period input", () => {
    assert(parseTimeInput("", { locale: "en-US" })).toStrictEqual({
      kind: TIME_INPUT.empty,
    });
    assert(parseTimeInput("  ", { locale: "en-US" })).toStrictEqual({
      kind: TIME_INPUT.empty,
    });
    assert(parseTimeInput("9:30", { locale: "en-US" })).toStrictEqual({
      kind: TIME_INPUT.value,
      value: "09:30",
    });
    assert(parseTimeInput("0930", { locale: "en-US" })).toStrictEqual({
      kind: TIME_INPUT.value,
      value: "09:30",
    });
    assert(parseTimeInput("9 pm", { locale: "en-US" })).toStrictEqual({
      kind: TIME_INPUT.value,
      value: "21:00",
    });
    assert(parseTimeInput("12 am", { locale: "en-US" })).toStrictEqual({
      kind: TIME_INPUT.value,
      value: "00:00",
    });
    assert(parseTimeInput("9 a", { locale: "en-US" })).toStrictEqual({
      kind: TIME_INPUT.value,
      value: "09:00",
    });
    assert(parseTimeInput("١٣:٣٠", { locale: "ar-EG" })).toStrictEqual({
      kind: TIME_INPUT.value,
      value: "13:30",
    });
    assert(
      parseTimeInput("9", {
        locale: "en-US",
        reference: parseLocalTime("13:00"),
      })
    ).toStrictEqual({
      kind: TIME_INPUT.value,
      value: "21:00",
    });
    assert(
      parseTimeInput("9", {
        locale: "en-US",
        reference: parseLocalTime("09:00"),
      })
    ).toStrictEqual({
      kind: TIME_INPUT.value,
      value: "09:00",
    });
    assert(parseTimeInput("24:00", { locale: "en-US" })).toStrictEqual({
      kind: TIME_INPUT.invalid,
    });
    assert(parseTimeInput("9:60", { locale: "en-US" })).toStrictEqual({
      kind: TIME_INPUT.invalid,
    });
    assert(parseTimeInput("not a time", { locale: "en-US" })).toStrictEqual({
      kind: TIME_INPUT.invalid,
    });
  });
});
