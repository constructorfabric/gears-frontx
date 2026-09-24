import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect as assert, it, vi } from "vitest";

import { timedEvent, UTC } from "../../../__test-utils__/fixtures";
import { calendarDate, parseLocalTime } from "../../../core/model";
import { englishTranslate as t } from "../../../i18n/english";
import { WeekGrid } from "../week-grid";
import type { WeekGridProps } from "../week-grid";

const DATE = calendarDate("2026-08-24");

const timeWindow = (start: string, end: string) => ({
  end: parseLocalTime(end),
  start: parseLocalTime(start),
});

const renderWeek = (overrides: Partial<WeekGridProps> = {}): void => {
  render(
    <WeekGrid
      date={DATE}
      events={[]}
      timeZone={UTC}
      locale="en-US"
      t={t}
      direction="ltr"
      {...overrides}
    />
  );
};

const timedRows = (): readonly HTMLElement[] =>
  within(screen.getByRole("grid")).getAllByRole("row").slice(2);

const gutterText = (row: HTMLElement | undefined): string =>
  row === undefined
    ? ""
    : (within(row).getAllByRole("gridcell")[0]?.textContent ?? "");

const dayCell = (row: HTMLElement | undefined): HTMLElement | undefined =>
  row === undefined ? undefined : within(row).getAllByRole("gridcell")[1];

describe("WeekGrid time axis", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders only the visible hours, one row per slot", () => {
    renderWeek({ visibleHours: timeWindow("06:00", "23:00") });

    const rows = timedRows();

    assert(rows).toHaveLength(17);
    assert(gutterText(rows[0])).toBe("06:00");
    assert(gutterText(rows.at(-1))).toBe("22:00");
  });

  it("splits hours into shorter slots and labels only the hour rows", () => {
    renderWeek({ slotMinutes: 30, visibleHours: timeWindow("09:00", "12:00") });

    const rows = timedRows();

    assert(rows).toHaveLength(6);
    assert(rows.map((row) => gutterText(row))).toStrictEqual([
      "09:00",
      "",
      "10:00",
      "",
      "11:00",
      "",
    ]);
  });

  it("drops events outside the visible hours and keeps those inside", () => {
    renderWeek({
      events: [
        timedEvent({
          endTime: "07:00",
          id: "early",
          startTime: "06:00",
          title: "Early standup",
        }),
        timedEvent({
          endTime: "11:00",
          id: "inside",
          startTime: "10:00",
          title: "Lecture",
        }),
      ],
      visibleHours: timeWindow("09:00", "18:00"),
    });

    assert(screen.queryByRole("button", { name: /Early standup/u })).toBeNull();
    assert(screen.getByRole("button", { name: /Lecture/u })).toBeVisible();
  });

  it("hides the now line while the current time is outside the visible hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T20:00:00.000Z"));
    renderWeek({ visibleHours: timeWindow("09:00", "18:00") });

    assert(screen.queryByRole("status", { name: /Current time/u })).toBeNull();
  });

  it("names cells by the host's working hours", () => {
    renderWeek({
      visibleHours: timeWindow("06:00", "08:00"),
      workingHours: timeWindow("07:00", "08:00"),
    });

    const [sixRow, sevenRow] = timedRows();
    assert(dayCell(sixRow)).toHaveAccessibleName(/non-working hour/u);
    assert(dayCell(sevenRow)).toHaveAccessibleName(/\bworking hour/u);
    assert(dayCell(sevenRow)).not.toHaveAccessibleName(/non-working/u);
  });

  it("repeats the hour labels on the trailing edge, hidden from assistive technology", () => {
    renderWeek({
      trailingGutter: true,
      visibleHours: timeWindow("09:00", "11:00"),
    });

    const [nine] = timedRows();

    if (nine === undefined) {
      throw new Error("Expected a 09:00 row");
    }

    assert((nine.textContent ?? "").match(/09:00/gu)).toHaveLength(2);
    assert(within(nine).getAllByRole("gridcell")).toHaveLength(6);
  });

  it("rejects a visible window that does not align to its slots", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    assert(() => {
      renderWeek({
        slotMinutes: 60,
        visibleHours: timeWindow("06:30", "23:00"),
      });
    }).toThrow(RangeError);
  });
});
