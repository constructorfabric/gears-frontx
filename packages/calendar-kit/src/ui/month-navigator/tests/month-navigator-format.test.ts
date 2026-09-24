import { describe, expect as assert, it } from "vitest";

import { calendarDate } from "../../../core/model";
import {
  formatNavigatorDayLabel,
  formatNavigatorDayNumber,
  formatNavigatorWeekday,
} from "../month-navigator-format";

describe(formatNavigatorWeekday, () => {
  it("clips the weekday label to two letters", () => {
    assert(formatNavigatorWeekday(calendarDate("2026-08-24"), "en-US")).toBe(
      "Mo"
    );
  });

  it("follows the supplied locale", () => {
    assert(formatNavigatorWeekday(calendarDate("2026-08-24"), "de-DE")).toBe(
      "Mo"
    );
  });

  it("leaves a short form that is already at most two graphemes intact", () => {
    assert(formatNavigatorWeekday(calendarDate("2026-08-24"), "ja-JP")).toBe(
      "月"
    );
  });
});

describe(formatNavigatorDayNumber, () => {
  it("formats the day of month without zero padding", () => {
    assert(formatNavigatorDayNumber(calendarDate("2026-08-05"), "en-US")).toBe(
      "5"
    );
    assert(formatNavigatorDayNumber(calendarDate("2026-08-24"), "en-US")).toBe(
      "24"
    );
  });
});

describe(formatNavigatorDayLabel, () => {
  it("formats the full date label in the supplied locale", () => {
    assert(formatNavigatorDayLabel(calendarDate("2026-08-24"), "en-US")).toBe(
      "Monday, August 24, 2026"
    );
  });
});
